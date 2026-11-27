import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { NOTATION_SAMPLES } from '../src/samples.js';

const PAST_DEBOUNCE_MS = 400;
const SIMPLE_XML = `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學而時習之</skam:block></skam:body></skam:doc>`;

test.describe('Notation input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders a character with its reading', async ({ page }) => {
    await page.locator('#input-format-notation').check();
    await page.locator('#xml-input').fill('學（まな）びて');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);

    await expect(page.locator('#render-output')).toContainText('學');
    await expect(page.locator('#render-output')).toContainText('まな');
    await expect(page.locator('#error-panel')).toBeEmpty();
    await expect(page.locator('.xml-editor__highlight .token')).toHaveCount(0);
  });

  test('shows an error code and its start position and clears the preview', async ({ page }) => {
    await page.locator('#input-format-notation').check();
    await page.locator('#xml-input').fill('學（まな');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);

    await expect(page.locator('#error-panel')).toContainText('UNCLOSED_SYMBOL');
    await expect(page.locator('#error-panel')).toContainText('行 1, 列 2');
    await expect(page.locator('#render-output')).toBeEmpty();
  });

  test('keeps both drafts when switching before the debounce fires', async ({ page }) => {
    const xml = SIMPLE_XML.replace('之', '之也');
    await page.locator('#xml-input').fill(xml);
    await page.locator('#input-format-notation').check();
    await expect(page.locator('#selection-actions')).toBeHidden();
    await page.locator('#xml-input').fill('習ふ＜レ＞之＋を。');
    await page.locator('#input-format-xml').check();
    await expect(page.locator('#xml-input')).toHaveValue(xml);
    await expect(page.locator('#render-output')).toContainText('也');
    await expect(page).not.toHaveURL(/[?&]input=notation/);

    await page.locator('#input-format-notation').check();
    await expect(page.locator('#xml-input')).toHaveValue('習ふ＜レ＞之＋を。');
    await expect(page).toHaveURL(/[?&]input=notation/);
  });

  test('shows annotations while disabling every GUI edit control', async ({ page }) => {
    await page.locator('#input-format-notation').check();
    await page.locator('#xml-input').fill('學（まな）びて');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await page.locator('#render-output [data-token-id]').first().click();

    await expect(page.locator('#selection-info')).toContainText('1文字選択');
    await expect(page.locator('#selection-kana-input')).toHaveValue('まな');
    const buttons = page.locator('#selection-actions button');
    expect(await buttons.count()).toBeGreaterThan(0);
    for (const button of await buttons.all()) await expect(button).toBeDisabled();
    await expect(page.locator('#upload-btn')).toBeDisabled();
    await expect(page.locator('#download-btn')).toBeDisabled();

    const notation = await page.locator('#xml-input').inputValue();
    await page.evaluate(() => {
      if (!window.currentDocument) throw new Error('Expected a notation document');
      window.updateXmlFromDocument(window.currentDocument);
    });
    await expect(page.locator('#xml-input')).toHaveValue(notation);
  });

  test('loads the third notation sample from the URL', async ({ page }) => {
    await page.goto('/?input=notation&sample=2');
    await expect(page.locator('#input-format-notation')).toBeChecked();
    await expect(page.locator('#xml-input')).toHaveValue(NOTATION_SAMPLES[2]!.text);
    await expect(page.locator('#sample-select')).toHaveValue('2');
    await expect(page.locator('#sample-select option')).toHaveCount(6);
  });

  test('keeps the format switch usable at 375px in the editor tab', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    for (const format of ['xml', 'notation']) {
      await expect(page.locator(`#input-format-${format}`)).toBeVisible();
      await expect(page.locator(`#input-format-${format}`)).toBeInViewport();
    }
    await page.locator('#input-format-notation').check();
    await page.locator('.compact-tab[data-tab="editor"]').click();
    await page.locator('#xml-input').fill('學（まな）びて');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#xml-input')).toHaveValue('學（まな）びて');
    await page.locator('.compact-tab[data-tab="preview"]').click();
    await expect(page.locator('#render-output')).toContainText('まな');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375
    );
  });

  test('ignores Ctrl/Cmd+S in notation', async ({ page }) => {
    let downloads = 0;
    let dialogs = 0;
    page.on('download', () => downloads++);
    page.on('dialog', async (dialog) => {
      dialogs++;
      await dialog.accept('unexpected.xml');
    });
    await page.locator('#input-format-notation').check();
    await page.locator('#xml-input').fill('學（まな）びて');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await page.keyboard.press('Control+s');
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    expect(downloads).toBe(0);
    expect(dialogs).toBe(0);
  });

  test('ignores XML file drops in notation', async ({ page }) => {
    await page.locator('#input-format-notation').check();
    await page.locator('#xml-input').fill('學（まな）びて');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const preview = await page.locator('#render-output').innerHTML();
    const dataTransfer = await page.evaluateHandle((xml) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([xml], 'dropped.xml', { type: 'application/xml' }));
      return transfer;
    }, SIMPLE_XML);
    await page.locator('.xml-pane').dispatchEvent('drop', { dataTransfer });
    await dataTransfer.dispose();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#xml-input')).toHaveValue('學（まな）びて');
    expect(await page.locator('#render-output').innerHTML()).toBe(preview);
  });

  test('keeps a delayed file read in the XML draft after switching to notation', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const originalText = File.prototype.text;
      File.prototype.text = async function () {
        document.documentElement.dataset['fileRead'] = 'pending';
        await new Promise<void>((resolve) => {
          document.addEventListener('release-xml-file', () => resolve(), { once: true });
        });
        const text = await originalText.call(this);
        document.documentElement.dataset['fileRead'] = 'done';
        return text;
      };
    });
    await page.locator('#file-upload').setInputFiles({
      name: 'delayed.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from(SIMPLE_XML),
    });
    await expect(page.locator('html')).toHaveAttribute('data-file-read', 'pending');
    await page.locator('#input-format-notation').check();
    const notation = '習ふ＜レ＞之＋を。';
    await page.locator('#xml-input').fill(notation);
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const preview = await page.locator('#render-output').innerHTML();
    await page.evaluate(() => document.dispatchEvent(new Event('release-xml-file')));
    await expect(page.locator('html')).toHaveAttribute('data-file-read', 'done');
    await expect(page.locator('#xml-input')).toHaveValue(notation);
    expect(await page.locator('#render-output').innerHTML()).toBe(preview);
    await page.locator('#input-format-xml').check();
    await expect(page.locator('#xml-input')).toHaveValue(SIMPLE_XML);
    await expect(page.locator('#sample-select')).toHaveValue('');
  });
});

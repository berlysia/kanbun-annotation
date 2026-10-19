import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * SKAM Playground E2E Tests - Interactive Features
 *
 * Tests for interactive features like token clicking and the selection panel.
 */

const KAERI_BUTTONS = '#selection-kaeri-buttons';
const KAERI_TAG = '<skam:kaeri';

const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>學而</skam:block>
  </skam:body>
</skam:doc>`;

function kaeriButton(page: Page, label: string): Locator {
  return page.locator(`${KAERI_BUTTONS} button.selection-kaeri-btn:text-is("${label}")`);
}

function countKaeriTags(xml: string): number {
  return xml.split(KAERI_TAG).length - 1;
}

/** Settings are folded into a closed details element; open it before touching the controls. */
async function openSettingsPanel(page: Page): Promise<void> {
  await page.locator('details.settings-panel summary').click();
  await expect(page.locator('details.settings-panel')).toHaveAttribute('open', '');
}

test.describe('Interactive Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Load a sample that has tokens for interaction
    await page.selectOption('#sample-select', '0');
    await page.waitForTimeout(400);
  });

  test('clicking on token shows kaeri buttons in the selection panel', async ({ page }) => {
    // Find a token element in the preview
    const tokenElement = page.locator('[data-token-id]').first();

    // Click on the token
    await tokenElement.click();

    // The selection panel lists the kaeri buttons
    await expect(page.locator(KAERI_BUTTONS)).toBeVisible();
    await expect(kaeriButton(page, 'レ')).toBeVisible();
    await expect(kaeriButton(page, '一')).toBeVisible();
    await expect(kaeriButton(page, '二')).toBeVisible();
  });

  test('clicking kaeri button updates XML', async ({ page }) => {
    const xmlInput = page.locator('#xml-input');
    const initialCount = countKaeriTags(await xmlInput.inputValue());

    await page.locator('[data-token-id]').first().click();
    await expect(page.locator(KAERI_BUTTONS)).toBeVisible();

    // Toggle "二" (not "レ"): the first token of sample 0 may already carry a kaeri,
    // and a second toggle of the same kind would remove it instead of adding one.
    await kaeriButton(page, '二').click();

    // The XML gains one kaeri element; the panel stays open for further edits
    await expect
      .poll(async () => countKaeriTags(await xmlInput.inputValue()))
      .toBeGreaterThan(initialCount);
    await expect(page.locator(KAERI_BUTTONS)).toBeVisible();
  });

  test('clicking a blank area of the preview clears the selection', async ({ page }) => {
    await page.locator('[data-token-id]').first().click();

    // Selected before the blank click
    await expect(page.locator('#render-output .skam-selected').first()).toBeVisible();
    await expect(page.locator('#selection-info .selection-count')).toHaveText('1文字選択');
    await expect(page.locator('#selection-actions')).toBeVisible();

    // Click a blank corner of the preview (no token under the pointer)
    await page.locator('#render-output').click({ position: { x: 2, y: 2 } });

    await expect(page.locator('#render-output .skam-selected')).toHaveCount(0);
    await expect(page.locator('#selection-info .selection-empty')).toBeVisible();
    await expect(page.locator('#selection-actions')).toBeHidden();
  });
});

test.describe('Kaeri Mark Operations', () => {
  test('add kaeri mark to token', async ({ page }) => {
    await page.goto('/');
    await page.fill('#xml-input', SIMPLE_XML);
    await page.waitForTimeout(400);

    // Click on first token
    await page.locator('[data-token-id]').first().click();
    await expect(page.locator(KAERI_BUTTONS)).toBeVisible();

    // Select a kaeri mark
    await kaeriButton(page, 'レ').click();

    // XML should now contain a re-ten kaeri (the XML holds the kind, not the glyph)
    const xmlInput = page.locator('#xml-input');
    await expect(xmlInput).toHaveValue(/<skam:kaeri kind="re"\/>/);
  });

  test('re and ichi toggled in turn are merged into one compound kaeri', async ({ page }) => {
    await page.goto('/');
    await page.fill('#xml-input', SIMPLE_XML);
    await page.waitForTimeout(400);

    await page.locator('[data-token-id]').first().click();
    await expect(page.locator(KAERI_BUTTONS)).toBeVisible();

    const xmlInput = page.locator('#xml-input');

    // The UI has no compound button: レ and 一 are toggled separately
    await kaeriButton(page, 'レ').click();
    await expect(xmlInput).toHaveValue(/kind="re"/);

    // The two toggles merge into one compound kind that holds both components
    await kaeriButton(page, '一').click();
    await expect(xmlInput).toHaveValue(/<skam:kaeri kind="ichi-re"\/>/);
    expect(countKaeriTags(await xmlInput.inputValue())).toBe(1);
  });
});

test.describe('CSS Customization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#sample-select', '0');
    await page.waitForTimeout(400);
  });

  test('CSS customize panel opens and closes', async ({ page }) => {
    // Open customize panel
    const customizePanel = page.locator('details.settings-panel');
    await openSettingsPanel(page);

    // Panel should be open
    await expect(customizePanel).toHaveAttribute('open', '');

    // Check controls are visible
    await expect(page.locator('#color-kaeriten')).toBeVisible();
    await expect(page.locator('#font-family')).toBeVisible();
    await expect(page.locator('#glyph-size')).toBeVisible();
  });

  test('font family selector changes preview', async ({ page }) => {
    await openSettingsPanel(page);

    // Change font family
    await page.selectOption('#font-family', 'inherit');

    // Verify the select changed
    await expect(page.locator('#font-family')).toHaveValue('inherit');
  });

  test('glyph size slider updates value display', async ({ page }) => {
    await openSettingsPanel(page);

    // Get initial value
    const initialValue = await page.locator('#glyph-size-value').textContent();
    expect(initialValue).toBe('2em');

    // Change slider value
    await page.locator('#glyph-size').fill('1.2');

    // Trigger input event
    await page.locator('#glyph-size').dispatchEvent('input');

    // Value display should update
    const updatedValue = await page.locator('#glyph-size-value').textContent();
    expect(updatedValue).toBe('1.2em');
  });

  test('reset button restores defaults', async ({ page }) => {
    await openSettingsPanel(page);

    // Change some values
    await page.locator('#glyph-size').fill('1.3');
    await page.locator('#glyph-size').dispatchEvent('input');

    // Click reset
    await page.click('#reset-customize-btn');

    // Values should be restored to defaults
    await expect(page.locator('#glyph-size')).toHaveValue('2');
    await expect(page.locator('#glyph-size-value')).toContainText('2em');
  });
});

test.describe('Resizable Divider', () => {
  test('divider is visible', async ({ page }) => {
    await page.goto('/');

    const divider = page.locator('#divider');
    await expect(divider).toBeVisible();
  });
});

test.describe('Keyboard Shortcuts', () => {
  test('Ctrl+Enter triggers parse', async ({ page }) => {
    await page.goto('/');

    const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>キーボードテスト</skam:block>
  </skam:body>
</skam:doc>`;

    // Fill editor but don't wait for debounce
    await page.fill('#xml-input', validXml);

    // Focus the textarea
    await page.focus('#xml-input');

    // Press Ctrl+Enter
    await page.keyboard.press('Control+Enter');

    // Preview should render immediately
    const preview = page.locator('#render-output');
    await expect(preview).toContainText('キーボードテスト');
  });
});

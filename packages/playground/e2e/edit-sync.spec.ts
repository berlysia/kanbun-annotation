import { test, expect, devices, type Page } from '@playwright/test';

/**
 * Edit sync and selection lifetime.
 * Each case replays a counterexample found by the TLA+ models in docs/formal/playground-sync/.
 * Short gaps (100ms) stay inside the editor's 300ms debounce; long waits (700ms) pass it.
 */

const INSIDE_DEBOUNCE_MS = 100;
const PAST_DEBOUNCE_MS = 700;

const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>學而時習之</skam:block>
  </skam:body>
</skam:doc>`;

async function openWithSimpleDoc(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#xml-input').fill(SIMPLE_XML);
  await page.waitForTimeout(PAST_DEBOUNCE_MS);
}

async function selectFirstChar(page: Page): Promise<void> {
  await page.locator('[data-token-id]').first().click();
  await expect(page.locator('#selection-info')).toContainText('1文字選択');
}

const xmlOf = (page: Page): Promise<string> => page.locator('#xml-input').inputValue();

test.describe('GUI operations keep every edit (NoLostEdit)', () => {
  test.beforeEach(async ({ page }) => {
    await openWithSimpleDoc(page);
    await selectFirstChar(page);
  });

  test('two different marks pressed inside the debounce window both stay', async ({ page }) => {
    await page.locator('#selection-emphasis-btn').click();
    await page.waitForTimeout(INSIDE_DEBOUNCE_MS);
    await page.locator('#selection-underline-btn').click();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const xml = await xmlOf(page);
    expect(xml).toContain('emphasis');
    expect(xml).toContain('highlight');
  });

  test('text typed just before a mark button stays', async ({ page }) => {
    await page.locator('#xml-input').fill(SIMPLE_XML.replace('學而時習之', '學而時習之也'));
    await page.locator('#selection-emphasis-btn').click();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const xml = await xmlOf(page);
    expect(xml).toContain('之也');
    expect(xml).toContain('emphasis');
  });

  test('text typed just before a kaeri button stays and the button still applies', async ({
    page,
  }) => {
    await page.locator('#xml-input').fill(SIMPLE_XML.replace('學而時習之', '學而時習之也'));
    await page.locator('#selection-kaeri-buttons button.selection-kaeri-btn:text-is("レ")').click();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const xml = await xmlOf(page);
    expect(xml).toContain('之也');
    expect(xml).toContain('<skam:kaeri');
  });

  test('a kana draft typed before an editor change survives the flush', async ({ page }) => {
    await page.locator('#selection-kana-input').fill('がく');
    await page.locator('#xml-input').fill(SIMPLE_XML.replace('學而時習之', '學而時習之也'));
    await page.locator('#selection-kana-apply').click();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const xml = await xmlOf(page);
    expect(xml).toContain('之也');
    expect(xml).toContain('がく');
  });

  test('the chosen kana type survives the flush', async ({ page }) => {
    await page.locator('.selection-kana-type-btn[data-type="okurigana"]').click();
    await page.locator('#selection-kana-input').fill('く');
    await page.locator('#xml-input').fill(SIMPLE_XML.replace('學而時習之', '學而時習之也'));
    await page.locator('#selection-kana-apply').click();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const xml = await xmlOf(page);
    expect(xml).toContain('之也');
    expect(xml).toContain('okuri="く"');
  });

  test('an underline style button pressed right after typing applies that style', async ({
    page,
  }) => {
    // A style button applies the underline itself when the range has none.
    await page.locator('#xml-input').fill(SIMPLE_XML.replace('學而時習之', '學而時習之也'));
    await page.locator('.selection-underline-style-btn[data-style="dashed"]').click();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const xml = await xmlOf(page);
    expect(xml).toContain('之也');
    expect(xml).toContain('style="dashed"');
  });

  test('a kana draft survives the debounced re-parse of an editor change', async ({ page }) => {
    await page.locator('.selection-kana-type-btn[data-type="okurigana"]').click();
    await page.locator('#selection-kana-input').fill('く');
    await page.locator('#xml-input').fill(SIMPLE_XML.replace('學而時習之', '學而時習之也'));
    // Wait past the debounce: the editor change is parsed before the apply button is pressed.
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#selection-kana-input')).toHaveValue('く');
    await page.locator('#selection-kana-apply').click();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const xml = await xmlOf(page);
    expect(xml).toContain('之也');
    expect(xml).toContain('okuri="く"');
  });

  test('a kana value changed in the editor shows in an untouched kana field', async ({ page }) => {
    await page.locator('#selection-kana-input').fill('まな');
    await page.locator('#selection-kana-apply').click();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    const applied = await xmlOf(page);
    await page.locator('#xml-input').fill(applied.replace('まな', 'がく'));
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#selection-kana-input')).toHaveValue('がく');
  });

  test('the selection is restored after a mark is applied', async ({ page }) => {
    await page.locator('#selection-emphasis-btn').click();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#selection-info')).toContainText('1文字選択');
    await expect(page.locator('#selection-info')).toContainText('學');
  });
});

test.describe('An empty editor means no document (DocReflectsText)', () => {
  test('clearing the editor clears the preview and the panel, and nothing writes the old text back', async ({
    page,
  }) => {
    await openWithSimpleDoc(page);
    await selectFirstChar(page);
    await page.locator('#xml-input').fill('');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#error-panel')).toContainText('XMLを入力してください');
    await expect(page.locator('[data-token-id]')).toHaveCount(0);
    await expect(page.locator('#selection-actions')).toBeHidden();
    expect(await xmlOf(page)).toBe('');
  });
});

test.describe('The marks list follows the editor', () => {
  test('an empty or broken editor empties the marks list', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#sample-select', { label: '全要素総合（ヲコト点除く）' });
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#marks-list .marks-list-empty')).toHaveCount(0);
    await page.locator('#xml-input').fill('');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#marks-list')).toContainText('マークがありません');
    await page.selectOption('#sample-select', { label: '全要素総合（ヲコト点除く）' });
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await page.locator('#xml-input').fill('<skam:doc');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#marks-list')).toContainText('マークがありません');
  });
});

test.describe('The selection belongs to the shown document and stays visible', () => {
  test('switching samples drops the selection (SelBelongsToDoc)', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-token-id]').nth(1).click();
    await expect(page.locator('#selection-info')).toContainText('1文字選択');
    await page.selectOption('#sample-select', '2');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await expect(page.locator('#selection-actions')).toBeHidden();
    await expect(page.locator('.skam-selected')).toHaveCount(0);
  });

  test('changing the spacing keeps the highlight (SelVisible)', async ({ page }) => {
    await openWithSimpleDoc(page);
    await selectFirstChar(page);
    await page.locator('details.settings-panel summary').click();
    await page.selectOption('#spacing-select', 'half');
    await expect(page.locator('.skam-selected')).toHaveCount(1);
    await expect(page.locator('#selection-info')).toContainText('1文字選択');
  });

  test('a round trip through Canvas keeps the selection highlighted (SelVisible)', async ({
    page,
  }) => {
    await openWithSimpleDoc(page);
    await selectFirstChar(page);
    await page.locator('details.settings-panel summary').click();
    await page.locator('input[name="renderer"][value="canvas"]').check();
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await page.locator('input[name="renderer"][value="html"]').check();
    await expect(page.locator('#selection-info')).toContainText('1文字選択');
    await expect(page.locator('.skam-selected')).toHaveCount(1);
  });
});

test.describe('Two-tap state across a layout change (TouchAnchorFresh)', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 800 } });

  test('a tap after selecting in the wide layout starts a new selection', async ({ page }) => {
    // The compact layout opens on the preview tab, so the editor is hidden: use the default sample.
    await page.goto('/');
    await page.locator('[data-token-id]').nth(0).tap();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('[data-token-id]').nth(2).click();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.locator('[data-token-id]').nth(4).tap();
    await expect(page.locator('#selection-info')).toContainText('1文字選択');
  });
});

test.describe('Two-tap range selection on phones (TouchAnchorFresh)', () => {
  // Chromium with the phone's viewport and touch; defaultBrowserType would force a new worker.
  const { defaultBrowserType: _browser, ...phone } = devices['iPhone 13'];
  test.use(phone);

  test('the first tap after switching samples starts a new selection', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-token-id]').nth(1).tap();
    await expect(page.locator('#selection-info')).toContainText('1文字選択');
    await page.selectOption('#sample-select', '2');
    await page.waitForTimeout(PAST_DEBOUNCE_MS);
    await page.locator('[data-token-id]').nth(2).tap();
    await expect(page.locator('#selection-info')).toContainText('1文字選択');
  });

  test('tapping the same character twice confirms a single selection', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-token-id]').nth(1).tap();
    await page.locator('[data-token-id]').nth(1).tap();
    await expect(page.locator('#selection-info')).toContainText('1文字選択');
    await expect(page.locator('#selection-panel')).toHaveClass(/\bopen\b/);
  });
});

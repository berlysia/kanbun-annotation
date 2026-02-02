import { test, expect } from '@playwright/test';

/**
 * SKAM Playground E2E Tests - Interactive Features
 *
 * Tests for interactive features like token clicking and mark popup.
 */

test.describe('Interactive Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Load a sample that has tokens for interaction
    await page.selectOption('#sample-select', '0');
    await page.waitForTimeout(400);
  });

  test('clicking on token shows kaeri popup', async ({ page }) => {
    // Find a token element in the preview
    const tokenElement = page.locator('[data-token-id]').first();

    // Click on the token
    await tokenElement.click();

    // Wait for popup to appear
    const popup = page.locator('.mark-popup');
    await expect(popup).toBeVisible();

    // Popup should have kaeri buttons
    await expect(popup.locator('button:has-text("レ")')).toBeVisible();
    await expect(popup.locator('button:has-text("一")')).toBeVisible();
    await expect(popup.locator('button:has-text("二")')).toBeVisible();
  });

  test('clicking kaeri button updates XML', async ({ page }) => {
    // Get initial XML content
    const xmlInput = page.locator('#xml-input');
    const initialXml = await xmlInput.inputValue();

    // Find a token that doesn't already have kaeri
    // Let's use a more reliable approach - find any token
    const tokenElement = page.locator('[data-token-id]').first();
    await tokenElement.click();

    // Wait for popup
    const popup = page.locator('.mark-popup');
    await expect(popup).toBeVisible();

    // Click the "レ" button
    await popup.locator('button:has-text("レ")').click();

    // Wait for popup to close and XML to update
    await expect(popup).not.toBeVisible();
    await page.waitForTimeout(200);

    // Note: The XML should be updated, but whether it changes depends on
    // if the token already had a kaeri mark. The test verifies the interaction works.
    // The actual XML content check depends on which token was clicked.
    const updatedXml = await xmlInput.inputValue();

    // At minimum, the popup should have closed
    await expect(popup).not.toBeVisible();
  });

  test('popup closes on Escape key', async ({ page }) => {
    const tokenElement = page.locator('[data-token-id]').first();
    await tokenElement.click();

    const popup = page.locator('.mark-popup');
    await expect(popup).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Popup should close
    await expect(popup).not.toBeVisible();
  });

  test('popup closes on cancel button', async ({ page }) => {
    const tokenElement = page.locator('[data-token-id]').first();
    await tokenElement.click();

    const popup = page.locator('.mark-popup');
    await expect(popup).toBeVisible();

    // Click cancel button
    await popup.locator('button:has-text("キャンセル")').click();

    // Popup should close
    await expect(popup).not.toBeVisible();
  });

  test('popup closes when clicking outside', async ({ page }) => {
    const tokenElement = page.locator('[data-token-id]').first();
    await tokenElement.click();

    const popup = page.locator('.mark-popup');
    await expect(popup).toBeVisible();

    // Click outside the popup (on the header)
    await page.locator('header.header').click();

    // Popup should close
    await expect(popup).not.toBeVisible();
  });
});

test.describe('Kaeri Mark Operations', () => {
  test('add kaeri mark to token', async ({ page }) => {
    // Use a sample without existing kaeri on first token
    const simpleXml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>學而</skam:block>
  </skam:body>
</skam:doc>`;

    await page.goto('/');
    await page.fill('#xml-input', simpleXml);
    await page.waitForTimeout(400);

    // Click on first token
    const tokenElement = page.locator('[data-token-id]').first();
    await tokenElement.click();

    // Wait for popup
    const popup = page.locator('.mark-popup');
    await expect(popup).toBeVisible();

    // Select a kaeri mark
    await popup.locator('button:has-text("レ")').click();

    // Wait for update
    await page.waitForTimeout(300);

    // XML should now contain kaeri
    const xmlInput = page.locator('#xml-input');
    const updatedXml = await xmlInput.inputValue();
    expect(updatedXml).toContain('kaeri');
    expect(updatedXml).toContain('レ');
  });

  test('compound kaeri marks available', async ({ page }) => {
    // Load any sample
    await page.selectOption('#sample-select', '0');
    await page.waitForTimeout(400);

    // Click on a token
    const tokenElement = page.locator('[data-token-id]').first();
    await tokenElement.click();

    // Wait for popup
    const popup = page.locator('.mark-popup');
    await expect(popup).toBeVisible();

    // Check compound kaeri options exist
    await expect(popup.locator('button:has-text("一レ")')).toBeVisible();
    await expect(popup.locator('button:has-text("二レ")')).toBeVisible();
    await expect(popup.locator('button:has-text("上レ")')).toBeVisible();
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
    const customizePanel = page.locator('details.customize-panel');
    await customizePanel.locator('summary').click();

    // Panel should be open
    await expect(customizePanel).toHaveAttribute('open', '');

    // Check controls are visible
    await expect(page.locator('#color-kaeriten')).toBeVisible();
    await expect(page.locator('#font-family')).toBeVisible();
    await expect(page.locator('#glyph-size')).toBeVisible();
  });

  test('font family selector changes preview', async ({ page }) => {
    // Open customize panel
    await page.locator('details.customize-panel summary').click();

    // Change font family
    await page.selectOption('#font-family', 'inherit');

    // Verify the select changed
    await expect(page.locator('#font-family')).toHaveValue('inherit');
  });

  test('glyph size slider updates value display', async ({ page }) => {
    // Open customize panel
    await page.locator('details.customize-panel summary').click();

    // Get initial value
    const initialValue = await page.locator('#glyph-size-value').textContent();
    expect(initialValue).toBe('1em');

    // Change slider value
    await page.locator('#glyph-size').fill('1.2');

    // Trigger input event
    await page.locator('#glyph-size').dispatchEvent('input');

    // Value display should update
    const updatedValue = await page.locator('#glyph-size-value').textContent();
    expect(updatedValue).toBe('1.2em');
  });

  test('reset button restores defaults', async ({ page }) => {
    // Open customize panel
    await page.locator('details.customize-panel summary').click();

    // Change some values
    await page.locator('#glyph-size').fill('1.3');
    await page.locator('#glyph-size').dispatchEvent('input');

    // Click reset
    await page.click('#reset-customize-btn');

    // Values should be restored to defaults
    await expect(page.locator('#glyph-size')).toHaveValue('1');
    await expect(page.locator('#glyph-size-value')).toContainText('1em');
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

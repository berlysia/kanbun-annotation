import { test, expect } from '@playwright/test';

/**
 * SKAM Playground E2E Tests - Basic Flow
 *
 * Tests for the basic user flows of the SKAM Playground application.
 */

test.describe('Basic Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads and displays title', async ({ page }) => {
    await expect(page).toHaveTitle('SKAM Playground - 漢文アノテーション');
    await expect(page.locator('h1')).toContainText('SKAM Playground');
  });

  test('sample selector populates editor and renders preview', async ({ page }) => {
    // Select the first sample
    await page.selectOption('#sample-select', '0');

    // Wait for debounce and rendering
    await page.waitForTimeout(400);

    // Check XML editor contains the sample content
    const xmlInput = page.locator('#xml-input');
    await expect(xmlInput).toContainText('skam:doc');
    await expect(xmlInput).toContainText('學');

    // Check preview renders
    const preview = page.locator('#render-output');
    await expect(preview).not.toBeEmpty();

    // Check JSON output is populated
    await page.click('text=SKAM JSON を表示');
    const jsonOutput = page.locator('#json-output');
    await expect(jsonOutput).toContainText('"tokens"');
  });

  test('XML input updates preview', async ({ page }) => {
    const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>テスト文字</skam:block>
  </skam:body>
</skam:doc>`;

    // Fill the XML input
    await page.fill('#xml-input', testXml);

    // Wait for debounce
    await page.waitForTimeout(400);

    // Check preview contains the text
    const preview = page.locator('#render-output');
    await expect(preview).toContainText('テスト文字');
  });

  test('invalid XML shows error', async ({ page }) => {
    // Fill with invalid XML
    await page.fill('#xml-input', '<invalid>');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Check error panel is visible
    const errorPanel = page.locator('#error-panel');
    await expect(errorPanel).toBeVisible();
    await expect(errorPanel).not.toBeEmpty();
  });

  test('valid XML after invalid clears error', async ({ page }) => {
    // First, input invalid XML
    await page.fill('#xml-input', '<invalid>');
    await page.waitForTimeout(400);

    const errorPanel = page.locator('#error-panel');
    await expect(errorPanel).not.toBeEmpty();

    // Then input valid XML
    const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>有効なXML</skam:block>
  </skam:body>
</skam:doc>`;
    await page.fill('#xml-input', validXml);
    await page.waitForTimeout(400);

    // Error panel should be empty (cleared)
    await expect(errorPanel).toBeEmpty();
  });
});

test.describe('Render Options', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Load a sample for testing
    await page.selectOption('#sample-select', '0');
    await page.waitForTimeout(400);
  });

  test('writing mode toggle works', async ({ page }) => {
    const preview = page.locator('#render-output');

    // Default is vertical
    const verticalRadio = page.locator('input[name="writing-mode"][value="vertical"]');
    await expect(verticalRadio).toBeChecked();

    // Switch to horizontal
    await page.click('input[name="writing-mode"][value="horizontal"]');

    // Verify horizontal is now checked
    const horizontalRadio = page.locator('input[name="writing-mode"][value="horizontal"]');
    await expect(horizontalRadio).toBeChecked();

    // Preview should still have content
    await expect(preview).not.toBeEmpty();
  });

  test('profile selector changes rendering', async ({ page }) => {
    const profileSelect = page.locator('#profile-select');

    // Default is 'full'
    await expect(profileSelect).toHaveValue('full');

    // Change to learningBasic
    await page.selectOption('#profile-select', 'learningBasic');
    await expect(profileSelect).toHaveValue('learningBasic');

    // Preview should still render
    const preview = page.locator('#render-output');
    await expect(preview).not.toBeEmpty();
  });

  test('inline mode toggle works', async ({ page }) => {
    const inlineCheckbox = page.locator('#inline-mode');

    // Default is unchecked
    await expect(inlineCheckbox).not.toBeChecked();

    // Enable inline mode
    await page.click('#inline-mode');
    await expect(inlineCheckbox).toBeChecked();

    // Preview should show inline demo text
    const preview = page.locator('#render-output');
    await expect(preview).toContainText('本文中に');
    await expect(preview).toContainText('のように漢文を埋め込める');
  });
});

test.describe('URL State Persistence', () => {
  test('sample selection updates URL', async ({ page }) => {
    await page.goto('/');

    // Select a non-default sample
    await page.selectOption('#sample-select', '1');
    await page.waitForTimeout(400);

    // Check URL contains sample parameter
    await expect(page).toHaveURL(/sample=1/);
  });

  test('URL parameters restore state on load', async ({ page }) => {
    // Navigate with specific parameters
    await page.goto('/?sample=2&mode=horizontal&inline=1');

    // Check state is restored
    await expect(page.locator('#sample-select')).toHaveValue('2');
    await expect(page.locator('input[name="writing-mode"][value="horizontal"]')).toBeChecked();
    await expect(page.locator('#inline-mode')).toBeChecked();
  });
});

test.describe('Copy Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#sample-select', '0');
    await page.waitForTimeout(400);
  });

  test('JSON copy button exists and is clickable', async ({ page }) => {
    // Open JSON panel
    await page.click('text=SKAM JSON を表示');

    const copyJsonBtn = page.locator('#copy-json-btn');
    await expect(copyJsonBtn).toBeVisible();

    // Click should not throw error (clipboard access may be denied in test env)
    await copyJsonBtn.click();
  });

  test('HTML copy button exists and is clickable', async ({ page }) => {
    // Open HTML panel
    await page.click('text=生成HTML を表示');

    const copyHtmlBtn = page.locator('#copy-html-btn');
    await expect(copyHtmlBtn).toBeVisible();

    // Click should not throw error
    await copyHtmlBtn.click();
  });
});

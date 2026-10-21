import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

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
    await expect(xmlInput).toHaveValue(/skam:doc/);
    await expect(xmlInput).toHaveValue(/學/);

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
    await page.locator('#settings-panel summary').click();
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

test.describe('Explicit line break', () => {
  test('the line-break sample renders <br> without errors', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#sample-select', { label: '改行（句の途中で行を改める）' });
    await page.waitForTimeout(400);

    await expect(page.locator('#xml-input')).toHaveValue(/<skam:br\/>/);
    await expect(page.locator('#error-panel')).toBeEmpty();
    await expect(page.locator('#render-output br.skam-linebreak')).toHaveCount(1);
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

/**
 * Error positions reported by the browser build of `parse`.
 *
 * The expected element positions are the ones the Node build reports for the same input
 * (start tag `<`, 1-based, UTF-16 units). The syntax error position is whatever Chromium reports.
 */
test.describe('Error positions in the browser', () => {
  const ERROR_LOCATION = '#error-panel .error-location';

  // Several elements precede the faulty one so that the element-to-start-tag mapping is exercised.
  // Node `parse` reports line 4, column 21 for the missing `value` attribute.
  const MISSING_ATTRIBUTE_XML = `<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>學而<skam:kaeri kind="re"/>時習之</skam:block>
    <skam:block>不亦說乎<skam:kutoten kind="ku"/></skam:block>
  </skam:body>
</skam:doc>`;

  // Node `parse` reports a validation error at line 5, column 7 (marks[0], the okototen element).
  const VALIDATION_ERROR_XML = `<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>學而時習之</skam:block>
    <skam:block>
      <skam:okototen grid="5x5" x="9" y="0" shape="dot">甲</skam:okototen>
    </skam:block>
  </skam:body>
</skam:doc>`;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('syntax error shows the line and column reported by Chromium', async ({ page }) => {
    await page.fill(
      '#xml-input',
      `<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body></skam:block>
</skam:doc>`
    );
    await page.waitForTimeout(400);

    // Measured in Chromium 145: the column just after the mismatched end tag (the line is 26 characters)
    await expect(page.locator(ERROR_LOCATION)).toHaveText('行 2, 列 27:');
  });

  test('error while processing an element shows the position Node reports', async ({ page }) => {
    await page.fill('#xml-input', MISSING_ATTRIBUTE_XML);
    await page.waitForTimeout(400);

    await expect(page.locator(ERROR_LOCATION)).toHaveText('行 4, 列 21:');
  });

  test('validation errors carry the position Node reports', async ({ page }) => {
    // The playground shows only the message of a validation error, so run the same browser build
    // of the parser inside the page and read `errors[]` directly.
    const { build } = await import('vite');
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      resolve: { conditions: ['browser'] },
      build: {
        write: false,
        minify: false,
        lib: {
          entry: fileURLToPath(
            new URL('../../skam-xml-parser/dist/index.browser.js', import.meta.url)
          ),
          formats: ['iife'],
          name: 'SKAMXMLParser',
        },
      },
    });
    const outputs = Array.isArray(result)
      ? result.flatMap((r) => ('output' in r ? r.output : []))
      : [];
    const chunk = outputs.find((o) => o.type === 'chunk');
    if (chunk?.type !== 'chunk') throw new Error('browser parser bundle was not produced');

    await page.addScriptTag({ content: chunk.code });
    const errors = await page.evaluate((xml) => {
      const parser = (
        globalThis as unknown as {
          SKAMXMLParser: { parse(xml: string): unknown };
        }
      ).SKAMXMLParser;
      try {
        parser.parse(xml);
      } catch (e) {
        return (
          (e as { errors?: { path: string; line?: number; column?: number }[] }).errors ?? null
        );
      }
      return null;
    }, VALIDATION_ERROR_XML);

    expect(errors).toHaveLength(1);
    expect(errors?.[0]).toMatchObject({ path: 'marks[0].position.x', line: 5, column: 7 });
  });
});

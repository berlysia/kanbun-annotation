import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * SKAM Playground E2E Tests - File Operations
 *
 * Tests for file upload and download functionality.
 */

test.describe('File Operations', () => {
  const testXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>ファイルテスト</skam:block>
  </skam:body>
</skam:doc>`;

  test('file upload populates editor', async ({ page }) => {
    await page.goto('/');

    // Create a temporary test file
    const tmpDir = os.tmpdir();
    const testFilePath = path.join(tmpDir, 'test-upload.skam.xml');
    fs.writeFileSync(testFilePath, testXmlContent);

    try {
      // Use file chooser API
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('#upload-btn');
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(testFilePath);

      // Wait for processing
      await page.waitForTimeout(500);

      // Verify content is loaded
      const xmlInput = page.locator('#xml-input');
      await expect(xmlInput).toContainText('ファイルテスト');

      // Verify preview renders
      const preview = page.locator('#render-output');
      await expect(preview).toContainText('ファイルテスト');
    } finally {
      // Cleanup
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  test('download button triggers file download', async ({ page }) => {
    await page.goto('/');

    // Load a sample first
    await page.selectOption('#sample-select', '0');
    await page.waitForTimeout(400);

    // Setup download listener
    const downloadPromise = page.waitForEvent('download');

    // Mock the prompt to auto-confirm filename
    await page.evaluate(() => {
      window.prompt = () => 'test-download.skam.xml';
    });

    // Click download button
    await page.click('#download-btn');

    // Wait for download
    const download = await downloadPromise;

    // Verify download started
    expect(download.suggestedFilename()).toBe('test-download.skam.xml');

    // Save to temp and verify content
    const tmpDir = os.tmpdir();
    const downloadPath = path.join(tmpDir, download.suggestedFilename());
    await download.saveAs(downloadPath);

    try {
      const content = fs.readFileSync(downloadPath, 'utf-8');
      expect(content).toContain('skam:doc');
      expect(content).toContain('學');
    } finally {
      // Cleanup
      if (fs.existsSync(downloadPath)) {
        fs.unlinkSync(downloadPath);
      }
    }
  });

  test('download with empty editor shows alert', async ({ page }) => {
    await page.goto('/');

    // Clear the editor
    await page.fill('#xml-input', '');
    await page.waitForTimeout(100);

    // Setup dialog listener
    const dialogPromise = page.waitForEvent('dialog');

    // Click download button
    await page.click('#download-btn');

    // Handle alert
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('alert');
    expect(dialog.message()).toContain('保存するXMLがありません');
    await dialog.dismiss();
  });

  test('Ctrl+S triggers download', async ({ page }) => {
    await page.goto('/');

    // Load a sample first
    await page.selectOption('#sample-select', '0');
    await page.waitForTimeout(400);

    // Setup download listener
    const downloadPromise = page.waitForEvent('download');

    // Mock the prompt
    await page.evaluate(() => {
      window.prompt = () => 'keyboard-download.xml';
    });

    // Press Ctrl+S
    await page.keyboard.press('Control+s');

    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('keyboard-download.xml');
  });
});

test.describe('Drag and Drop', () => {
  test('drag and drop XML file loads content', async ({ page }) => {
    await page.goto('/');

    const testXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>ドラッグドロップテスト</skam:block>
  </skam:body>
</skam:doc>`;

    // Create a DataTransfer with file
    const dataTransfer = await page.evaluateHandle((content) => {
      const dt = new DataTransfer();
      const file = new File([content], 'test.xml', { type: 'application/xml' });
      dt.items.add(file);
      return dt;
    }, testXmlContent);

    // Dispatch drag and drop events on xml-pane
    const xmlPane = page.locator('.xml-pane');
    await xmlPane.dispatchEvent('dragover', { dataTransfer });
    await xmlPane.dispatchEvent('drop', { dataTransfer });

    // Wait for processing
    await page.waitForTimeout(500);

    // Verify content is loaded
    const xmlInput = page.locator('#xml-input');
    await expect(xmlInput).toContainText('ドラッグドロップテスト');

    // Verify preview renders
    const preview = page.locator('#render-output');
    await expect(preview).toContainText('ドラッグドロップテスト');
  });
});

import { test, expect } from '@playwright/test';

/**
 * SKAM Playground E2E Tests - Web Component Demo
 *
 * <skam-renderer> カスタムエレメントのデモページが正常に動作するか検証する。
 * WebComponent の登録漏れ（tree-shaking による除去等）を検知する。
 */

test.describe('Web Component Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/web-component.html');
  });

  test('page loads and displays title', async ({ page }) => {
    await expect(page).toHaveTitle('SKAM Web Component Demo');
  });

  test('basic declarative usage renders kanbun content', async ({ page }) => {
    const renderer = page.locator('#basic-renderer');
    // Shadow DOM 内にレンダリングされたコンテンツを確認
    await expect(renderer).toBeAttached();

    // WebComponent が登録され、漢文が描画されていることを確認
    // Shadow DOM 内の .skam-document が存在する = レンダリング成功
    const document = renderer.locator('.skam-document');
    await expect(document).toBeAttached({ timeout: 5000 });
  });

  test('writing mode toggle changes rendering', async ({ page }) => {
    const renderer = page.locator('#wm-renderer');
    const document = renderer.locator('.skam-document');
    await expect(document).toBeAttached({ timeout: 5000 });

    // 横書きに切り替え
    await page.locator('input[name="wm-demo"][value="horizontal"]').check();
    // writing-mode 属性が変更されることを確認
    await expect(renderer).toHaveAttribute('writing-mode', 'horizontal');
  });

  test('profile switching works', async ({ page }) => {
    const renderer = page.locator('#profile-renderer');
    const document = renderer.locator('.skam-document');
    await expect(document).toBeAttached({ timeout: 5000 });

    // learningBasic プロファイルに切り替え
    await page.selectOption('#profile-demo-select', 'learningBasic');
    await expect(renderer).toHaveAttribute('profile', 'learningBasic');
  });

  test('programmatic xmlContent setting works', async ({ page }) => {
    const renderer = page.locator('#interactive-renderer');

    // 適用ボタンをクリック
    await page.click('#apply-xml-btn');

    // レンダリング成功イベントがログに表示される
    const eventLog = page.locator('#event-log');
    await expect(eventLog).toContainText('skam-render', { timeout: 5000 });
  });

  test('error handling displays error for invalid XML', async ({ page }) => {
    // エラーデモのレンダラーがエラーを表示する
    const errorLog = page.locator('#error-log');
    await expect(errorLog).toContainText('skam-error', { timeout: 5000 });
  });
});

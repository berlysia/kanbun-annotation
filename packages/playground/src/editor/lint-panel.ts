/**
 * Lint Panel Component
 *
 * lintSKAMDocument の診断を一覧で表示する。パース誤り (ErrorPanel) とは別のパネルで、
 * プレビューを消さない。コンテナは DOM に常に置き、中身だけを入れ替える
 * (live region は、あとから DOM に足されたものの中身を読み上げないことがあるため)。
 */

import { lintSKAMDocument, type LintDiagnostic } from '@kanbun-skam/skam';

/** 1 回に一覧へ出す診断の上限 (読み上げと DOM が重くならないように) */
export const LINT_PANEL_LIMIT = 100;

export class LintPanel {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    container.classList.add('lint-panel');
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    container.setAttribute('aria-label', '診断');
  }

  setDiagnostics(diagnostics: readonly LintDiagnostic[]): void {
    this.clear();
    if (diagnostics.length === 0) return;

    // 文字は textContent だけで入れる。属性には入力由来の値を入れない
    const heading = document.createElement('p');
    heading.className = 'lint-heading';
    heading.textContent = `診断 ${diagnostics.length} 件`;

    const list = document.createElement('ul');
    list.className = 'lint-list';
    for (const diagnostic of diagnostics.slice(0, LINT_PANEL_LIMIT)) {
      const item = document.createElement('li');
      item.className = 'lint-item';

      const code = document.createElement('span');
      code.className = 'lint-code';
      code.textContent = diagnostic.code;

      const message = document.createElement('span');
      message.className = 'lint-message';
      message.textContent = diagnostic.message;

      const path = document.createElement('span');
      path.className = 'lint-path';
      path.textContent = diagnostic.path;

      item.append(code, message, path);
      list.appendChild(item);
    }

    this.container.append(heading, list);

    const rest = diagnostics.length - LINT_PANEL_LIMIT;
    if (rest > 0) {
      const more = document.createElement('p');
      more.className = 'lint-more';
      more.textContent = `ほか ${rest} 件`;
      this.container.appendChild(more);
    }
  }

  clear(): void {
    this.container.replaceChildren();
  }
}

/**
 * 文書を lint してパネルに出す。lintSKAMDocument は例外を出さない契約だが、
 * 出たとしてもパネルを空にするだけで、呼び出し側のプレビューと誤りのパネルに触れない。
 */
export function updateLintPanel(
  panel: LintPanel,
  doc: unknown,
  lint: (doc: unknown) => LintDiagnostic[] = lintSKAMDocument
): void {
  try {
    panel.setDiagnostics(lint(doc));
  } catch {
    panel.clear();
  }
}

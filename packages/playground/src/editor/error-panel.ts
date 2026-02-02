/**
 * Error Panel Component
 *
 * パーサーエラーを行番号+メッセージで表示し、クリックで該当行にジャンプするパネル
 */

/**
 * パースエラーの型定義
 */
export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

/**
 * エラークリック時のコールバック型
 */
export type ErrorClickCallback = (line: number, column?: number) => void;

/**
 * エラーパネルクラス
 */
export class ErrorPanel {
  private container: HTMLElement;
  private errorClickCallback: ErrorClickCallback | null = null;
  private errors: ParseError[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupStyles();
  }

  /**
   * エラーパネル用のスタイルをセットアップ
   */
  private setupStyles(): void {
    this.container.classList.add('error-panel');
  }

  /**
   * エラーを設定して表示
   */
  setErrors(errors: ParseError[]): void {
    this.errors = errors;
    this.render();

    if (errors.length > 0) {
      this.show();
    } else {
      this.hide();
    }
  }

  /**
   * エラーをクリア
   */
  clear(): void {
    this.errors = [];
    this.container.innerHTML = '';
    this.hide();
  }

  /**
   * エラークリック時のコールバックを設定
   */
  onErrorClick(callback: ErrorClickCallback): void {
    this.errorClickCallback = callback;
  }

  /**
   * パネルを表示
   */
  show(): void {
    this.container.classList.add('visible');
  }

  /**
   * パネルを非表示
   */
  hide(): void {
    this.container.classList.remove('visible');
  }

  /**
   * エラー一覧をレンダリング
   */
  private render(): void {
    this.container.innerHTML = '';

    for (const error of this.errors) {
      const item = this.createErrorItem(error);
      this.container.appendChild(item);
    }
  }

  /**
   * エラーアイテム要素を作成
   */
  private createErrorItem(error: ParseError): HTMLElement {
    const item = document.createElement('div');
    item.className = 'error-item';

    if (error.line !== undefined) {
      item.dataset['line'] = String(error.line);
    }
    if (error.column !== undefined) {
      item.dataset['column'] = String(error.column);
    }

    // アイコン
    const icon = document.createElement('span');
    icon.className = 'error-icon';
    icon.textContent = '\u26A0'; // ⚠ warning sign
    item.appendChild(icon);

    // 位置情報
    if (error.line !== undefined) {
      const location = document.createElement('span');
      location.className = 'error-location';
      if (error.column !== undefined) {
        location.textContent = `行 ${error.line}, 列 ${error.column}:`;
      } else {
        location.textContent = `行 ${error.line}:`;
      }
      item.appendChild(location);
    }

    // メッセージ
    const message = document.createElement('span');
    message.className = 'error-message';
    message.textContent = error.message;
    item.appendChild(message);

    // クリックイベント（行番号がある場合のみ）
    if (error.line !== undefined && this.errorClickCallback) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        if (this.errorClickCallback && error.line !== undefined) {
          this.errorClickCallback(error.line, error.column);
        }
      });
    }

    return item;
  }
}

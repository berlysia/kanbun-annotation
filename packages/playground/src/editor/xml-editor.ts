/**
 * XML Editor with Prism.js syntax highlighting
 *
 * Implementation pattern: textarea + pre/code overlay
 * - textarea: receives actual input (transparent background)
 * - pre > code: display with Prism.js highlighting
 * - Both are stacked and scroll-synced
 */

import Prism from 'prismjs';
import 'prismjs/components/prism-markup';

export interface XmlEditorOptions {
  /** Debounce delay for content change callback (default: 300ms) */
  debounceMs?: number;
  /** Show line numbers (default: true) */
  showLineNumbers?: boolean;
}

export class XmlEditor {
  private container: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private pre: HTMLPreElement;
  private code: HTMLElement;
  private lineNumbers: HTMLElement | null = null;

  private debounceMs: number;
  private showLineNumbers: boolean;
  private debounceTimer: number | null = null;
  private changeCallbacks: Array<(xml: string) => void> = [];

  constructor(container: HTMLElement, options?: XmlEditorOptions) {
    this.container = container;
    this.debounceMs = options?.debounceMs ?? 300;
    this.showLineNumbers = options?.showLineNumbers ?? true;

    // Find existing textarea or create new one
    const existingTextarea = container.querySelector('textarea');
    if (existingTextarea) {
      this.textarea = existingTextarea;
    } else {
      this.textarea = document.createElement('textarea');
      this.textarea.placeholder = 'SKAM-ML/XMLを入力...';
    }

    // Create highlight elements
    this.pre = document.createElement('pre');
    this.pre.className = 'xml-editor__highlight';
    this.pre.setAttribute('aria-hidden', 'true');

    this.code = document.createElement('code');
    this.code.className = 'language-markup';
    this.pre.appendChild(this.code);

    // Setup DOM structure
    this.setupDOM();
    this.setupEventListeners();

    // Initial highlight
    this.highlight();
  }

  private setupDOM(): void {
    // Add editor class to container
    this.container.classList.add('xml-editor');

    // Setup textarea
    this.textarea.className = 'xml-editor__textarea';
    this.textarea.spellcheck = false;
    this.textarea.autocomplete = 'off';
    this.textarea.autocapitalize = 'off';

    // Create wrapper for textarea and highlight overlay
    const editorArea = document.createElement('div');
    editorArea.className = 'xml-editor__area';

    // Setup line numbers if enabled
    if (this.showLineNumbers) {
      this.lineNumbers = document.createElement('div');
      this.lineNumbers.className = 'xml-editor__line-numbers';
      this.lineNumbers.setAttribute('aria-hidden', 'true');
      editorArea.appendChild(this.lineNumbers);
    }

    // Create content wrapper for textarea and highlight
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'xml-editor__content';

    // Move textarea if it was existing in container
    if (this.textarea.parentElement === this.container) {
      this.container.removeChild(this.textarea);
    }

    contentWrapper.appendChild(this.pre);
    contentWrapper.appendChild(this.textarea);
    editorArea.appendChild(contentWrapper);

    // Clear container and add editor area
    this.container.innerHTML = '';
    this.container.appendChild(editorArea);
  }

  private setupEventListeners(): void {
    // Sync scroll between textarea and pre
    this.textarea.addEventListener('scroll', () => {
      this.pre.scrollTop = this.textarea.scrollTop;
      this.pre.scrollLeft = this.textarea.scrollLeft;
      if (this.lineNumbers) {
        this.lineNumbers.scrollTop = this.textarea.scrollTop;
      }
    });

    // Update highlight on input
    this.textarea.addEventListener('input', () => {
      this.highlight();
      this.notifyChange();
    });

    // Handle tab key for indentation
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const value = this.textarea.value;

        // Insert tab at cursor position
        this.textarea.value = value.substring(0, start) + '  ' + value.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;

        this.highlight();
        this.notifyChange();
      }
    });
  }

  private highlight(): void {
    const value = this.textarea.value;

    // Prism requires escaping for safety, but we use textContent first
    // then apply Prism highlighting
    const escapedValue = this.escapeHtml(value);

    // Apply Prism highlighting
    const highlighted = Prism.highlight(value, Prism.languages['markup']!, 'markup');
    this.code.innerHTML = highlighted || escapedValue;

    // Ensure the pre element ends with newline for proper height matching
    // This is needed when the last line has content but no trailing newline
    if (!value.endsWith('\n')) {
      this.code.innerHTML += '\n';
    }

    // Update line numbers
    this.updateLineNumbers();
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private updateLineNumbers(): void {
    if (!this.lineNumbers) return;

    const lineCount = this.getLineCount();
    const numbers: string[] = [];

    for (let i = 1; i <= lineCount; i++) {
      numbers.push(`<span>${i}</span>`);
    }

    this.lineNumbers.innerHTML = numbers.join('');
  }

  private notifyChange(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      const value = this.textarea.value;
      for (const callback of this.changeCallbacks) {
        callback(value);
      }
    }, this.debounceMs);
  }

  /**
   * Get current XML content
   */
  getValue(): string {
    return this.textarea.value;
  }

  /**
   * Set XML content
   */
  setValue(xml: string): void {
    this.textarea.value = xml;
    this.highlight();
  }

  /**
   * Register callback for content changes (debounced)
   */
  onContentChange(callback: (xml: string) => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Scroll to a specific line number (1-indexed)
   */
  scrollToLine(line: number): void {
    if (line < 1) return;

    const lines = this.textarea.value.split('\n');
    if (line > lines.length) return;

    // Calculate position
    let position = 0;
    for (let i = 0; i < line - 1; i++) {
      const lineContent = lines[i];
      if (lineContent !== undefined) {
        position += lineContent.length + 1; // +1 for newline
      }
    }

    // Set cursor position
    this.textarea.selectionStart = position;
    this.textarea.selectionEnd = position;

    // Scroll to cursor
    // Use a small delay to ensure DOM is updated
    requestAnimationFrame(() => {
      this.textarea.focus();

      // Calculate approximate scroll position
      const lineHeight = parseFloat(getComputedStyle(this.textarea).lineHeight) || 20;
      const scrollTop = (line - 1) * lineHeight;
      this.textarea.scrollTop = scrollTop;
    });
  }

  /**
   * Focus the editor
   */
  focus(): void {
    this.textarea.focus();
  }

  /**
   * Get total line count
   */
  getLineCount(): number {
    const value = this.textarea.value;
    if (value === '') return 1;

    // Count newlines + 1 (or just count if ends with newline)
    const newlines = (value.match(/\n/g) || []).length;
    return value.endsWith('\n') ? newlines + 1 : newlines + 1;
  }

  /**
   * Get the underlying textarea element (for external event binding)
   */
  getTextareaElement(): HTMLTextAreaElement {
    return this.textarea;
  }
}

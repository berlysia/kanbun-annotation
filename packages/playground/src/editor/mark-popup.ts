/**
 * Mark Popup for adding/editing marks (okurigana, yomigana, soegana, kaeri)
 *
 * Provides a floating popup UI that appears when text is selected,
 * allowing users to add or edit various annotations.
 */

import type { Mark, KaeriMark } from '@kanbun/skam';

/** Kana mark types supported by this popup */
export type KanaMarkType = 'okurigana' | 'yomigana' | 'soegana';

/** Callback type for kana selection events */
export type KanaSelectCallback = (
  fromTokenId: string,
  toTokenId: string,
  type: KanaMarkType | null, // null means delete
  value: string
) => void;

/** Callback type for kaeri selection events */
export type KaeriSelectCallback = (
  tokenId: string,
  kind: string | null // null means delete
) => void;

/** Labels for kana mark types */
const KANA_TYPE_LABELS: Record<KanaMarkType, string> = {
  okurigana: '送り仮名',
  yomigana: '読み仮名',
  soegana: '添え仮名',
};

// ============================================================================
// Kaeri (返り点) Configuration
// ============================================================================

/**
 * 返り点の種類定義
 */
interface KaeriKind {
  /** 内部識別子（コールバックで使用） */
  kind: string;
  /** 表示ラベル（ボタンに表示） */
  label: string;
  /** SKAM の kaeri.value に設定する値 */
  value: string;
}

/**
 * 単独返り点の定義
 */
const KAERI_SINGLE_GROUPS: KaeriKind[][] = [
  [
    { kind: 're', label: 'レ', value: 'レ' },
    { kind: 'ichi', label: '一', value: '一' },
    { kind: 'ni', label: '二', value: '二' },
    { kind: 'san', label: '三', value: '三' },
    { kind: 'shi', label: '四', value: '四' },
  ],
  [
    { kind: 'jo', label: '上', value: '上' },
    { kind: 'chu', label: '中', value: '中' },
    { kind: 'ge', label: '下', value: '下' },
  ],
  [
    { kind: 'ko', label: '甲', value: '甲' },
    { kind: 'otsu', label: '乙', value: '乙' },
    { kind: 'hei', label: '丙', value: '丙' },
  ],
  [
    { kind: 'ten', label: '天', value: '天' },
    { kind: 'chi', label: '地', value: '地' },
    { kind: 'jin', label: '人', value: '人' },
  ],
];

/**
 * 複合返り点の定義
 */
const KAERI_COMPOUND_GROUP: KaeriKind[] = [
  { kind: 'ichi-re', label: '一レ', value: '一レ' },
  { kind: 'ni-re', label: '二レ', value: '二レ' },
  { kind: 'jo-re', label: '上レ', value: '上レ' },
  { kind: 'chu-re', label: '中レ', value: '中レ' },
  { kind: 'ko-re', label: '甲レ', value: '甲レ' },
  { kind: 'otsu-re', label: '乙レ', value: '乙レ' },
];

/**
 * Validates if text is primarily hiragana/katakana
 * Returns true if valid, warning message if contains non-kana characters
 */
function validateKanaInput(value: string): { valid: boolean; warning?: string } {
  if (!value.trim()) {
    return { valid: false };
  }

  // Check if contains non-kana characters (allow hiragana, katakana, and prolonged sound mark)
  const kanaPattern = /^[\u3040-\u309F\u30A0-\u30FF\u30FC]+$/;
  if (!kanaPattern.test(value)) {
    return {
      valid: true,
      warning: 'ひらがな/カタカナ以外の文字が含まれています',
    };
  }

  return { valid: true };
}

/**
 * MarkPopup class for managing kana and kaeri input popup UI
 */
export class MarkPopup {
  private container: HTMLElement;
  private popup: HTMLElement | null = null;
  private currentFromTokenId: string | null = null;
  private currentToTokenId: string | null = null;
  private currentMarkId: string | null = null;
  private callbacks: KanaSelectCallback[] = [];
  private kaeriCallbacks: KaeriSelectCallback[] = [];
  /** Stores the keydown handler for cleanup */
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  /** Element that had focus before popup opened */
  private previousFocusElement: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupStyles();
  }

  /**
   * Setup CSS styles for the popup
   */
  private setupStyles(): void {
    const styleId = 'mark-popup-styles';
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    // Use CSS variables from styles.css for consistent theming
    style.textContent = `
      .mark-popup {
        position: absolute;
        z-index: 1000;
        background: var(--editor-bg, #ffffff);
        border: 1px solid var(--editor-border, #dadce0);
        border-radius: 8px;
        box-shadow: var(--shadow-lg, 0 4px 16px rgba(0, 0, 0, 0.12));
        padding: 12px;
        min-width: 220px;
        font-family: var(--font-sans, 'Noto Sans JP', sans-serif);
        font-size: 14px;
      }

      .mark-popup-header {
        font-weight: 600;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--editor-border, #dadce0);
        color: var(--editor-text, #202124);
      }

      .mark-popup-section {
        margin-bottom: 12px;
      }

      .mark-popup-fieldset {
        border: none;
        padding: 0;
        margin: 0;
      }

      .mark-popup-section-label {
        font-size: 12px;
        color: var(--editor-text-secondary, #5f6368);
        margin-bottom: 6px;
        display: block;
      }

      .mark-popup-radio-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mark-popup-radio-group label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        padding: 4px 0;
        color: var(--editor-text, #202124);
      }

      .mark-popup-radio-group input[type="radio"] {
        margin: 0;
        cursor: pointer;
        accent-color: var(--editor-primary, #4285f4);
      }

      .mark-popup-input {
        width: 100%;
        padding: 8px;
        border: 1px solid var(--editor-border, #dadce0);
        border-radius: 4px;
        font-size: 14px;
        font-family: inherit;
        color: var(--editor-text, #202124);
        background: var(--editor-bg, #ffffff);
      }

      .mark-popup-input:focus {
        outline: none;
        border-color: var(--editor-primary, #4285f4);
        box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
      }

      .mark-popup-input.has-warning {
        border-color: var(--editor-warning, #f59e0b);
      }

      .mark-popup-warning {
        font-size: 12px;
        color: var(--editor-warning, #f59e0b);
        margin-top: 4px;
        display: none;
      }

      .mark-popup-warning.visible {
        display: block;
      }

      .mark-popup-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        padding-top: 8px;
        border-top: 1px solid var(--editor-border, #dadce0);
      }

      .mark-popup-btn {
        padding: 6px 12px;
        border: 1px solid var(--editor-border, #dadce0);
        border-radius: 4px;
        background: var(--editor-bg-secondary, #f8f9fa);
        color: var(--editor-text, #202124);
        cursor: pointer;
        font-size: 13px;
        transition: background-color 0.15s, border-color 0.15s;
      }

      .mark-popup-btn:hover {
        background-color: var(--editor-primary-light, #e8f0fe);
        border-color: var(--editor-primary, #4285f4);
      }

      .mark-popup-btn-primary {
        background-color: var(--editor-primary, #4285f4);
        border-color: var(--editor-primary, #4285f4);
        color: white;
      }

      .mark-popup-btn-primary:hover {
        background-color: var(--editor-primary-hover, #1a73e8);
      }

      .mark-popup-btn-primary:disabled {
        background-color: #a8c7fa;
        border-color: #a8c7fa;
        cursor: not-allowed;
      }

      .mark-popup-btn-danger {
        color: var(--editor-error, #d93025);
        border-color: var(--editor-error, #d93025);
        background: var(--editor-bg, #ffffff);
      }

      .mark-popup-btn-danger:hover {
        background-color: var(--editor-error-bg, #fce8e6);
      }

      /* Kaeri popup specific styles */
      .mark-popup-title {
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--editor-text, #202124);
      }

      .mark-popup-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-bottom: 8px;
      }

      .mark-popup-buttons .mark-popup-btn {
        min-width: 32px;
        padding: 4px 8px;
        font-size: 14px;
      }

      .mark-popup-btn--selected {
        background-color: var(--editor-primary, #4285f4);
        border-color: var(--editor-primary, #4285f4);
        color: white;
      }

      .mark-popup-btn--selected:hover {
        background-color: var(--editor-primary-hover, #1a73e8);
      }

      .mark-popup-separator {
        height: 1px;
        background-color: var(--editor-border, #dadce0);
        margin: 8px 0;
      }

      .mark-popup-group-label {
        font-size: 12px;
        color: var(--editor-text-secondary, #5f6368);
        margin-bottom: 6px;
      }

      .mark-popup-btn--delete {
        color: var(--editor-error, #d93025);
        border-color: var(--editor-error, #d93025);
        background: var(--editor-bg, #ffffff);
      }

      .mark-popup-btn--delete:hover {
        background-color: var(--editor-error-bg, #fce8e6);
      }

      .mark-popup-btn--cancel {
        background-color: var(--editor-bg-secondary, #f8f9fa);
      }

      .mark-popup-btn--cancel:hover {
        background-color: var(--editor-bg-tertiary, #f1f3f4);
      }

      .mark-popup-btn:focus {
        outline: 2px solid var(--editor-primary, #4285f4);
        outline-offset: 2px;
      }

      .mark-popup input[type="radio"]:focus {
        outline: 2px solid var(--editor-primary, #4285f4);
        outline-offset: 2px;
      }

      /* Visually hidden class for screen readers */
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Show the kana popup at the specified position
   *
   * @param position Screen position for the popup
   * @param fromTokenId Starting token ID of the selection
   * @param toTokenId Ending token ID of the selection
   * @param existingMark Optional existing mark to edit
   */
  showKanaPopup(
    position: { x: number; y: number },
    fromTokenId: string,
    toTokenId: string,
    existingMark?: Mark
  ): void {
    // Store currently focused element before hiding existing popup
    this.previousFocusElement = document.activeElement as HTMLElement | null;

    // Close any existing popup
    this.hide();

    // Re-store after hide() cleared it
    this.previousFocusElement = document.activeElement as HTMLElement | null;

    this.currentFromTokenId = fromTokenId;
    this.currentToTokenId = toTokenId;
    this.currentMarkId = existingMark?.id ?? null;

    // Extract existing values if editing
    let existingType: KanaMarkType = 'okurigana';
    let existingValue = '';

    if (existingMark) {
      if (
        existingMark.type === 'okurigana' ||
        existingMark.type === 'yomigana' ||
        existingMark.type === 'soegana'
      ) {
        existingType = existingMark.type;
        existingValue = existingMark.value;
      }
    }

    // Generate unique IDs for accessibility
    const kanaInputId = `kana-input-${Date.now()}`;
    const kanaHintId = `kana-hint-${Date.now()}`;

    // Create popup element
    this.popup = document.createElement('div');
    this.popup.className = 'mark-popup';
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-label', existingMark ? '仮名を編集' : '仮名を追加');
    this.popup.setAttribute('aria-modal', 'true');

    // Build popup content
    this.popup.innerHTML = `
      <div class="mark-popup-header">仮名を追加</div>

      <fieldset class="mark-popup-section mark-popup-fieldset">
        <legend class="mark-popup-section-label">種別を選択</legend>
        <div class="mark-popup-radio-group" role="radiogroup" aria-label="仮名の種別">
          ${(Object.keys(KANA_TYPE_LABELS) as KanaMarkType[])
            .map(
              (type) => `
            <label>
              <input type="radio" name="kana-type" value="${type}" ${type === existingType ? 'checked' : ''}>
              ${KANA_TYPE_LABELS[type]}
            </label>
          `
            )
            .join('')}
        </div>
      </fieldset>

      <div class="mark-popup-section">
        <label for="${kanaInputId}" class="mark-popup-section-label">仮名を入力</label>
        <input type="text" id="${kanaInputId}" class="mark-popup-input" placeholder="仮名を入力" value="${this.escapeHtml(existingValue)}" aria-describedby="${kanaHintId}">
        <span id="${kanaHintId}" class="visually-hidden">ひらがなまたはカタカナで入力してください</span>
        <div class="mark-popup-warning" role="alert" aria-live="polite"></div>
      </div>

      <div class="mark-popup-actions">
        ${existingMark ? '<button type="button" class="mark-popup-btn mark-popup-btn-danger" data-action="delete" tabindex="0" aria-label="この仮名を削除">削除</button>' : ''}
        <button type="button" class="mark-popup-btn" data-action="cancel" tabindex="0" aria-label="キャンセルして閉じる">キャンセル</button>
        <button type="button" class="mark-popup-btn mark-popup-btn-primary" data-action="apply" tabindex="0" disabled aria-label="仮名を適用">適用</button>
      </div>
    `;

    // Position the popup
    this.popup.style.left = `${position.x}px`;
    this.popup.style.top = `${position.y}px`;

    // Add to container
    this.container.appendChild(this.popup);

    // Adjust position if popup goes off-screen
    this.adjustPosition();

    // Setup event listeners
    this.setupEventListeners();

    // Setup keyboard handlers (focus trap, Escape, etc.)
    this.setupKeyboardHandlers();

    // Focus the input field
    this.focusFirstElement(true);
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Adjust popup position to keep it within viewport
   */
  private adjustPosition(): void {
    if (!this.popup) return;

    const rect = this.popup.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    // Check right edge
    if (rect.right > window.innerWidth) {
      const newLeft = Math.max(0, window.innerWidth - rect.width - 10);
      this.popup.style.left = `${newLeft}px`;
    }

    // Check bottom edge
    if (rect.bottom > window.innerHeight) {
      const newTop = Math.max(0, window.innerHeight - rect.height - 10);
      this.popup.style.top = `${newTop}px`;
    }

    // Ensure popup is within container bounds (if container has position relative/absolute)
    const computedStyle = getComputedStyle(this.container);
    if (computedStyle.position === 'relative' || computedStyle.position === 'absolute') {
      const currentLeft = parseFloat(this.popup.style.left);
      const currentTop = parseFloat(this.popup.style.top);

      if (currentLeft + rect.width > containerRect.width) {
        this.popup.style.left = `${containerRect.width - rect.width - 10}px`;
      }
      if (currentTop + rect.height > containerRect.height) {
        this.popup.style.top = `${containerRect.height - rect.height - 10}px`;
      }
    }
  }

  /**
   * Setup event listeners for the popup
   */
  private setupEventListeners(): void {
    if (!this.popup) return;

    const input = this.popup.querySelector('.mark-popup-input') as HTMLInputElement;
    const warning = this.popup.querySelector('.mark-popup-warning') as HTMLDivElement;
    const applyBtn = this.popup.querySelector('[data-action="apply"]') as HTMLButtonElement;
    const cancelBtn = this.popup.querySelector('[data-action="cancel"]') as HTMLButtonElement;
    const deleteBtn = this.popup.querySelector(
      '[data-action="delete"]'
    ) as HTMLButtonElement | null;

    // Input validation
    const validateInput = (): void => {
      const value = input.value;
      const validation = validateKanaInput(value);

      applyBtn.disabled = !validation.valid;

      if (validation.warning) {
        input.classList.add('has-warning');
        warning.textContent = validation.warning;
        warning.classList.add('visible');
      } else {
        input.classList.remove('has-warning');
        warning.classList.remove('visible');
      }
    };

    input.addEventListener('input', validateInput);
    validateInput(); // Initial validation

    // Apply button
    applyBtn.addEventListener('click', () => {
      this.applySelection();
    });

    // Cancel button
    cancelBtn.addEventListener('click', () => {
      this.hide();
    });

    // Delete button
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deleteSelection();
      });
    }

    // Enter key to apply (Escape is handled by setupKeyboardHandlers)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !applyBtn.disabled) {
        e.preventDefault();
        this.applySelection();
      }
    });

    // Click outside to close
    document.addEventListener('mousedown', this.handleOutsideClick);
  }

  /**
   * Handle clicks outside the popup
   */
  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.popup && !this.popup.contains(e.target as Node)) {
      this.hide();
    }
  };

  /**
   * Apply the current selection
   */
  private applySelection(): void {
    if (!this.popup || !this.currentFromTokenId || !this.currentToTokenId) return;

    const input = this.popup.querySelector('.mark-popup-input') as HTMLInputElement;
    const selectedRadio = this.popup.querySelector(
      'input[name="kana-type"]:checked'
    ) as HTMLInputElement;

    if (!selectedRadio || !input.value.trim()) return;

    const type = selectedRadio.value as KanaMarkType;
    const value = input.value.trim();

    // Notify callbacks
    for (const callback of this.callbacks) {
      callback(this.currentFromTokenId, this.currentToTokenId, type, value);
    }

    this.hide();
  }

  /**
   * Delete the current mark
   */
  private deleteSelection(): void {
    if (!this.currentFromTokenId || !this.currentToTokenId) return;

    // Notify callbacks with null type to indicate deletion
    for (const callback of this.callbacks) {
      callback(this.currentFromTokenId, this.currentToTokenId, null, '');
    }

    this.hide();
  }

  /**
   * Register a callback for kana selection events
   *
   * @param callback Function called when user applies or deletes a kana mark
   */
  onKanaSelect(callback: KanaSelectCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Get focusable elements within the popup
   */
  private getFocusableElements(): HTMLElement[] {
    if (!this.popup) return [];
    return Array.from(
      this.popup.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  /**
   * Setup keyboard handlers for the popup (focus trap, Escape to close, etc.)
   */
  private setupKeyboardHandlers(): void {
    if (!this.popup) return;

    this.keydownHandler = (e: KeyboardEvent) => {
      if (!this.popup) return;

      // Escape key: close popup
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
        return;
      }

      // Tab key: focus trap
      if (e.key === 'Tab') {
        const focusableElements = this.getFocusableElements();
        if (focusableElements.length === 0) return;

        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: go to previous, wrap to last if at first
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl?.focus();
          }
        } else {
          // Tab: go to next, wrap to first if at last
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl?.focus();
          }
        }
      }

      // Enter key: activate focused button (native behavior is usually fine,
      // but we ensure it works for buttons)
      if (e.key === 'Enter') {
        const activeEl = document.activeElement as HTMLElement;
        // For buttons, let the native click behavior handle it
        // For input fields in kana popup, applySelection is handled in setupEventListeners
      }
    };

    this.popup.addEventListener('keydown', this.keydownHandler);
  }

  /**
   * Focus the first focusable element in the popup
   * For kana popup: focuses the input field
   * For kaeri popup: focuses the first kaeri button
   */
  private focusFirstElement(preferInput: boolean = false): void {
    if (!this.popup) return;

    if (preferInput) {
      // For kana popup, prefer the input field
      const input = this.popup.querySelector('.mark-popup-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
        return;
      }
    }

    // Focus the first focusable element
    const focusableElements = this.getFocusableElements();
    focusableElements[0]?.focus();
  }

  /**
   * Hide the popup
   */
  hide(): void {
    if (this.popup) {
      // Remove keyboard handler
      if (this.keydownHandler) {
        this.popup.removeEventListener('keydown', this.keydownHandler);
        this.keydownHandler = null;
      }
      document.removeEventListener('mousedown', this.handleOutsideClick);
      this.popup.remove();
      this.popup = null;
    }
    // Restore focus to previously focused element
    if (this.previousFocusElement) {
      this.previousFocusElement.focus();
      this.previousFocusElement = null;
    }
    this.currentFromTokenId = null;
    this.currentToTokenId = null;
    this.currentMarkId = null;
  }

  /**
   * Check if popup is currently visible
   */
  isVisible(): boolean {
    return this.popup !== null;
  }

  /**
   * Get the current mark ID being edited (if any)
   */
  getCurrentMarkId(): string | null {
    return this.currentMarkId;
  }

  // ============================================================================
  // Kaeri (返り点) Popup Methods
  // ============================================================================

  /**
   * Register a callback for kaeri selection events
   *
   * @param callback Function called when user selects or deletes a kaeri mark
   *                 kind is null when deleting
   */
  onKaeriSelect(callback: KaeriSelectCallback): void {
    this.kaeriCallbacks.push(callback);
  }

  /**
   * Show the kaeri popup at the specified position
   *
   * @param position Screen position for the popup
   * @param tokenId Token ID to add/edit kaeri mark
   * @param existingMark Optional existing kaeri mark to edit
   */
  showKaeriPopup(position: { x: number; y: number }, tokenId: string, existingMark?: Mark): void {
    // Store currently focused element before hiding existing popup
    this.previousFocusElement = document.activeElement as HTMLElement | null;

    // Close any existing popup
    this.hide();

    // Re-store after hide() cleared it
    this.previousFocusElement = document.activeElement as HTMLElement | null;

    this.currentFromTokenId = tokenId;
    this.currentToTokenId = tokenId;
    this.currentMarkId = existingMark?.id ?? null;

    // Create popup element
    this.popup = document.createElement('div');
    this.popup.className = 'mark-popup';
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-label', existingMark ? '返り点を編集' : '返り点を追加');
    this.popup.setAttribute('aria-modal', 'true');

    // Build popup content
    this.popup.appendChild(this.buildKaeriPopupContent(existingMark));

    // Position the popup
    this.popup.style.left = `${position.x}px`;
    this.popup.style.top = `${position.y}px`;

    // Add to container
    this.container.appendChild(this.popup);

    // Adjust position if popup goes off-screen
    this.adjustPosition();

    // Setup kaeri event listeners
    this.setupKaeriEventListeners(existingMark);

    // Setup keyboard handlers (focus trap, Escape, etc.)
    this.setupKeyboardHandlers();

    // Focus the first kaeri button
    this.focusFirstElement(false);
  }

  /**
   * Build kaeri popup content
   */
  private buildKaeriPopupContent(existingMark?: Mark): DocumentFragment {
    const fragment = document.createDocumentFragment();

    // Title
    const title = document.createElement('div');
    title.className = 'mark-popup-title';
    title.textContent = existingMark ? '返り点を編集' : '返り点を追加';
    fragment.appendChild(title);

    // Get existing value for highlighting
    const existingValue = existingMark?.type === 'kaeri' ? (existingMark as KaeriMark).value : null;

    // Single kaeri groups
    for (const group of KAERI_SINGLE_GROUPS) {
      const buttonsDiv = document.createElement('div');
      buttonsDiv.className = 'mark-popup-buttons';
      for (const item of group) {
        const btn = this.createKaeriButton(item, existingValue);
        buttonsDiv.appendChild(btn);
      }
      fragment.appendChild(buttonsDiv);
    }

    // Separator
    const separator1 = document.createElement('div');
    separator1.className = 'mark-popup-separator';
    fragment.appendChild(separator1);

    // Compound group label
    const compoundLabel = document.createElement('div');
    compoundLabel.className = 'mark-popup-group-label';
    compoundLabel.textContent = '複合:';
    fragment.appendChild(compoundLabel);

    // Compound kaeri buttons
    const compoundButtonsDiv = document.createElement('div');
    compoundButtonsDiv.className = 'mark-popup-buttons';
    for (const item of KAERI_COMPOUND_GROUP) {
      const btn = this.createKaeriButton(item, existingValue);
      compoundButtonsDiv.appendChild(btn);
    }
    fragment.appendChild(compoundButtonsDiv);

    // Separator
    const separator2 = document.createElement('div');
    separator2.className = 'mark-popup-separator';
    fragment.appendChild(separator2);

    // Action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'mark-popup-actions';

    // Delete button (only show if editing)
    if (existingMark) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'mark-popup-btn mark-popup-btn--delete';
      deleteBtn.textContent = '削除';
      deleteBtn.type = 'button';
      deleteBtn.tabIndex = 0;
      deleteBtn.dataset['action'] = 'delete';
      deleteBtn.setAttribute('aria-label', 'この返り点を削除');
      actionsDiv.appendChild(deleteBtn);
    }

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mark-popup-btn mark-popup-btn--cancel';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.type = 'button';
    cancelBtn.tabIndex = 0;
    cancelBtn.dataset['action'] = 'cancel';
    cancelBtn.setAttribute('aria-label', 'キャンセルして閉じる');
    actionsDiv.appendChild(cancelBtn);

    fragment.appendChild(actionsDiv);

    return fragment;
  }

  /**
   * Create a kaeri button
   */
  private createKaeriButton(item: KaeriKind, existingValue: string | null): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'mark-popup-btn';
    btn.textContent = item.label;
    btn.type = 'button';
    btn.tabIndex = 0;
    btn.dataset['kind'] = item.kind;
    btn.dataset['value'] = item.value;
    btn.setAttribute('aria-label', `${item.label}点を追加`);

    // Highlight if matches existing value
    if (existingValue === item.value) {
      btn.classList.add('mark-popup-btn--selected');
      btn.setAttribute('aria-pressed', 'true');
    }

    return btn;
  }

  /**
   * Setup event listeners for kaeri popup
   */
  private setupKaeriEventListeners(_existingMark?: Mark): void {
    if (!this.popup) return;

    // Kaeri buttons
    const kaeriButtons = this.popup.querySelectorAll('.mark-popup-buttons .mark-popup-btn');
    kaeriButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const kind = target.dataset['kind'];
        if (kind && this.currentFromTokenId) {
          // Toggle: if already selected, remove the mark (pass null)
          const isSelected = target.classList.contains('mark-popup-btn--selected');
          this.notifyKaeriCallbacks(this.currentFromTokenId, isSelected ? null : kind);
          this.hide();
        }
      });
    });

    // Delete button
    const deleteBtn = this.popup.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (this.currentFromTokenId) {
          this.notifyKaeriCallbacks(this.currentFromTokenId, null);
          this.hide();
        }
      });
    }

    // Cancel button
    const cancelBtn = this.popup.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.hide();
      });
    }

    // Escape key is handled by setupKeyboardHandlers

    // Click outside to close
    document.addEventListener('mousedown', this.handleOutsideClick);
  }

  /**
   * Notify kaeri callbacks
   */
  private notifyKaeriCallbacks(tokenId: string, kind: string | null): void {
    for (const callback of this.kaeriCallbacks) {
      callback(tokenId, kind);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get kaeri value from kind
 *
 * @param kind Internal kaeri kind identifier
 * @returns SKAM kaeri.value string, or null if not found
 */
export function getKaeriValueFromKind(kind: string): string | null {
  // Search in single groups
  for (const group of KAERI_SINGLE_GROUPS) {
    const found = group.find((item) => item.kind === kind);
    if (found) {
      return found.value;
    }
  }

  // Search in compound group
  const compoundFound = KAERI_COMPOUND_GROUP.find((item) => item.kind === kind);
  if (compoundFound) {
    return compoundFound.value;
  }

  return null;
}

/**
 * Get kind from kaeri value
 *
 * @param value SKAM kaeri.value string
 * @returns Internal kaeri kind identifier, or null if not found
 */
export function getKaeriKindFromValue(value: string): string | null {
  // Search in single groups
  for (const group of KAERI_SINGLE_GROUPS) {
    const found = group.find((item) => item.value === value);
    if (found) {
      return found.kind;
    }
  }

  // Search in compound group
  const compoundFound = KAERI_COMPOUND_GROUP.find((item) => item.value === value);
  if (compoundFound) {
    return compoundFound.kind;
  }

  return null;
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  attachInteractiveHandlers,
  setSelectionClasses,
  clearSelection,
  selectToken,
} from '../interactive.js';

describe('attachInteractiveHandlers', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // テスト用のDOM構造を作成
    container = document.createElement('div');
    container.className = 'skam-document';
    container.setAttribute('data-writing-mode', 'vertical');
    container.innerHTML = `
      <div class="skam-display">
        <span class="skam-token" data-token-id="t1">
          <span class="skam-base">學</span>
        </span>
        <span class="skam-token" data-token-id="t2">
          <span class="skam-base">而</span>
        </span>
        <span class="skam-token" data-token-id="t3">
          <span class="skam-base">時</span>
        </span>
        <span class="skam-token" data-token-id="t4">
          <span class="skam-base">習</span>
        </span>
        <span class="skam-token" data-token-id="t5">
          <span class="skam-base">之</span>
        </span>
      </div>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('onTokenClick', () => {
    it('should call onTokenClick when a token is clicked', () => {
      const onTokenClick = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenClick });

      // t1トークンをクリック
      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      simulateClick(token1);

      expect(onTokenClick).toHaveBeenCalledTimes(1);
      expect(onTokenClick).toHaveBeenCalledWith('t1', expect.any(MouseEvent));

      cleanup();
    });

    it('should call onTokenClick when clicking on child element', () => {
      const onTokenClick = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenClick });

      // t1トークン内のskam-base要素をクリック
      const base = container.querySelector('[data-token-id="t1"] .skam-base') as HTMLElement;
      simulateClick(base);

      expect(onTokenClick).toHaveBeenCalledTimes(1);
      expect(onTokenClick).toHaveBeenCalledWith('t1', expect.any(MouseEvent));

      cleanup();
    });

    it('should not call onTokenClick when clicking outside tokens', () => {
      const onTokenClick = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenClick });

      // コンテナの空白部分をクリック
      simulateClick(container);

      expect(onTokenClick).not.toHaveBeenCalled();

      cleanup();
    });
  });

  describe('onTokenSelect', () => {
    it('should call onTokenSelect when dragging across multiple tokens', () => {
      const onTokenSelect = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenSelect });

      // t1からt3までドラッグ
      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      const token3 = container.querySelector('[data-token-id="t3"]') as HTMLElement;

      simulateDrag(token1, token3, { startY: 10, endY: 100 });

      expect(onTokenSelect).toHaveBeenCalledTimes(1);
      expect(onTokenSelect).toHaveBeenCalledWith('t1', 't3');

      cleanup();
    });

    it('should normalize selection order in vertical mode (top to bottom)', () => {
      // 縦書きスタイルを適用（happy-domでgetComputedStyleが動作するように）
      container.style.writingMode = 'vertical-rl';

      const onTokenSelect = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenSelect });

      // t3からt1へ逆方向にドラッグ（縦書きなので下から上）
      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      const token3 = container.querySelector('[data-token-id="t3"]') as HTMLElement;

      // startY > endY は上方向へのドラッグ = 逆方向
      simulateDrag(token3, token1, { startY: 100, endY: 10 });

      // 正規化されてt1, t3の順になる
      expect(onTokenSelect).toHaveBeenCalledWith('t1', 't3');

      cleanup();
    });

    it('should not call onTokenSelect for single token click', () => {
      const onTokenClick = vi.fn();
      const onTokenSelect = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenClick, onTokenSelect });

      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      simulateClick(token1);

      expect(onTokenClick).toHaveBeenCalled();
      expect(onTokenSelect).not.toHaveBeenCalled();

      cleanup();
    });
  });

  describe('selection classes', () => {
    it('should add skam-selected class during single token click', () => {
      const cleanup = attachInteractiveHandlers(container, {});

      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;

      // mousedown時に選択クラスが追加される
      const mousedown = new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 });
      token1.dispatchEvent(mousedown);

      expect(token1.classList.contains('skam-selected')).toBe(true);

      // mouseup時にクリアされる
      const mouseup = new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 });
      token1.dispatchEvent(mouseup);

      expect(token1.classList.contains('skam-selected')).toBe(false);

      cleanup();
    });

    it('should add selection-start, selection-middle, selection-end classes during drag', () => {
      const cleanup = attachInteractiveHandlers(container, {});

      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      const token2 = container.querySelector('[data-token-id="t2"]') as HTMLElement;
      const token3 = container.querySelector('[data-token-id="t3"]') as HTMLElement;

      // ドラッグ開始
      const mousedown = new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 });
      token1.dispatchEvent(mousedown);

      // ドラッグ中
      const mousemove = new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 100 });
      token3.dispatchEvent(mousemove);

      expect(token1.classList.contains('skam-selection-start')).toBe(true);
      expect(token2.classList.contains('skam-selection-middle')).toBe(true);
      expect(token3.classList.contains('skam-selection-end')).toBe(true);

      // mouseup時にクリアされる
      const mouseup = new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 100 });
      token3.dispatchEvent(mouseup);

      expect(token1.classList.contains('skam-selection-start')).toBe(false);
      expect(token2.classList.contains('skam-selection-middle')).toBe(false);
      expect(token3.classList.contains('skam-selection-end')).toBe(false);

      cleanup();
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners when cleanup is called', () => {
      const onTokenClick = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenClick });

      cleanup();

      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      simulateClick(token1);

      expect(onTokenClick).not.toHaveBeenCalled();
    });
  });

  describe('range marks (data-token-from/to)', () => {
    beforeEach(() => {
      // 範囲マークを含むDOM構造
      container.innerHTML = `
        <div class="skam-display">
          <ruby>
            <rb class="skam-base" data-token-from="t1" data-token-to="t2">朝廷</rb>
            <rt class="skam-ruby">ちょうてい</rt>
          </ruby>
          <span class="skam-token" data-token-id="t3">
            <span class="skam-base">之</span>
          </span>
        </div>
      `;
    });

    it('should get token ID from data-token-from/to for range marks based on click position', () => {
      const onTokenClick = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenClick });

      const rangeElement = container.querySelector('[data-token-from="t1"]') as HTMLElement;
      // Click at position 0,0 (before center, should return from token)
      simulateClick(rangeElement, { x: 0, y: 0 });

      // Should return either t1 or t2 depending on click position relative to element center
      expect(onTokenClick).toHaveBeenCalledWith(expect.stringMatching(/^t[12]$/), expect.any(MouseEvent));

      cleanup();
    });
  });
});

describe('setSelectionClasses', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <span class="skam-token" data-token-id="t1"><span class="skam-base">學</span></span>
      <span class="skam-token" data-token-id="t2"><span class="skam-base">而</span></span>
      <span class="skam-token" data-token-id="t3"><span class="skam-base">時</span></span>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should set selection classes for single token', () => {
    setSelectionClasses(container, 't1', 't1');

    const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
    expect(token1.classList.contains('skam-selected')).toBe(true);
  });

  it('should set selection classes for range', () => {
    setSelectionClasses(container, 't1', 't3');

    const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
    const token2 = container.querySelector('[data-token-id="t2"]') as HTMLElement;
    const token3 = container.querySelector('[data-token-id="t3"]') as HTMLElement;

    expect(token1.classList.contains('skam-selection-start')).toBe(true);
    expect(token2.classList.contains('skam-selection-middle')).toBe(true);
    expect(token3.classList.contains('skam-selection-end')).toBe(true);
  });
});

describe('clearSelection', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <span class="skam-token skam-selection-start" data-token-id="t1"><span class="skam-base">學</span></span>
      <span class="skam-token skam-selection-middle" data-token-id="t2"><span class="skam-base">而</span></span>
      <span class="skam-token skam-selection-end" data-token-id="t3"><span class="skam-base">時</span></span>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should clear all selection classes', () => {
    clearSelection(container);

    const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
    const token2 = container.querySelector('[data-token-id="t2"]') as HTMLElement;
    const token3 = container.querySelector('[data-token-id="t3"]') as HTMLElement;

    expect(token1.classList.contains('skam-selection-start')).toBe(false);
    expect(token2.classList.contains('skam-selection-middle')).toBe(false);
    expect(token3.classList.contains('skam-selection-end')).toBe(false);
  });
});

describe('selectToken', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <span class="skam-token" data-token-id="t1"><span class="skam-base">學</span></span>
      <span class="skam-token" data-token-id="t2"><span class="skam-base">而</span></span>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should select single token', () => {
    selectToken(container, 't1');

    const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
    expect(token1.classList.contains('skam-selected')).toBe(true);
  });

  it('should clear previous selection', () => {
    selectToken(container, 't1');
    selectToken(container, 't2');

    const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
    const token2 = container.querySelector('[data-token-id="t2"]') as HTMLElement;

    expect(token1.classList.contains('skam-selected')).toBe(false);
    expect(token2.classList.contains('skam-selected')).toBe(true);
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function simulateClick(element: HTMLElement, options?: { x?: number; y?: number }): void {
  const x = options?.x ?? 10;
  const y = options?.y ?? 10;

  const mousedown = new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y });
  element.dispatchEvent(mousedown);

  const mouseup = new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y });
  element.dispatchEvent(mouseup);
}

function simulateDrag(
  startElement: HTMLElement,
  endElement: HTMLElement,
  options?: { startX?: number; startY?: number; endX?: number; endY?: number }
): void {
  const startX = options?.startX ?? 10;
  const startY = options?.startY ?? 10;
  const endX = options?.endX ?? 10;
  const endY = options?.endY ?? 100;

  const mousedown = new MouseEvent('mousedown', {
    bubbles: true,
    clientX: startX,
    clientY: startY,
  });
  startElement.dispatchEvent(mousedown);

  const mousemove = new MouseEvent('mousemove', { bubbles: true, clientX: endX, clientY: endY });
  endElement.dispatchEvent(mousemove);

  const mouseup = new MouseEvent('mouseup', { bubbles: true, clientX: endX, clientY: endY });
  endElement.dispatchEvent(mouseup);
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  attachInteractiveHandlers,
  getTokenElementsInRange,
  getAllSelectableElements,
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

  describe('onSelectionChange / onSelectionClear', () => {
    it('should call onSelectionChange on mousedown', () => {
      const onSelectionChange = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onSelectionChange });

      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      const mousedown = new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 });
      token1.dispatchEvent(mousedown);

      expect(onSelectionChange).toHaveBeenCalledWith('t1', 't1');

      cleanup();
    });

    it('should call onSelectionClear then onSelectionChange during drag', () => {
      const onSelectionChange = vi.fn();
      const onSelectionClear = vi.fn();
      const cleanup = attachInteractiveHandlers(container, {
        onSelectionChange,
        onSelectionClear,
      });

      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      const token3 = container.querySelector('[data-token-id="t3"]') as HTMLElement;

      // ドラッグ開始
      token1.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
      );

      // ドラッグ中
      token3.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 100 })
      );

      // mousemove 時に onSelectionClear → onSelectionChange が呼ばれる
      expect(onSelectionClear).toHaveBeenCalled();
      expect(onSelectionChange).toHaveBeenCalledWith('t1', 't3');

      cleanup();
    });

    it('should call onSelectionClear on mouseup', () => {
      const onSelectionClear = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onSelectionClear });

      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      token1.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
      );
      token1.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 }));

      expect(onSelectionClear).toHaveBeenCalled();

      cleanup();
    });

    it('should call onSelectionClear when clicking outside tokens', () => {
      const onSelectionClear = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onSelectionClear });

      container.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 })
      );

      expect(onSelectionClear).toHaveBeenCalled();

      cleanup();
    });

    it('should call onSelectionClear on mouseleave only during drag', () => {
      const onSelectionClear = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onSelectionClear });

      // mouseleave without drag → should NOT call
      container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      expect(onSelectionClear).not.toHaveBeenCalled();

      // Start drag then mouseleave → should call
      const token1 = container.querySelector('[data-token-id="t1"]') as HTMLElement;
      token1.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
      );
      onSelectionClear.mockClear();

      container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      expect(onSelectionClear).toHaveBeenCalled();

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

    it('should call onTokenSelect with both tokens when clicking on range mark (compound word)', () => {
      const onTokenSelect = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenSelect });

      const rangeElement = container.querySelector('[data-token-from="t1"]') as HTMLElement;
      // Click on the compound word element
      simulateClick(rangeElement, { x: 0, y: 0 });

      // Clicking on a compound word should select the entire range (t1 to t2)
      expect(onTokenSelect).toHaveBeenCalledWith('t1', 't2');

      cleanup();
    });
  });

  describe('tateten group with yomigana (data-token-from/to on ruby)', () => {
    beforeEach(() => {
      // tateten グループ: data-token-from/to が <ruby> に付いた構造
      container.innerHTML = `
        <div class="skam-display">
          <ruby data-token-from="t1" data-token-to="t2">
            <rb class="skam-tateten-group">
              <span class="skam-token" data-token-id="t1"><span class="skam-base">春</span></span>
              <span class="skam-tateten-sep"><span class="skam-tateten-mark"></span></span>
              <span class="skam-token" data-token-id="t2"><span class="skam-base">風</span></span>
            </rb>
            <rt class="skam-ruby">しゅんぷう</rt>
          </ruby>
          <span class="skam-token" data-token-id="t3">
            <span class="skam-base">之</span>
          </span>
        </div>
      `;
    });

    it('should resolve token ID when clicking on rt element inside tateten ruby', () => {
      const onTokenSelect = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenSelect });

      const rtElement = container.querySelector('rt.skam-ruby') as HTMLElement;
      simulateClick(rtElement, { x: 0, y: 0 });

      // rt をクリックすると closest('[data-token-from]') で <ruby> がヒットする
      expect(onTokenSelect).toHaveBeenCalledWith('t1', 't2');

      cleanup();
    });
  });

  describe('suffix-row with data-suffix-for', () => {
    beforeEach(() => {
      // tateten + yomigana で suffix-row が ruby 外に抽出された構造
      container.innerHTML = `
        <div class="skam-display">
          <ruby data-token-from="t1" data-token-to="t2">
            <rb class="skam-tateten-group">
              <span class="skam-token" data-token-id="t1"><span class="skam-base">春</span></span>
              <span class="skam-tateten-sep"><span class="skam-tateten-mark"></span></span>
              <span class="skam-token" data-token-id="t2"><span class="skam-base">風</span></span>
            </rb>
            <rt class="skam-ruby">しゅんぷう</rt>
          </ruby>
          <span class="skam-suffix-row" data-suffix-for="t2">
            <span class="skam-suffix-kaeri"><span class="skam-kaeriten">㆑</span></span>
          </span>
          <span class="skam-token" data-token-id="t3">
            <span class="skam-base">之</span>
          </span>
        </div>
      `;
    });

    it('should resolve token ID when clicking on suffix-row with data-suffix-for', () => {
      // suffix-row の token (t2) は tateten range (t1-t2) の一部なので、
      // normalizeSelectionRange により range 全体が選択される
      const onTokenSelect = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenSelect });

      const suffixRow = container.querySelector('[data-suffix-for="t2"]') as HTMLElement;
      simulateClick(suffixRow);

      expect(onTokenSelect).toHaveBeenCalledWith('t1', 't2');

      cleanup();
    });

    it('should resolve token ID when clicking on child of suffix-row', () => {
      const onTokenSelect = vi.fn();
      const cleanup = attachInteractiveHandlers(container, { onTokenSelect });

      const kaeriten = container.querySelector('.skam-kaeriten') as HTMLElement;
      simulateClick(kaeriten);

      expect(onTokenSelect).toHaveBeenCalledWith('t1', 't2');

      cleanup();
    });
  });
});

describe('getTokenElementsInRange', () => {
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

  it('should return single token element', () => {
    const elements = getTokenElementsInRange(container, 't1', 't1');
    expect(elements).toHaveLength(1);
    expect(elements[0]?.getAttribute('data-token-id')).toBe('t1');
  });

  it('should return range of token elements', () => {
    const elements = getTokenElementsInRange(container, 't1', 't3');
    expect(elements).toHaveLength(3);
    expect(elements.map((el) => el.getAttribute('data-token-id'))).toEqual(['t1', 't2', 't3']);
  });

  it('should return empty array for non-existent token', () => {
    const elements = getTokenElementsInRange(container, 'nonexistent', 'nonexistent');
    expect(elements).toHaveLength(0);
  });
});

describe('getAllSelectableElements', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <span class="skam-token" data-token-id="t1"><span class="skam-base">學</span></span>
      <ruby>
        <rb data-token-from="t2" data-token-to="t3">朝廷</rb>
        <rt>ちょうてい</rt>
      </ruby>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return both token and range mark elements', () => {
    const elements = getAllSelectableElements(container);
    // 1 token element + 1 range mark element
    expect(elements).toHaveLength(2);
  });

  it('should include .skam-token[data-token-id] elements', () => {
    const elements = getAllSelectableElements(container);
    const tokenEl = elements.find((el) => el.getAttribute('data-token-id') === 't1');
    expect(tokenEl).toBeDefined();
  });

  it('should include [data-token-from][data-token-to] elements', () => {
    const elements = getAllSelectableElements(container);
    const rangeEl = elements.find((el) => el.getAttribute('data-token-from') === 't2');
    expect(rangeEl).toBeDefined();
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

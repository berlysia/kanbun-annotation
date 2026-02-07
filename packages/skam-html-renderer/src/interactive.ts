/**
 * SKAM HTML Renderer - Interactive Event Handlers
 *
 * プレビューコンテナにインタラクティブなイベントハンドラを設定する
 *
 * @remarks
 * このモジュールはDOM APIを使用するため、ブラウザ環境専用です。
 * Node.js環境では使用できません。
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * インタラクティブイベントのコールバック関数
 */
export interface InteractiveCallbacks {
  /**
   * トークンがクリックされた時のコールバック
   * @param tokenId クリックされたトークンのID
   * @param event マウスイベント
   */
  onTokenClick?: (tokenId: string, event: MouseEvent) => void;

  /**
   * トークンの範囲が選択された時のコールバック
   * @param fromTokenId 選択開始トークンのID
   * @param toTokenId 選択終了トークンのID
   */
  onTokenSelect?: (fromTokenId: string, toTokenId: string) => void;

  /**
   * マーク（返り点、送り仮名等）がクリックされた時のコールバック
   * @param markId クリックされたマークのID
   * @param event マウスイベント
   */
  onMarkClick?: (markId: string, event: MouseEvent) => void;

  /**
   * 空白部分（トークン以外の場所）がクリックされた時のコールバック
   * @param event マウスイベント
   */
  onEmptyClick?: (event: MouseEvent) => void;
}

/**
 * 選択状態の管理
 */
interface SelectionState {
  /** ドラッグ中かどうか */
  isDragging: boolean;
  /** 選択開始トークンID */
  startTokenId: string | null;
  /** 選択開始位置 */
  startPosition: { x: number; y: number } | null;
  /** 現在の選択終了トークンID */
  currentEndTokenId: string | null;
  /** 最後に選択されたトークンID（Shift+クリック用） */
  lastSelectedTokenId: string | null;
}

// ============================================================================
// CSS Class Constants
// ============================================================================

const SELECTION_CLASSES = {
  selected: 'skam-selected',
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 要素からトークンIDを取得
 * data-token-id 属性を持つ最も近い祖先要素を探す
 *
 * @param element 対象要素
 * @param mousePosition マウス位置（範囲マーク上でfrom/toを判定するため）
 * @param isVertical 縦書きモードかどうか
 */
function getTokenIdFromElement(
  element: Element | null,
  mousePosition?: { x: number; y: number },
  _isVertical?: boolean
): string | null {
  if (!element) return null;

  // 範囲マーク（data-token-from/to）を先にチェック（熟語ルビなど）
  // 親要素にdata-token-idがあっても、範囲マーク内では範囲マークを優先
  const rangeElement = element.closest('[data-token-from]');
  if (rangeElement) {
    const fromId = rangeElement.getAttribute('data-token-from');
    const toId = rangeElement.getAttribute('data-token-to');

    // マウス位置がない場合、または from/to が同じ場合は from を返す
    if (!mousePosition || !toId || fromId === toId) {
      return fromId;
    }

    // 要素を50/50で分割してfrom/toを判定（中間トークンは選択不可）
    // textContentには送り仮名等が含まれる場合があるため、文字数ではなく位置で判定
    const rect = rangeElement.getBoundingClientRect();

    // 要素自体の書字方向を確認（コンテナではなく実際の要素で判定）
    const elementWritingMode = getComputedStyle(rangeElement).writingMode;
    const elementIsVertical = elementWritingMode.includes('vertical');

    if (elementIsVertical) {
      // 縦書き: 上から下にテキストが流れる
      // 上半分 = from、下半分 = to
      const relativeY = mousePosition.y - rect.top;
      return relativeY < rect.height / 2 ? fromId : toId;
    } else {
      // 横書き: 左から右にテキストが流れる
      // 左半分 = from、右半分 = to
      const relativeX = mousePosition.x - rect.left;
      return relativeX < rect.width / 2 ? fromId : toId;
    }
  }

  // data-token-id を持つ要素を探す（自身または祖先）
  const tokenElement = element.closest('[data-token-id]');
  if (tokenElement) {
    return tokenElement.getAttribute('data-token-id');
  }

  // data-suffix-for を持つ要素を探す（suffix-row が ruby 外に抽出された場合）
  const suffixElement = element.closest('[data-suffix-for]');
  if (suffixElement) {
    return suffixElement.getAttribute('data-suffix-for');
  }

  return null;
}

/**
 * コンテナの書字方向が縦書きかどうかを判定
 */
function isVerticalWritingMode(container: HTMLElement): boolean {
  const writingMode = getComputedStyle(container).writingMode;
  return writingMode.includes('vertical');
}

/**
 * 2点間のドラッグ方向を判定（縦書き対応）
 * 縦書きの場合: Y座標が小さい = 上 = 先頭
 * 横書きの場合: X座標が小さい = 左 = 先頭
 */
function comparePositions(
  start: { x: number; y: number },
  end: { x: number; y: number },
  isVertical: boolean
): number {
  if (isVertical) {
    // 縦書き: Y座標で比較（上が先頭）
    return start.y - end.y;
  } else {
    // 横書き: X座標で比較（左が先頭）
    return start.x - end.x;
  }
}

/**
 * コンテナ内のすべてのトークン要素を取得
 */
function getAllTokenElements(container: HTMLElement): HTMLElement[] {
  const elements = container.querySelectorAll<HTMLElement>('[data-token-id], [data-token-from]');
  return Array.from(elements);
}

/**
 * DOM出現順でユニークなトークンIDリストを取得
 */
function getOrderedTokenIds(container: HTMLElement): string[] {
  const allElements = getAllTokenElements(container);
  const seen = new Set<string>();
  const orderedIds: string[] = [];

  for (const el of allElements) {
    const tokenId = el.getAttribute('data-token-id');
    const tokenFrom = el.getAttribute('data-token-from');
    const tokenTo = el.getAttribute('data-token-to');

    // 単一トークン要素
    if (tokenId && !seen.has(tokenId)) {
      seen.add(tokenId);
      orderedIds.push(tokenId);
    }

    // 範囲マーク要素（from と to の両方を追加）
    if (tokenFrom && !seen.has(tokenFrom)) {
      seen.add(tokenFrom);
      orderedIds.push(tokenFrom);
    }
    if (tokenTo && !seen.has(tokenTo)) {
      seen.add(tokenTo);
      orderedIds.push(tokenTo);
    }
  }

  return orderedIds;
}

/**
 * 指定されたトークンIDの範囲内にあるトークンIDのセットを取得
 */
function getTokenIdsInRange(container: HTMLElement, fromId: string, toId: string): Set<string> {
  const orderedIds = getOrderedTokenIds(container);

  const fromIndex = orderedIds.indexOf(fromId);
  const toIndex = orderedIds.indexOf(toId);

  if (fromIndex === -1 || toIndex === -1) {
    return new Set();
  }

  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);

  return new Set(orderedIds.slice(startIndex, endIndex + 1));
}

/**
 * 選択されたトークン要素を取得（トークンIDベース）
 *
 * 対象: .skam-token[data-token-id] のみ
 * 熟語の場合、親の.skam-token要素にのみ選択クラスをつける
 */
function getTokenElementsInRange(
  container: HTMLElement,
  fromId: string,
  toId: string
): HTMLElement[] {
  const tokenIdsInRange = getTokenIdsInRange(container, fromId, toId);

  if (tokenIdsInRange.size === 0) {
    return [];
  }

  const result: HTMLElement[] = [];

  // .skam-token[data-token-id] を持つ要素のみを対象
  const tokenElements = Array.from(
    container.querySelectorAll<HTMLElement>('.skam-token[data-token-id]')
  );
  for (const el of tokenElements) {
    const tokenId = el.getAttribute('data-token-id');
    if (tokenId && tokenIdsInRange.has(tokenId)) {
      result.push(el);
    }
  }

  return result;
}

/**
 * 選択状態のCSSクラスをすべて削除
 */
function clearSelectionClasses(container: HTMLElement): void {
  // .skam-token[data-token-id] と [data-token-from][data-token-to] を対象にする
  const tokenElements = Array.from(
    container.querySelectorAll<HTMLElement>('.skam-token[data-token-id]')
  );
  const rangeElements = Array.from(
    container.querySelectorAll<HTMLElement>('[data-token-from][data-token-to]')
  );

  for (const el of tokenElements) {
    el.classList.remove(SELECTION_CLASSES.selected);
  }
  for (const el of rangeElements) {
    el.classList.remove(SELECTION_CLASSES.selected);
  }
}

/**
 * 選択状態のCSSクラスを適用
 */
function applySelectionClasses(container: HTMLElement, fromId: string, toId: string): void {
  const elements = getTokenElementsInRange(container, fromId, toId);

  for (const el of elements) {
    el.classList.add(SELECTION_CLASSES.selected);
  }
}

/**
 * 選択範囲を正規化（熟語が部分的に含まれる場合は熟語全体を含める）
 *
 * @returns [normalizedFromId, normalizedToId] 正規化された選択範囲
 */
function normalizeSelectionRange(
  container: HTMLElement,
  fromId: string,
  toId: string
): [string, string] {
  const originalTokenIds = getTokenIdsInRange(container, fromId, toId);

  if (originalTokenIds.size === 0) {
    return [fromId, toId];
  }

  // 熟語の範囲マーク要素をチェックして、部分的に含まれる場合は全体を追加
  // 注意: 連鎖的な拡張を防ぐため、元のIDセットのみをチェックに使用
  const expandedTokenIds = new Set(originalTokenIds);
  const rangeElements = Array.from(
    container.querySelectorAll<HTMLElement>('[data-token-from][data-token-to]')
  );

  for (const el of rangeElements) {
    const tokenFrom = el.getAttribute('data-token-from');
    const tokenTo = el.getAttribute('data-token-to');

    if (!tokenFrom || !tokenTo) continue;

    // 元の選択範囲に含まれる場合のみ、熟語全体を追加（連鎖防止）
    if (originalTokenIds.has(tokenFrom) || originalTokenIds.has(tokenTo)) {
      expandedTokenIds.add(tokenFrom);
      expandedTokenIds.add(tokenTo);
    }
  }

  // 正規化されたトークンIDセットから、DOM順で最初と最後のIDを取得
  const orderedIds = getOrderedTokenIds(container);
  let normalizedFromIndex = Infinity;
  let normalizedToIndex = -1;

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id && expandedTokenIds.has(id)) {
      if (i < normalizedFromIndex) normalizedFromIndex = i;
      if (i > normalizedToIndex) normalizedToIndex = i;
    }
  }

  const normalizedFromId = orderedIds[normalizedFromIndex] ?? fromId;
  const normalizedToId = orderedIds[normalizedToIndex] ?? toId;

  return [normalizedFromId, normalizedToId];
}

// ============================================================================
// Main API
// ============================================================================

/**
 * プレビューコンテナにインタラクティブイベントハンドラを設定
 *
 * @remarks
 * このAPIはDOM APIを使用するため、ブラウザ環境専用です。
 * Node.js環境では使用できません。
 *
 * @param container レンダリング結果を含むHTML要素
 * @param callbacks イベントコールバック
 * @returns cleanup関数（イベントリスナーを削除）
 *
 * @example
 * ```typescript
 * const cleanup = attachInteractiveHandlers(container, {
 *   onTokenClick: (tokenId, event) => {
 *     console.log('Clicked:', tokenId);
 *   },
 *   onTokenSelect: (from, to) => {
 *     console.log('Selected:', from, 'to', to);
 *   },
 * });
 *
 * // クリーンアップ
 * cleanup();
 * ```
 */
export function attachInteractiveHandlers(
  container: HTMLElement,
  callbacks: InteractiveCallbacks
): () => void {
  const state: SelectionState = {
    isDragging: false,
    startTokenId: null,
    startPosition: null,
    currentEndTokenId: null,
    lastSelectedTokenId: null,
  };

  // 書字方向の判定
  const isVertical = isVerticalWritingMode(container);

  /**
   * マウスダウン: ドラッグ開始またはShift+クリックによる範囲選択
   */
  const handleMouseDown = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    const mousePos = { x: event.clientX, y: event.clientY };
    const tokenId = getTokenIdFromElement(target, mousePos, isVertical);

    if (!tokenId) {
      // トークン以外の場所をクリックした場合は選択をクリア
      clearSelectionClasses(container);
      state.lastSelectedTokenId = null;
      callbacks.onEmptyClick?.(event);
      return;
    }

    // Shift+クリック: 前回選択したトークンからの範囲選択
    if (event.shiftKey && state.lastSelectedTokenId) {
      event.preventDefault();
      clearSelectionClasses(container);

      // 選択範囲を正規化（熟語が部分的に含まれる場合は熟語全体を含める）
      const [normalizedFrom, normalizedTo] = normalizeSelectionRange(
        container,
        state.lastSelectedTokenId,
        tokenId
      );

      // 範囲選択のコールバックを呼び出し
      callbacks.onTokenSelect?.(normalizedFrom, normalizedTo);

      // lastSelectedTokenIdは更新しない（連続してShift+クリックで範囲を調整できるように）
      return;
    }

    // 選択クラスをクリア
    clearSelectionClasses(container);

    state.isDragging = true;
    state.startTokenId = tokenId;
    state.startPosition = { x: event.clientX, y: event.clientY };
    state.currentEndTokenId = tokenId;

    // 開始点に選択クラスを追加
    applySelectionClasses(container, tokenId, tokenId);
  };

  /**
   * マウス移動: ドラッグ中の選択範囲更新
   */
  const handleMouseMove = (event: MouseEvent): void => {
    if (!state.isDragging || !state.startTokenId) return;

    const target = event.target as Element | null;
    const mousePos = { x: event.clientX, y: event.clientY };
    const currentTokenId = getTokenIdFromElement(target, mousePos, isVertical);

    if (!currentTokenId || currentTokenId === state.currentEndTokenId) return;

    state.currentEndTokenId = currentTokenId;

    // 選択クラスを更新
    clearSelectionClasses(container);
    applySelectionClasses(container, state.startTokenId, currentTokenId);
  };

  /**
   * マウスアップ: ドラッグ終了
   */
  const handleMouseUp = (event: MouseEvent): void => {
    if (!state.isDragging || !state.startTokenId) {
      state.isDragging = false;
      return;
    }

    const target = event.target as Element | null;
    const mousePos = { x: event.clientX, y: event.clientY };
    const endTokenId =
      getTokenIdFromElement(target, mousePos, isVertical) ?? state.currentEndTokenId;

    if (!endTokenId) {
      state.isDragging = false;
      state.startTokenId = null;
      state.startPosition = null;
      state.currentEndTokenId = null;
      return;
    }

    const endPosition = { x: event.clientX, y: event.clientY };

    // コールバックが例外を投げても必ず状態をリセットする
    try {
      // 選択クラスをクリア（コールバック側で制御するため）
      clearSelectionClasses(container);

      // ドラッグ方向を判定して正規化
      let fromId = state.startTokenId;
      let toId = endTokenId;

      if (state.startPosition) {
        const comparison = comparePositions(state.startPosition, endPosition, isVertical);
        if (comparison > 0) {
          // 逆方向にドラッグされた場合はswap
          [fromId, toId] = [toId, fromId];
        }
      }

      // 選択範囲を正規化（熟語が部分的に含まれる場合は熟語全体を含める）
      const [normalizedFrom, normalizedTo] = normalizeSelectionRange(container, fromId, toId);

      // コールバック呼び出し
      if (normalizedFrom === normalizedTo) {
        // 単一クリック（熟語の一部をクリックしても単一トークンとして扱う）
        callbacks.onTokenClick?.(normalizedFrom, event);
        // 単一選択の場合、Shift+クリックの起点として記録
        state.lastSelectedTokenId = normalizedFrom;
      } else {
        // 範囲選択
        callbacks.onTokenSelect?.(normalizedFrom, normalizedTo);
        // 範囲選択の場合、終点をShift+クリックの起点として記録
        state.lastSelectedTokenId = normalizedTo;
      }
    } finally {
      // 状態リセット
      state.isDragging = false;
      state.startTokenId = null;
      state.startPosition = null;
      state.currentEndTokenId = null;
    }
  };

  /**
   * マウスリーブ: コンテナ外に出た場合の処理
   */
  const handleMouseLeave = (_event: MouseEvent): void => {
    if (state.isDragging) {
      // ドラッグ中にコンテナ外に出た場合は選択状態をクリア
      clearSelectionClasses(container);
    }
  };

  /**
   * クリック: 単純クリック（ドラッグなし）の処理
   * マウスアップと重複しないようにドラッグ判定
   */
  const handleClick = (_event: MouseEvent): void => {
    // マウスダウン → マウスアップ で既に処理されるため、
    // ここでは何もしない（ドラッグなしクリックもマウスアップで処理）
  };

  // イベントリスナーを登録（イベントデリゲーション）
  container.addEventListener('mousedown', handleMouseDown);
  container.addEventListener('mousemove', handleMouseMove);
  container.addEventListener('mouseup', handleMouseUp);
  container.addEventListener('mouseleave', handleMouseLeave);
  container.addEventListener('click', handleClick);

  // cleanup関数を返す
  return () => {
    container.removeEventListener('mousedown', handleMouseDown);
    container.removeEventListener('mousemove', handleMouseMove);
    container.removeEventListener('mouseup', handleMouseUp);
    container.removeEventListener('mouseleave', handleMouseLeave);
    container.removeEventListener('click', handleClick);
  };
}

/**
 * 選択状態のCSSクラスを手動で設定するユーティリティ
 *
 * コールバック側で選択状態を維持したい場合に使用
 *
 * @remarks
 * ブラウザ環境専用API
 */
export function setSelectionClasses(
  container: HTMLElement,
  fromTokenId: string,
  toTokenId: string
): void {
  clearSelectionClasses(container);
  applySelectionClasses(container, fromTokenId, toTokenId);
}

/**
 * 選択状態のCSSクラスをすべてクリアするユーティリティ
 *
 * @remarks
 * ブラウザ環境専用API
 */
export function clearSelection(container: HTMLElement): void {
  clearSelectionClasses(container);
}

/**
 * 単一トークンを選択状態にするユーティリティ
 *
 * @remarks
 * ブラウザ環境専用API
 */
export function selectToken(container: HTMLElement, tokenId: string): void {
  clearSelectionClasses(container);
  applySelectionClasses(container, tokenId, tokenId);
}

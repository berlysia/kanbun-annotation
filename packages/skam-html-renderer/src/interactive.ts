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
}

// ============================================================================
// CSS Class Constants
// ============================================================================

const SELECTION_CLASSES = {
  selected: 'skam-selected',
  start: 'skam-selection-start',
  end: 'skam-selection-end',
  middle: 'skam-selection-middle',
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
  isVertical?: boolean
): string | null {
  if (!element) return null;

  // data-token-id を持つ要素を探す（自身または祖先）
  const tokenElement = element.closest('[data-token-id]');
  if (tokenElement) {
    return tokenElement.getAttribute('data-token-id');
  }

  // 範囲マーク（data-token-from/to）の場合
  const rangeElement = element.closest('[data-token-from]');
  if (rangeElement) {
    const fromId = rangeElement.getAttribute('data-token-from');
    const toId = rangeElement.getAttribute('data-token-to');

    // マウス位置がない場合、または from/to が同じ場合は from を返す
    if (!mousePosition || !toId || fromId === toId) {
      return fromId;
    }

    // マウス位置と要素の中心点を比較して、from か to を返す
    const rect = rangeElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (isVertical) {
      // 縦書き: マウスが中心より上なら from、下なら to
      return mousePosition.y < centerY ? fromId : toId;
    } else {
      // 横書き: マウスが中心より左なら from、右なら to
      return mousePosition.x < centerX ? fromId : toId;
    }
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
 * 選択されたトークン要素を順序付きで取得
 */
function getTokenElementsInRange(
  container: HTMLElement,
  fromId: string,
  toId: string
): HTMLElement[] {
  const allTokens = getAllTokenElements(container);

  // fromId と toId のインデックスを見つける
  let fromIndex = -1;
  let toIndex = -1;

  for (let i = 0; i < allTokens.length; i++) {
    const el = allTokens[i]!;
    const tokenId = el.getAttribute('data-token-id') ?? el.getAttribute('data-token-from');
    if (tokenId === fromId) {
      fromIndex = i;
    }
    if (tokenId === toId) {
      toIndex = i;
    }
  }

  if (fromIndex === -1 || toIndex === -1) {
    return [];
  }

  // 順序を正規化
  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);

  return allTokens.slice(startIndex, endIndex + 1);
}

/**
 * 選択状態のCSSクラスをすべて削除
 */
function clearSelectionClasses(container: HTMLElement): void {
  const allTokens = getAllTokenElements(container);
  for (const el of allTokens) {
    el.classList.remove(
      SELECTION_CLASSES.selected,
      SELECTION_CLASSES.start,
      SELECTION_CLASSES.end,
      SELECTION_CLASSES.middle
    );
  }
}

/**
 * 選択状態のCSSクラスを適用
 */
function applySelectionClasses(container: HTMLElement, fromId: string, toId: string): void {
  const elements = getTokenElementsInRange(container, fromId, toId);

  if (elements.length === 0) return;

  if (elements.length === 1) {
    // 単一選択
    elements[0]!.classList.add(SELECTION_CLASSES.selected);
  } else {
    // 範囲選択
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]!;
      if (i === 0) {
        el.classList.add(SELECTION_CLASSES.start);
      } else if (i === elements.length - 1) {
        el.classList.add(SELECTION_CLASSES.end);
      } else {
        el.classList.add(SELECTION_CLASSES.middle);
      }
    }
  }
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
  };

  // 書字方向の判定
  const isVertical = isVerticalWritingMode(container);

  /**
   * マウスダウン: ドラッグ開始
   */
  const handleMouseDown = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    const mousePos = { x: event.clientX, y: event.clientY };
    const tokenId = getTokenIdFromElement(target, mousePos, isVertical);

    if (!tokenId) {
      // トークン以外の場所をクリックした場合は選択をクリア
      clearSelectionClasses(container);
      callbacks.onEmptyClick?.(event);
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
    const endTokenId = getTokenIdFromElement(target, mousePos, isVertical) ?? state.currentEndTokenId;

    if (!endTokenId) {
      state.isDragging = false;
      state.startTokenId = null;
      state.startPosition = null;
      state.currentEndTokenId = null;
      return;
    }

    const endPosition = { x: event.clientX, y: event.clientY };

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

    // コールバック呼び出し
    if (fromId === toId) {
      // 単一クリック
      callbacks.onTokenClick?.(fromId, event);
    } else {
      // 範囲選択
      callbacks.onTokenSelect?.(fromId, toId);
    }

    // 状態リセット
    state.isDragging = false;
    state.startTokenId = null;
    state.startPosition = null;
    state.currentEndTokenId = null;
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

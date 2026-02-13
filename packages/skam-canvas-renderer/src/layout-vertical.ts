/**
 * 縦書き単一列レイアウト — 2行×n列グリッドモデル
 *
 * HTML renderer では suffix-row と ruby-grid が別のインライン要素として
 * 異なる垂直位置に配置されるため重なりが生じない。
 * Canvas では同一空間に描画するため、base の左右に分離配置して重なりを回避する。
 *
 * 2行×n列グリッド:
 *
 *   Base row:    [saidoku yomi(R?)] [base(1/2)] [base(2/2)] [yomigana(R?)]
 *   Suffix row:  [saidoku okuri(R?)] [kaeri]    [kutoten]   [okuri/soegana(R?)]
 *
 *   R = rubyFontSize, F = fontSize
 *   [] 列: その文字/熟語単位で空なら詰めてよい
 *   () 列: emphasis/highlight は範囲全体で一貫させる（将来対応）
 *   base の中心が全要素のアライメント基準軸 (baseCenterX)
 *
 * グリッド幅（hasSuffix=true 時）:
 *   saidokuWidth = hasSaidoku ? R : 0
 *   rightColumnWidth = hasRightColumn ? R : 0
 *   columnWidth = saidokuWidth + F + rightColumnWidth
 *   baseCenterX = saidokuWidth + F/2
 *
 * 各スロット位置（baseCenterX 基準の対称配置）:
 *   saidoku2X = columnX + saidokuWidth/2              ← 左列中心
 *   kaeriX    = columnX + saidokuWidth + F/4           ← base 左半分中心
 *   kutotenX  = columnX + saidokuWidth + 3F/4          ← base 右半分中心
 *   suffixX   = columnX + saidokuWidth + F + R/2       ← 右列中心
 *
 * kaeri は suffix row（base の直下、y = tokenY + fontSize）に配置。
 * kutoten も suffix row（y = tokenY + fontSize）、base 右半分中心に配置。
 *
 * 列方向: 右→左（block[0] が右端）。各ブロックが独立カラムとなる。
 * 列内: 上→下。
 */

import type { HighlightStyle } from '@kanbun/skam';
import type {
  CanvasRenderTree,
  CanvasTokenNode,
  CanvasTatetenSeparator,
  CanvasBlockChild,
  CanvasBlockNode,
  BlockLayoutFlags,
  DocumentLayout,
  ColumnLayout,
  ColumnChild,
  TokenLayout,
  TokenSlots,
  TatetenSeparatorLayout,
  HighlightLineLayout,
  ResolvedSlotLayouts,
  ResolvedOptions,
  SlotLayout,
} from './types.js';
import type { TextMeasurer } from './measure.js';
import { shouldApplyTateChuYoko } from './draw-text.js';

/** ルビフォント文字列を生成 */
function rubyFont(options: ResolvedOptions): string {
  return `${Math.round(options.fontSize * options.rubyRatio)}px ${options.fontFamily}`;
}

/** テキストの幅を計測。未定義なら 0。 */
function measureTextWidth(text: string | undefined, font: string, measurer: TextMeasurer): number {
  if (!text) return 0;
  return measurer.measure(text, font).width;
}

/** 全ブロックからトークンをフラットに収集（tateten/highlight グループ内も含む） */
function collectAllTokens(tree: CanvasRenderTree): CanvasTokenNode[] {
  const tokens: CanvasTokenNode[] = [];
  for (const block of tree.blocks) {
    for (const child of block.children) {
      collectTokensFromChild(child, tokens);
    }
  }
  return tokens;
}

function collectTokensFromChild(child: CanvasBlockChild, tokens: CanvasTokenNode[]): void {
  if (child.type === 'token') {
    tokens.push(child);
  } else if (child.type === 'tateten-group') {
    for (const groupChild of child.children) {
      if (groupChild.type === 'token') {
        tokens.push(groupChild);
      }
    }
  } else {
    // highlight-group
    for (const hlChild of child.children) {
      if (hlChild.type === 'token') {
        tokens.push(hlChild);
      } else {
        // tateten-group inside highlight
        for (const tc of hlChild.children) {
          if (tc.type === 'token') {
            tokens.push(tc);
          }
        }
      }
    }
  }
}

/** 単一ブロックからトークンを収集 */
function collectBlockTokens(block: CanvasBlockNode): CanvasTokenNode[] {
  const tokens: CanvasTokenNode[] = [];
  for (const child of block.children) {
    collectTokensFromChild(child, tokens);
  }
  return tokens;
}

/** 列幅・ベース中心位置・右側追加幅を算出 */
interface ColumnDimensions {
  columnWidth: number;
  baseCenterX: number;
  extraRightWidth: number;
  fullColumnWidth: number; // columnWidth + extraRightWidth
}

/**
 * BlockLayoutFlags と ruby 情報から列の幅・配置を計算。
 * uniform モードではドキュメント全体の OR フラグ、
 * adaptive モードではブロック単位のフラグを渡す。
 */
function computeColumnDimensions(
  flags: BlockLayoutFlags,
  fontSize: number,
  rubyFontSize: number,
  maxRubyWidth: number,
  highlightGap: number
): ColumnDimensions {
  let columnWidth: number;
  let baseCenterX: number;

  if (flags.hasSuffix) {
    const saidokuWidth = flags.hasSaidoku ? rubyFontSize : 0;
    const rightColumnWidth = flags.hasRightColumn ? rubyFontSize : 0;
    columnWidth = saidokuWidth + fontSize + rightColumnWidth;
    baseCenterX = saidokuWidth + fontSize / 2;
  } else if (maxRubyWidth > 0) {
    columnWidth = fontSize + maxRubyWidth;
    baseCenterX = fontSize / 2;
  } else {
    columnWidth = fontSize;
    baseCenterX = fontSize / 2;
  }

  // emphasis/highlight による列右側の追加幅
  let extraRightWidth: number;
  if (flags.hasHighlight && flags.hasEmphasis) {
    extraRightWidth = 2 * highlightGap + Math.ceil(rubyFontSize / 2);
  } else if (flags.hasHighlight) {
    extraRightWidth = highlightGap;
  } else if (flags.hasEmphasis) {
    // emphasis 右端 = baseCenterX + fontSize/2 + rubyFontSize
    // columnWidth 端 = baseCenterX + fontSize/2 (+rightColumnWidth)
    // hasRightColumn 時は columnWidth に含まれるが、!hasRightColumn 時は rubyFontSize 分が必要
    extraRightWidth = rubyFontSize;
  } else {
    extraRightWidth = 0;
  }

  return {
    columnWidth,
    baseCenterX,
    extraRightWidth,
    fullColumnWidth: columnWidth + extraRightWidth,
  };
}

/** 事前計算済みグリッド列位置（絶対 X 座標） */
interface GridColumns {
  suffixX: number; // ruby, okuri, soegana
  kaeriX: number; // 返り点
  saidoku2X: number; // 再読2回目
  kutotenX: number; // 句読点
}

/** hasSuffix に応じた列位置を事前計算 */
function computeGridColumns(
  columnX: number,
  columnWidth: number,
  fontSize: number,
  rubyFontSize: number,
  hasSuffix: boolean,
  hasSaidoku: boolean,
  baseCenterX: number
): GridColumns {
  if (hasSuffix) {
    const saidokuWidth = hasSaidoku ? rubyFontSize : 0;
    const baseLeft = columnX + saidokuWidth;

    // base 中心基準の対称配置
    const kaeriX = baseLeft + fontSize / 4;
    const kutotenX = baseLeft + (3 * fontSize) / 4;
    const saidoku2X = columnX + saidokuWidth / 2;
    const suffixX = baseLeft + fontSize + rubyFontSize / 2;

    return { suffixX, kaeriX, saidoku2X, kutotenX };
  }
  // hasSuffix=false: kaeri/kutoten/saidoku スロットは存在しないため
  // kaeriX/saidoku2X/kutotenX は参照されない
  const suffixBaseX = columnX + baseCenterX + fontSize / 2;
  return {
    suffixX: suffixBaseX,
    kaeriX: 0,
    saidoku2X: 0,
    kutotenX: 0,
  };
}

interface LayoutContext {
  fontSize: number;
  rubyFontSize: number;
  cellAdvance: number;
  grid: GridColumns;
  /** highlight-group 内でのみ設定: emphasis を highlight 線の外側に配置 */
  emphasisOverrideX?: number;
}

/**
 * 単一トークンのスロットレイアウトを計算。
 * hasSuffix の分岐は GridColumns に吸収済み。
 */
function layoutSingleToken(
  tokenNode: CanvasTokenNode,
  tokenX: number,
  tokenY: number,
  lctx: LayoutContext
): TokenLayout {
  const { slots } = tokenNode;
  const { fontSize, rubyFontSize, cellAdvance, grid } = lctx;
  const slotLayouts: ResolvedSlotLayouts = {};

  if (slots.ruby) {
    let rubyY = tokenY;
    if (slots.rubySpan && slots.rubySpan > 1) {
      const spanHeight = slots.rubySpan * cellAdvance;
      const rubyTextHeight = [...slots.ruby].length * rubyFontSize;
      rubyY = tokenY + (spanHeight - rubyTextHeight) / 2;
    }
    slotLayouts.ruby = { text: slots.ruby, x: grid.suffixX, y: rubyY, fontSize: rubyFontSize };
  }

  if (slots.okuri) {
    const rubyChars = slots.ruby ? [...slots.ruby].length : 0;
    const okuriStartY = tokenY + Math.max(fontSize, rubyChars * rubyFontSize);
    slotLayouts.okuri = {
      text: slots.okuri,
      x: grid.suffixX,
      y: okuriStartY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.soegana) {
    const rubyChars = slots.ruby ? [...slots.ruby].length : 0;
    const okuriChars = slots.okuri ? [...slots.okuri].length : 0;
    const soeganaStartY =
      tokenY + Math.max(fontSize, rubyChars * rubyFontSize) + okuriChars * rubyFontSize;
    slotLayouts.soegana = {
      text: slots.soegana,
      x: grid.suffixX,
      y: soeganaStartY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.kutoten) {
    slotLayouts.kutoten = { text: slots.kutoten, x: grid.kutotenX, y: tokenY + fontSize, fontSize };
  }

  if (slots.kaeri) {
    slotLayouts.kaeri = {
      text: slots.kaeri,
      x: grid.kaeriX,
      y: tokenY + fontSize,
      fontSize: rubyFontSize,
    };
  }

  if (slots.emphasis) {
    // per-token emphasis 位置計算:
    // highlight-group, tateten-group 内: emphasisOverrideX（highlight 線の外側）
    // ruby あり: suffixX + rubyFontSize/2 * 2（ruby の右側）
    // ruby なし: tokenX + fontSize/2 + rubyFontSize/2（ベース文字右端の外側）
    //
    // HTML版では text-emphasis-position: right でブラウザが文字セル外側に配置する。
    // Canvas版では rubyFontSize/2 のオフセットで傍点がbaseに食い込むのを防止。
    let emphasisX: number;
    if (lctx.emphasisOverrideX !== undefined) {
      emphasisX = lctx.emphasisOverrideX;
    } else if (slots.ruby) {
      emphasisX = grid.suffixX + rubyFontSize;
    } else {
      emphasisX = tokenX + fontSize / 2 + rubyFontSize / 2;
    }
    slotLayouts.emphasis = {
      text: slots.emphasis,
      x: emphasisX,
      y: tokenY + (fontSize - rubyFontSize) / 2,
      fontSize: rubyFontSize,
    };
  }

  if (slots.saidokuUnder) {
    slotLayouts.saidokuUnder = {
      text: slots.saidokuUnder,
      x: grid.saidoku2X,
      y: tokenY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.saidokuOkuri2) {
    const underChars = slots.saidokuUnder ? [...slots.saidokuUnder].length : 0;
    const saidokuOkuri2StartY = tokenY + Math.max(fontSize, underChars * rubyFontSize);
    slotLayouts.saidokuOkuri2 = {
      text: slots.saidokuOkuri2,
      x: grid.saidoku2X,
      y: saidokuOkuri2StartY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.ref) {
    const isTCY = shouldApplyTateChuYoko(slots.ref);
    // 縦中横: 1行分の高さ。通常: 文字数分の高さ。
    const refHeight = isTCY ? rubyFontSize : [...slots.ref].length * rubyFontSize;
    slotLayouts.ref = {
      text: slots.ref,
      x: tokenX,
      y: tokenY - refHeight,
      fontSize: rubyFontSize,
      ...(isTCY ? { tateChuYoko: true } : {}),
    };
  }

  return {
    type: 'token' as const,
    tokenId: tokenNode.token.id,
    x: tokenX,
    y: tokenY,
    baseChar: tokenNode.token.text,
    slots: slotLayouts,
  };
}

/**
 * トークンの垂直コンテンツ高さを計算。
 * tokenY からコンテンツ最下端までの距離。
 *
 * Suffix row（kaeri/kutoten）は除外:
 * - kaeri は cellAdvance にちょうど収まる
 * - kutoten は現行コードで既に 12px 超過しているが視覚的問題なし
 * - overflow の原因は右列/左列の積み上げ高さのみ
 */
function computeTokenContentHeight(
  slots: TokenSlots,
  fontSize: number,
  rubyFontSize: number
): number {
  const R = rubyFontSize;

  // rubySpan > 1 の場合、ruby は複数セルに分散 → 単一セルの高さに含めない
  const rubyChars =
    slots.rubySpan && slots.rubySpan > 1 ? 0 : slots.ruby ? [...slots.ruby].length : 0;
  const okuriChars = slots.okuri ? [...slots.okuri].length : 0;
  const soeganaChars = slots.soegana ? [...slots.soegana].length : 0;
  const saidokuUnderChars = slots.saidokuUnder ? [...slots.saidokuUnder].length : 0;
  const saidokuOkuri2Chars = slots.saidokuOkuri2 ? [...slots.saidokuOkuri2].length : 0;

  // tokenY からの最大延伸量
  let maxExtent = fontSize; // ベース文字高さ

  // 右列: ruby → okuri → soegana（縦に積み上げ）
  const rightExtent = Math.max(fontSize, rubyChars * R) + okuriChars * R + soeganaChars * R;
  maxExtent = Math.max(maxExtent, rightExtent);

  // 左列: saidokuUnder → saidokuOkuri2
  if (saidokuUnderChars > 0 || saidokuOkuri2Chars > 0) {
    const leftExtent = Math.max(fontSize, saidokuUnderChars * R) + saidokuOkuri2Chars * R;
    maxExtent = Math.max(maxExtent, leftExtent);
  }

  return maxExtent;
}

/**
 * 縦書き単一列レイアウト
 */
export function layoutVertical(
  tree: CanvasRenderTree,
  measurer: TextMeasurer,
  options: ResolvedOptions
): DocumentLayout {
  const { fontSize, padding, lineHeight } = options;
  const rFont = rubyFont(options);
  const rubyFontSize = Math.round(fontSize * options.rubyRatio);
  // CSS 縦書きでは line-height は列間（block方向=横方向）に影響し、
  // 文字間（inline方向=縦方向）には影響しない。cellAdvance は fontSize そのもの。
  const cellAdvance = fontSize;
  // HTML版の tateten-sep は inline-grid で ruby-ratio * 1em 相当の高さ。
  // rubyFontSize (= rubyRatio * fontSize) に合わせてコンパクトにする。
  const separatorAdvance = rubyFontSize;

  // (slotGap は廃止: HTML の ruby-grid に対応する gap はない)

  // 全トークンをフラットに収集（統計用）
  const allTokens = collectAllTokens(tree);

  if (allTokens.length === 0) {
    return {
      width: padding.left + padding.right,
      height: padding.top + padding.bottom,
      columns: [],
    };
  }

  // ドキュメント全体のフラグ（uniform モード用、Pass 1 で事前計算済み）
  const documentFlags: BlockLayoutFlags = {
    hasSuffix: tree.hasSuffix,
    hasSaidoku: tree.hasSaidoku,
    hasRightColumn: tree.hasRightColumn,
    hasEmphasis: tree.hasEmphasis,
    hasHighlight: tree.hasHighlight,
  };

  const columnY = padding.top;
  const highlightGap = 2;
  const isAdaptive = options.columnSizing === 'adaptive';
  const numBlocks = tree.blocks.length;

  // --- Dimensions 計算: uniform vs adaptive ---
  let blockDimsArray: ColumnDimensions[];

  if (isAdaptive) {
    // adaptive: ブロックごとにフラグと maxRubyWidth から dims を計算
    blockDimsArray = tree.blocks.map((block) => {
      const blockTokens = collectBlockTokens(block);
      let blockMaxRubyWidth = 0;
      for (const t of blockTokens) {
        const w = measureTextWidth(t.slots.ruby, rFont, measurer);
        if (w > blockMaxRubyWidth) blockMaxRubyWidth = w;
      }
      return computeColumnDimensions(
        block.flags,
        fontSize,
        rubyFontSize,
        blockMaxRubyWidth,
        highlightGap
      );
    });
  } else {
    // uniform: ドキュメント全体フラグで統一 dims
    let maxRubyWidth = 0;
    for (const tokenNode of allTokens) {
      const rubyW = measureTextWidth(tokenNode.slots.ruby, rFont, measurer);
      if (rubyW > maxRubyWidth) maxRubyWidth = rubyW;
    }
    const uniformDims = computeColumnDimensions(
      documentFlags,
      fontSize,
      rubyFontSize,
      maxRubyWidth,
      highlightGap
    );
    blockDimsArray = tree.blocks.map(() => uniformDims);
  }

  // --- ブロック X 座標計算: 右→左配置 (block[0] が右端) ---
  const blockColumnXs: number[] = Array.from({ length: numBlocks });
  if (isAdaptive) {
    // adaptive: ブロックごとの fullColumnWidth を右から左へ累積
    let curX = padding.left;
    for (let i = numBlocks - 1; i >= 0; i--) {
      blockColumnXs[i] = curX;
      if (i > 0) curX += blockDimsArray[i]!.fullColumnWidth + options.columnGap;
    }
  } else {
    // uniform: 等間隔
    const uniformFullWidth = blockDimsArray[0]!.fullColumnWidth;
    for (let i = 0; i < numBlocks; i++) {
      blockColumnXs[i] =
        padding.left + (numBlocks - 1 - i) * (uniformFullWidth + options.columnGap);
    }
  }

  // uniform 用: ドキュメント全体の maxRubyWidth を事前計算（highlight rightAdjust で使用）
  let docMaxRubyWidth = 0;
  if (!isAdaptive) {
    for (const tokenNode of allTokens) {
      const rubyW = measureTextWidth(tokenNode.slots.ruby, rFont, measurer);
      if (rubyW > docMaxRubyWidth) docMaxRubyWidth = rubyW;
    }
  }

  // --- ブロックごとにカラムを作成 ---
  const columns: ColumnLayout[] = [];

  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    const block = tree.blocks[blockIdx]!;
    const blockDims = blockDimsArray[blockIdx]!;
    const blockColumnX = blockColumnXs[blockIdx]!;
    const { columnWidth: blockColumnWidth, baseCenterX: blockBaseCenterX } = blockDims;

    // adaptive: ブロック単位フラグ、uniform: ドキュメント全体フラグ
    const effectiveFlags = isAdaptive ? block.flags : documentFlags;

    const grid = computeGridColumns(
      blockColumnX,
      blockColumnWidth,
      fontSize,
      rubyFontSize,
      effectiveFlags.hasSuffix,
      effectiveFlags.hasSaidoku,
      blockBaseCenterX
    );
    const blockLctx: LayoutContext = { fontSize, rubyFontSize, cellAdvance, grid };

    const columnChildren: ColumnChild[] = [];
    const highlightLines: HighlightLineLayout[] = [];
    let yOffset = 0;
    const highlightLineX = blockColumnX + blockColumnWidth + highlightGap;

    // highlight rightAdjust 用の maxRubyWidth（モードで使い分け）
    let effectiveMaxRubyWidth: number;
    if (isAdaptive) {
      effectiveMaxRubyWidth = 0;
      const blockTokens = collectBlockTokens(block);
      for (const t of blockTokens) {
        const w = measureTextWidth(t.slots.ruby, rFont, measurer);
        if (w > effectiveMaxRubyWidth) effectiveMaxRubyWidth = w;
      }
    } else {
      effectiveMaxRubyWidth = docMaxRubyWidth;
    }

    /** tateten グループの children をレイアウト */
    function layoutTatetenChildren(
      children: (CanvasTokenNode | CanvasTatetenSeparator)[],
      lctx: LayoutContext = blockLctx
    ): void {
      // tateten グループ内の range ruby は先頭トークンにのみ slots.ruby が設定される。
      // 2文字目以降も ruby 列分の空きを確保するため、グループ内に ruby があれば
      // 全トークンの emphasis を ruby-aware 位置に統一する。
      if (lctx.emphasisOverrideX === undefined) {
        const groupHasRuby = children.some((c) => c.type === 'token' && c.slots.ruby);
        if (groupHasRuby) {
          lctx = {
            ...lctx,
            emphasisOverrideX: grid.suffixX + rubyFontSize,
          };
        }
      }

      for (const groupChild of children) {
        if (groupChild.type === 'token') {
          const tokenX = blockColumnX + blockBaseCenterX;
          const tokenY = columnY + yOffset;
          columnChildren.push(layoutSingleToken(groupChild, tokenX, tokenY, lctx));
          const contentHeight = computeTokenContentHeight(groupChild.slots, fontSize, rubyFontSize);
          yOffset += Math.max(fontSize, contentHeight);
        } else {
          // tateten-separator
          const sepX = blockColumnX + blockBaseCenterX;
          const sepY = columnY + yOffset;
          const sepLayout: TatetenSeparatorLayout = {
            type: 'tateten-separator',
            x: sepX,
            y: sepY,
            fontSize: rubyFontSize,
          };
          if (groupChild.kaeri) {
            const kaeriLayout: SlotLayout = {
              text: groupChild.kaeri,
              x: grid.kaeriX,
              y: sepY,
              fontSize: rubyFontSize,
            };
            sepLayout.kaeri = kaeriLayout;
          }
          columnChildren.push(sepLayout);
          yOffset += separatorAdvance;
        }
      }
    }

    // range ruby（rubySpan > 1）の2文字目以降を追跡。
    // 先頭トークンにのみ slots.ruby が設定されるため、後続トークンの emphasis 位置を
    // ruby 列分右にずらして被りを防止する。
    let rubySpanRemaining = 0;

    /** CanvasBlockChild を展開してレイアウトに追加 */
    function layoutBlockChild(child: CanvasBlockChild): void {
      if (child.type === 'token') {
        const tokenX = blockColumnX + blockBaseCenterX;
        const tokenY = columnY + yOffset;
        // range ruby の2文字目以降: ruby 列分の空きを確保するため emphasis を右にずらす
        const lctx =
          rubySpanRemaining > 0 && !child.slots.ruby && blockLctx.emphasisOverrideX === undefined
            ? { ...blockLctx, emphasisOverrideX: grid.suffixX + rubyFontSize }
            : blockLctx;
        columnChildren.push(layoutSingleToken(child, tokenX, tokenY, lctx));
        const contentHeight = computeTokenContentHeight(child.slots, fontSize, rubyFontSize);
        yOffset += Math.max(cellAdvance, contentHeight);
      } else if (child.type === 'tateten-group') {
        layoutTatetenChildren(child.children);
      } else {
        // highlight-group: track y range and layout children

        // グループ単位で仮名類（ruby/okuri/soegana）の有無を判定
        // ブロック全体の hasRightColumn が true でも、グループ内に仮名がなければ
        // highlight line をベース文字に近づける
        let groupHasRightColumn = false;
        for (const hlChild of child.children) {
          if (hlChild.type === 'token') {
            if (hlChild.slots.ruby || hlChild.slots.okuri || hlChild.slots.soegana) {
              groupHasRightColumn = true;
              break;
            }
          } else {
            for (const tc of hlChild.children) {
              if (tc.type === 'token' && (tc.slots.ruby || tc.slots.okuri || tc.slots.soegana)) {
                groupHasRightColumn = true;
              }
            }
            if (groupHasRightColumn) break;
          }
        }
        let rightAdjust = 0;
        if (effectiveFlags.hasSuffix && effectiveFlags.hasRightColumn && !groupHasRightColumn) {
          rightAdjust = rubyFontSize;
        } else if (!effectiveFlags.hasSuffix && effectiveMaxRubyWidth > 0 && !groupHasRightColumn) {
          rightAdjust = effectiveMaxRubyWidth;
        }
        const groupHighlightLineX = highlightLineX - rightAdjust;

        // ADR-015: emphasis+highlight 共存時、emphasis を highlight line の外側（右）に配置
        const hlLctx: LayoutContext = {
          ...blockLctx,
          emphasisOverrideX: groupHighlightLineX + highlightGap / 2 + rubyFontSize / 2,
        };
        const yStart = columnY + yOffset;
        for (const highlightChild of child.children) {
          if (highlightChild.type === 'token') {
            const tokenX = blockColumnX + blockBaseCenterX;
            const tokenY = columnY + yOffset;
            columnChildren.push(layoutSingleToken(highlightChild, tokenX, tokenY, hlLctx));
            const hlContentHeight = computeTokenContentHeight(
              highlightChild.slots,
              fontSize,
              rubyFontSize
            );
            yOffset += Math.max(cellAdvance, hlContentHeight);
          } else {
            // tateten-group inside highlight-group
            layoutTatetenChildren(highlightChild.children, hlLctx);
          }
        }
        const yEnd = columnY + yOffset;

        // highlight-ref: ラベルを highlight 線の開始位置（上端）に配置
        // HTML版: inset-inline-start: 0 (top: 0), inset-block-start: 0 (right: 0)
        // → X = 線と同じ位置、Y = グループ先頭（線の引き始め）
        let refLayout: SlotLayout | undefined;
        if (child.refLabel) {
          const isTCY = shouldApplyTateChuYoko(child.refLabel);
          refLayout = {
            text: child.refLabel,
            x: groupHighlightLineX + (rubyFontSize * 7) / 8,
            y: yStart,
            fontSize: rubyFontSize,
            ...(isTCY ? { tateChuYoko: true } : {}),
          };
        }

        highlightLines.push({
          style: child.highlightStyle as HighlightStyle,
          x: groupHighlightLineX,
          yStart,
          yEnd,
          ...(refLayout ? { refLayout } : {}),
        });
      }
    }

    for (const child of block.children) {
      if (child.type === 'token') {
        // range ruby の開始を検出
        if (child.slots.rubySpan && child.slots.rubySpan > 1) {
          rubySpanRemaining = child.slots.rubySpan - 1;
        }
      } else {
        // tateten-group/highlight-group は内部で独自に処理するためリセット
        rubySpanRemaining = 0;
      }

      layoutBlockChild(child);

      // range ruby の2文字目以降を消費
      if (child.type === 'token' && !child.slots.ruby && rubySpanRemaining > 0) {
        rubySpanRemaining--;
      }
    }

    columns.push({
      x: blockColumnX,
      y: columnY,
      width: blockColumnWidth,
      height: yOffset,
      children: columnChildren,
      ...(highlightLines.length > 0 ? { highlightLines } : {}),
    });
  }

  // totalWidth: adaptive ではブロックごとの fullColumnWidth を合計
  let totalWidth: number;
  if (isAdaptive) {
    totalWidth = 0;
    for (let i = 0; i < numBlocks; i++) {
      totalWidth += blockDimsArray[i]!.fullColumnWidth;
    }
    totalWidth += Math.max(0, numBlocks - 1) * options.columnGap;
  } else {
    totalWidth =
      numBlocks * blockDimsArray[0]!.fullColumnWidth +
      Math.max(0, numBlocks - 1) * options.columnGap;
  }
  const maxColumnHeight = Math.max(...columns.map((c) => c.height));

  return {
    width: padding.left + totalWidth + padding.right,
    height: padding.top + maxColumnHeight + padding.bottom,
    columns,
  };
}

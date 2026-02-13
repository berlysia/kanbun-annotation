/**
 * Analysis レイヤ — Pass 2 の前処理
 *
 * ドキュメント/ブロック単位の token 収集と maxRubyWidth 計測を一度だけ実施する。
 * BlockLayoutFlags は Pass 1 で計算済みのため、参照保持のみで再計算しない。
 */

import type {
  CanvasRenderTree,
  CanvasTokenNode,
  CanvasBlockChild,
  CanvasBlockNode,
  BlockLayoutFlags,
  DocumentAnalysis,
  BlockAnalysis,
  ResolvedOptions,
} from './types.js';
import type { TextMeasurer } from './measure.js';
import { rubyFont, measureTextWidth } from './layout-vertical.helpers.js';

/** CanvasBlockChild から token をフラットに収集（tateten/highlight グループ内も含む） */
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

/**
 * ドキュメント全体を分析し、ブロック単位の token 収集・maxRubyWidth 計測を行う。
 * BlockLayoutFlags は Pass 1 の値を参照保持する（再計算しない）。
 */
export function analyzeDocument(
  tree: CanvasRenderTree,
  measurer: TextMeasurer,
  options: ResolvedOptions
): DocumentAnalysis {
  const rFont = rubyFont(options);

  const documentFlags: BlockLayoutFlags = {
    hasSuffix: tree.hasSuffix,
    hasSaidoku: tree.hasSaidoku,
    hasRightColumn: tree.hasRightColumn,
    hasEmphasis: tree.hasEmphasis,
    hasHighlight: tree.hasHighlight,
    hasRefLabel: tree.hasRefLabel,
  };

  let documentMaxRubyWidth = 0;
  const blocks: BlockAnalysis[] = [];

  for (const block of tree.blocks) {
    const tokens = collectBlockTokens(block);
    let maxRubyWidth = 0;
    for (const t of tokens) {
      const w = measureTextWidth(t.slots.ruby, rFont, measurer);
      if (w > maxRubyWidth) maxRubyWidth = w;
    }
    if (maxRubyWidth > documentMaxRubyWidth) documentMaxRubyWidth = maxRubyWidth;

    blocks.push({
      block,
      tokens,
      maxRubyWidth,
      flags: block.flags,
    });
  }

  return {
    documentFlags,
    documentMaxRubyWidth,
    blocks,
  };
}

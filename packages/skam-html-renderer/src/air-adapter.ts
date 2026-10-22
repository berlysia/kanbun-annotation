/**
 * HTML AIR Adapter
 *
 * AIRDocument → BlockRenderTree[] 変換。
 * AIR の木 (字、区切り、ruby・竪点・傍線のグループ) はそのまま Pass 2 に渡し、
 * ブロックごとに 1 回だけ決める値 (blockStartHtml、blockHasRuby) をここで作る。
 * 注記は AIR の slot とノードだけから導き、文書の注記は引き直さない。
 */

import type { AIRBlock, AIRBlockChild, AIRDocument } from '@kanbun-skam/skam/rendering';

import type { BlockRenderTree } from './render-tree-types.js';
import { blankOut, escapeHtml, shouldApplyTateChuYoko } from './html-utils.js';

// ============================================================================
// Block-start HTML 生成
// ============================================================================

function buildBlockStartHtml(airBlock: AIRBlock, prefix: string): string {
  const parts: string[] = [];

  for (const ref of airBlock.blockStartRefs) {
    const halfWidthClass = shouldApplyTateChuYoko(ref.resolved) ? ` ${prefix}-ref--half-width` : '';
    parts.push(`<span class="${prefix}-ref${halfWidthClass}">${escapeHtml(ref.resolved)}</span>`);
  }

  for (const kutoten of airBlock.blockStartKutoten) {
    parts.push(
      kutoten.hidden
        ? `<span class="${prefix}-suffix-kutoten ${prefix}-quiz-hidden" aria-hidden="true">${blankOut(kutoten.value)}</span>`
        : `<span class="${prefix}-suffix-kutoten">${escapeHtml(kutoten.value)}</span>`
    );
  }

  return parts.join('');
}

// ============================================================================
// blockHasRuby 判定
// ============================================================================

/** ブロックの木に、読み・送り仮名・添え仮名を持つ字か ruby のグループがあるか */
function hasReading(children: readonly AIRBlockChild[]): boolean {
  for (const child of children) {
    switch (child.type) {
      case 'token':
        if (child.slots.ruby || child.slots.okuri || child.slots.soegana) return true;
        break;
      case 'tateten-separator':
        break;
      case 'ruby-group':
        return true;
      case 'tateten-group':
      case 'highlight-group':
        if (hasReading(child.children)) return true;
        break;
    }
  }
  return false;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * AIRDocument → BlockRenderTree[]
 */
export function convertAIRToBlockRenderTrees(air: AIRDocument, prefix: string): BlockRenderTree[] {
  return air.blocks.map((airBlock) => ({
    blockId: airBlock.blockId,
    blockStartHtml: buildBlockStartHtml(airBlock, prefix),
    items: airBlock.children,
    blockHasRuby: hasReading(airBlock.children),
  }));
}

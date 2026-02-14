/**
 * SKAM HTML Renderer - Display Layer Orchestration
 *
 * Group resolution + Pass 1/2 dispatch + block composition.
 * Reading layer and ref notes remain in the API layer (renderer.ts).
 */

import type { SKAMDocument, HighlightMark } from '@kanbun/skam';
import {
  resolveRefValues,
  getTatetenGroups,
  getRangeMarkGroups,
  getHighlightGroups,
  groupTokensByBlock,
} from '@kanbun/skam/rendering';
import type { RenderProfile, RubyMethod } from './render-config.js';
import { escapeHtml } from './html-utils.js';
import { buildBlockRenderTree, type BuildTreeContext } from './build-render-tree.js';
import { renderBlockTree, type RenderTreeContext } from './render-tree.js';

/**
 * Display層のHTMLを生成
 *
 * 2-pass アーキテクチャ:
 * Pass 1 (buildBlockRenderTree): tokens + marks → BlockRenderTree
 * Pass 2 (renderBlockTree): BlockRenderTree → HTML string
 *
 * @internal
 */
export function renderDisplayLayer(
  doc: SKAMDocument,
  prefix: string,
  profile: RenderProfile,
  inline: boolean,
  interactive: boolean,
  rubyMethod: RubyMethod = 'grid'
): { tokens: string; prefix: string } {
  const { tokens, marks } = doc;

  // Pre-computation
  const refValueMap = profile.ref ? resolveRefValues(tokens, marks) : new Map();
  const tatetenGroups = getTatetenGroups(tokens, marks);
  const highlightGroups = profile.highlight ? getHighlightGroups(tokens, marks) : new Map();

  const highlightRefIds = new Set<string>();
  if (profile.highlight) {
    const highlightMarks = marks.filter((m): m is HighlightMark => m.type === 'highlight');
    for (const highlight of highlightMarks) {
      if (highlight.ref) {
        highlightRefIds.add(highlight.ref);
      }
    }
  }

  const yomiganaRangeGroups = profile.yomigana
    ? getRangeMarkGroups(tokens, marks, 'yomigana')
    : new Map();
  const okuriganaRangeGroups = profile.okurigana
    ? getRangeMarkGroups(tokens, marks, 'okurigana')
    : new Map();
  const soeganaRangeGroups = profile.soegana
    ? getRangeMarkGroups(tokens, marks, 'soegana')
    : new Map();

  const buildCtx: BuildTreeContext = {
    prefix,
    profile,
    tokens,
    marks,
    refValueMap,
    highlightRefIds,
    tatetenGroups,
    highlightGroups,
    yomiganaRangeGroups,
    okuriganaRangeGroups,
    soeganaRangeGroups,
  };
  const renderCtx: RenderTreeContext = {
    prefix,
    profile,
    tokens,
    marks,
    interactive,
    rubyMethod,
    refValueMap,
    highlightRefIds,
  };

  const blockGroups = groupTokensByBlock(doc.blocks ?? [], tokens);
  const blockTag = inline ? 'span' : 'div';
  const renderedBlocks: string[] = [];

  for (const blockGroup of blockGroups) {
    const tree = buildBlockRenderTree(blockGroup.blockId, blockGroup.tokens, buildCtx);
    const blockContent = renderBlockTree(tree, renderCtx);

    if (blockGroup.blockId) {
      renderedBlocks.push(
        `<${blockTag} class="${prefix}-block" data-block-id="${escapeHtml(blockGroup.blockId)}">${blockContent}</${blockTag}>`
      );
    } else {
      renderedBlocks.push(blockContent);
    }
  }

  return { tokens: renderedBlocks.join(''), prefix };
}

/**
 * SKAM HTML Renderer - Display Layer Orchestration
 *
 * AIR 経由の 2-pass アーキテクチャ:
 * Pass 1: SKAMDocument → AIR → BlockRenderTree (via buildAnnotationIR + HTML Adapter)
 * Pass 2: BlockRenderTree → HTML string (via renderBlockTree)
 *
 * Reading layer and ref notes remain in the API layer (renderer.ts).
 */

import type { SKAMDocument, HighlightMark } from '@kanbun-skam/skam';
import { buildAnnotationIR, resolveRefValues } from '@kanbun-skam/skam/rendering';
import type { RenderProfile, RubyMethod } from './render-config.js';
import { escapeHtml } from './html-utils.js';
import { convertAIRToBlockRenderTrees } from './air-adapter.js';
import { renderBlockTree, type RenderTreeContext } from './render-tree.js';

/**
 * Display層のHTMLを生成
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

  // Pass 1: AIR 経由で BlockRenderTree を構築
  const air = buildAnnotationIR(doc, profile);
  const blockRenderTrees = convertAIRToBlockRenderTrees(air, prefix, tokens, marks);

  // Pass 2 用のコンテキスト
  const refValueMap = profile.ref ? resolveRefValues(tokens, marks) : new Map();
  const highlightRefIds = new Set<string>();
  if (profile.highlight) {
    const highlightMarks = marks.filter((m): m is HighlightMark => m.type === 'highlight');
    for (const highlight of highlightMarks) {
      if (highlight.ref) {
        highlightRefIds.add(highlight.ref);
      }
    }
  }

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

  const blockTag = inline ? 'span' : 'div';
  const renderedBlocks: string[] = [];

  for (const tree of blockRenderTrees) {
    const blockContent = renderBlockTree(tree, renderCtx);

    if (tree.blockId) {
      renderedBlocks.push(
        `<${blockTag} class="${prefix}-block" data-block-id="${escapeHtml(tree.blockId)}">${blockContent}</${blockTag}>`
      );
    } else {
      renderedBlocks.push(blockContent);
    }
  }

  return { tokens: renderedBlocks.join(''), prefix };
}

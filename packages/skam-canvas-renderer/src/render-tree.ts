/**
 * Pass 1: Resolve & Group
 *
 * SKAMDocument -> CanvasRenderTree
 * 全マークを解決済みスロットに格納し、後段で再解決不要にする。
 */

import type {
  SKAMDocument,
  Token,
  Block,
  Mark,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  SoeganaMark,
  KutotenMark,
} from '@kanbun/skam';
import { isPositionBasedMark } from '@kanbun/skam';
import type { CanvasRenderTree, CanvasBlockNode, CanvasTokenNode, TokenSlots } from './types.js';
import type { RenderProfile } from './profiles.js';
import { convertKaeriToUnicode } from './helpers.js';

/**
 * Token ごとのマークをマップに整理する。
 * Position-based marks は position.after の tokenId で紐付け。
 * Anchor-based marks は type に応じて from / to で紐付け。
 */
function resolveTokenMarks(
  tokenId: string,
  marks: Mark[],
): Map<Mark['type'], Mark[]> {
  const result = new Map<Mark['type'], Mark[]>();

  // yomigana は anchor.from で紐付け
  const startMarkTypes = new Set(['yomigana']);
  // okurigana, soegana は anchor.to で紐付け
  const endMarkTypes = new Set(['okurigana', 'soegana']);

  for (const mark of marks) {
    if (isPositionBasedMark(mark)) {
      // position-based: after が一致する場合のみ
      if ('after' in mark.position && mark.position.after === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
      continue;
    }

    // anchor-based
    if (startMarkTypes.has(mark.type)) {
      if (mark.anchor.from === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    } else if (endMarkTypes.has(mark.type)) {
      if (mark.anchor.to === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    } else {
      if (mark.anchor.from === tokenId || mark.anchor.to === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    }
  }

  return result;
}

/**
 * Token のスロットを解決する
 */
function resolveSlots(
  tokenId: string,
  marks: Mark[],
  profile: RenderProfile,
): TokenSlots {
  const tokenMarks = resolveTokenMarks(tokenId, marks);
  const slots: TokenSlots = {};

  // yomigana -> ruby
  if (profile.yomigana) {
    const yomiganaMarks = (tokenMarks.get('yomigana') ?? []) as YomiganaMark[];
    if (yomiganaMarks.length > 0) {
      slots.ruby = yomiganaMarks.map((m) => m.value).join('');
    }
  }

  // okurigana -> okuri
  if (profile.okurigana) {
    const okuriganaMarks = (tokenMarks.get('okurigana') ?? []) as OkuriganaMark[];
    if (okuriganaMarks.length > 0) {
      slots.okuri = okuriganaMarks.map((m) => m.value).join('');
    }
  }

  // soegana -> soegana
  if (profile.soegana) {
    const soeganaMarks = (tokenMarks.get('soegana') ?? []) as SoeganaMark[];
    if (soeganaMarks.length > 0) {
      slots.soegana = soeganaMarks.map((m) => m.value).join('');
    }
  }

  // kaeri -> kaeri (Unicode 変換済み)
  if (profile.kaeriten) {
    const kaeriMarks = (tokenMarks.get('kaeri') ?? []) as KaeriMark[];
    if (kaeriMarks.length > 0) {
      slots.kaeri = kaeriMarks.map((m) => convertKaeriToUnicode(m.value)).join('');
    }
  }

  // kutoten -> kutoten
  if (profile.kutoten) {
    const kutotenMarks = (tokenMarks.get('kutoten') ?? []) as KutotenMark[];
    if (kutotenMarks.length > 0) {
      slots.kutoten = kutotenMarks.map((m) => m.value).join('');
    }
  }

  return slots;
}

/**
 * Token をブロックごとにグループ化する
 */
function groupTokensByBlock(
  blocks: Block[],
  tokens: Token[],
): { blockId: string; tokens: Token[] }[] {
  if (blocks.length === 0) {
    return tokens.length > 0 ? [{ blockId: '', tokens }] : [];
  }

  const tokenMap = new Map<string, Token>();
  for (const token of tokens) {
    tokenMap.set(token.id, token);
  }

  const groups: { blockId: string; tokens: Token[] }[] = [];
  for (const block of blocks) {
    const blockTokens: Token[] = [];
    for (const tokenId of block.tokenIds) {
      const token = tokenMap.get(tokenId);
      if (token) {
        blockTokens.push(token);
      }
    }
    if (blockTokens.length > 0) {
      groups.push({ blockId: block.id, tokens: blockTokens });
    }
  }

  return groups;
}

/**
 * Pass 1: SKAMDocument -> CanvasRenderTree
 */
export function buildRenderTree(
  doc: SKAMDocument,
  profile: RenderProfile,
): CanvasRenderTree {
  const { tokens, marks, blocks } = doc;

  const blockGroups = groupTokensByBlock(blocks ?? [], tokens);

  const blockNodes: CanvasBlockNode[] = blockGroups.map((group) => {
    const tokenNodes: CanvasTokenNode[] = group.tokens.map((token) => ({
      type: 'token' as const,
      token,
      slots: resolveSlots(token.id, marks, profile),
    }));

    return {
      type: 'block' as const,
      blockId: group.blockId,
      tokens: tokenNodes,
    };
  });

  return { blocks: blockNodes };
}

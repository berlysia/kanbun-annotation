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
  EmphasisMark,
  SaidokuMark,
} from '@kanbun/skam';
import { isPositionBasedMark } from '@kanbun/skam';
import type { CanvasRenderTree, CanvasBlockNode, CanvasTokenNode, TokenSlots } from './types.js';
import type { RenderProfile } from './profiles.js';
import { convertKaeriToUnicode, resolveEmphasisCharacter } from './helpers.js';

/**
 * Token ごとのマークをマップに整理する。
 * Position-based marks は position.after の tokenId で紐付け。
 * Anchor-based marks は type に応じて from / to で紐付け。
 */
function resolveTokenMarks(
  tokenId: string,
  marks: Mark[],
  allTokens: Token[]
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
      let matched = mark.anchor.from === tokenId || mark.anchor.to === tokenId;
      if (!matched && mark.anchor.from !== mark.anchor.to) {
        const fromIdx = allTokens.findIndex((t) => t.id === mark.anchor.from);
        const toIdx = allTokens.findIndex((t) => t.id === mark.anchor.to);
        const tokenIdx = allTokens.findIndex((t) => t.id === tokenId);
        if (fromIdx !== -1 && toIdx !== -1 && tokenIdx !== -1) {
          matched = tokenIdx > fromIdx && tokenIdx < toIdx;
        }
      }
      if (matched) {
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
  allTokens: Token[]
): TokenSlots {
  const tokenMarks = resolveTokenMarks(tokenId, marks, allTokens);
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

  // okimoji -> isOkimoji flag
  if (profile.okimoji && tokenMarks.has('okimoji')) {
    slots.isOkimoji = true;
  }

  // joji -> isJoji flag
  if (profile.joji && tokenMarks.has('joji')) {
    slots.isJoji = true;
  }

  // emphasis -> emphasis (Unicode 傍点文字)
  if (profile.emphasis) {
    const emphasisMarks = (tokenMarks.get('emphasis') ?? []) as EmphasisMark[];
    if (emphasisMarks.length > 0) {
      slots.emphasis = resolveEmphasisCharacter(emphasisMarks[0]!.style);
    }
  }

  // saidoku -> ruby/okuri + saidokuUnder/saidokuOkuri2
  // saidoku は yomigana より優先: forms[0] を既存 ruby/okuri スロットに割り当て
  if (profile.saidoku) {
    const saidokuMarks = (tokenMarks.get('saidoku') ?? []) as SaidokuMark[];
    if (saidokuMarks.length > 0) {
      const mark = saidokuMarks[0]!;
      const form0 = mark.forms[0];
      const form1 = mark.forms[1];
      if (form0?.yomi) {
        slots.ruby = form0.yomi;
      }
      if (form0?.okuri) {
        slots.okuri = form0.okuri;
      }
      if (form1?.yomi) {
        slots.saidokuUnder = form1.yomi;
      }
      if (form1?.okuri) {
        slots.saidokuOkuri2 = form1.okuri;
      }
    }
  }

  return slots;
}

/**
 * Token をブロックごとにグループ化する
 */
function groupTokensByBlock(
  blocks: Block[],
  tokens: Token[]
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
export function buildRenderTree(doc: SKAMDocument, profile: RenderProfile): CanvasRenderTree {
  const { tokens, marks, blocks } = doc;

  const blockGroups = groupTokensByBlock(blocks ?? [], tokens);

  const blockNodes: CanvasBlockNode[] = blockGroups.map((group) => {
    const tokenNodes: CanvasTokenNode[] = group.tokens.map((token) => ({
      type: 'token' as const,
      token,
      slots: resolveSlots(token.id, marks, profile, group.tokens),
    }));

    return {
      type: 'block' as const,
      blockId: group.blockId,
      children: tokenNodes,
    };
  });

  return { blocks: blockNodes };
}

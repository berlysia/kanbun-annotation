/**
 * buildAnnotationIR: Resolver 層
 *
 * SKAMDocument + AIRRenderProfile -> AIRDocument
 *
 * 全マーク解決を一箇所に集約し、HTML/Canvas 両レンダラーで共有する。
 * 各レンダラーは AIRDocument を受け取り、Adapter 層で自身の描画入力に変換する。
 */

import type {
  SKAMDocument,
  Token,
  Mark,
  KaeriMark,
  YomiganaMark,
  OkuriganaMark,
  SoeganaMark,
  KutotenMark,
  EmphasisMark,
  SaidokuMark,
  HighlightMark,
  RefMark,
} from '../index.js';

import type {
  AIRRenderProfile,
  AIRDocument,
  AIRBlock,
  AIRBlockChild,
  AIRTokenNode,
  AIRTokenSlots,
  AIRTatetenGroupNode,
  AIRTatetenSeparator,
  AIRHighlightGroupNode,
  AIRRangeInfo,
  AIRTrailingMark,
  AIRBlockStartRef,
  AIRBlockStartKutoten,
} from './air-types.js';
import type { RangeMarkGroup } from './types.js';

import { getMarksForToken } from './mark-lookup.js';
import { getRangeMarkGroups, getTatetenGroups, getHighlightGroups } from './mark-groups.js';
import { groupTokensByBlock } from './block-utils.js';
import { getBlockStartMarks } from './block-start.js';
import { convertKaeriToUnicode, splitKaeriForTateten } from './kaeri.js';
import { resolveEmphasisCharacter } from './emphasis.js';
import { resolveRefValues } from './ref.js';

// ============================================================================
// Token slot 解決
// ============================================================================

function resolveTokenSlots(
  tokenId: string,
  marks: Mark[],
  profile: AIRRenderProfile,
  allTokens: Token[]
): AIRTokenSlots {
  const tokenMarks = getMarksForToken(tokenId, marks, allTokens);
  const slots: AIRTokenSlots = {};

  if (profile.yomigana) {
    const yomiganaMarks = (tokenMarks.get('yomigana') ?? []) as YomiganaMark[];
    if (yomiganaMarks.length > 0) {
      slots.ruby = yomiganaMarks.map((m) => m.value).join('');
    }
  }

  if (profile.okurigana) {
    const okuriganaMarks = (tokenMarks.get('okurigana') ?? []) as OkuriganaMark[];
    if (okuriganaMarks.length > 0) {
      slots.okuri = okuriganaMarks.map((m) => m.value).join('');
    }
  }

  if (profile.soegana) {
    const soeganaMarks = (tokenMarks.get('soegana') ?? []) as SoeganaMark[];
    if (soeganaMarks.length > 0) {
      slots.soegana = soeganaMarks.map((m) => m.value).join('');
    }
  }

  if (profile.kaeriten) {
    const kaeriMarks = (tokenMarks.get('kaeri') ?? []) as KaeriMark[];
    if (kaeriMarks.length > 0) {
      slots.kaeri = kaeriMarks.map((m) => convertKaeriToUnicode(m.value)).join('');
    }
  }

  if (profile.kutoten) {
    const kutotenMarks = (tokenMarks.get('kutoten') ?? []) as KutotenMark[];
    if (kutotenMarks.length > 0) {
      slots.kutoten = kutotenMarks.map((m) => m.value).join('');
    }
  }

  if (profile.okimoji && tokenMarks.has('okimoji')) {
    slots.isOkimoji = true;
  }

  if (profile.joji && tokenMarks.has('joji')) {
    slots.isJoji = true;
  }

  if (profile.emphasis) {
    const emphasisMarks = (tokenMarks.get('emphasis') ?? []) as EmphasisMark[];
    if (emphasisMarks.length > 0) {
      slots.emphasis = resolveEmphasisCharacter(emphasisMarks[0]!.style);
    }
  }

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

// ============================================================================
// Trailing mark 解決
// ============================================================================

function resolveTrailingMark(
  mark: Mark,
  sourceTokenId: string,
  refValueMap: Map<RefMark, string>,
  highlightRefIds: Set<string>
): AIRTrailingMark | undefined {
  switch (mark.type) {
    case 'kaeri': {
      const kaeriMark = mark as KaeriMark;
      return {
        kind: 'kaeri',
        sourceTokenId,
        raw: mark,
        resolved: convertKaeriToUnicode(kaeriMark.value),
      };
    }
    case 'kutoten': {
      const kutotenMark = mark as KutotenMark;
      return {
        kind: 'kutoten',
        sourceTokenId,
        raw: mark,
        resolved: kutotenMark.value,
      };
    }
    case 'ref': {
      const refMark = mark as RefMark;
      // highlight に属する ref は trailing から除外
      if (refMark.id && highlightRefIds.has(refMark.id)) return undefined;
      const label = refValueMap.get(refMark) ?? '';
      if (!label) return undefined;
      return {
        kind: 'ref',
        sourceTokenId,
        raw: mark,
        resolved: label,
      };
    }
    case 'okimoji':
      return { kind: 'okimoji', sourceTokenId, raw: mark, resolved: '' };
    case 'joji':
      return { kind: 'joji', sourceTokenId, raw: mark, resolved: '' };
    case 'emphasis': {
      const emphasisMark = mark as EmphasisMark;
      return {
        kind: 'emphasis',
        sourceTokenId,
        raw: mark,
        resolved: resolveEmphasisCharacter(emphasisMark.style),
      };
    }
    default:
      return undefined;
  }
}

// ============================================================================
// Range mark 集約
// ============================================================================

interface RangeGroupSet {
  yomigana: Map<string, RangeMarkGroup>;
  okurigana: Map<string, RangeMarkGroup>;
  soegana: Map<string, RangeMarkGroup>;
}

function buildRangeInfo(
  leadTokenId: string,
  blockTokens: Token[],
  allTokens: Token[],
  marks: Mark[],
  profile: AIRRenderProfile,
  rangeGroups: RangeGroupSet,
  refValueMap: Map<RefMark, string>,
  highlightRefIds: Set<string>
): AIRRangeInfo | undefined {
  const yomiganaGroup = rangeGroups.yomigana.get(leadTokenId);
  const okuriganaGroup = rangeGroups.okurigana.get(leadTokenId);
  const soeganaGroup = rangeGroups.soegana.get(leadTokenId);

  // lead token は range group の先頭の場合のみ処理
  const activeGroup = yomiganaGroup ?? okuriganaGroup ?? soeganaGroup;
  if (!activeGroup || activeGroup.tokenIds[0] !== leadTokenId) return undefined;

  const tokenIds = activeGroup.tokenIds;
  const fromTokenId = tokenIds[0]!;
  const toTokenId = tokenIds[tokenIds.length - 1]!;

  const info: AIRRangeInfo = {
    fromTokenId,
    toTokenId,
    tokenIds: [...tokenIds],
    trailingMarks: [],
  };

  // yomigana range
  if (yomiganaGroup && yomiganaGroup.tokenIds[0] === leadTokenId) {
    const baseText = yomiganaGroup.tokenIds
      .map((tid) => {
        const t = blockTokens.find((tok) => tok.id === tid);
        return t?.text ?? '';
      })
      .join('');
    info.yomigana = {
      baseText,
      value: (yomiganaGroup.mark as YomiganaMark).value,
      span: yomiganaGroup.tokenIds.length,
    };
  }

  // okurigana range
  if (okuriganaGroup && okuriganaGroup.tokenIds[0] === leadTokenId) {
    const baseText = okuriganaGroup.tokenIds
      .map((tid) => {
        const t = blockTokens.find((tok) => tok.id === tid);
        return t?.text ?? '';
      })
      .join('');
    info.okurigana = {
      baseText,
      value: (okuriganaGroup.mark as OkuriganaMark).value,
    };
  }

  // soegana range
  if (soeganaGroup && soeganaGroup.tokenIds[0] === leadTokenId) {
    const baseText = soeganaGroup.tokenIds
      .map((tid) => {
        const t = blockTokens.find((tok) => tok.id === tid);
        return t?.text ?? '';
      })
      .join('');
    info.soegana = {
      baseText,
      value: (soeganaGroup.mark as SoeganaMark).value,
    };
  }

  // trailing marks（後続トークンから収集）
  const trailingTokenIds = tokenIds.slice(1);
  for (const tid of trailingTokenIds) {
    const tokenMarks = getMarksForToken(tid, marks, allTokens);
    for (const [type, markList] of tokenMarks) {
      for (const m of markList) {
        if (type === 'kaeri' && profile.kaeriten) {
          const t = resolveTrailingMark(m, tid, refValueMap, highlightRefIds);
          if (t) info.trailingMarks.push(t);
        } else if (type === 'kutoten' && profile.kutoten) {
          const t = resolveTrailingMark(m, tid, refValueMap, highlightRefIds);
          if (t) info.trailingMarks.push(t);
        } else if (type === 'ref' && profile.ref) {
          const t = resolveTrailingMark(m, tid, refValueMap, highlightRefIds);
          if (t) info.trailingMarks.push(t);
        } else if (type === 'okimoji') {
          const t = resolveTrailingMark(m, tid, refValueMap, highlightRefIds);
          if (t) info.trailingMarks.push(t);
        } else if (type === 'joji') {
          const t = resolveTrailingMark(m, tid, refValueMap, highlightRefIds);
          if (t) info.trailingMarks.push(t);
        } else if (type === 'emphasis' && profile.emphasis) {
          const t = resolveTrailingMark(m, tid, refValueMap, highlightRefIds);
          if (t) info.trailingMarks.push(t);
        }
      }
    }
  }

  return info;
}

// ============================================================================
// Tateten group 構築
// ============================================================================

function buildAIRTatetenGroup(
  tokenNodes: AIRTokenNode[],
  tatetenMark: import('../index.js').TatetenMark,
  blockId: string,
  marks: Mark[],
  profile: AIRRenderProfile
): AIRTatetenGroupNode {
  const separators: AIRTatetenSeparator[] = [];
  for (let i = 0; i < tokenNodes.length - 1; i++) {
    separators.push({ type: 'tateten-separator' as const });
  }

  // kaeri 分割処理
  if (profile.kaeriten) {
    const kaeriMarks = marks.filter((m): m is KaeriMark => m.type === 'kaeri');

    for (let i = 0; i < tokenNodes.length; i++) {
      const tokenNode = tokenNodes[i]!;
      const tokenId = tokenNode.token.id;
      const kaeriMark = kaeriMarks.find(
        (m) => m.position.after === tokenId && m.position.blockId === blockId
      );

      if (kaeriMark) {
        const { re, nonRe } = splitKaeriForTateten(kaeriMark.value);

        if (re) {
          tokenNode.slots = { ...tokenNode.slots, kaeri: re };
        } else {
          const { kaeri: _removed, ...restSlots } = tokenNode.slots;
          tokenNode.slots = restSlots;
        }

        if (nonRe && separators.length > 0) {
          if (i < tokenNodes.length - 1) {
            separators[i]!.kaeri = nonRe;
          } else {
            separators[separators.length - 1]!.kaeri = nonRe;
          }
        }
      }
    }
  }

  // children: token と separator を交互に配置
  const children: (AIRTokenNode | AIRTatetenSeparator)[] = [];
  for (let i = 0; i < tokenNodes.length; i++) {
    children.push(tokenNodes[i]!);
    if (i < separators.length) {
      children.push(separators[i]!);
    }
  }

  return {
    type: 'tateten-group' as const,
    tatetenMark,
    children,
  };
}

// ============================================================================
// Tateten + range 重複の rangeInfo 構築
// ============================================================================

function buildTatetenRangeInfo(
  tokenNodes: AIRTokenNode[],
  blockTokens: Token[],
  allTokens: Token[],
  marks: Mark[],
  profile: AIRRenderProfile,
  rangeGroups: RangeGroupSet,
  refValueMap: Map<RefMark, string>,
  highlightRefIds: Set<string>
): AIRRangeInfo | undefined {
  if (tokenNodes.length === 0) return undefined;
  const firstTokenId = tokenNodes[0]!.token.id;

  const activeGroup =
    rangeGroups.yomigana.get(firstTokenId) ??
    rangeGroups.okurigana.get(firstTokenId) ??
    rangeGroups.soegana.get(firstTokenId);
  if (!activeGroup || activeGroup.tokenIds[0] !== firstTokenId) return undefined;

  // range group の全 tokenIds が tateten group 内に含まれるか確認
  const tatetenTokenIds = new Set(tokenNodes.map((n) => n.token.id));
  const allMatch = activeGroup.tokenIds.every((tid) => tatetenTokenIds.has(tid));
  if (!allMatch) return undefined;

  return buildRangeInfo(
    firstTokenId,
    blockTokens,
    allTokens,
    marks,
    profile,
    rangeGroups,
    refValueMap,
    highlightRefIds
  );
}

// ============================================================================
// Block-start marks 解決
// ============================================================================

function resolveBlockStartMarks(
  blockId: string,
  marks: Mark[],
  profile: AIRRenderProfile,
  refValueMap: Map<RefMark, string>,
  highlightRefIds: Set<string>
): { blockStartRefs: AIRBlockStartRef[]; blockStartKutoten: AIRBlockStartKutoten[] } {
  const blockStartMarks = getBlockStartMarks(blockId, marks);
  const blockStartRefs: AIRBlockStartRef[] = [];
  const blockStartKutoten: AIRBlockStartKutoten[] = [];

  if (blockStartMarks.refs.length > 0 && profile.ref) {
    for (const refMark of blockStartMarks.refs) {
      if (highlightRefIds.has(refMark.id ?? '')) continue;
      const refText = refValueMap.get(refMark) ?? '';
      if (refText) {
        blockStartRefs.push({
          ...(refMark.id ? { refId: refMark.id } : {}),
          resolved: refText,
        });
      }
    }
  }

  if (blockStartMarks.kutotenMarks.length > 0 && profile.kutoten) {
    for (const kutotenMark of blockStartMarks.kutotenMarks) {
      blockStartKutoten.push({ value: kutotenMark.value });
    }
  }

  return { blockStartRefs, blockStartKutoten };
}

// ============================================================================
// highlight 内の hasKana 判定
// ============================================================================

function checkHasKana(node: AIRTokenNode | AIRTatetenGroupNode): boolean {
  if (node.type === 'token') {
    return !!(node.slots.ruby || node.slots.okuri || node.slots.soegana || node.rangeInfo);
  }
  // tateten-group
  for (const child of node.children) {
    if (child.type === 'token') {
      if (child.slots.ruby || child.slots.okuri || child.slots.soegana || child.rangeInfo) {
        return true;
      }
    }
  }
  if (node.rangeInfo) return true;
  return false;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * SKAMDocument + Profile -> AIRDocument
 *
 * 全マーク解決を一箇所に集約する Resolver 層のエントリーポイント。
 */
export function buildAnnotationIR(doc: SKAMDocument, profile: AIRRenderProfile): AIRDocument {
  const { tokens, marks, blocks } = doc;

  const blockGroups = groupTokensByBlock(blocks ?? [], tokens);

  // ref 解決
  const allTokensOrdered = blockGroups.flatMap((g) => g.tokens);
  const refValueMap = profile.ref
    ? resolveRefValues(allTokensOrdered, marks)
    : new Map<RefMark, string>();

  // ref mark を ID で引けるマップ
  const refMarkById = new Map<string, RefMark>();
  for (const refMark of refValueMap.keys()) {
    if (refMark.id) {
      refMarkById.set(refMark.id, refMark);
    }
  }

  // highlight が参照する ref mark ID
  const highlightRefIds = new Set<string>();
  if (profile.highlight) {
    for (const mark of marks) {
      if (mark.type === 'highlight' && (mark as HighlightMark).ref) {
        highlightRefIds.add((mark as HighlightMark).ref!);
      }
    }
  }

  const refMarks = profile.ref ? marks.filter((m): m is RefMark => m.type === 'ref') : [];

  const airBlocks: AIRBlock[] = blockGroups.map((group) => {
    // Range groups
    const rangeGroups: RangeGroupSet = {
      yomigana: profile.yomigana ? getRangeMarkGroups(group.tokens, marks, 'yomigana') : new Map(),
      okurigana: profile.okurigana
        ? getRangeMarkGroups(group.tokens, marks, 'okurigana')
        : new Map(),
      soegana: profile.soegana ? getRangeMarkGroups(group.tokens, marks, 'soegana') : new Map(),
    };

    // tateten/highlight groups
    const tatetenMap = profile.tateten ? getTatetenGroups(group.tokens, marks) : new Map();
    const highlightMap = profile.highlight ? getHighlightGroups(group.tokens, marks) : new Map();

    // Build token nodes
    const tokenNodes: AIRTokenNode[] = group.tokens.map((token) => {
      const slots = resolveTokenSlots(token.id, marks, profile, group.tokens);
      const node: AIRTokenNode = { type: 'token' as const, token, slots };

      // Range info（tateten 重複チェック付き）
      const activeRangeGroup =
        rangeGroups.yomigana.get(token.id) ??
        rangeGroups.okurigana.get(token.id) ??
        rangeGroups.soegana.get(token.id);
      const hasTatetenOverlap =
        tatetenMap.has(token.id) &&
        activeRangeGroup &&
        activeRangeGroup.tokenIds[0] === token.id &&
        activeRangeGroup.tokenIds.some((tid) => tatetenMap.has(tid));

      if (!hasTatetenOverlap) {
        const rangeInfo = buildRangeInfo(
          token.id,
          group.tokens,
          group.tokens,
          marks,
          profile,
          rangeGroups,
          refValueMap,
          highlightRefIds
        );
        if (rangeInfo) {
          node.rangeInfo = rangeInfo;
        }
      }

      return node;
    });

    // ref 解決: position-based ref marks をトークンスロットに配置
    if (profile.ref) {
      for (const tokenNode of tokenNodes) {
        const tokenId = tokenNode.token.id;
        for (const ref of refMarks) {
          if (ref.position.blockId !== group.blockId) continue;
          if (ref.position.after !== tokenId) continue;
          if (ref.id && highlightRefIds.has(ref.id)) continue;
          const label = refValueMap.get(ref);
          if (label) {
            tokenNode.slots = { ...tokenNode.slots, ref: label };
          }
        }
      }
    }

    // Tateten グルーピング
    let children: AIRBlockChild[];
    if (profile.tateten) {
      children = [];
      let i = 0;
      while (i < tokenNodes.length) {
        const tokenNode = tokenNodes[i]!;
        const tatetenMark = tatetenMap.get(tokenNode.token.id);

        if (!tatetenMark) {
          children.push(tokenNode);
          i++;
        } else {
          const groupTokens: AIRTokenNode[] = [tokenNode];
          let j = i + 1;
          while (j < tokenNodes.length && tatetenMap.get(tokenNodes[j]!.token.id) === tatetenMark) {
            groupTokens.push(tokenNodes[j]!);
            j++;
          }
          const tatetenGroup = buildAIRTatetenGroup(
            groupTokens,
            tatetenMark,
            group.blockId,
            marks,
            profile
          );

          // tateten + range 重複時の rangeInfo
          const rangeInfo = buildTatetenRangeInfo(
            groupTokens,
            group.tokens,
            group.tokens,
            marks,
            profile,
            rangeGroups,
            refValueMap,
            highlightRefIds
          );
          if (rangeInfo) {
            tatetenGroup.rangeInfo = rangeInfo;
          }

          children.push(tatetenGroup);
          i = j;
        }
      }
    } else {
      children = tokenNodes;
    }

    // Highlight グルーピング
    if (profile.highlight) {
      const grouped: AIRBlockChild[] = [];
      let i = 0;
      while (i < children.length) {
        const child = children[i]!;
        const childTokenId = getFirstTokenId(child);
        const highlightMark = childTokenId ? highlightMap.get(childTokenId) : undefined;

        if (!highlightMark) {
          grouped.push(child);
          i++;
        } else {
          const hlChildren: (AIRTokenNode | AIRTatetenGroupNode)[] = [];
          let j = i;
          while (j < children.length) {
            const c = children[j]!;
            const tid = getFirstTokenId(c);
            if (!tid || highlightMap.get(tid) !== highlightMark) break;
            if (c.type === 'token' || c.type === 'tateten-group') {
              hlChildren.push(c);
            }
            j++;
          }

          if (hlChildren.length > 0) {
            // ref ラベル解決
            let resolvedRefLabel: string | undefined;
            if (profile.ref && highlightMark.ref) {
              const refMark = refMarkById.get(highlightMark.ref);
              if (refMark) {
                resolvedRefLabel = refValueMap.get(refMark);
              }
            }

            // hasKana 判定
            const hasKana = hlChildren.some(checkHasKana);

            const hlGroup: AIRHighlightGroupNode = {
              type: 'highlight-group',
              highlightMark,
              highlightStyle: highlightMark.style ?? 'solid',
              ...(resolvedRefLabel ? { refLabel: resolvedRefLabel } : {}),
              children: hlChildren,
              hasKana,
            };
            grouped.push(hlGroup);
          }
          i = j;
        }
      }
      children = grouped;
    }

    // Block-start marks 解決
    const { blockStartRefs, blockStartKutoten } = resolveBlockStartMarks(
      group.blockId,
      marks,
      profile,
      refValueMap,
      highlightRefIds
    );

    return {
      blockId: group.blockId,
      children,
      blockStartRefs,
      blockStartKutoten,
    };
  });

  return { blocks: airBlocks };
}

// ============================================================================
// ヘルパー
// ============================================================================

/** AIRBlockChild から最初のトークン ID を取得 */
function getFirstTokenId(child: AIRBlockChild): string | undefined {
  if (child.type === 'token') return child.token.id;
  if (child.type === 'tateten-group') {
    for (const c of child.children) {
      if (c.type === 'token') return c.token.id;
    }
  }
  if (child.type === 'highlight-group') {
    for (const c of child.children) {
      if (c.type === 'token') return c.token.id;
      if (c.type === 'tateten-group') {
        for (const tc of c.children) {
          if (tc.type === 'token') return tc.token.id;
        }
      }
    }
  }
  return undefined;
}

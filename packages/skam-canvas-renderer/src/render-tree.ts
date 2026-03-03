/**
 * Pass 1: Resolve & Group
 *
 * SKAMDocument -> CanvasRenderTree
 * 全マークを解決済みスロットに格納し、後段で再解決不要にする。
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
} from '@kanbun/skam';

import {
  resolveEmphasisCharacter,
  resolveRefValues,
  getMarksForToken as resolveTokenMarks,
  getRangeMarkGroups,
  getTatetenGroups,
  getHighlightGroups,
  groupTokensByBlock,
  splitKaeriForTateten,
} from '@kanbun/skam/rendering';
import type { RangeMarkGroup } from '@kanbun/skam/rendering';

import type {
  CanvasRenderTree,
  CanvasBlockNode,
  CanvasTokenNode,
  CanvasBlockChild,
  CanvasHighlightGroupNode,
  CanvasTatetenGroupNode,
  CanvasTatetenSeparator,
  TokenSlots,
} from './types.js';
import type { RenderProfile } from './profiles.js';

/**
 * Token のスロットを解決する
 */
// oxlint-disable-next-line eslint/complexity
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
      slots.kaeri = kaeriMarks.map((m) => m.value).join('');
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
 * tateten グループを構築。
 * N トークン → N-1 セパレータ挿入。
 * kaeri: splitKaeriForTateten() でレ→トークン suffix、非レ→セパレータ kaeri。
 * 最終トークンの非レ kaeri は最後のセパレータに配置。
 */
function buildTatetenGroup(
  tokenNodes: CanvasTokenNode[],
  blockId: string,
  marks: Mark[],
  profile: RenderProfile
): CanvasTatetenGroupNode {
  const separators: CanvasTatetenSeparator[] = [];
  for (let i = 0; i < tokenNodes.length - 1; i++) {
    separators.push({ type: 'tateten-separator' as const });
  }

  // kaeri 分割処理（profile.kaeriten が有効な場合のみ）
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

        // レ成分 → トークンの kaeri スロット
        if (re) {
          tokenNode.slots = { ...tokenNode.slots, kaeri: re };
        } else {
          const { kaeri: _removed, ...restSlots } = tokenNode.slots;
          tokenNode.slots = restSlots;
        }

        // 非レ成分 → セパレータの kaeri
        if (nonRe && separators.length > 0) {
          if (i < tokenNodes.length - 1) {
            separators[i]!.kaeri = nonRe;
          } else {
            // 最終トークン: 最後のセパレータに配置
            separators[separators.length - 1]!.kaeri = nonRe;
          }
        }
      }
    }
  }

  // トークンとセパレータを交互に配置
  const children: (CanvasTokenNode | CanvasTatetenSeparator)[] = [];
  for (let i = 0; i < tokenNodes.length; i++) {
    children.push(tokenNodes[i]!);
    if (i < separators.length) {
      children.push(separators[i]!);
    }
  }

  return { type: 'tateten-group' as const, children };
}

/** CanvasBlockChild から最初のトークン ID を取得 */
function getFirstTokenId(child: CanvasBlockChild): string | undefined {
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

// ============================================================================
// Range mark concentration
// ============================================================================

type RangeConcentration = 'first' | 'last';

interface RangeSlotConfig {
  type: 'yomigana' | 'okurigana' | 'soegana';
  slotName: 'ruby' | 'okuri' | 'soegana';
  profileKey: 'yomigana' | 'okurigana' | 'soegana';
  concentration: RangeConcentration;
  /** yomigana のみ: rubySpan を設定する */
  setSpan: boolean;
}

const RANGE_CONFIGS: RangeSlotConfig[] = [
  {
    type: 'yomigana',
    slotName: 'ruby',
    profileKey: 'yomigana',
    concentration: 'first',
    setSpan: true,
  },
  {
    type: 'okurigana',
    slotName: 'okuri',
    profileKey: 'okurigana',
    concentration: 'last',
    setSpan: false,
  },
  {
    type: 'soegana',
    slotName: 'soegana',
    profileKey: 'soegana',
    concentration: 'last',
    setSpan: false,
  },
];

/** TokenSlots から指定スロットを除去したコピーを返す */
function clearSlot(slots: TokenSlots, slotName: 'ruby' | 'okuri' | 'soegana'): TokenSlots {
  const newSlots = { ...slots };
  delete newSlots[slotName];
  return newSlots;
}

/**
 * range mark の値を concentration に従って1つのトークンに集約する。
 *
 * - concentration='first': 先頭トークンに値を設定し、後続トークンのスロットをクリア
 * - concentration='last':  末尾トークンに値を設定し、先行トークンのスロットをクリア
 */
function applyRangeConcentration(
  tokenNodes: CanvasTokenNode[],
  rangeGroups: Map<string, RangeMarkGroup>,
  config: RangeSlotConfig
): void {
  const processed = new Set<string>();

  for (const tokenNode of tokenNodes) {
    const rangeGroup = rangeGroups.get(tokenNode.token.id);
    if (!rangeGroup || processed.has(tokenNode.token.id)) continue;
    if (rangeGroup.tokenIds[0] !== tokenNode.token.id) continue;

    // 全トークンを処理済みにマーク
    for (const tid of rangeGroup.tokenIds) {
      processed.add(tid);
    }

    if (config.concentration === 'first') {
      // 先頭トークンに値を設定
      tokenNode.slots = {
        ...tokenNode.slots,
        [config.slotName]: rangeGroup.mark.value,
        ...(config.setSpan ? { rubySpan: rangeGroup.tokenIds.length } : {}),
      };
      // 後続トークンのスロットをクリア
      for (const tid of rangeGroup.tokenIds.slice(1)) {
        const node = tokenNodes.find((n) => n.token.id === tid);
        if (node) {
          node.slots = clearSlot(node.slots, config.slotName);
        }
      }
    } else {
      // 末尾トークンに値を設定
      const lastTokenId = rangeGroup.tokenIds[rangeGroup.tokenIds.length - 1];
      const lastNode = tokenNodes.find((n) => n.token.id === lastTokenId);
      if (lastNode) {
        lastNode.slots = { ...lastNode.slots, [config.slotName]: rangeGroup.mark.value };
      }
      // 先行トークンのスロットをクリア
      for (const tid of rangeGroup.tokenIds.slice(0, -1)) {
        const node = tokenNodes.find((n) => n.token.id === tid);
        if (node) {
          node.slots = clearSlot(node.slots, config.slotName);
        }
      }
    }
  }
}

/**
 * Pass 1: SKAMDocument -> CanvasRenderTree
 */
export function buildRenderTree(doc: SKAMDocument, profile: RenderProfile): CanvasRenderTree {
  const { tokens, marks, blocks } = doc;

  const blockGroups = groupTokensByBlock(blocks ?? [], tokens);

  // ref 解決: 文書順のトークン列から ref ラベルマップを生成
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

  // highlight が参照する ref mark ID を収集（これらは token slot ではなく highlight group に配置）
  const highlightRefIds = new Set<string>();
  if (profile.highlight) {
    for (const mark of marks) {
      if (mark.type === 'highlight' && (mark as HighlightMark).ref) {
        highlightRefIds.add((mark as HighlightMark).ref!);
      }
    }
  }

  const refMarks = profile.ref ? marks.filter((m): m is RefMark => m.type === 'ref') : [];

  // oxlint-disable-next-line eslint/complexity
  const blockNodes: CanvasBlockNode[] = blockGroups.map((group) => {
    const tokenNodes: CanvasTokenNode[] = group.tokens.map((token) => ({
      type: 'token' as const,
      token,
      slots: resolveSlots(token.id, marks, profile, group.tokens),
    }));

    // range mark 処理: 各タイプの range mark を対応するスロットに集約
    for (const config of RANGE_CONFIGS) {
      if (!profile[config.profileKey]) continue;
      const rangeGroups = getRangeMarkGroups(group.tokens, marks, config.type);
      applyRangeConcentration(tokenNodes, rangeGroups, config);
    }

    // ref 解決: position-based ref marks をトークンスロットに配置
    if (profile.ref) {
      for (const tokenNode of tokenNodes) {
        const tokenId = tokenNode.token.id;
        for (const ref of refMarks) {
          if (ref.position.blockId !== group.blockId) continue;
          if (ref.position.after !== tokenId) continue;
          // highlight に属する ref は token slot から除外
          if (ref.id && highlightRefIds.has(ref.id)) continue;
          const label = refValueMap.get(ref);
          if (label) {
            tokenNode.slots = { ...tokenNode.slots, ref: label };
          }
        }
      }
    }

    // tateten グルーピング: 連続する同一マーク参照のトークンをグループ化
    let children: CanvasBlockChild[];
    if (profile.tateten) {
      const tatetenMap = getTatetenGroups(group.tokens, marks);
      children = [];
      let i = 0;
      while (i < tokenNodes.length) {
        const tokenNode = tokenNodes[i]!;
        const tatetenMark = tatetenMap.get(tokenNode.token.id);

        if (!tatetenMark) {
          children.push(tokenNode);
          i++;
        } else {
          // 同一 tateten マーク参照の連続トークンを収集
          const groupTokens: CanvasTokenNode[] = [tokenNode];
          let j = i + 1;
          while (j < tokenNodes.length && tatetenMap.get(tokenNodes[j]!.token.id) === tatetenMark) {
            groupTokens.push(tokenNodes[j]!);
            j++;
          }
          children.push(buildTatetenGroup(groupTokens, group.blockId, marks, profile));
          i = j;
        }
      }
    } else {
      children = tokenNodes;
    }

    // highlight グルーピング: 連続する同一 highlight マーク参照の子要素をグループ化
    if (profile.highlight) {
      const highlightMap = getHighlightGroups(group.tokens, marks);
      const grouped: CanvasBlockChild[] = [];
      let i = 0;
      while (i < children.length) {
        const child = children[i]!;
        // child からトークン ID を取得
        const childTokenId = getFirstTokenId(child);
        const highlightMark = childTokenId ? highlightMap.get(childTokenId) : undefined;

        if (!highlightMark) {
          grouped.push(child);
          i++;
        } else {
          // 同一 highlight マーク参照の連続子要素を収集
          const hlChildren: (CanvasTokenNode | CanvasTatetenGroupNode)[] = [];
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
            // highlight-ref のラベル解決
            let resolvedRefLabel: string | undefined;
            if (profile.ref && highlightMark.ref) {
              const refMark = refMarkById.get(highlightMark.ref);
              if (refMark) {
                resolvedRefLabel = refValueMap.get(refMark);
              }
            }

            const hlGroup: CanvasHighlightGroupNode = {
              type: 'highlight-group',
              highlightStyle: highlightMark.style ?? 'solid',
              ...(highlightMark.ref ? { highlightRef: highlightMark.ref } : {}),
              ...(resolvedRefLabel ? { refLabel: resolvedRefLabel } : {}),
              children: hlChildren,
            };
            grouped.push(hlGroup);
          }
          i = j;
        }
      }
      children = grouped;
    }

    // ブロック単位のレイアウトフラグを計算
    let blockHasSuffix = false;
    let blockHasSaidoku = false;
    let blockHasRightColumn = false;
    let blockHasEmphasis = false;
    let blockHasHighlight = false;
    let blockHasRefLabel = false;
    for (const child of children) {
      const flags = checkLayoutFlags(child);
      if (flags.hasSuffix) blockHasSuffix = true;
      if (flags.hasSaidoku) blockHasSaidoku = true;
      if (flags.hasRightColumn) blockHasRightColumn = true;
      if (flags.hasEmphasis) blockHasEmphasis = true;
      if (child.type === 'highlight-group') {
        blockHasHighlight = true;
        if (child.refLabel) blockHasRefLabel = true;
      }
    }

    return {
      type: 'block' as const,
      blockId: group.blockId,
      children,
      flags: {
        hasSuffix: blockHasSuffix,
        hasSaidoku: blockHasSaidoku,
        hasRightColumn: blockHasRightColumn,
        hasEmphasis: blockHasEmphasis,
        hasHighlight: blockHasHighlight,
        hasRefLabel: blockHasRefLabel,
      },
    };
  });

  // ドキュメント全体のフラグ = 全ブロックの flags を OR 集約
  let hasSuffix = false;
  let hasSaidoku = false;
  let hasRightColumn = false;
  let hasEmphasis = false;
  let hasHighlight = false;
  let hasRefLabel = false;
  for (const block of blockNodes) {
    if (block.flags.hasSuffix) hasSuffix = true;
    if (block.flags.hasSaidoku) hasSaidoku = true;
    if (block.flags.hasRightColumn) hasRightColumn = true;
    if (block.flags.hasEmphasis) hasEmphasis = true;
    if (block.flags.hasHighlight) hasHighlight = true;
    if (block.flags.hasRefLabel) hasRefLabel = true;
  }

  return {
    blocks: blockNodes,
    hasSuffix,
    hasSaidoku,
    hasRightColumn,
    hasEmphasis,
    hasHighlight,
    hasRefLabel,
  };
}

interface LayoutFlags {
  hasSuffix: boolean;
  hasSaidoku: boolean;
  hasRightColumn: boolean;
  hasEmphasis: boolean;
}

/** CanvasBlockChild 内のトークンからレイアウトフラグを収集 */
function checkLayoutFlags(child: CanvasBlockChild): LayoutFlags {
  const flags: LayoutFlags = {
    hasSuffix: false,
    hasSaidoku: false,
    hasRightColumn: false,
    hasEmphasis: false,
  };
  if (child.type === 'token') {
    mergeTokenFlags(child, flags);
  } else if (child.type === 'tateten-group') {
    for (const c of child.children) {
      if (c.type === 'token') mergeTokenFlags(c, flags);
    }
  } else {
    // highlight-group
    for (const c of child.children) {
      if (c.type === 'token') {
        mergeTokenFlags(c, flags);
      } else {
        // tateten-group inside highlight
        for (const tc of c.children) {
          if (tc.type === 'token') mergeTokenFlags(tc, flags);
        }
      }
    }
  }
  return flags;
}

function mergeTokenFlags(node: CanvasTokenNode, flags: LayoutFlags): void {
  const { slots } = node;
  if (
    slots.okuri ||
    slots.soegana ||
    slots.kaeri ||
    slots.kutoten ||
    slots.saidokuUnder ||
    slots.saidokuOkuri2
  ) {
    flags.hasSuffix = true;
  }
  if (slots.saidokuUnder || slots.saidokuOkuri2) {
    flags.hasSaidoku = true;
  }
  if (slots.ruby || slots.okuri || slots.soegana) {
    flags.hasRightColumn = true;
  }
  if (slots.emphasis) {
    flags.hasEmphasis = true;
  }
}

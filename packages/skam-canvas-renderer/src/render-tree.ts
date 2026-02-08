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
  TatetenMark,
  HighlightMark,
  RefMark,
} from '@kanbun/skam';
import { isPositionBasedMark } from '@kanbun/skam';

/** range mark グループ情報 */
interface RangeMarkGroup {
  mark: YomiganaMark | OkuriganaMark | SoeganaMark;
  tokenIds: string[];
}
import type {
  CanvasRenderTree,
  CanvasBlockNode,
  CanvasTokenNode,
  CanvasBlockChild,
  CanvasTatetenGroupNode,
  CanvasHighlightGroupNode,
  CanvasTatetenSeparator,
  TokenSlots,
} from './types.js';
import type { RenderProfile } from './profiles.js';
import {
  convertKaeriToUnicode,
  resolveEmphasisCharacter,
  splitKaeriForTateten,
  resolveRefValues,
} from './helpers.js';

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
 * tateten マークのアンカー範囲に含まれるトークンを同一マーク参照にマッピング。
 * 連続判定で === 参照比較を使えるよう、同じ TatetenMark オブジェクトを割り当てる。
 */
function getTatetenGroups(blockTokens: Token[], marks: Mark[]): Map<string, TatetenMark> {
  const tatetenMarks = marks.filter((m): m is TatetenMark => m.type === 'tateten');
  const result = new Map<string, TatetenMark>();

  for (const mark of tatetenMarks) {
    const fromIdx = blockTokens.findIndex((t) => t.id === mark.anchor.from);
    const toIdx = blockTokens.findIndex((t) => t.id === mark.anchor.to);
    if (fromIdx === -1 || toIdx === -1) continue;

    for (let i = fromIdx; i <= toIdx; i++) {
      result.set(blockTokens[i]!.id, mark);
    }
  }

  return result;
}

/**
 * highlight マークのアンカー範囲に含まれるトークンを同一マーク参照にマッピング。
 * tateten と同様に === 参照比較で連続判定する。
 */
function getHighlightGroups(blockTokens: Token[], marks: Mark[]): Map<string, HighlightMark> {
  const highlightMarks = marks.filter((m): m is HighlightMark => m.type === 'highlight');
  const result = new Map<string, HighlightMark>();

  for (const mark of highlightMarks) {
    const fromIdx = blockTokens.findIndex((t) => t.id === mark.anchor.from);
    const toIdx = blockTokens.findIndex((t) => t.id === mark.anchor.to);
    if (fromIdx === -1 || toIdx === -1) continue;

    for (let i = fromIdx; i <= toIdx; i++) {
      result.set(blockTokens[i]!.id, mark);
    }
  }

  return result;
}

/**
 * anchor.from !== anchor.to の anchor-based マークをグループ化。
 * 各トークン ID → 所属する RangeMarkGroup のマップを返す。
 */
function getRangeMarkGroups(
  blockTokens: Token[],
  marks: Mark[],
  type: 'yomigana' | 'okurigana' | 'soegana'
): Map<string, RangeMarkGroup> {
  const targetMarks = marks.filter(
    (m): m is YomiganaMark | OkuriganaMark | SoeganaMark =>
      m.type === type && !isPositionBasedMark(m) && m.anchor.from !== m.anchor.to
  );
  const result = new Map<string, RangeMarkGroup>();

  for (const mark of targetMarks) {
    const fromIdx = blockTokens.findIndex((t) => t.id === mark.anchor.from);
    const toIdx = blockTokens.findIndex((t) => t.id === mark.anchor.to);
    if (fromIdx === -1 || toIdx === -1) continue;

    const tokenIds: string[] = [];
    for (let i = fromIdx; i <= toIdx; i++) {
      tokenIds.push(blockTokens[i]!.id);
    }

    const group: RangeMarkGroup = { mark, tokenIds };
    for (const tokenId of tokenIds) {
      result.set(tokenId, group);
    }
  }

  return result;
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

  const blockNodes: CanvasBlockNode[] = blockGroups.map((group) => {
    const tokenNodes: CanvasTokenNode[] = group.tokens.map((token) => ({
      type: 'token' as const,
      token,
      slots: resolveSlots(token.id, marks, profile, group.tokens),
    }));

    // range yomigana: 先頭トークンに rubySpan を設定し、後続トークンの ruby をクリア
    if (profile.yomigana) {
      const yomiganaGroups = getRangeMarkGroups(group.tokens, marks, 'yomigana');
      const processed = new Set<string>();
      for (const tokenNode of tokenNodes) {
        const rangeGroup = yomiganaGroups.get(tokenNode.token.id);
        if (!rangeGroup || processed.has(tokenNode.token.id)) continue;

        if (rangeGroup.tokenIds[0] === tokenNode.token.id) {
          // 先頭トークン: ruby 値を設定し rubySpan を記録
          tokenNode.slots = {
            ...tokenNode.slots,
            ruby: rangeGroup.mark.value,
            rubySpan: rangeGroup.tokenIds.length,
          };
          // 後続トークンの ruby をクリア
          for (const tid of rangeGroup.tokenIds.slice(1)) {
            processed.add(tid);
            const subsequent = tokenNodes.find((n) => n.token.id === tid);
            if (subsequent) {
              const { ruby: _removed, ...restSlots } = subsequent.slots;
              subsequent.slots = restSlots;
            }
          }
        }
      }
    }

    // range okurigana: 最終トークンにのみ okuri を設定し、先行トークンをクリア
    if (profile.okurigana) {
      const okuriganaGroups = getRangeMarkGroups(group.tokens, marks, 'okurigana');
      const processed = new Set<string>();
      for (const tokenNode of tokenNodes) {
        const rangeGroup = okuriganaGroups.get(tokenNode.token.id);
        if (!rangeGroup || processed.has(tokenNode.token.id)) continue;

        const lastTokenId = rangeGroup.tokenIds[rangeGroup.tokenIds.length - 1];
        if (rangeGroup.tokenIds[0] === tokenNode.token.id) {
          // 最終トークンに okuri を設定
          const lastNode = tokenNodes.find((n) => n.token.id === lastTokenId);
          if (lastNode) {
            lastNode.slots = { ...lastNode.slots, okuri: rangeGroup.mark.value };
          }
          // 先行トークンの okuri をクリア
          for (const tid of rangeGroup.tokenIds.slice(0, -1)) {
            processed.add(tid);
            const node = tokenNodes.find((n) => n.token.id === tid);
            if (node) {
              const { okuri: _removed, ...restSlots } = node.slots;
              node.slots = restSlots;
            }
          }
          processed.add(lastTokenId!);
        }
      }
    }

    // range soegana: 最終トークンにのみ soegana を設定し、先行トークンをクリア
    if (profile.soegana) {
      const soeganaGroups = getRangeMarkGroups(group.tokens, marks, 'soegana');
      const processed = new Set<string>();
      for (const tokenNode of tokenNodes) {
        const rangeGroup = soeganaGroups.get(tokenNode.token.id);
        if (!rangeGroup || processed.has(tokenNode.token.id)) continue;

        const lastTokenId = rangeGroup.tokenIds[rangeGroup.tokenIds.length - 1];
        if (rangeGroup.tokenIds[0] === tokenNode.token.id) {
          // 最終トークンに soegana を設定
          const lastNode = tokenNodes.find((n) => n.token.id === lastTokenId);
          if (lastNode) {
            lastNode.slots = { ...lastNode.slots, soegana: rangeGroup.mark.value };
          }
          // 先行トークンの soegana をクリア
          for (const tid of rangeGroup.tokenIds.slice(0, -1)) {
            processed.add(tid);
            const node = tokenNodes.find((n) => n.token.id === tid);
            if (node) {
              const { soegana: _removed, ...restSlots } = node.slots;
              node.slots = restSlots;
            }
          }
          processed.add(lastTokenId!);
        }
      }
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

    return {
      type: 'block' as const,
      blockId: group.blockId,
      children,
    };
  });

  return { blocks: blockNodes };
}

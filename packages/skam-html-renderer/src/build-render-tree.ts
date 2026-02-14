/**
 * Pass 1: Build a render tree from tokens + marks.
 *
 * Converts a flat token sequence into a BlockRenderTree with proper
 * tateten/highlight grouping and range-merge context.
 */
import type {
  Token,
  Mark,
  TatetenMark,
  HighlightMark,
  RefMark,
  KaeriMark,
  KutotenMark,
  OkimojiMark,
  JojiMark,
  EmphasisMark,
  OkuriganaMark,
  SoeganaMark,
} from '@kanbun/skam';
import type {
  RangeMarkContext,
  RangeTokenInfo,
  TokenItem,
  TatetenGroupNode,
  HighlightGroupNode,
  BlockRenderTree,
  RenderNode,
} from './render-tree-types.js';
import type { RangeMarkGroup } from '@kanbun/skam/rendering';
import { getMarksForToken, getRangeMarkGroups } from '@kanbun/skam/rendering';
import type { RenderProfile } from './render-config.js';
import { escapeHtml, shouldApplyTateChuYoko } from './html-utils.js';
import { getBlockStartMarks } from './mark-utils.js';

/** @internal */
export interface BuildTreeContext {
  prefix: string;
  profile: RenderProfile;
  tokens: Token[];
  marks: Mark[];
  refValueMap: Map<RefMark, string>;
  highlightRefIds: Set<string>;
  tatetenGroups: Map<string, TatetenMark>;
  highlightGroups: Map<string, HighlightMark>;
  yomiganaRangeGroups: Map<string, RangeMarkGroup>;
  okuriganaRangeGroups: Map<string, RangeMarkGroup>;
  soeganaRangeGroups: Map<string, RangeMarkGroup>;
}

/** Intermediate flat item with group membership metadata. */
interface FlatTokenEntry {
  item: TokenItem;
  tatetenMark: TatetenMark | undefined;
  highlightMark: HighlightMark | undefined;
}

/**
 * Compute the refHtml for a highlight group node.
 * @internal
 */
export function computeHighlightRefHtml(
  highlight: HighlightMark,
  marks: Mark[],
  prefix: string,
  profile: RenderProfile,
  refValueMap: Map<RefMark, string>
): string {
  if (!profile.ref || !highlight.ref) return '';

  const refMark = marks.find((m): m is RefMark => m.type === 'ref' && m.id === highlight.ref);
  if (refMark) {
    const refText = refValueMap.get(refMark) ?? '';
    if (refText) {
      const halfWidthClass = shouldApplyTateChuYoko(refText) ? ` ${prefix}-ref--half-width` : '';
      return `<span class="${prefix}-ref${halfWidthClass}">${escapeHtml(refText)}</span>`;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Phase 1: blockStartHtml
// ---------------------------------------------------------------------------

function buildBlockStartHtml(blockId: string, ctx: BuildTreeContext): string {
  const { marks, prefix, profile, refValueMap, highlightRefIds } = ctx;
  const blockStartMarks = getBlockStartMarks(blockId, marks);
  const parts: string[] = [];

  if (blockStartMarks.refs.length > 0 && profile.ref) {
    for (const refMark of blockStartMarks.refs) {
      if (highlightRefIds.has(refMark.id ?? '')) continue;
      const refText = refValueMap.get(refMark) ?? '';
      if (refText) {
        const halfWidthClass = shouldApplyTateChuYoko(refText) ? ` ${prefix}-ref--half-width` : '';
        parts.push(`<span class="${prefix}-ref${halfWidthClass}">${escapeHtml(refText)}</span>`);
      }
    }
  }
  if (blockStartMarks.kutotenMarks.length > 0 && profile.kutoten) {
    for (const kutotenMark of blockStartMarks.kutotenMarks) {
      parts.push(`<span class="${prefix}-suffix-kutoten">${escapeHtml(kutotenMark.value)}</span>`);
    }
  }

  return parts.join('');
}

// ---------------------------------------------------------------------------
// Phase 2: Build flat TokenItem list with range-merge context
// ---------------------------------------------------------------------------

function buildFlatTokenList(blockTokens: Token[], ctx: BuildTreeContext): FlatTokenEntry[] {
  const {
    tokens,
    marks,
    profile,
    tatetenGroups,
    highlightGroups,
    yomiganaRangeGroups,
    okuriganaRangeGroups,
    soeganaRangeGroups,
  } = ctx;

  const processedTokenIds = new Set<string>();
  const entries: FlatTokenEntry[] = [];

  for (const token of blockTokens) {
    if (processedTokenIds.has(token.id)) continue;

    const tatetenMark = tatetenGroups.get(token.id);
    const highlightMark = highlightGroups.get(token.id);

    // Range group checks
    const yomiganaGroup = yomiganaRangeGroups.get(token.id);
    const okuriganaGroup = okuriganaRangeGroups.get(token.id);
    const soeganaGroup = soeganaRangeGroups.get(token.id);
    let rangeCtx: RangeMarkContext | undefined;

    // Tateten overlap detection: 読み範囲と tateten が重複する場合、
    // 後続トークンを skip せず個別 entry に残す（tateten-group が処理を担当）
    const activeRangeGroup =
      yomiganaRangeGroups.get(token.id) ??
      okuriganaRangeGroups.get(token.id) ??
      soeganaRangeGroups.get(token.id);
    const hasTatetenOverlap =
      tatetenMark &&
      activeRangeGroup &&
      activeRangeGroup.tokenIds[0] === token.id &&
      activeRangeGroup.tokenIds.some((tid: string) => tatetenGroups.has(tid));

    // Yomigana range group（tateten 重複時はスキップ → tateten-group レベルで処理）
    if (!hasTatetenOverlap && yomiganaGroup && yomiganaGroup.tokenIds[0] === token.id) {
      const baseText = yomiganaGroup.tokenIds
        .map((tid: string) => {
          const t = tokens.find((tok) => tok.id === tid);
          return t?.text ?? '';
        })
        .join('');
      const firstTokenId = yomiganaGroup.tokenIds[0];
      const lastTokenId = yomiganaGroup.tokenIds[yomiganaGroup.tokenIds.length - 1];
      const rangeTokenInfo: RangeTokenInfo =
        firstTokenId && lastTokenId
          ? { from: firstTokenId, to: lastTokenId }
          : { from: '', to: '' };
      rangeCtx = { ...rangeCtx, yomiganaBaseText: baseText, rangeTokenInfo };

      for (const tid of yomiganaGroup.tokenIds.slice(1)) {
        processedTokenIds.add(tid);
      }
    }

    // Okurigana range group（tateten 重複時はスキップ）
    if (!hasTatetenOverlap && okuriganaGroup && okuriganaGroup.tokenIds[0] === token.id) {
      const baseText = okuriganaGroup.tokenIds
        .map((tid: string) => {
          const t = tokens.find((tok) => tok.id === tid);
          return t?.text ?? '';
        })
        .join('');
      const okuriganaValue = (okuriganaGroup.mark as OkuriganaMark).value;
      if (!rangeCtx?.rangeTokenInfo) {
        const firstTokenId = okuriganaGroup.tokenIds[0];
        const lastTokenId = okuriganaGroup.tokenIds[okuriganaGroup.tokenIds.length - 1];
        const rangeTokenInfo: RangeTokenInfo =
          firstTokenId && lastTokenId
            ? { from: firstTokenId, to: lastTokenId }
            : { from: '', to: '' };
        rangeCtx = { ...rangeCtx, okuriganaBaseText: baseText, okuriganaValue, rangeTokenInfo };
      } else {
        rangeCtx = { ...rangeCtx, okuriganaBaseText: baseText, okuriganaValue };
      }

      for (const tid of okuriganaGroup.tokenIds.slice(1)) {
        if (!processedTokenIds.has(tid)) {
          processedTokenIds.add(tid);
        }
      }
    }

    // Soegana range group（tateten 重複時はスキップ）
    if (!hasTatetenOverlap && soeganaGroup && soeganaGroup.tokenIds[0] === token.id) {
      const baseText = soeganaGroup.tokenIds
        .map((tid: string) => {
          const t = tokens.find((tok) => tok.id === tid);
          return t?.text ?? '';
        })
        .join('');
      const soeganaValue = (soeganaGroup.mark as SoeganaMark).value;
      if (!rangeCtx?.rangeTokenInfo) {
        const firstTokenId = soeganaGroup.tokenIds[0];
        const lastTokenId = soeganaGroup.tokenIds[soeganaGroup.tokenIds.length - 1];
        const rangeTokenInfo: RangeTokenInfo =
          firstTokenId && lastTokenId
            ? { from: firstTokenId, to: lastTokenId }
            : { from: '', to: '' };
        rangeCtx = { ...rangeCtx, soeganaBaseText: baseText, soeganaValue, rangeTokenInfo };
      } else {
        rangeCtx = { ...rangeCtx, soeganaBaseText: baseText, soeganaValue };
      }

      for (const tid of soeganaGroup.tokenIds.slice(1)) {
        if (!processedTokenIds.has(tid)) {
          processedTokenIds.add(tid);
        }
      }
    }

    // Collect trailing marks from range group's subsequent tokens（tateten 重複時はスキップ）
    if (!hasTatetenOverlap) {
      const allRangeTokenIds = new Set<string>();
      if (yomiganaGroup && yomiganaGroup.tokenIds[0] === token.id) {
        for (const tid of yomiganaGroup.tokenIds.slice(1)) {
          allRangeTokenIds.add(tid);
        }
      }
      if (okuriganaGroup && okuriganaGroup.tokenIds[0] === token.id) {
        for (const tid of okuriganaGroup.tokenIds.slice(1)) {
          allRangeTokenIds.add(tid);
        }
      }
      if (soeganaGroup && soeganaGroup.tokenIds[0] === token.id) {
        for (const tid of soeganaGroup.tokenIds.slice(1)) {
          allRangeTokenIds.add(tid);
        }
      }
      if (allRangeTokenIds.size > 0) {
        const trailingKaeriMarks: KaeriMark[] = [];
        const trailingKutotenMarks: KutotenMark[] = [];
        const trailingRefMarks: RefMark[] = [];
        const trailingOkimojiMarks: OkimojiMark[] = [];
        const trailingJojiMarks: JojiMark[] = [];
        const trailingEmphasisMarks: EmphasisMark[] = [];
        for (const tid of allRangeTokenIds) {
          const trailingTokenMarks = getMarksForToken(tid, marks, tokens);
          if (profile.kaeriten) {
            const kaeri = trailingTokenMarks.get('kaeri') as KaeriMark[] | undefined;
            if (kaeri) trailingKaeriMarks.push(...kaeri);
          }
          if (profile.kutoten) {
            const kutoten = trailingTokenMarks.get('kutoten') as KutotenMark[] | undefined;
            if (kutoten) trailingKutotenMarks.push(...kutoten);
          }
          if (profile.ref) {
            const ref = trailingTokenMarks.get('ref') as RefMark[] | undefined;
            if (ref) trailingRefMarks.push(...ref);
          }
          {
            const okimoji = trailingTokenMarks.get('okimoji') as OkimojiMark[] | undefined;
            if (okimoji) trailingOkimojiMarks.push(...okimoji);
          }
          {
            const joji = trailingTokenMarks.get('joji') as JojiMark[] | undefined;
            if (joji) trailingJojiMarks.push(...joji);
          }
          if (profile.emphasis) {
            const emphasis = trailingTokenMarks.get('emphasis') as EmphasisMark[] | undefined;
            if (emphasis) trailingEmphasisMarks.push(...emphasis);
          }
        }
        rangeCtx = {
          ...rangeCtx,
          trailingKaeriMarks,
          trailingKutotenMarks,
          trailingRefMarks,
          ...(trailingOkimojiMarks.length > 0 ? { trailingOkimojiMarks } : {}),
          ...(trailingJojiMarks.length > 0 ? { trailingJojiMarks } : {}),
          ...(trailingEmphasisMarks.length > 0 ? { trailingEmphasisMarks } : {}),
        };
      }
    }

    const tokenItem: TokenItem = rangeCtx
      ? { type: 'token', token, rangeCtx }
      : { type: 'token', token };
    entries.push({
      item: tokenItem,
      tatetenMark: profile.tateten ? tatetenMark : undefined,
      highlightMark: profile.highlight ? highlightMark : undefined,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Phase 3: Group flat list into render tree
// ---------------------------------------------------------------------------

/**
 * tateten-group に読み範囲が重複する場合の RangeMarkContext を構築する。
 * 先頭トークンIDで読みグループをルックアップし、全トークンIDが items に含まれる場合に
 * rangeCtx を返す。trailing marks の収集も行う。
 */
function buildTatetenGroupRangeCtx(
  firstTokenId: string,
  items: TokenItem[],
  ctx: BuildTreeContext
): RangeMarkContext | undefined {
  const { tokens, marks, profile, yomiganaRangeGroups, okuriganaRangeGroups, soeganaRangeGroups } =
    ctx;

  const yomiganaGroup = yomiganaRangeGroups.get(firstTokenId);
  const okuriganaGroup = okuriganaRangeGroups.get(firstTokenId);
  const soeganaGroup = soeganaRangeGroups.get(firstTokenId);

  const activeGroup = yomiganaGroup ?? okuriganaGroup ?? soeganaGroup;
  if (!activeGroup || activeGroup.tokenIds[0] !== firstTokenId) return undefined;

  // items のトークンID集合と読みグループのトークンIDが一致するか確認
  const itemTokenIds = new Set(items.map((item) => item.token.id));
  const allMatch = activeGroup.tokenIds.every((tid: string) => itemTokenIds.has(tid));
  if (!allMatch) return undefined;

  let rangeCtx: RangeMarkContext = {};

  // 読み情報を設定
  if (yomiganaGroup && yomiganaGroup.tokenIds[0] === firstTokenId) {
    const baseText = yomiganaGroup.tokenIds
      .map((tid: string) => {
        const t = tokens.find((tok) => tok.id === tid);
        return t?.text ?? '';
      })
      .join('');
    const lastTokenId = yomiganaGroup.tokenIds[yomiganaGroup.tokenIds.length - 1];
    const rangeTokenInfo: RangeTokenInfo =
      firstTokenId && lastTokenId ? { from: firstTokenId, to: lastTokenId } : { from: '', to: '' };
    rangeCtx = { ...rangeCtx, yomiganaBaseText: baseText, rangeTokenInfo };
  }

  if (okuriganaGroup && okuriganaGroup.tokenIds[0] === firstTokenId) {
    const baseText = okuriganaGroup.tokenIds
      .map((tid: string) => {
        const t = tokens.find((tok) => tok.id === tid);
        return t?.text ?? '';
      })
      .join('');
    const okuriganaValue = (okuriganaGroup.mark as OkuriganaMark).value;
    if (!rangeCtx.rangeTokenInfo) {
      const lastTokenId = okuriganaGroup.tokenIds[okuriganaGroup.tokenIds.length - 1];
      const rangeTokenInfo: RangeTokenInfo =
        firstTokenId && lastTokenId
          ? { from: firstTokenId, to: lastTokenId }
          : { from: '', to: '' };
      rangeCtx = { ...rangeCtx, okuriganaBaseText: baseText, okuriganaValue, rangeTokenInfo };
    } else {
      rangeCtx = { ...rangeCtx, okuriganaBaseText: baseText, okuriganaValue };
    }
  }

  if (soeganaGroup && soeganaGroup.tokenIds[0] === firstTokenId) {
    const baseText = soeganaGroup.tokenIds
      .map((tid: string) => {
        const t = tokens.find((tok) => tok.id === tid);
        return t?.text ?? '';
      })
      .join('');
    const soeganaValue = (soeganaGroup.mark as SoeganaMark).value;
    if (!rangeCtx.rangeTokenInfo) {
      const lastTokenId = soeganaGroup.tokenIds[soeganaGroup.tokenIds.length - 1];
      const rangeTokenInfo: RangeTokenInfo =
        firstTokenId && lastTokenId
          ? { from: firstTokenId, to: lastTokenId }
          : { from: '', to: '' };
      rangeCtx = { ...rangeCtx, soeganaBaseText: baseText, soeganaValue, rangeTokenInfo };
    } else {
      rangeCtx = { ...rangeCtx, soeganaBaseText: baseText, soeganaValue };
    }
  }

  return rangeCtx;
}

function groupIntoTree(entries: FlatTokenEntry[], ctx: BuildTreeContext): RenderNode[] {
  if (entries.length === 0) return [];

  const { marks, prefix, profile, refValueMap, tokens } = ctx;

  // ブロック内にルビ付きトークンが存在するか判定（ブロック全体スコープ）。
  // グリッドクラス選択に使用: 同一ブロック内の複数 highlight 間で文字の縦位置を揃える。
  // highlightGroupHasRuby（グループ単位）とは別に管理し、傍線位置とは独立して判定する。
  const blockHasRuby = entries.some((entry) => {
    const tokenMarks = getMarksForToken(entry.item.token.id, marks, tokens);
    return (
      (tokenMarks.get('yomigana')?.length ?? 0) > 0 ||
      (tokenMarks.get('okurigana')?.length ?? 0) > 0 ||
      (tokenMarks.get('soegana')?.length ?? 0) > 0 ||
      !!entry.item.rangeCtx?.yomiganaBaseText ||
      !!entry.item.rangeCtx?.okuriganaBaseText ||
      !!entry.item.rangeCtx?.soeganaBaseText
    );
  });

  // Step 1: Group consecutive entries with same tatetenMark into TatetenGroupNodes
  const tatetenGrouped: Array<{
    node: TokenItem | TatetenGroupNode;
    highlightMark: HighlightMark | undefined;
  }> = [];

  let i = 0;
  while (i < entries.length) {
    const entry = entries[i]!;

    if (entry.tatetenMark) {
      // Start a tateten group: collect consecutive entries with same tatetenMark AND same highlightMark
      const groupTateten = entry.tatetenMark;
      const groupHighlight = entry.highlightMark;
      const items: TokenItem[] = [entry.item];
      i++;
      while (i < entries.length) {
        const next = entries[i]!;
        if (next.tatetenMark === groupTateten && next.highlightMark === groupHighlight) {
          items.push(next.item);
          i++;
        } else {
          break;
        }
      }
      // tateten-group に読み範囲が重複する場合、rangeCtx を構築
      const firstTokenId = items[0]!.token.id;
      const groupRangeCtx = buildTatetenGroupRangeCtx(firstTokenId, items, ctx);

      tatetenGrouped.push({
        node: groupRangeCtx
          ? { type: 'tateten-group', tateten: groupTateten, items, rangeCtx: groupRangeCtx }
          : { type: 'tateten-group', tateten: groupTateten, items },
        highlightMark: groupHighlight,
      });
    } else {
      tatetenGrouped.push({
        node: entry.item,
        highlightMark: entry.highlightMark,
      });
      i++;
    }
  }

  // Step 2: Group consecutive nodes with same highlightMark into HighlightGroupNodes
  const result: RenderNode[] = [];
  let j = 0;
  while (j < tatetenGrouped.length) {
    const current = tatetenGrouped[j]!;

    if (current.highlightMark) {
      const groupHighlight = current.highlightMark;
      const items: (TokenItem | TatetenGroupNode)[] = [current.node];
      j++;
      while (j < tatetenGrouped.length) {
        const next = tatetenGrouped[j]!;
        if (next.highlightMark === groupHighlight) {
          items.push(next.node);
          j++;
        } else {
          break;
        }
      }
      // ADR-015: highlight グループ内の全 token に inHighlightGroup フラグを設定
      // emphasis+highlight 共存時に bare token でも grid 構造を強制するために使用
      //
      // highlightGroupHasRuby: グループ内にルビ付きトークンが存在するか判定。
      // multi-token highlight でルビあり/なしが混在する場合、ルビなしトークンでも
      // ruby 行のスペースを確保して本文位置を揃えるために使用。
      const collectTokenItems = (node: TokenItem | TatetenGroupNode): TokenItem[] =>
        node.type === 'token' ? [node] : node.items;
      const groupHasRuby = items.flatMap(collectTokenItems).some((ti) => {
        const tokenMarks = getMarksForToken(ti.token.id, marks, tokens);
        return (
          (tokenMarks.get('yomigana')?.length ?? 0) > 0 ||
          (tokenMarks.get('okurigana')?.length ?? 0) > 0 ||
          (tokenMarks.get('soegana')?.length ?? 0) > 0 ||
          !!ti.rangeCtx?.yomiganaBaseText ||
          !!ti.rangeCtx?.okuriganaBaseText ||
          !!ti.rangeCtx?.soeganaBaseText
        );
      });
      for (const item of items) {
        if (item.type === 'token') {
          item.rangeCtx = {
            ...item.rangeCtx,
            inHighlightGroup: true,
            highlightGroupHasRuby: groupHasRuby,
            blockHasRuby,
          };
        } else {
          for (const tatetenItem of item.items) {
            tatetenItem.rangeCtx = {
              ...tatetenItem.rangeCtx,
              inHighlightGroup: true,
              highlightGroupHasRuby: groupHasRuby,
              blockHasRuby,
            };
          }
        }
      }
      const refHtml = computeHighlightRefHtml(groupHighlight, marks, prefix, profile, refValueMap);
      result.push({
        type: 'highlight-group',
        highlight: groupHighlight,
        refHtml,
        items,
        hasKana: groupHasRuby,
      });
    } else {
      result.push(current.node);
      j++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a render tree for a single block.
 * @internal
 */
export function buildBlockRenderTree(
  blockId: string,
  blockTokens: Token[],
  ctx: BuildTreeContext
): BlockRenderTree {
  const blockStartHtml = buildBlockStartHtml(blockId, ctx);
  const flatEntries = buildFlatTokenList(blockTokens, ctx);
  const items = groupIntoTree(flatEntries, ctx);

  return { blockId, blockStartHtml, items };
}

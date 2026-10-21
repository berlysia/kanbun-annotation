/**
 * 改行の注記 (linebreak) を置けない場所の判定
 *
 * validator と AIR の組み立てが同じ判定を使う。validator から rendering を import すると
 * 循環するので、この判定は core に置く。import するのは型だけにして、依存の向きを保つ。
 *
 * 竪点のグループの範囲は `rendering/mark-groups.ts` の `getTatetenGroups` と同じ規則を、
 * ここで純粋な関数として別に求めている (`getTatetenGroups` は `../index.js` から値を import するため、
 * ここから使うと循環する)。規則が 2 か所にあるので、一致は `__tests__/linebreak.test.ts` で確かめる。
 */

import type { LinebreakPlacementIssue, Mark, SKAMDocument } from './index.js';

/** after の無い位置 (ブロック先頭) の鍵。字の鍵は `t:` で始まるので衝突しない */
const NO_AFTER = 'b:';

/**
 * 中で改行しない単位を作る anchor の注記 (ADR-014)。
 * highlight、emphasis、okototen は単位を作らないので含めない。
 */
function getAnchorUnitRange(mark: Mark): { from: string; to: string } | undefined {
  switch (mark.type) {
    case 'yomigana':
    case 'okurigana':
    case 'soegana':
    case 'saidoku':
    case 'okimoji':
    case 'joji':
      return mark.anchor;
    default:
      return undefined;
  }
}

/**
 * ブロックの字の並びで、添字 i と i+1 が同じ不可分単位に入る i の集合を返す。
 * 字の並びは block.tokenIds の順。
 */
function getJoinedPositions(
  marks: readonly Mark[],
  indexOf: ReadonlyMap<string, number>,
  size: number
): boolean[] {
  const joined: boolean[] = Array.from({ length: size }, () => false);

  // 竪点: getTatetenGroups と同じく、重なるときは後ろの注記が字を取る
  const tatetenOwner: (number | undefined)[] = Array.from({ length: size }, () => undefined);
  marks.forEach((mark, markIndex) => {
    if (mark.type !== 'tateten') return;
    const from = indexOf.get(mark.anchor.from);
    const to = indexOf.get(mark.anchor.to);
    if (from === undefined || to === undefined) return;
    for (let i = from; i <= to; i++) tatetenOwner[i] = markIndex;
  });
  for (let i = 0; i + 1 < size; i++) {
    const owner = tatetenOwner[i];
    if (owner !== undefined && owner === tatetenOwner[i + 1]) joined[i] = true;
  }

  for (const mark of marks) {
    const range = getAnchorUnitRange(mark);
    if (!range) continue;
    const from = indexOf.get(range.from);
    const to = indexOf.get(range.to);
    if (from === undefined || to === undefined) continue;
    for (let i = from; i < to; i++) joined[i] = true;
  }

  return joined;
}

/**
 * 置けない場所にある linebreak を、marks[] の添字をキーにして返す。
 * 置ける linebreak は含まない。理由は 1 つだけ、次の順で最初に当たるものを返す:
 * block-start、block-end、inside-unit、duplicate。
 *
 * blockId や after が文書の中に無い linebreak は、ここでは判定しない (別の検査が報告する)。
 */
export function getLinebreakPlacementIssues(
  doc: Pick<SKAMDocument, 'blocks' | 'marks'>
): Map<number, LinebreakPlacementIssue> {
  const issues = new Map<number, LinebreakPlacementIssue>();
  const blocksById = new Map<string, { tokenIds: readonly string[] }>();
  for (const block of doc.blocks) {
    if (!blocksById.has(block.id)) blocksById.set(block.id, block);
  }

  // ブロックごとの索引は、そのブロックに linebreak があるときだけ作る
  const blockCache = new Map<
    string,
    { indexOf: Map<string, number>; joined: boolean[]; size: number }
  >();
  const getBlockInfo = (blockId: string) => {
    const cached = blockCache.get(blockId);
    if (cached) return cached;
    const block = blocksById.get(blockId);
    if (!block) return undefined;
    const indexOf = new Map<string, number>();
    block.tokenIds.forEach((id, i) => {
      if (!indexOf.has(id)) indexOf.set(id, i);
    });
    const info = {
      indexOf,
      size: block.tokenIds.length,
      joined: getJoinedPositions(doc.marks, indexOf, block.tokenIds.length),
    };
    blockCache.set(blockId, info);
    return info;
  };

  // blockId と after の組を数える。入れ子の Map にして、id の文字列を連結しない
  const seen = new Map<string, Set<string>>();
  doc.marks.forEach((mark, markIndex) => {
    if (mark.type !== 'linebreak') return;
    const { blockId, after } = mark.position;
    const info = getBlockInfo(blockId);
    if (!info) return;

    let placed = seen.get(blockId);
    if (!placed) {
      placed = new Set();
      seen.set(blockId, placed);
    }
    const isRepeat = after === undefined ? placed.has(NO_AFTER) : placed.has(`t:${after}`);
    placed.add(after === undefined ? NO_AFTER : `t:${after}`);

    if (after === undefined) {
      issues.set(markIndex, 'block-start');
      return;
    }
    const index = info.indexOf.get(after);
    if (index === undefined) return;
    if (index === info.size - 1) {
      issues.set(markIndex, 'block-end');
    } else if (info.joined[index]) {
      issues.set(markIndex, 'inside-unit');
    } else if (isRepeat) {
      issues.set(markIndex, 'duplicate');
    }
  });

  return issues;
}

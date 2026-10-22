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

import type {
  LinebreakPlacementIssue,
  Mark,
  OkuriganaMark,
  SKAMDocument,
  SoeganaMark,
  YomiganaMark,
} from './index.js';

/** after の無い位置 (ブロック先頭) の鍵。字の鍵は `t:` で始まるので衝突しない */
const NO_AFTER = 'b:';

/** 描く読みと、そのブロックの字の並びでの範囲 (両端を含む添字) */
export interface DrawnReading {
  mark: YomiganaMark | OkuriganaMark | SoeganaMark;
  from: number;
  to: number;
}

/**
 * 「すでに選んだ範囲のどれかと 1 字でも共有するか」を答える表 (Fenwick tree)。
 * 選んだ範囲は互いに重ならないので、印を付ける字の数の合計は字の数以下で、
 * 全体の計算は (読みの数 + 字の数) × log(字の数) に比例する。
 */
interface CoverageIndex {
  intersects(from: number, to: number): boolean;
  cover(from: number, to: number): void;
}

function createCoverageIndex(size: number): CoverageIndex {
  const tree: number[] = Array.from({ length: size + 1 }, () => 0);
  const prefix = (count: number): number => {
    let sum = 0;
    for (let i = count; i > 0; i -= i & -i) sum += tree[i]!;
    return sum;
  };
  return {
    intersects: (from, to) => prefix(to + 1) - prefix(from) > 0,
    cover(from, to) {
      for (let position = from; position <= to; position++) {
        for (let i = position + 1; i <= size; i += i & -i) tree[i]! += 1;
      }
    },
  };
}

/**
 * 描く読み (yomigana、okurigana、soegana) を選ぶ。
 *
 * 種類ごとに marks[] の順に見て、すでに選んだ同じ種類の読みと 1 字も共有しない読みだけを選ぶ
 * (連鎖 A(t1-t2)、B(t2-t3)、C(t3-t4) では A と C を選び B を捨てる)。anchor が同じ 2 つ目以降も
 * 1 字を共有するので捨てる。捨てた読みは描かず、不可分単位にもしない。
 * 両端が `indexOf` に無い読みと、始まりが終わりより後の読みは選ばない。返す順は marks[] の順。
 *
 * AIR (`rendering/build-annotation-ir.ts`) と不可分単位の判定が同じ読みを選ぶために共有する。
 * 公開 API ではない。
 *
 * @internal
 */
export function selectDrawnReadings(
  marks: readonly Mark[],
  indexOf: ReadonlyMap<string, number>
): DrawnReading[] {
  const coverage = new Map<Mark['type'], CoverageIndex>();
  let size = 0;
  for (const index of indexOf.values()) size = Math.max(size, index + 1);
  const drawn: DrawnReading[] = [];
  for (const mark of marks) {
    if (mark.type !== 'yomigana' && mark.type !== 'okurigana' && mark.type !== 'soegana') continue;
    const from = indexOf.get(mark.anchor.from);
    const to = indexOf.get(mark.anchor.to);
    if (from === undefined || to === undefined || from > to) continue;
    let covered = coverage.get(mark.type);
    if (!covered) {
      covered = createCoverageIndex(size);
      coverage.set(mark.type, covered);
    }
    if (covered.intersects(from, to)) continue;
    covered.cover(from, to);
    drawn.push({ mark, from, to });
  }
  return drawn;
}

/**
 * 中で改行しない単位を作る anchor の注記 (ADR-014)。
 * highlight、emphasis、okototen は単位を作らない。yomigana、okurigana、soegana は
 * `selectDrawnReadings` が選んだ読みだけが単位を作るので、ここには含めない。
 */
function getAnchorUnitRange(mark: Mark): { from: string; to: string } | undefined {
  switch (mark.type) {
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
 * 字の並びは block.tokenIds の順。AIR (`rendering/build-annotation-ir.ts`) が、字の
 * `joinedWithNext` を決めるのにも使う。公開 API ではない。
 *
 * @internal
 */
export function getJoinedPositions(
  marks: readonly Mark[],
  indexOf: ReadonlyMap<string, number>,
  size: number
): boolean[] {
  const joined: boolean[] = Array.from({ length: size }, () => false);

  // 竪点: getTatetenGroups と同じく、各竪点の範囲の隣り合う字の組を不可分にする (重なる竪点は和集合)
  for (const mark of marks) {
    if (mark.type !== 'tateten') continue;
    const from = indexOf.get(mark.anchor.from);
    const to = indexOf.get(mark.anchor.to);
    if (from === undefined || to === undefined) continue;
    for (let i = from; i < to; i++) joined[i] = true;
  }

  // 読み: 描く読みだけが単位を作る
  for (const { from, to } of selectDrawnReadings(marks, indexOf)) {
    for (let i = from; i < to; i++) joined[i] = true;
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

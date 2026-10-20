/**
 * 古事記の全文の文書の検査。bench の準備で 1 回呼ぶ (CI の test:run では全文を使わない)。
 * ファイルを読まない純粋関数で、満たさない検査があれば、その名前を含むエラーを投げる。
 */

import { validateSKAMDocument, type Mark, type SKAMDocument } from '@kanbun-skam/skam';
import { KOJIKI_TOKEN_COUNT } from '../fixtures/kojiki/build-document.ts';

export interface KojikiDocuments {
  /** buildKojikiDocument() */
  readonly full: SKAMDocument;
  /** 上卷、中卷、下卷の順 */
  readonly volumes: readonly [SKAMDocument, SKAMDocument, SKAMDocument];
  /** buildKojikiDocument({ synthetic: false }) */
  readonly plain: SKAMDocument;
  /** full をもう一度組んだもの (組み立てが決定的であることの確認) */
  readonly fullAgain: SKAMDocument;
}

export interface KojikiExpectedCounts {
  readonly tokenCount: number;
  readonly kaeriCount: number;
  readonly dottedCount: number;
  /** 上巻の下線 (solid の highlight) */
  readonly firstVolumeUnderlines: number;
  /** 上巻の異文の ref ({{另}} 146 件から、割注の中の 13、下線の中の 4、1 引数の 1 を除いた数) */
  readonly firstVolumeVariants: number;
}

/** 2026-10-21 の版で数えた値。版か合成の規則を変えたら直す (README.md) */
export const KOJIKI_EXPECTED_COUNTS: KojikiExpectedCounts = {
  tokenCount: KOJIKI_TOKEN_COUNT,
  kaeriCount: 7000,
  dottedCount: 828,
  firstVolumeUnderlines: 25,
  firstVolumeVariants: 128,
};

export class KojikiCheckError extends Error {
  override readonly name = 'KojikiCheckError';
  constructor(check: string, detail: string) {
    super(`kojiki check "${check}" failed: ${detail}`);
  }
}

const ALLOWED_TOKEN = /^[㐀-䶿一-鿿豈-﫿\u{20000}-\u{323AF}々〓]$/u;

function countMarks(doc: SKAMDocument, predicate: (mark: Mark) => boolean): number {
  return doc.marks.filter(predicate).length;
}

function isDotted(mark: Mark): boolean {
  return mark.type === 'highlight' && mark.style === 'dotted';
}

function isSolid(mark: Mark): boolean {
  return mark.type === 'highlight' && mark.style === 'solid';
}

/** token ごとの注記を、anchor と position の双方から引いて文字列にする */
function marksByToken(doc: SKAMDocument): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const add = (tokenId: string, mark: Mark): void => {
    const list = result.get(tokenId) ?? [];
    list.push(JSON.stringify(mark));
    result.set(tokenId, list);
  };
  for (const mark of doc.marks) {
    if ('anchor' in mark) add(mark.anchor.from, mark);
    else if (mark.position.after !== undefined) add(mark.position.after, mark);
    else add(`block-start:${mark.position.blockId}`, mark);
  }
  return result;
}

function expectEqual(check: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new KojikiCheckError(check, `expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function checkKojikiDocuments(
  docs: KojikiDocuments,
  expected: KojikiExpectedCounts = KOJIKI_EXPECTED_COUNTS
): void {
  const { full, volumes, plain, fullAgain } = docs;

  const all: readonly (readonly [string, SKAMDocument])[] = [
    ['full', full],
    ['上卷', volumes[0]],
    ['中卷', volumes[1]],
    ['下卷', volumes[2]],
    ['non-synthetic full', plain],
  ];
  for (const [name, doc] of all) {
    const result = validateSKAMDocument(doc);
    if (!result.valid) {
      throw new KojikiCheckError(
        'validateSKAMDocument',
        `${name}: ${JSON.stringify(result.errors.slice(0, 3))}`
      );
    }
  }

  expectEqual('token count', full.tokens.length, expected.tokenCount);
  expectEqual(
    'volumes split the tokens',
    volumes.reduce((sum, doc) => sum + doc.tokens.length, 0),
    full.tokens.length
  );

  const volumeMarks = marksByToken(volumes[0]);
  const fullMarks = marksByToken(full);
  if (volumes[0].tokens.length === 0) {
    throw new KojikiCheckError('first volume marks match the full text', 'no tokens');
  }
  for (const token of volumes[0].tokens) {
    const a = JSON.stringify(volumeMarks.get(token.id) ?? []);
    const b = JSON.stringify(fullMarks.get(token.id) ?? []);
    if (a !== b) {
      throw new KojikiCheckError('first volume marks match the full text', `token ${token.id}`);
    }
  }

  const tokenCount = full.tokens.length;
  expectEqual(
    'yomigana count',
    countMarks(full, (m) => m.type === 'yomigana'),
    Math.ceil(tokenCount / 4)
  );
  expectEqual(
    'okurigana count',
    countMarks(full, (m) => m.type === 'okurigana'),
    Math.floor((tokenCount + 4) / 6)
  );
  expectEqual(
    'kaeri count',
    countMarks(full, (m) => m.type === 'kaeri'),
    expected.kaeriCount
  );
  expectEqual('dotted highlight count', countMarks(full, isDotted), expected.dottedCount);

  for (const type of ['yomigana', 'okurigana', 'kaeri'] as const) {
    expectEqual(
      `non-synthetic has no ${type}`,
      countMarks(plain, (m) => m.type === type),
      0
    );
  }
  expectEqual('non-synthetic has no dotted highlight', countMarks(plain, isDotted), 0);
  for (const [label, predicate] of [
    ['kutoten', (m: Mark) => m.type === 'kutoten'],
    ['ref', (m: Mark) => m.type === 'ref'],
    ['solid highlight', isSolid],
  ] as const) {
    expectEqual(
      `non-synthetic keeps ${label}`,
      countMarks(plain, predicate),
      countMarks(full, predicate)
    );
  }

  expectEqual(
    'first volume underlines',
    countMarks(volumes[0], isSolid),
    expected.firstVolumeUnderlines
  );
  expectEqual(
    'first volume variants',
    countMarks(volumes[0], (m) => m.type === 'ref' && (m.content ?? '').startsWith('異本: ')),
    expected.firstVolumeVariants
  );

  for (const token of full.tokens) {
    if (!ALLOWED_TOKEN.test(token.text)) {
      throw new KojikiCheckError('allowed characters', `token ${token.id}`);
    }
  }

  const blockOf = new Map<string, { blockId: string; index: number }>();
  for (const block of full.blocks) {
    block.tokenIds.forEach((id, index) => blockOf.set(id, { blockId: block.id, index }));
  }
  for (const mark of full.marks) {
    if (mark.type !== 'highlight' || mark.style !== 'dotted') continue;
    const from = blockOf.get(mark.anchor.from);
    const to = blockOf.get(mark.anchor.to);
    if (!from || !to || from.blockId !== to.blockId || to.index - from.index !== 2) {
      throw new KojikiCheckError('dotted highlight position', `mark ${mark.id ?? '(no id)'}`);
    }
  }

  for (const block of full.blocks) {
    if (block.tokenIds.length === 0) {
      throw new KojikiCheckError('no empty block', `block ${block.id}`);
    }
  }

  if (JSON.stringify(fullAgain) !== JSON.stringify(full)) {
    throw new KojikiCheckError('deterministic build', 'two builds differ');
  }
}

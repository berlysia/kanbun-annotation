/**
 * 複数の字の kaeri (`㆒㆑`) を、同じ位置の 1 字ずつの注記に分ける変換
 *
 * 0.4.0 で複数の字の kaeri が誤りになった後も、0.3 の文書を移す手段として残す。
 */

import type { SKAMDocument, Mark } from './index.js';
import { createRandomIdGenerator, type IdGenerator } from './id-generator.js';

/** Kanbun ブロックの字 2 字以上 (validator の値の形と同じ範囲) */
const MULTI_CHARACTER_KAERI = /^[㆑-㆟]{2,}$/;

/** 新しい id が重なったときに生成器を呼び直す上限 */
const MAX_ID_ATTEMPTS = 100;

function collectIds(doc: SKAMDocument): Set<string> {
  const ids = new Set<string>();
  for (const block of doc.blocks) ids.add(block.id);
  for (const token of doc.tokens) ids.add(token.id);
  for (const mark of doc.marks) {
    if (typeof mark.id === 'string') ids.add(mark.id);
  }
  return ids;
}

/**
 * 値が 2 字以上の kaeri の注記を、同じ `position` の 1 字ずつの注記に分けた新しい文書を返す。
 *
 * - 分けた注記は元の注記があった marks[] の位置に、字の順で並べる
 * - 1 つ目は元の `id` と `ext` を引き継ぐ。2 つ目以降は `idGenerator` で新しい id を振り、`ext` は持たない
 *   (`ext` を写すと同じ内容を複数の注記が持つことになるため)
 * - 新しい id が文書の既存の id (blocks、tokens、marks) やこの変換で振った id と重なったら、
 *   生成器を呼び直す。100 回続けて重なったら `Error` を投げる
 * - 値が Kanbun の字以外を含む kaeri は変えずに残す (validator の誤りのまま)
 * - 渡された文書は書き換えない。2 回適用しても結果は変わらない
 *
 * 自動では呼ばれない。parser も validator も文書を分けない
 */
export function splitMultiCharacterKaeri(
  doc: SKAMDocument,
  options?: { idGenerator?: IdGenerator }
): SKAMDocument {
  const idGenerator = options?.idGenerator ?? createRandomIdGenerator();
  const usedIds = collectIds(doc);

  const issueId = (): string => {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const id = idGenerator.generate('k');
      if (!usedIds.has(id)) {
        usedIds.add(id);
        return id;
      }
    }
    throw new Error(
      `splitMultiCharacterKaeri: could not generate an unused id in ${MAX_ID_ATTEMPTS} attempts`
    );
  };

  const marks: Mark[] = [];
  for (const mark of doc.marks) {
    if (mark.type !== 'kaeri' || !MULTI_CHARACTER_KAERI.test(mark.value)) {
      marks.push(structuredClone(mark));
      continue;
    }
    // Kanbun ブロックの字は BMP 内の 1 code unit なので、スプレッドで 1 字ずつになる
    [...mark.value].forEach((character, index) => {
      if (index === 0) {
        marks.push({ ...structuredClone(mark), value: character });
      } else {
        marks.push({
          type: 'kaeri',
          id: issueId(),
          position: structuredClone(mark.position),
          value: character,
        });
      }
    });
  }

  return { ...structuredClone({ ...doc, marks: [] }), marks };
}

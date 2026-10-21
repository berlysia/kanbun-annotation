/**
 * playground の見本 (packages/playground/src/samples.ts の KanbunKundoku の 4 つ) を作り直す手順。
 * `node src/kundoku/make-samples.ts` (cache が要る。`pnpm bench` か `node src/kundoku/cli.ts` で用意する)。
 * Node の型の除去で動くので、構文は型の注釈だけにする。
 *
 * 1. SELECTED_SENTENCES が空なら、候補を文の添字の順に出す。候補は、20 字以下、句読点を除いて 4 字以上、
 *    右の仮名が仮名だけ、S と K の字を含まない文 (推測を含む規則の分岐を通らない)。
 * 2. 4 文を人が選ぶ: レ、一二、一レ (または上下)、竪点をそれぞれ 1 つ以上含み、書き下し文と照らして読んで
 *    意味が通るもの。選んだ添字を SELECTED_SENTENCES に書く。
 * 3. SELECTED_SENTENCES があれば、その文の SKAM-ML と書き下し文を出す。samples.ts に写す。
 *
 * commit を上げたときは、添字が指す文が変わりうるので、この手順を最初からやり直す。
 */

import { stringify } from '@kanbun-skam/skam-xml-stringify';
import type { SKAMDocument } from '@kanbun-skam/skam';
import {
  buildKundokuSentence,
  readKundokuJson,
  type KundokuAnnotatedSentence,
  type KundokuTwoTypesSentence,
} from './build-document.ts';

/** 見本にする文の添字 (annotated/test.json の配列の添字) */
const SELECTED_SENTENCES: readonly number[] = [278, 103, 190, 890];

const MAX_CHARACTERS = 20;
const MIN_TOKENS = 4;
const HIRAGANA_ONLY = /^[ぁ-ゖ]*$/u;
const PUNCTUATION = /^[。、]$/u;

function isCandidate(a: KundokuAnnotatedSentence, t: KundokuTwoTypesSentence): boolean {
  if (a.characters.length > MAX_CHARACTERS) return false;
  const tokens = a.characters.filter((c) => !PUNCTUATION.test(c.character));
  if (tokens.length < MIN_TOKENS) return false;
  if (a.characters.some((c) => /[SK]/.test(c.particle))) return false;
  return t.characters.every((c) => HIRAGANA_ONLY.test(c.right));
}

/** 候補の絞り込みの目安: どの訓点を含むか */
function featuresOf(t: KundokuTwoTypesSentence): string {
  const lefts = t.characters.map((c) => c.left);
  const has = (predicate: (left: string) => boolean): boolean => lefts.some(predicate);
  return [
    has((l) => l === 'レ') ? 'レ' : '',
    has((l) => l === '一' || l === '二') ? '一二' : '',
    has((l) => l === '一レ') ? '一レ' : '',
    has((l) => l === '上' || l === '下') ? '上下' : '',
    has((l) => l.endsWith('-')) ? '竪点' : '',
  ]
    .filter((feature) => feature !== '')
    .join(' ');
}

const { annotated, twoTypes } = readKundokuJson();
const as = annotated as KundokuAnnotatedSentence[];
const ts = twoTypes as KundokuTwoTypesSentence[];

if (SELECTED_SENTENCES.length === 0) {
  as.forEach((a, index) => {
    const t = ts[index]!;
    if (!isCandidate(a, t)) return;
    const text = a.characters.map((c) => c.character).join('');
    console.log(`${index}\t${text}\t${a.japanese_translation ?? ''}\t${featuresOf(t)}`);
  });
} else {
  for (const index of SELECTED_SENTENCES) {
    const a = as[index]!;
    const sentence = buildKundokuSentence(a, ts[index]!, 0);
    const document: SKAMDocument = {
      format: 'skam@0.1',
      tokens: sentence.tokens,
      blocks: [sentence.block],
      marks: sentence.marks,
      readings:
        a.japanese_translation === undefined
          ? []
          : [{ kind: 'kakikudashi', text: a.japanese_translation }],
    };
    console.log(`// sentence ${index}: ${a.characters.map((c) => c.character).join('')}`);
    console.log(stringify(document));
  }
}

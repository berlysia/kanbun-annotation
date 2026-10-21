/**
 * KanbunKundoku の `test` (930 文、本物の訓点) の描画時間を測る。`pnpm bench` から実行する
 * (データは初回に取得する。説明は src/kundoku/README.md)。
 *
 * 対象: AIR (buildAnnotationIR)、html (render)、canvas (render + 偽の canvas)。
 * 古事記の bench と違い、注記は合成でなく実データの訓点なので、実際の訓点本に近い密度で測れる。
 * 古事記と同じく 1 つの文書にまとめ、回数を絞る (time: 0 で時間による反復を止め、iterations で決める)。
 */

import { bench, describe } from 'vitest';
import { buildAnnotationIR, RENDER_PROFILES } from '@kanbun-skam/skam/rendering';
import { validateSKAMDocument, type SKAMDocument } from '@kanbun-skam/skam';
import { render as renderCanvas } from '@kanbun-skam/skam-canvas-renderer';
import { render as renderHtml } from '@kanbun-skam/skam-html-renderer';
import { buildKundokuDocument } from '../kundoku/build-document.ts';
import { KUNDOKU_EXPECTED_COUNTS } from '../kundoku/source-pin.ts';
import { createFakeCanvas } from './fake-canvas.ts';

const OPTIONS = { iterations: 3, warmupIterations: 1, time: 0, warmupTime: 0 };

/** 文書を組み、妥当で、件数が固定した値と一致することを確かめる。満たさなければ計測を始めずに止まる */
function prepare(): SKAMDocument {
  const { document, counts } = buildKundokuDocument();
  const result = validateSKAMDocument(document);
  if (!result.valid) {
    throw new Error(`kundoku document is invalid: ${JSON.stringify(result.errors.slice(0, 3))}`);
  }
  const mismatches = (Object.keys(KUNDOKU_EXPECTED_COUNTS) as (keyof typeof counts)[]).filter(
    (key) => counts[key] !== KUNDOKU_EXPECTED_COUNTS[key]
  );
  if (mismatches.length > 0) {
    throw new Error(
      `kundoku counts differ from source-pin.ts: ${mismatches
        .map((key) => `${key} expected ${KUNDOKU_EXPECTED_COUNTS[key]}, got ${counts[key]}`)
        .join('; ')}`
    );
  }
  console.log(
    `kundoku prep: ${counts.sentences} sentences, ${counts.tokens} tokens, ${counts.kaeri} kaeri, ` +
      `${counts.tateten} tateten, ${counts.okurigana} okurigana, ${counts.soegana} soegana, ` +
      `${counts.punctuation} punctuation`
  );
  return document;
}

const doc = prepare();

/** 描画が実際に走ったことを、計測の前に 1 回ずつ確かめる (空の出力を速いと誤読しないため) */
function assertRenders(target: SKAMDocument): void {
  const air = buildAnnotationIR(target, RENDER_PROFILES.full);
  if (air.blocks.length !== target.blocks.length) {
    throw new Error(`AIR has ${air.blocks.length} blocks, expected ${target.blocks.length}`);
  }
  const { html } = renderHtml(target);
  if (html.length < target.tokens.length) {
    throw new Error(`html is ${html.length} chars for ${target.tokens.length} tokens`);
  }
  const canvas = createFakeCanvas();
  renderCanvas(target, canvas);
  if (canvas.stats.fillText < 1) throw new Error('canvas render made no fillText call');
}

assertRenders(doc);

describe(`KanbunKundoku test: 930 文を 1 文書にしたもの (${doc.tokens.length} 字)`, () => {
  bench(
    'AIR',
    () => {
      buildAnnotationIR(doc, RENDER_PROFILES.full);
    },
    OPTIONS
  );
  bench(
    'html',
    () => {
      renderHtml(doc);
    },
    OPTIONS
  );
  bench(
    'canvas',
    () => {
      renderCanvas(doc, createFakeCanvas());
    },
    OPTIONS
  );
});

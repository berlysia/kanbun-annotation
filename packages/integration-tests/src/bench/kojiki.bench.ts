/**
 * 古事記 (約 4.2 万字) の描画時間を測る。`pnpm bench` から実行する (本文は初回に取得する。説明は packages/kojiki/README.md)。
 *
 * 対象: AIR (buildAnnotationIR)、html (render)、canvas (render + 偽の canvas)。
 * 文書: 上巻・中巻・下巻・全巻・全巻の原文由来の注記だけ。合成の注記の密度は人工の値で、
 * 時間は同じ規則の中での比較にだけ使う。
 *
 * 1 件が長いので回数を絞っている (time: 0 で時間による反復を止め、iterations で回数を決める)。
 */

import { bench, describe } from 'vitest';
import { buildAnnotationIR, RENDER_PROFILES } from '@kanbun-skam/skam/rendering';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { render as renderCanvas } from '@kanbun-skam/skam-canvas-renderer';
import { render as renderHtml } from '@kanbun-skam/skam-html-renderer';
import { buildKojikiDocument } from '@kanbun-skam/kojiki';
import { checkKojikiDocuments } from './check-kojiki-documents.ts';
import { createFakeCanvas } from './fake-canvas.ts';

const documents: readonly { name: string; doc: SKAMDocument }[] = [
  { name: '上巻', doc: buildKojikiDocument({ volume: '上卷' }) },
  { name: '中巻', doc: buildKojikiDocument({ volume: '中卷' }) },
  { name: '下巻', doc: buildKojikiDocument({ volume: '下卷' }) },
  { name: '全巻', doc: buildKojikiDocument() },
  { name: '全巻 (原文由来の注記のみ)', doc: buildKojikiDocument({ synthetic: false }) },
];

const OPTIONS = { iterations: 3, warmupIterations: 1, time: 0, warmupTime: 0 };

// 全文の文書の検査は CI では走らせない。満たさなければ、計測を始めずに止まる
checkKojikiDocuments({
  full: documents[3]!.doc,
  volumes: [documents[0]!.doc, documents[1]!.doc, documents[2]!.doc],
  plain: documents[4]!.doc,
  fullAgain: buildKojikiDocument(),
});

/** 描画が実際に走ったことを、計測の前に 1 回ずつ確かめる (空の出力を速いと誤読しないため) */
function assertRenders(doc: SKAMDocument): void {
  const air = buildAnnotationIR(doc, RENDER_PROFILES.full);
  if (air.blocks.length !== doc.blocks.length) {
    throw new Error(`AIR has ${air.blocks.length} blocks, expected ${doc.blocks.length}`);
  }
  const { html } = renderHtml(doc);
  if (html.length < doc.tokens.length) {
    throw new Error(`html is ${html.length} chars for ${doc.tokens.length} tokens`);
  }
  const canvas = createFakeCanvas();
  renderCanvas(doc, canvas);
  if (canvas.stats.fillText < 1) throw new Error('canvas render made no fillText call');
}

for (const { doc } of documents) assertRenders(doc);

for (const { name, doc } of documents) {
  describe(`${name} (${doc.tokens.length} 字)`, () => {
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
}

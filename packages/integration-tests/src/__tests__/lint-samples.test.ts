/**
 * playground の例 (SAMPLES) に未完成の診断が出ないことの確認。
 *
 * 例は手で書いた正しい文書として配っているので、診断が出たら
 * 例が実際に未完成か、規則の誤検出かのどちらか。
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { lintSKAMDocument } from '@kanbun-skam/skam';
import { parse } from '@kanbun-skam/skam-xml-parser';

// integration-tests の rootDir (src) の外なので、型を解決させない動的 import で読む
const samplesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../playground/src/samples.ts'
);
const { SAMPLES } = (await import(pathToFileURL(samplesPath).href)) as {
  SAMPLES: { name: string; xml: string }[];
};

describe('playground の例の lint', () => {
  it('例を読めている', () => {
    expect(SAMPLES.length).toBeGreaterThan(0);
  });

  // 例のうち 5 つに KAERI_UNCLOSED が出る。どれも例が実際に未完成で、規則の誤検出ではない:
  // - 學而時習之、論語、添え仮名、傍線(試験問題形式): 最後の字 (之) の後ろにレがある。レは次の字と入れ替える点
  //   (SKAM-draft §7.6 のアルゴリズムの説明) で、ブロックの最後の字には入れ替える相手が無い。
  //   同じ節の例「學而時習之」も之にレを付けていて、説明と食い違っている (例の方を直す候補)。
  // - 複合返り点(一レ点): 一があるのに、対になる二が無い。
  // 例を直したら、この一覧を空にする
  const UNCLOSED_SAMPLES = [
    '學而時習之（基本）',
    '論語（複数ブロック）',
    '複合返り点（一レ点）',
    '添え仮名（を）',
    '傍線（試験問題形式）',
  ];

  it('診断は UNCLOSED_SAMPLES の KAERI_UNCLOSED 1 件ずつだけ', () => {
    const found = SAMPLES.flatMap(({ name, xml }) =>
      lintSKAMDocument(parse(xml)).map((d) => `${name}: ${d.code}`)
    );
    expect(found).toEqual(UNCLOSED_SAMPLES.map((name) => `${name}: KAERI_UNCLOSED`));
  });
});

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

  it('どの例にも診断が出ない', () => {
    const found = SAMPLES.flatMap(({ name, xml }) =>
      lintSKAMDocument(parse(xml)).map((d) => `${name}: ${d.code}`)
    );
    expect(found).toEqual([]);
  });
});

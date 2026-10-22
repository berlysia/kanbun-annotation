/**
 * 重なりの無い文書の html の DOM が、重なる範囲の描画を足す前 (c34e924) と同じであることの常設の回帰テスト。
 *
 * 対象は parser の valid fixture と playground の例。期待 (`../fixtures/no-overlap-dom.json`、
 * 文書の名前 → DOM の文字列。`#ruby` の付く名前は `rubyMethod: 'ruby'`) は c34e924 の html renderer で取ったもの。
 *
 * 期待を取り直す手順 (c34e924 のビルドが要る。今の作業木の dist では取れない):
 * 1. `git archive c34e924 | tar -x -C <空のディレクトリ>` で展開し、そこで `pnpm install --frozen-lockfile && pnpm build`
 * 2. そのビルドの `packages/skam-xml-parser/dist` で各文書を parse し、`packages/skam-html-renderer/dist` の
 *    `render(doc).html` と `render(doc, { rubyMethod: 'ruby' }).html` を、名前 (`fixture/<ファイル名>`、
 *    `sample/<例の name>`、後者に `#ruby`) をキーにして JSON に書く。文書は今の作業木の fixture と `samples.ts` を使う
 *
 * 文書の名前 `extra/<ファイル名>` は `../fixtures/no-overlap-extra/` の文書 (同じ手順で、文書だけ今の作業木から読む)。
 *
 * 比べる前に、今の DOM を次のように直す。
 * - ruby 方式の `<rb>` の中の字ごとの要素 (`skam-base-seg`) を連結する。範囲の読みの本文を字ごとの要素に分けたのは意図した変化
 * - 下の `BY_DESIGN` の文書だけ、理由つきの直しをする
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { render } from '@kanbun-skam/skam-html-renderer';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, '../../../skam-xml-parser/src/__tests__/fixtures/valid');
// parser の fixture に無い、同じ位置に注記が重なる文書 (ref 2 つ、句読点 2 つ)。期待は同じ手順で取る
const extraDir = join(here, '../fixtures/no-overlap-extra');
const expected = JSON.parse(
  readFileSync(join(here, '../fixtures/no-overlap-dom.json'), 'utf8')
) as Record<string, string>;

// integration-tests の rootDir (src) の外なので、型を解決させない動的 import で読む
const samplesPath = resolve(here, '../../../playground/src/samples.ts');
const { SAMPLES } = (await import(pathToFileURL(samplesPath).href)) as {
  SAMPLES: { name: string; xml: string }[];
};

const documents: { name: string; xml: string }[] = [
  ...readdirSync(fixtureDir)
    .filter((f) => f.endsWith('.xml'))
    .sort()
    .map((f) => ({ name: `fixture/${f}`, xml: readFileSync(join(fixtureDir, f), 'utf8') })),
  ...SAMPLES.map((s) => ({ name: `sample/${s.name}`, xml: s.xml })),
  ...readdirSync(extraDir)
    .filter((f) => f.endsWith('.xml'))
    .sort()
    .map((f) => ({ name: `extra/${f}`, xml: readFileSync(join(extraDir, f), 'utf8') })),
];

/** ruby 方式の `<rb>` の中の字ごとの要素を連結した形にする */
function joinRubySegments(html: string): string {
  return html.replace(
    /(<rb [^>]*>)((?:<span class="skam-base-seg">[^<]*<\/span>)+)(<\/rb>)/g,
    (_match, open: string, segments: string, close: string) =>
      `${open}${[...segments.matchAll(/<span class="skam-base-seg">([^<]*)<\/span>/g)].map((m) => m[1]).join('')}${close}`
  );
}

/** 隣り合う、読みの無い 2 つの字の要素 (間に `<wbr>` が無いもの) を 1 つにつなぐ */
function mergeAdjacentBareTokens(html: string): string {
  return html.replaceAll('</span></span><span class="skam-token"><span class="skam-base">', '');
}

/**
 * c34e924 と DOM が変わる文書。変わる理由は意図した変化か、c34e924 の描画が自分の規則どおりに描けていなかったことで、
 * どちらも変わった DOM を新しい期待にしている。ここに無い文書は、上の直しだけで c34e924 と一致しなければならない。
 */
const BY_DESIGN: Record<
  string,
  { reason: string; fixOld?: (old: string) => string; fixNew?: (current: string) => string }
> = {
  'sample/春曉（五言絶句）': {
    reason:
      '範囲の添え仮名 (風雨の ノ) は区間にせず、範囲の最後の字の slot に置く。c34e924 は範囲の字を 1 つの skam-token に' +
      'つないでいたが、今は字ごとの skam-token になる (見た目の並びは同じ)。比べるときは読みの無い隣り合う字をつなぐ',
    fixOld: mergeAdjacentBareTokens,
    fixNew: mergeAdjacentBareTokens,
  },
  'sample/春曉（五言絶句）#ruby': {
    reason: '上と同じ',
    fixOld: mergeAdjacentBareTokens,
    fixNew: mergeAdjacentBareTokens,
  },
  'sample/傍点＋傍線（配置順確認）': {
    reason:
      '傍線の中の竪点の中に読み付きの字がある (學 まな + 而) とき、ブロックに読みがあるかの判定は傍線の孫まで見る。' +
      'c34e924 は傍線の直下の字しか見ず、この例の 14 番目のブロックで 而 を「読みの行が無い」3 行の格子で描いて、' +
      '同じ傍線の中の 學 (読みの行がある 4 行の格子) と文字の縦位置がそろっていなかった。' +
      'ブロックに読みがあるなら 4 行の格子で描く、という c34e924 のコメントの規則どおりになる',
    fixOld: (old) => {
      const before =
        'emphasis-no-ruby"><span class="skam-emphasis-row" aria-hidden="true">﹅</span><span class="skam-base">而';
      expect(old.split(before)).toHaveLength(2);
      return old.replace(
        before,
        'emphasis"><span class="skam-emphasis-row" aria-hidden="true">﹅</span><span class="skam-ruby"></span><span class="skam-base">而'
      );
    },
  },
};

describe('html of documents without overlapping ranges is unchanged from c34e924', () => {
  it('has the expected DOM of every fixture and sample, in both ruby methods', () => {
    expect(documents.length).toBeGreaterThanOrEqual(31 + 20);
    expect(Object.keys(expected).sort()).toEqual(
      documents.flatMap((d) => [d.name, `${d.name}#ruby`]).sort()
    );
  });

  it('lists only documents that really differ', () => {
    for (const name of Object.keys(BY_DESIGN)) {
      expect(expected, name).toHaveProperty([name]);
    }
  });

  for (const { name, xml } of documents) {
    for (const [key, options] of [
      [name, {}],
      [`${name}#ruby`, { rubyMethod: 'ruby' as const }],
    ] as const) {
      it(key, () => {
        const current = joinRubySegments(render(parse(xml), options).html);
        const exception = BY_DESIGN[key];
        if (!exception) {
          expect(current).toBe(expected[key]);
          return;
        }
        const old = exception.fixOld ? exception.fixOld(expected[key]!) : expected[key]!;
        const fixedCurrent = exception.fixNew ? exception.fixNew(current) : current;
        expect(fixedCurrent).toBe(old);
        // 直しの前の DOM は、期待と違う (違わないなら、この例外は要らない)
        expect(current).not.toBe(expected[key]);
      });
    }
  }
});

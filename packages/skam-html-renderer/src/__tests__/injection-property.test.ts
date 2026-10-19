import { describe, it, expect } from 'vitest';
import { render, type RenderOptions } from '../index.js';
import type { SKAMDocument } from '@kanbun-skam/skam';

const CANARIES = [
  `"><img src=x onerror=1>`,
  `" onfocus="1`,
  `';}</style><script>x</script>`,
] as const;
const RAW_SIGNS = ['<img', '<script', '</style'];
/** 文字列・数値以外の型で注入する値 (fail closed の確認) */
const typedPayloads = (payload: string): unknown[] => [[payload], { toString: () => payload }];

/** 13 種の mark、範囲 anchor、ref.label、ext を含む文書。satisfies で型と照合する */
const full = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '甲' },
    { id: 't2', text: '乙' },
    { id: 't3', text: '丙' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
  readings: [{ kind: 'kakikudashi', text: '甲乙丙' }],
  marks: [
    { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'よみ' },
    { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'お' },
    { type: 'soegana', anchor: { from: 't3', to: 't3' }, value: 'そ' },
    { type: 'kaeri', value: '㆑', position: { blockId: 'b1', after: 't1' } },
    { type: 'kutoten', kind: 'ku', value: '。', position: { blockId: 'b1', after: 't3' } },
    { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
    { type: 'joji', anchor: { from: 't3', to: 't3' } },
    { type: 'emphasis', anchor: { from: 't1', to: 't2' }, style: 'dot' },
    { type: 'highlight', anchor: { from: 't2', to: 't3' }, style: 'solid', ref: 'r1' },
    { id: 'r1', type: 'ref', label: 'L', content: '注', position: { blockId: 'b1', after: 't2' } },
    {
      type: 'saidoku',
      anchor: { from: 't3', to: 't3' },
      forms: [
        { n: 1, yomi: 'ま', okuri: 'さ' },
        { n: 2, okuri: 'す' },
      ],
    },
    {
      type: 'okototen',
      anchor: { from: 't1', to: 't1' },
      shape: 'dot',
      position: { system: 'glyph-grid', grid: '5x5', x: 1, y: 2 },
    },
    { type: 'tateten', anchor: { from: 't1', to: 't2' } },
  ],
  ext: { note: 'e' },
} satisfies SKAMDocument;

/** 分岐にだけ使われる葉 (棚卸しで「出力に出ない」としたもの)。置き換えると描画の分岐が消えるだけなので対象外にする */
const BRANCH_ONLY = new Set(['type', 'kind', 'format', 'system']);
/** 参照の整合を保つため、id は一貫して置き換える (定義と参照を同じ値にする) */
const ID_KEYS = new Set(['id', 'from', 'to', 'blockId', 'after', 'ref']);

type Path = (string | number)[];
function* leaves(node: unknown, path: Path = []): Generator<Path> {
  if (typeof node === 'string' || typeof node === 'number') {
    yield path;
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* leaves(node[i], [...path, i]);
    return;
  }
  if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) yield* leaves(v, [...path, k]);
}
function setAt(obj: unknown, path: Path, value: unknown) {
  let cur = obj as Record<string | number, unknown>;
  for (const p of path.slice(0, -1)) cur = cur[p] as Record<string | number, unknown>;
  cur[path[path.length - 1]!] = value;
}
/** id を置き換えた文書: 元の id 文字列をすべて同じ hostile 文字列 (id ごとに接尾辞) に写す */
function renameIds(doc: unknown, payload: string): unknown {
  const ids = new Map<string, string>();
  const copy = structuredClone(doc);
  for (const path of Array.from(leaves(copy))) {
    const key = String(path[path.length - 1]);
    const inTokenIds = path.includes('tokenIds');
    if (!ID_KEYS.has(key) && !inTokenIds) continue;
    const old = path.reduce<unknown>(
      (o, p) => (o as Record<string | number, unknown>)[p],
      copy
    ) as string;
    if (!ids.has(old)) ids.set(old, `${payload}${ids.size}`);
    setAt(copy, path, ids.get(old));
  }
  return copy;
}
/**
 * 型が違う id の版: 元の id ごとに 1 版を作る (b1 / t1 / t2 / t3 / r1)。
 * その id の定義と参照だけを、同じ型違いの値 (配列か toString を持つオブジェクト) に置き換える。
 * 1 版で 1 種類の id だけを変えるので、block id での例外が他の id の出力箇所の検査を隠すことがない
 */
function typedIdVariants(
  doc: unknown,
  makeTyped: (seed: string) => unknown
): { name: string; doc: unknown }[] {
  const idPaths = [...leaves(doc)].filter(
    (p) => ID_KEYS.has(String(p[p.length - 1])) || p.includes('tokenIds')
  );
  const valueAt = (p: Path) =>
    p.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], doc) as string;
  const ids = [...new Set(idPaths.map(valueAt))];
  return ids.map((id) => {
    const copy = structuredClone(doc);
    const typed = makeTyped(id);
    for (const p of idPaths) if (valueAt(p) === id) setAt(copy, p, typed);
    return { name: `id:${id}`, doc: copy };
  });
}
function variants(payload: unknown): { name: string; doc: unknown }[] {
  const out: { name: string; doc: unknown }[] =
    typeof payload === 'string' ? [{ name: 'ids', doc: renameIds(full, payload) }] : [];
  for (const path of leaves(full)) {
    const key = String(path[path.length - 1]);
    if (BRANCH_ONLY.has(key) || ID_KEYS.has(key) || path.includes('tokenIds')) continue;
    const copy = structuredClone(full);
    setAt(copy, path, payload);
    out.push({ name: path.join('.'), doc: copy });
  }
  return out;
}

const parse = (html: string) =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
/** 要素ごとに「深さ:タグ[属性名]」を文書順に並べる。深さを含めることで、余分な終了タグによる入れ子の変化も検出する */
const depthOf = (el: Element, root: Element) => {
  let d = 0;
  for (let p = el.parentElement; p && p !== root; p = p.parentElement) d++;
  return d;
};
const shape = (root: Element) =>
  Array.from(root.querySelectorAll('*')).map(
    (el) =>
      `${depthOf(el, root)}:${el.tagName}[${Array.from(el.attributes)
        .map((a) => a.name)
        .sort()
        .join(',')}]`
  );
const HIGHLIGHT_CLASS = /^skam-highlight--(solid|dotted|dashed|wavy|double)$/;
const CLASS_OK = (c: string) =>
  c.startsWith('skam-highlight--') ? HIGHLIGHT_CLASS.test(c) : /^skam-[a-z0-9-]+$/.test(c);
const EMPHASIS_OK =
  /^((filled|open)\s+)?(dot|circle|double-circle|triangle|sesame)$|^"\\[0-9a-f]+ "$/;
const STYLE_OK: Record<string, RegExp> = {
  '--okototen-x': /^\d+$/,
  '--okototen-y': /^\d+$/,
  '--okototen-grid': /^\d+$/,
  '--okototen-grid-rows': /^\d+$/,
  'text-emphasis-style': EMPHASIS_OK,
};

/** 判定器本体。違反を文字列で返す (空なら安全) */
function findInjection(html: string, benignHtml: string): string[] {
  const problems: string[] = [];
  for (const s of RAW_SIGNS) if (html.includes(s)) problems.push(`raw ${s}`);
  const root = parse(html);
  if (shape(root).join('|') !== shape(parse(benignHtml)).join('|'))
    problems.push('structure differs from benign render');
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const a of Array.from(el.attributes))
      if (/^on/i.test(a.name)) problems.push(`attr ${a.name}`);
    for (const c of Array.from(el.classList)) if (!CLASS_OK(c)) problems.push(`class ${c}`);
    const style = el.getAttribute('style');
    if (style)
      for (const decl of style
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)) {
        const i = decl.indexOf(':');
        const prop = decl.slice(0, i).trim();
        const val = decl.slice(i + 1).trim();
        if (!(prop in STYLE_OK) || !STYLE_OK[prop]!.test(val)) problems.push(`style ${decl}`);
      }
  }
  return problems;
}

const MATRIX: RenderOptions[] = [
  {},
  { rubyMethod: 'ruby' },
  { inline: true },
  { interactive: true },
  { rubyMethod: 'ruby', interactive: true },
];

describe('injection oracle controls', () => {
  // 否定対照: 各経路を単独で確かめる。benign と bad の構造 (深さ・タグ・属性名) を同じにし、
  // 狙った経路以外では違反が出ないようにする。期待値は「違反がちょうど 1 種類で、その経路のもの」
  const benign = '<span class="skam-token" data-x="a"></span>';
  it.each([
    [
      'raw tag',
      '<span class="skam-token" data-x="&lt;b&gt;"><img src=x></span>',
      '<span class="skam-token" data-x="a"><img src=y></span>',
      /^raw /,
    ],
    [
      'event attribute',
      '<span class="skam-token" onfoo="1"></span>',
      '<span class="skam-token" onfoo="2"></span>',
      /^attr /,
    ],
    [
      'structure (extra attribute)',
      benign,
      '<span class="skam-token" data-x="a" data-y="1"></span>',
      /^structure/,
    ],
    [
      'structure (nesting)',
      '<span class="skam-token"><span class="skam-x"></span><span class="skam-y"></span></span>',
      '<span class="skam-token"><span class="skam-x"></span></span><span class="skam-y"></span>',
      /^structure/,
    ],
    ['class token', benign, '<span class="skam-token evil" data-x="a"></span>', /^class /],
    [
      'highlight class',
      '<span class="skam-highlight--solid"></span>',
      '<span class="skam-highlight--evil"></span>',
      /^class /,
    ],
    [
      'style: smuggled declaration',
      '<span class="skam-okototen" style="--okototen-x: 1;"></span>',
      '<span class="skam-okototen" style="--okototen-x: 1;}x{a:b;"></span>',
      /^style /,
    ],
    [
      'style: unknown property',
      '<span class="skam-okototen" style="--okototen-x: 1;"></span>',
      '<span class="skam-okototen" style="background:url(x);"></span>',
      /^style /,
    ],
    [
      'style: bad value of a known property',
      '<span class="skam-emphasis" style="text-emphasis-style: dot;"></span>',
      '<span class="skam-emphasis" style="text-emphasis-style: evil;"></span>',
      /^style /,
    ],
  ])('negative control: %s', (_label, base, bad, kind) => {
    const problems = findInjection(bad, base);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => kind.test(p))).toBe(true);
  });
  // raw tag の対照では benign 側にも <img> があるため、benign 自身を調べると raw 違反になる。対照は bad 側だけを判定する
  it('positive control: fully escaped canary text is accepted', () => {
    const ok =
      '<span class="skam-token" data-x="&quot;&gt;&lt;img src=x onerror=1&gt;">&quot; onfocus=&quot;1</span>';
    expect(findInjection(ok, benign)).toEqual([]);
  });
});

describe('sink presence (oracle is not vacuous)', () => {
  it('benign renders across MATRIX emit every inventoried sink', () => {
    const all = MATRIX.map((o) => render(full, o).html).join('\n');
    for (const sink of [
      'data-block-id=',
      'data-token-id=',
      'data-token-from=',
      'data-token-to=',
      'data-suffix-for=',
      'data-saidoku-n=',
      'data-style=',
      '--okototen-x',
      '--okototen-grid-rows',
      'text-emphasis-style',
      '㆑',
    ]) {
      expect(all, sink).toContain(sink);
    }
  });
});

describe('HTML/CSS injection property (K4)', () => {
  for (const opts of MATRIX) {
    const benignVariants = variants('X');
    for (const payload of CANARIES) {
      variants(payload).forEach(({ name, doc }, i) => {
        it(`${JSON.stringify(opts)} ${name} = ${payload}`, () => {
          const benign = render(benignVariants[i]!.doc as SKAMDocument, opts);
          const out = render(doc as SKAMDocument, opts);
          expect(findInjection(out.html, benign.html)).toEqual([]);
          expect(out.css).toBe(benign.css);
        });
      });
      // 型が違う値: TypeError で止まるか、注入のない出力を返すか、のどちらかであること (fail closed)
      // 型が違う値は、その mark を出力しない (T2) ことが正しい動作なので、無害な描画との構造比較はしない。
      // 構造比較を外すため、出力自身を基準にして findInjection を呼ぶ (生のタグ・on* 属性・class・style の 4 条件は残る)
      for (const typed of typedPayloads(payload)) {
        const makeTyped = (seed: string) =>
          Array.isArray(typed) ? [`${payload}${seed}`] : { toString: () => `${payload}${seed}` };
        const typedVariants = [...variants(typed), ...typedIdVariants(full, makeTyped)];
        typedVariants.forEach(({ name, doc }) => {
          it(`${JSON.stringify(opts)} ${name} = typed(${payload})`, () => {
            let html: string;
            try {
              html = render(doc as SKAMDocument, opts).html;
            } catch (e) {
              expect(e).toBeInstanceOf(TypeError);
              return;
            }
            expect(findInjection(html, html)).toEqual([]);
          });
        });
      }
    }
  }
  it('covers many leaves', () => expect(variants('X').length).toBeGreaterThanOrEqual(20));
});

describe('emphasis custom character output (K4)', () => {
  const emph = (style: string): SKAMDocument => ({
    ...full,
    marks: [{ type: 'emphasis', anchor: { from: 't1', to: 't1' }, style }],
  });
  const styleOf = (html: string) =>
    parse(html).querySelector('[style*="text-emphasis-style"]')?.getAttribute('style');
  it.each([
    ['★', '"\\2605 "'],
    ['é', '"\\e9 "'],
  ])('emits %s as a lowercase-hex CSS string', (ch, css) => {
    expect(styleOf(render(emph(ch), { rubyMethod: 'ruby' }).html)).toContain(
      `text-emphasis-style: ${css}`
    );
  });
  it('keeps the raw HTML attribute escaped (no unescaped quote)', () => {
    expect(render(emph('★'), { rubyMethod: 'ruby' }).html).toContain(
      'text-emphasis-style: &quot;\\2605 &quot;'
    );
  });
  it('grid mode does not leak the CSS string outside style attributes', () => {
    // yomigana を同じ token に付けると、grid の emphasis-row の経路 (emphasisHandledByGrid) を通る
    const d: SKAMDocument = {
      ...full,
      marks: [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'よ' },
        { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: '★' },
      ],
    };
    const root = parse(render(d, { rubyMethod: 'grid' }).html);
    for (const el of Array.from(root.querySelectorAll('[style]'))) el.removeAttribute('style');
    expect(root.innerHTML).not.toContain('\\2605');
    // grid モードでもカスタム文字がそのまま描かれる (以前は既定の点に落ちていた)
    expect(root.textContent).toContain('★');
  });
  it('accepts the valid style through the oracle (positive control for the style allowlist)', () => {
    const html = render(emph('★'), { rubyMethod: 'ruby' }).html;
    expect(findInjection(html, html)).toEqual([]);
  });
});

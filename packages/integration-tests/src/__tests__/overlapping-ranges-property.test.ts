// @vitest-environment happy-dom
/**
 * 重なる範囲 (ruby・竪点・傍線の部分交差) の性質テスト。
 *
 * 種を固定した生成器 (`../property/generate-documents.ts`) で文書を作り、validator の結果で 3 つに分ける。
 *
 * - 警告も誤りも無い文書: AIR・html・canvas・読み上げが範囲どおりに描く (字が 1 回ずつ、注記が自分の範囲の字に付く、
 *   断片の和集合が元の範囲、不可分の組の包含)
 * - 警告のある文書、validator を通らない文書: 例外にならず、字が 1 回ずつ
 *
 * 性質の件数は、生成した数でなく数えた結果を assert する。
 */

import { describe, it, expect, vi } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { validateSKAMDocument, type SKAMDocument } from '@kanbun-skam/skam';
import {
  buildAnnotationIR,
  describeAnnotationIR,
  formatAccessibleText,
  RENDER_PROFILES,
  type AIRBlock,
  type AIRBlockChild,
  type AIRDocument,
  type AIRTokenNode,
} from '@kanbun-skam/skam/rendering';
import { render as renderHtml } from '@kanbun-skam/skam-html-renderer';
import { render as renderCanvas } from '@kanbun-skam/skam-canvas-renderer';
import { createFakeCanvas } from '../bench/fake-canvas.js';
import {
  generateCrossingDocument,
  generateDocument,
  prng,
} from '../property/generate-documents.js';

// ============================================================================
// 文書の生成と分類
// ============================================================================

type Category = 'clean' | 'warned' | 'invalid';

interface Sample {
  label: string;
  doc: SKAMDocument;
  category: Category;
}

function classify(doc: SKAMDocument): Category {
  const result = validateSKAMDocument(doc);
  if (!result.valid) return 'invalid';
  return (result.warnings ?? []).length > 0 ? 'warned' : 'clean';
}

function generateSamples(): Sample[] {
  const samples: Sample[] = [];
  const add = (label: string, raw: unknown): void => {
    const doc = raw as SKAMDocument;
    samples.push({ label, doc, category: classify(doc) });
  };
  // 交差する文書 (ruby・竪点・傍線を多めに)
  const crossing = prng(20261022);
  for (let n = 0; n < 1200; n++) add(`crossing-${n}`, generateCrossingDocument(crossing, n));
  // validator を通らない形にした文書
  const broken = prng(5150);
  for (let n = 0; n < 300; n++) add(`broken-${n}`, generateCrossingDocument(broken, n, 'broken'));
  // 往復の生成器 (plan-3) の文書。空白、結合する字、2 書記素以上の字を含む
  const roundtrip = prng(4242);
  for (let n = 0; n < 600; n++) add(`roundtrip-${n}`, generateDocument(roundtrip, n));
  return samples;
}

// 1 つの it が千件以上の文書を描く。並列の実行で遅れても時間切れにならないようにする
vi.setConfig({ testTimeout: 60_000 });

const SAMPLES = generateSamples();
const CLEAN = SAMPLES.filter((s) => s.category === 'clean');
const NOT_CLEAN = SAMPLES.filter((s) => s.category !== 'clean');

// ============================================================================
// 文書の側の期待
// ============================================================================

interface Range {
  from: number;
  to: number;
}

function sourceTexts(doc: SKAMDocument): string[] {
  const textOf = new Map(doc.tokens.map((t) => [t.id, t.text]));
  return doc.blocks.flatMap((b) => b.tokenIds.map((id) => textOf.get(id) ?? ''));
}

/** 注記の範囲を、所属するブロックと字の並びの添字にする。ブロックをまたぐ・逆向き・無い字は undefined */
function rangesIn(
  doc: SKAMDocument,
  type: string
): { block: number; range: Range; mark: unknown }[] {
  const out: { block: number; range: Range; mark: unknown }[] = [];
  doc.blocks.forEach((block, blockIndex) => {
    const indexOf = new Map(block.tokenIds.map((id, i) => [id, i]));
    for (const mark of doc.marks) {
      if (mark.type !== type || !('anchor' in mark)) continue;
      const from = indexOf.get(mark.anchor.from);
      const to = indexOf.get(mark.anchor.to);
      if (from === undefined || to === undefined || from > to) continue;
      out.push({ block: blockIndex, range: { from, to }, mark });
    }
  });
  return out;
}

function positionsIn(doc: SKAMDocument, type: string): { block: number; after: number }[] {
  const out: { block: number; after: number }[] = [];
  doc.blocks.forEach((block, blockIndex) => {
    const indexOf = new Map(block.tokenIds.map((id, i) => [id, i]));
    for (const mark of doc.marks) {
      if (mark.type !== type || !('position' in mark)) continue;
      const position = mark.position as { blockId?: string; after?: string };
      if (position.blockId !== block.id || position.after === undefined) continue;
      const after = indexOf.get(position.after);
      if (after !== undefined) out.push({ block: blockIndex, after });
    }
  });
  return out;
}

const covers = (range: Range, i: number): boolean => range.from <= i && i <= range.to;
const shares = (a: Range, b: Range): boolean => a.from <= b.to && b.from <= a.to;
const contains = (a: Range, b: Range): boolean => a.from <= b.from && b.to <= a.to;
const crosses = (a: Range, b: Range): boolean => shares(a, b) && !contains(a, b) && !contains(b, a);

// ============================================================================
// AIR の側
// ============================================================================

interface Flat {
  /** 文書の順に並べた字 */
  tokens: AIRTokenNode[];
  /** 字の並びの添字 (ブロックの中の 0 始まり) */
  indexOfToken: Map<AIRTokenNode, number>;
}

function walk(children: readonly AIRBlockChild[], visit: (node: AIRBlockChild) => void): void {
  for (const child of children) {
    visit(child);
    if (child.type !== 'token' && child.type !== 'tateten-separator') walk(child.children, visit);
  }
}

function flatten(block: AIRBlock): Flat {
  const tokens: AIRTokenNode[] = [];
  walk(block.children, (node) => {
    if (node.type === 'token') tokens.push(node);
  });
  return { tokens, indexOfToken: new Map(tokens.map((t, i) => [t, i])) };
}

/** 部分木に含まれる字の添字の範囲。字を含まなければ undefined */
function tokenSpan(node: AIRBlockChild, flat: Flat): Range | undefined {
  const indices: number[] = [];
  walk([node], (n) => {
    if (n.type === 'token') indices.push(flat.indexOfToken.get(n)!);
  });
  if (indices.length === 0) return undefined;
  return { from: Math.min(...indices), to: Math.max(...indices) };
}

/** 木の各ノードで、子の範囲が親の範囲を順に埋める (どの 2 つも包含か離れている) */
function nestingProblems(block: AIRBlock, flat: Flat): string[] {
  const problems: string[] = [];
  const check = (
    children: readonly AIRBlockChild[],
    expected: Range | undefined,
    where: string
  ) => {
    let next = expected?.from ?? 0;
    for (const child of children) {
      if (child.type === 'tateten-separator') continue;
      const span = tokenSpan(child, flat);
      if (!span) {
        problems.push(`${where}: ${child.type} has no token`);
        continue;
      }
      if (span.from !== next)
        problems.push(`${where}: ${child.type} starts at ${span.from}, expected ${next}`);
      next = span.to + 1;
      if (child.type !== 'token') check(child.children, span, child.type);
    }
    if (expected && next !== expected.to + 1)
      problems.push(`${where}: children end at ${next - 1}`);
  };
  check(block.children, { from: 0, to: flat.tokens.length - 1 }, 'block');
  return problems;
}

function airTokenIds(air: AIRDocument): string[] {
  return air.blocks.flatMap((block) => flatten(block).tokens.map((t) => t.token.id));
}

// ============================================================================
// 検査の道具
// ============================================================================

/** 不一致のときだけ、文書つきの失敗にする (件数が多いので、一致のときは message を作らない) */
function agree(sample: Sample, what: string, actual: unknown, expected: unknown): void {
  if (isDeepStrictEqual(actual, expected)) return;
  expect(actual, `${what} in ${sample.label}: ${JSON.stringify(sample.doc)}`).toEqual(expected);
}

function html(doc: SKAMDocument, rubyMethod?: 'ruby'): string {
  return renderHtml(doc, rubyMethod ? { rubyMethod } : {}).html;
}

/** html の字の本文を、文書の順につないだ文字列。範囲の読みの単位は字ごとの本文 (skam-base-seg) をつなぐ */
function htmlChars(markup: string): string {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const units = [...template.content.querySelectorAll('.skam-token')];
  return units
    .map((unit) => {
      const segs = [...unit.querySelectorAll('.skam-base-seg')];
      if (segs.length > 0) return segs.map((el) => el.textContent ?? '').join('');
      return unit.querySelector('.skam-base')?.textContent ?? '';
    })
    .join('');
}

/** canvas が fillText した文字列の並び */
function canvasFillTexts(doc: SKAMDocument): string[] {
  const canvas = createFakeCanvas();
  const context = canvas.getContext('2d')!;
  const calls: string[] = [];
  const original = context.fillText;
  context.fillText = (text: string, x: number, y: number) => {
    calls.push(text);
    original(text, x, y);
  };
  renderCanvas(doc, canvas);
  return calls;
}

/** 字の本文として fillText された回数を、本文の字の種類ごとに数える */
function bodyFillCounts(calls: readonly string[], texts: readonly string[]): Map<string, number> {
  const bodyTexts = new Set(texts);
  const counts = new Map<string, number>();
  for (const call of calls) {
    if (bodyTexts.has(call)) counts.set(call, (counts.get(call) ?? 0) + 1);
  }
  return counts;
}

function countTexts(texts: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
  return counts;
}

function spokenChars(air: AIRDocument): string[] {
  return describeAnnotationIR(air)
    .flatMap((block) => block.units)
    .filter((unit) => unit.text !== '')
    .map((unit) => unit.text);
}

// ============================================================================
// 件数
// ============================================================================

/** ruby (2 字以上)、竪点、傍線がブロックの中で互いに字を共有し、そのうち 1 組が部分交差する */
function hasThreeKindsCrossing(doc: SKAMDocument): boolean {
  const rubies = rangesIn(doc, 'yomigana').filter((r) => r.range.to > r.range.from);
  const tatetens = rangesIn(doc, 'tateten');
  const highlights = rangesIn(doc, 'highlight');
  for (const ruby of rubies) {
    for (const tateten of tatetens) {
      if (tateten.block !== ruby.block) continue;
      for (const highlight of highlights) {
        if (highlight.block !== ruby.block) continue;
        const a = ruby.range;
        const b = tateten.range;
        const c = highlight.range;
        if (!shares(a, b) || !shares(b, c) || !shares(a, c)) continue;
        if (crosses(a, b) || crosses(b, c) || crosses(a, c)) return true;
      }
    }
  }
  return false;
}

describe('generated documents', () => {
  it('has enough documents of each kind, counted from the classification', () => {
    const threeKinds = CLEAN.filter((s) => hasThreeKindsCrossing(s.doc));
    const fragmented = CLEAN.filter((s) => {
      let found = false;
      for (const block of buildAnnotationIR(s.doc, RENDER_PROFILES.full).blocks) {
        walk(block.children, (n) => {
          if ((n.type === 'tateten-group' || n.type === 'highlight-group') && n.continuesAfter) {
            found = true;
          }
        });
      }
      return found;
    });
    expect(CLEAN.length).toBeGreaterThanOrEqual(200);
    expect(threeKinds.length).toBeGreaterThanOrEqual(20);
    expect(fragmented.length).toBeGreaterThanOrEqual(20);
    expect(SAMPLES.filter((s) => s.category === 'warned').length).toBeGreaterThanOrEqual(20);
    expect(SAMPLES.filter((s) => s.category === 'invalid').length).toBeGreaterThanOrEqual(20);
  });
});

// ============================================================================
// 警告も誤りも無い文書
// ============================================================================

describe('documents without errors or warnings: AIR', () => {
  it('walks every token once, in the order of blocks[].tokenIds', () => {
    for (const sample of CLEAN) {
      const air = buildAnnotationIR(sample.doc, RENDER_PROFILES.full);
      agree(
        sample,
        'token ids',
        airTokenIds(air),
        sample.doc.blocks.flatMap((b) => b.tokenIds)
      );
    }
  });

  it('nests nodes: every node is contained in its parent and apart from its siblings', () => {
    for (const sample of CLEAN) {
      for (const block of buildAnnotationIR(sample.doc, RENDER_PROFILES.full).blocks) {
        agree(sample, 'nesting problems', nestingProblems(block, flatten(block)), []);
      }
    }
  });

  it('puts the slots of a mark only on the tokens of its range', () => {
    for (const sample of CLEAN) {
      const { doc } = sample;
      const air = buildAnnotationIR(doc, RENDER_PROFILES.full);
      const covered = (type: string) => rangesIn(doc, type);
      const afterOf = (type: string) => positionsIn(doc, type);
      air.blocks.forEach((block, blockIndex) => {
        const problems: string[] = [];
        const coveredBy = (type: string, i: number) =>
          covered(type).some((r) => r.block === blockIndex && covers(r.range, i));
        const endsAt = (type: string, i: number) =>
          covered(type).some((r) => r.block === blockIndex && r.range.to === i);
        const singleYomigana = (i: number) =>
          covered('yomigana').some(
            (r) => r.block === blockIndex && r.range.from === i && r.range.to === i
          );
        const placedAfter = (type: string, i: number) =>
          afterOf(type).some((p) => p.block === blockIndex && p.after === i);
        flatten(block).tokens.forEach((node, i) => {
          const { slots } = node;
          // 範囲の注記は、範囲の字に付く (付く字と範囲の字が一致する)
          const expectCovered: [string, boolean][] = [
            ['okimoji', slots.isOkimoji === true],
            ['joji', slots.isJoji === true],
            ['emphasis', slots.emphasis !== undefined],
            ['okototen', slots.okototen !== undefined],
          ];
          for (const [type, has] of expectCovered) {
            if (has !== coveredBy(type, i)) problems.push(`${type} at ${i}: slot ${has}`);
          }
          if (slots.saidoku !== undefined && !coveredBy('saidoku', i))
            problems.push(`saidoku at ${i}`);
          // 送り仮名と添え仮名は、範囲の最後の字の slot
          if (slots.okuri !== undefined && !endsAt('okurigana', i) && !coveredBy('saidoku', i)) {
            problems.push(`okuri at ${i}`);
          }
          if (slots.soegana !== undefined && !endsAt('soegana', i))
            problems.push(`soegana at ${i}`);
          // 1 字の読みは字の slot (再読文字の読みも同じ slot)
          if (slots.ruby !== undefined && !singleYomigana(i) && !coveredBy('saidoku', i)) {
            problems.push(`ruby at ${i}`);
          }
          // 位置の注記は、after の字の slot
          if (slots.kaeri !== undefined && !placedAfter('kaeri', i)) problems.push(`kaeri at ${i}`);
          if (slots.kutoten !== undefined && !placedAfter('kutoten', i)) {
            problems.push(`kutoten at ${i}`);
          }
        });
        agree(sample, `slot problems in block ${blockIndex}`, problems, []);
      });
    }
  });

  it('makes one ruby group per range of two or more tokens, holding exactly its tokens', () => {
    for (const sample of CLEAN) {
      const { doc } = sample;
      const air = buildAnnotationIR(doc, RENDER_PROFILES.full);
      air.blocks.forEach((block, blockIndex) => {
        const flat = flatten(block);
        const actual: [number, number, string][] = [];
        walk(block.children, (n) => {
          if (n.type !== 'ruby-group') return;
          const span = tokenSpan(n, flat)!;
          actual.push([span.from, span.to, n.yomigana.value]);
          agree(sample, 'ruby span', n.span, span.to - span.from + 1);
        });
        const expected = rangesIn(doc, 'yomigana')
          .filter((r) => r.block === blockIndex && r.range.to > r.range.from)
          .map((r): [number, number, string] => [
            r.range.from,
            r.range.to,
            (r.mark as { value: string }).value,
          ]);
        const order = (x: [number, number, string], y: [number, number, string]) =>
          x[0] - y[0] || x[1] - y[1];
        agree(sample, 'ruby groups', actual.sort(order), expected.sort(order));
      });
    }
  });

  it('splits tateten and highlight into fragments whose union is the original range', () => {
    for (const sample of CLEAN) {
      const { doc } = sample;
      const air = buildAnnotationIR(doc, RENDER_PROFILES.full);
      air.blocks.forEach((block, blockIndex) => {
        const flat = flatten(block);
        for (const type of ['tateten', 'highlight'] as const) {
          const fragmentsOf = new Map<
            unknown,
            { span: Range; before: boolean; after: boolean }[]
          >();
          walk(block.children, (n) => {
            if (n.type !== 'tateten-group' && n.type !== 'highlight-group') return;
            if ((n.type === 'tateten-group') !== (type === 'tateten')) return;
            const mark = n.type === 'tateten-group' ? n.tatetenMark : n.highlightMark;
            const list = fragmentsOf.get(mark) ?? [];
            list.push({
              span: tokenSpan(n, flat)!,
              before: n.continuesBefore === true,
              after: n.continuesAfter === true,
            });
            fragmentsOf.set(mark, list);
          });
          for (const { block: markBlock, range, mark } of rangesIn(doc, type)) {
            if (markBlock !== blockIndex) continue;
            const fragments = [...(fragmentsOf.get(mark) ?? [])].sort(
              (a, b) => a.span.from - b.span.from
            );
            // 断片は互いに離れ、つなぐと元の範囲になり、続きの印が前後の断片と合う
            const union =
              fragments.length === 0
                ? undefined
                : { from: fragments[0]!.span.from, to: fragments.at(-1)!.span.to };
            agree(sample, `${type} union`, union, range);
            const contiguous = fragments.every(
              (f, i) => i === 0 || f.span.from === fragments[i - 1]!.span.to + 1
            );
            agree(sample, `${type} fragments are adjacent`, contiguous, true);
            agree(
              sample,
              `${type} continues flags`,
              fragments.map((f) => [f.before, f.after]),
              fragments.map((_, i) => [i > 0, i < fragments.length - 1])
            );
          }
        }
      });
    }
  });

  it('gives two highlights that share a token different lanes, and all fragments of one highlight the same lane', () => {
    let sharingPairs = 0;
    for (const sample of CLEAN) {
      const { doc } = sample;
      const air = buildAnnotationIR(doc, RENDER_PROFILES.full);
      air.blocks.forEach((block, blockIndex) => {
        const lanesOf = new Map<unknown, Set<number>>();
        walk(block.children, (n) => {
          if (n.type !== 'highlight-group') return;
          const lanes = lanesOf.get(n.highlightMark) ?? new Set<number>();
          lanes.add(n.lane ?? 0);
          lanesOf.set(n.highlightMark, lanes);
        });
        const drawn = rangesIn(doc, 'highlight').filter(
          (h) => h.block === blockIndex && lanesOf.has(h.mark)
        );
        for (const h of drawn) agree(sample, 'fragment lanes', lanesOf.get(h.mark)!.size, 1);
        for (let i = 0; i < drawn.length; i++) {
          for (let j = i + 1; j < drawn.length; j++) {
            if (!shares(drawn[i]!.range, drawn[j]!.range)) continue;
            sharingPairs++;
            const laneI = [...lanesOf.get(drawn[i]!.mark)!][0];
            const laneJ = [...lanesOf.get(drawn[j]!.mark)!][0];
            agree(sample, 'lanes of highlights sharing a token', laneI !== laneJ, true);
          }
        }
      });
    }
    expect(sharingPairs).toBeGreaterThanOrEqual(20);
  });

  it('puts one separator between each adjacent pair inside a tateten, and only there', () => {
    for (const sample of CLEAN) {
      const { doc } = sample;
      const air = buildAnnotationIR(doc, RENDER_PROFILES.full);
      air.blocks.forEach((block, blockIndex) => {
        const flat = flatten(block);
        // 字の並びを平らにして、区切りの前後の字の添字を求める
        const sequence: ({ token: number } | { separator: true })[] = [];
        walk(block.children, (n) => {
          if (n.type === 'token') sequence.push({ token: flat.indexOfToken.get(n)! });
          else if (n.type === 'tateten-separator') sequence.push({ separator: true });
        });
        const separatorPairs: number[] = [];
        sequence.forEach((item, k) => {
          if (!('separator' in item)) return;
          const before = sequence
            .slice(0, k)
            .reverse()
            .find((x) => 'token' in x) as { token: number } | undefined;
          const after = sequence.slice(k + 1).find((x) => 'token' in x) as
            | { token: number }
            | undefined;
          separatorPairs.push(
            before && after && after.token === before.token + 1 ? before.token : -1
          );
        });
        const expected = new Set<number>();
        for (const r of rangesIn(doc, 'tateten')) {
          if (r.block !== blockIndex) continue;
          for (let i = r.range.from; i < r.range.to; i++) expected.add(i);
        }
        agree(
          sample,
          'separator pairs',
          separatorPairs.sort((a, b) => a - b),
          [...expected].sort((a, b) => a - b)
        );
        // 不可分の組 (AIR の joinedWithNext) は、竪点の組を含む
        for (const i of expected) {
          agree(sample, `joinedWithNext at ${i}`, flat.tokens[i]!.joinedWithNext, true);
        }
      });
    }
  });
});

describe('documents without errors or warnings: html, canvas and spoken text', () => {
  it('draws the text of every token once in html, in order', () => {
    for (const sample of CLEAN) {
      const expected = sourceTexts(sample.doc).join('');
      agree(sample, 'html chars (grid)', htmlChars(html(sample.doc)), expected);
      agree(sample, 'html chars (ruby)', htmlChars(html(sample.doc, 'ruby')), expected);
    }
  });

  it('draws the text of every token once on canvas', () => {
    for (const sample of CLEAN) {
      const texts = sourceTexts(sample.doc);
      agree(
        sample,
        'canvas fillText counts',
        bodyFillCounts(canvasFillTexts(sample.doc), texts),
        countTexts(texts)
      );
    }
  });

  it('says every token once in the spoken text', () => {
    for (const sample of CLEAN) {
      const air = buildAnnotationIR(sample.doc, RENDER_PROFILES.full);
      agree(sample, 'spoken chars', spokenChars(air), sourceTexts(sample.doc));
      expect(typeof formatAccessibleText(describeAnnotationIR(air))).toBe('string');
    }
  });
});

// ============================================================================
// 警告のある文書と validator を通らない文書
// ============================================================================

describe('documents with warnings or errors: no exception, every token once', () => {
  // 件数が多いので、並列の実行で遅れても時間切れにならないよう、種類ごとに分けて余裕を持たせる
  const TIMEOUT_MS = 60_000;

  it(
    'AIR neither throws nor loses or repeats a token, and nests its nodes',
    () => {
      for (const sample of NOT_CLEAN) {
        const air = buildAnnotationIR(sample.doc, RENDER_PROFILES.full);
        agree(
          sample,
          'token ids',
          airTokenIds(air),
          sample.doc.blocks.flatMap((b) => b.tokenIds)
        );
        for (const block of air.blocks) {
          agree(sample, 'nesting problems', nestingProblems(block, flatten(block)), []);
        }
      }
    },
    TIMEOUT_MS
  );

  it(
    'html draws every token once in both ruby methods',
    () => {
      for (const sample of NOT_CLEAN) {
        const expected = sourceTexts(sample.doc).join('');
        agree(sample, 'html chars (grid)', htmlChars(html(sample.doc)), expected);
        agree(sample, 'html chars (ruby)', htmlChars(html(sample.doc, 'ruby')), expected);
      }
    },
    TIMEOUT_MS
  );

  it(
    'canvas draws every token once',
    () => {
      for (const sample of NOT_CLEAN) {
        const texts = sourceTexts(sample.doc);
        agree(
          sample,
          'canvas fillText counts',
          bodyFillCounts(canvasFillTexts(sample.doc), texts),
          countTexts(texts)
        );
      }
    },
    TIMEOUT_MS
  );

  it(
    'spoken text says every token once',
    () => {
      for (const sample of NOT_CLEAN) {
        const air = buildAnnotationIR(sample.doc, RENDER_PROFILES.full);
        agree(sample, 'spoken chars', spokenChars(air), sourceTexts(sample.doc));
        expect(typeof formatAccessibleText(describeAnnotationIR(air))).toBe('string');
      }
    },
    TIMEOUT_MS
  );
});

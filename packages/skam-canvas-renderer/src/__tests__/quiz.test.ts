import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';
import { render, type CanvasRenderOptions } from '../index.js';
import { RecordingContext, type DrawCall } from './recording-context.js';

const quiz = (name: string) => ({ edu: { quiz: name } });
const range = (from: string, to = from) => ({ from, to });

/** 甲乙丙丁戊（t1〜t5）を 1 ブロックに置く。宣言のある文書 */
function doc(marks: Mark[], declared = true): SKAMDocument {
  return {
    format: 'skam@0.1',
    ...(declared ? { extensions: ['edu'], extensionsRequired: ['edu'] } : {}),
    tokens: ['甲', '乙', '丙', '丁', '戊'].map((text, i) => ({ id: `t${i + 1}`, text })),
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks,
    readings: [],
  };
}

function draw(document: SKAMDocument, options: CanvasRenderOptions = {}): DrawCall[] {
  const ctx = new RecordingContext();
  render(document, { width: 0, height: 0, getContext: () => ctx }, options);
  return ctx.calls;
}

const sameCall = (a: DrawCall, b: DrawCall) => JSON.stringify(a) === JSON.stringify(b);

/** `calls` から `removed` を順に取り除いた残り（removed が calls の部分列でなければ undefined） */
function without(calls: DrawCall[], removed: DrawCall[]): DrawCall[] | undefined {
  const rest: DrawCall[] = [];
  let j = 0;
  for (const call of calls) {
    if (j < removed.length && sameCall(call, removed[j]!)) j++;
    else rest.push(call);
  }
  return j === removed.length ? rest : undefined;
}

/** 1 字ごとの save / restore の組は、描く字といっしょに増減するので比べない */
const withoutStateCalls = (calls: DrawCall[]) =>
  calls.filter((c) => c.method !== 'save' && c.method !== 'restore');

const texts = (calls: DrawCall[]) =>
  calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));

describe('canvas hideQuiz', () => {
  interface Case {
    name: string;
    marks: Mark[];
    /** 隠すと描かれなくなる文字 */
    secrets: string[];
  }
  const cases: Case[] = [
    {
      name: 'yomigana',
      marks: [{ type: 'yomigana', anchor: range('t1'), value: 'ゆ', ext: quiz('問') }],
      secrets: ['ゆ'],
    },
    {
      name: 'range yomigana',
      marks: [{ type: 'yomigana', anchor: range('t1', 't2'), value: 'りょ', ext: quiz('問') }],
      secrets: ['り', 'ょ'],
    },
    {
      name: 'okurigana',
      marks: [{ type: 'okurigana', anchor: range('t1'), value: 'ヅ', ext: quiz('問') }],
      secrets: ['ヅ'],
    },
    {
      name: 'range okurigana',
      marks: [{ type: 'okurigana', anchor: range('t1', 't2'), value: 'ヅ', ext: quiz('問') }],
      secrets: ['ヅ'],
    },
    {
      name: 'soegana',
      marks: [{ type: 'soegana', anchor: range('t1'), value: 'ヲ', ext: quiz('問') }],
      secrets: ['ヲ'],
    },
    {
      name: 'kaeri',
      marks: [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒', ext: quiz('問') },
      ],
      secrets: ['㆒'],
    },
    {
      name: 'kutoten',
      marks: [
        { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '‥', ext: quiz('問') },
      ],
      secrets: ['‥'],
    },
    {
      name: 'saidoku',
      marks: [
        {
          type: 'saidoku',
          anchor: range('t1'),
          forms: [
            { yomi: 'あ', okuri: 'う' },
            { yomi: 'お', okuri: 'き' },
          ],
          ext: quiz('問'),
        },
      ],
      secrets: ['あ', 'う', 'お', 'き'],
    },
    {
      name: 'tateten',
      marks: [{ type: 'tateten', anchor: range('t1', 't2'), ext: quiz('問') }],
      secrets: ['㆐'],
    },
    {
      name: 'tateten separator kaeri',
      marks: [
        { type: 'tateten', anchor: range('t1', 't3') },
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒', ext: quiz('問') },
      ],
      secrets: ['㆒'],
    },
  ];

  it.each(cases)('$name を隠しても、ほかの命令の座標が変わらない', ({ marks, secrets }) => {
    const shown = withoutStateCalls(draw(doc(marks)));
    const hidden = withoutStateCalls(draw(doc(marks), { hideQuiz: true }));
    const removed = shown.filter(
      (c) => c.method === 'fillText' && secrets.includes(String(c.args[0]))
    );
    expect(removed.length).toBeGreaterThan(0);
    expect(texts(hidden).filter((t) => secrets.includes(t))).toEqual([]);
    expect(without(shown, removed)).toEqual(hidden);
  });

  it('ヲコト点を隠すと、点の命令が描かれず、ほかの命令は同じ', () => {
    const cell: Mark = {
      type: 'okototen',
      anchor: range('t1'),
      position: { system: 'glyph-grid', grid: '5x5', x: 1, y: 1 },
      shape: 'dot',
      ext: quiz('問'),
    };
    const stripped = { ...cell };
    delete (stripped as { ext?: unknown }).ext;
    const shown = draw(doc([stripped]));
    const hidden = draw(doc([cell]), { hideQuiz: true });
    const none = draw(doc([]));
    expect(shown.length).toBeGreaterThan(none.length);
    expect(hidden).toEqual(none);
    expect(draw(doc([cell]))).toEqual(shown);
  });

  it('hideQuiz が無い、名前が合わない、宣言が無いときは何も隠さない', () => {
    const marks: Mark[] = [
      { type: 'okurigana', anchor: range('t1'), value: 'ヅ', ext: quiz('問') },
    ];
    const shown = draw(doc(marks));
    expect(draw(doc(marks), { hideQuiz: ['別'] })).toEqual(shown);
    expect(draw(doc(marks, false), { hideQuiz: true })).toEqual(draw(doc(marks, false)));
  });

  it('不正な hideQuiz は TypeError', () => {
    for (const hideQuiz of [false, 1, 'x', [''], Array(101).fill('a')]) {
      expect(() => draw(doc([]), { hideQuiz } as unknown as CanvasRenderOptions)).toThrow(
        TypeError
      );
    }
  });
});

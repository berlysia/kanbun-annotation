import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';
import { render, renderHTML, assertHideQuizOption, type HideQuizOption } from '../index.js';
import type { RenderOptions } from '../index.js';

const quiz = (name: string) => ({ edu: { quiz: name } });
const range = (from: string, to = from) => ({ from, to });
const dom = (html: string) =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

/** 甲乙丙丁戊（t1〜t5）を 1 ブロックに置く。宣言のある文書。本文と他の注記に出ない字を値に使う */
function doc(marks: Mark[], over: Partial<SKAMDocument> = {}): SKAMDocument {
  return {
    format: 'skam@0.1',
    extensions: ['edu'],
    extensionsRequired: ['edu'],
    tokens: ['甲', '乙', '丙', '丁', '戊'].map((text, i) => ({ id: `t${i + 1}`, text })),
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks,
    readings: [],
    ...over,
  };
}

const HIDE: RenderOptions = { hideQuiz: true };
/** 表示層の HTML。hideQuiz を渡すと読み上げ層は 'display' に変わるので、表示層だけを比べる */
const displayOf = (html: string): string => dom(html).querySelector('.skam-display')!.outerHTML;

function stripExt(document: SKAMDocument): SKAMDocument {
  return { ...document, marks: document.marks.map(({ ext: _ext, ...rest }) => rest as Mark) };
}

describe('hideQuiz: okurigana', () => {
  const marks: Mark[] = [
    { type: 'yomigana', anchor: range('t1'), value: 'まな' },
    { type: 'okurigana', anchor: range('t1'), value: 'ヅ', ext: quiz('問題甲') },
  ];

  it('送り仮名の要素の中身が全角空白になり、class と aria-hidden が付き、値は出力に無い', () => {
    const { html } = render(doc(marks), { hideQuiz: ['問題甲'] });
    const hidden = dom(html).querySelectorAll('.skam-quiz-hidden');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.classList.contains('skam-okuri')).toBe(true);
    expect(hidden[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(hidden[0]!.textContent).toBe('　');
    expect(html).not.toContain('ヅ');
    expect(html).not.toContain('問題甲');
    expect(html).toContain('まな');
  });

  it('hideQuiz が無いときは出力が ext を除いた文書と同じ', () => {
    expect(render(doc(marks)).html).toBe(render(stripExt(doc(marks))).html);
    expect(displayOf(render(doc(marks), { hideQuiz: ['別の問'] }).html)).toBe(
      displayOf(render(stripExt(doc(marks))).html)
    );
  });

  it('宣言の無い文書では hideQuiz: true でも何も隠さない', () => {
    const undeclared = doc(marks);
    delete undeclared.extensions;
    delete undeclared.extensionsRequired;
    expect(displayOf(render(undeclared, HIDE).html)).toBe(displayOf(render(undeclared).html));
  });
});

describe('hideQuiz: blank characters', () => {
  it('半角の値は no-break space、サロゲート対の全角の字は全角空白 1 つ', () => {
    const half = doc([
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: ',', ext: quiz('a') },
    ]);
    const hidden = dom(render(half, HIDE).html).querySelector('.skam-quiz-hidden')!;
    expect(hidden.textContent).toBe(' ');
    const surrogate = doc([
      { type: 'okurigana', anchor: range('t1'), value: '\u{20BB7}', ext: quiz('a') },
    ]);
    expect(dom(render(surrogate, HIDE).html).querySelector('.skam-quiz-hidden')!.textContent).toBe(
      '　'
    );
  });
});

describe('hideQuiz: 12 places', () => {
  interface Case {
    name: string;
    marks: Mark[];
    secrets: string[];
    /** 隠した要素の class（okototen は要素が無く、okimoji と joji は class が無い） */
    hiddenSelector?: string;
    absent?: string;
  }
  const cell = (x: number): Mark => ({
    type: 'okototen',
    anchor: range('t2'),
    position: { system: 'glyph-grid', grid: '5x5', x, y: 1 },
    shape: 'dot',
    ext: quiz('問'),
  });
  const cases: Case[] = [
    {
      name: 'yomigana',
      marks: [{ type: 'yomigana', anchor: range('t1'), value: 'ゆゆ', ext: quiz('問') }],
      secrets: ['ゆゆ'],
      hiddenSelector: '.skam-ruby',
    },
    {
      name: 'range yomigana',
      marks: [{ type: 'yomigana', anchor: range('t1', 't2'), value: 'りょ', ext: quiz('問') }],
      secrets: ['りょ'],
      hiddenSelector: '.skam-ruby',
    },
    {
      name: 'okurigana',
      marks: [{ type: 'okurigana', anchor: range('t1'), value: 'ヅ', ext: quiz('問') }],
      secrets: ['ヅ'],
      hiddenSelector: '.skam-okuri',
    },
    {
      name: 'range okurigana',
      marks: [{ type: 'okurigana', anchor: range('t1', 't2'), value: 'ヅ', ext: quiz('問') }],
      secrets: ['ヅ'],
      hiddenSelector: '.skam-okuri',
    },
    {
      name: 'soegana',
      marks: [{ type: 'soegana', anchor: range('t1'), value: 'ヲヲ', ext: quiz('問') }],
      secrets: ['ヲヲ'],
      hiddenSelector: '.skam-soegana',
    },
    {
      name: 'kaeri',
      marks: [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒', ext: quiz('問') },
      ],
      secrets: ['㆒'],
      hiddenSelector: '.skam-kaeriten',
    },
    {
      name: 'kutoten',
      marks: [
        { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '‥', ext: quiz('問') },
      ],
      secrets: ['‥'],
      hiddenSelector: '.skam-suffix-kutoten',
    },
    {
      name: 'block-start kutoten',
      marks: [{ type: 'kutoten', position: { blockId: 'b1' }, value: '‥', ext: quiz('問') }],
      secrets: ['‥'],
      hiddenSelector: '.skam-suffix-kutoten',
    },
    {
      name: 'saidoku',
      marks: [
        {
          type: 'saidoku',
          anchor: range('t1'),
          forms: [
            { yomi: 'あい', okuri: 'うえ' },
            { yomi: 'おか', okuri: 'きく' },
          ],
          ext: quiz('問'),
        },
      ],
      secrets: ['あい', 'うえ', 'おか', 'きく'],
      hiddenSelector: '.skam-ruby',
    },
    {
      name: 'tateten',
      marks: [{ type: 'tateten', anchor: range('t1', 't2'), ext: quiz('問') }],
      secrets: [],
      hiddenSelector: '.skam-tateten-mark',
    },
    {
      name: 'okototen',
      marks: [cell(1)],
      secrets: [],
      absent: '.skam-okototen',
    },
    {
      name: 'okimoji',
      marks: [{ type: 'okimoji', anchor: range('t2'), ext: quiz('問') }],
      secrets: [],
      absent: '.skam-okimoji',
    },
    {
      name: 'joji',
      marks: [{ type: 'joji', anchor: range('t2'), ext: quiz('問') }],
      secrets: [],
      absent: '.skam-joji',
    },
  ];

  it.each(cases)('$name を隠す', ({ marks, secrets, hiddenSelector, absent }) => {
    const shown = render(doc(marks)).html;
    const { html } = render(doc(marks), HIDE);
    for (const secret of secrets) {
      expect(shown).toContain(secret);
      expect(html).not.toContain(secret);
    }
    const body = dom(html);
    if (absent) {
      expect(dom(shown).querySelector(absent)).not.toBeNull();
      expect(body.querySelector(absent)).toBeNull();
      expect(body.querySelector('.skam-quiz-hidden')).toBeNull();
      return;
    }
    const hidden = Array.from(body.querySelectorAll(hiddenSelector!)).filter((el) =>
      el.classList.contains('skam-quiz-hidden')
    );
    expect(hidden.length).toBeGreaterThan(0);
    for (const el of hidden) expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('ヲコト点 2 つの一方だけ隠すと、もう一方の要素は残る', () => {
    const plain: Mark = { ...cell(2) };
    delete (plain as { ext?: unknown }).ext;
    const { html } = render(doc([cell(1), plain]), HIDE);
    expect(dom(html).querySelectorAll('.skam-okototen')).toHaveLength(1);
  });

  it('同じ位置の 2 つの kaeri の一方に印があれば、その位置の kaeri ごと隠す', () => {
    const position = { blockId: 'b1', after: 't1' };
    const { html } = render(
      doc([
        { type: 'kaeri', position, value: '㆒', ext: quiz('問') },
        { type: 'kaeri', position, value: '㆑' },
      ]),
      HIDE
    );
    expect(html).not.toContain('㆒');
    expect(html).not.toContain('㆑');
  });
});

describe('hideQuiz: reading layer', () => {
  const marks: Mark[] = [{ type: 'okurigana', anchor: range('t1'), value: 'ヅ', ext: quiz('問') }];
  const withReadings = doc(marks, { readings: [{ kind: 'kakikudashi', text: '甲ヅ' }] });

  it('hideQuiz があり readingLayerSource が無いときは、表示層から作った読み上げになる', () => {
    const { html } = render(withReadings, HIDE);
    const reading = dom(html).querySelector('.skam-reading')?.textContent ?? '';
    expect(reading).not.toContain('ヅ');
  });

  it("readingLayerSource: 'readings' を明示したときは文書の readings を読む", () => {
    const { html } = render(withReadings, { ...HIDE, readingLayerSource: 'readings' });
    expect(dom(html).querySelector('.skam-reading')?.textContent).toBe('甲ヅ');
  });

  it('hideQuiz が無ければ従来どおり readings を読む', () => {
    expect(dom(render(withReadings).html).querySelector('.skam-reading')?.textContent).toBe('甲ヅ');
  });
});

describe('hideQuiz: options and leaks', () => {
  it('不正な hideQuiz は TypeError、メッセージに入力の値を入れない', () => {
    const bad: unknown[] = [false, 1, 'SECRETVALUE', [''], ['a'.repeat(65)], Array(101).fill('a')];
    for (const hideQuiz of bad) {
      expect(() => render(doc([]), { hideQuiz } as RenderOptions)).toThrow(TypeError);
      expect(() => renderHTML(doc([]), { hideQuiz } as RenderOptions)).toThrow(TypeError);
    }
    try {
      render(doc([]), { hideQuiz: 'SECRETVALUE' as never });
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRETVALUE');
    }
  });

  it('assertHideQuizOption と HideQuizOption を再公開する', () => {
    const option: HideQuizOption | undefined = assertHideQuizOption(['問1']);
    expect(option).toEqual(['問1']);
  });

  it('ext の値、知らない拡張の値、custom の canary は出力に出ない', () => {
    const CANARY = 'CANARYVALUE<>"&';
    const document = doc(
      [
        {
          type: 'okimoji',
          anchor: range('t1'),
          ext: { ...quiz(CANARY), zzz: { a: CANARY } },
          custom: { a: CANARY },
        } as Mark,
        { type: 'tateten', anchor: range('t2', 't3'), ext: quiz(CANARY) },
      ],
      { extensions: ['edu', 'zzz'], custom: { a: CANARY } }
    );
    for (const options of [{}, HIDE, { hideQuiz: [CANARY] }]) {
      const { html } = render(document, options);
      expect(html).not.toContain('CANARYVALUE');
      expect(html).not.toContain('&lt;&gt;');
    }
  });
});

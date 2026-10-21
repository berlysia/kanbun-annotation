import { describe, it, expect } from 'vitest';
import { validateSKAMDocument } from '../../../validator.js';
import { eduExtension, isQuizHidden, assertHideQuizOption, type QuizMarkType } from '../index.js';
import { extensionRegistry, resolveExtensions } from '../../index.js';
import type { Mark } from '../../../index.js';

const TOKENS = [
  { id: 't1', text: '學' },
  { id: 't2', text: '而' },
];

function quizMarks(
  quiz: unknown
): Record<QuizMarkType | 'highlight' | 'emphasis' | 'ref' | 'linebreak', Mark> {
  const ext = { edu: { quiz } };
  const anchor = { from: 't1', to: 't1' };
  const position = { blockId: 'b1', after: 't1' };
  return {
    kaeri: { type: 'kaeri', id: 'm1', position, value: '㆒', ext },
    okurigana: { type: 'okurigana', id: 'm2', anchor, value: 'ブ', ext },
    soegana: { type: 'soegana', id: 'm3', anchor, value: 'を', ext },
    yomigana: { type: 'yomigana', id: 'm4', anchor, value: 'まな', ext },
    saidoku: { type: 'saidoku', id: 'm5', anchor, forms: [{ yomi: 'ま' }], ext },
    kutoten: { type: 'kutoten', id: 'm6', position, value: '。', ext },
    tateten: { type: 'tateten', id: 'm7', anchor, ext },
    okototen: {
      type: 'okototen',
      id: 'm8',
      anchor,
      position: { system: 'glyph-grid', grid: '5x5', x: 1, y: 1 },
      shape: 'dot',
      ext,
    },
    okimoji: { type: 'okimoji', id: 'm9', anchor, ext },
    joji: { type: 'joji', id: 'm10', anchor, ext },
    highlight: { type: 'highlight', id: 'm11', anchor, ext },
    emphasis: { type: 'emphasis', id: 'm12', anchor, ext },
    ref: { type: 'ref', id: 'm13', position, label: 'a', ext },
    linebreak: { type: 'linebreak', id: 'm14', position, ext },
  } as never;
}

function doc(marks: Mark[], extra: Record<string, unknown> = {}) {
  return {
    format: 'skam@0.1',
    tokens: TOKENS,
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
    marks,
    readings: [],
    extensions: ['edu'],
    extensionsRequired: ['edu'],
    ...extra,
  };
}

const QUIZ_TYPES = [
  'kaeri',
  'okurigana',
  'soegana',
  'yomigana',
  'saidoku',
  'kutoten',
  'tateten',
  'okototen',
  'okimoji',
  'joji',
] as const;

describe('edu extension: validate', () => {
  it.each(QUIZ_TYPES)('%s の注記の quiz を受け入れる', (type) => {
    expect(validateSKAMDocument(doc([quizMarks('問1')[type]])).valid).toBe(true);
  });

  it.each(['highlight', 'emphasis', 'ref', 'linebreak'] as const)(
    '%s の注記の ext.edu は誤り',
    (type) => {
      expect(validateSKAMDocument(doc([quizMarks('問1')[type]])).valid).toBe(false);
    }
  );

  it('quiz の誤り', () => {
    const surrogate = '\u{20BB7}';
    const bad: unknown[] = [
      '',
      surrogate.repeat(65),
      1,
      '問\t1',
      '問\n1',
      '問\u00851',
      '問\u007F1',
    ];
    for (const quiz of bad) {
      expect(validateSKAMDocument(doc([quizMarks(quiz).kaeri])).valid).toBe(false);
    }
    expect(validateSKAMDocument(doc([quizMarks(surrogate.repeat(64)).kaeri])).valid).toBe(true);
  });

  it('quiz 以外のキー、quiz の無い ext.edu、オブジェクトでない値は誤り', () => {
    const base = quizMarks('問1').kaeri as unknown as Record<string, unknown>;
    for (const edu of [{ quiz: '問1', x: 1 }, {}, 'x', []]) {
      expect(validateSKAMDocument(doc([{ ...base, ext: { edu } } as never])).valid).toBe(false);
    }
  });

  it('ブロック、token、readings、文書の ext.edu は誤り', () => {
    const edu = { edu: { quiz: '問1' } };
    const mark = quizMarks('問1').kaeri;
    expect(
      validateSKAMDocument({
        ...doc([mark]),
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2'], ext: edu }],
      }).valid
    ).toBe(false);
    expect(
      validateSKAMDocument({
        ...doc([mark]),
        tokens: [{ ...TOKENS[0]!, ext: edu }, TOKENS[1]!],
      }).valid
    ).toBe(false);
    expect(
      validateSKAMDocument({ ...doc([mark]), readings: [{ kind: 'kundoku', text: 'x', ext: edu }] })
        .valid
    ).toBe(false);
    expect(validateSKAMDocument({ ...doc([mark]), ext: edu }).valid).toBe(false);
  });

  it('束を既定に使い、必須の挙げ忘れは INVALID_EXTENSION', () => {
    const mark = quizMarks('問1').kaeri;
    expect(validateSKAMDocument(doc([mark])).valid).toBe(true);
    const missing = validateSKAMDocument(doc([mark], { extensionsRequired: undefined }));
    expect(missing.valid).toBe(false);
    if (!missing.valid) expect(missing.errors.map((e) => e.kind)).toContain('INVALID_EXTENSION');
  });

  it('利用者が edu という名前の定義を渡すと TypeError', () => {
    expect(() => validateSKAMDocument(doc([]), { extensions: [{ ...eduExtension }] })).toThrow(
      TypeError
    );
  });
});

describe('edu extension: definition and registry', () => {
  it('名前、URI、必須を持ち、登録簿と一致する', () => {
    expect(eduExtension.name).toBe('edu');
    expect(eduExtension.uri).toBe('urn:skam:edu:1');
    expect(eduExtension.required).toBe(true);
    expect(extensionRegistry).toContainEqual({
      name: 'edu',
      uri: 'urn:skam:edu:1',
      required: true,
    });
    expect(resolveExtensions().get('edu')).toBe(eduExtension);
  });
});

describe('edu extension: XML attributes', () => {
  const kaeri = quizMarks('問2').kaeri;
  it('self の要素は quiz を読み書きする', () => {
    const bare = { ...kaeri, ext: undefined } as unknown as Mark;
    const read = eduExtension.readXmlAttributes!(new Map([['quiz', '問2']]), {
      element: 'skam:kaeri',
      marks: [{ part: 'self', mark: bare }],
    });
    expect(read).toEqual({ values: [{ mark: bare, value: { quiz: '問2' } }] });
    const written = eduExtension.writeXmlAttributes!({
      element: 'skam:kaeri',
      marks: [{ part: 'self', mark: kaeri }],
    });
    expect([...written]).toEqual([['quiz', '問2']]);
  });

  it('skam:kun は部分ごとの属性を読み書きする', () => {
    const [okuri, yomi] = [quizMarks('問3').okurigana, quizMarks('問4').yomigana];
    const written = eduExtension.writeXmlAttributes!({
      element: 'skam:kun',
      marks: [
        { part: 'yomi', mark: yomi },
        { part: 'okuri', mark: okuri },
      ],
    });
    expect(Object.fromEntries(written)).toEqual({ 'yomi-quiz': '問4', 'okuri-quiz': '問3' });
    const read = eduExtension.readXmlAttributes!(new Map([['okuri-quiz', '問3']]), {
      element: 'skam:kun',
      marks: [{ part: 'okuri', mark: { ...okuri, ext: undefined } as unknown as Mark }],
    });
    expect('values' in read && read.values[0]!.value).toEqual({ quiz: '問3' });
  });

  it('誤りの文字列は属性の値を含まない', () => {
    const mark = { ...quizMarks('x').kaeri, ext: undefined } as unknown as Mark;
    const cases: [
      string,
      Map<string, string>,
      Parameters<NonNullable<typeof eduExtension.readXmlAttributes>>[1],
    ][] = [
      [
        'skam:kaeri',
        new Map([['quiz', '']]),
        { element: 'skam:kaeri', marks: [{ part: 'self', mark }] },
      ],
      [
        'skam:kun',
        new Map([['quiz', 'SECRET']]),
        { element: 'skam:kun', marks: [{ part: 'yomi', mark }] },
      ],
      [
        'skam:kun',
        new Map([['okuri-quiz', 'SECRET']]),
        { element: 'skam:kun', marks: [{ part: 'yomi', mark }] },
      ],
      [
        'skam:ref',
        new Map([['quiz', 'SECRET']]),
        { element: 'skam:ref', marks: [{ part: 'self', mark }] },
      ],
      [
        'skam:kaeri',
        new Map([['other', 'SECRET']]),
        { element: 'skam:kaeri', marks: [{ part: 'self', mark }] },
      ],
    ];
    for (const [, attrs, target] of cases) {
      const result = eduExtension.readXmlAttributes!(attrs, target);
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error).not.toContain('SECRET');
    }
  });
});

describe('isQuizHidden / assertHideQuizOption', () => {
  const marked = quizMarks('問1').okurigana;
  const plain = { ...marked, ext: undefined } as unknown as Mark;

  it('isQuizHidden', () => {
    expect(isQuizHidden(marked, undefined)).toBe(false);
    expect(isQuizHidden(marked, true)).toBe(true);
    expect(isQuizHidden(marked, ['問1'])).toBe(true);
    expect(isQuizHidden(marked, ['問2'])).toBe(false);
    expect(isQuizHidden(plain, true)).toBe(false);
  });

  it('assertHideQuizOption は正しい値を返す', () => {
    expect(assertHideQuizOption(undefined)).toBeUndefined();
    expect(assertHideQuizOption(true)).toBe(true);
    expect(assertHideQuizOption([])).toEqual([]);
    expect(assertHideQuizOption(['問1', '問1'])).toEqual(['問1', '問1']);
  });

  it('assertHideQuizOption は誤りで TypeError、メッセージに入力の値を入れない', () => {
    const bad: unknown[] = [
      false,
      1,
      'x',
      [''],
      ['a'.repeat(65)],
      Array.from({ length: 101 }, () => 'a'),
      ['SECRETVALUE', 1],
    ];
    for (const value of bad) {
      expect(() => assertHideQuizOption(value)).toThrow(TypeError);
    }
    try {
      assertHideQuizOption('SECRETVALUE');
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRETVALUE');
    }
  });
});

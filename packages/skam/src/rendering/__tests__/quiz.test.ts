import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '../../index.js';
import { defaultExtensions } from '../../extensions/index.js';
import { buildAnnotationIR } from '../build-annotation-ir.js';
import { describeAnnotationIR } from '../accessible-text.js';
import { RENDER_PROFILES } from '../render-profile.js';
import type {
  AIRBlockChild,
  AIRDocument,
  AIRRenderProfile,
  AIRRubyGroupNode,
  AIRTatetenGroupNode,
  AIRTokenNode,
} from '../air-types.js';

const FULL: AIRRenderProfile = RENDER_PROFILES.full;
const quiz = (name: string) => ({ edu: { quiz: name } });
const range = (from: string, to = from) => ({ from, to });

/** 學而時習之（t1〜t5）を 1 ブロックに置く。宣言のある文書 */
function doc(marks: Mark[], declared = true): SKAMDocument {
  return {
    format: 'skam@0.1',
    ...(declared ? { extensions: ['edu'], extensionsRequired: ['edu'] } : {}),
    tokens: ['學', '而', '時', '習', '之'].map((text, i) => ({ id: `t${i + 1}`, text })),
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks,
    readings: [],
  };
}

function build(
  document: SKAMDocument,
  hideQuiz: unknown,
  extensions: Parameters<typeof buildAnnotationIR>[2] = {
    extensions: defaultExtensions,
    extensionOptions: { edu: { hideQuiz } },
  }
): AIRDocument {
  return buildAnnotationIR(document, FULL, extensions);
}

function tokenNode(air: AIRDocument, id: string): AIRTokenNode {
  const found = findToken(air.blocks[0]!.children, id);
  if (!found) throw new Error(`no token ${id}`);
  return found;
}

function findToken(children: readonly AIRBlockChild[], id: string): AIRTokenNode | undefined {
  for (const child of children) {
    if (child.type === 'token' && child.token.id === id) return child;
    if ('children' in child) {
      const inner = findToken(child.children, id);
      if (inner) return inner;
    }
  }
  return undefined;
}

describe('buildAnnotationIR: quiz hiding', () => {
  const gaku = (q = '問1'): Mark[] => [
    { type: 'yomigana', anchor: range('t1'), value: 'まな' },
    { type: 'okurigana', anchor: range('t1'), value: 'ブ', ext: quiz(q) },
  ];

  it('隠す注記の slot だけを hiddenSlots に挙げ、slot の値は消さない', () => {
    const node = tokenNode(build(doc(gaku()), ['問1']), 't1');
    expect(node.hiddenSlots).toEqual(['okuri']);
    expect(node.slots.okuri).toBe('ブ');
    expect(node.slots.ruby).toBe('まな');
  });

  it('名前が合わない、または hideQuiz が無いときは hiddenSlots のキーが無い', () => {
    expect('hiddenSlots' in tokenNode(build(doc(gaku()), ['問2']), 't1')).toBe(false);
    expect('hiddenSlots' in tokenNode(build(doc(gaku()), undefined), 't1')).toBe(false);
  });

  it('同じ位置の kaeri のどれか 1 つに印があれば、その位置の kaeri ごと隠す', () => {
    const marks: Mark[] = [
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒', ext: quiz('問1') },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ];
    const node = tokenNode(build(doc(marks), true), 't1');
    expect(node.hiddenSlots).toEqual(['kaeri']);
    expect(node.slots.kaeri).toBe('㆒㆑');
  });

  it('kutoten と soegana の slot', () => {
    const marks: Mark[] = [
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。', ext: quiz('問1') },
      { type: 'soegana', anchor: range('t1'), value: 'を', ext: quiz('問1') },
    ];
    expect(new Set(tokenNode(build(doc(marks), true), 't1').hiddenSlots)).toEqual(
      new Set(['kutoten', 'soegana'])
    );
  });

  describe('saidoku', () => {
    const saidoku = (q?: string): Mark => ({
      type: 'saidoku',
      anchor: range('t1'),
      forms: [
        { yomi: 'いま', okuri: 'ダ' },
        { yomi: 'また', okuri: 'ル' },
      ],
      ...(q ? { ext: quiz(q) } : {}),
    });

    it('印のある saidoku は ruby、okuri、saidokuUnder、saidokuOkuri2 を隠す', () => {
      const node = tokenNode(build(doc([saidoku('問1')]), true), 't1');
      expect(new Set(node.hiddenSlots)).toEqual(
        new Set(['ruby', 'okuri', 'saidokuUnder', 'saidokuOkuri2'])
      );
    });

    it('saidoku に印が無く yomigana に印があるときは、saidoku が読みを上書きするので何も隠さない', () => {
      const marks: Mark[] = [
        saidoku(),
        { type: 'yomigana', anchor: range('t1'), value: 'まな', ext: quiz('問1') },
      ];
      expect('hiddenSlots' in tokenNode(build(doc(marks), true), 't1')).toBe(false);
    });

    it('saidoku が 2 つで 2 つ目だけに印があるときは、1 つ目が使われるので何も隠さない', () => {
      expect('hiddenSlots' in tokenNode(build(doc([saidoku(), saidoku('問1')]), true), 't1')).toBe(
        false
      );
    });
  });

  it('okimoji のどれか 1 つに印があれば isOkimoji を立てない', () => {
    const marks: Mark[] = [
      { type: 'okimoji', anchor: range('t2') },
      { type: 'okimoji', anchor: range('t2'), ext: quiz('問1') },
    ];
    expect(tokenNode(build(doc(marks), true), 't2').slots.isOkimoji).toBeUndefined();
    expect(tokenNode(build(doc(marks), undefined), 't2').slots.isOkimoji).toBe(true);
  });

  it('joji のどれか 1 つに印があれば isJoji を立てない', () => {
    const marks: Mark[] = [{ type: 'joji', anchor: range('t2'), ext: quiz('問1') }];
    expect(tokenNode(build(doc(marks), true), 't2').slots.isJoji).toBeUndefined();
  });

  describe('hidden / kaeriHidden', () => {
    it('竪点のグループ', () => {
      const air = build(
        doc([{ type: 'tateten', anchor: range('t1', 't2'), ext: quiz('問1') }]),
        true
      );
      expect((air.blocks[0]!.children[0] as AIRTatetenGroupNode).hidden).toBe(true);
      const other = build(doc([{ type: 'tateten', anchor: range('t1', 't2') }]), true);
      expect('hidden' in (other.blocks[0]!.children[0] as AIRTatetenGroupNode)).toBe(false);
    });

    it('竪点の区切りの kaeri', () => {
      const marks: Mark[] = [
        { type: 'tateten', anchor: range('t1', 't3') },
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒', ext: quiz('問1') },
      ];
      const group = build(doc(marks), true).blocks[0]!.children[0] as AIRTatetenGroupNode;
      const separators = group.children.filter((c) => c.type === 'tateten-separator');
      expect(separators.map((s) => s.kaeri)).toEqual(['㆒', undefined]);
      expect(separators.map((s) => s.kaeriHidden)).toEqual([true, undefined]);
    });

    it('範囲の yomigana と、範囲の後ろの kutoten', () => {
      const marks: Mark[] = [
        { type: 'yomigana', anchor: range('t1', 't2'), value: 'がくじ', ext: quiz('問1') },
        {
          type: 'kutoten',
          position: { blockId: 'b1', after: 't2' },
          value: '。',
          ext: quiz('問1'),
        },
        { type: 'kutoten', position: { blockId: 'b1', after: 't2' }, value: '、' },
      ];
      const ruby = build(doc(marks), true).blocks[0]!.children[0] as AIRRubyGroupNode;
      expect(ruby.yomigana.hidden).toBe(true);
      // kutoten は範囲の最後の字の slot に残り、印のある kutoten が隠される
      expect(tokenNode(build(doc(marks), true), 't2').hiddenSlots).toEqual(['kutoten']);
      const air = build(doc(marks.slice(0, 1)), true);
      expect(tokenNode(air, 't2').slots.kutoten).toBeUndefined();

      const trailing = build(
        doc([
          { type: 'yomigana', anchor: range('t1', 't2'), value: 'がくじ' },
          {
            type: 'kutoten',
            position: { blockId: 'b1', after: 't2' },
            value: '。',
            ext: quiz('問1'),
          },
        ]),
        true
      );
      expect(tokenNode(trailing, 't2').slots.kutoten).toBe('。');
      expect(tokenNode(trailing, 't2').hiddenSlots).toEqual(['kutoten']);
      expect(tokenNode(trailing, 't1')).not.toHaveProperty('hiddenSlots');
    });

    it('ブロック先頭の kutoten', () => {
      const marks: Mark[] = [
        { type: 'kutoten', position: { blockId: 'b1' }, value: '。', ext: quiz('問1') },
        { type: 'kutoten', position: { blockId: 'b1' }, value: '、' },
      ];
      const air = build(doc(marks), true);
      expect(air.blocks[0]!.blockStartKutoten).toEqual([
        { value: '。', hidden: true },
        { value: '、' },
      ]);
    });

    it('okototen のセル 2 つの一方', () => {
      const cell = (x: number, q?: string): Mark => ({
        type: 'okototen',
        anchor: range('t1'),
        position: { system: 'glyph-grid', grid: '5x5', x, y: 1 },
        shape: 'dot',
        ...(q ? { ext: quiz(q) } : {}),
      });
      const node = tokenNode(build(doc([cell(1, '問1'), cell(2)]), true), 't1');
      expect(node.slots.okototen).toEqual([
        { x: 1, y: 1, cols: 5, rows: 5, shape: 'dot', hidden: true },
        { x: 2, y: 1, cols: 5, rows: 5, shape: 'dot' },
      ]);
    });
  });

  it('宣言の無い文書では ext.edu.quiz があっても何も隠さない', () => {
    const marks: Mark[] = [
      { type: 'okurigana', anchor: range('t1'), value: 'ブ', ext: quiz('問1') },
    ];
    expect('hiddenSlots' in tokenNode(build(doc(marks, false), true), 't1')).toBe(false);
  });

  it('extensions を渡さない buildAnnotationIR は何も隠さない', () => {
    const marks: Mark[] = [
      { type: 'okurigana', anchor: range('t1'), value: 'ブ', ext: quiz('問1') },
    ];
    expect('hiddenSlots' in tokenNode(buildAnnotationIR(doc(marks), FULL), 't1')).toBe(false);
  });

  it('hideQuiz の形が不正なら TypeError (宣言の無い文書でも)', () => {
    expect(() => build(doc([], false), 'x')).toThrow(TypeError);
    expect(() => build(doc([]), [''])).toThrow(TypeError);
  });
});

describe('describeAnnotationIR: quiz hiding', () => {
  it('隠した送り仮名の note が無く、読み仮名の note はある', () => {
    const marks: Mark[] = [
      { type: 'yomigana', anchor: range('t1'), value: 'まな' },
      { type: 'okurigana', anchor: range('t1'), value: 'ブ', ext: quiz('問1') },
    ];
    const notes = describeAnnotationIR(build(doc(marks), ['問1']))[0]!.units[0]!.notes;
    expect(notes.map((n) => n.kind)).toEqual(['yomigana']);
    const shown = describeAnnotationIR(build(doc(marks), undefined))[0]!.units[0]!.notes;
    expect(shown.map((n) => n.kind)).toEqual(['yomigana', 'okurigana']);
  });

  it('隠した kaeri、kutoten、置字、ヲコト点、再読文字、範囲の読みの note が無い', () => {
    const marks: Mark[] = [
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒', ext: quiz('問1') },
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。', ext: quiz('問1') },
      { type: 'okimoji', anchor: range('t2'), ext: quiz('問1') },
      {
        type: 'okototen',
        anchor: range('t3'),
        position: { system: 'glyph-grid', grid: '5x5', x: 1, y: 1 },
        shape: 'dot',
        ext: quiz('問1'),
      },
      {
        type: 'saidoku',
        anchor: range('t4'),
        forms: [{ yomi: 'いま' }, { yomi: 'また' }],
        ext: quiz('問1'),
      },
      { type: 'yomigana', anchor: range('t1', 't2'), value: 'がくじ', ext: quiz('問1') },
    ];
    const units = describeAnnotationIR(build(doc(marks), true))[0]!.units;
    for (const unit of units) expect(unit.notes).toEqual([]);
    expect(units.map((u) => u.text).join('')).toBe('學而時習之');
  });

  it('隠した竪点の区切りの note と、ブロック先頭の kutoten の単位を出さない', () => {
    const marks: Mark[] = [
      { type: 'tateten', anchor: range('t1', 't3'), ext: quiz('問1') },
      { type: 'kutoten', position: { blockId: 'b1' }, value: '。', ext: quiz('問1') },
    ];
    const units = describeAnnotationIR(build(doc(marks), true))[0]!.units;
    expect(units.map((u) => u.text)).toEqual(['學', '而', '時', '習', '之']);
    expect(units.every((u) => u.notes.length === 0)).toBe(true);
  });
});

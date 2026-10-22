import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '../../index.js';
import { defaultExtensions } from '../../extensions/index.js';
import { buildAnnotationIR } from '../build-annotation-ir.js';
import { describeAnnotationIR, formatAccessibleText } from '../accessible-text.js';
import { resolveEmphasisCharacter } from '../emphasis.js';
import { RENDER_PROFILES } from '../render-profile.js';
import type {
  AIRBlockChild,
  AIRDocument,
  AIRHighlightGroupNode,
  AIRRubyGroupNode,
  AIRTatetenGroupNode,
  AIRTatetenSeparator,
  AIRTokenNode,
} from '../air-types.js';

const FULL = RENDER_PROFILES.full;

type AIRNode = AIRBlockChild | AIRTokenNode;

/** t1..tN を 1 ブロック (b1) に置く */
function docOf(count: number, marks: Mark[]): SKAMDocument {
  const ids = Array.from({ length: count }, (_, i) => `t${i + 1}`);
  return {
    format: 'skam@0.1',
    tokens: ids.map((id) => ({ id, text: '字' })),
    blocks: [{ id: 'b1', tokenIds: ids }],
    marks,
    readings: [],
  };
}

const range = (from: number, to = from) => ({ from: `t${from}`, to: `t${to}` });
const yomi = (from: number, to: number, value = 'あ'): Mark => ({
  type: 'yomigana',
  anchor: range(from, to),
  value,
});
const okuri = (from: number, to: number, value = 'ビ'): Mark => ({
  type: 'okurigana',
  anchor: range(from, to),
  value,
});
const soe = (from: number, to: number, value = 'ヲ'): Mark => ({
  type: 'soegana',
  anchor: range(from, to),
  value,
});
const tateten = (from: number, to: number): Mark => ({ type: 'tateten', anchor: range(from, to) });
const highlight = (from: number, to: number): Mark => ({
  type: 'highlight',
  anchor: range(from, to),
});
const kaeri = (after: number, value: string): Mark => ({
  type: 'kaeri',
  position: { blockId: 'b1', after: `t${after}` },
  value,
});
const br = (after: number): Mark => ({
  type: 'linebreak',
  position: { blockId: 'b1', after: `t${after}` },
});

function build(doc: SKAMDocument): AIRDocument {
  return buildAnnotationIR(doc, FULL);
}

/**
 * 木の形を文字列にする。字は t1、区切りは |、ruby は R(...)、竪点は T(...)、傍線は H(...)。
 * continuesBefore は前に <、continuesAfter は後ろに > を付ける。子は , でつなぐ。
 */
function shape(children: readonly AIRNode[]): string {
  return children
    .map((node): string => {
      switch (node.type) {
        case 'token':
          return node.token.id;
        case 'tateten-separator':
          return '|';
        case 'ruby-group':
          return `R(${shape(node.children)})`;
        case 'tateten-group':
        case 'highlight-group': {
          const name = node.type === 'tateten-group' ? 'T' : 'H';
          const before = node.continuesBefore === true ? '<' : '';
          const after = node.continuesAfter === true ? '>' : '';
          return `${before}${name}(${shape(node.children)})${after}`;
        }
      }
    })
    .join(',');
}

function blockShape(air: AIRDocument): string {
  return shape(air.blocks[0]!.children);
}

/** AIR を前順に歩く */
function walk(
  children: readonly AIRNode[],
  visit: (node: AIRNode, depth: number) => void,
  depth = 0
) {
  for (const node of children) {
    visit(node, depth);
    if ('children' in node) walk(node.children, visit, depth + 1);
  }
}

function tokenNodes(air: AIRDocument): AIRTokenNode[] {
  const out: AIRTokenNode[] = [];
  for (const block of air.blocks) {
    walk(block.children, (node) => {
      if (node.type === 'token') out.push(node);
    });
  }
  return out;
}

function tokenNode(air: AIRDocument, id: string): AIRTokenNode {
  const found = tokenNodes(air).find((node) => node.token.id === id);
  if (!found) throw new Error(`no token ${id}`);
  return found;
}

function groupNodes<T extends AIRNode['type']>(
  air: AIRDocument,
  type: T
): Extract<AIRNode, { type: T }>[] {
  const out: Extract<AIRNode, { type: T }>[] = [];
  for (const block of air.blocks) {
    walk(block.children, (node) => {
      if (node.type === type) out.push(node as Extract<AIRNode, { type: T }>);
    });
  }
  return out;
}

/** 字の id の列が blocks[].tokenIds の連結と同じ (どの字も 1 回、順どおり) */
function expectTokensOnce(air: AIRDocument, doc: SKAMDocument): void {
  expect(tokenNodes(air).map((node) => node.token.id)).toEqual(
    doc.blocks.flatMap((block) => block.tokenIds)
  );
}

function maxDepth(air: AIRDocument): number {
  let max = 0;
  for (const block of air.blocks) {
    walk(block.children, (node, depth) => {
      if (node.type !== 'token' && node.type !== 'tateten-separator')
        max = Math.max(max, depth + 1);
    });
  }
  return max;
}

/** 注記 1 つの断片に含まれる字の id (前順) */
function tokensOfMark(air: AIRDocument, mark: Mark): string[] {
  const out: string[] = [];
  const collect = (nodes: readonly AIRNode[]) => {
    for (const node of nodes) {
      if (node.type === 'token') out.push(node.token.id);
      else if ('children' in node) collect(node.children);
    }
  };
  for (const group of [
    ...groupNodes(air, 'tateten-group'),
    ...groupNodes(air, 'highlight-group'),
  ]) {
    const own = group.type === 'tateten-group' ? group.tatetenMark : group.highlightMark;
    if (own === mark) collect(group.children);
  }
  return out;
}

function separators(air: AIRDocument): AIRTatetenSeparator[] {
  return groupNodes(air, 'tateten-separator');
}

describe('buildAnnotationIR: 重なりの無い 4 形', () => {
  it('(a) 竪点 t1-t2 と ruby t1-t2 は tateten(ruby(t1,区切り,t2))', () => {
    const air = build(docOf(2, [tateten(1, 2), yomi(1, 2)]));
    expect(blockShape(air)).toBe('T(R(t1,|,t2))');
    const ruby = groupNodes(air, 'ruby-group')[0] as AIRRubyGroupNode;
    expect(ruby).toMatchObject({
      yomigana: { value: 'あ' },
      fromTokenId: 't1',
      toTokenId: 't2',
      span: 2,
    });
    expect(ruby.yomigana).not.toHaveProperty('hidden');
  });

  it('(b) ruby t1-t3 ⊃ 竪点 t2-t3 は ruby(t1, tateten(t2,区切り,t3))', () => {
    expect(blockShape(build(docOf(3, [yomi(1, 3), tateten(2, 3)])))).toBe('R(t1,T(t2,|,t3))');
  });

  it('(c) 竪点 t1-t4 ⊃ ruby t2-t3 は tateten(t1,区切り,ruby(t2,区切り,t3),区切り,t4)', () => {
    expect(blockShape(build(docOf(4, [tateten(1, 4), yomi(2, 3)])))).toBe(
      'T(t1,|,R(t2,|,t3),|,t4)'
    );
  });

  it('(d) 傍線 t1-t3 ⊃ ruby t1-t2 は highlight(ruby(t1,t2),t3)', () => {
    expect(blockShape(build(docOf(3, [highlight(1, 3), yomi(1, 2)])))).toBe('H(R(t1,t2),t3)');
  });

  it('範囲が同じ区間は外から傍線、竪点、ruby の順', () => {
    expect(blockShape(build(docOf(2, [yomi(1, 2), tateten(1, 2), highlight(1, 2)])))).toBe(
      'H(T(R(t1,|,t2)))'
    );
  });

  it('重なりの無い文書の断片には continuesBefore / continuesAfter のキーが無い', () => {
    const air = build(docOf(4, [tateten(1, 2), highlight(1, 4), highlight(3, 4)]));
    for (const group of [
      ...groupNodes(air, 'tateten-group'),
      ...groupNodes(air, 'highlight-group'),
    ]) {
      expect(group).not.toHaveProperty('continuesBefore');
      expect(group).not.toHaveProperty('continuesAfter');
    }
  });
});

describe('buildAnnotationIR: 読みの種類と置き場', () => {
  it('yomigana t1-t2 と okurigana t2-t3 は ruby(t1,t2) と t3 の slots.okuri', () => {
    const air = build(docOf(3, [yomi(1, 2), okuri(2, 3)]));
    expect(blockShape(air)).toBe('R(t1,t2),t3');
    expect(tokenNode(air, 't3').slots.okuri).toBe('ビ');
    expect(tokenNode(air, 't2').slots.okuri).toBeUndefined();
  });

  it('yomigana t1-t2、okurigana t2-t3、soegana t3-t4 は ruby(t1,t2)、t3 の okuri、t4 の soegana', () => {
    const air = build(docOf(4, [yomi(1, 2), okuri(2, 3), soe(3, 4)]));
    expect(blockShape(air)).toBe('R(t1,t2),t3,t4');
    expect(tokenNode(air, 't3').slots.okuri).toBe('ビ');
    expect(tokenNode(air, 't4').slots.soegana).toBe('ヲ');
    expect(tokenNode(air, 't3').slots.soegana).toBeUndefined();
  });

  it('範囲の中の返り点と置き字は、その字の slot に残り、読み上げは字、返り点、字、読み仮名の順', () => {
    const doc = docOf(2, [
      yomi(1, 2),
      kaeri(1, '㆑'),
      { type: 'okimoji', anchor: range(2) } as Mark,
    ]);
    const air = build(doc);
    expect(blockShape(air)).toBe('R(t1,t2)');
    expect(tokenNode(air, 't1').slots.kaeri).toBe('㆑');
    expect(tokenNode(air, 't2').slots.isOkimoji).toBe(true);
    const units = describeAnnotationIR(air)[0]!.units;
    expect(units.map((u) => [u.text, u.notes.map((n) => n.kind)])).toEqual([
      ['字', ['kaeri']],
      ['字', ['okimoji']],
      ['', ['yomigana']],
    ]);
  });

  it('yomigana t1-t3 の t2 に 1 字の okurigana は、ruby の中の t2 の slots.okuri', () => {
    const air = build(docOf(3, [yomi(1, 3), okuri(2, 2)]));
    expect(blockShape(air)).toBe('R(t1,t2,t3)');
    expect(tokenNode(air, 't2').slots.okuri).toBe('ビ');
  });

  it('同じ anchor の yomigana は最初の 1 つ、1 字の yomigana も最初の 1 つで、連結しない', () => {
    const air = build(
      docOf(3, [yomi(1, 2, 'あ'), yomi(1, 2, 'い'), yomi(3, 3, 'う'), yomi(3, 3, 'え')])
    );
    expect(groupNodes(air, 'ruby-group')).toHaveLength(1);
    expect(groupNodes(air, 'ruby-group')[0]!.yomigana.value).toBe('あ');
    expect(tokenNode(air, 't3').slots.ruby).toBe('う');
  });

  it('警告のある文書: yomigana t1-t2 と t2-t3 は ruby(t1,t2) だけで、t3 は ruby なし', () => {
    const air = build(docOf(3, [yomi(1, 2, 'A'), yomi(2, 3, 'B')]));
    expect(blockShape(air)).toBe('R(t1,t2),t3');
    expect(tokenNode(air, 't3').slots.ruby).toBeUndefined();
  });

  it('警告のある文書: 捨てた yomigana t2-t3 は竪点 t3-t4 とつながらない', () => {
    const air = build(docOf(4, [yomi(1, 2, 'A'), yomi(2, 3, 'B'), tateten(3, 4)]));
    expect(blockShape(air)).toBe('R(t1,t2),T(t3,|,t4)');
  });

  it('再読文字と範囲の読みが同じ字にあるとき、再読文字の読みが字の slots.ruby に入り、範囲の読みは ruby に描く', () => {
    const saidoku: Mark = {
      type: 'saidoku',
      anchor: range(2),
      forms: [{ yomi: 'いま', okuri: 'ダ' }, { yomi: 'また' }],
    };
    const air = build(docOf(3, [yomi(1, 2, 'がく'), saidoku]));
    expect(blockShape(air)).toBe('R(t1,t2),t3');
    expect(groupNodes(air, 'ruby-group')[0]!.yomigana.value).toBe('がく');
    expect(tokenNode(air, 't2').slots.ruby).toBe('いま');
    expect(tokenNode(air, 't2').slots.saidokuUnder).toBe('また');
  });
});

describe('buildAnnotationIR: 竪点・傍線の断片', () => {
  it('ruby t1-t3 と竪点 t2-t4 は ruby(t1, tateten(t2,区切り,t3)>), 区切り, <tateten(t4)', () => {
    const air = build(docOf(4, [yomi(1, 3), tateten(2, 4)]));
    expect(blockShape(air)).toBe('R(t1,T(t2,|,t3)>),|,<T(t4)');
    // 区切り t3|t4 はブロックの子
    expect(air.blocks[0]!.children.map((c) => c.type)).toEqual([
      'ruby-group',
      'tateten-separator',
      'tateten-group',
    ]);
  });

  it('竪点 t1-t2 と t2-t3 は 1 字の断片もノードにし、t2 の後ろの返り点は区切り t2|t3 に 1 回', () => {
    const air = build(docOf(3, [tateten(1, 2), tateten(2, 3), kaeri(2, '㆒')]));
    expect(blockShape(air)).toBe('T(t1,|,T(t2)>),|,<T(t3)');
    expect(separators(air).map((s) => s.kaeri)).toEqual([undefined, '㆒']);
    expect(tokenNodes(air).filter((n) => n.slots.kaeri !== undefined)).toEqual([]);
  });

  it('竪点 t1-t3 の最後の字 t3 の後ろの返り点(二)は、区切り t2|t3 に 1 回', () => {
    const air = build(docOf(3, [tateten(1, 3), kaeri(3, '㆓')]));
    expect(blockShape(air)).toBe('T(t1,|,t2,|,t3)');
    expect(separators(air).map((s) => s.kaeri)).toEqual([undefined, '㆓']);
    expect(tokenNode(air, 't3').slots.kaeri).toBeUndefined();
  });

  it('レ点は字の slot に残り、レ以外は区切りに移る', () => {
    const air = build(docOf(2, [tateten(1, 2), kaeri(1, '㆑㆒')]));
    expect(tokenNode(air, 't1').slots.kaeri).toBe('㆑');
    expect(separators(air).map((s) => s.kaeri)).toEqual(['㆒']);
  });

  it('1 字の竪点の返り点は字の slot に残る', () => {
    const air = build(docOf(2, [tateten(1, 1), kaeri(1, '㆒')]));
    expect(tokenNode(air, 't1').slots.kaeri).toBe('㆒');
  });

  it('同じ 2 字の間を含む竪点が 2 つあっても、区切りは 1 つだけ', () => {
    const air = build(docOf(3, [tateten(1, 3), tateten(1, 2)]));
    expect(separators(air)).toHaveLength(2);
  });

  it('傍線 t1-t2 と t2-t3 は後の傍線が断片に分かれ、ラベルは後の傍線の最後の断片だけ', () => {
    const marks: Mark[] = [
      highlight(1, 2),
      { type: 'highlight', anchor: range(2, 3), ref: 'r1' },
      { type: 'ref', id: 'r1', position: { blockId: 'b1', after: 't3' }, format: 'numeric-paren' },
    ];
    const air = build(docOf(3, marks));
    expect(blockShape(air)).toBe('H(t1,H(t2)>),<H(t3)');
    const labels = groupNodes(air, 'highlight-group').map((g) => g.refLabel);
    // 前順: 最初の傍線、その中の断片 (continuesAfter)、最後の断片
    expect(labels).toEqual([undefined, undefined, '(1)']);
    expect(describeAnnotationIR(air)[0]!.units.map((u) => u.notes[0]?.kind)).toEqual([
      'highlightStart',
      undefined,
      'highlightStart',
      undefined,
      'highlightEnd',
      undefined,
      'highlightEnd',
    ]);
  });

  it('傍線 t1-t4、竪点 t2-t5、ruby t3-t6 は 3 段の断片で、どの字も 1 回、断片の和集合が元の範囲', () => {
    const marks = [highlight(1, 4), tateten(2, 5), yomi(3, 6)];
    const doc = docOf(6, marks);
    const air = build(doc);
    expectTokensOnce(air, doc);
    const ids = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => `t${from + i}`);
    expect(tokensOfMark(air, marks[0]!)).toEqual(ids(1, 4));
    expect(tokensOfMark(air, marks[1]!)).toEqual(ids(2, 5));
    expect(groupNodes(air, 'ruby-group')[0]!.span).toBe(4);
  });

  it('hasKana と hasEmphasis は断片ごとに、中の字の slot と ruby のグループから決まる', () => {
    const air = build(
      docOf(4, [
        highlight(1, 4),
        highlight(3, 4),
        yomi(1, 2),
        { type: 'emphasis', anchor: range(4), style: 'dot' } as Mark,
      ])
    );
    const [outer, inner] = groupNodes(air, 'highlight-group') as AIRHighlightGroupNode[];
    expect(outer!.hasKana).toBe(true);
    expect(outer!.hasEmphasis).toBe(true);
    expect(inner!.hasKana).toBe(false);
    expect(inner!.hasEmphasis).toBe(true);
  });

  it('区切りは、2 字をともに含む最も内側のノードの子で、字の間にある', () => {
    const air = build(docOf(4, [tateten(1, 4), yomi(2, 3)]));
    const tatetenGroup = groupNodes(air, 'tateten-group')[0] as AIRTatetenGroupNode;
    expect(tatetenGroup.children.map((c) => c.type)).toEqual([
      'token',
      'tateten-separator',
      'ruby-group',
      'tateten-separator',
      'token',
    ]);
  });
});

describe('buildAnnotationIR: 字ごとの注記', () => {
  it('emphasis t1-t2 (dot) と t2-t3 (circle) は t1、t2 が dot、t3 が circle', () => {
    const air = build(
      docOf(3, [
        { type: 'emphasis', anchor: range(1, 2), style: 'dot' } as Mark,
        { type: 'emphasis', anchor: range(2, 3), style: 'circle' } as Mark,
      ])
    );
    const dot = resolveEmphasisCharacter('dot');
    const circle = resolveEmphasisCharacter('circle');
    expect(dot).not.toBe(circle);
    expect(tokenNodes(air).map((n) => n.slots.emphasis)).toEqual([dot, dot, circle]);
  });

  it('okimoji t1-t2 と emphasis t2-t3 は isOkimoji が t1、t2、emphasis が t2、t3', () => {
    const air = build(
      docOf(3, [
        { type: 'okimoji', anchor: range(1, 2) } as Mark,
        { type: 'emphasis', anchor: range(2, 3), style: 'dot' } as Mark,
      ])
    );
    expect(
      tokenNodes(air).map((n) => [n.slots.isOkimoji === true, n.slots.emphasis !== undefined])
    ).toEqual([
      [true, false],
      [true, true],
      [false, true],
    ]);
  });

  it('範囲の読みの後ろの字の注記は、先頭の字に寄せられない', () => {
    const air = build(
      docOf(3, [yomi(1, 3), kaeri(3, '㆒'), { type: 'joji', anchor: range(3) } as Mark])
    );
    expect(tokenNode(air, 't1').slots).toEqual({});
    expect(tokenNode(air, 't3').slots).toMatchObject({ kaeri: '㆒', isJoji: true });
  });
});

describe('buildAnnotationIR: 隠す印', () => {
  const quiz = { edu: { quiz: '問1' } };
  const hiding = { extensions: defaultExtensions, extensionOptions: { edu: { hideQuiz: true } } };
  const withEdu = (doc: SKAMDocument): SKAMDocument => ({
    ...doc,
    extensions: ['edu'],
    extensionsRequired: ['edu'],
  });

  it('ruby の読みを隠すと yomigana.hidden が付き、字の hiddenSlots に ruby は出ない', () => {
    const doc = withEdu(docOf(2, [{ ...yomi(1, 2), ext: quiz } as Mark]));
    const air = buildAnnotationIR(doc, FULL, hiding);
    expect(groupNodes(air, 'ruby-group')[0]!.yomigana.hidden).toBe(true);
    expect(tokenNode(air, 't1')).not.toHaveProperty('hiddenSlots');
  });

  it('範囲の中の字の返り点を隠すと、その字の hiddenSlots に kaeri が入る', () => {
    const doc = withEdu(docOf(2, [yomi(1, 2), { ...kaeri(1, '㆑'), ext: quiz } as Mark]));
    const air = buildAnnotationIR(doc, FULL, hiding);
    expect(tokenNode(air, 't1').hiddenSlots).toEqual(['kaeri']);
    expect(tokenNode(air, 't1').slots.kaeri).toBe('㆑');
    expect(tokenNode(air, 't2')).not.toHaveProperty('hiddenSlots');
  });

  it('断片に分かれた竪点を隠すと、どの断片にも hidden が付き、区切りも hidden', () => {
    const doc = withEdu(docOf(4, [yomi(1, 3), { ...tateten(2, 4), ext: quiz } as Mark]));
    const air = buildAnnotationIR(doc, FULL, hiding);
    const groups = groupNodes(air, 'tateten-group');
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.hidden)).toEqual([true, true]);
    expect(separators(air).map((s) => s.hidden)).toEqual([true, true]);
  });

  it('隠していない竪点の断片と区切りには hidden のキーが無い', () => {
    const doc = withEdu(docOf(4, [yomi(1, 3), tateten(2, 4)]));
    const air = buildAnnotationIR(doc, FULL, hiding);
    for (const group of groupNodes(air, 'tateten-group'))
      expect(group).not.toHaveProperty('hidden');
    for (const sep of separators(air)) expect(sep).not.toHaveProperty('hidden');
  });

  it('隠した読みは読み上げの単位を出さない', () => {
    const doc = withEdu(docOf(2, [{ ...yomi(1, 2), ext: quiz } as Mark]));
    const units = describeAnnotationIR(buildAnnotationIR(doc, FULL, hiding))[0]!.units;
    expect(units.flatMap((u) => u.notes)).toEqual([]);
  });
});

describe('buildAnnotationIR: 改行', () => {
  const flagged = (air: AIRDocument): string[] => {
    const out: string[] = [];
    for (const block of air.blocks) {
      walk(block.children, (node) => {
        if ('lineBreakAfter' in node && node.lineBreakAfter === true) {
          out.push(node.type === 'token' ? node.token.id : node.type);
        }
      });
    }
    return out;
  };

  it('ruby t1-t2 の後ろ (t2 の後ろ) は ruby のグループに lineBreakAfter が付く', () => {
    const air = build(docOf(3, [yomi(1, 2), br(2)]));
    expect(flagged(air)).toEqual(['ruby-group']);
    const units = describeAnnotationIR(air)[0]!.units;
    expect(units.filter((u) => u.lineBreakAfter)).toHaveLength(1);
    expect(units.findIndex((u) => u.lineBreakAfter)).toBe(2);
  });

  it('断片の境目 t3|t4 (竪点 t2-t4 の中) の改行は不可分なので無視する', () => {
    const air = build(docOf(5, [yomi(1, 3), tateten(2, 4), br(3)]));
    expect(flagged(air)).toEqual([]);
  });

  it('その字で終わる最も外側の ruby か竪点に付き、傍線には付かない', () => {
    const air = build(docOf(3, [highlight(1, 2), tateten(1, 2), yomi(1, 2), br(2)]));
    expect(flagged(air)).toEqual(['tateten-group']);
  });

  it('傍線の途中の字の後ろは、その字に付く', () => {
    const air = build(docOf(3, [highlight(1, 3), br(1)]));
    expect(flagged(air)).toEqual(['t1']);
  });
});

describe('buildAnnotationIR: validator を通らない入力', () => {
  it('範囲が逆、ブロックをまたぐ、存在しない字の注記は描かず、字は 1 回ずつ', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: ['t1', 't2', 't3', 't4'].map((id) => ({ id, text: '字' })),
      blocks: [
        { id: 'b1', tokenIds: ['t1', 't2'] },
        { id: 'b2', tokenIds: ['t3', 't4'] },
      ],
      marks: [
        yomi(2, 1),
        tateten(2, 1),
        highlight(2, 1),
        yomi(2, 3),
        tateten(2, 3),
        highlight(2, 3),
        { type: 'yomigana', anchor: { from: 't1', to: 'zz' }, value: 'あ' },
        { type: 'tateten', anchor: { from: 'zz', to: 't2' } },
        { type: 'highlight', anchor: { from: 'zz', to: 'zz' } },
      ],
      readings: [],
    };
    const air = build(doc);
    expectTokensOnce(air, doc);
    expect(groupNodes(air, 'ruby-group')).toEqual([]);
    expect(groupNodes(air, 'tateten-group')).toEqual([]);
    expect(groupNodes(air, 'highlight-group')).toEqual([]);
    expect(() => describeAnnotationIR(air)).not.toThrow();
  });
});

describe('buildAnnotationIR: 描画の上限', () => {
  it('同じ範囲の傍線 1,000 本は深さ 56 まで、字は 1 回ずつ', () => {
    const marks = Array.from({ length: 1000 }, () => highlight(1, 2));
    const doc = docOf(3, marks);
    const air = build(doc);
    expectTokensOnce(air, doc);
    expect(maxDepth(air)).toBe(56);
    expect(groupNodes(air, 'highlight-group')).toHaveLength(56);
  });

  it('始まりが 1 つずつずれた傍線 500 本は、断片が注記ごとに 8 個まで、深さ 56 まで、字は 1 回ずつ', () => {
    const marks = Array.from({ length: 500 }, (_, i) => highlight(i + 1, i + 40));
    const doc = docOf(560, marks);
    const air = build(doc);
    expectTokensOnce(air, doc);
    expect(maxDepth(air)).toBeLessThanOrEqual(56);
    const perMark = new Map<Mark, number>();
    for (const group of groupNodes(air, 'highlight-group')) {
      perMark.set(group.highlightMark, (perMark.get(group.highlightMark) ?? 0) + 1);
    }
    expect(perMark.size).toBeGreaterThan(0);
    for (const count of perMark.values()) expect(count).toBeLessThanOrEqual(8);
  });

  it('竪点と ruby と傍線が深く入れ子になっても、全体の深さは 56 まで', () => {
    const marks: Mark[] = [
      ...Array.from({ length: 50 }, () => tateten(1, 4)),
      ...Array.from({ length: 50 }, () => highlight(1, 4)),
      yomi(1, 4),
    ];
    const doc = docOf(4, marks);
    const air = build(doc);
    expectTokensOnce(air, doc);
    expect(maxDepth(air)).toBe(56);
  });

  it('1 ブロックに始まりが 1 つずつずれた傍線 10,000 本 (字 10,001) は 1,024 本までで、時間内に終わる', () => {
    const marks = Array.from({ length: 10_000 }, (_, i) => highlight(i + 1, i + 2));
    const doc = docOf(10_001, marks);
    const started = Date.now();
    const air = build(doc);
    expect(Date.now() - started).toBeLessThan(5000);
    expectTokensOnce(air, doc);
    const drawn = new Set(groupNodes(air, 'highlight-group').map((g) => g.highlightMark));
    expect(drawn.size).toBe(1024);
    expect(maxDepth(air)).toBeLessThanOrEqual(56);
  });

  it('描かない注記は読み上げにも出さない', () => {
    const marks = Array.from({ length: 60 }, () => highlight(1, 2));
    const air = build(docOf(2, marks));
    const texts = describeAnnotationIR(air)[0]!.units.filter((u) =>
      u.notes.some((n) => n.kind === 'highlightStart')
    );
    expect(texts).toHaveLength(56);
    expect(formatAccessibleText(describeAnnotationIR(air))).toBeTypeOf('string');
  });
});

function randomMark(next: (bound: number) => number, size: number, index: number): Mark {
  const from = 1 + next(size);
  const to = from + next(size - from + 1);
  const makers: (() => Mark)[] = [
    () => yomi(from, to, `y${index}`),
    () => okuri(from, to, `o${index}`),
    () => soe(from, to, `s${index}`),
    () => tateten(from, to),
    () => tateten(from, to),
    () => highlight(from, to),
    () => kaeri(from, next(2) === 0 ? '㆒' : '㆑㆓'),
    () => ({ type: 'okimoji', anchor: range(from, to) }) as Mark,
  ];
  return makers[next(makers.length)]!();
}

describe('buildAnnotationIR: ランダムな重なりの性質 (種を固定、300 文書)', () => {
  it('どの字も 1 回、断片の和集合が元の範囲、区切りと返り点が失われない', () => {
    let seed = 20261022;
    const next = (bound: number): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor(seed / 65536) % bound;
    };
    for (let round = 0; round < 300; round++) {
      const size = 2 + next(10);
      const marks: Mark[] = [];
      const count = 1 + next(8);
      for (let i = 0; i < count; i++) {
        marks.push(randomMark(next, size, i));
      }
      const doc = docOf(size, marks);
      const air = build(doc);
      expectTokensOnce(air, doc);

      // 竪点と傍線: 断片の和集合が元の範囲 (小さい文書では上限に当たらない)
      for (const mark of marks) {
        if (mark.type !== 'tateten' && mark.type !== 'highlight') continue;
        const fromIndex = Number(mark.anchor.from.slice(1));
        const toIndex = Number(mark.anchor.to.slice(1));
        expect(tokensOfMark(air, mark)).toEqual(
          Array.from({ length: toIndex - fromIndex + 1 }, (_, i) => `t${fromIndex + i}`)
        );
      }

      // 区切り: 竪点が覆う隣り合う 2 字の間ごとに 1 つ
      const gaps = new Set<number>();
      for (const mark of marks) {
        if (mark.type !== 'tateten') continue;
        const fromIndex = Number(mark.anchor.from.slice(1));
        const toIndex = Number(mark.anchor.to.slice(1));
        for (let gap = fromIndex; gap < toIndex; gap++) gaps.add(gap);
      }
      expect(separators(air)).toHaveLength(gaps.size);

      // 返り点の字の数は、字の slot と区切りに分けても変わらない
      const placed = new Map<string, string>();
      for (const mark of marks) {
        if (mark.type !== 'kaeri') continue;
        const after = (mark.position as { after: string }).after;
        placed.set(after, (placed.get(after) ?? '') + mark.value);
      }
      const expected = [...placed.values()].reduce((sum, v) => sum + v.length, 0);
      const actual =
        tokenNodes(air).reduce((sum, n) => sum + (n.slots.kaeri?.length ?? 0), 0) +
        separators(air).reduce((sum, s) => sum + (s.kaeri?.length ?? 0), 0);
      expect(actual).toBe(expected);

      // ruby のグループは字の並びの連続した範囲で、読み上げは例外にならない
      for (const ruby of groupNodes(air, 'ruby-group')) {
        const ids: string[] = [];
        walk(ruby.children, (node) => {
          if (node.type === 'token') ids.push(node.token.id);
        });
        expect(ids).toHaveLength(ruby.span);
        expect(ids[0]).toBe(ruby.fromTokenId);
        expect(ids[ids.length - 1]).toBe(ruby.toTokenId);
      }
      expect(() => formatAccessibleText(describeAnnotationIR(air))).not.toThrow();
    }
  });
});

describe('buildAnnotationIR: 不可分単位 (joinedWithNext)', () => {
  const joined = (air: AIRDocument, count: number): string =>
    Array.from({ length: count }, (_, i) =>
      tokenNode(air, `t${i + 1}`).joinedWithNext === true ? '1' : '0'
    ).join('');

  it('選んだ範囲の読みの字の間と、竪点の字の間が不可分。範囲の外とブロックの最後の字は付かない', () => {
    const air = build(docOf(6, [yomi(1, 2), tateten(4, 5)]));
    expect(joined(air, 6)).toBe('100100');
    // 付かないときはキーごと無い
    expect(Object.hasOwn(tokenNode(air, 't3'), 'joinedWithNext')).toBe(false);
    expect(Object.hasOwn(tokenNode(air, 't6'), 'joinedWithNext')).toBe(false);
  });

  it('範囲の送り仮名と添え仮名の字の間は、グループにならなくても不可分', () => {
    expect(joined(build(docOf(4, [okuri(1, 3)])), 4)).toBe('1100');
    expect(joined(build(docOf(4, [soe(2, 4)])), 4)).toBe('0110');
  });

  it('描かずに捨てた読みは不可分にしない (yomigana t1-t2 と t2-t3 では t2|t3 は付かない)', () => {
    expect(joined(build(docOf(4, [yomi(1, 2), yomi(2, 3)])), 4)).toBe('1000');
  });

  it('重なる竪点は和集合。断片に分かれても境目の字は不可分 (竪点 t2-t4 と ruby t1-t3)', () => {
    const air = build(docOf(5, [yomi(1, 3), tateten(2, 4)]));
    expect(joined(air, 5)).toBe('11100');
  });

  it('再読文字・置字・助字の範囲の字の間は不可分', () => {
    const marks: Mark[] = [
      { type: 'okimoji', anchor: range(1, 2) },
      { type: 'joji', anchor: range(4, 5) },
    ];
    expect(joined(build(docOf(6, marks)), 6)).toBe('100100');
  });

  it('profile で描かない種類の注記は不可分にしない', () => {
    const doc = docOf(4, [tateten(1, 3), yomi(3, 4)]);
    const air = buildAnnotationIR(doc, { ...FULL, tateten: false });
    expect(joined(air, 4)).toBe('0010');
  });
});

describe('buildAnnotationIR: 再読文字の形 (slots.saidoku)', () => {
  const saidokuOf = (marks: Mark[], profile = FULL) =>
    tokenNode(buildAnnotationIR(docOf(2, marks), profile), 't1').slots.saidoku;
  const saidokuMark = (forms: { n?: number; yomi?: string; okuri?: string }[]): Mark => ({
    type: 'saidoku',
    anchor: range(1),
    forms,
  });

  it('形を配列の順に持つ。n が無い、または正の整数でない形は配列の順 (1 から)', () => {
    expect(
      saidokuOf([
        saidokuMark([
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { yomi: 'べ' },
          { n: 0, okuri: 'む' },
          { n: 1.5 },
          { n: 7, yomi: 'ほ' },
        ]),
      ])
    ).toEqual({
      forms: [
        { n: 1, yomi: 'まさ', okuri: 'に' },
        { n: 2, yomi: 'べ' },
        { n: 3, okuri: 'む' },
        { n: 4 },
        { n: 7, yomi: 'ほ' },
      ],
    });
  });

  it('形が 1 つだけの再読文字にも付く。第 3 の形以降も持つ (canvas の slot は第 2 の形まで)', () => {
    const air = buildAnnotationIR(
      docOf(2, [saidokuMark([{ yomi: 'まさ' }, { yomi: 'べ', okuri: 'し' }, { okuri: 'む' }])]),
      FULL
    );
    const slots = tokenNode(air, 't1').slots;
    expect(slots.saidoku!.forms).toHaveLength(3);
    expect(slots.ruby).toBe('まさ');
    expect(slots.saidokuUnder).toBe('べ');
    expect(slots.saidokuOkuri2).toBe('し');
    expect(saidokuOf([saidokuMark([{ yomi: 'まさ' }])])).toEqual({
      forms: [{ n: 1, yomi: 'まさ' }],
    });
  });

  it('marks[] で最初の saidoku の形を使う', () => {
    expect(saidokuOf([saidokuMark([{ yomi: 'あ' }]), saidokuMark([{ yomi: 'い' }])])).toEqual({
      forms: [{ n: 1, yomi: 'あ' }],
    });
  });

  it('yomi は profile の yomigana、okuri は okurigana が有効なときだけ入る。saidoku が無効なら付かない', () => {
    const mark = saidokuMark([{ n: 1, yomi: 'まさ', okuri: 'に' }]);
    expect(saidokuOf([mark], { ...FULL, yomigana: false })).toEqual({
      forms: [{ n: 1, okuri: 'に' }],
    });
    expect(saidokuOf([mark], { ...FULL, okurigana: false })).toEqual({
      forms: [{ n: 1, yomi: 'まさ' }],
    });
    expect(saidokuOf([mark], { ...FULL, saidoku: false })).toBeUndefined();
  });

  it('再読文字の無い字には付かない', () => {
    expect(saidokuOf([yomi(1, 1)])).toBeUndefined();
  });
});

describe('buildAnnotationIR: 傍点の style (slots.emphasisStyle)', () => {
  const emphasisStyleOf = (style: unknown, profile = FULL) =>
    tokenNode(
      buildAnnotationIR(
        docOf(2, [{ type: 'emphasis', anchor: range(1), style } as unknown as Mark]),
        profile
      ),
      't1'
    ).slots;

  it('キーワードと 1 字のカスタム記号は、そのまま入る', () => {
    expect(emphasisStyleOf('dot').emphasisStyle).toBe('dot');
    expect(emphasisStyleOf('open circle').emphasisStyle).toBe('open circle');
    expect(emphasisStyleOf('★').emphasisStyle).toBe('★');
    expect(emphasisStyleOf('★').emphasis).toBe('★');
  });

  it('検証を通らない style (未指定、型違い、未知の語) は filled dot。emphasis の文字は既定の点', () => {
    for (const style of [undefined, 42, 'Dot', 'no-such-style']) {
      const slots = emphasisStyleOf(style);
      expect(slots.emphasisStyle).toBe('filled dot');
      expect(slots.emphasis).toBe(resolveEmphasisCharacter(style));
    }
  });

  it('傍点が無い字と、profile で無効なときは付かない', () => {
    expect(tokenNode(build(docOf(2, [yomi(1, 1)])), 't1').slots.emphasisStyle).toBeUndefined();
    expect(emphasisStyleOf('dot', { ...FULL, emphasis: false }).emphasisStyle).toBeUndefined();
  });
});

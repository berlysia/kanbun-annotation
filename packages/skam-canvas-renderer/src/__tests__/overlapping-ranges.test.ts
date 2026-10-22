import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';
import { buildAnnotationIR, RENDER_PROFILES } from '@kanbun-skam/skam/rendering';
import { render } from '../index.js';
import { convertAIRToCanvasRenderTree } from '../air-adapter.js';
import { layout } from '../layout.js';
import type {
  CanvasGroupChild,
  CanvasHighlightGroupNode,
  CanvasTokenNode,
  ColumnLayout,
  DocumentLayout,
  TatetenSeparatorLayout,
  TokenLayout,
} from '../types.js';
import { highlightLanePitch } from '../draw-marks.js';
import { RecordingCanvas, RecordingContext } from './recording-context.js';

/**
 * 重なる範囲 (ruby・竪点・傍線の部分交差) の Canvas の描画。
 * 字は 1 回だけ描き、ruby の範囲は最初の字に値と字の数を置き、竪点の区切りは 2 字の間に置く。
 */

const TEXTS = ['子', '曰', '學', '而', '時', '習'] as const;
const SEPARATOR_CHAR = '㆐';

function docOf(count: number, marks: Mark[], texts: readonly string[] = TEXTS): SKAMDocument {
  const ids = Array.from({ length: count }, (_, i) => `t${i + 1}`);
  return {
    format: 'skam@0.1',
    tokens: ids.map((id, i) => ({ id, text: texts[i]! })),
    blocks: [{ id: 'b1', tokenIds: ids }],
    marks,
    readings: [],
  };
}

const range = (from: number, to = from) => ({ from: `t${from}`, to: `t${to}` });
const after = (n: number) => ({ blockId: 'b1', after: `t${n}` });
const yomi = (from: number, to: number, value = 'あ'): Mark => ({
  type: 'yomigana',
  anchor: range(from, to),
  value,
});
const tateten = (from: number, to: number): Mark => ({ type: 'tateten', anchor: range(from, to) });
const highlight = (from: number, to: number, ref?: string): Mark => ({
  type: 'highlight',
  anchor: range(from, to),
  ...(ref ? { ref } : {}),
});

function treeOf(doc: SKAMDocument) {
  return convertAIRToCanvasRenderTree(buildAnnotationIR(doc, RENDER_PROFILES.full));
}

function layoutOf(doc: SKAMDocument): DocumentLayout {
  return layout(treeOf(doc), new RecordingContext());
}

function tokensOf(column: ColumnLayout): TokenLayout[] {
  return column.children.filter((c): c is TokenLayout => c.type === 'token');
}

function separatorsOf(column: ColumnLayout): TatetenSeparatorLayout[] {
  return column.children.filter((c): c is TatetenSeparatorLayout => c.type === 'tateten-separator');
}

/** 文書の順に並んだ、描いた本文の字 */
function drawnChars(doc: SKAMDocument): string {
  return layoutOf(doc)
    .columns.flatMap((column) => tokensOf(column).map((t) => t.baseChar))
    .join('');
}

/** render() が本文の字を fillText した回数の並び */
function baseFillTexts(doc: SKAMDocument): string[] {
  const canvas = new RecordingCanvas();
  render(doc, canvas);
  return canvas
    .getContext('2d')
    .getCalls('fillText')
    .map((c) => c.args[0] as string)
    .filter((text) => (TEXTS as readonly string[]).includes(text));
}

function fillTextsOf(doc: SKAMDocument): string[] {
  const canvas = new RecordingCanvas();
  render(doc, canvas);
  return canvas
    .getContext('2d')
    .getCalls('fillText')
    .map((c) => c.args[0] as string);
}

function tokensInTree(nodes: readonly CanvasGroupChild[]): CanvasTokenNode[] {
  return nodes.flatMap((node) => {
    if (node.type === 'token') return [node];
    if (node.type === 'tateten-separator') return [];
    return tokensInTree(node.children);
  });
}

describe('canvas: overlapping ranges', () => {
  const refMark: Mark = { id: 'r1', type: 'ref', label: 'L', content: '注', position: after(3) };

  const documents: { name: string; doc: SKAMDocument }[] = [
    { name: 'ruby t1-t3 and tateten t2-t4', doc: docOf(5, [yomi(1, 3, 'あいう'), tateten(2, 4)]) },
    { name: 'tateten t1-t2 and t2-t3', doc: docOf(4, [tateten(1, 2), tateten(2, 3)]) },
    {
      name: 'highlight t1-t3 and ruby t2-t4',
      doc: docOf(5, [highlight(1, 3), yomi(2, 4, 'あい')]),
    },
    {
      name: 'highlight t1-t4, tateten t2-t5 and ruby t3-t6',
      doc: docOf(6, [highlight(1, 4), tateten(2, 5), yomi(3, 6, 'あいうえ')]),
    },
    { name: 'tateten t1-t4 and ruby t2-t3', doc: docOf(5, [tateten(1, 4), yomi(2, 3, 'あい')]) },
    { name: 'ruby t1-t3 and tateten t2-t3', doc: docOf(4, [yomi(1, 3, 'あいう'), tateten(2, 3)]) },
    {
      name: 'highlight t1-t3 and ruby t1-t2',
      doc: docOf(4, [highlight(1, 3), yomi(1, 2, 'あい')]),
    },
    {
      name: 'readings that overlap (READING_OVERLAP)',
      doc: docOf(4, [yomi(1, 2, 'あい'), yomi(2, 3, 'かき'), yomi(3, 4, 'さし')]),
    },
    {
      name: 'ruby t1-t3 with a long reading, over a tateten t2-t4',
      doc: docOf(5, [yomi(1, 3, 'あいうえおかきくけこ'), tateten(2, 4)]),
    },
  ];

  for (const { name, doc } of documents) {
    it(`${name}: draws every character once, in order, down the column`, () => {
      const expected = doc.tokens.map((t) => t.text).join('');
      expect(drawnChars(doc)).toBe(expected);
      expect([...baseFillTexts(doc)].sort()).toEqual([...expected].sort());

      const [column] = layoutOf(doc).columns;
      const ys = tokensOf(column!).map((t) => t.y);
      expect(ys).toEqual([...ys].sort((a, b) => a - b));
      expect(new Set(ys).size).toBe(ys.length);
    });
  }

  describe('ruby of a range reading', () => {
    it('is held by the group once, with the number of characters as rubySpan', () => {
      const doc = docOf(5, [yomi(1, 3, 'あいう'), tateten(2, 4)]);
      const tokens = tokensInTree(treeOf(doc).blocks[0]!.children);
      expect(tokens.map((t) => t.slots.ruby)).toEqual([
        'あいう',
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect(tokens[0]!.slots.rubySpan).toBe(3);
      expect(tokens.slice(1).every((t) => t.slots.rubySpan === undefined)).toBe(true);
    });

    it('is drawn once: each reading character once', () => {
      const texts = fillTextsOf(docOf(5, [yomi(1, 3, 'あいう'), tateten(2, 4)]));
      for (const ch of ['あ', 'い', 'う']) {
        expect(texts.filter((text) => text === ch)).toHaveLength(1);
      }
    });

    it('a ruby inside a tateten group keeps the group and the separators (tateten t1-t4, ruby t2-t3)', () => {
      const doc = docOf(5, [tateten(1, 4), yomi(2, 3, 'あい')]);
      const [column] = layoutOf(doc).columns;
      expect(separatorsOf(column!)).toHaveLength(3);
      const tokens = tokensOf(column!);
      expect(tokens[1]!.slots.ruby?.text).toBe('あい');
      expect(tokens[2]!.slots.ruby).toBeUndefined();
    });
  });

  describe('ruby t1-t3 and tateten t2-t4', () => {
    const doc = docOf(5, [yomi(1, 3, 'あいう'), tateten(2, 4)]);

    it('has two separators, t2|t3 and t3|t4, each between its two characters', () => {
      const [column] = layoutOf(doc).columns;
      const separators = separatorsOf(column!);
      const tokens = tokensOf(column!);
      expect(separators).toHaveLength(2);
      expect(separators[0]!.y).toBeGreaterThan(tokens[1]!.y);
      expect(separators[0]!.y).toBeLessThan(tokens[2]!.y);
      expect(separators[1]!.y).toBeGreaterThan(tokens[2]!.y);
      expect(separators[1]!.y).toBeLessThan(tokens[3]!.y);
    });

    it('draws the separator character twice', () => {
      expect(fillTextsOf(doc).filter((text) => text === SEPARATOR_CHAR)).toHaveLength(2);
    });
  });

  describe('tateten t1-t2 and t2-t3', () => {
    it('has a separator for each pair, t1|t2 and t2|t3', () => {
      const doc = docOf(4, [tateten(1, 2), tateten(2, 3)]);
      const [column] = layoutOf(doc).columns;
      const tokens = tokensOf(column!);
      const separators = separatorsOf(column!);
      expect(separators).toHaveLength(2);
      expect(separators[0]!.y).toBeGreaterThan(tokens[0]!.y);
      expect(separators[0]!.y).toBeLessThan(tokens[1]!.y);
      expect(separators[1]!.y).toBeGreaterThan(tokens[1]!.y);
      expect(separators[1]!.y).toBeLessThan(tokens[2]!.y);
    });
  });

  describe('highlight t1-t3 and ruby t2-t4', () => {
    const doc = docOf(5, [highlight(1, 3, 'r1'), yomi(2, 4, 'あい'), refMark]);

    it('has two fragments, flagged as continuing at the joined ends', () => {
      const groups = treeOf(doc)
        .blocks[0]!.children.flatMap(function find(node): CanvasHighlightGroupNode[] {
          if (node.type === 'highlight-group') return [node];
          if (node.type === 'token' || node.type === 'tateten-separator') return [];
          return node.children.flatMap(find);
        })
        .map((g) => ({ before: g.continuesBefore === true, after: g.continuesAfter === true }));
      expect(groups).toEqual([
        { before: false, after: true },
        { before: true, after: false },
      ]);
    });

    it('puts the label on the last fragment only, and does not close the joined ends', () => {
      const [column] = layoutOf(doc).columns;
      const lines = column!.highlightLines!;
      expect(lines).toHaveLength(2);
      const [first, second] = [...lines].sort((a, b) => a.yStart - b.yStart);
      expect(first!.refLayout).toBeUndefined();
      expect(second!.refLayout?.text).toBe('L');
      // 続きの端は、隣の断片の始まりまで線がつながる
      expect(first!.yEnd).toBeGreaterThanOrEqual(second!.yStart);
    });
  });

  describe('highlight t1-t4, tateten t2-t5 and ruby t3-t6', () => {
    it('keeps the fragments of one highlight joined end to start', () => {
      const doc = docOf(6, [highlight(1, 4), tateten(2, 5), yomi(3, 6, 'あいうえ')]);
      const [column] = layoutOf(doc).columns;
      const lines = [...column!.highlightLines!].sort((a, b) => a.yStart - b.yStart);
      expect(lines.length).toBeGreaterThan(1);
      for (let i = 0; i + 1 < lines.length; i++) {
        expect(lines[i]!.yEnd).toBeGreaterThanOrEqual(lines[i + 1]!.yStart);
      }
    });
  });

  describe('highlights that share a character (lane)', () => {
    const lineXs = (doc: SKAMDocument) =>
      layoutOf(doc)
        .columns[0]!.highlightLines!.map((l) => l.x)
        .sort((a, b) => a - b);

    it('draws a nested highlight one lane pitch outside the outer one', () => {
      const [outer, inner] = lineXs(docOf(5, [highlight(1, 5), highlight(3, 5)]));
      expect(inner! - outer!).toBe(highlightLanePitch(2));
    });

    it('draws three highlights on lanes 0, 1 and 2, and the fragments of one highlight on one x', () => {
      const doc = docOf(6, [highlight(1, 4), highlight(2, 6), highlight(3, 5)]);
      const xs = [...new Set(lineXs(doc))];
      expect(xs).toHaveLength(3);
      expect(xs[1]! - xs[0]!).toBe(highlightLanePitch(2));
      expect(xs[2]! - xs[1]!).toBe(highlightLanePitch(2));
    });

    it('keeps lane 0 where it was: a document without overlap draws every line on one x', () => {
      const doc = docOf(6, [highlight(1, 2), highlight(4, 6)]);
      expect(new Set(lineXs(doc)).size).toBe(1);
      expect(treeOf(doc).maxHighlightLane).toBeUndefined();
    });

    it('widens the column by the lanes so the shifted line stays in the column', () => {
      const plain = layoutOf(docOf(5, [highlight(1, 5)]));
      const laned = layoutOf(docOf(5, [highlight(1, 5), highlight(3, 5)]));
      expect(laned.width - plain.width).toBe(highlightLanePitch(2));
    });
  });

  describe('readings that overlap (READING_OVERLAP)', () => {
    it('draws the first and the third reading only', () => {
      const texts = fillTextsOf(
        docOf(4, [yomi(1, 2, 'あい'), yomi(2, 3, 'かき'), yomi(3, 4, 'さし')])
      );
      for (const drawn of ['あ', 'い', 'さ', 'し']) expect(texts).toContain(drawn);
      for (const skipped of ['か', 'き']) expect(texts).not.toContain(skipped);
    });
  });

  describe('okurigana and annotations stay on their own character', () => {
    it('yomigana t1-t2 and okurigana t2-t3: the okurigana is on t3', () => {
      const doc = docOf(4, [
        yomi(1, 2, 'あい'),
        { type: 'okurigana', anchor: range(2, 3), value: 'ト' },
      ]);
      const [column] = layoutOf(doc).columns;
      const tokens = tokensOf(column!);
      expect(tokens.map((t) => t.slots.okuri?.text)).toEqual([
        undefined,
        undefined,
        'ト',
        undefined,
      ]);
    });

    it('kaeri and okimoji stay on their characters inside a ruby range', () => {
      const doc = docOf(4, [
        yomi(1, 2, 'あい'),
        { type: 'kaeri', value: '㆑', position: after(1) },
        { type: 'okimoji', anchor: range(2) },
      ]);
      const tokens = tokensInTree(treeOf(doc).blocks[0]!.children);
      expect(tokens[0]!.slots.kaeri).toBe('㆑');
      expect(tokens[1]!.slots.isOkimoji).toBe(true);
      expect(tokens[0]!.slots.isOkimoji).toBeUndefined();
    });
  });

  describe('hidden marks', () => {
    it('a hidden range reading hides the ruby of the first character only', () => {
      const doc = docOf(3, [yomi(1, 2, 'あい')]);
      const air = buildAnnotationIR(doc, RENDER_PROFILES.full);
      const group = air.blocks[0]!.children[0];
      if (group?.type !== 'ruby-group') throw new Error('expected a ruby group');
      group.yomigana.hidden = true;
      const tokens = tokensInTree(convertAIRToCanvasRenderTree(air).blocks[0]!.children);
      expect(tokens[0]!.hiddenSlots).toEqual(['ruby']);
      expect(tokens[1]!.hiddenSlots).toBeUndefined();
    });
  });

  describe('line breaks', () => {
    it('splits a highlight fragment group at a line break between two fragments', () => {
      const doc = docOf(5, [
        highlight(1, 3),
        yomi(2, 4, 'あい'),
        { type: 'linebreak', position: after(1) },
      ]);
      const { blocks } = treeOf(doc);
      expect(blocks).toHaveLength(2);
      expect(tokensInTree(blocks[0]!.children).map((t) => t.token.id)).toEqual(['t1']);
      expect(tokensInTree(blocks[1]!.children).map((t) => t.token.id)).toEqual([
        't2',
        't3',
        't4',
        't5',
      ]);
    });
  });

  describe('documents the validator does not accept', () => {
    const inputs: { name: string; doc: SKAMDocument }[] = [
      { name: 'reversed range', doc: docOf(4, [yomi(3, 1), tateten(4, 2), highlight(3, 1)]) },
      {
        name: 'range to a token that does not exist',
        doc: docOf(3, [
          { type: 'yomigana', anchor: { from: 't1', to: 'missing' }, value: 'あ' },
          { type: 'highlight', anchor: { from: 'missing', to: 't3' } },
          { type: 'tateten', anchor: { from: 't2', to: 'missing' } },
        ]),
      },
      {
        name: 'range across blocks',
        doc: {
          format: 'skam@0.1',
          tokens: [
            { id: 't1', text: '子' },
            { id: 't2', text: '曰' },
            { id: 't3', text: '學' },
          ],
          blocks: [
            { id: 'b1', tokenIds: ['t1', 't2'] },
            { id: 'b2', tokenIds: ['t3'] },
          ],
          marks: [yomi(2, 3), highlight(1, 3), tateten(2, 3)],
          readings: [],
        },
      },
      {
        name: 'many equal highlights',
        doc: docOf(
          3,
          Array.from({ length: 200 }, () => highlight(1, 3)),
          TEXTS
        ),
      },
    ];
    for (const { name, doc } of inputs) {
      it(`${name}: does not throw and draws each character once`, () => {
        const canvas = new RecordingCanvas();
        expect(() => render(doc, canvas)).not.toThrow();
        const expected = doc.tokens.map((t) => t.text).join('');
        expect([...baseFillTexts(doc)].sort()).toEqual([...expected].sort());
        expect(drawnChars(doc)).toBe(expected);
      });
    }
  });
});

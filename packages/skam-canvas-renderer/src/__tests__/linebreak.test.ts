import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';
import { buildAnnotationIR, RENDER_PROFILES } from '@kanbun-skam/skam/rendering';
import { convertAIRToCanvasRenderTree } from '../air-adapter.js';
import { layout } from '../layout.js';
import type { DocumentLayout, TokenLayout } from '../types.js';
import { RecordingContext } from './recording-context.js';

function layoutOf(doc: SKAMDocument, profile = RENDER_PROFILES.full): DocumentLayout {
  const tree = convertAIRToCanvasRenderTree(buildAnnotationIR(doc, profile));
  return layout(tree, new RecordingContext());
}

const br = (blockId: string, after: string): Mark => ({
  type: 'linebreak',
  position: { blockId, after },
});

/** 學而時習 (t1〜t4) を 1 ブロックに置く */
function singleBlockDoc(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '習' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
    marks,
    readings: [],
  };
}

/** 改行の無い 3 ブロック: 學 / 而 / 時習 */
function threeBlockDoc(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '習' },
    ],
    blocks: [
      { id: 'b1', tokenIds: ['t1'] },
      { id: 'b2', tokenIds: ['t2'] },
      { id: 'b3', tokenIds: ['t3', 't4'] },
    ],
    marks: [],
    readings: [],
  };
}

/** 2 つのブロック: 學而 (學の後に改行) / 時習 */
function twoBlockDocWithBreak(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '習' },
    ],
    blocks: [
      { id: 'b1', tokenIds: ['t1', 't2'] },
      { id: 'b2', tokenIds: ['t3', 't4'] },
    ],
    marks: [br('b1', 't1')],
    readings: [],
  };
}

function tokens(result: DocumentLayout): TokenLayout[] {
  return result.columns.flatMap((c) =>
    c.children.filter((child): child is TokenLayout => child.type === 'token')
  );
}

function positions(result: DocumentLayout): { id: string; x: number; y: number }[] {
  return tokens(result).map(({ tokenId, x, y }) => ({ id: tokenId, x, y }));
}

describe('canvas: linebreak', () => {
  it('學の後ろの linebreak は同じブロックの中で次の列に移る', () => {
    const result = layoutOf(singleBlockDoc([br('b1', 't1')]));
    const ids = result.columns.map((c) =>
      c.children.map((child) => (child as TokenLayout).tokenId)
    );
    expect(ids).toEqual([['t1'], ['t2', 't3', 't4']]);
  });

  it('列の順は右から左: 改行の前の字が右の列', () => {
    const result = layoutOf(singleBlockDoc([br('b1', 't1')]));
    const [first, second] = result.columns;
    expect(first!.x).toBeGreaterThan(second!.x);
  });

  it('2 つのブロックで、1 つ目の中に改行があると列が 3 つになり、改行の無い 3 ブロックと同じ座標と幅になる', () => {
    const withBreak = layoutOf(twoBlockDocWithBreak());
    const threeBlocks = layoutOf(threeBlockDoc());
    expect(withBreak.columns).toHaveLength(3);
    expect(positions(withBreak)).toEqual(positions(threeBlocks));
    expect(withBreak.width).toBe(threeBlocks.width);
    expect(withBreak.height).toBe(threeBlocks.height);
  });

  it('改行の無い文書は、列も座標も今と同じ', () => {
    const plain = layoutOf(singleBlockDoc([]));
    const hiddenBreak = layoutOf(singleBlockDoc([br('b1', 't1')]), {
      ...RENDER_PROFILES.full,
      linebreak: false,
    });
    expect(plain.columns).toHaveLength(1);
    expect(hiddenBreak).toEqual(plain);
  });

  it('highlight の範囲 (學〜時) が改行をまたぐと、傍線の命令が 2 列に分かれる', () => {
    const doc = singleBlockDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
      br('b1', 't1'),
    ]);
    const result = layoutOf(doc);
    const lines = result.columns.map((c) => c.highlightLines ?? []);
    expect(lines.map((l) => l.length)).toEqual([1, 1]);
    const t = (id: string) => tokens(result).find((token) => token.tokenId === id)!;
    const first = lines[0]![0]!;
    const second = lines[1]![0]!;
    // 1 列目は學だけ、2 列目は而と時を覆う
    expect(result.columns[0]!.children).toHaveLength(1);
    expect(first.yStart).toBeLessThanOrEqual(t('t1').y);
    expect(second.yStart).toBeLessThanOrEqual(t('t2').y);
    expect(second.yEnd).toBeGreaterThanOrEqual(t('t3').y);
    expect(second.yEnd - second.yStart).toBe(2 * (first.yEnd - first.yStart));
  });

  it('highlight の最後の字の後ろの linebreak は、highlight を分けずに group の後ろで次の列に移る', () => {
    const doc = singleBlockDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      br('b1', 't2'),
    ]);
    const result = layoutOf(doc);
    expect(result.columns.map((c) => (c.highlightLines ?? []).length)).toEqual([1, 0]);
    expect(result.columns[0]!.children).toHaveLength(2);
    expect(result.columns[1]!.children).toHaveLength(2);
  });

  it('竪点のグループの最後の字の後ろの linebreak は、グループの後ろで次の列に移る', () => {
    const doc = singleBlockDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      br('b1', 't2'),
    ]);
    const result = layoutOf(doc);
    expect(result.columns).toHaveLength(2);
    // 竪点の区切りは先頭の列に残る
    expect(result.columns[0]!.children.map((c) => c.type)).toEqual([
      'token',
      'tateten-separator',
      'token',
    ]);
  });

  it('読みの範囲 (學而) の後ろの linebreak は、範囲の最後の字の後ろで次の列に移る', () => {
    const doc = singleBlockDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'がくじ' },
      br('b1', 't2'),
    ]);
    const result = layoutOf(doc);
    expect(result.columns).toHaveLength(2);
    expect(result.columns[0]!.children.map((c) => (c as TokenLayout).tokenId)).toEqual([
      't1',
      't2',
    ]);
  });
});

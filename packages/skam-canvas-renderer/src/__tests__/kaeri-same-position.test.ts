import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun-skam/skam';
import { render } from '../index.js';
import { RecordingCanvas } from './recording-context.js';

// 同じ位置の複数の kaeri は、marks[] の順につないだ 1 つの注記と同じに描く。

const at = (after: string) => ({ blockId: 'b1', after });
const kaeri = (after: string, value: string): Mark => ({
  type: 'kaeri',
  position: at(after),
  value,
});
const tateten: Mark = { type: 'tateten', anchor: { from: 't1', to: 't2' } };

function docOf(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '國' },
      { id: 't2', text: '家' },
      { id: 't3', text: '不' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks,
    readings: [],
  };
}

function drawCalls(marks: Mark[]) {
  const canvas = new RecordingCanvas();
  render(docOf(marks), canvas);
  return canvas.getContext('2d').calls;
}

describe('canvas: kaeri marks at the same position', () => {
  it.each([
    ['outside tateten', [kaeri('t3', '㆒'), kaeri('t3', '㆑')], [kaeri('t3', '㆒㆑')]],
    [
      'inside tateten (last token)',
      [tateten, kaeri('t2', '㆒'), kaeri('t2', '㆑')],
      [tateten, kaeri('t2', '㆒㆑')],
    ],
    [
      'inside tateten (first token)',
      [tateten, kaeri('t1', '㆒'), kaeri('t1', '㆑')],
      [tateten, kaeri('t1', '㆒㆑')],
    ],
    [
      'three marks',
      [kaeri('t3', '㆒'), kaeri('t3', '㆑'), kaeri('t3', '㆑')],
      [kaeri('t3', '㆒㆑㆑')],
    ],
    [
      'two re inside tateten',
      [tateten, kaeri('t2', '㆑'), kaeri('t2', '㆑')],
      [tateten, kaeri('t2', '㆑㆑')],
    ],
  ])('%s: draws like the joined mark', (_name, separate, joined) => {
    expect(drawCalls(separate as Mark[])).toEqual(drawCalls(joined as Mark[]));
  });

  it('keeps the re inside a tateten group', () => {
    const texts = drawCalls([tateten, kaeri('t2', '㆒'), kaeri('t2', '㆑')])
      .filter((c) => c.method === 'fillText')
      .map((c) => c.args[0]);
    expect(texts).toContain('㆑');
  });
});

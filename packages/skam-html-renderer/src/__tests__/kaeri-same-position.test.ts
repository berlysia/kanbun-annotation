import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun-skam/skam';
import { splitMultiCharacterKaeri } from '@kanbun-skam/skam';
import { render } from '../index.js';

// 同じ位置の複数の kaeri は、marks[] の順につないだ 1 つの注記と同じに描く。

const tokens = [
  { id: 't1', text: '國' },
  { id: 't2', text: '家' },
  { id: 't3', text: '不' },
];

function docOf(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens,
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks,
    readings: [],
  };
}

const at = (after: string) => ({ blockId: 'b1', after });
const kaeri = (after: string, value: string): Mark => ({
  type: 'kaeri',
  position: at(after),
  value,
});
const tateten: Mark = { type: 'tateten', anchor: { from: 't1', to: 't2' } };

function renderBoth(separate: Mark[], joined: Mark[]) {
  const options = [{}, { readingLayerSource: 'display' as const }];
  return options.map((o) => ({
    separate: render(docOf(separate), o),
    joined: render(docOf(joined), o),
  }));
}

describe('html: kaeri marks at the same position', () => {
  it('without tateten: 2 marks render like the joined mark', () => {
    for (const { separate, joined } of renderBoth(
      [kaeri('t3', '㆒'), kaeri('t3', '㆑')],
      [kaeri('t3', '㆒㆑')]
    )) {
      expect(separate.html).toBe(joined.html);
      expect(separate.css).toBe(joined.css);
    }
  });

  it('inside a tateten group (after the last token): same as joined', () => {
    for (const { separate, joined } of renderBoth(
      [tateten, kaeri('t2', '㆒'), kaeri('t2', '㆑')],
      [tateten, kaeri('t2', '㆒㆑')]
    )) {
      expect(separate.html).toBe(joined.html);
    }
  });

  it('inside a tateten group (after the first token): same as joined', () => {
    for (const { separate, joined } of renderBoth(
      [tateten, kaeri('t1', '㆒'), kaeri('t1', '㆑')],
      [tateten, kaeri('t1', '㆒㆑')]
    )) {
      expect(separate.html).toBe(joined.html);
    }
  });

  it('3 marks render like the joined mark', () => {
    for (const { separate, joined } of renderBoth(
      [kaeri('t3', '㆒'), kaeri('t3', '㆑'), kaeri('t3', '㆑')],
      [kaeri('t3', '㆒㆑㆑')]
    )) {
      expect(separate.html).toBe(joined.html);
    }
  });

  it('two re marks inside tateten render a single re like the joined mark', () => {
    for (const { separate, joined } of renderBoth(
      [tateten, kaeri('t2', '㆑'), kaeri('t2', '㆑')],
      [tateten, kaeri('t2', '㆑㆑')]
    )) {
      expect(separate.html).toBe(joined.html);
    }
  });

  it('the order of marks matters', () => {
    const a = render(docOf([kaeri('t3', '㆒'), kaeri('t3', '㆑')])).html;
    const b = render(docOf([kaeri('t3', '㆑'), kaeri('t3', '㆒')])).html;
    expect(a).not.toBe(b);
  });

  it('splitMultiCharacterKaeri keeps the output', () => {
    const before = docOf([tateten, kaeri('t2', '㆓'), kaeri('t2', '㆒㆑')]);
    const after = splitMultiCharacterKaeri(before);
    expect(render(after).html).toBe(render(before).html);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { stringify, SKAMXMLStringifyError, type StringifyLoss } from '../index.js';
import type { SKAMDocument } from '@kanbun-skam/skam';

const doc = (over: Partial<SKAMDocument> = {}): SKAMDocument => ({
  format: 'skam@0.1',
  readings: [],
  tokens: [
    { id: 't1', text: '甲' },
    { id: 't2', text: '乙' },
    { id: 't3', text: '丙' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
  marks: [],
  ...over,
});
const partial = doc({
  marks: [
    { id: 'e1', type: 'emphasis', anchor: { from: 't1', to: 't2' } },
    { id: 'h1', type: 'highlight', anchor: { from: 't2', to: 't3' } },
  ],
});
const lossesOf = (d: SKAMDocument) => {
  try {
    stringify(d);
    return [];
  } catch (e) {
    return [...(e as SKAMXMLStringifyError).losses];
  }
};

describe('stringify loss contract (K1)', () => {
  it('throws SKAMXMLStringifyError with all losses by default', () => {
    expect(lossesOf(partial)).toEqual([
      expect.objectContaining({
        category: 'unsupported',
        code: 'PARTIAL_OVERLAP',
        path: '/marks/1',
        markId: 'h1',
      }),
    ]);
  });
  it('lossy:true returns XML and calls onLoss in order', () => {
    const seen: StringifyLoss[] = [];
    const xml = stringify(partial, { lossy: true, onLoss: (l) => seen.push(l) });
    expect(xml).toContain('<skam:span type="emphasis">');
    expect(seen.map((l) => l.code)).toEqual(['PARTIAL_OVERLAP']);
  });
  it('does not call onLoss when lossy is false', () => {
    const seen: StringifyLoss[] = [];
    expect(() => stringify(partial, { onLoss: (l) => seen.push(l) })).toThrow(
      SKAMXMLStringifyError
    );
    expect(seen).toEqual([]);
  });
  it('propagates exceptions from onLoss and returns no XML', () => {
    expect(() =>
      stringify(partial, {
        lossy: true,
        onLoss: () => {
          throw new Error('stop');
        },
      })
    ).toThrow('stop');
  });
  it('orders document-level losses first, then by block, token, mark index', () => {
    const d = doc({
      ext: { a: 1 },
      derivations: [{ kind: 'readingOrder', method: 'kaeriten-stack', order: ['t1'] }] as never,
      tokens: [
        { id: 't1', text: '甲' },
        { id: 't2', text: '乙', ext: { b: 1 } },
        { id: 't3', text: '丙' },
      ],
      marks: [
        { id: 'h1', type: 'highlight', anchor: { from: 't2', to: 't3' } },
        { id: 'e1', type: 'emphasis', anchor: { from: 't1', to: 't2' } },
      ],
    });
    // collectRangeMarks は開始位置の昇順に並べるので、e1 (t1–t2) が残り、h1 (marks[0], t2–t3) が部分交差で落ちる。
    // h1 の鍵は {0,1,0,0}、tokens/1/ext の鍵は {0,1,-1,0} なので、token の ext が先に来る。
    expect(lossesOf(d).map((l) => l.path)).toEqual([
      '/ext',
      '/derivations',
      '/tokens/1/ext',
      '/marks/0',
    ]);
  });
  it('is deterministic across calls', () => {
    expect(lossesOf(partial)).toEqual(lossesOf(partial));
  });
  it('no longer calls console.warn', () => {
    const spy = vi.spyOn(console, 'warn');
    stringify(partial, { lossy: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

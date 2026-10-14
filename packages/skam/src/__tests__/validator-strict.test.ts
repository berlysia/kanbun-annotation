import { describe, it, expect } from 'vitest';
import { BLOCK_START_KAERI_HINT, validateSKAMDocument, isValidEmphasisStyle } from '../index.js';
import type { ValidationErrorKind } from '../index.js';

describe('BLOCK_START_KAERI kind and hint (K3)', () => {
  it('exports hint text mentioning the workaround', () => {
    expect(BLOCK_START_KAERI_HINT).toContain('前のブロックの最後の字の後');
  });
  it('kind union accepts BLOCK_START_KAERI (checked by typecheck)', () => {
    const k: ValidationErrorKind = 'BLOCK_START_KAERI';
    expect(k).toBe('BLOCK_START_KAERI');
  });
});

const base = () => ({
  format: 'skam@0.1', readings: [],
  tokens: [{ id: 't1', text: '甲' }, { id: 't2', text: '乙' }],
  blocks: [{ id: 'b1', tokenIds: ['t1'] }, { id: 'b2', tokenIds: ['t2'] }],
  marks: [] as unknown[],
});
const errs = (doc: unknown) => { const r = validateSKAMDocument(doc); return r.valid ? [] : r.errors.map((e) => `${e.kind}@${e.path}`); };

describe('validator strictness (K3)', () => {
  it('rejects empty token text', () => { const d = base(); d.tokens[0]!.text = ''; expect(errs(d)).toContain('INVALID_VALUE@tokens[0].text'); });
  it('accepts ASCII-space and U+3000 token text', () => { const d = base(); d.tokens[0]!.text = ' '; d.tokens[1]!.text = '\u3000'; expect(errs(d)).toEqual([]); });
  it('rejects empty saidoku.forms', () => {
    const d = base(); d.marks = [{ type: 'saidoku', anchor: { from: 't1', to: 't1' }, forms: [] }];
    expect(errs(d)).toContain('INVALID_VALUE@marks[0].forms');
  });
  it('rejects ID shared between token and mark (path = later occurrence)', () => {
    const d = base(); d.marks = [{ id: 't1', type: 'okimoji', anchor: { from: 't2', to: 't2' } }];
    expect(errs(d)).toContain('DUPLICATE_ID@marks[0].id');
  });
  it('rejects ID shared between block and token (blocks are counted first)', () => {
    const d = base(); d.blocks[1]!.id = 't1';
    expect(errs(d)).toContain('DUPLICATE_ID@tokens[0].id');
  });
  it('rejects block-start kaeri with BLOCK_START_KAERI kind', () => {
    const d = base(); d.marks = [{ type: 'kaeri', value: '㆑', position: { blockId: 'b2' } }];
    expect(errs(d)).toEqual(['BLOCK_START_KAERI@marks[0].position']);
  });
  it('still accepts block-start kutoten and ref', () => {
    const d = base(); d.marks = [
      { type: 'kutoten', value: '。', kind: 'ku', position: { blockId: 'b2' } },
      { id: 'r1', type: 'ref', format: 'numeric-bracket', position: { blockId: 'b2' } },
    ];
    expect(errs(d)).toEqual([]);
  });
  it('rejects non-string mark id, non-object ext, non-string placementHint, non-number saidoku n', () => {
    const d = base(); d.marks = [
      { id: 1, type: 'okimoji', anchor: { from: 't1', to: 't1' } },
      { type: 'okimoji', anchor: { from: 't2', to: 't2' }, ext: 'x' },
      { type: 'joji', anchor: { from: 't1', to: 't1' }, placementHint: 3 },
      { type: 'saidoku', anchor: { from: 't2', to: 't2' }, forms: [{ n: '1' }] },
    ];
    expect(errs(d)).toEqual(expect.arrayContaining(['INVALID_TYPE@marks[0].id', 'INVALID_TYPE@marks[1].ext', 'INVALID_TYPE@marks[2].placementHint', 'INVALID_TYPE@marks[3].forms[0].n']));
  });
  it('rejects okototen outside the grid', () => {
    const d = base(); d.marks = [{ type: 'okototen', anchor: { from: 't1', to: 't1' }, shape: 'dot', position: { system: 'glyph-grid', grid: '5x5', x: 5, y: 0 } }];
    expect(errs(d)).toContain('INVALID_VALUE@marks[0].position.x');
  });
  it('isValidEmphasisStyle', () => {
    for (const ok of ['dot', 'filled sesame', 'open double-circle', '★', '※', '◆']) expect(isValidEmphasisStyle(ok)).toBe(true);
    for (const ng of ['', 'filled', 'dot;color:red', '★★', ' ', 'filled  dot', '\u202e', '\u200b', '\\', '"', ';', '\u0301', '\u0001'])
      expect(isValidEmphasisStyle(ng)).toBe(false);
  });
  it('rejects invalid emphasis style in a document', () => {
    const d = base(); d.marks = [{ type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'dot;background:url(x)' }];
    expect(errs(d)).toContain('INVALID_VALUE@marks[0].style');
  });
});

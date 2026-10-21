import { describe, it, expect } from 'vitest';
import { KAERI_MULTI_CHARACTER } from '@kanbun-skam/skam';
import { parse, type ParseWarning } from '../index.js';

// 複数の字の kaeri (kind="ichi-re") は 0.3 では読めるが非推奨で、0.4.0 で誤りになる。
// この互換のふるまいを確かめるテスト

const wrap = (inner: string) =>
  `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>${inner}</skam:block></skam:body></skam:doc>`;

const collect = (xml: string, options: { validate?: boolean } = {}) => {
  const warnings: ParseWarning[] = [];
  const doc = parse(xml, { ...options, onWarning: (w) => warnings.push(w), trackPositions: true });
  return { doc, warnings };
};

describe('kaeri with a hyphen-joined kind (deprecated compatibility)', () => {
  const xml = wrap('甲<skam:kaeri kind="ichi-re"/>乙');

  it('reads one mark with several characters and warns once', () => {
    const { doc, warnings } = collect(xml);
    const kaeri = doc.marks.filter((m) => m.type === 'kaeri');
    expect(kaeri).toHaveLength(1);
    expect(kaeri[0]).toMatchObject({ value: '㆒㆑' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: 'KAERI_MULTI_CHARACTER',
      name: 'skam:kaeri',
      line: 1,
    });
    expect(warnings[0]!.column).toBeGreaterThan(0);
    expect(warnings[0]!.message).toContain('0.4.0');
  });

  it('uses the code exported from skam', () => {
    const { warnings } = collect(xml);
    expect(warnings[0]!.code).toBe(KAERI_MULTI_CHARACTER);
  });

  it('warns also with validate: false', () => {
    const { warnings } = collect(xml, { validate: false });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toBe(KAERI_MULTI_CHARACTER);
  });

  it('calls onWarning once with validate: true (validator warnings are not forwarded)', () => {
    const { warnings } = collect(xml, { validate: true });
    expect(warnings).toHaveLength(1);
  });
});

describe('kaeri written one character per mark', () => {
  it('reads two marks at the same position without warning', () => {
    const { doc, warnings } = collect(wrap('甲<skam:kaeri kind="ichi"/><skam:kaeri kind="re"/>乙'));
    expect(doc.marks.filter((m) => m.type === 'kaeri').map((m) => (m as { value: string }).value)).toEqual([
      '㆒',
      '㆑',
    ]);
    expect(warnings).toEqual([]);
  });
});

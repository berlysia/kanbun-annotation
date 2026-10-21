import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark, KaeriMark } from '../../index.js';
import { splitMultiCharacterKaeri } from '../../kaeri-migration.js';
import { buildAnnotationIR } from '../build-annotation-ir.js';
import { describeAnnotationIR, formatAccessibleText } from '../accessible-text.js';
import { joinKaeriValues } from '../kaeri.js';
import { RENDER_PROFILES } from '../render-profile.js';

// 同じ位置の複数の kaeri は、marks[] の順につないだ 1 つの注記と同じに扱う。

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

const profile = RENDER_PROFILES['full'] ?? Object.values(RENDER_PROFILES)[0]!;

function describeBoth(doc: SKAMDocument) {
  const air = buildAnnotationIR(doc, profile);
  return {
    air,
    blocks: describeAnnotationIR(air),
    text: formatAccessibleText(describeAnnotationIR(air)),
  };
}

describe('joinKaeriValues', () => {
  it('joins values in marks[] order and skips non-string values', () => {
    const marks = [
      { type: 'kaeri', position: at('t1'), value: '㆒' },
      { type: 'kaeri', position: at('t1'), value: 1 as unknown as string },
      { type: 'kaeri', position: at('t1'), value: '㆑' },
    ] as KaeriMark[];
    expect(joinKaeriValues(marks)).toBe('㆒㆑');
    expect(joinKaeriValues([])).toBe('');
  });
});

describe('kaeri marks at the same position (AIR and accessible text)', () => {
  const cases: [string, Mark[], Mark[]][] = [
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
  ];

  it.each(cases)(
    '%s: same AIR, structure and text as the joined mark',
    (_name, separate, joined) => {
      const a = describeBoth(docOf(separate));
      const b = describeBoth(docOf(joined));
      expect(a.air).toEqual(b.air);
      expect(a.blocks).toEqual(b.blocks);
      expect(a.text).toBe(b.text);
    }
  );

  it('does not drop the re inside a tateten group (一 goes to the separator, レ to the token)', () => {
    const { text } = describeBoth(docOf([tateten, kaeri('t2', '㆒'), kaeri('t2', '㆑')]));
    expect(text).toContain('竪点、一点');
    expect(text).toContain('レ点');
  });

  it('keeps the order of marks', () => {
    const a = describeBoth(docOf([kaeri('t3', '㆒'), kaeri('t3', '㆑')])).text;
    const b = describeBoth(docOf([kaeri('t3', '㆑'), kaeri('t3', '㆒')])).text;
    expect(a).not.toBe(b);
  });

  it('splitMultiCharacterKaeri keeps the AIR', () => {
    const before = docOf([tateten, kaeri('t2', '㆓'), kaeri('t2', '㆒㆑')]);
    const after = splitMultiCharacterKaeri(before);
    expect(describeBoth(after).air).toEqual(describeBoth(before).air);
  });
});

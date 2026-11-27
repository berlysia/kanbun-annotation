import { expect, it } from 'vitest';
import { document, featureNames } from './fixtures.js';
import type { FeatureName } from '../options.js';

const inputs: Record<FeatureName, string> = {
  kaeri: '學＜レ＞',
  okurigana: '學び',
  yomigana: '學（まな）',
  kutoten: '學。',
  linebreak: '學\n而',
  saidoku: '未｛ず｝',
  soegana: '之＋を',
  tateten: '所ー以',
};
it.each(Array.from({ length: 256 }, (_, mask) => mask))(
  'preserves enabled features for subset %i',
  (mask) => {
    const features = Object.fromEntries(
      featureNames.map((name, bit) => [name, !!(mask & (1 << bit))])
    );
    for (const name of featureNames) {
      if (features[name])
        expect(document(inputs[name], { features })).toEqual(document(inputs[name]));
    }
  }
);
it.each([
  ['kaeri', '學＜レ＞', ['學', '＜', '＞']],
  ['yomigana', '學（まな）', ['學', '（', '）']],
  ['saidoku', '未｛ず｝', ['未', '｛', '｝']],
  ['kutoten', '學。', ['學', '。']],
  ['tateten', '所ー以', ['所', 'ー', '以']],
  ['okurigana', '學び', ['學', 'び']],
  ['soegana', '之＋を', ['之', '＋']],
  ['linebreak', '學\n而', ['學', '而']],
] satisfies [FeatureName, string, string[]][])(
  'treats disabled %s as text',
  (name, source, tokens) => {
    const doc = document(source, { features: { [name]: false } });
    expect(doc.tokens.map((token) => token.text)).toEqual(tokens);
    expect(doc.marks.filter((mark) => mark.type === name)).toEqual([]);
    const expectedOkuri: Partial<Record<FeatureName, string>> = {
      kaeri: 'レ',
      yomigana: 'まな',
      saidoku: 'ず',
      soegana: 'を',
    };
    if (expectedOkuri[name])
      expect(
        doc.marks.filter((mark) => mark.type === 'okurigana').map((mark) => mark.value)
      ).toEqual([expectedOkuri[name]]);
  }
);
it('uses reassigned disabled symbols for their active owner', () => {
  const doc = document('甲＋レ》', {
    features: { soegana: false },
    symbols: { kaeri: [{ open: '＋', close: '》' }] },
  });
  expect(doc.marks).toEqual([
    { id: 'm#1', type: 'kaeri', position: { blockId: 'b#1', after: 'b#1#1' }, value: '㆑' },
  ]);
});
it('treats disabled newlines as whitespace within kana runs', () => {
  expect(document('學び\nて', { features: { linebreak: false } })).toEqual(document('學びて'));
  expect(document('學\n\n而', { features: { linebreak: false } }).blocks).toHaveLength(2);
});

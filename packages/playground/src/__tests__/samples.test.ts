import { describe, it, expect } from 'vitest';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { SAMPLES } from '../samples';

describe('SAMPLES', () => {
  it.each(SAMPLES)('$name をパースできる', ({ xml }) => {
    expect(() => parse(xml)).not.toThrow();
    const doc = parse(xml);
    expect(doc).toBeDefined();
    expect(doc.tokens.length).toBeGreaterThan(0);
  });

  it('keeps the first 18 samples in their order, then the KanbunKundoku samples, then the line-break sample', () => {
    expect(SAMPLES.slice(0, 18).map((sample) => sample.name)).toEqual([
      '學而時習之（基本）',
      '論語（複数ブロック）',
      '再読文字（將死）',
      '返り点（一二点・上下点）',
      '複合返り点（一レ点）',
      'たて点（熟語）',
      '添え仮名（を）',
      'ヲコト点',
      '傍点（強調）',
      '注釈',
      '傍線（試験問題形式）',
      '傍線（スタイル一覧）',
      '傍線＋ラベル（全スタイル）',
      'ラベル（フォーマット一覧）',
      '天無口（使役・レ点と一二点）',
      '春曉（五言絶句）',
      '傍点＋傍線（配置順確認）',
      '全要素総合（ヲコト点除く）',
    ]);
    expect(SAMPLES.slice(18, 22).map((sample) => sample.name)).toEqual([
      'KanbunKundoku: 拝而受之。',
      'KanbunKundoku: 夜半鐘声到客船',
      'KanbunKundoku: 孝者所以事君也。',
      'KanbunKundoku: 欲為聖明除弊事',
    ]);
    expect(SAMPLES.slice(22).map((sample) => sample.name)).toEqual([
      '改行（句の途中で行を改める）',
    ]);
  });

  it('does not put <, >, & or " in a name or a description', () => {
    for (const sample of SAMPLES) {
      expect(sample.name, sample.name).not.toMatch(/[<>&"]/);
      expect(sample.description, sample.name).not.toMatch(/[<>&"]/);
    }
  });

  it('cites the source in every KanbunKundoku sample', () => {
    for (const sample of SAMPLES.slice(18, 22)) {
      expect(sample.description).toContain('github.com/shiryusann/KanbunKundoku');
      expect(sample.description).toContain('MIT');
      expect(sample.description).toContain('Web漢文大系');
    }
  });
});

/**
 * KanbunKundoku の見本の注記の数。値は、データ (annotated/test.json の annotated と、変換済みの
 * annotated_two_types/test.json) の字ごとの欄 [okurigana, particle, left, right] を読んで数えた。
 * 数え方: 返り点は left (一レ は 2 つ、末尾の - は竪点で返り点ではない)。送り仮名は、okurigana が空でなければ
 * それ (right がそれで始まる)。okurigana が空なら、助詞 (particle) で right がある字の right は添え仮名。
 * right が okurigana より長ければ、残りは添え仮名。D (その字を仮名で読む) の字には何も付かない。
 */
describe('KanbunKundoku samples', () => {
  function count(index: number): Record<string, number> {
    const doc = parse(SAMPLES[index]!.xml);
    const counts: Record<string, number> = {};
    for (const mark of doc.marks) counts[mark.type] = (counts[mark.type] ?? 0) + 1;
    return counts;
  }

  it('拝而受之。(文 278)', () => {
    // 拝: okurigana し、right して → 送り仮名 シ、添え仮名 テ (B で而から移った助詞)
    // 而: particle DBて、right 空 → なし
    // 受: okurigana く、left レ、right く → 返り点 レ、送り仮名 ク
    // 之: particle を、right を → 添え仮名 ヲ
    // 。: 句点
    expect(count(18)).toEqual({ kaeri: 1, okurigana: 2, soegana: 2, kutoten: 1 });
  });

  it('夜半鐘声到客船 (文 103)', () => {
    // 夜、鐘、声、客: 何も付かない
    // 半: particle の、right の → 添え仮名 ノ
    // 到: okurigana る、left 二、right る → 返り点 二、送り仮名 ル
    // 船: particle に、left 一、right に → 返り点 一、添え仮名 ニ
    expect(count(19)).toEqual({ kaeri: 2, okurigana: 1, soegana: 2 });
  });

  it('孝者所以事君也。(文 190)', () => {
    // 孝: okurigana 空、particle 空、right は → 添え仮名 ハ (者の DBは が B で孝へ移った)
    // 者: particle DBは、right 空 → なし
    // 所: left 二- → 返り点 二、竪点 (所〜以)
    // 以: なし
    // 事: okurigana うる、left 一レ、right うる → 返り点 一 と レ、送り仮名 ウル
    // 君: particle に、right に → 添え仮名 ニ
    // 也: particle Dなり、right 空 → なし
    // 。: 句点
    expect(count(20)).toEqual({
      kaeri: 3,
      tateten: 1,
      okurigana: 1,
      soegana: 2,
      kutoten: 1,
    });
    // 二 (所)、一 と レ (事。この順)
    expect(
      parse(SAMPLES[20]!.xml)
        .marks.filter((mark) => mark.type === 'kaeri')
        .map((mark) => mark.value)
    ).toEqual(['\u3193', '\u3192', '\u3191']);
  });

  it('欲為聖明除弊事 (文 890)', () => {
    // 欲: okurigana す、left 三、right す → 返り点 三、送り仮名 ス
    // 為: particle に、left 下、right に → 返り点 下、添え仮名 ニ
    // 聖、弊: なし
    // 明: particle の、left 上、right の → 返り点 上、添え仮名 ノ
    // 除: okurigana か、left 二、right かんと → 返り点 二、送り仮名 カ、添え仮名 ント
    // 事: particle を、left 一、right を → 返り点 一、添え仮名 ヲ
    expect(count(21)).toEqual({ kaeri: 5, okurigana: 2, soegana: 4 });
  });
});

import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun/skam';
import { render, PROFILES } from '../index.js';

// ============================================================================
// Shared helpers
// ============================================================================

function createSingleTokenDoc(text: string, marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [{ id: 't1', text }],
    blocks: [{ id: 'b1', tokenIds: ['t1'] }],
    marks,
    readings: [],
  };
}

function createThreeTokenDoc(
  text1: string,
  text2: string,
  text3: string,
  marks: Mark[] = []
): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: text1 },
      { id: 't2', text: text2 },
      { id: 't3', text: text3 },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks,
    readings: [],
  };
}

function createTwoTokenDoc(text1: string, text2: string, marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: text1 },
      { id: 't2', text: text2 },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
    marks,
    readings: [],
  };
}

function createFiveTokenDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '夜' },
      { id: 't2', text: '來' },
      { id: 't3', text: '風' },
      { id: 't4', text: '雨' },
      { id: 't5', text: '聲' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks,
    readings: [],
  };
}

function createSixTokenDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '春' },
      { id: 't2', text: '眠' },
      { id: 't3', text: '不' },
      { id: 't4', text: '覺' },
      { id: 't5', text: '曉' },
      { id: 't6', text: '處' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5', 't6'] }],
    marks,
    readings: [],
  };
}

function createMultiBlockDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '天' },
      { id: 't2', text: '地' },
      { id: 't3', text: '人' },
      { id: 't4', text: '仁' },
      { id: 't5', text: '義' },
      { id: 't6', text: '禮' },
    ],
    blocks: [
      { id: 'b1', tokenIds: ['t1', 't2', 't3'] },
      { id: 'b2', tokenIds: ['t4', 't5', 't6'] },
    ],
    marks,
    readings: [],
  };
}

// ============================================================================
// 1. Three-element compound: range kana + tateten + emphasis
// ============================================================================

describe('Three-element compound: range kana + tateten + emphasis', () => {
  it('yomigana + tateten + emphasis: emphasis wraps ruby', () => {
    const doc = createThreeTokenDoc('天', '地', '人', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'てんちじん' },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'emphasis', anchor: { from: 't1', to: 't3' }, style: 'filled dot' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('てんちじん');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('text-emphasis-style');
    // emphasis が ruby の外側にラップされていること
    expect(html).toMatch(/skam-emphasis.*<ruby>/s);
    // 個別トークンに emphasis class がないこと（グループレベルで適用）
    expect(html).not.toMatch(/skam-token skam-emphasis/);
  });

  it('okurigana + tateten + emphasis: emphasis on individual tokens (no ruby)', () => {
    const doc = createThreeTokenDoc('不', '能', '爲', [
      { type: 'okurigana', anchor: { from: 't1', to: 't3' }, value: 'ハズ' },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'emphasis', anchor: { from: 't1', to: 't3' }, style: 'filled dot' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('ハズ');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('text-emphasis-style');
  });

  it('soegana + tateten + emphasis: emphasis on individual tokens (no ruby)', () => {
    const doc = createThreeTokenDoc('天', '地', '人', [
      { type: 'soegana', anchor: { from: 't1', to: 't3' }, value: 'を' },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'emphasis', anchor: { from: 't1', to: 't3' }, style: 'filled dot' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('を');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('text-emphasis-style');
  });
});

// ============================================================================
// 2. Highlight + ref compound
// ============================================================================

describe('Highlight + ref compound', () => {
  it('range yomigana + highlight with ref', () => {
    const doc = createThreeTokenDoc('重', '要', '語', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'じゅうようご' },
      {
        type: 'highlight',
        id: 'hl1',
        anchor: { from: 't1', to: 't3' },
        style: 'solid',
        ref: 'ref1',
      },
      {
        type: 'ref',
        id: 'ref1',
        position: { blockId: 'b1', after: 't3' },
        format: 'alpha-upper',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('じゅうようご');
    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-ref');
    expect(html).toContain('(A)');
  });
});

// ============================================================================
// 3. Range kana + position-based marks (kutoten/okimoji/joji)
// ============================================================================

describe('Range kana + position-based marks (kutoten/okimoji/joji)', () => {
  it('range okurigana + tateten + adjacent kutoten', () => {
    const doc = createThreeTokenDoc('不', '能', '爲', [
      { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'ズ' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kutoten', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('ズ');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('skam-suffix-kutoten');
  });

  it('range yomigana + okimoji on middle token + tateten', () => {
    const doc = createThreeTokenDoc('於', '是', '乎', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'ここに' },
      { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
    ]);
    const { html } = render(doc);
    expect(html).toContain('ここに');
    expect(html).toContain('skam-okimoji');
    expect(html).toContain('skam-tateten');
  });

  it('range yomigana + joji on middle token + highlight', () => {
    const doc = createThreeTokenDoc('不', '之', '得', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'えざる' },
      { type: 'joji', anchor: { from: 't2', to: 't2' } },
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('えざる');
    expect(html).toContain('skam-joji');
    expect(html).toContain('skam-highlight');
  });
});

// ============================================================================
// 4. Cross-block and mode-specific compounds
// ============================================================================

describe('Cross-block and mode-specific compounds', () => {
  it('multi-block: independent marks per block', () => {
    const doc = createMultiBlockDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
      { type: 'tateten', anchor: { from: 't4', to: 't6' } },
      { type: 'yomigana', anchor: { from: 't4', to: 't6' }, value: 'じんぎれい' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('じんぎれい');
    // highlight should only be on block 1 tokens
    expect(html).toContain('天');
    expect(html).toContain('地');
    expect(html).toContain('人');
  });

  it('learningBasic profile interaction', () => {
    const doc = createThreeTokenDoc('天', '地', '人', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'てんちじん' },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
    ]);
    const { html } = render(doc, { profile: PROFILES.learningBasic });
    // learningBasic: yomigana=false, tateten=false, highlight=true
    expect(html).not.toContain('てんちじん');
    expect(html).not.toContain('skam-tateten');
    expect(html).toContain('skam-highlight');
  });

  it('interactive mode with compound marks', () => {
    const doc = createThreeTokenDoc('天', '地', '人', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'てんちじん' },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
    ]);
    const { html } = render(doc, { interactive: true });
    expect(html).toContain('てんちじん');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('skam-highlight');
    expect(html).toContain('data-token-from="t1"');
    expect(html).toContain('data-token-to="t3"');
  });
});

// ============================================================================
// 5. Four-element compound and saidoku compound
// ============================================================================

describe('Four-element compound and saidoku compound', () => {
  it('yomigana + tateten + emphasis + highlight with ref: emphasis wraps ruby', () => {
    const doc = createThreeTokenDoc('重', '要', '語', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'じゅうようご' },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'emphasis', anchor: { from: 't1', to: 't3' }, style: 'filled dot' },
      {
        type: 'highlight',
        id: 'hl1',
        anchor: { from: 't1', to: 't3' },
        style: 'solid',
        ref: 'ref1',
      },
      {
        type: 'ref',
        id: 'ref1',
        position: { blockId: 'b1', after: 't3' },
        format: 'alpha-upper',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('じゅうようご');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-ref');
    expect(html).toContain('(A)');
    // emphasis が ruby の外側にラップされていること
    expect(html).toMatch(/skam-emphasis.*<ruby>/s);
    // 個別トークンに emphasis class がないこと
    expect(html).not.toMatch(/skam-token skam-emphasis/);
  });

  it('saidoku + yomigana on same token', () => {
    const doc = createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'ショウ' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-saidoku');
    expect(html).toContain('まさ');
    expect(html).toContain('に');
    expect(html).toContain('す');
    // モデル層で MARK_CONFLICT とされる組み合わせだが、
    // レンダラーは防御的に saidoku 優先で動作する
    expect(html).not.toContain('ショウ');
  });

  it('saidoku + soegana on same token', () => {
    const doc = createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'は' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-saidoku');
    expect(html).toContain('まさ');
    expect(html).toContain('に');
    expect(html).toContain('す');
    // soegana は saidoku と共存可能で、正しくレンダリングされるべき
    expect(html).toContain('は');
    expect(html).toContain('skam-soegana');
  });
});

// ============================================================================
// 6. Tateten + kaeri: 竪点セパレータへの返り点並置
// ============================================================================

describe('Tateten + kaeri: non-レ kaeri alongside tateten separator', () => {
  it('tateten + non-レ kaeri on last token: kaeri placed in tateten-sep', () => {
    const doc = createThreeTokenDoc('梁', '執', '与', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '二' },
    ]);
    const { html } = render(doc);
    // 最終トークンの純粋非レ返り点は竪点セパレータに配置
    expect(html).toContain('skam-tateten-sep');
    expect(html).toMatch(/skam-tateten-sep.*skam-kaeriten/s);
    // suffix-kaeri に kaeriten が含まれない
    expect(html).not.toMatch(/skam-suffix-kaeri.*skam-kaeriten/s);
  });

  it('tateten + レ kaeri: レ stays in suffix-kaeri', () => {
    const doc = createThreeTokenDoc('梁', '執', '与', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const { html } = render(doc);
    // レ点は suffix-kaeri に残る
    expect(html).toContain('skam-kaeriten');
    // tateten-sep は常に生成される（tateten-mark のラッパー）
    expect(html).toContain('skam-tateten-sep');
    expect(html).toContain('skam-tateten-mark');
    // ただし kaeriten は tateten-sep 内ではなく suffix-kaeri に配置
    expect(html).not.toMatch(/skam-tateten-sep.*skam-kaeriten/s);
  });

  it('tateten + mixed kaeri (レ on mid + non-レ on last): split correctly', () => {
    const doc = createThreeTokenDoc('梁', '執', '与', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '二' },
    ]);
    const { html } = render(doc);
    // レ点は非最終トークン(t1)の suffix に残る
    expect(html).toMatch(/skam-suffix-kaeri.*\u3191/s); // レ unicode
    // 二点は最終トークンの kaeri → 最終セパレータに配置
    expect(html).toContain('skam-tateten-sep');
    expect(html).toMatch(/skam-tateten-sep.*\u3193/s); // 二 unicode
  });

  it('tateten + kaeri on last token: kaeri placed at last separator', () => {
    const doc = createThreeTokenDoc('梁', '執', '与', [
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: '二' },
    ]);
    const { html } = render(doc);
    // 最終トークンの非レ kaeri は最終セパレータに配置
    expect(html).toContain('skam-tateten-sep');
    expect(html).toMatch(/skam-tateten-sep.*skam-kaeriten/s);
  });

  it('no tateten + kaeri: kaeri stays in suffix (regression)', () => {
    const doc = createThreeTokenDoc('子', '曰', '學', [
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '二' },
    ]);
    const { html } = render(doc);
    // tateten がないので suffix-kaeri に配置
    expect(html).toContain('skam-kaeriten');
    expect(html).not.toContain('skam-tateten-sep');
    expect(html).toMatch(/skam-suffix-kaeri.*skam-kaeriten/s);
  });

  it('compound kaeri (一レ) on non-last token: split into sep (一) + suffix (レ)', () => {
    const doc = createThreeTokenDoc('梁', '執', '与', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '一レ' },
    ]);
    const { html } = render(doc);
    // 一部分は tateten-sep に配置
    expect(html).toContain('skam-tateten-sep');
    expect(html).toMatch(/skam-tateten-sep.*\u3192/s); // 一 unicode
    // レ部分は suffix-kaeri に配置
    expect(html).toMatch(/skam-suffix-kaeri.*\u3191/s); // レ unicode
  });

  it('compound kaeri (一レ) on last token: split into sep (一) + suffix (レ)', () => {
    const doc = createThreeTokenDoc('梁', '執', '与', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '一レ' },
    ]);
    const { html } = render(doc);
    // 一部分は最終セパレータに配置
    expect(html).toContain('skam-tateten-sep');
    expect(html).toMatch(/skam-tateten-sep.*\u3192/s); // 一 unicode
    // レ部分は suffix-kaeri に配置
    expect(html).toMatch(/skam-suffix-kaeri.*\u3191/s); // レ unicode
  });
});

// ============================================================================
// 読み範囲 + tateten + kaeri の複合（regression: kaeri が消える問題）
// ============================================================================

describe('Range kana + tateten + kaeri: kaeri must not disappear', () => {
  it('yomigana + tateten + kaeri: kaeri is preserved in tateten-sep', () => {
    const doc = createThreeTokenDoc('春', '風', '吹', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しゅんぷう' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '二' },
    ]);
    const { html } = render(doc);
    // kaeri が出力に存在する
    expect(html).toContain('skam-kaeriten');
    // tateten-sep 内に kaeri が配置される
    expect(html).toMatch(/skam-tateten-sep.*skam-kaeriten/s);
    // yomigana（ruby）も存在する
    expect(html).toContain('skam-ruby');
    expect(html).toContain('しゅんぷう');
  });

  it('yomigana + tateten: ruby wraps tateten-group structure', () => {
    const doc = createThreeTokenDoc('春', '風', '吹', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しゅんぷう' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
    ]);
    const { html } = render(doc);
    // <ruby> が tateten-group を含む
    expect(html).toMatch(/<ruby>.*skam-tateten-group.*<\/ruby>/s);
    // 個別トークンが tateten-group 内にある（インライン結合ではない）
    expect(html).toMatch(/skam-tateten-group.*skam-base.*春.*skam-tateten-sep.*skam-base.*風/s);
    // rt に読み仮名
    expect(html).toMatch(/<rt class="skam-ruby">しゅんぷう<\/rt>/);
  });

  it('yomigana + tateten: no duplicate ruby on individual tokens', () => {
    const doc = createThreeTokenDoc('國', '家', '之', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'こっか' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
    ]);
    const { html } = render(doc);
    // グループレベルの ruby は1つだけ
    const rtMatches = html.match(/<rt class="skam-ruby">こっか<\/rt>/g);
    expect(rtMatches).toHaveLength(1);
    // 個別トークンに ruby がネストしていないこと
    // 正しい構造: <ruby><rb class="skam-tateten-group">...<span class="skam-base">國</span>...<span class="skam-base">家</span>...</rb><rt>こっか</rt></ruby>
    expect(html).not.toMatch(/skam-token.*<ruby>/s);
  });

  it('yomigana + tateten + compound kaeri (一レ): split correctly', () => {
    const doc = createThreeTokenDoc('春', '風', '吹', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しゅんぷう' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '一レ' },
    ]);
    const { html } = render(doc);
    // 一部分は tateten-sep に配置
    expect(html).toMatch(/skam-tateten-sep.*\u3192/s);
    // レ部分は suffix-kaeri に配置
    expect(html).toMatch(/skam-suffix-kaeri.*\u3191/s);
    // yomigana も存在
    expect(html).toContain('しゅんぷう');
  });

  it('okurigana + tateten + kaeri: kaeri is preserved', () => {
    const doc = createThreeTokenDoc('不', '能', '爲', [
      { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'ず' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '二' },
    ]);
    const { html } = render(doc);
    // kaeri が存在
    expect(html).toContain('skam-kaeriten');
    // tateten-sep 内に kaeri
    expect(html).toMatch(/skam-tateten-sep.*skam-kaeriten/s);
    // 送り仮名も存在
    expect(html).toContain('skam-okuri');
    expect(html).toContain('ず');
  });

  it('soegana + tateten + kaeri: kaeri is preserved', () => {
    const doc = createThreeTokenDoc('天', '地', '人', [
      { type: 'soegana', anchor: { from: 't1', to: 't2' }, value: 'ノ' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '二' },
    ]);
    const { html } = render(doc);
    // kaeri が存在
    expect(html).toContain('skam-kaeriten');
    // tateten-sep 内に kaeri
    expect(html).toMatch(/skam-tateten-sep.*skam-kaeriten/s);
    // 添え仮名も存在
    expect(html).toContain('skam-soegana');
    expect(html).toContain('ノ');
  });

  it('yomigana + tateten + レ kaeri on mid token: レ in suffix, not in sep', () => {
    const doc = createThreeTokenDoc('春', '風', '吹', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しゅんぷう' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const { html } = render(doc);
    // レ kaeri は suffix-kaeri に配置
    expect(html).toMatch(/skam-suffix-kaeri.*skam-kaeriten/s);
    // tateten-sep 内に kaeri はない
    expect(html).not.toMatch(/skam-tateten-sep.*skam-kaeriten/s);
  });
});

// ============================================================================
// Tateten + yomigana: 末尾トークンの suffix-row を ruby の外に分離
// ============================================================================

describe('Tateten + yomigana: last token suffix-row extracted outside ruby', () => {
  it('yomigana + tateten + kutoten: suffix-row is outside ruby', () => {
    const doc = createTwoTokenDoc('春', '風', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しゅんぷう' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kutoten', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);
    const { html } = render(doc);
    // kutoten が出力に存在する
    expect(html).toContain('skam-suffix-kutoten');
    // suffix-row は </ruby> の後に配置される
    expect(html).toMatch(/<\/ruby>.*skam-suffix-row/s);
    // <rb> 内に suffix-row がない
    expect(html).not.toMatch(/<rb.*skam-suffix-row.*<\/rb>/s);
  });

  it('yomigana + tateten + kaeri + kutoten: kaeri in sep, suffix outside ruby', () => {
    const doc = createTwoTokenDoc('春', '風', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しゅんぷう' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '二' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);
    const { html } = render(doc);
    // 非レ kaeri は tateten-sep に配置
    expect(html).toMatch(/skam-tateten-sep.*skam-kaeriten/s);
    // suffix-row（kutoten含む）は ruby の外に配置
    expect(html).toMatch(/<\/ruby>.*skam-suffix-kutoten/s);
    // yomigana も存在
    expect(html).toContain('しゅんぷう');
  });

  it('tateten + kutoten (yomigana なし): suffix-row stays in token', () => {
    const doc = createTwoTokenDoc('春', '風', [
      { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'ハル' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kutoten', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);
    const { html } = render(doc);
    // kutoten が出力に存在する
    expect(html).toContain('skam-suffix-kutoten');
    // yomigana がないので ruby にならず、suffix-row はトークン内にとどまる
    expect(html).not.toContain('<ruby>');
    expect(html).toMatch(/skam-suffix-row.*skam-suffix-kutoten/s);
  });

  it('yomigana + tateten + soegana + kutoten: entire suffix-row extracted', () => {
    const doc = createTwoTokenDoc('大', '事', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'だいじ' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'soegana', anchor: { from: 't1', to: 't2' }, value: 'ヲ' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);
    const { html } = render(doc);
    // soegana と kutoten を含む suffix-row が ruby の外に配置
    expect(html).toContain('skam-soegana');
    expect(html).toContain('skam-suffix-kutoten');
    expect(html).toMatch(/<\/ruby>.*skam-suffix-row/s);
    expect(html).toMatch(/<\/ruby>.*skam-soegana/s);
    expect(html).toMatch(/<\/ruby>.*skam-suffix-kutoten/s);
    // <rb> 内に suffix-row がない
    expect(html).not.toMatch(/<rb.*skam-suffix-row.*<\/rb>/s);
  });

  it('yomigana + tateten + mid-token レ kaeri: レ stays inside ruby', () => {
    const doc = createTwoTokenDoc('春', '風', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しゅんぷう' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const { html } = render(doc);
    // 中間トークン(t1)のレ kaeri は suffix-kaeri 内（rb 内）に残る
    expect(html).toMatch(/<rb.*skam-suffix-kaeri.*skam-kaeriten.*<\/rb>/s);
  });
});

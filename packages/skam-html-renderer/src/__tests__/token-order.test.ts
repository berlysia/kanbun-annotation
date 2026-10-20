import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument, Token } from '@kanbun-skam/skam';
import { render } from '../index.js';

// tokens[] の配列順序に意味は無く、原文の順序は blocks[].tokenIds の連結順で決まる。
// 範囲の注記の「間の字」も原文の順序で判定され、tokens[] を逆順にしても出力は変わらない。

const TEN_SECONDS = 10_000;

function tok(id: string, text: string): Token {
  return { id, text };
}

function docOf(tokens: Token[], marks: Mark[], order: 'source' | 'reversed'): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: order === 'source' ? tokens : [...tokens].reverse(),
    blocks: [{ id: 'b1', tokenIds: tokens.map((t) => t.id) }],
    marks,
    readings: [],
  };
}

const FIVE = [tok('t1', '甲'), tok('t2', '乙'), tok('t3', '丙'), tok('t4', '丁'), tok('t5', '戊')];

function renderedHtml(doc: SKAMDocument): string {
  return render(doc).html;
}

describe('tokens[] の順序が原文と違う文書の html', () => {
  it('傍点の範囲の間の字 (丙) に、tokens[] を逆順にしても傍点が付く', () => {
    const marks: Mark[] = [{ type: 'emphasis', anchor: { from: 't2', to: 't4' } } as Mark];
    const source = renderedHtml(docOf(FIVE, marks, 'source'));
    const reversed = renderedHtml(docOf(FIVE, marks, 'reversed'));
    expect(reversed).toBe(source);
    // 乙丙丁の 3 字に傍点が付く
    expect(source.match(/emphasis/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['highlight', { type: 'highlight', anchor: { from: 't2', to: 't4' }, style: 'solid' }],
    ['okimoji', { type: 'okimoji', anchor: { from: 't2', to: 't4' }, value: '〇' }],
    ['tateten', { type: 'tateten', anchor: { from: 't2', to: 't4' } }],
  ])('%s の範囲でも、tokens[] を逆順にした HTML が原文順と一致する', (_name, mark) => {
    const marks = [mark as unknown as Mark];
    expect(renderedHtml(docOf(FIVE, marks, 'reversed'))).toBe(
      renderedHtml(docOf(FIVE, marks, 'source'))
    );
  });
});

describe('検証を通らない文書でも render() は例外を投げない', () => {
  const emphasis = { type: 'emphasis', anchor: { from: 't1', to: 't3' } } as Mark;

  it('blocks が空の文書', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: FIVE.slice(0, 3),
      blocks: [],
      marks: [emphasis],
      readings: [],
    };
    expect(() => render(doc)).not.toThrow();
    // 全 tokens が 1 つの列になり、その列の順序で範囲を判定する
    expect(render(doc).html.match(/emphasis/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('block に tokens[] に無い id がある文書', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: FIVE.slice(0, 3),
      blocks: [{ id: 'b1', tokenIds: ['t1', 'ghost', 't2', 't3'] }],
      marks: [emphasis],
      readings: [],
    };
    expect(() => render(doc)).not.toThrow();
  });

  it('tokens[] に同じ id が 2 つある文書', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [tok('t1', '甲'), tok('t2', '乙'), tok('t2', '乙'), tok('t3', '丙')],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [emphasis],
      readings: [],
    };
    expect(() => render(doc)).not.toThrow();
  });
});

describe('描画時間が字数と注記数の積で増えない', () => {
  it(
    '50 字の block を 100 個 (5000 字)、10 字ごとに 4 字の highlight と 1 字のルビ',
    () => {
      const tokens: Token[] = [];
      const blocks: SKAMDocument['blocks'] = [];
      const marks: Mark[] = [];
      for (let b = 0; b < 100; b++) {
        const ids: string[] = [];
        for (let i = 0; i < 50; i++) {
          const id = `t${b}-${i}`;
          tokens.push(tok(id, '漢'));
          ids.push(id);
        }
        blocks.push({ id: `b${b}`, tokenIds: ids });
        for (let i = 0; i + 3 < 50; i += 10) {
          marks.push({
            type: 'highlight',
            anchor: { from: `t${b}-${i}`, to: `t${b}-${i + 3}` },
            style: 'solid',
          } as Mark);
          marks.push({
            type: 'yomigana',
            anchor: { from: `t${b}-${i}`, to: `t${b}-${i}` },
            value: 'かん',
          } as Mark);
        }
      }
      const doc: SKAMDocument = { format: 'skam@0.1', tokens, blocks, marks, readings: [] };
      expect(() => render(doc)).not.toThrow();
    },
    TEN_SECONDS
  );

  it(
    '5000 字の 1 つの block に、ほぼ block 全体を覆う highlight を 200 個',
    () => {
      const tokens: Token[] = [];
      for (let i = 0; i < 5000; i++) tokens.push(tok(`t${i}`, '漢'));
      const marks: Mark[] = [];
      for (let m = 0; m < 200; m++) {
        marks.push({
          type: 'highlight',
          anchor: { from: `t${m % 10}`, to: `t${4999 - ((m * 7) % 10)}` },
          style: 'solid',
        } as Mark);
      }
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens,
        blocks: [{ id: 'b1', tokenIds: tokens.map((t) => t.id) }],
        marks,
        readings: [],
      };
      expect(() => render(doc)).not.toThrow();
    },
    TEN_SECONDS
  );
});

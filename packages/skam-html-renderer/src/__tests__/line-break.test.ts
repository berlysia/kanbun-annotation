import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '@kanbun/skam';
import { render, getDefaultStyles } from '../index.js';

// ============================================================================
// Helpers
// ============================================================================

function twoTokenDoc(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
    marks: [],
    readings: [],
  };
}

function threeTokenDoc(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks: [],
    readings: [],
  };
}

function tatetenGroupDoc(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks: [{ type: 'tateten', anchor: { from: 't1', to: 't2' } }],
    readings: [],
  };
}

function highlightGroupDoc(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks: [{ type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' }],
    readings: [],
  };
}

function tatetenYomiganaKutotenDoc(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '天' },
      { id: 't2', text: '地' },
      { id: 't3', text: '不' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks: [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'てんち' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ],
    readings: [],
  };
}

function blockStartKutotenDoc(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks: [{ type: 'kutoten', position: { blockId: 'b1' }, value: '。' }],
    readings: [],
  };
}

/**
 * render() の HTML 出力から skam-block 内のコンテンツを抽出する
 */
function extractBlockContent(html: string): string {
  const match = html.match(/<div class="skam-block"[^>]*>(.*?)<\/div>/s);
  return match?.[1] ?? '';
}

// ============================================================================
// Tests: <wbr> insertion
// ============================================================================

describe('line break control in HTML output', () => {
  describe('<wbr> insertion', () => {
    it('2トークン・マークなし → トークン間に <wbr> が挿入される', () => {
      const result = render(twoTokenDoc());
      const blockContent = extractBlockContent(result.html);

      // トークン間に <wbr> がある
      expect(blockContent).toContain('<wbr>');
      // 先頭トークンの前には <wbr> がない（ブロック先頭）
      expect(blockContent).not.toMatch(/^<wbr>/);
    });

    it('3トークン・マークなし → トークン間に <wbr> が挿入される', () => {
      const result = render(threeTokenDoc());
      const blockContent = extractBlockContent(result.html);

      // <wbr> が2つある（t1-t2間、t2-t3間）
      const wbrCount = (blockContent.match(/<wbr>/g) ?? []).length;
      expect(wbrCount).toBe(2);
    });

    it('tateten グループの前後に <wbr> あり、内部にはなし', () => {
      const result = render(tatetenGroupDoc());
      const blockContent = extractBlockContent(result.html);

      // tateten-group の後（t3 の前）に <wbr> がある
      expect(blockContent).toContain('<wbr>');

      // tateten-group 内部の tateten-sep 周辺には <wbr> がない
      // tateten-group span 内を確認
      const groupMatch = blockContent.match(/<span class="skam-tateten-group">(.*?)<\/span>/s);
      if (groupMatch) {
        expect(groupMatch[1]).not.toContain('<wbr>');
      }
    });

    it('highlight グループ内の子ノード間に <wbr> あり', () => {
      const result = render(highlightGroupDoc());
      const blockContent = extractBlockContent(result.html);

      // highlight-content 内に <wbr> がある
      // highlight-content はネストした span を含むので greedy マッチ
      const contentMatch = blockContent.match(/skam-highlight-content">(.*)<\/span><\/span>/s);
      expect(contentMatch).not.toBeNull();
      expect(contentMatch![1]).toContain('<wbr>');
    });

    it('熟語訓（tateten+yomigana）直後の kutoten: suffix-row が ruby-grid/ruby 内に配置される', () => {
      // 改行機会の排除: suffix-row を ruby-grid の内部に grid item として配置する。
      // CSS で grid-column: 2 に配置し、ruby annotation (column 1) と分離。
      // ruby モードでは </rt> 後 </ruby> 前に配置（anonymous ruby base として表示）。

      // grid モード（デフォルト）でテスト
      const resultGrid = render(tatetenYomiganaKutotenDoc());
      const blockContentGrid = extractBlockContent(resultGrid.html);

      // kutoten が出力されている
      expect(blockContentGrid).toContain('。');

      // suffix-row が ruby-grid 閉じタグの *前* にある（内部に配置されている）
      expect(blockContentGrid).toMatch(/skam-suffix-row.*?<\/span><\/span>/s);
      // ruby-grid 閉じタグの *後* には suffix-row がない
      expect(blockContentGrid).not.toMatch(
        /skam-ruby-grid[^>]*>(?:<[^>]*>[^<]*<\/[^>]*>)*<\/span>\s*<span class="skam-suffix-row"/
      );

      // ruby モードでもテスト
      const resultRuby = render(tatetenYomiganaKutotenDoc(), { rubyMethod: 'ruby' });
      const blockContentRuby = extractBlockContent(resultRuby.html);

      // suffix-row が </ruby> の *前* にある（ruby 内に配置されている）
      expect(blockContentRuby).toMatch(/skam-suffix-row.*?<\/span><\/ruby>/s);
      // </ruby> の *後* には suffix-row がない
      expect(blockContentRuby).not.toMatch(/<\/ruby>\s*<span class="skam-suffix-row"/);
    });

    it('blockStartHtml（kutoten）がある場合、最初のトークン前に <wbr> なし', () => {
      const result = render(blockStartKutotenDoc());
      const blockContent = extractBlockContent(result.html);

      // kutoten が出力されている
      expect(blockContent).toContain('。');

      // blockStartHtml + 最初のトークンの間には <wbr> がない
      // kutoten span の直後に <wbr> がないことを確認
      expect(blockContent).not.toMatch(/skam-kutoten[^>]*>[^<]*<\/span><wbr>/);
    });
  });

  describe('CSS', () => {
    it('word-break: keep-all が .skam-block に適用されている', () => {
      const css = getDefaultStyles();
      expect(css).toMatch(/\.skam-block\)[\s\S]*?word-break:\s*keep-all/);
    });

    it('white-space: nowrap が .skam-token に適用されている', () => {
      const css = getDefaultStyles();
      expect(css).toContain('white-space: nowrap');
      // .skam-token ルール内にあることを確認
      expect(css).toMatch(/\.skam-token\)[\s\S]*?white-space:\s*nowrap/);
    });

    it('white-space: nowrap が .skam-tateten-group に適用されている', () => {
      const css = getDefaultStyles();
      expect(css).toMatch(/\.skam-tateten-group\)[\s\S]*?white-space:\s*nowrap/);
    });

    it('highlight-content が縦書き時 display: inline', () => {
      const css = getDefaultStyles({ writingMode: 'vertical' });
      expect(css).toMatch(/\.skam-highlight-content\)[\s\S]*?display:\s*inline/);
      // inline-block ではないことを確認
      expect(css).not.toMatch(/\.skam-highlight-content\)[\s\S]*?display:\s*inline-block/);
    });

    it('highlight double が background-image で描画される（縦書き）', () => {
      const css = getDefaultStyles({ writingMode: 'vertical' });
      // double スタイルに background-image がある
      expect(css).toMatch(/data-style="double"[\s\S]*?background-image:\s*linear-gradient/);
      // ::before/::after が double に使われていない
      expect(css).not.toMatch(/data-style="double"[\s\S]*?::before/);
      expect(css).not.toMatch(/data-style="double"[\s\S]*?::after/);
    });

    it('highlight double が background-image で描画される（横書き）', () => {
      const css = getDefaultStyles({ writingMode: 'horizontal' });
      expect(css).toMatch(/data-style="double"[\s\S]*?background-image:\s*linear-gradient/);
      expect(css).not.toMatch(/data-style="double"[\s\S]*?::before/);
      expect(css).not.toMatch(/data-style="double"[\s\S]*?::after/);
    });
  });
});

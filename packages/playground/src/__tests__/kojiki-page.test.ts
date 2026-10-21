import { describe, expect, it } from 'vitest';
import { buildDocumentFromSource, KOJIKI_PAGES } from '@kanbun-skam/kojiki';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { render } from '@kanbun-skam/skam-html-renderer';
import {
  buildKojikiPageHtml,
  type KojikiRenderedVolume,
  type KojikiRenderedVolumes,
} from '../kojiki-page/page.js';

const SMALL_SOURCE = [
  '# 上卷',
  '{u:甲乙}丙。{v:丁戊|己}',
  '# 中卷',
  '庚辛{n:注}壬',
  '# 下卷',
  '癸子丑',
].join('\n');

function renderVolume(doc: SKAMDocument): KojikiRenderedVolume {
  const { html, css } = render(doc, { writingMode: 'vertical' });
  return { html, css, tokenCount: doc.tokens.length };
}

function smallVolumes(): KojikiRenderedVolumes {
  const volume = (name: '上卷' | '中卷' | '下卷'): KojikiRenderedVolume =>
    renderVolume(buildDocumentFromSource(SMALL_SOURCE, { volume: name, synthetic: false }));
  return [volume('上卷'), volume('中卷'), volume('下卷')];
}

function parse(html: string): Document {
  // happy-dom は <link rel="stylesheet"> を実際に取りに行くので、構造を見る前に <link> を除く
  return new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/g, ''), 'text/html');
}

describe('buildKojikiPageHtml', () => {
  const html = buildKojikiPageHtml(smallVolumes());

  it('puts the three volume sections in order inside div.kojiki-text, matching the table of contents', () => {
    const doc = parse(html);
    const sections = [...doc.querySelectorAll('div.kojiki-text > section')];
    expect(sections.map((section) => section.id)).toEqual(['kami', 'naka', 'shimo']);
    const tocTargets = [...doc.querySelectorAll('nav a[href^="#"]')].map((a) =>
      a.getAttribute('href')
    );
    expect(tocTargets).toEqual(['#kami', '#naka', '#shimo']);
    expect(doc.querySelector('nav a[href="./"]')).not.toBeNull();
    expect(doc.documentElement.lang).toBe('ja');
    expect(doc.title).toBe('古事記 — SKAM の描画');
  });

  it('attributes the source: three oldid pages, three histories, CC BY-SA 4.0 and public domain', () => {
    const doc = parse(html);
    const hrefs = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    for (const page of KOJIKI_PAGES) {
      expect(hrefs).toContain(`https://zh.wikisource.org/w/index.php?oldid=${page.rev}`);
      expect(hrefs).toContain(
        `https://zh.wikisource.org/w/index.php?title=${encodeURIComponent(page.title)}&action=history`
      );
    }
    expect(hrefs.some((href) => href.includes('creativecommons.org/licenses/by-sa/4.0'))).toBe(
      true
    );
    expect(html).toContain('public domain');
    // 本文とコードのライセンスの範囲を分けて書く
    expect(html).toContain('ページを作るコードはリポジトリの');
    expect(html).toContain('packages/kojiki/README.md');
  });

  it('puts the CSP meta before the first link and script, and forbids base and forms', () => {
    const csp = html.indexOf('http-equiv="Content-Security-Policy"');
    expect(csp).toBeGreaterThan(-1);
    expect(csp).toBeLessThan(html.indexOf('<link'));
    expect(csp).toBeLessThan(html.indexOf('<script'));
    const content = parse(html)
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute('content')!;
    expect(content).toContain("base-uri 'none'");
    expect(content).toContain("script-src 'self'");
    expect(content).toContain("object-src 'none'");
  });

  it('has exactly one script (the calibrate module) and inlines the rendered css once', () => {
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('<script type="module" src="./kojiki-calibrate.js"></script>');
    const { css } = smallVolumes()[0];
    expect(css.length).toBeGreaterThan(0);
    expect(html.split(css)).toHaveLength(2);
  });

  it('throws when the volumes were rendered with different css', () => {
    const [a, b, c] = smallVolumes();
    const same = renderVolume(buildDocumentFromSource(SMALL_SOURCE, { synthetic: false }));
    // 3 巻を同じ options で描いた css は同じ
    expect(same.css).toBe(a.css);
    expect(() => buildKojikiPageHtml([a, b, c])).not.toThrow();
    expect(() => buildKojikiPageHtml([a, { ...b, css: `${b.css}\n.x{}` }, c])).toThrow(
      /different css/
    );
  });
});

describe('page content', () => {
  it('has no dotted highlight and no synthetic yomigana, okurigana or kaeri with synthetic: false', () => {
    const doc = buildDocumentFromSource(SMALL_SOURCE, { synthetic: false });
    expect(doc.readings).toEqual([]);
    const types = doc.marks.map((mark) => mark.type);
    expect(types).not.toContain('yomigana');
    expect(types).not.toContain('okurigana');
    expect(types).not.toContain('kaeri');
    expect(doc.marks.some((mark) => mark.type === 'highlight' && mark.style === 'dotted')).toBe(
      false
    );
  });

  it('does not emit raw markup from hostile strings in the document fields', () => {
    const hostile = [
      '<script>alert(1)</script>',
      '"><img onerror=x>',
      'javascript:alert(1)',
    ] as const;
    // 文字列の欄はすべて入れる: token の id と text、block の id、ref の content と label、yomigana の value、
    // highlight の id。どの欄でも描画は例外にならず、外した欄は無い
    for (const value of hostile) {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: value, text: value },
          { id: 't1', text: '乙' },
        ],
        blocks: [{ id: value, tokenIds: [value, 't1'] }],
        marks: [
          {
            type: 'ref',
            id: 'r1',
            position: { blockId: value, after: 't1' },
            format: 'numeric-paren',
            content: value,
          },
          { type: 'ref', id: 'r2', position: { blockId: value, after: 't1' }, label: value },
          { type: 'yomigana', id: 'y1', anchor: { from: 't1', to: 't1' }, value },
          { type: 'highlight', id: value, anchor: { from: 't1', to: 't1' }, style: 'solid' },
        ],
        readings: [],
      };
      const rendered = renderVolume(doc);
      const page = buildKojikiPageHtml([rendered, rendered, rendered]);
      expect(page).not.toContain('<script>alert');
      expect(page).not.toContain('<img onerror');
      expect(page).not.toMatch(/(?:href|src|action|data)\s*=\s*["']?\s*javascript:/i);
      expect(page.match(/<script/g)).toHaveLength(1);
    }
  });
});

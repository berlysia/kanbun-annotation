/**
 * 古事記のページ (kojiki.html) の HTML を組む純粋関数。ファイルにもネットワークにも触らない。
 *
 * `scripts/` の CLI が Node の type stripping で直接読むので、相対 import をせず、パッケージと型だけを
 * import する。enum・parameter property・namespace も使わない。
 *
 * 帰属表示は、このファイルの定数と KOJIKI_PAGES (3 つの oldid) だけから作る。取得した本文は、
 * 描画の結果 (html) としてしか入らない。
 */

import { KOJIKI_PAGES } from '@kanbun-skam/kojiki';

/** 1 巻ぶんの描画の結果 (`render()` の html と css) と token 数 */
export interface KojikiRenderedVolume {
  readonly html: string;
  readonly css: string;
  readonly tokenCount: number;
}

/** 上巻・中巻・下巻の順 */
export type KojikiRenderedVolumes = readonly [
  KojikiRenderedVolume,
  KojikiRenderedVolume,
  KojikiRenderedVolume,
];

const SECTIONS = [
  { id: 'kami', name: '上巻' },
  { id: 'naka', name: '中巻' },
  { id: 'shimo', name: '下巻' },
] as const;

const WIKISOURCE_ORIGIN = 'https://zh.wikisource.org';
const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const REPOSITORY_URL = 'https://github.com/berlysia/kanbun-annotation';
const README_URL = `${REPOSITORY_URL}/blob/master/packages/kojiki/README.md`;
const LICENSE_URL = `${REPOSITORY_URL}/blob/master/LICENSE`;
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap';

/**
 * 'unsafe-inline' は、renderer の既定 (inlineStyles: true) が出す style 属性と、ページに埋め込む描画の
 * css の <style> のため。frame-ancestors は meta では効かないので入れない。'self' は
 * berlysia.github.io の origin 全体を指す (同じ origin の別のリポジトリのスクリプトも許す。
 * ページに XSS の経路が無いので許容)。
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

// `.kojiki-text` の width を外すと、横書きの body の中の縦書きの容器が本文の幅 (十数万 px) まで広がり、
// ページ全体が横に伸びて左端 (下巻の終わり) から表示される。容器を画面の幅に収め、容器の中で右端 (上巻の冒頭) から scroll させる
const PAGE_CSS = `*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 16px 24px; font-family: "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif; line-height: 1.7; }
.kojiki-header { max-width: 60rem; margin: 0 auto 24px; font-size: 0.95rem; }
.kojiki-header h1 { margin: 0 0 8px; font-size: 1.5rem; }
.kojiki-header h2 { margin: 16px 0 4px; font-size: 1.05rem; }
.kojiki-header ul { margin: 4px 0; padding-left: 1.5em; }
.kojiki-toc { display: flex; gap: 16px; flex-wrap: wrap; padding: 0; list-style: none; }
.kojiki-text { writing-mode: vertical-rl; width: 100%; height: 80vh; overflow-x: auto; overflow-y: hidden; font-size: 24px; }
.kojiki-text section { margin-inline-start: 4em; }
.kojiki-text h2 { margin: 0 0 0 1.5em; font-size: 1.3em; }
.kojiki-text .kojiki-count { font-size: 0.6em; font-weight: 400; }`;

function buildHistoryUrl(title: string): string {
  return `${WIKISOURCE_ORIGIN}/w/index.php?title=${encodeURIComponent(title)}&action=history`;
}

function buildAttribution(): string {
  const pages = KOJIKI_PAGES.map((page) => {
    const oldidUrl = `${WIKISOURCE_ORIGIN}/w/index.php?oldid=${page.rev}`;
    return `<li><a href="${oldidUrl}" rel="noopener noreferrer">${page.title}</a> (oldid ${page.rev}) / <a href="${buildHistoryUrl(page.title)}" rel="noopener noreferrer">ページの履歴</a></li>`;
  }).join('\n      ');
  return `<section class="kojiki-attribution">
    <h2>帰属表示</h2>
    <ul>
      <li>原典: 『古事記』(712 年)。原典そのものは public domain。</li>
      <li>本文の出所: <a href="${WIKISOURCE_ORIGIN}/" rel="noopener noreferrer">zh.wikisource</a> の次の 3 ページ (版を固定)。句読点、校訂、異文の注、割注の分離は wikisource の編集者の寄与。</li>
    </ul>
    <ul>
      ${pages}
    </ul>
    <ul>
      <li>ライセンス: このページの本文 (古事記の本文、句読点、注) は <a href="${CC_BY_SA_URL}" rel="noopener noreferrer">CC BY-SA 4.0</a> で提供する。ページを作るコードはリポジトリの <a href="${LICENSE_URL}" rel="noopener noreferrer">MIT</a>。</li>
      <li>変えたこと: wikitext を正規化した。原文由来の注記 (句読点、固有名の下線、異文と割注の注) を SKAM の注記にした。読み・送り仮名・返り点などの合成の注記は付けていない。表外字は 〓 にした。詳細は <a href="${README_URL}" rel="noopener noreferrer">packages/kojiki/README.md</a>。</li>
    </ul>
  </section>`;
}

function assertSameCss(volumes: KojikiRenderedVolumes): string {
  const css = volumes[0].css;
  if (volumes.some((volume) => volume.css !== css)) {
    throw new Error('the three volumes were rendered with different css');
  }
  // <style> の中身が閉じタグで終わらないこと (css は renderer のオプションだけから作られる)
  if (css.toLowerCase().includes('</style')) {
    throw new Error('the rendered css contains a closing style tag');
  }
  return css;
}

/** 3 巻 (上巻・中巻・下巻) の描画の結果から、ページの HTML の文字列を作る */
export function buildKojikiPageHtml(volumes: KojikiRenderedVolumes): string {
  const css = assertSameCss(volumes);
  const toc = SECTIONS.map(
    (section) => `<li><a href="#${section.id}">${section.name}</a></li>`
  ).join('\n      ');
  const body = SECTIONS.map((section, index) => {
    const volume = volumes[index]!;
    return `<section id="${section.id}">
<h2>${section.name} <span class="kojiki-count">${volume.tokenCount} 字</span></h2>
${volume.html}
</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>古事記 — SKAM の描画</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<style>
${PAGE_CSS}
${css}
</style>
</head>
<body>
<header class="kojiki-header">
  <h1>古事記</h1>
  <p>SKAM が約 4 万字の大きな文書も描けることを示す例。古事記の校訂本として読むためのページではない。</p>
  <p>付けた注記は原文由来のものだけ: 句読点、固有名の下線、異文と割注の注。句読点は zh.wikisource の校訂者が付けた中国式のもの (「，」「；」「：」を含む) で、日本の訓読の校訂本の句読点とは付け方が違う。返り点や送り仮名は付けていない。</p>
  <nav aria-label="目次">
    <ul class="kojiki-toc">
      ${toc}
      <li><a href="./">SKAM Playground</a></li>
    </ul>
  </nav>
  ${buildAttribution()}
</header>
<main>
<div class="kojiki-text">
${body}
</div>
</main>
<script type="module" src="./kojiki-calibrate.js"></script>
</body>
</html>
`;
}

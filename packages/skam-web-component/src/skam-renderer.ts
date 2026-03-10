/**
 * <skam-renderer> カスタムエレメント
 *
 * SKAM の HTML レンダリングパイプラインを Web Component として提供する。
 * Shadow DOM でスタイルをカプセル化し、CSS Variables による外部カスタマイズを可能にする。
 */

import { parse } from '@kanbun/skam-xml-parser';
import { render, calibrateGridBaseline } from '@kanbun/skam-html-renderer';
import { buildRenderOptions, type AttributeValues } from './attribute-map.js';
import { extractXml } from './xml-extraction.js';
import { injectGoogleFontsLink, buildFontStyle } from './font-loader.js';

const ERROR_CSS = `
[role="alert"] {
  color: #c00;
  padding: 0.5em;
  font-family: monospace;
  white-space: pre-wrap;
}
`;

/**
 * Shadow DOM 内の CSS 変数をホスト要素から継承可能にするオーバーライド CSS を生成する。
 *
 * 問題: HTML レンダラーが生成する CSS は `:where(.skam-document)` に変数デフォルト値を
 * 直接宣言する。Shadow DOM ではホスト要素に設定した CSS 変数は継承で子に伝わるが、
 * 子要素に直接宣言があると継承値より優先される。
 *
 * 解決: `:host` にデフォルト値を設定し、`.skam-document` で `inherit` に上書きする。
 * `.skam-document` (specificity 0,1,0) は `:where(.skam-document)` (0,0,0) に勝つ。
 * ユーザーのインラインスタイルは `:host` ルールより優先される。
 *
 * 注意: --font-family / --font-family-ruby は font-loader が :host で設定するため、
 * ここでは :host のデフォルトを宣言しない（cascade 順序で上書きしてしまう）。
 * .document 側は inherit のままで問題ない（生成 CSS も元から inherit）。
 */
function generateVarOverrideCss(prefix: string): string {
  const vp = prefix;
  return `
:host {
  --${vp}-color-fg: currentColor;
  --${vp}-color-kaeriten: currentColor;
  --${vp}-color-ruby: currentColor;
  --${vp}-color-emphasis: currentColor;
  --${vp}-glyph-size: 1em;
  --${vp}-ruby-ratio: 0.5;
  --${vp}-line-height: 2;
  --${vp}-letter-spacing: 0;
}
.${vp}-document {
  --${vp}-color-fg: inherit;
  --${vp}-color-kaeriten: inherit;
  --${vp}-color-ruby: inherit;
  --${vp}-color-emphasis: inherit;
  --${vp}-font-family: inherit;
  --${vp}-font-family-ruby: inherit;
  --${vp}-glyph-size: inherit;
  --${vp}-ruby-ratio: inherit;
  --${vp}-line-height: inherit;
  --${vp}-letter-spacing: inherit;
}`;
}

export class SkamRendererElement extends HTMLElement {
  static observedAttributes = [
    'writing-mode',
    'profile',
    'inline',
    'include-reading-layer',
    'copyable',
    'class-prefix',
    'auto-font',
  ];

  #shadow: ShadowRoot;
  #mainStyle: HTMLStyleElement;
  #errorStyle: HTMLStyleElement;
  #fontStyle: HTMLStyleElement;
  #contentDiv: HTMLDivElement;

  #xmlContent: string | undefined;
  #observer: MutationObserver | null = null;
  #rafId: number | null = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });

    this.#mainStyle = document.createElement('style');
    this.#mainStyle.id = 'main-css';

    this.#errorStyle = document.createElement('style');
    this.#errorStyle.id = 'error-css';
    this.#errorStyle.textContent = ERROR_CSS;

    this.#fontStyle = document.createElement('style');
    this.#fontStyle.id = 'font-css';

    this.#contentDiv = document.createElement('div');
    this.#contentDiv.id = 'content';

    this.#shadow.appendChild(this.#fontStyle);
    this.#shadow.appendChild(this.#mainStyle);
    this.#shadow.appendChild(this.#errorStyle);
    this.#shadow.appendChild(this.#contentDiv);
  }

  /**
   * XML コンテンツをプログラマティックに設定する。
   * undefined の場合は <script type="application/vnd.berlysia.skam+xml"> や Light DOM にフォールバック。
   * 空文字列 "" も「設定済み」とみなし、フォールバックしない。
   */
  get xmlContent(): string | undefined {
    return this.#xmlContent;
  }

  set xmlContent(value: string | undefined) {
    this.#xmlContent = value;
    this.#scheduleRender();
  }

  connectedCallback(): void {
    // auto-font 属性があれば Google Fonts を注入
    this.#ensureFont();

    // MutationObserver で Light DOM の変更を検知
    this.#observer = new MutationObserver(() => {
      this.#scheduleRender();
    });
    this.#observer.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    this.#scheduleRender();
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect();
    this.#observer = null;

    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  attributeChangedCallback(
    _name: string,
    _oldValue: string | null,
    _newValue: string | null
  ): void {
    this.#scheduleRender();
  }

  #scheduleRender(): void {
    if (this.#rafId !== null) return;
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = null;
      this.#performRender();
    });
  }

  #performRender(): void {
    const xml = extractXml(this.#xmlContent, this);

    if (!xml) {
      this.#contentDiv.innerHTML = '';
      this.#mainStyle.textContent = '';
      return;
    }

    try {
      const doc = parse(xml);
      const attrs = this.#getAttributeValues();
      const options = buildRenderOptions(attrs);
      const { html, css } = render(doc, options);

      const prefix = options.classPrefix ?? 'skam';
      this.#mainStyle.textContent = css + generateVarOverrideCss(prefix);
      this.#ensureFont();
      this.#updateFontStyle(prefix);
      this.#contentDiv.innerHTML = html;

      // Chromium inline-grid baseline bug の検出・補正
      calibrateGridBaseline(this.#contentDiv, {
        variablePrefix: prefix,
      });

      this.dispatchEvent(
        new CustomEvent('skam-render', {
          detail: { document: doc },
          bubbles: true,
          composed: true,
        })
      );
    } catch (error) {
      this.#handleError(error);
    }
  }

  #handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);

    this.#contentDiv.innerHTML = '';
    const alert = document.createElement('div');
    alert.setAttribute('role', 'alert');
    alert.textContent = message;
    this.#contentDiv.appendChild(alert);

    this.dispatchEvent(
      new CustomEvent('skam-error', {
        detail: { error },
        bubbles: true,
        composed: true,
      })
    );
  }

  /** auto-font 属性があれば Google Fonts <link> を document.head に注入 */
  #ensureFont(): void {
    if (this.hasAttribute('auto-font')) {
      injectGoogleFontsLink();
    }
  }

  /** Shadow DOM 内のフォント CSS Variable を更新（auto-font 時のみ設定） */
  #updateFontStyle(variablePrefix: string): void {
    if (this.hasAttribute('auto-font')) {
      this.#fontStyle.textContent = buildFontStyle(variablePrefix);
    } else {
      this.#fontStyle.textContent = '';
    }
  }

  #getAttributeValues(): AttributeValues {
    return {
      'writing-mode': this.getAttribute('writing-mode'),
      profile: this.getAttribute('profile'),
      inline: this.getAttribute('inline'),
      'include-reading-layer': this.getAttribute('include-reading-layer'),
      copyable: this.getAttribute('copyable'),
      'class-prefix': this.getAttribute('class-prefix'),
    };
  }
}

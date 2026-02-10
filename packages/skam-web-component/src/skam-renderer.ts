/**
 * <skam-renderer> カスタムエレメント
 *
 * SKAM の HTML レンダリングパイプラインを Web Component として提供する。
 * Shadow DOM でスタイルをカプセル化し、CSS Variables による外部カスタマイズを可能にする。
 */

import { parse } from '@kanbun/skam-xml-parser';
import {
  render,
  attachInteractiveHandlers,
  calibrateGridBaseline,
} from '@kanbun/skam-html-renderer';
import type { InteractiveCallbacks } from '@kanbun/skam-html-renderer';
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

export class SkamRendererElement extends HTMLElement {
  static observedAttributes = [
    'writing-mode',
    'profile',
    'inline',
    'interactive',
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
  #interactiveCleanup: (() => void) | null = null;

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
   * undefined の場合は <script type="text/skam-ml"> や Light DOM にフォールバック。
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

    this.#interactiveCleanup?.();
    this.#interactiveCleanup = null;
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
      this.#interactiveCleanup?.();
      this.#interactiveCleanup = null;
      return;
    }

    try {
      const doc = parse(xml);
      const attrs = this.#getAttributeValues();
      const options = buildRenderOptions(attrs);
      const { html, css } = render(doc, options);

      this.#mainStyle.textContent = css;
      this.#ensureFont();
      this.#updateFontStyle(options.classPrefix ?? 'skam');
      this.#contentDiv.innerHTML = html;

      // Chromium inline-grid baseline bug の検出・補正
      calibrateGridBaseline(this.#contentDiv, {
        variablePrefix: options.classPrefix ?? 'skam',
      });

      // Interactive handlers
      this.#interactiveCleanup?.();
      this.#interactiveCleanup = null;

      if (options.interactive) {
        const callbacks: InteractiveCallbacks = {};
        this.#interactiveCleanup = attachInteractiveHandlers(this.#contentDiv, callbacks);
      }

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
      interactive: this.getAttribute('interactive'),
      'include-reading-layer': this.getAttribute('include-reading-layer'),
      copyable: this.getAttribute('copyable'),
      'class-prefix': this.getAttribute('class-prefix'),
    };
  }
}

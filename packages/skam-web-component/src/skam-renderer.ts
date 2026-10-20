/**
 * <skam-renderer> カスタムエレメント
 *
 * SKAM の HTML レンダリングパイプラインを Web Component として提供する。
 * Shadow DOM でスタイルをカプセル化し、CSS Variables による外部カスタマイズを可能にする。
 */

import { parse } from '@kanbun-skam/skam-xml-parser';
import {
  mount,
  validateRenderOptions,
  type AccessibleLabels,
  type MountOptions,
} from '@kanbun-skam/skam-html-renderer';
import {
  buildRenderOptions,
  type AttributeValues,
  type InvalidAttribute,
} from './attribute-map.js';
import { extractXml } from './xml-extraction.js';
import { injectGoogleFontsLink, buildFontStyle } from './font-loader.js';

/** mount が shadow root に入れる描画 CSS の <style> の印。mount (ADR-034 KD4) と同じ文字列 */
const STYLE_MARKER_SELECTOR = 'style[data-skam-css]';

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
function generateVarOverrideCss(classPrefix: string, variablePrefix: string): string {
  const vp = variablePrefix;
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
.${classPrefix}-document {
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

// SSR で import できるよう、HTMLElement が無い環境ではダミーの基底クラスを使う。
// その環境では要素を生成できない (constructor は document を使う)。
const BaseElement = (
  typeof HTMLElement === 'undefined' ? class {} : HTMLElement
) as typeof HTMLElement;

export class SkamRendererElement extends BaseElement {
  static observedAttributes = [
    'writing-mode',
    'profile',
    'inline',
    'include-reading-layer',
    'reading-layer-source',
    'copyable',
    'class-prefix',
    'display-lang',
    'auto-font',
  ];

  #shadow: ShadowRoot;
  #mainStyle: HTMLStyleElement;
  #errorStyle: HTMLStyleElement;
  #fontStyle: HTMLStyleElement;
  #contentDiv: HTMLDivElement;

  #xmlContent: string | undefined;
  #accessibleLabels: Partial<AccessibleLabels> | undefined;
  #trustedTypesPolicy: MountOptions['trustedTypesPolicy'] | undefined;
  /** skam-error で通知した不正な accessibleLabels の参照。同じ参照では再通知しない */
  #reportedLabels: { ref: unknown } | null = null;
  #observer: MutationObserver | null = null;
  #rafId: number | null = null;
  /** 最後に skam-error で通知した不正値 (属性名 → 値)。同じ値では再通知しない */
  #reportedInvalid = new Map<string, string>();
  /** fail closed で通知済みの属性 → 値。同じ値では再通知しない */
  #reportedBlocked = new Map<string, string>();
  /**
   * 直前に通知した致命的エラー (抽出した XML・name・message)。
   * 同じ内容で同じエラーが続く間は、再描画のたびに通知しない。ハンドラが内容を書き換えたときの
   * エラー → 再描画 → エラーの連鎖と、MutationObserver による重複通知を避けるため。
   */
  #reportedFatal: { xml: string; name: string; message: string } | null = null;
  /** #reportedFatal と対になる alert の要素。同じエラーの間は使い回して DOM に触らない */
  #fatalAlert: HTMLDivElement | null = null;

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

  /**
   * 読み上げ層の言葉を上書きするラベル。関数を含むので属性では渡せない。
   * `reading-layer-source="display"` のときだけ描画に効く。不正な値はラベルなしで描画し、
   * `recoverable: true` の skam-error で通知する。変えるときは新しいオブジェクトを代入する
   * (同じ参照の再代入は再描画しない)。null は指定なしとして扱う。
   *
   * @experimental
   */
  get accessibleLabels(): Partial<AccessibleLabels> | undefined {
    return this.#accessibleLabels;
  }

  set accessibleLabels(value: Partial<AccessibleLabels> | undefined) {
    const next = value ?? undefined;
    if (Object.is(next, this.#accessibleLabels)) return;
    this.#accessibleLabels = next;
    this.#scheduleRender();
  }

  /**
   * Trusted Types が必須のページで、文字列を DOM の sink に渡すための policy。JS のプロパティだけで、
   * 属性は無い。値は検証せず、parse (ブラウザ版) と mount の両方に渡す。`createHTML` は元の XML と
   * 描画の HTML の両方で呼ばれ、XML はそのまま返すこと。何を検査するかは利用者の責任で、
   * 描画の HTML の安全性は render のエスケープに依る。変えるときは新しいオブジェクトを代入する
   * (同じ参照の再代入は再描画しない)。null は指定なしとして扱う。
   * customElements.define の前にインスタンスへ代入した値は、このアクセサを通らない。
   *
   * @experimental
   */
  get trustedTypesPolicy(): MountOptions['trustedTypesPolicy'] | undefined {
    return this.#trustedTypesPolicy;
  }

  set trustedTypesPolicy(value: MountOptions['trustedTypesPolicy'] | null | undefined) {
    const next = value ?? undefined;
    if (Object.is(next, this.#trustedTypesPolicy)) return;
    this.#trustedTypesPolicy = next;
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

    this.#reportedInvalid.clear();
    this.#reportedBlocked.clear();
    this.#reportedLabels = null;
    this.#clearFatal();
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
    // mount は接続されていない container で投げる。接続前は描かず、connectedCallback の予約で描く
    if (!this.isConnected) return;

    // shadow root の描画 CSS はすべてこの要素のもの。どの経路でも先に消し、描けたときだけ mount が入れ直す
    for (const style of Array.from(this.#shadow.querySelectorAll(STYLE_MARKER_SELECTOR))) {
      style.remove();
    }

    const attrs = this.#getAttributeValues();
    // 注記を隠す属性が不正な間は、内容が変わっても描画しない (fail closed)
    const { options, invalid, blocked } = buildRenderOptions(attrs);
    if (blocked.length > 0) {
      this.#clearFatal();
      this.#renderBlocked(blocked, attrs);
      return;
    }
    this.#reportedBlocked.clear();

    const xml = extractXml(this.#xmlContent, this);

    if (!xml) {
      this.#clearFatal();
      this.#contentDiv.replaceChildren();
      this.#mainStyle.textContent = '';
      return;
    }

    try {
      // 読み上げ層の source にかかわらず検証する。不正ならラベルなしで描画を続ける
      const labels = this.#accessibleLabels;
      let labelsError: TypeError | null = null;
      if (labels !== undefined) {
        try {
          validateRenderOptions({ accessibleLabels: labels });
          options.accessibleLabels = labels;
        } catch (error) {
          labelsError = error instanceof TypeError ? error : new TypeError(String(error));
        }
      }

      // ブラウザ版の parse は parseFromString に文字列を渡すので、同じ policy を渡す (Node 版は使わない)
      const policy = this.#trustedTypesPolicy;
      const doc = policy === undefined ? parse(xml) : parse(xml, { trustedTypesPolicy: policy });

      // 検証を通った値だけから prefix を決める
      const classPrefix = options.classPrefix ?? 'skam';
      const variablePrefix = options.variablePrefix ?? 'skam';
      this.#mainStyle.textContent = generateVarOverrideCss(classPrefix, variablePrefix);
      this.#ensureFont();
      this.#updateFontStyle(variablePrefix);

      // CSS の挿入、HTML の差し込み、直後とフォント読み込み後の補正は mount が持つ。
      // fontsCalibrated は待たない (reject しない Promise)
      const mountOptions: MountOptions = { ...options };
      if (policy !== undefined) {
        mountOptions.trustedTypesPolicy = policy;
      }
      mount(this.#contentDiv, doc, mountOptions);

      this.#reportInvalid(invalid, attrs);
      this.#reportInvalidLabels(labels, labelsError);

      this.dispatchEvent(
        new CustomEvent('skam-render', {
          detail: { document: doc },
          bubbles: true,
          composed: true,
        })
      );
      this.#clearFatal();
    } catch (error) {
      this.#handleError(error, xml);
    }
  }

  /**
   * 既定値に戻した属性を回復可能なエラーとして通知する (内容は消さない)。
   * 同じ不正値が残っている間は再描画しても再通知しない。ハンドラが属性や内容を
   * 書き換えたときに、エラー → 再描画 → エラーの連鎖が起きるのを避けるため。
   */
  #reportInvalid(invalid: InvalidAttribute[], attrs: AttributeValues): void {
    const invalidNames = new Set(invalid.map((i) => i.attribute));
    // Map は反復中の delete が安全なので、キーを配列に写さずに反復する
    for (const name of this.#reportedInvalid.keys()) {
      if (!invalidNames.has(name)) this.#reportedInvalid.delete(name);
    }
    for (const { attribute, error } of invalid) {
      const value =
        (attrs as unknown as Record<string, string | null | undefined>)[attribute] ?? '';
      if (this.#reportedInvalid.get(attribute) === value) continue;
      this.#reportedInvalid.set(attribute, value);
      this.dispatchEvent(
        new CustomEvent('skam-error', {
          detail: { error, recoverable: true, attribute },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  /**
   * 不正な accessibleLabels を回復可能なエラーとして通知する (描画は続けている)。
   * 同じ参照では再通知しない。正しい値か指定なしになったら記憶を消す。
   */
  #reportInvalidLabels(labels: unknown, error: TypeError | null): void {
    if (error === null) {
      this.#reportedLabels = null;
      return;
    }
    if (this.#reportedLabels !== null && Object.is(this.#reportedLabels.ref, labels)) return;
    this.#reportedLabels = { ref: labels };
    this.dispatchEvent(
      new CustomEvent('skam-error', {
        detail: { error, recoverable: true, attribute: 'accessibleLabels' },
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * 隠す属性が不正なとき、描いた内容を消してメッセージだけを出す。
   * 同じ属性の同じ値では再通知しない (#reportInvalid と同じ理由)。
   * detail には属性の生の値を入れない。値は 64 文字に切り詰めてメッセージに含まれる。
   */
  #renderBlocked(blocked: InvalidAttribute[], attrs: AttributeValues): void {
    const names = new Set(blocked.map((b) => b.attribute));
    for (const name of this.#reportedBlocked.keys()) {
      if (!names.has(name)) this.#reportedBlocked.delete(name);
    }

    this.#contentDiv.replaceChildren();
    const alert = document.createElement('div');
    alert.setAttribute('role', 'alert');
    alert.textContent = blocked.map((b) => b.error.message).join('\n');
    this.#contentDiv.appendChild(alert);

    for (const { attribute, error } of blocked) {
      const value =
        (attrs as unknown as Record<string, string | null | undefined>)[attribute] ?? '';
      if (this.#reportedBlocked.get(attribute) === value) continue;
      this.#reportedBlocked.set(attribute, value);
      this.dispatchEvent(
        new CustomEvent('skam-error', {
          detail: { error, recoverable: false, attribute },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  /**
   * 致命的エラーを表示して通知する。XML・name・message がすべて直前の通知と同じなら通知しない。
   * Error でない値は name を空文字、message を String(値) として比べる。
   */
  #handleError(error: unknown, xml: string): void {
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : String(error);
    const last = this.#reportedFatal;
    const alert = this.#fatalAlert;

    if (
      last !== null &&
      alert !== null &&
      last.xml === xml &&
      last.name === name &&
      last.message === message
    ) {
      // 本文が書き込まれた後に例外が出た場合 (calibrateGridBaseline など) だけ、alert だけに戻す
      if (this.#contentDiv.childNodes.length !== 1 || this.#contentDiv.firstChild !== alert) {
        this.#contentDiv.replaceChildren(alert);
      }
      return;
    }

    const next = alert ?? document.createElement('div');
    next.setAttribute('role', 'alert');
    next.textContent = message;
    this.#fatalAlert = next;
    this.#contentDiv.replaceChildren(next);

    // 通知のハンドラが同期的に内容を書き換えても連鎖しないよう、通知の前に覚える
    this.#reportedFatal = { xml, name, message };

    this.dispatchEvent(
      new CustomEvent('skam-error', {
        detail: { error, recoverable: false },
        bubbles: true,
        composed: true,
      })
    );
  }

  #clearFatal(): void {
    this.#reportedFatal = null;
    this.#fatalAlert = null;
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
      'display-lang': this.getAttribute('display-lang'),
      'reading-layer-source': this.getAttribute('reading-layer-source'),
    };
  }
}

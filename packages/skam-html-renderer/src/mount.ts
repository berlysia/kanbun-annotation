/**
 * light DOM 向けの mount()
 *
 * README の 3 つの手順 (CSS を 1 回だけ入れる、HTML を差し込む、グリッドの基線を補正する) を
 * 1 つの呼び出しにまとめる。
 */

import type { SKAMDocument } from '@kanbun-skam/skam';
import { calibrateGridBaseline } from './calibrate.js';
import { render, type RenderOptions } from './renderer.js';

const STYLE_MARKER_ATTRIBUTE = 'data-skam-css';
const FONTS_CALIBRATION_WARNING = 'skam mount: calibrateGridBaseline failed after fonts loaded';

export interface MountOptions extends RenderOptions {
  /** 新しく入れる <style> の nonce。インラインの style 属性には効かない */
  nonce?: string;
  /**
   * Trusted Types の policy。渡すと innerHTML に `createHTML` の戻り値を入れる。
   * 渡した policy の `createHTML` が何をするか (素通しか、検査するか) は利用者の責任である。
   */
  trustedTypesPolicy?: { createHTML(input: string): unknown };
}

export interface MountResult {
  html: string;
  css: string;
  /** フォントの読み込みの後の 2 回目の補正が終わったら解決する。reject しない */
  fontsCalibrated: Promise<void>;
}

const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;

/** CSS を入れる先。グローバルの document ではなく、container が属する root で決める。 */
function resolveStyleParent(container: HTMLElement): ParentNode {
  const root = container.getRootNode();
  if (root.nodeType === DOCUMENT_NODE) {
    const ownerDocument = root as Document;
    return ownerDocument.head ?? ownerDocument.documentElement;
  }
  if (root.nodeType === DOCUMENT_FRAGMENT_NODE) {
    return root as ShadowRoot;
  }
  // isConnected の検査を通った後なので、通常ここには来ない
  throw new TypeError('skam mount: container must be connected to a document or shadow root');
}

/**
 * 判定は DOM だけで行う。モジュールの中に記録を持つと、html-renderer のコピーが複数あるページで
 * <style> が重複する。nonce を渡されたときは、同じ nonce の <style> だけを使い回す
 * (nonce なしで入れた <style> が CSP で止められていても、効く CSS が入るようにするため)。
 */
function ensureStyle(container: HTMLElement, css: string, nonce: string | undefined): void {
  const parent = resolveStyleParent(container);
  const existing = Array.from(
    parent.querySelectorAll<HTMLStyleElement>(`style[${STYLE_MARKER_ATTRIBUTE}]`)
  ).some((style) => style.textContent === css && (nonce === undefined || style.nonce === nonce));
  if (existing) return;

  const style = container.ownerDocument.createElement('style');
  style.setAttribute(STYLE_MARKER_ATTRIBUTE, '');
  if (nonce !== undefined) style.nonce = nonce;
  style.textContent = css;
  parent.appendChild(style);
}

function calibrateAfterFonts(container: HTMLElement, variablePrefix: string): Promise<void> {
  const fonts = (container.ownerDocument as Document & { fonts?: { ready: Promise<unknown> } })
    .fonts;
  if (!fonts) return Promise.resolve();
  // 1 回目の補正がレイアウトを起こしてフォントの読み込みが始まった後で読む
  return Promise.resolve(fonts.ready)
    .then(() => {
      if (container.isConnected) calibrateGridBaseline(container, { variablePrefix });
    })
    .catch((error: unknown) => {
      console.warn(FONTS_CALIBRATION_WARNING, error);
    });
}

/**
 * SKAM の文書を light DOM の container に描く。
 *
 * CSS を (同じ root に 1 回だけ) 入れ、HTML を差し込み、直後とフォントの読み込みの後に
 * グリッドの基線を補正する。Web フォントの読み込みと CSS 変数の上書きはしない。
 *
 * @throws TypeError container が document / shadow root に接続されていないとき、
 *   または Trusted Types が必須のページで `trustedTypesPolicy` を渡さなかったとき
 *   (後者は CSS を入れた後に投げる)
 *
 * @experimental 0.x の minor で変わりうる。
 */
export function mount(
  container: HTMLElement,
  doc: SKAMDocument,
  options: MountOptions = {}
): MountResult {
  if (!container.isConnected) {
    throw new TypeError('skam mount: container must be connected to a document or shadow root');
  }

  const { nonce, trustedTypesPolicy } = options;
  const { html, css } = render(doc, options);
  // DOM を変える前に作る。createHTML が投げても container と head は変わらない
  const htmlToInsert = trustedTypesPolicy ? trustedTypesPolicy.createHTML(html) : html;

  ensureStyle(container, css, nonce);

  // TrustedHTML の型は DOM の型定義の版で違うため、代入の箇所だけで型を合わせる
  container.innerHTML = htmlToInsert as string;

  const variablePrefix = options.variablePrefix ?? 'skam';
  calibrateGridBaseline(container, { variablePrefix });

  return { html, css, fontsCalibrated: calibrateAfterFonts(container, variablePrefix) };
}

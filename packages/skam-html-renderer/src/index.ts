/**
 * @kanbun-skam/skam-html
 *
 * SKAM to HTML renderer - SKAMドキュメントから静的HTMLを生成
 */

export {
  render,
  renderHTML,
  generateCSS,
  type RenderOptions,
  type RenderHTMLOptions,
  type CSSOptions,
  type RenderResult,
} from './renderer.js';

export {
  PROFILES,
  RENDER_PROFILE_KEYS,
  SKAMRenderProfileError,
  resolveRenderProfile,
  type RenderProfile,
  type RenderProfileErrorKind,
  type RenderProfileInput,
  type RenderProfileKey,
  type RenderProfileName,
  type CopyableElement,
  type RubyMethod,
} from './render-config.js';

export type { AccessibleLabels, Spacing, SpacingPreset } from '@kanbun-skam/skam/rendering';

export { getDefaultStyles, type StyleOptions } from './styles.js';

/**
 * Interactive event handlers for browser environment.
 * These APIs require DOM and are browser-only.
 *
 * @remarks
 * ブラウザ環境専用のインタラクティブイベントハンドラ。
 * Node.js環境では使用できません。
 */
export {
  attachInteractiveHandlers,
  getTokenElementsInRange,
  getAllSelectableElements,
  type InteractiveCallbacks,
} from './interactive.js';

/**
 * Runtime calibration for inline-grid baseline alignment.
 * Browser-only: call once after page load to detect and compensate
 * for the inline-grid vertical-align bug in vertical writing mode.
 */
export { calibrateGridBaseline } from './calibrate.js';

/**
 * Option validation used by the renderer's public entry points.
 * Exposed so wrappers (e.g. web components) can validate user-supplied values before use.
 */
export { validateRenderOptions, validateCSSOptions } from './render-options.js';

/**
 * Render into a light DOM container: inserts the CSS once per root, the HTML, and calibrates
 * the grid baseline right away and again after fonts load. Browser-only.
 */
export { mount, type MountOptions, type MountResult } from './mount.js';

/**
 * Sets the values of an `inlineStyles: false` HTML through the CSSOM (no inline style attributes,
 * so a nonce-only `style-src` does not block them). Browser-only.
 */
export { applyRenderedStyles } from './style-data.js';

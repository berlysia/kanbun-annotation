/**
 * @kanbun/skam-html
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
  type RenderProfile,
  type CopyableElement,
  type RubyMethod,
} from './render-config.js';

export type { Spacing, SpacingPreset } from '@kanbun/skam/rendering';

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
  setSelectionClasses,
  clearSelection,
  selectToken,
  type InteractiveCallbacks,
} from './interactive.js';

/**
 * Runtime calibration for inline-grid baseline alignment.
 * Browser-only: call once after page load to detect and compensate
 * for the inline-grid vertical-align bug in vertical writing mode.
 */
export { calibrateGridBaseline } from './calibrate.js';

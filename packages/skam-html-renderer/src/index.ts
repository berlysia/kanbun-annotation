/**
 * @kanbun/skam-html
 *
 * SKAM to HTML renderer - SKAMドキュメントから静的HTMLを生成
 */

export {
  render,
  renderHTML,
  generateCSS,
  PROFILES,
  type RenderProfile,
  type RenderOptions,
  type RenderHTMLOptions,
  type CSSOptions,
  type RenderResult,
  type CopyableElement,
} from './renderer.js';

export { getDefaultStyles, type StyleOptions } from './styles.js';

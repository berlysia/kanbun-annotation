/**
 * @kanbun-skam/skam-web-component
 *
 * <skam-renderer> カスタムエレメント
 * 利用側で customElements.define('skam-renderer', SkamRendererElement) を呼ぶこと。
 */

import './types.js';

export { SkamRendererElement } from './skam-renderer.js';
export type { AttributeValues } from './attribute-map.js';
export { SKAM_XML_MEDIA_TYPE } from './xml-extraction.js';

/**
 * @kanbun/skam-web-component
 *
 * <skam-renderer> カスタムエレメント
 * import するだけで自動的に customElements に登録される。
 */

import './types.js';
import { SkamRendererElement } from './skam-renderer.js';

export { SkamRendererElement } from './skam-renderer.js';
export type { AttributeValues } from './attribute-map.js';

// Auto-register the custom element
if (typeof customElements !== 'undefined' && !customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

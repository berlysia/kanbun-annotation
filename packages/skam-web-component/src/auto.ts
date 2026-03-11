/**
 * 自動登録エンドポイント
 *
 * import '@kanbun-skam/skam-web-component/auto' で <skam-renderer> を自動登録する。
 * 明示的に define したい場合は '@kanbun-skam/skam-web-component' から SkamRendererElement をインポートすること。
 */

import { SkamRendererElement } from './skam-renderer.js';

if (!customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

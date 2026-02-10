import type { SkamRendererElement } from './skam-renderer.js';

declare global {
  interface HTMLElementTagNameMap {
    'skam-renderer': SkamRendererElement;
  }
}

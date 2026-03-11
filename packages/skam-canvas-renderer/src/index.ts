/**
 * @kanbun-skam/skam-canvas-renderer
 *
 * SKAM to Canvas renderer - SKAMドキュメントからCanvas描画を生成
 */

// Main API
export { render, measure } from './renderer.js';
export { loadDefaultFont, DEFAULT_FONT_FAMILY } from './font-loader.js';

// Profiles
export { PROFILES } from './profiles.js';
export type { RenderProfile } from './profiles.js';

// Types
export type {
  CanvasRenderOptions,
  MeasureOptions,
  DocumentDimensions,
  PaddingConfig,
} from './types.js';

export type {
  CanvasLike,
  CanvasRenderingContext2DLike,
  TextMetricsLike,
} from './canvas-context.js';

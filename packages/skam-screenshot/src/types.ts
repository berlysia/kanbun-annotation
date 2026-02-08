import type { RenderOptions } from '@kanbun/skam-html-renderer';
import type { CanvasRenderOptions } from '@kanbun/skam-canvas-renderer';

/** Playwright supported browser engines */
export type Browser = 'chromium' | 'firefox' | 'webkit';

/** Supported screenshot image formats (Playwright's page.screenshot supports png and jpeg only) */
export type ImageFormat = 'png' | 'jpeg';

/** Renderer type selector */
export type RendererType = 'html' | 'canvas';

export interface Viewport {
  width: number;
  height: number;
}

/** Options for capture(doc, options?) — from SKAMDocument */
export interface CaptureOptions {
  browsers?: Browser[];
  viewport?: Viewport;
  format?: ImageFormat;
  fullPage?: boolean;
  /** Device scale factor (default: 2 for Retina-quality output) */
  scale?: number;
  renderOptions?: RenderOptions;
}

/** Options for captureHTML(html, css, options?) — from pre-rendered HTML */
export interface CaptureHTMLOptions {
  browsers?: Browser[];
  viewport?: Viewport;
  format?: ImageFormat;
  fullPage?: boolean;
  /** Device scale factor (default: 2 for Retina-quality output) */
  scale?: number;
}

/** Options for captureCanvas(doc, options?) — from SKAMDocument via Canvas renderer */
export interface CaptureCanvasOptions {
  browsers?: Browser[];
  viewport?: Viewport;
  format?: ImageFormat;
  fullPage?: boolean;
  /** Device scale factor (default: 2 for Retina-quality output) */
  scale?: number;
  canvasRenderOptions?: CanvasRenderOptions;
}

/** Options for generateCompareHTML(screenshots, options?) */
export interface CompareHTMLOptions {
  title?: string;
}

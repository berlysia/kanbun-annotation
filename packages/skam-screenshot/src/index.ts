export type {
  Browser,
  ImageFormat,
  Viewport,
  RendererType,
  CaptureOptions,
  CaptureHTMLOptions,
  CaptureCanvasOptions,
  CompareHTMLOptions,
} from './types.js';

export { capture, captureHTML, captureCanvas } from './capture.js';
export { generateCompareHTML } from './compare-html.js';
export { getDefaultBrowsers } from './platform.js';

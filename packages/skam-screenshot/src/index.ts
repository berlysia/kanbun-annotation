export type {
  Browser,
  ImageFormat,
  Viewport,
  CaptureOptions,
  CaptureHTMLOptions,
  CompareHTMLOptions,
} from './types.js';

export { capture, captureHTML } from './capture.js';
export { generateCompareHTML } from './compare-html.js';
export { getDefaultBrowsers } from './platform.js';

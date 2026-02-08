/**
 * Canvas コンテキスト抽象化
 *
 * CanvasRenderingContext2D のサブセットインターフェース。
 * ブラウザ Canvas, OffscreenCanvas, node-canvas すべてがネイティブ適合するためアダプタ不要。
 */

/**
 * TextMetrics のサブセット。
 * width のみ必須。actualBoundingBox* は利用可能なら使用し、なければ fontSize からフォールバック。
 */
export interface TextMetricsLike {
  readonly width: number;
  readonly actualBoundingBoxAscent?: number;
  readonly actualBoundingBoxDescent?: number;
}

/**
 * CanvasRenderingContext2D のサブセットインターフェース
 */
export interface CanvasRenderingContext2DLike {
  font: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  textBaseline: string;
  textAlign: string;
  globalAlpha: number;

  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): TextMetricsLike;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  stroke(): void;
  fill(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  setLineDash(segments: number[]): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Canvas 要素の抽象化
 */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: '2d'): CanvasRenderingContext2DLike | null;
}

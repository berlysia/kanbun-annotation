/**
 * RecordingContext - テスト用 Canvas コンテキスト
 *
 * draw call を記録し、measureText() は決定論的な値を返す。
 */

import type {
  CanvasRenderingContext2DLike,
  TextMetricsLike,
  CanvasLike,
} from '../canvas-context.js';

export interface DrawCall {
  method: string;
  args: unknown[];
}

interface SavedState {
  font: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  textBaseline: string;
  textAlign: string;
  globalAlpha: number;
}

/** CJK 統合漢字の範囲 */
function isCJK(code: number): boolean {
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}

/** ひらがな・カタカナの範囲 */
function isKana(code: number): boolean {
  return code >= 0x3040 && code <= 0x30ff;
}

export class RecordingContext implements CanvasRenderingContext2DLike {
  readonly calls: DrawCall[] = [];

  font: string = '24px serif';
  fillStyle: string = '#000';
  strokeStyle: string = '#000';
  lineWidth: number = 1;
  textBaseline: string = 'alphabetic';
  textAlign: string = 'start';
  globalAlpha: number = 1;

  private stateStack: SavedState[] = [];

  fillText(text: string, x: number, y: number): void {
    this.calls.push({ method: 'fillText', args: [text, x, y] });
  }

  strokeText(text: string, x: number, y: number): void {
    this.calls.push({ method: 'strokeText', args: [text, x, y] });
  }

  measureText(text: string): TextMetricsLike {
    const fontSize = this.parseFontSize();
    const width = this.calculateWidth(text, fontSize);
    return {
      width,
      actualBoundingBoxAscent: fontSize * 0.8,
      actualBoundingBoxDescent: fontSize * 0.2,
    };
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ method: 'fillRect', args: [x, y, w, h] });
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ method: 'strokeRect', args: [x, y, w, h] });
  }

  beginPath(): void {
    this.calls.push({ method: 'beginPath', args: [] });
  }

  moveTo(x: number, y: number): void {
    this.calls.push({ method: 'moveTo', args: [x, y] });
  }

  lineTo(x: number, y: number): void {
    this.calls.push({ method: 'lineTo', args: [x, y] });
  }

  arc(x: number, y: number, r: number, start: number, end: number): void {
    this.calls.push({ method: 'arc', args: [x, y, r, start, end] });
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.calls.push({ method: 'quadraticCurveTo', args: [cpx, cpy, x, y] });
  }

  stroke(): void {
    this.calls.push({ method: 'stroke', args: [] });
  }

  fill(): void {
    this.calls.push({ method: 'fill', args: [] });
  }

  save(): void {
    this.stateStack.push({
      font: this.font,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      textBaseline: this.textBaseline,
      textAlign: this.textAlign,
      globalAlpha: this.globalAlpha,
    });
    this.calls.push({ method: 'save', args: [] });
  }

  restore(): void {
    const state = this.stateStack.pop();
    if (state) {
      this.font = state.font;
      this.fillStyle = state.fillStyle;
      this.strokeStyle = state.strokeStyle;
      this.lineWidth = state.lineWidth;
      this.textBaseline = state.textBaseline;
      this.textAlign = state.textAlign;
      this.globalAlpha = state.globalAlpha;
    }
    this.calls.push({ method: 'restore', args: [] });
  }

  translate(x: number, y: number): void {
    this.calls.push({ method: 'translate', args: [x, y] });
  }

  rotate(angle: number): void {
    this.calls.push({ method: 'rotate', args: [angle] });
  }

  scale(x: number, y: number): void {
    this.calls.push({ method: 'scale', args: [x, y] });
  }

  setLineDash(segments: number[]): void {
    this.calls.push({ method: 'setLineDash', args: [segments] });
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.calls.push({ method: 'clearRect', args: [x, y, w, h] });
  }

  // ---- Helpers ----

  reset(): void {
    this.calls.length = 0;
    this.stateStack.length = 0;
    this.font = '24px serif';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.textBaseline = 'alphabetic';
    this.textAlign = 'start';
    this.globalAlpha = 1;
  }

  getCalls(method: string): DrawCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  private parseFontSize(): number {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return match ? Number(match[1]) : 24;
  }

  private calculateWidth(text: string, fontSize: number): number {
    let width = 0;
    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      if (isCJK(code)) {
        width += fontSize;
      } else if (isKana(code)) {
        width += fontSize * 0.5;
      } else {
        width += fontSize * 0.5;
      }
    }
    return width;
  }
}

export class RecordingCanvas implements CanvasLike {
  width: number;
  height: number;
  private ctx: RecordingContext;

  constructor(width = 800, height = 600) {
    this.width = width;
    this.height = height;
    this.ctx = new RecordingContext();
  }

  getContext(_contextId: '2d'): RecordingContext {
    return this.ctx;
  }
}

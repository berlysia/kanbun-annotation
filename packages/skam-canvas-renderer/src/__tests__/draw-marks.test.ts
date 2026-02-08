import { describe, it, expect } from 'vitest';
import { drawHighlightLine } from '../draw-marks.js';
import { RecordingContext } from './recording-context.js';
import type { HighlightLineLayout } from '../types.js';

function makeLayout(
  style: HighlightLineLayout['style'],
  x = 50,
  yStart = 10,
  yEnd = 100
): HighlightLineLayout {
  return { style, x, yStart, yEnd };
}

describe('drawHighlightLine', () => {
  it('draws solid line with moveTo + lineTo + stroke', () => {
    const ctx = new RecordingContext();
    drawHighlightLine(ctx, makeLayout('solid'), '#000');

    expect(ctx.getCalls('save')).toHaveLength(1);
    expect(ctx.getCalls('restore')).toHaveLength(1);
    expect(ctx.getCalls('beginPath')).toHaveLength(1);
    expect(ctx.getCalls('moveTo')).toHaveLength(1);
    expect(ctx.getCalls('lineTo')).toHaveLength(1);
    expect(ctx.getCalls('stroke')).toHaveLength(1);

    const moveTo = ctx.getCalls('moveTo')[0]!;
    expect(moveTo.args).toEqual([50, 10]);
    const lineTo = ctx.getCalls('lineTo')[0]!;
    expect(lineTo.args).toEqual([50, 100]);
  });

  it('draws dashed line with setLineDash', () => {
    const ctx = new RecordingContext();
    drawHighlightLine(ctx, makeLayout('dashed'), '#000');

    const setLineDashCalls = ctx.getCalls('setLineDash');
    expect(setLineDashCalls).toHaveLength(2);
    // First: set dash pattern
    expect(setLineDashCalls[0]!.args).toEqual([[6, 4]]);
    // Second: reset
    expect(setLineDashCalls[1]!.args).toEqual([[]]);
    expect(ctx.getCalls('stroke')).toHaveLength(1);
  });

  it('draws dotted line with setLineDash', () => {
    const ctx = new RecordingContext();
    drawHighlightLine(ctx, makeLayout('dotted'), '#000');

    const setLineDashCalls = ctx.getCalls('setLineDash');
    expect(setLineDashCalls).toHaveLength(2);
    expect(setLineDashCalls[0]!.args).toEqual([[1, 3]]);
    expect(setLineDashCalls[1]!.args).toEqual([[]]);
    expect(ctx.getCalls('stroke')).toHaveLength(1);
  });

  it('draws wavy line with quadraticCurveTo', () => {
    const ctx = new RecordingContext();
    drawHighlightLine(ctx, makeLayout('wavy'), '#000');

    expect(ctx.getCalls('quadraticCurveTo').length).toBeGreaterThan(0);
    expect(ctx.getCalls('stroke')).toHaveLength(1);
  });

  it('draws double line with 2 beginPath + stroke pairs', () => {
    const ctx = new RecordingContext();
    drawHighlightLine(ctx, makeLayout('double'), '#000');

    expect(ctx.getCalls('beginPath')).toHaveLength(2);
    expect(ctx.getCalls('moveTo')).toHaveLength(2);
    expect(ctx.getCalls('lineTo')).toHaveLength(2);
    expect(ctx.getCalls('stroke')).toHaveLength(2);

    // First line offset to left, second to right
    const moveToCalls = ctx.getCalls('moveTo');
    expect(moveToCalls[0]!.args[0] as number).toBeLessThan(50);
    expect(moveToCalls[1]!.args[0] as number).toBeGreaterThan(50);
  });

  it('sets stroke color and restores context', () => {
    const ctx = new RecordingContext();
    ctx.strokeStyle = 'blue';
    drawHighlightLine(ctx, makeLayout('solid'), 'red');

    // After restore, strokeStyle should revert to original
    expect(ctx.strokeStyle).toBe('blue');
  });
});

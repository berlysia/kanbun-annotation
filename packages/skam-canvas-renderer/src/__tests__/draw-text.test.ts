import { describe, it, expect } from 'vitest';
import { getVerticalForm, drawVerticalText } from '../draw-text.js';
import { RecordingContext } from './recording-context.js';

describe('getVerticalForm', () => {
  it('returns vertical form for fullwidth parentheses', () => {
    expect(getVerticalForm('（')).toBe('︵');
    expect(getVerticalForm('）')).toBe('︶');
  });

  it('returns vertical form for CJK corner brackets', () => {
    expect(getVerticalForm('「')).toBe('﹁');
    expect(getVerticalForm('」')).toBe('﹂');
    expect(getVerticalForm('『')).toBe('﹃');
    expect(getVerticalForm('』')).toBe('﹄');
  });

  it('returns vertical form for other CJK brackets', () => {
    expect(getVerticalForm('【')).toBe('︻');
    expect(getVerticalForm('】')).toBe('︼');
    expect(getVerticalForm('〈')).toBe('︿');
    expect(getVerticalForm('〉')).toBe('﹀');
    expect(getVerticalForm('《')).toBe('︽');
    expect(getVerticalForm('》')).toBe('︾');
    expect(getVerticalForm('〔')).toBe('︹');
    expect(getVerticalForm('〕')).toBe('︺');
  });

  it('returns undefined for non-bracket characters', () => {
    expect(getVerticalForm('あ')).toBeUndefined();
    expect(getVerticalForm('子')).toBeUndefined();
    expect(getVerticalForm('イ')).toBeUndefined();
    expect(getVerticalForm('1')).toBeUndefined();
  });

  it('returns undefined for halfwidth brackets', () => {
    expect(getVerticalForm('(')).toBeUndefined();
    expect(getVerticalForm(')')).toBeUndefined();
    expect(getVerticalForm('[')).toBeUndefined();
    expect(getVerticalForm(']')).toBeUndefined();
  });

  it('returns undefined for CJK punctuation (handled by kutoten)', () => {
    expect(getVerticalForm('。')).toBeUndefined();
    expect(getVerticalForm('、')).toBeUndefined();
  });
});

describe('drawVerticalText with brackets', () => {
  it('substitutes vertical forms for fullwidth brackets', () => {
    const ctx = new RecordingContext();
    const fontSize = 24;
    drawVerticalText(ctx, '（イ）', 100, 0, fontSize, '#000', 'serif');

    const fillTextCalls = ctx.calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls).toHaveLength(3);
    // Brackets are replaced with vertical presentation forms
    expect(fillTextCalls[0]!.args[0]).toBe('︵');
    expect(fillTextCalls[1]!.args[0]).toBe('イ');
    expect(fillTextCalls[2]!.args[0]).toBe('︶');
  });

  it('does not substitute for plain CJK text', () => {
    const ctx = new RecordingContext();
    drawVerticalText(ctx, '子曰', 100, 0, 24, '#000', 'serif');

    const fillTextCalls = ctx.calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls).toHaveLength(2);
    expect(fillTextCalls[0]!.args[0]).toBe('子');
    expect(fillTextCalls[1]!.args[0]).toBe('曰');

    // No rotate/translate calls
    const rotateCalls = ctx.calls.filter((c) => c.method === 'rotate');
    expect(rotateCalls).toHaveLength(0);
  });
});

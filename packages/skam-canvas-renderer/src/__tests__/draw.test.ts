import { describe, it, expect } from 'vitest';
import { draw } from '../draw.js';
import { resolveOptions } from '../layout.js';
import { RecordingContext } from './recording-context.js';
import type {
  DocumentLayout,
  TokenLayout,
  TatetenSeparatorLayout,
  HighlightLineLayout,
  ResolvedSlotLayouts,
} from '../types.js';
import { KAERI } from '@kanbun/skam';

function createSimpleLayout(tokens: Partial<TokenLayout>[]): DocumentLayout {
  return {
    width: 200,
    height: 400,
    columns: [
      {
        x: 100,
        y: 16,
        width: 48,
        height: 368,
        children: tokens.map((t, i) => ({
          type: 'token' as const,
          tokenId: `t${i + 1}`,
          x: 100,
          y: 16 + i * 48,
          baseChar: t.baseChar ?? '學',
          slots: (t.slots ?? {}) as ResolvedSlotLayouts,
          ...t,
        })),
      },
    ],
  };
}

describe('draw', () => {
  it('draws single base character', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([{ baseChar: '學' }]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    expect(fillTexts.length).toBeGreaterThanOrEqual(1);
    // First fillText should be the base character
    expect(fillTexts[0]!.args[0]).toBe('學');
  });

  it('draws background when backgroundColor is set', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([{ baseChar: '學' }]);
    const options = resolveOptions({ backgroundColor: '#fff' });

    draw(ctx, docLayout, options);

    const fillRects = ctx.getCalls('fillRect');
    expect(fillRects.length).toBeGreaterThanOrEqual(1);
    // First fillRect should be the background
    expect(fillRects[0]!.args).toEqual([0, 0, 200, 400]);
  });

  it('does not draw background when transparent', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([{ baseChar: '學' }]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillRects = ctx.getCalls('fillRect');
    expect(fillRects).toHaveLength(0);
  });

  it('draws multiple tokens in order', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      { baseChar: '子' },
      { baseChar: '曰' },
      { baseChar: '學' },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const baseChars = fillTexts.map((c) => c.args[0]);
    // Base characters appear in order
    expect(baseChars[0]).toBe('子');
    expect(baseChars[1]).toBe('曰');
    expect(baseChars[2]).toBe('學');
  });

  it('draws ruby slot', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      {
        baseChar: '學',
        slots: {
          ruby: { text: 'まな', x: 120, y: 16, fontSize: 12 },
        },
      },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    // Should contain base char + ruby chars
    expect(texts).toContain('學');
    expect(texts).toContain('ま');
    expect(texts).toContain('な');
  });

  it('draws okurigana slot', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      {
        baseChar: '學',
        slots: {
          okuri: { text: 'ぶ', x: 80, y: 16, fontSize: 12 },
        },
      },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain('ぶ');
  });

  it('draws kaeri slot with Unicode character', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      {
        baseChar: '曰',
        slots: {
          kaeri: { text: KAERI.RE, x: 70, y: 20, fontSize: 12 },
        },
      },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain(KAERI.RE);
  });

  it('draws kutoten slot', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      {
        baseChar: '學',
        slots: {
          kutoten: { text: '。', x: 80, y: 40, fontSize: 24 },
        },
      },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain('。');
  });

  it('draws all 5 mark types', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      {
        baseChar: '學',
        slots: {
          ruby: { text: 'まな', x: 120, y: 16, fontSize: 12 },
          okuri: { text: 'ぶ', x: 80, y: 16, fontSize: 12 },
          soegana: { text: 'は', x: 80, y: 28, fontSize: 12 },
          kaeri: { text: KAERI.ICHI + KAERI.RE, x: 70, y: 16, fontSize: 12 },
          kutoten: { text: '。', x: 80, y: 40, fontSize: 24 },
        },
      },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain('學');
    expect(texts).toContain('ま');
    expect(texts).toContain('な');
    expect(texts).toContain('ぶ');
    expect(texts).toContain('は');
    expect(texts).toContain(KAERI.ICHI);
    expect(texts).toContain(KAERI.RE);
    expect(texts).toContain('。');
  });

  it('draws emphasis slot', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      {
        baseChar: '學',
        slots: {
          emphasis: { text: '\uFE45', x: 120, y: 16, fontSize: 12 },
        },
      },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain('\uFE45');
  });

  it('draws saidokuUnder and saidokuOkuri2 slots', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      {
        baseChar: '將',
        slots: {
          ruby: { text: 'まさ', x: 120, y: 16, fontSize: 12 },
          okuri: { text: 'に', x: 120, y: 40, fontSize: 12 },
          saidokuUnder: { text: 'はた', x: 50, y: 16, fontSize: 12 },
          saidokuOkuri2: { text: 'す', x: 50, y: 40, fontSize: 12 },
        },
      },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain('は');
    expect(texts).toContain('た');
    expect(texts).toContain('す');
  });

  it('save/restore calls are balanced', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      {
        baseChar: '學',
        slots: {
          ruby: { text: 'まな', x: 120, y: 16, fontSize: 12 },
        },
      },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const saves = ctx.getCalls('save').length;
    const restores = ctx.getCalls('restore').length;
    expect(saves).toBe(restores);
    expect(saves).toBeGreaterThan(0);
  });

  it('draws tateten separator character U+3190', () => {
    const ctx = new RecordingContext();
    const sep: TatetenSeparatorLayout = {
      type: 'tateten-separator',
      x: 100,
      y: 64,
      fontSize: 12,
    };
    const docLayout: DocumentLayout = {
      width: 200,
      height: 400,
      columns: [
        {
          x: 100,
          y: 16,
          width: 48,
          height: 368,
          children: [
            {
              type: 'token' as const,
              tokenId: 't1',
              x: 100,
              y: 16,
              baseChar: '而',
              slots: {} as ResolvedSlotLayouts,
            },
            sep,
            {
              type: 'token' as const,
              tokenId: 't2',
              x: 100,
              y: 100,
              baseChar: '已',
              slots: {} as ResolvedSlotLayouts,
            },
          ],
        },
      ],
    };
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain('\u3190');
    expect(texts).toContain('而');
    expect(texts).toContain('已');
  });

  it('draws tateten separator kaeri slot', () => {
    const ctx = new RecordingContext();
    const sep: TatetenSeparatorLayout = {
      type: 'tateten-separator',
      x: 100,
      y: 64,
      fontSize: 12,
      kaeri: { text: KAERI.ICHI, x: 70, y: 64, fontSize: 12 },
    };
    const docLayout: DocumentLayout = {
      width: 200,
      height: 400,
      columns: [
        {
          x: 100,
          y: 16,
          width: 48,
          height: 368,
          children: [sep],
        },
      ],
    };
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain('\u3190');
    expect(texts).toContain(KAERI.ICHI);
  });

  it('draws ref slot on token', () => {
    const ctx = new RecordingContext();
    const docLayout = createSimpleLayout([
      {
        baseChar: '學',
        slots: {
          ref: { text: '※', x: 100, y: 4, fontSize: 12 },
        },
      },
    ]);
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain('學');
    expect(texts).toContain('※');
  });

  it('draws highlight-ref label from refLayout', () => {
    const ctx = new RecordingContext();
    const hl: HighlightLineLayout = {
      style: 'solid',
      x: 14,
      yStart: 16,
      yEnd: 112,
      refLayout: { text: '注', x: 14, y: 4, fontSize: 12 },
    };
    const docLayout: DocumentLayout = {
      width: 200,
      height: 400,
      columns: [
        {
          x: 100,
          y: 16,
          width: 48,
          height: 368,
          children: [
            {
              type: 'token' as const,
              tokenId: 't1',
              x: 100,
              y: 16,
              baseChar: '子',
              slots: {} as ResolvedSlotLayouts,
            },
          ],
          highlightLines: [hl],
        },
      ],
    };
    const options = resolveOptions();

    draw(ctx, docLayout, options);

    const fillTexts = ctx.getCalls('fillText');
    const texts = fillTexts.map((c) => c.args[0]);
    expect(texts).toContain('注');
    // Also verify highlight line was drawn
    expect(ctx.getCalls('stroke')).toHaveLength(1);
  });
});

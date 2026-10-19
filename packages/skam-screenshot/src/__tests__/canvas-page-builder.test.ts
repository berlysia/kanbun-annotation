import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises and module resolution before importing the module
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('/* IIFE bundle content */'),
}));

vi.mock('node:module', () => ({
  createRequire: () => ({
    resolve: () => '/mocked/path/to/dist/index.iife.js',
  }),
}));

const { buildCanvasPage, collectFontSampleText } = await import('../canvas-page-builder.js');
const { resolveEmphasisCharacter } = await import('@kanbun-skam/skam/rendering');

const MINIMAL_DOC = {
  format: 'skam@0.1' as const,
  tokens: [{ id: 't1', text: '子' }],
  blocks: [{ id: 'b1', tokenIds: ['t1'] }],
  marks: [],
  derivations: [],
  readings: [],
};

type CanvasRenderOptions = NonNullable<Parameters<typeof buildCanvasPage>[1]>;

/** 生成したページから、id を持つ JSON の script 要素の中身を取り出す */
function extractJsonScript(page: string, id: string): string {
  const open = `<script type="application/json" id="${id}">`;
  const from = page.indexOf(open);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = page.indexOf('</script>', from);
  expect(to).toBeGreaterThan(from);
  return page.slice(from + open.length, to);
}

describe('buildCanvasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should produce a valid HTML document with canvas element', async () => {
    const result = await buildCanvasPage(MINIMAL_DOC);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<meta charset="UTF-8">');
    expect(result).toContain('<canvas id="skam-canvas">');
  });

  it('should embed the IIFE bundle script', async () => {
    const result = await buildCanvasPage(MINIMAL_DOC);

    expect(result).toContain('/* IIFE bundle content */');
  });

  it('should embed document JSON in a script tag', async () => {
    const result = await buildCanvasPage(MINIMAL_DOC);

    expect(result).toContain('<script type="application/json" id="skam-doc">');
    expect(result).toContain('"tokens"');
    expect(result).toContain('"t1"');
  });

  it('should embed options JSON in a script tag', async () => {
    const options = { fontSize: 24, backgroundColor: '#fff' };
    const result = await buildCanvasPage(MINIMAL_DOC, options);

    expect(result).toContain('<script type="application/json" id="skam-options">');
    expect(result).toContain('"fontSize":24');
    expect(result).toContain('"backgroundColor":"#fff"');
  });

  it('should include Google Fonts link', async () => {
    const result = await buildCanvasPage(MINIMAL_DOC);

    expect(result).toContain('fonts.googleapis.com');
    expect(result).toContain('Noto+Serif+JP');
  });

  it('should include render script with __skamCanvasReady and __skamCanvasError handling', async () => {
    const result = await buildCanvasPage(MINIMAL_DOC);

    expect(result).toContain('__skamCanvasReady');
    expect(result).toContain('__skamCanvasError');
    expect(result).toContain('SKAMCanvasRenderer');
    expect(result).toContain('loadDefaultFont');
    expect(result).toContain('document.fonts.ready');
  });

  it('should escape </script> in JSON to prevent injection', async () => {
    const docWithScript = {
      ...MINIMAL_DOC,
      tokens: [{ id: 't1', text: '</script>' }],
    };
    const result = await buildCanvasPage(docWithScript);

    const docBody = extractJsonScript(result, 'skam-doc');
    expect(docBody).not.toContain('</script>');
    expect(JSON.parse(docBody).tokens[0].text).toBe('</script>');
  });

  it('round-trips hostile doc and options through the embedded JSON', async () => {
    const doc = {
      ...MINIMAL_DOC,
      tokens: [
        { id: 't1', text: '<!--<script>' },
        { id: 't2', text: 'a\\<b-->\u2028' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        { type: 'ref', anchor: { from: 't1', to: 't1' }, label: 'x', content: '</script><b>' },
      ],
    } as unknown as SampleDoc;
    const options = { fontFamily: '</script><!--' } as unknown as CanvasRenderOptions;
    const page = await buildCanvasPage(doc, options);

    const docBody = extractJsonScript(page, 'skam-doc');
    const optionsBody = extractJsonScript(page, 'skam-options');
    const sampleBody = extractJsonScript(page, 'skam-font-sample');
    expect(JSON.parse(docBody)).toEqual(doc);
    expect(JSON.parse(optionsBody)).toEqual(options);
    expect(JSON.parse(sampleBody)).toBe(collectFontSampleText(doc));
    for (const body of [docBody, optionsBody, sampleBody]) {
      expect(body).not.toContain('<');
    }
    // 5 script elements: bundle, 3 JSON, the final page script
    expect(page.match(/<\/script/g)).toHaveLength(5);
  });

  it('the canvas-renderer browser bundle contains no </script', async () => {
    const { readFile: realReadFile } =
      await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const { createRequire: realCreateRequire } =
      await vi.importActual<typeof import('node:module')>('node:module');
    const bundlePath = realCreateRequire(import.meta.url).resolve(
      '@kanbun-skam/skam-canvas-renderer/browser-bundle'
    );
    expect(await realReadFile(bundlePath, 'utf-8')).not.toContain('</script');
  });

  it('reads the font sample from the JSON script, not from an embedded function', async () => {
    const page = await buildCanvasPage(MINIMAL_DOC);
    expect(page).toContain("getElementById('skam-font-sample')");
    expect(page).not.toContain('collectFontSampleText');
  });
});

// ============================================================================
// collectFontSampleText: フォントを読み込む文字の収集
// ============================================================================

type SampleDoc = Parameters<typeof collectFontSampleText>[0];

function docWithEmphasisStyle(style: unknown): SampleDoc {
  return {
    ...MINIMAL_DOC,
    marks: [{ type: 'emphasis', anchor: { from: 't1', to: 't1' }, style }],
  } as unknown as SampleDoc;
}

const EMPHASIS_KEYWORDS = [
  'dot',
  'filled dot',
  'open dot',
  'circle',
  'filled circle',
  'open circle',
  'double-circle',
  'filled double-circle',
  'open double-circle',
  'triangle',
  'filled triangle',
  'open triangle',
  'sesame',
  'filled sesame',
  'open sesame',
];
const CUSTOM_CHARS = [
  '\u2605',
  '\u203B',
  '\u3001',
  '\u3002',
  '\u00B1',
  '(',
  '/',
  'A',
  '1',
  '\u5929',
  '\u{1F600}',
  '\u2764',
  '\u{20BB7}',
];

describe('collectFontSampleText', () => {
  it('collects token text and mark strings', () => {
    const doc = {
      ...MINIMAL_DOC,
      marks: [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' },
        { type: 'ref', anchor: { from: 't1', to: 't1' }, label: 'ラベル', content: '内容' },
        {
          type: 'saidoku',
          anchor: { from: 't1', to: 't1' },
          forms: [{ n: 1, yomi: 'よみ', okuri: 'おくり' }],
        },
      ],
    } as unknown as SampleDoc;
    const text = collectFontSampleText(doc);
    for (const expected of ['\u5B50', 'し', 'ラベル', '内容', 'よみ', 'おくり']) {
      expect(text).toContain(expected);
    }
  });

  it('adds the custom character of an emphasis mark', () => {
    expect(collectFontSampleText(docWithEmphasisStyle('\u2605'))).toContain('\u2605');
  });

  it('adds the sesame character for style "sesame"', () => {
    expect(collectFontSampleText(docWithEmphasisStyle('sesame'))).toContain('\uFE45');
  });

  it('adds the default dot when style is absent', () => {
    const doc = {
      ...MINIMAL_DOC,
      marks: [{ type: 'emphasis', anchor: { from: 't1', to: 't1' } }],
    } as unknown as SampleDoc;
    expect(collectFontSampleText(doc)).toContain('\u2022');
  });

  it.each([
    ['number', 123],
    ['constructor', 'constructor'],
    ['__proto__', '__proto__'],
    ['Circle', 'Circle'],
  ])('falls back to the default dot for style %s without leaking prototype values', (_n, style) => {
    const text = collectFontSampleText(docWithEmphasisStyle(style));
    expect(text).toContain('\u2022');
    expect(text).not.toContain('function');
    expect(text).not.toContain('[object Object]');
  });

  it('does not add a 2 code point style but adds the default dot', () => {
    const text = collectFontSampleText(docWithEmphasisStyle('\u2605\u2605'));
    expect(text).not.toContain('\u2605');
    expect(text).toContain('\u2022');
  });

  it('does not add "<" for style "<" and uses the default dot (differs from the former looser rule)', () => {
    const text = collectFontSampleText(docWithEmphasisStyle('<'));
    expect(text).toContain('\u2022');
    expect(text).not.toContain('<');
  });

  it('does not resolve "Circle" to the filled circle', () => {
    const text = collectFontSampleText(docWithEmphasisStyle('Circle'));
    expect(text).toContain('\u2022');
    expect(text).not.toContain('\u25CF');
  });

  it.each([['\u2605\u2605'], [''], [123], [undefined], ['__proto__']])(
    'does not throw and adds the default dot for style %j',
    (style) => {
      const text = collectFontSampleText(docWithEmphasisStyle(style));
      expect(text).toContain('\u2022');
    }
  );

  it.each([['\u0000'], ['\uD800']])('does not throw for style %j', (style) => {
    expect(() => collectFontSampleText(docWithEmphasisStyle(style))).not.toThrow();
  });

  it('stays in sync with resolveEmphasisCharacter for keywords and custom characters', () => {
    for (const style of [...EMPHASIS_KEYWORDS, ...CUSTOM_CHARS]) {
      const text = collectFontSampleText(docWithEmphasisStyle(style));
      expect(text, `style ${JSON.stringify(style)}`).toContain(resolveEmphasisCharacter(style));
    }
  });
});

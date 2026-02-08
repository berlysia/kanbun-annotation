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

const { buildCanvasPage } = await import('../canvas-page-builder.js');

const MINIMAL_DOC = {
  format: 'skam@0.1' as const,
  tokens: [{ id: 't1', text: '子' }],
  blocks: [{ id: 'b1', tokenIds: ['t1'] }],
  marks: [],
  derivations: [],
  readings: [],
};

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

    // The literal </script> must be escaped as <\/script>
    expect(result).not.toMatch(
      /<script type="application\/json"[^>]*>[^<]*<\/script>[^<]*<\/script>/
    );
    expect(result).toContain('<\\/script>');
  });
});

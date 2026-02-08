import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type { RenderOptions } from '@kanbun/skam-html-renderer';
import type { Browser, ImageFormat, Viewport } from './types.js';
import { parseBrowserList, getDefaultBrowsers } from './platform.js';

const HELP = `Usage: pnpm screenshot <input-file> [options]

Arguments:
  input-file          Path to .xml (SKAM-ML) or .json (SKAMDocument) file

Options:
  -o, --output <dir>       Output directory (default: ./screenshots)
  -b, --browsers <list>    Comma-separated browser list (default: platform-dependent)
  -f, --format <fmt>       Image format: png | jpeg (default: png)
      --writing-mode <m>   vertical | horizontal
      --viewport <WxH>     Viewport size (default: 800x1200)
      --scale <n>          Device scale factor (default: 2 for Retina quality)
      --no-full-page       Capture viewport only instead of full page
      --render-options <j>  JSON string for full RenderOptions
  -h, --help               Show this help
`;

function log(msg: string): void {
  process.stderr.write(msg + '\n');
}

function parseViewport(input: string): Viewport {
  const match = /^(\d+)x(\d+)$/.exec(input);
  if (!match) {
    throw new Error(`Invalid viewport format: "${input}". Expected WIDTHxHEIGHT (e.g. 800x1200)`);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

function validateFormat(input: string): ImageFormat {
  if (input === 'png' || input === 'jpeg') {
    return input;
  }
  throw new Error(`Invalid format: "${input}". Supported: png, jpeg`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o', default: './screenshots' },
      browsers: { type: 'string', short: 'b' },
      format: { type: 'string', short: 'f', default: 'png' },
      'writing-mode': { type: 'string' },
      viewport: { type: 'string', default: '800x1200' },
      scale: { type: 'string', default: '2' },
      'full-page': { type: 'boolean', default: true },
      'render-options': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    log(HELP);
    return;
  }

  const inputFile = positionals[0];
  if (!inputFile) {
    log('Error: Input file is required.\n');
    log(HELP);
    process.exitCode = 1;
    return;
  }

  const format = validateFormat(values.format!);
  const viewport = parseViewport(values.viewport!);
  const scale = Number(values.scale);
  if (!Number.isFinite(scale) || scale < 1) {
    throw new Error(`Invalid --scale: "${values.scale}". Expected a number >= 1`);
  }
  const fullPage = values['full-page']!;
  const outputDir = resolve(values.output!);

  // Parse browsers
  let browsers: Browser[];
  if (values.browsers) {
    browsers = parseBrowserList(values.browsers);
  } else {
    browsers = getDefaultBrowsers();
  }

  // Build render options
  let renderOptions: RenderOptions = {};
  if (values['render-options']) {
    try {
      renderOptions = JSON.parse(values['render-options']) as RenderOptions;
    } catch {
      throw new Error(`Invalid --render-options JSON: ${values['render-options']}`);
    }
  }
  // Individual flags override render-options
  if (values['writing-mode']) {
    const wm = values['writing-mode'];
    if (wm !== 'vertical' && wm !== 'horizontal') {
      throw new Error(`Invalid --writing-mode: "${wm}". Expected: vertical | horizontal`);
    }
    renderOptions.writingMode = wm;
  }

  // Read and parse input file
  const inputPath = resolve(inputFile);
  const content = await readFile(inputPath, 'utf-8');
  const ext = extname(inputPath).toLowerCase();

  // Dynamic imports to avoid loading heavy modules at parse-args time
  const { isSKAMDocument } = await import('@kanbun/skam');
  const { render } = await import('@kanbun/skam-html-renderer');

  let html: string;
  let css: string;

  if (ext === '.xml') {
    const { parse } = await import('@kanbun/skam-xml-parser');
    const doc = parse(content);
    const result = render(doc, renderOptions);
    html = result.html;
    css = result.css;
  } else if (ext === '.json') {
    const data: unknown = JSON.parse(content);
    if (!isSKAMDocument(data)) {
      throw new Error(`File is not a valid SKAMDocument: ${inputPath}`);
    }
    const result = render(data, renderOptions);
    html = result.html;
    css = result.css;
  } else {
    throw new Error(`Unsupported file extension: ${ext}. Expected .xml or .json`);
  }

  // Capture
  const { captureHTML } = await import('./capture.js');
  const { generateCompareHTML } = await import('./compare-html.js');

  log(`Capturing screenshots with ${browsers.join(', ')}...`);
  const screenshots = await captureHTML(html, css, {
    browsers,
    viewport,
    format,
    fullPage,
    scale,
  });

  // Write output
  await mkdir(outputDir, { recursive: true });

  for (const [browser, buf] of screenshots) {
    const filePath = resolve(outputDir, `${browser}.${format}`);
    await writeFile(filePath, buf);
    log(`  ${browser}: ${filePath}`);
  }

  // Generate comparison HTML
  const compareHTML = generateCompareHTML(screenshots, {
    title: `SKAM Screenshot: ${inputFile}`,
  });
  const comparePath = resolve(outputDir, 'compare.html');
  await writeFile(comparePath, compareHTML);
  log(`  compare: ${comparePath}`);

  log('Done.');
}

main().catch((err: unknown) => {
  log(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

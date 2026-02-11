/**
 * Extract CSS and JS from SKAM packages for baseline checking.
 *
 * - Calls getDefaultStyles() with various option combinations
 * - Copies playground CSS
 * - Copies built JS files
 *
 * All output goes to extracted/ so lint tools can run within the base path.
 */

import { writeFileSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'extracted');
const packagesDir = join(__dirname, '..', '..');

/**
 * Strip JS-style line comments (//) from CSS content.
 * The renderer's styles.ts uses // comments in template literals,
 * which are invalid CSS and cause parse errors.
 */
function stripJsComments(css) {
  return css.replace(/^(\s*)\/\/.*$/gm, '$1/* (stripped js-style comment) */');
}

async function main() {
  mkdirSync(join(outDir, 'css'), { recursive: true });
  mkdirSync(join(outDir, 'js'), { recursive: true });

  // 1. Extract renderer-generated CSS
  const rendererPath = join(packagesDir, 'skam-html-renderer', 'dist', 'index.js');
  const { getDefaultStyles } = await import(rendererPath);

  /** @type {Array<{ name: string, options: object }>} */
  const variants = [
    { name: 'vertical-ruby', options: { writingMode: 'vertical', rubyMethod: 'ruby' } },
    { name: 'vertical-grid', options: { writingMode: 'vertical', rubyMethod: 'grid' } },
    { name: 'horizontal-ruby', options: { writingMode: 'horizontal', rubyMethod: 'ruby' } },
    { name: 'horizontal-grid', options: { writingMode: 'horizontal', rubyMethod: 'grid' } },
    { name: 'both-both', options: { writingMode: 'both', rubyMethod: 'both', inline: true } },
    { name: 'no-layer', options: { writingMode: 'vertical', useLayer: false } },
  ];

  for (const { name, options } of variants) {
    const css = stripJsComments(getDefaultStyles(options));
    const outPath = join(outDir, 'css', `renderer-${name}.css`);
    writeFileSync(outPath, css, 'utf-8');
    console.log(`Extracted: renderer-${name}.css (${css.length} bytes)`);
  }

  // 2. Copy playground CSS
  const playgroundCss = join(packagesDir, 'playground', 'src', 'styles.css');
  const destPlayground = join(outDir, 'css', 'playground-styles.css');
  copyFileSync(playgroundCss, destPlayground);
  console.log(`Copied: playground-styles.css`);

  // 3. Copy built JS files
  const jsFiles = [
    { src: join(packagesDir, 'skam', 'dist', 'index.js'), name: 'skam.js' },
    {
      src: join(packagesDir, 'skam-html-renderer', 'dist', 'index.js'),
      name: 'skam-html-renderer.js',
    },
    {
      src: join(packagesDir, 'skam-canvas-renderer', 'dist', 'index.js'),
      name: 'skam-canvas-renderer.js',
    },
    {
      src: join(packagesDir, 'skam-xml-parser', 'dist', 'index.js'),
      name: 'skam-xml-parser.js',
    },
    {
      src: join(packagesDir, 'skam-xml-stringify', 'dist', 'index.js'),
      name: 'skam-xml-stringify.js',
    },
  ];

  for (const { src, name } of jsFiles) {
    try {
      copyFileSync(src, join(outDir, 'js', name));
      const size = readFileSync(src).length;
      console.log(`Copied: ${name} (${size} bytes)`);
    } catch {
      console.warn(`Skipped: ${name} (not found)`);
    }
  }

  console.log(`\nDone: files extracted to ${outDir}`);
}

main().catch((err) => {
  console.error('Failed to extract:', err);
  process.exit(1);
});

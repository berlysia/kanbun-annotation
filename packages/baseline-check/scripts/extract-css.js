/**
 * Extract CSS and JS from SKAM packages for baseline checking.
 *
 * - Calls getDefaultStyles() with various option combinations
 * - Copies playground CSS
 * - Copies built JS files
 *
 * All output goes to extracted/ so lint tools can run within the base path.
 */

import {
  writeFileSync,
  mkdirSync,
  readFileSync,
  copyFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'extracted');
const packagesDir = join(__dirname, '..', '..');

const PUBLIC_PACKAGES = [
  'skam',
  'skam-html-renderer',
  'skam-canvas-renderer',
  'skam-xml-parser',
  'skam-xml-stringify',
  'skam-web-component',
];

/** ESM files under dir, relative to it. The IIFE bundle repeats the ESM code, so it is left out. */
function listEsmFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .filter((entry) => !entry.name.endsWith('.iife.js'))
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
}

/**
 * dist/index.js keeps the old name (`<pkg>.js`), which generate-report.js uses to pick the
 * report section. Other files get `<pkg>__<path>`, without the chunk hash so the report does
 * not change on every build (src-DtmyVnS5.js → skam__src.js).
 */
function extractedJsName(pkg, rel) {
  if (rel === 'index.js') return `${pkg}.js`;
  const stem = rel.replace(/-[A-Za-z0-9_-]{8}\.js$/, '.js');
  return `${pkg}__${stem.split(sep).join('__')}`;
}

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
  // Every ESM file in dist, not only dist/index.js: the bundler moves shared code into hashed
  // chunks (skam's dist/index.js only re-exports src-<hash>.js), so index.js alone misses it.
  // Stale files from an earlier build would be checked too, so the directory starts empty.
  const jsDir = join(outDir, 'js');
  rmSync(jsDir, { recursive: true, force: true });
  mkdirSync(jsDir, { recursive: true });
  const copied = new Map();
  for (const pkg of PUBLIC_PACKAGES) {
    const distDir = join(packagesDir, pkg, 'dist');
    if (!existsSync(distDir)) {
      console.warn(`Skipped: ${pkg} (dist not found)`);
      continue;
    }
    for (const rel of listEsmFiles(distDir)) {
      const name = extractedJsName(pkg, rel);
      const src = join(distDir, rel);
      const previous = copied.get(name);
      if (previous !== undefined) {
        throw new Error(`Two files map to extracted/js/${name}: ${previous} and ${src}`);
      }
      copied.set(name, src);
      copyFileSync(src, join(jsDir, name));
      console.log(`Copied: ${name} (${readFileSync(src).length} bytes)`);
    }
  }

  console.log(`\nDone: files extracted to ${outDir}`);
}

main().catch((err) => {
  console.error('Failed to extract:', err);
  process.exit(1);
});

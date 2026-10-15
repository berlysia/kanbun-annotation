// Extracts fenced code blocks from README markdown and classifies them by the
// `<!-- doctest... -->` marker on the line directly above the fence.
//
// The checks on `run` blocks guard against accidents (a README example that reads
// files or hits the network while the test suite runs). They are not a sandbox:
// the real defences are reviewing README changes like code and running CI with
// read-only permissions.

export type DoctestMode = 'run' | 'typecheck' | 'xml' | 'xml-body' | 'xml-block' | 'skip';

export interface DoctestBlock {
  file: string;
  /** 1-based line number of the opening fence. */
  line: number;
  lang: string;
  mode: DoctestMode;
  code: string;
  reason?: string;
}

export interface UnmarkedBlock {
  file: string;
  line: number;
  lang: string;
}

export interface ExtractResult {
  blocks: DoctestBlock[];
  unmarked: UnmarkedBlock[];
}

const TS_LANGS = new Set(['ts', 'typescript']);
const XML_LANGS = new Set(['xml']);
const MARKER = /^<!--\s*(doctest(?::[A-Za-z]+)?(?:\s+[^]*?)?)\s*-->$/;
const FENCE_OPEN = /^```([A-Za-z0-9_-]*)\s*$/;

const FORBIDDEN_IDENTIFIERS =
  /\bimport\s*\(|\brequire\b|\beval\b|\bFunction\s*\(|\bprocess\b|\bglobalThis\b|\bfetch\b|\bXMLHttpRequest\b|\bWebSocket\b/;
const IMPORT_FROM = /\bimport\b[^'"`;]*['"]([^'"]+)['"]/g;
const EXPORT_FROM = /\bexport\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g;

interface Scanned {
  /** Comments replaced by spaces; string contents kept. */
  withoutComments: string;
  /** Comments replaced by spaces; string and template contents replaced by "". */
  withoutCommentsAndStrings: string;
  hasInterpolation: boolean;
}

type ScanState = 'code' | 'single' | 'double' | 'template' | 'line-comment' | 'block-comment';

// One left-to-right pass so that `//` inside a string and `'` inside a comment
// are not confused. Regex literals are not understood: a misread can only make
// the scan stricter, never let a forbidden construct through.
function scan(code: string): Scanned {
  let withoutComments = '';
  let stripped = '';
  let hasInterpolation = false;
  let state: ScanState = 'code';
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!;
    const next = code[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') {
        state = 'line-comment';
        withoutComments += '  ';
        stripped += '  ';
        i++;
      } else if (c === '/' && next === '*') {
        state = 'block-comment';
        withoutComments += '  ';
        stripped += '  ';
        i++;
      } else if (c === "'" || c === '"' || c === '`') {
        state = c === "'" ? 'single' : c === '"' ? 'double' : 'template';
        withoutComments += c;
        stripped += c;
      } else {
        withoutComments += c;
        stripped += c;
      }
    } else if (state === 'line-comment') {
      if (c === '\n') {
        state = 'code';
        withoutComments += c;
        stripped += c;
      } else {
        withoutComments += ' ';
        stripped += ' ';
      }
    } else if (state === 'block-comment') {
      if (c === '*' && next === '/') {
        state = 'code';
        withoutComments += '  ';
        stripped += '  ';
        i++;
      } else {
        const keep = c === '\n' ? '\n' : ' ';
        withoutComments += keep;
        stripped += keep;
      }
    } else {
      // inside a string or template literal
      const quote = state === 'single' ? "'" : state === 'double' ? '"' : '`';
      if (c === '\\') {
        withoutComments += c + (next ?? '');
        i++;
      } else if (c === quote) {
        state = 'code';
        withoutComments += c;
        stripped += c;
      } else {
        if (state === 'template' && c === '$' && next === '{') hasInterpolation = true;
        withoutComments += c;
      }
    }
  }
  return { withoutComments, withoutCommentsAndStrings: stripped, hasInterpolation };
}

function checkRunBlock(code: string, where: string): void {
  const scanned = scan(code);
  if (scanned.hasInterpolation) {
    throw new Error(`${where}: forbidden template literal interpolation in a doctest run block`);
  }
  for (const re of [IMPORT_FROM, EXPORT_FROM]) {
    for (const m of scanned.withoutComments.matchAll(re)) {
      const specifier = m[1]!;
      if (!specifier.startsWith('@kanbun-skam/')) {
        throw new Error(
          `${where}: forbidden import of '${specifier}' (only @kanbun-skam/* is allowed in a doctest run block)`
        );
      }
    }
  }
  const hit = FORBIDDEN_IDENTIFIERS.exec(scanned.withoutCommentsAndStrings);
  if (hit) {
    throw new Error(
      `${where}: forbidden identifier '${hit[0]}' in a doctest run block (use doctest:typecheck or doctest:skip)`
    );
  }
}

function modeFor(
  marker: string,
  lang: string,
  where: string
): { mode: DoctestMode; reason?: string } {
  const m = /^doctest(?::([A-Za-z]+))?(?:\s+([^]*))?$/.exec(marker);
  const kind = m?.[1];
  const arg = m?.[2]?.trim();
  if (kind === 'skip') {
    if (!arg) throw new Error(`${where}: doctest:skip requires a reason`);
    return { mode: 'skip', reason: arg };
  }
  if (TS_LANGS.has(lang)) {
    if (kind === undefined && !arg) return { mode: 'run' };
    if (kind === 'typecheck' && !arg) return { mode: 'typecheck' };
  } else if (XML_LANGS.has(lang)) {
    if (kind === 'xml') {
      if (!arg) return { mode: 'xml' };
      if (arg === 'body') return { mode: 'xml-body' };
      if (arg === 'block') return { mode: 'xml-block' };
    }
  }
  throw new Error(`${where}: marker '<!-- ${marker} -->' is not valid for a ${lang} block`);
}

export function extractDoctests(markdown: string, file: string): ExtractResult {
  const lines = markdown.split('\n');
  const blocks: DoctestBlock[] = [];
  const unmarked: UnmarkedBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i]!);
    if (!open) continue;
    const lang = open[1]!;
    let end = i + 1;
    while (end < lines.length && lines[end]!.trimEnd() !== '```') end++;
    const code = lines.slice(i + 1, end).join('\n');
    const line = i + 1;
    const where = `${file}:${line}`;
    const checked = TS_LANGS.has(lang) || XML_LANGS.has(lang);
    if (checked) {
      // prettier inserts a blank line between an HTML comment and the following fence,
      // so the marker is the nearest non-blank line above the fence.
      let m = i - 1;
      while (m >= 0 && lines[m]!.trim() === '') m--;
      const markerText = m >= 0 ? MARKER.exec(lines[m]!.trim())?.[1] : undefined;
      if (markerText === undefined) {
        unmarked.push({ file, line, lang });
      } else {
        const { mode, reason } = modeFor(markerText, lang, where);
        if (mode === 'run') checkRunBlock(code, where);
        blocks.push({ file, line, lang, mode, code, ...(reason !== undefined ? { reason } : {}) });
      }
    }
    i = end;
  }
  return { blocks, unmarked };
}

/**
 * 本文 (正規化した形式。`update-source.ts` が取得してキャッシュする) から、描画の性能を測るための SKAM 文書を組む。
 *
 * 本文の形式と注記の対応は README.md を参照。`synthetic` が真のときは、読み・送り仮名・返り点・傍線を
 * 決まった規則で足す。規則は負荷を掛けるための人工の値で、実際の訓点本の密度ではない
 * (時間は同じ規則の中での比較にだけ使う)。乱数は使わない。
 *
 * 注記は配列を直接組む。CRUD の addMark は呼ぶたびに文書を作り直すので、数万件には使えない。
 */

import { createHash } from 'node:crypto';
import { closeSync, constants, openSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Block, Mark, SKAMDocument, Token } from '@kanbun-skam/skam';
import { KOJIKI_VOLUMES, type KojikiVolume } from './convert-wikitext.ts';
import { KOJIKI_SOURCE_SHA256 } from './source-pin.ts';

export interface BuildOptions {
  /** 省くと全巻 */
  readonly volume?: KojikiVolume;
  /** 省くと true */
  readonly synthetic?: boolean;
}

/**
 * 本文のキャッシュのパス。パッケージの直下の `.cache/kojiki-source.txt` (commit しない)。
 * `src/` からも `dist/` からも、パッケージの直下から 1 段下のファイルとして同じ場所になる。
 * 取得と書き込みは update-source.ts、worktree ごとにできる。
 */
export function getKojikiCachePath(moduleUrl: string): string {
  return fileURLToPath(new URL('../.cache/kojiki-source.txt', moduleUrl));
}

export const KOJIKI_CACHE_PATH: string = getKojikiCachePath(import.meta.url);

/** キャッシュが無い */
export class KojikiSourceMissingError extends Error {
  override readonly name = 'KojikiSourceMissingError';
}

/** キャッシュの sha256 が定数と違う (空のファイルを含む) */
export class KojikiSourceMismatchError extends Error {
  override readonly name = 'KojikiSourceMismatchError';
  readonly expected: string;
  readonly actual: string;
  constructor(path: string, expected: string, actual: string) {
    super(
      `${path}: sha256 mismatch (expected ${expected}, actual ${actual}). ` +
        'Run `pnpm bench` (or `pnpm --filter @kanbun-skam/kojiki run fetch` after a build) to fetch it again.'
    );
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * キャッシュを読み、sha256 が一致したときだけその本文を返す。
 * symlink は O_NOFOLLOW で開けない。開いた fd から 1 回だけ読み、読んだバイト列そのものを照合して
 * 使う (照合と組み立てで読み直すと、間に差し替えられた別の中身を組み立てうる)。memo はしない。
 */
export function readVerifiedSource(path: string, expectedSha256: string): string {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new KojikiSourceMissingError(
        `${path}: not found. Run \`pnpm bench\` (or \`pnpm --filter @kanbun-skam/kojiki run fetch\` after a build) to fetch it.`,
        { cause: error }
      );
    }
    throw new Error(`${path}: cannot open (${(error as NodeJS.ErrnoException).code ?? 'error'})`, {
      cause: error,
    });
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(fd);
  } finally {
    closeSync(fd);
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expectedSha256) throw new KojikiSourceMismatchError(path, expectedSha256, actual);
  return bytes.toString('utf8');
}

const PUNCTUATION = '。，；：、！？';
const NOTE_EXTRA = '（）＋/';
const KAERI_ICHI = '㆒'; // ㆒
const KAERI_NI = '㆓'; // ㆓
const KAERI_RE = '㆑'; // ㆑

function isTokenChar(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x323af) ||
    ch === '々' ||
    ch === '〓'
  );
}

function codePointLabel(ch: string): string {
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

// --- 1 行の解釈 ---

/** block の中の注記。after は block の先頭からの token の位置 (-1 は block の先頭) */
type TextEvent =
  | { readonly kind: 'kutoten'; readonly after: number; readonly value: string }
  | {
      readonly kind: 'ref';
      readonly after: number;
      readonly content: string;
      readonly variant: boolean;
    }
  | { readonly kind: 'underline'; readonly from: number; readonly to: number };

interface ParsedBlock {
  readonly volume: KojikiVolume | undefined;
  readonly chars: string[];
  readonly events: TextEvent[];
}

interface LineResult {
  readonly chars: string[];
  readonly events: TextEvent[];
}

/** 1 行 (= 1 block) を解釈する。不正な字・記法は行番号つきで投げる */
function parseLine(text: string, lineNo: number): LineResult {
  const chars: string[] = [];
  const events: TextEvent[] = [];
  const fail = (message: string): never => {
    throw new Error(`kojiki-source line ${lineNo}: ${message}`);
  };

  /** 本文の字 (token にする字と句読点) を足す */
  const addPlain = (plain: string): void => {
    for (const ch of plain) {
      if (isTokenChar(ch)) chars.push(ch);
      else if (PUNCTUATION.includes(ch))
        events.push({ kind: 'kutoten', after: chars.length - 1, value: ch });
      else fail(`character ${codePointLabel(ch)} is not allowed`);
    }
  };

  /** 注の文字列は、本文の字に （）＋/ を足した字だけ */
  const checkNote = (note: string): string => {
    for (const ch of note) {
      if (!isTokenChar(ch) && !PUNCTUATION.includes(ch) && !NOTE_EXTRA.includes(ch)) {
        fail(`character ${codePointLabel(ch)} is not allowed in a note`);
      }
    }
    return note;
  };

  const addNotation = (kind: string, body: string): void => {
    const first = chars.length;
    if (kind === 'n') {
      events.push({ kind: 'ref', after: first - 1, content: checkNote(body), variant: false });
      return;
    }
    const bar = body.indexOf('|');
    addPlain(kind === 'v' && bar !== -1 ? body.slice(0, bar) : body);
    const last = chars.length - 1;
    if (last < first) fail(`{${kind}:} has no character`);
    if (kind === 'u') {
      events.push({ kind: 'underline', from: first, to: last });
      return;
    }
    if (bar === -1 || body.indexOf('|', bar + 1) !== -1) fail('{v:} needs exactly one "|"');
    events.push({
      kind: 'ref',
      after: last,
      content: `異本: ${checkNote(body.slice(bar + 1))}`,
      variant: true,
    });
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '}' || ch === '|') fail(`unexpected "${ch}"`);
    if (ch !== '{') {
      const open = text.indexOf('{', i);
      const end = open === -1 ? text.length : open;
      addPlain(text.slice(i, end));
      i = end;
      continue;
    }
    const kind = text.slice(i + 1, i + 3);
    if (kind !== 'u:' && kind !== 'v:' && kind !== 'n:') fail('unknown notation');
    const close = text.indexOf('}', i);
    if (close === -1) fail('unclosed notation');
    const body = text.slice(i + 3, close);
    if (body.includes('{')) fail('nested notation');
    addNotation(kind[0]!, body);
    i = close + 1;
  }
  if (chars.length === 0) fail('a block without a character');
  return { chars, events };
}

function parseSource(source: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let volume: KojikiVolume | undefined;
  let nextVolume = 0;
  source.split('\n').forEach((line, index) => {
    const lineNo = index + 1;
    if (line.length === 0) return;
    if (line.startsWith('# ')) {
      const name = line.slice(2);
      if (name !== KOJIKI_VOLUMES[nextVolume]) {
        throw new Error(
          `kojiki-source line ${lineNo}: expected volume "${KOJIKI_VOLUMES[nextVolume] ?? '(none)'}", got "${name}"`
        );
      }
      volume = KOJIKI_VOLUMES[nextVolume];
      nextVolume += 1;
      return;
    }
    const { chars, events } = parseLine(line, lineNo);
    blocks.push({ volume, chars, events });
  });
  return blocks;
}

// --- 文書の組み立て ---

/** 合成の注記。g は全巻を通した token の番号、i は block の中の位置 */
function syntheticMarks(blockId: string, tokenIds: readonly string[], firstGlobal: number): Mark[] {
  const marks: Mark[] = [];
  tokenIds.forEach((id, i) => {
    const g = firstGlobal + i;
    if (g % 4 === 0) marks.push({ type: 'yomigana', anchor: { from: id, to: id }, value: 'よみ' });
    if (g % 6 === 1) marks.push({ type: 'okurigana', anchor: { from: id, to: id }, value: 'ニ' });
    const position = { blockId, after: id };
    if (i >= 1 && g % 10 === 5) marks.push({ type: 'kaeri', position, value: KAERI_RE });
    if (i >= 1 && g % 30 === 12) marks.push({ type: 'kaeri', position, value: KAERI_NI });
    if (i >= 1 && g % 30 === 17) marks.push({ type: 'kaeri', position, value: KAERI_ICHI });
    const end = tokenIds[i + 2];
    if (g % 50 === 20 && end !== undefined) {
      marks.push({
        type: 'highlight',
        id: `d${g}`,
        anchor: { from: id, to: end },
        style: 'dotted',
      });
    }
  });
  return marks;
}

/** 本文の注記を Mark にする。id は付く最初の token の番号から作り、巻だけの文書でも変わらない */
function textMarks(
  blockNo: number,
  blockId: string,
  tokenIds: readonly string[],
  firstGlobal: number,
  events: readonly TextEvent[]
): Mark[] {
  const marks: Mark[] = [];
  const notesAt = new Map<number, number>();
  for (const event of events) {
    if (event.kind === 'underline') {
      marks.push({
        type: 'highlight',
        id: `u${firstGlobal + event.from}`,
        anchor: { from: tokenIds[event.from]!, to: tokenIds[event.to]! },
        style: 'solid',
      });
      continue;
    }
    const afterId = event.after >= 0 ? tokenIds[event.after] : undefined;
    const position = afterId === undefined ? { blockId } : { blockId, after: afterId };
    if (event.kind === 'kutoten') {
      marks.push({ type: 'kutoten', position, value: event.value });
      continue;
    }
    const nth = notesAt.get(event.after) ?? 0;
    let id: string;
    if (event.variant) id = `v${firstGlobal + event.after}`;
    else {
      id = event.after >= 0 ? `n${firstGlobal + event.after}-${nth}` : `nb${blockNo}-${nth}`;
      notesAt.set(event.after, nth + 1);
    }
    marks.push({ type: 'ref', id, position, format: 'numeric-paren', content: event.content });
  }
  return marks;
}

/** 本文の文字列から文書を組む。`buildKojikiDocument` が読むファイルと同じ形式 */
export function buildDocumentFromSource(source: string, options: BuildOptions = {}): SKAMDocument {
  const synthetic = options.synthetic ?? true;
  const parsed = parseSource(source);
  const tokens: Token[] = [];
  const blocks: Block[] = [];
  const marks: Mark[] = [];
  const extra: Mark[] = [];
  let global = 0;
  parsed.forEach((block, blockNo) => {
    if (options.volume !== undefined && block.volume !== options.volume) {
      global += block.chars.length;
      return;
    }
    const blockId = `b${blockNo}`;
    const tokenIds = block.chars.map((_, i) => `t${global + i}`);
    block.chars.forEach((ch, i) => tokens.push({ id: tokenIds[i]!, text: ch }));
    blocks.push({ id: blockId, tokenIds });
    marks.push(...textMarks(blockNo, blockId, tokenIds, global, block.events));
    if (synthetic) extra.push(...syntheticMarks(blockId, tokenIds, global));
    global += block.chars.length;
  });
  return {
    format: 'skam@0.1',
    tokens,
    blocks,
    marks: [...marks, ...extra],
    readings: [],
  };
}

let cachedSource: string | undefined;

/**
 * 古事記の文書を組む。同じ引数なら毎回同じ内容を返す。
 * キャッシュはプロセスの中で初回の呼び出しの時に 1 回だけ読む (import の時には読まない)。
 * 失敗は memo しない。
 */
export function buildKojikiDocument(options: BuildOptions = {}): SKAMDocument {
  cachedSource ??= readVerifiedSource(KOJIKI_CACHE_PATH, KOJIKI_SOURCE_SHA256);
  return buildDocumentFromSource(cachedSource, options);
}

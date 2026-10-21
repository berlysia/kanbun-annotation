/**
 * zh.wikisource の古事記の wikitext を、kojiki-source.txt の行 (1 行 1 block) に変換する純粋関数。
 *
 * 取得したページは信頼できない入力として扱う。変換表に無い記法と、許可する字の外の字は、
 * 黙って落とさず行番号つきで止める (README.md の「変換で加えた変更」が変換の全体)。
 */

export class KojikiConvertError extends Error {
  override readonly name = 'KojikiConvertError';
}

type Mode =
  /** 記法を出してよい本文の位置 */
  | 'top'
  /** {u:} と {v:} の採用字の中。入れ子の記法は外して字だけ残す */
  | 'base'
  /** {n:} と {v:} の異文の中。入れ子の記法は外して字だけ残す */
  | 'note';

interface Emitter {
  text(value: string): void;
  breakBlock(): void;
}

/** 走査中のページ。end は走査する範囲の終端 (入れ子の引数の中では引数の終端) */
interface Scan {
  readonly src: string;
  readonly end: number;
  readonly mode: Mode;
  readonly out: Emitter;
}

/** 位置 i の記法を処理して次の位置を返す。i で始まる記法でなければ undefined */
type Handler = (scan: Scan, i: number) => number | undefined;

const BODY_PUNCTUATION = '。，；：、！？';
/** 注の中でだけ許す字 */
const NOTE_EXTRA = '（）＋/';
/** 消す字: 引用符と全角空白 */
const DROPPED = '「」『』　';
/** wikisource 側の入力の誤りで、字として読めないもの (katakana ト は卜の誤入力)。〓 に置き換える */
const REPLACED_WITH_GETA = 'ト';

const IDS_BINARY = '⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻';
const IDS_TERNARY = '⿲⿳';

/** 漢字: U+3400–U+4DBF、U+4E00–U+9FFF、U+F900–U+FAFF、U+20000–U+323AF */
function isKanji(cp: number): boolean {
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x323af)
  );
}

function isIdsOperator(ch: string): boolean {
  return IDS_BINARY.includes(ch) || IDS_TERNARY.includes(ch);
}

/** IDS の部品: 漢字、部首 (U+2E80–U+2FDF)、筆画 (U+31C0–U+31EF) */
function isIdsComponent(cp: number): boolean {
  return isKanji(cp) || (cp >= 0x2e80 && cp <= 0x2fdf) || (cp >= 0x31c0 && cp <= 0x31ef);
}

function isAllowed(ch: string, mode: Mode): boolean {
  if (isKanji(ch.codePointAt(0)!) || ch === '々' || ch === '〓' || BODY_PUNCTUATION.includes(ch))
    return true;
  return mode === 'note' && NOTE_EXTRA.includes(ch);
}

function codePointLabel(ch: string): string {
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

function fail(scan: Scan, offset: number, message: string): never {
  let line = 1;
  for (let k = 0; k < offset; k += 1) if (scan.src.charCodeAt(k) === 10) line += 1;
  throw new KojikiConvertError(`line ${line}: ${message}`);
}

interface TemplateCall {
  readonly name: string;
  readonly args: readonly { readonly start: number; readonly end: number }[];
  /** `}}` の次の位置 */
  readonly next: number;
}

/** open の位置の `{{` から、対応する `}}` までを読む。引数は最上位の `|` で区切る */
function readTemplate(scan: Scan, open: number): TemplateCall {
  const { src, end } = scan;
  const bars: number[] = [];
  let depth = 0;
  let k = open;
  while (k < end) {
    if (src.startsWith('{{', k)) {
      depth += 1;
      k += 2;
    } else if (src.startsWith('}}', k)) {
      depth -= 1;
      k += 2;
      if (depth === 0) {
        const close = k - 2;
        const name = src.slice(open + 2, bars[0] ?? close).trim();
        const args = bars.map((bar, idx) => ({ start: bar + 1, end: bars[idx + 1] ?? close }));
        return { name, args, next: k };
      }
    } else {
      if (src[k] === '|' && depth === 1) bars.push(k);
      k += 1;
    }
  }
  return fail(scan, open, 'unclosed {{');
}

/** 範囲を入れ子の記法を外した字列にする。範囲の中の空行は止める */
function flatten(scan: Scan, start: number, end: number, mode: Mode): string {
  const parts: string[] = [];
  convertRange(
    {
      src: scan.src,
      end,
      mode,
      out: {
        text: (v) => parts.push(v),
        breakBlock: () => fail(scan, start, 'a blank line inside a notation'),
      },
    },
    start
  );
  return parts.join('');
}

/** from の位置の IDS (演算子で始まる) を読み、次の位置を返す。形が崩れていれば undefined */
function readIds(src: string, from: number, end: number): number | undefined {
  const op = String.fromCodePoint(src.codePointAt(from)!);
  let k = from + op.length;
  const arity = IDS_TERNARY.includes(op) ? 3 : 2;
  for (let operand = 0; operand < arity && k < end; operand += 1) {
    const ch = String.fromCodePoint(src.codePointAt(k)!);
    if (isIdsOperator(ch)) {
      const next = readIds(src, k, end);
      if (next === undefined) return undefined;
      k = next;
    } else if (isIdsComponent(ch.codePointAt(0)!)) {
      k += ch.length;
    } else {
      return undefined;
    }
    if (operand === arity - 1) return k;
  }
  return undefined;
}

const handleHeading: Handler = (scan, i) => {
  const { src, end } = scan;
  const atLineStart = i === 0 || src[i - 1] === '\n';
  if (scan.mode !== 'top' || !atLineStart || !src.startsWith('==', i)) return undefined;
  const newline = src.indexOf('\n', i);
  const lineEnd = newline === -1 || newline > end ? end : newline;
  const heading = /^==\s*(.+?)\s*==\s*$/.exec(src.slice(i, lineEnd));
  if (!heading) return fail(scan, i, 'malformed heading');
  scan.out.breakBlock();
  // 注釈欄 ({{reflist}}) の見出しは本文ではない
  if (!src.slice(lineEnd, end).trimStart().startsWith('{{reflist}}')) {
    const headingStart = i + src.slice(i, lineEnd).indexOf(heading[1]!);
    scan.out.text(flatten(scan, headingStart, headingStart + heading[1]!.length, 'base'));
  }
  scan.out.breakBlock();
  return lineEnd;
};

/** 空行は段落の区切り。段落の中の単独の改行は無視する */
const handleNewline: Handler = (scan, i) => {
  if (scan.src[i] !== '\n') return undefined;
  let k = i;
  let newlines = 0;
  while (k < scan.end && /[\n\r\t ]/.test(scan.src[k]!)) {
    if (scan.src[k] === '\n') newlines += 1;
    k += 1;
  }
  if (newlines >= 2) scan.out.breakBlock();
  return k;
};

/** 記法を出してよい位置 (top) の {{ul}} {{另}} {{*}} と、体裁の枠 */
function emitTemplate(scan: Scan, call: TemplateCall, offset: number): void {
  const arg = (n: number): { start: number; end: number } =>
    call.args[n] ?? fail(scan, offset, `{{${call.name}}} lacks argument ${n + 1}`);
  const expectArgs = (n: number): void => {
    if (call.args.length !== n)
      fail(scan, offset, `{{${call.name}}} expects ${n} argument(s), got ${call.args.length}`);
  };
  const top = scan.mode === 'top';
  switch (call.name) {
    case 'header2':
    case 'reflist':
      return;
    case 'right':
      expectArgs(1);
      convertRange({ ...scan, end: arg(0).end }, arg(0).start);
      return;
    case 'ul': {
      expectArgs(1);
      const body = flatten(scan, arg(0).start, arg(0).end, 'base');
      scan.out.text(top ? `{u:${body}}` : body);
      return;
    }
    case '另': {
      // 異文が書かれていない {{另|X}} (上卷に 1 件) は、採用字だけを残す
      if (call.args.length !== 1) expectArgs(2);
      const adopted = flatten(scan, arg(0).start, arg(0).end, 'base');
      const hasAlternatives = top && call.args.length === 2;
      scan.out.text(
        hasAlternatives
          ? `{v:${adopted}|${flatten(scan, arg(1).start, arg(1).end, 'note')}}`
          : adopted
      );
      return;
    }
    case '*': {
      expectArgs(1);
      const body = flatten(scan, arg(0).start, arg(0).end, 'note');
      scan.out.text(top ? `{n:${body}}` : body);
      return;
    }
    default:
      fail(scan, offset, `unknown template {{${call.name}}}`);
  }
}

const handleTemplate: Handler = (scan, i) => {
  if (!scan.src.startsWith('{{', i)) return undefined;
  const call = readTemplate(scan, i);
  emitTemplate(scan, call, i);
  return call.next;
};

const handleTag: Handler = (scan, i) => {
  const { src, end } = scan;
  if (src[i] !== '<') return undefined;
  if (src.startsWith('<ref>', i)) {
    const close = src.indexOf('</ref>', i);
    if (close === -1 || close >= end) return fail(scan, i, 'unclosed <ref>');
    return close + '</ref>'.length;
  }
  for (const tag of ['<blockquote>', '</blockquote>']) {
    if (src.startsWith(tag, i)) {
      scan.out.breakBlock();
      return i + tag.length;
    }
  }
  const tag = /^<\/?[A-Za-z][^>\n]*>/.exec(src.slice(i, i + 40));
  return fail(scan, i, `unknown tag ${tag ? tag[0] : '<'}`);
};

/** 表外字: 地の IDS 1 字分、`〓[説明]`、`[IDS]` はどれも 〓 1 字にする */
const handleUnencoded: Handler = (scan, i) => {
  const { src, end } = scan;
  const ch = String.fromCodePoint(src.codePointAt(i)!);
  if (isIdsOperator(ch)) {
    const next = readIds(src, i, end);
    if (next === undefined) return fail(scan, i, 'malformed IDS');
    scan.out.text('〓');
    return next;
  }
  const bracketed = ch === '〓' && src[i + 1] === '[';
  if (!bracketed && ch !== '[') return undefined;
  const close = src.indexOf(']', i);
  if (close === -1 || close >= end) return fail(scan, i, 'unclosed [');
  const innerStart = bracketed ? i + 2 : i + 1;
  const inner = src.slice(innerStart, close);
  const isIds = isIdsOperator(inner[0] ?? '') && readIds(src, innerStart, close) === close;
  const isDescription = [...inner].every(
    (c) => isIdsComponent(c.codePointAt(0)!) || isIdsOperator(c) || c === '＋'
  );
  if (!(bracketed ? isDescription : isIds))
    return fail(scan, i, `unknown bracket notation "${src.slice(i, close + 1)}"`);
  scan.out.text('〓');
  return close + 1;
};

/** 校訂者の補い `（X）` `＜X＞` は注にする。閉じ括弧までに入れ子は無い */
const handleEditorial: Handler = (scan, i) => {
  const ch = scan.src[i];
  if (scan.mode !== 'top' || (ch !== '（' && ch !== '＜')) return undefined;
  const close = scan.src.indexOf(ch === '（' ? '）' : '＞', i);
  if (close === -1 || close >= scan.end) return fail(scan, i, `unclosed ${ch}`);
  scan.out.text(`{n:${flatten(scan, i + 1, close, 'note')}}`);
  return close + 1;
};

const handleCharacter: Handler = (scan, i) => {
  const ch = String.fromCodePoint(scan.src.codePointAt(i)!);
  if (DROPPED.includes(ch)) return i + ch.length;
  if (REPLACED_WITH_GETA.includes(ch)) {
    scan.out.text('〓');
    return i + ch.length;
  }
  if (!isAllowed(ch, scan.mode))
    return fail(scan, i, `character ${codePointLabel(ch)} is not allowed`);
  scan.out.text(ch);
  return i + ch.length;
};

const HANDLERS: readonly Handler[] = [
  handleHeading,
  handleNewline,
  handleTemplate,
  handleTag,
  handleUnencoded,
  handleEditorial,
  handleCharacter,
];

function convertRange(scan: Scan, start: number): void {
  let i = start;
  while (i < scan.end) {
    for (const handler of HANDLERS) {
      const next = handler(scan, i);
      if (next !== undefined) {
        i = next;
        break;
      }
    }
  }
}

/** 1 ページ分の wikitext を、本文の行 (巻名の行は含まない) に変換する */
export function convertWikitext(wikitext: string): string[] {
  const blocks: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current.length > 0) blocks.push(current);
    current = '';
  };
  convertRange(
    {
      src: wikitext,
      end: wikitext.length,
      mode: 'top',
      out: {
        text: (value) => {
          current += value;
        },
        breakBlock: flush,
      },
    },
    0
  );
  flush();
  return blocks;
}

export const KOJIKI_VOLUMES = ['上卷', '中卷', '下卷'] as const;
export type KojikiVolume = (typeof KOJIKI_VOLUMES)[number];

/** 3 巻分の wikitext から kojiki-source.txt の全文 (末尾の改行つき) を作る */
export function convertVolumes(pages: Readonly<Record<KojikiVolume, string>>): string {
  const lines: string[] = [];
  for (const volume of KOJIKI_VOLUMES) {
    lines.push(`# ${volume}`);
    try {
      lines.push(...convertWikitext(pages[volume]));
    } catch (error) {
      if (error instanceof KojikiConvertError) {
        throw new KojikiConvertError(`${volume} ${error.message}`, { cause: error });
      }
      throw error;
    }
  }
  return `${lines.join('\n')}\n`;
}

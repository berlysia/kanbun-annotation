import { SKAMXMLParseError } from './parse-error.js';

export interface InputLimits {
  maxInputLength: number;
  maxDepth: number;
}

export const DEFAULT_INPUT_LIMITS: InputLimits = { maxInputLength: 5_000_000, maxDepth: 64 };

/** offset (0-based) から 1-based の line / column を求める。エラーになったときだけ呼ぶので O(n) で足りる */
function positionOf(xml: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let k = 0; k < offset; k++) {
    if (xml.charCodeAt(k) === 10) {
      line++;
      lineStart = k + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

type Fail = (msg: string, at?: number) => never;

/** タグ `<...>` の終端 `>` の位置を返す。引用符の対応と `=` 直後の引用符を検査する */
function findTagEnd(xml: string, start: number, fail: Fail): number {
  let j = start + 1;
  let quote: string | null = null;
  let expectQuote = false; // `=` の直後 (空白は読み飛ばす) は引用符でなければならない
  for (; j < xml.length; j++) {
    const c = xml[j]!;
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (expectQuote) {
      if (c === '"' || c === "'") {
        quote = c;
        expectQuote = false;
      } else if (!/\s/.test(c)) {
        fail('unquoted attribute value', j);
      }
      continue;
    }
    if (c === '"' || c === "'") fail('unexpected quote in tag', j);
    else if (c === '<') fail('unexpected "<" in tag', j);
    else if (c === '=') expectQuote = true;
    else if (c === '>') return j;
  }
  return fail(quote ? 'unterminated attribute value' : 'unterminated tag', start);
}

/**
 * XML パーサに渡す前の事前走査。判定できない入力はすべて拒否する (fail-closed)。
 * DTD / 実体宣言、過大な入れ子、過大な入力長を、パーサの実装に依存せず止める。
 */
export function checkInputLimits(xml: string, limits: InputLimits): void {
  const fail: Fail = (msg, at) => {
    const pos = at === undefined ? undefined : positionOf(xml, at);
    throw new SKAMXMLParseError(msg, pos?.line, pos?.column);
  };
  if (xml.length > limits.maxInputLength) {
    fail(`Input length ${xml.length} exceeds maxInputLength ${limits.maxInputLength}`);
  }
  let depth = 0;
  let i = 0;
  const skipPast = (end: string, what: string, start: number) => {
    const j = xml.indexOf(end, i);
    if (j === -1) fail(`unterminated ${what}`, start);
    i = j + end.length;
  };
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) break;
    i = lt;
    // 終端の探索は開始記号の直後から始める (`<!-->` や `<?>` を短い構造と誤認しないため)
    const start = i;
    if (xml.startsWith('<!--', i)) {
      i += 4;
      skipPast('-->', 'comment', start);
      continue;
    }
    if (xml.startsWith('<![CDATA[', i)) {
      i += 9;
      skipPast(']]>', 'CDATA section', start);
      continue;
    }
    if (xml.startsWith('<!', i)) {
      fail(
        'XML declarations (<!DOCTYPE>, <!ENTITY>, <!ELEMENT>, ...) are not allowed in SKAM-ML',
        start
      );
    }
    if (xml.startsWith('<?', i)) {
      i += 2;
      skipPast('?>', 'processing instruction', start);
      continue;
    }
    const closing = xml[i + 1] === '/';
    const j = findTagEnd(xml, i, fail);
    const selfClosing = !closing && xml[j - 1] === '/';
    if (closing) {
      depth--;
      if (depth < 0) fail('unbalanced end tag', start);
    } else if (!selfClosing) {
      depth++;
      if (depth > limits.maxDepth)
        fail(`Element nesting exceeds maxDepth ${limits.maxDepth}`, start);
    }
    i = j + 1;
  }
}

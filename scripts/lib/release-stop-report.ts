// release が止まったときの表示の純粋関数。ファイル・ネットワーク・子プロセスには触れない。
// import できるのは release-check.ts と release-types.ts だけ (構造テストが固定する)。

import { sanitizeForTerminal } from './release-check.ts';
import { NO_COMMAND } from './release-types.ts';
import type { ErrorExcerpt, ErrorTool } from './release-types.ts';

// --- secret のマスク (行の選別と切り詰めの前に呼ぶ) ---

const MASK = '***';

// 正規表現は、入れ子の量指定子と後方参照を使わない。各規則は入力の長さに対して線形の時間で終わる
// (先頭の位置を lookbehind で絞り、同じ位置から何度も走査し直さないようにしている)。

// URL の userinfo (`//user:pass@host` → `//***@host`)
const USERINFO = /(\/\/)[^\s/@]+@/g;
// ghp_ / gho_ / ghs_ / ghu_ / ghr_ / npm_ の token と、`_` を含む fine-grained token
const PREFIXED_TOKEN = /(?:gh[posur]_|npm_)[A-Za-z0-9]+/g;
const FINE_GRAINED_TOKEN = /github_pat_[A-Za-z0-9_]+/g;
const AUTH_TOKEN = /(_authToken=)\S*/gi;
const BEARER = /(Authorization:\s*Bearer\s+)\S+/gi;
// 名前に TOKEN / SECRET / PASSWORD を含む `KEY=value` / `KEY: value`。キーは先頭の位置から 1 回だけ読む
const KEY_VALUE = /(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]+)(\s*[=:]\s*)(\S+)/g;
const SECRET_KEY = /token|secret|password/i;
// JWT の形。4096 での切断で途中が欠けても伏せるため、`.` の数は問わない
const JWT_LIKE = /eyJ[A-Za-z0-9_.-]*/g;
// npm の web 認証の URL のクエリと、/login/cli/ の後の id
const NPM_WEB_AUTH_URL = /\/-\/v1\/\S*/g;
const NPM_LOGIN_CLI = /(\/login\/cli\/)\S+/g;

export function redactSecrets(line: string): string {
  return line
    .replace(USERINFO, `$1${MASK}@`)
    .replace(PREFIXED_TOKEN, MASK)
    .replace(FINE_GRAINED_TOKEN, MASK)
    .replace(AUTH_TOKEN, `$1${MASK}`)
    .replace(BEARER, `$1${MASK}`)
    .replace(KEY_VALUE, (whole, key: string, sep: string) =>
      SECRET_KEY.test(key) ? `${key}${sep}${MASK}` : whole
    )
    .replace(JWT_LIKE, MASK)
    .replace(NPM_WEB_AUTH_URL, (url) => {
      const query = url.indexOf('?');
      return query < 0 ? url : `${url.slice(0, query + 1)}${MASK}`;
    })
    .replace(NPM_LOGIN_CLI, `$1${MASK}`);
}

// --- 行の切り出し (エラーの欄に出す外部の文字列) ---
// 順序: 1 行を先に切る → (job の log なら) 接頭辞を除く → エスケープ列を除く → 制御文字を除く
// → secret をマスクする → 行を選ぶ → 最後の 12 行を 300 コードポイントで切る。
// マスクは選別と切り詰めの前に行う。切り詰めがトークンの途中に当たって断片が残るのを防ぐため。

const RAW_LINE_LIMIT = 4096;
const DISPLAY_LINE_LIMIT = 300;
const DISPLAY_LINE_COUNT = 12;

const LINE_BREAK = /\r\n|[\n\r\u{2028}\u{2029}]/u;
// `<job>\t<step>\t<BOM?><ISO 時刻> ` (実物は時刻の直前に BOM が入る)
const JOB_LOG_PREFIX = /^[^\t]*\t[^\t]*\t\u{feff}?\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/u;
// エスケープ列 (CSI / OSC / 8 ビットの CSI / 途中切れ) を丸ごと除く。RC の sanitizeForTerminal は
// ESC の 1 文字しか除かず `[36;1m` を残すので、これを先に掛ける
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const CSI = /(?:\x1b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
const UNTERMINATED_ESCAPE = /\x1b.*$/;

// 先頭から n コードポイントまで。サロゲートペアを割らない。長い入力でも n に比例した時間で終わる
function takeCodePoints(text: string, n: number): string {
  if (text.length <= n) return text;
  let index = 0;
  for (let count = 0; count < n && index < text.length; count++) {
    index += (text.codePointAt(index) ?? 0) > 0xffff ? 2 : 1;
  }
  return text.slice(0, index);
}

function cleanLine(raw: string, jobLog: boolean): string {
  let line = takeCodePoints(raw, RAW_LINE_LIMIT);
  if (jobLog) line = line.replace(/^\u{feff}/u, '').replace(JOB_LOG_PREFIX, '');
  line = line.replace(OSC, '').replace(CSI, '').replace(UNTERMINATED_ESCAPE, '');
  return redactSecrets(sanitizeForTerminal(line));
}

const isBlank = (line: string): boolean => line.trim() === '';

// `env:` の段: 内容が `env:` の行から、内容の先頭が空白でない最初の行の前まで (空の行は段の中)
function dropExcludedLines(lines: readonly string[]): string[] {
  const kept: string[] = [];
  let inEnv = false;
  for (const line of lines) {
    if (inEnv) {
      if (line === '' || /^\s/.test(line)) continue;
      inEnv = false;
    }
    if (line === 'env:') {
      inEnv = true;
      continue;
    }
    if (line.startsWith('npm verbose stack') || line.startsWith('::add-mask::')) continue;
    kept.push(line);
  }
  return kept;
}

const JOB_LOG_MATCH = ['npm error', 'npm ERR!', '##[error]', 'npm verbose oidc'] as const;
const LOCAL_STDERR_MATCH = ['npm error', 'npm ERR!', 'fatal:', 'error:'] as const;

const startsWithAny = (line: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => line.startsWith(prefix));

const displayLine = (line: string): string => takeCodePoints(line, DISPLAY_LINE_LIMIT);
const lastLines = (lines: readonly string[]): string[] =>
  lines.slice(-DISPLAY_LINE_COUNT).map(displayLine);

function cleanLines(text: string, jobLog: boolean): string[] {
  return text.split(LINE_BREAK).map((raw) => cleanLine(raw, jobLog));
}

export function excerptLocalStderr(
  command: string,
  exit: number | null,
  stderr: string,
  options: { tool: ErrorTool }
): ErrorExcerpt {
  const lines = dropExcludedLines(cleanLines(stderr, false)).filter((line) => !isBlank(line));
  return {
    command,
    exit,
    source: 'local-stderr',
    tool: options.tool,
    lines: lastLines(lines),
    matched: lines.filter((line) => startsWithAny(line, LOCAL_STDERR_MATCH)).map(displayLine),
  };
}

// exit は gh の `--log-failed` の出力からは分からないので null
export function excerptJobLog(command: string, log: string): ErrorExcerpt {
  const lines = dropExcludedLines(cleanLines(log, true)).filter((line) => !isBlank(line));
  const matched = lines.filter((line) => startsWithAny(line, JOB_LOG_MATCH));
  return {
    command,
    exit: null,
    source: 'job-log',
    tool: 'gh',
    lines: lastLines(matched.length > 0 ? matched : lines),
    matched: matched.map(displayLine),
  };
}

// 判定だけの停止と、観測の `what` / `errors` の行に使う。行は選ばず、規則にも渡さない
export function excerptDetail(
  command: string,
  exit: number | null,
  detailLines: readonly string[]
): ErrorExcerpt {
  const lines = detailLines
    .flatMap((detail) => cleanLines(detail, false))
    .filter((line) => !isBlank(line));
  return {
    command,
    exit,
    source: 'none',
    tool: 'other',
    lines: lastLines(lines),
    matched: [],
  };
}

// 観測の what を error.lines の先頭に足す (先頭の 12 行を残す)。matched は規則に渡す行なので変えない
export function prependDetail(error: ErrorExcerpt | undefined, what: string): ErrorExcerpt {
  const detail = excerptDetail(NO_COMMAND, null, [what]);
  if (error === undefined) return detail;
  return { ...error, lines: [...detail.lines, ...error.lines].slice(0, DISPLAY_LINE_COUNT) };
}

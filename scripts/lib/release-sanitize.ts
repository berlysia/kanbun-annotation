// 外部の文字列の無害化の純粋関数。ファイル・ネットワーク・子プロセスには触れない。
// import できるのは release-check.ts だけ (構造テストが固定する)。

import { sanitizeForTerminal } from './release-check.ts';

// エスケープ列 (CSI / OSC / 8 ビットの CSI / 途中切れ) を丸ごと除く。RC の sanitizeForTerminal は
// ESC の 1 文字しか除かず `[36;1m` を残すので、これを先に掛ける
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const CSI = /(?:\x1b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
const UNTERMINATED_ESCAPE = /\x1b.*$/;

// エスケープ列 (OSC → CSI → 途中切れ) を除く。1 行を受ける
export function removeEscapeSequences(line: string): string {
  return line.replace(OSC, '').replace(CSI, '').replace(UNTERMINATED_ESCAPE, '');
}

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

// --- 保存物の無害化 ---

// 行ごとに、エスケープ列 → 制御文字 → secret の順で掛ける。切り詰めと job の log の接頭辞の除去はしない
export function sanitizeText(text: string): string {
  return text
    .split('\n')
    .map((line) => redactSecrets(sanitizeForTerminal(removeEscapeSequences(line))))
    .join('\n');
}

// オブジェクトのキーと文字列の葉に sanitizeText を掛ける。`__proto__` も own property にするため、
// 代入ではなく property の定義で作る。無害化でキーが重なれば後の値が残る
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      Object.defineProperty(out, sanitizeText(key), {
        value: sanitizeValue(child),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return value;
}

// JSON として読めれば値ごとに無害化して JSON のまま保つ。全文に redactSecrets を掛けると、
// 値の中の引用符が秘密の `\S*` に飲まれて JSON が壊れる。読めない・たどれない (深い入れ子など) ときは
// 入力全体をテキストとして無害化する (fail-closed: 無害化しない内容を返す経路は無い)
export function sanitizeArtifact(raw: string): string {
  try {
    return `${JSON.stringify(sanitizeValue(JSON.parse(raw)), null, 2)}\n`;
  } catch {
    return sanitizeText(raw);
  }
}

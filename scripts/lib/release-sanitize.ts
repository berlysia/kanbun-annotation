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

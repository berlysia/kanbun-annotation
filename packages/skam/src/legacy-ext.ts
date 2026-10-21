/**
 * 宣言 (`extensions`) の無い文書の `ext` (0.2 までの自由なデータ) を `custom` に移す。
 */

import { REGISTERED_NAMES } from './extension-validation.js';
import type { SKAMDocument } from './index.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 宣言の無い文書のすべての `ext` を、同じオブジェクトの `custom` に移す。
 * 対象は文書、readings、ブロック、token、注記、derivations。宣言は足さない。
 *
 * `ext` の値は展開せずそのまま `custom` に置く。キーを 1 つずつ代入すると、
 * own の `__proto__` キーが prototype の設定になり、値が失われるか汚染になるため。
 * 移す先の `custom` が既にあるときは、黙って合わせると片方の値が消えるので `TypeError` にする。
 *
 * @returns `document` は新しい文書 (引数は書き換えない)。`registeredNameKeys` は、移した `ext` のうち
 *   登録済みの拡張の名前と同じキーの path (例 `marks[3].ext.edu`)。宣言の書き忘れだったかを呼ぶ側が確かめる
 * @throws {TypeError} 宣言 (`extensions` / `extensionsRequired`) のある文書、オブジェクトでない `ext`、
 *   `custom` が既にあるオブジェクト。メッセージには path だけを入れ、値は入れない
 */
export function moveLegacyExtToCustom(doc: SKAMDocument): {
  document: SKAMDocument;
  registeredNameKeys: string[];
} {
  if (doc.extensions !== undefined || doc.extensionsRequired !== undefined) {
    throw new TypeError(
      'moveLegacyExtToCustom is for documents without extensions; this document declares extensions'
    );
  }

  const registeredNameKeys: string[] = [];
  const move = <T extends object>(owner: T, path: string): T => {
    const { ext, ...rest } = owner as T & { ext?: unknown; custom?: unknown };
    if (ext === undefined) return owner;
    const where = path === '' ? 'the document' : path;
    if (!isObject(ext)) {
      throw new TypeError(`ext of ${where} must be an object`);
    }
    if (rest.custom !== undefined) {
      throw new TypeError(`${where} has both ext and custom; merge them by hand`);
    }
    const extPath = path === '' ? 'ext' : `${path}.ext`;
    for (const name of Object.keys(ext)) {
      if (REGISTERED_NAMES.has(name)) registeredNameKeys.push(`${extPath}.${name}`);
    }
    return { ...rest, custom: ext } as T;
  };
  const moveAll = <T extends object>(list: readonly T[] | undefined, field: string) =>
    list?.map((item, index) => move(item, `${field}[${index}]`));

  // registeredNameKeys を文書の順に並べるため、文書自身を先に移す
  const moved = move(doc, '');
  const document: SKAMDocument = {
    ...moved,
    readings: moveAll(doc.readings, 'readings')!,
    blocks: moveAll(doc.blocks, 'blocks')!,
    tokens: moveAll(doc.tokens, 'tokens')!,
    marks: moveAll(doc.marks, 'marks')!,
  };
  if (doc.derivations !== undefined) {
    document.derivations = moveAll(doc.derivations, 'derivations')!;
  }
  return { document, registeredNameKeys };
}

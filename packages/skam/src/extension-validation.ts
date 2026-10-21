/**
 * `ext` / `custom` / 拡張の宣言の検査。
 *
 * `ext` と `custom` は信頼しない入力として扱う。検査は再帰でなく、スタックを使った反復で行い、
 * 上限を超えたらすぐやめる。plain object への代入はしない (`__proto__` で prototype を汚染しない)。
 */

import {
  type ValidationError,
  type ValidationWarning,
  LEGACY_EXT,
  LEGACY_EXT_REGISTERED_NAME,
  createValidationError,
} from './errors.js';
import { extensionRegistry, isExtensionName } from './extensions/index.js';
import type { ExtensionOwner, SKAMExtensionDefinition } from './extensions/types.js';

/** 入れ子の段数の上限 (`ext` / `custom` の値自身を 1 段とする) */
const MAX_DEPTH = 32;
/** 1 つのオブジェクトのキーの数の上限 */
const MAX_KEYS = 1000;
/** 配列の長さの上限 */
const MAX_ARRAY_LENGTH = 10000;
/** 文書全体の `ext` と `custom` の値の数の上限 */
const MAX_TOTAL_VALUES = 100000;

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 文書全体で共有する値の数の予算 */
interface Budget {
  seen: number;
  exceeded: boolean;
}

/**
 * `ext` / `custom` の中身が上限の中にあるか検査する。誤りを 1 つ見つけたらやめる。
 * 全体の上限を超えた後は、何も報告せずに戻る (報告は 1 回)。
 */
function checkFreeData(
  root: unknown,
  rootPath: string,
  budget: Budget,
  errors: ValidationError[]
): boolean {
  if (budget.exceeded) return false;
  const fail = (path: string, message: string, expected: string): false => {
    errors.push(createValidationError('INVALID_VALUE', path, message, expected));
    return false;
  };

  const stack: { value: unknown; depth: number; path: string }[] = [
    { value: root, depth: 1, path: rootPath },
  ];
  while (stack.length > 0) {
    const { value, depth, path } = stack.pop()!;
    budget.seen++;
    if (budget.seen > MAX_TOTAL_VALUES) {
      budget.exceeded = true;
      return fail(
        path,
        `ext and custom hold more than ${MAX_TOTAL_VALUES} values in total`,
        `at most ${MAX_TOTAL_VALUES} values`
      );
    }
    if (typeof value !== 'object' || value === null) continue;
    if (depth > MAX_DEPTH) {
      return fail(
        path,
        `ext and custom nest deeper than ${MAX_DEPTH} levels`,
        `depth <= ${MAX_DEPTH}`
      );
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) {
        return fail(path, `array longer than ${MAX_ARRAY_LENGTH}`, `length <= ${MAX_ARRAY_LENGTH}`);
      }
      for (let i = 0; i < value.length; i++) {
        stack.push({ value: value[i], depth: depth + 1, path: `${path}[${i}]` });
      }
      continue;
    }
    const keys = Object.keys(value);
    if (keys.length > MAX_KEYS) {
      return fail(path, `object with more than ${MAX_KEYS} keys`, `keys <= ${MAX_KEYS}`);
    }
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key)) {
        return fail(
          `${path}.${key}`,
          `key "${key}" is not allowed`,
          'key other than __proto__, constructor, prototype'
        );
      }
      stack.push({
        value: (value as Record<string, unknown>)[key],
        depth: depth + 1,
        path: `${path}.${key}`,
      });
    }
  }
  return true;
}

/** 拡張の宣言 (`extensions` / `extensionsRequired`) を検査する。宣言の有無と、宣言した名前の集合を返す */
export function validateDeclaration(
  input: Record<string, unknown>,
  definitions: ReadonlyMap<string, SKAMExtensionDefinition>,
  errors: ValidationError[]
): { declared: boolean; used: ReadonlySet<string>; required: ReadonlySet<string> } {
  const fail = (path: string, message: string, expected: string, actual?: unknown): void => {
    errors.push(createValidationError('INVALID_EXTENSION', path, message, expected, actual));
  };
  const readNames = (field: 'extensions' | 'extensionsRequired'): ReadonlySet<string> => {
    const names = new Set<string>();
    const value = input[field];
    if (value === undefined) return names;
    if (!Array.isArray(value)) {
      fail(field, `${field} must be an array of extension names`, 'array', typeof value);
      return names;
    }
    value.forEach((name: unknown, index) => {
      const path = `${field}[${index}]`;
      if (!isExtensionName(name)) {
        fail(
          path,
          'Extension name must be lowercase letters and digits, starting with a letter',
          'a-z0-9',
          typeof name
        );
      } else if (names.has(name)) {
        fail(path, `Extension "${name}" is listed more than once`, 'unique names');
      } else {
        names.add(name);
      }
    });
    return names;
  };

  const declared = input['extensions'] !== undefined;
  const used = readNames('extensions');
  const required = readNames('extensionsRequired');
  if (!declared && input['extensionsRequired'] !== undefined) {
    fail('extensionsRequired', 'extensionsRequired requires extensions', 'extensions');
  }
  if (declared) {
    const requiredList = Array.isArray(input['extensionsRequired'])
      ? (input['extensionsRequired'] as unknown[])
      : [];
    requiredList.forEach((name, index) => {
      if (typeof name !== 'string' || !required.has(name)) return;
      const path = `extensionsRequired[${index}]`;
      if (!used.has(name)) {
        fail(
          path,
          `Required extension "${name}" must also be listed in extensions`,
          'subset of extensions'
        );
      } else if (!definitions.has(name)) {
        fail(path, `Required extension "${name}" is not known`, 'a known extension');
      }
    });
  }
  return { declared, used, required };
}

/** 登録簿の名前の集合。配列の登録簿を `ext` のキーごとに走査しないために 1 回だけ作る */
export const REGISTERED_NAMES: ReadonlySet<string> = new Set(
  extensionRegistry.map((entry) => entry.name)
);

const LEGACY_EXT_MESSAGE =
  'ext in a document without extensions is read as free data; it becomes an error in 0.4.0. Move it to custom with moveLegacyExtToCustom';
const LEGACY_EXT_REGISTERED_NAME_MESSAGE =
  'This ext key is the name of a registered extension. If it holds the extension value, declare the extension in extensions';

/**
 * 文書全体の `ext` と `custom` を検査する。
 * 宣言の無い文書の `ext` は自由なデータとして読み、`warnings` に警告を足す
 */
export function validateExtensionData(
  input: Record<string, unknown>,
  definitions: ReadonlyMap<string, SKAMExtensionDefinition>,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  const { declared, used, required } = validateDeclaration(input, definitions, errors);
  const budget: Budget = { seen: 0, exceeded: false };
  const usedRequired = new Set<string>();

  const check = (owner: Record<string, unknown>, path: string, kind: ExtensionOwner['kind']) => {
    const at = (field: string): string => (path === '' ? field : `${path}.${field}`);
    // 注記の ext の型は注記の検査が報告するので、ここでは型の違う注記を飛ばす
    const ownerOf = (): ExtensionOwner =>
      kind === 'mark' ? { kind: 'mark', mark: owner as never } : ({ kind } as ExtensionOwner);
    const custom = owner['custom'];
    if (custom !== undefined) {
      if (!isObject(custom)) {
        errors.push(
          createValidationError(
            'INVALID_TYPE',
            at('custom'),
            'custom must be an object if provided',
            'object',
            typeof custom
          )
        );
      } else {
        checkFreeData(custom, at('custom'), budget, errors);
      }
    }
    const ext = owner['ext'];
    if (ext === undefined) return;
    if (!isObject(ext)) {
      if (kind !== 'mark') {
        errors.push(
          createValidationError(
            'INVALID_TYPE',
            at('ext'),
            'ext must be an object if provided',
            'object',
            typeof ext
          )
        );
      }
      return;
    }
    if (!checkFreeData(ext, at('ext'), budget, errors)) return;
    if (!declared) {
      // shiori: LEGACY-EXT:validator
      warnings.push({ kind: LEGACY_EXT, path: at('ext'), message: LEGACY_EXT_MESSAGE });
      for (const name of Object.keys(ext)) {
        if (REGISTERED_NAMES.has(name)) {
          warnings.push({
            kind: LEGACY_EXT_REGISTERED_NAME,
            path: `${at('ext')}.${name}`,
            message: LEGACY_EXT_REGISTERED_NAME_MESSAGE,
          });
        }
      }
      return;
    }
    for (const name of Object.keys(ext)) {
      const namePath = `${at('ext')}.${name}`;
      if (!used.has(name)) {
        errors.push(
          createValidationError(
            'INVALID_EXTENSION',
            namePath,
            `ext key "${name}" is not listed in extensions`,
            'a name listed in extensions'
          )
        );
        continue;
      }
      const definition = definitions.get(name);
      if (definition === undefined) continue;
      if (definition.required) usedRequired.add(name);
      if (definition.validate) errors.push(...definition.validate(ext[name], namePath, ownerOf()));
    }
  };

  check(input, '', 'document');
  const each = (field: string, kind: ExtensionOwner['kind']) => {
    const list = input[field];
    if (!Array.isArray(list)) return;
    list.forEach((item: unknown, index) => {
      if (isObject(item)) check(item, `${field}[${index}]`, kind);
    });
  };
  each('readings', 'reading');
  each('blocks', 'block');
  each('tokens', 'token');
  each('marks', 'mark');
  each('derivations', 'derivation');

  for (const name of usedRequired) {
    if (!required.has(name)) {
      errors.push(
        createValidationError(
          'INVALID_EXTENSION',
          'extensionsRequired',
          `Extension "${name}" is required by its specification, so the document must list it in extensionsRequired`,
          `extensionsRequired includes "${name}"`
        )
      );
    }
  }
}

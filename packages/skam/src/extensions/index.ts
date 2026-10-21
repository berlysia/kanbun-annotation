/**
 * @kanbun-skam/skam/extensions
 *
 * 拡張の束。SKAM の仕様が定める拡張の定義をまとめ、validator、parser、stringify、renderer の既定にする。
 * 個々の拡張を import するのはこのファイルだけ。
 */

import { eduExtension } from './edu/index.js';
import type { SKAMExtensionDefinition } from './types.js';

export type {
  ExtensionOwner,
  HiddenParts,
  SKAMExtensionDefinition,
  XmlElementMarks,
} from './types.js';
export { extensionRegistry, type ExtensionRegistryEntry } from './registry.js';

/** SKAM の仕様が定める拡張の定義 */
export const defaultExtensions: readonly SKAMExtensionDefinition[] = [eduExtension];

export {
  assertHideQuizOption,
  isQuizHidden,
  type EduExtension,
  type HideQuizOption,
  type QuizMarkType,
} from './edu/index.js';

const EXTENSION_NAME = /^[a-z0-9]+$/;

/**
 * 既定の束に、利用者が足した定義を加えた定義を、名前で引ける形で返す。
 * 名前が重なれば TypeError (黙って上書きしない)。
 */
export function resolveExtensions(
  extra?: readonly SKAMExtensionDefinition[]
): ReadonlyMap<string, SKAMExtensionDefinition> {
  const byName = new Map<string, SKAMExtensionDefinition>();
  for (const definition of [...defaultExtensions, ...(extra ?? [])]) {
    if (typeof definition.name !== 'string' || !EXTENSION_NAME.test(definition.name)) {
      throw new TypeError('Extension name must consist of lowercase letters and digits');
    }
    if (byName.has(definition.name)) {
      throw new TypeError(`Extension "${definition.name}" is defined more than once`);
    }
    byName.set(definition.name, definition);
  }
  return byName;
}

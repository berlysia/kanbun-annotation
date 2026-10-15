import type { StringifyLoss } from '@kanbun-skam/skam-xml-stringify';
import type { ParseError } from './editor/error-panel.js';

/** Turn stringify losses into entries the error panel can show. */
export function formatStringifyLosses(losses: readonly StringifyLoss[]): ParseError[] {
  return losses.map((l) => ({
    message: `XMLに変換できない注記があります (${l.category}: ${l.code}, ${l.path}): ${l.message}`,
  }));
}

import type { SKAMDocument } from '@kanbun-skam/skam';
import { parse as parseNotation } from '@kanbun-skam/skam-text-parser';
import { parse as parseXml, SKAMXMLParseError } from '@kanbun-skam/skam-xml-parser';
import type { ParseError } from './error-panel.js';

export type InputFormat = 'xml' | 'notation';

export function parseInput(
  format: InputFormat,
  text: string
): { doc: SKAMDocument | null; errors: ParseError[] } {
  if (!text.trim()) {
    return {
      doc: null,
      errors: [
        { message: format === 'xml' ? 'XMLを入力してください' : '簡易記法を入力してください' },
      ],
    };
  }

  if (format === 'notation') {
    const result = parseNotation(text);
    return {
      doc: result.ok ? result.document : null,
      errors: result.diagnostics.map(({ message, line, column, severity, code }) => ({
        message,
        line,
        column,
        severity,
        code,
      })),
    };
  }

  try {
    return { doc: parseXml(text.trim()), errors: [] };
  } catch (err) {
    const error: ParseError = {
      message: err instanceof Error ? err.message : '不明なエラーが発生しました',
    };
    if (err instanceof SKAMXMLParseError) {
      if (err.line !== undefined) error.line = err.line;
      if (err.column !== undefined) error.column = err.column;
    }
    return { doc: null, errors: [error] };
  }
}

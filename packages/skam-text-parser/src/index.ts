import { validateSKAMDocument } from '@kanbun-skam/skam';
import { resolveOptions } from './options.js';
import type { NotationOptions } from './options.js';
import { build } from './build.js';
import { diagnostic, lineStarts, pathRange } from './diagnostics.js';
import type { NotationResult } from './diagnostics.js';

export { NotationConfigError } from './options.js';
export type { FeatureName, SymbolPair, SymbolTable, NotationOptions } from './options.js';
export type { NotationDiagnostic, NotationResult } from './diagnostics.js';

export function createParser(options?: NotationOptions): { parse(source: string): NotationResult } {
  const resolved = resolveOptions(options);
  return {
    parse(source: string): NotationResult {
      if (source.length > resolved.maxInputLength)
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              [0],
              { start: 0, end: 0 },
              'INPUT_TOO_LONG',
              `Input exceeds ${resolved.maxInputLength} UTF-16 units`
            ),
          ],
        };
      const normalized = source.replace(/\r\n?/g, '\n');
      const starts = lineStarts(normalized);
      const built = build(normalized, resolved, starts);
      if (built.diagnostics.some((entry) => entry.severity === 'error'))
        return { ok: false, diagnostics: built.diagnostics };
      const validation = validateSKAMDocument(built.document);
      if (!validation.valid)
        return {
          ok: false,
          diagnostics: validation.errors.map((entry) =>
            diagnostic(starts, pathRange(entry.path, built.sourceMap), entry.kind, entry.message)
          ),
        };
      const diagnostics = (validation.warnings ?? []).map((entry) =>
        diagnostic(
          starts,
          pathRange(entry.path, built.sourceMap),
          entry.kind,
          entry.message,
          'warning'
        )
      );
      return { ok: true, document: built.document, diagnostics };
    },
  };
}

export function parse(source: string, options?: NotationOptions): NotationResult {
  return createParser(options).parse(source);
}

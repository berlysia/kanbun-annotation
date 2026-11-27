import type { SKAMDocument } from '@kanbun-skam/skam';

export interface NotationDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export type NotationResult =
  | {
      readonly ok: true;
      readonly document: SKAMDocument;
      readonly diagnostics: readonly NotationDiagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly NotationDiagnostic[] };

export interface SourceRange {
  readonly start: number;
  readonly end: number;
}
export interface SourceMap {
  readonly tokens: readonly SourceRange[];
  readonly marks: readonly SourceRange[];
  readonly blocks: readonly SourceRange[];
}

export function lineStarts(source: string): readonly number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  return starts;
}

function position(starts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (starts[mid]! <= offset) low = mid;
    else high = mid;
  }
  return { line: low + 1, column: offset - starts[low]! + 1 };
}

export function diagnostic(
  starts: readonly number[],
  range: SourceRange,
  code: string,
  message: string,
  severity: 'error' | 'warning' = 'error'
): NotationDiagnostic {
  const start = position(starts, range.start);
  const end = position(starts, range.end);
  return { severity, code, message, ...start, endLine: end.line, endColumn: end.column };
}

export function pathRange(path: string, map: SourceMap): SourceRange {
  const match = /^(tokens|marks|blocks)\[(\d+)\]/.exec(path);
  if (!match) return { start: 0, end: 0 };
  const collection = map[match[1] as keyof SourceMap];
  return collection[Number(match[2])] ?? { start: 0, end: 0 };
}

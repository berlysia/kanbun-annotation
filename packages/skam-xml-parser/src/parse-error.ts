/**
 * Parse error types (shared by pre-scan, XML parsers and parser-core; kept separate to avoid circular imports)
 */

/**
 * Position information in the source XML
 */
export interface PositionInfo {
  /** 1-based line number */
  line: number;
  /** 1-based column number */
  column: number;
  /** 0-based byte offset from the start of the source */
  offset: number;
}

export class SKAMXMLParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(message);
    this.name = 'SKAMXMLParseError';
  }
}

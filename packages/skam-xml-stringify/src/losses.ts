/**
 * Loss contract for SKAM-ML stringification.
 *
 * `unrepresentable` = SKAM-ML intentionally does not describe it (or it is invalid JSON anyway).
 * `unsupported` = SKAM-ML v0.1 has no notation for it yet; a later spec revision could add one.
 */
export type StringifyLossCode =
  | 'DERIVATIONS'
  | 'ASCII_WHITESPACE_TOKEN'
  | 'BLOCK_START_KAERI'
  | 'DANGLING_REFERENCE'
  | 'CROSS_BLOCK_ANCHOR'
  | 'PARTIAL_OVERLAP'
  | 'UNNESTABLE_OVERLAP'
  | 'EXT'
  | 'PLACEMENT_HINT'
  // Codes may be added later, so exhaustive switches need a default branch.
  | (string & {});

export interface StringifyLoss {
  category: 'unrepresentable' | 'unsupported';
  code: StringifyLossCode;
  /** JSON Pointer (RFC 6901) to the field or element that could not be written */
  path: string;
  markId?: string;
  message: string;
}

export class SKAMXMLStringifyError extends Error {
  readonly losses: readonly StringifyLoss[];

  constructor(losses: readonly StringifyLoss[]) {
    super(
      `SKAM-ML cannot represent ${losses.length} item(s): ${losses
        .slice(0, 3)
        .map((l) => `${l.path} ${l.code}`)
        .join(', ')}`
    );
    this.name = 'SKAMXMLStringifyError';
    this.losses = losses;
  }
}

/** Sort key. Document-level losses use blockIndex = -1; fieldOrder breaks ties at the same position (ext=0, derivations=1). */
export interface LossSortKey {
  blockIndex: number;
  tokenIndex: number;
  markIndex: number;
  fieldOrder: number;
}

/**
 * Losses are recorded while converting (so detection can never disagree with output),
 * then sorted into document order for a deterministic result.
 */
export class LossCollector {
  private readonly items: { loss: StringifyLoss; key: LossSortKey }[] = [];

  add(loss: StringifyLoss, key: LossSortKey): void {
    this.items.push({ loss, key });
  }

  /** Array.prototype.sort is stable (ES2019), so equal keys keep their recording order. */
  sorted(): StringifyLoss[] {
    return [...this.items]
      .sort(
        (a, b) =>
          a.key.blockIndex - b.key.blockIndex ||
          a.key.tokenIndex - b.key.tokenIndex ||
          a.key.markIndex - b.key.markIndex ||
          a.key.fieldOrder - b.key.fieldOrder
      )
      .map((x) => x.loss);
  }
}

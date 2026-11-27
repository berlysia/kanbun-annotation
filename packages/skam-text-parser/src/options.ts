export type FeatureName =
  | 'kaeri'
  | 'okurigana'
  | 'yomigana'
  | 'kutoten'
  | 'linebreak'
  | 'saidoku'
  | 'soegana'
  | 'tateten';

export interface SymbolPair {
  readonly open: string;
  readonly close: string;
}

export interface SymbolTable {
  readonly kaeri: readonly SymbolPair[];
  readonly yomigana: readonly SymbolPair[];
  readonly rangeStart: readonly string[];
  readonly saidoku: readonly SymbolPair[];
  readonly soegana: readonly string[];
  readonly tateten: readonly string[];
  readonly kutoten: readonly { readonly symbol: string; readonly kind: 'ku' | 'ten' | 'other' }[];
  readonly escape: readonly string[];
}

export interface NotationOptions {
  readonly features?: Partial<Record<FeatureName, boolean>>;
  readonly symbols?: Partial<SymbolTable>;
  readonly maxInputLength?: number;
}

type ConfigIssue = {
  readonly code: 'SYMBOL_CONFLICT' | 'EMPTY_SYMBOL' | 'INVALID_LIMIT';
  readonly message: string;
};

export class NotationConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.name = 'NotationConfigError';
    this.issues = issues;
  }
}

const defaults: SymbolTable = {
  kaeri: [
    { open: '＜', close: '＞' },
    { open: '<', close: '>' },
  ],
  yomigana: [
    { open: '（', close: '）' },
    { open: '(', close: ')' },
  ],
  rangeStart: ['｜', '|'],
  saidoku: [
    { open: '｛', close: '｝' },
    { open: '{', close: '}' },
  ],
  soegana: ['＋', '+'],
  tateten: ['ー', '-', '－'],
  kutoten: [
    { symbol: '。', kind: 'ku' },
    { symbol: '、', kind: 'ten' },
    { symbol: '・', kind: 'other' },
  ],
  escape: ['＼', '￥', '\\', '¥'],
};

export interface SyntaxSymbol {
  readonly symbol: string;
  readonly owner: FeatureName | 'escape' | 'reserved';
  readonly role: 'open' | 'close' | 'rangeStart' | 'single';
  readonly close?: string;
  readonly kind?: 'ku' | 'ten' | 'other';
}

export interface ResolvedOptions {
  readonly features: Readonly<Record<FeatureName, boolean>>;
  readonly symbols: readonly SyntaxSymbol[];
  readonly maxInputLength: number;
}

function symbolIssues(symbols: readonly SyntaxSymbol[]): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  for (let i = 0; i < symbols.length; i++) {
    const a = symbols[i]!;
    if (!a.symbol.length) {
      issues.push({ code: 'EMPTY_SYMBOL', message: `Empty symbol for ${a.owner}` });
      continue;
    }
    for (let j = i + 1; j < symbols.length; j++) {
      const b = symbols[j]!;
      if (b.symbol.length && (a.symbol.startsWith(b.symbol) || b.symbol.startsWith(a.symbol))) {
        issues.push({
          code: 'SYMBOL_CONFLICT',
          message: `Symbol ${JSON.stringify(a.symbol)} (${a.owner}) conflicts with ${JSON.stringify(b.symbol)} (${b.owner})`,
        });
      }
    }
  }
  return issues;
}

export function resolveOptions(options: NotationOptions = {}): ResolvedOptions {
  const features = {
    kaeri: true,
    okurigana: true,
    yomigana: true,
    kutoten: true,
    linebreak: true,
    saidoku: true,
    soegana: true,
    tateten: true,
    ...options.features,
  };
  const table: SymbolTable = { ...defaults, ...options.symbols };
  const symbols: SyntaxSymbol[] = [];
  for (const owner of ['kaeri', 'yomigana', 'saidoku'] as const) {
    if (!features[owner]) continue;
    for (const pair of table[owner]) {
      symbols.push(
        { symbol: pair.open, owner, role: 'open', close: pair.close },
        { symbol: pair.close, owner, role: 'close' }
      );
    }
  }
  if (features.yomigana)
    for (const symbol of table.rangeStart)
      symbols.push({ symbol, owner: 'yomigana', role: 'rangeStart' });
  for (const owner of ['soegana', 'tateten', 'escape'] as const) {
    if (owner !== 'escape' && !features[owner]) continue;
    for (const symbol of table[owner]) symbols.push({ symbol, owner, role: 'single' });
  }
  if (features.kutoten)
    for (const item of table.kutoten) symbols.push({ ...item, owner: 'kutoten', role: 'single' });
  for (const symbol of ['「', '」', '『', '』'])
    symbols.push({ symbol, owner: 'reserved', role: 'single' });
  const issues = symbolIssues(symbols);
  // 1,000,000 では「漢」の繰り返しで parse 1 回が約 2.8 秒、ヒープの増分が最大 771 MB になり、信頼できない入力の守りとして重すぎた（ADR-048）
  const maxInputLength = options.maxInputLength ?? 100_000;
  if (!Number.isInteger(maxInputLength) || maxInputLength < 1)
    issues.push({
      code: 'INVALID_LIMIT',
      message: 'maxInputLength must be an integer of at least 1',
    });
  if (issues.length) throw new NotationConfigError(issues);
  return { features, symbols, maxInputLength };
}

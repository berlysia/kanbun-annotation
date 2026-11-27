import { splitGraphemes } from '@kanbun-skam/skam';
import type { ResolvedOptions, SyntaxSymbol } from './options.js';
import type { SourceRange } from './diagnostics.js';

export interface Lexeme extends SourceRange {
  readonly type: 'text' | 'kana' | 'symbol' | 'newline';
  readonly value: string;
  readonly syntax?: SyntaxSymbol;
}

export interface SourceBlock extends SourceRange {
  readonly text: string;
}

export function sourceBlocks(source: string): readonly SourceBlock[] {
  const blocks: SourceBlock[] = [];
  let start: number | undefined;
  let end = 0;
  let offset = 0;
  for (const line of source.split('\n')) {
    if (/^[ \t　]*$/.test(line)) {
      if (start !== undefined) blocks.push({ start, end, text: source.slice(start, end) });
      start = undefined;
    } else {
      start ??= offset;
      end = offset + line.length;
    }
    offset += line.length + 1;
  }
  if (start !== undefined) blocks.push({ start, end, text: source.slice(start, end) });
  return blocks;
}

export function isKana(value: string): boolean {
  return /^[\u3041-\u3096\u309D-\u309E\u30A1-\u30FA\u30FD-\u30FE\u31F0-\u31FF][\u3099\u309A]*$/u.test(
    value
  );
}

export function scan(block: SourceBlock, options: ResolvedOptions): readonly Lexeme[] {
  const clusters = splitGraphemes(block.text);
  const lexemes: Lexeme[] = [];
  let offset = 0;
  let clusterIndex = 0;
  let clusterStart = 0;
  const grapheme = (): string => {
    while (
      clusterIndex < clusters.length &&
      clusterStart + clusters[clusterIndex]!.length <= offset
    ) {
      clusterStart += clusters[clusterIndex++]!.length;
    }
    return clusters[clusterIndex]?.slice(offset - clusterStart) ?? '';
  };
  while (offset < block.text.length) {
    const cluster = grapheme();
    const start = block.start + offset;
    const syntax = options.symbols.find((symbol) => block.text.startsWith(symbol.symbol, offset));
    if (syntax) {
      offset += syntax.symbol.length;
      // 改行を escape すると改行が本文の字になり、書いた人は気づけないので、escape の対象にしない
      if (syntax.owner === 'escape' && offset < block.text.length && grapheme() !== '\n') {
        const value = grapheme();
        offset += value.length;
        lexemes.push({ type: 'text', value, start, end: block.start + offset });
      } else
        lexemes.push({
          type: 'symbol',
          value: syntax.symbol,
          syntax,
          start,
          end: block.start + offset,
        });
    } else {
      offset += cluster.length;
      if (cluster === '\n') {
        if (options.features.linebreak)
          lexemes.push({ type: 'newline', value: cluster, start, end: block.start + offset });
      } else if (!/^[ \t　]+$/.test(cluster))
        lexemes.push({
          type: isKana(cluster) ? 'kana' : 'text',
          value: cluster,
          start,
          end: block.start + offset,
        });
    }
  }
  return lexemes;
}

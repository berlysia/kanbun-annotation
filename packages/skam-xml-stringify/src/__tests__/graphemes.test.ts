import { describe, it, expect } from 'vitest';
import { stringify, SKAMXMLStringifyError, type StringifyLoss } from '../index.js';
import type { SKAMDocument } from '@kanbun-skam/skam';

const docOf = (...texts: string[]): SKAMDocument => ({
  format: 'skam@0.1',
  readings: [],
  tokens: texts.map((text, i) => ({ id: `t${i + 1}`, text })),
  blocks: [{ id: 'b1', tokenIds: texts.map((_, i) => `t${i + 1}`) }],
  marks: [],
});

const lossesOf = (d: SKAMDocument): StringifyLoss[] => {
  const out: StringifyLoss[] = [];
  stringify(d, { lossy: true, onLoss: (l) => out.push(l) });
  return out;
};

const codesOf = (d: SKAMDocument) => lossesOf(d).map((l) => `${l.category}:${l.code}@${l.path}`);

describe('stringify - MULTI_GRAPHEME_TOKEN', () => {
  it('throws for a token of two graphemes without lossy, without echoing the text', () => {
    let error: unknown;
    try {
      stringify(docOf('學', '学問'));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SKAMXMLStringifyError);
    const losses = (error as SKAMXMLStringifyError).losses;
    expect(losses).toHaveLength(1);
    expect(losses[0]).toMatchObject({
      category: 'unrepresentable',
      code: 'MULTI_GRAPHEME_TOKEN',
      path: '/tokens/1',
    });
    expect(losses[0]!.message).not.toContain('学問');
  });

  it('reports the path of the first token as /tokens/0', () => {
    expect(codesOf(docOf('学問'))).toEqual(['unrepresentable:MULTI_GRAPHEME_TOKEN@/tokens/0']);
  });

  it('reports one loss with lossy: true', () => {
    expect(lossesOf(docOf('學', '学問'))).toHaveLength(1);
  });

  it('is not a loss for a single grapheme cluster (IVS, combining voiced mark)', () => {
    expect(codesOf(docOf('葛\u{E0100}', 'が'))).toEqual([]);
  });

  it('reports only ASCII_WHITESPACE_TOKEN for whitespace-only tokens', () => {
    expect(codesOf(docOf('  ', '\r\n'))).toEqual([
      'unrepresentable:ASCII_WHITESPACE_TOKEN@/tokens/0',
      'unrepresentable:ASCII_WHITESPACE_TOKEN@/tokens/1',
    ]);
  });

  it('is not a loss for a space followed by a combining mark (accepted limit)', () => {
    expect(codesOf(docOf(' ́'))).toEqual([]);
  });
});

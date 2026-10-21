import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { stringify } from '../index.js';

const doc = (over: Record<string, unknown> = {}): SKAMDocument =>
  ({
    format: 'skam@0.1',
    readings: [],
    tokens: [{ id: 't1', text: '甲' }],
    blocks: [{ id: 'b1', tokenIds: ['t1'] }],
    marks: [],
    ...over,
  }) as SKAMDocument;

const rootTag = (xml: string) => /<skam:doc[^>]*>/.exec(xml)![0];

describe('stringify lang', () => {
  it('writes xml:lang on the root when lang is a string', () => {
    expect(rootTag(stringify(doc({ lang: 'lzh' })))).toContain(' xml:lang="lzh"');
  });

  it('writes no xml:lang without lang', () => {
    expect(rootTag(stringify(doc()))).not.toContain('xml:lang');
  });

  // 出力を parse し直す検査は integration-tests にある (この package は parser に依存しない)
  it('escapes the value', () => {
    expect(rootTag(stringify(doc({ lang: 'a"b<c&' })))).toContain(' xml:lang="a&quot;b&lt;c&amp;"');
  });

  it('writes no xml:lang when lang is not a string', () => {
    expect(rootTag(stringify(doc({ lang: 1 })))).not.toContain('xml:lang');
  });
});

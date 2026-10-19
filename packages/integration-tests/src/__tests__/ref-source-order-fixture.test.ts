/**
 * ref-source-order fixture の自己検査。
 * tokens[] と marks[] の順が原文の順と違うことが、VRT と DOM 検査の検出力の前提。
 */

import { describe, it, expect } from 'vitest';
import { validateSKAMDocument } from '@kanbun-skam/skam';
import { FIXTURE_REF_SOURCE_ORDER as doc } from '../fixtures/test-documents.js';

describe('ref-source-order fixture', () => {
  it('has tokens[] in a different order from the source order', () => {
    const sourceOrder = doc.blocks[0]!.tokenIds;
    expect(doc.tokens.map((t) => t.id)).not.toEqual(sourceOrder);
  });

  it('has ref marks[] in a different order from the source order', () => {
    const refContents = doc.marks.flatMap((m) => (m.type === 'ref' ? [m.content] : []));
    expect(refContents).toEqual(['注C', '注A', '注B']);
    expect(refContents).not.toEqual(['注A', '注B', '注C']);
  });

  it('places refs after the 1st, 3rd and 5th source tokens as 注A, 注B, 注C', () => {
    const sourceOrder = doc.blocks[0]!.tokenIds;
    const afterIndexByContent = new Map(
      doc.marks.flatMap((m) =>
        m.type === 'ref' && 'after' in m.position
          ? [[m.content, sourceOrder.indexOf(m.position.after)] as const]
          : []
      )
    );
    expect(afterIndexByContent.get('注A')).toBe(0);
    expect(afterIndexByContent.get('注B')).toBe(2);
    expect(afterIndexByContent.get('注C')).toBe(4);
  });

  it('is a valid SKAM document', () => {
    expect(validateSKAMDocument(doc).valid).toBe(true);
  });
});

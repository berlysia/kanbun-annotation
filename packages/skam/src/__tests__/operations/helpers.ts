import type { SKAMDocument, Mark } from '../../index.js';
import { assertSKAMDocument } from '../../validator.js';

/** assertSKAMDocument のラッパー。テストの初期状態と操作結果の両方で使用 */
export function assertValidDocument(doc: unknown): asserts doc is SKAMDocument {
  assertSKAMDocument(doc);
}

/** テスト用の最小限のSKAMDocumentを作成（3 token / 1 block） */
export function createTestDocument(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks,
    readings: [],
  };
}

/** テスト用の複数ブロックSKAMDocumentを作成（6 token / 2 block） */
export function createMultiBlockDocument(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
      { id: 't4', text: '而' },
      { id: 't5', text: '時' },
      { id: 't6', text: '習' },
    ],
    blocks: [
      { id: 'b1', tokenIds: ['t1', 't2', 't3'] },
      { id: 'b2', tokenIds: ['t4', 't5', 't6'] },
    ],
    marks,
    readings: [],
  };
}

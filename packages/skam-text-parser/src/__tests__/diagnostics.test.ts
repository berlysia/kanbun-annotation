import { beforeEach, expect, it, vi } from 'vitest';
import * as skam from '@kanbun-skam/skam';
import { parse } from '../index.js';
import { pathRange } from '../diagnostics.js';

vi.mock('@kanbun-skam/skam', { spy: true });
beforeEach(() => vi.clearAllMocks());

it('locates validator linebreak errors at the newline', () => {
  const result = parse('｜所\nー以（ゆゑん）');
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      severity: 'error',
      code: 'INVALID_LINEBREAK',
      line: 1,
      column: 3,
      endLine: 2,
      endColumn: 1,
    })
  );
});
it('accepts non-overlapping saidoku without warnings', () => {
  const result = parse('未（いま）だ｛ず｝');
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toEqual([]);
  if (result.ok) expect(result.document.marks).toHaveLength(1);
});
it('locates saidoku reading overlap at the range start', () => {
  const result = parse('｜未だ｛ず｝知（いまだしらず）');
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      severity: 'warning',
      code: 'SAIDOKU_READING_OVERLAP',
      line: 1,
      column: 1,
    })
  );
});
it('uses UTF-16 columns and exclusive ends', () => {
  expect(parse('學（まな').diagnostics).toContainEqual(
    expect.objectContaining({ line: 1, column: 2, endLine: 1, endColumn: 5 })
  );
  expect(parse('𠮷。\r\n學（まな').diagnostics).toContainEqual(
    expect.objectContaining({ line: 2, column: 2, endLine: 2, endColumn: 5 })
  );
  expect(parse('𠮷「').diagnostics).toContainEqual(
    expect.objectContaining({ line: 1, column: 3, endColumn: 4 })
  );
});
it('does not validate lexical errors or oversized inputs', () => {
  const spy = vi.spyOn(skam, 'validateSKAMDocument');
  parse('學（まな');
  parse('漢漢', { maxInputLength: 1 });
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
it('checks input length before grapheme segmentation', () => {
  const spy = vi.spyOn(skam, 'splitGraphemes');
  const result = parse('漢漢', { maxInputLength: 1 });
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]?.code).toBe('INPUT_TOO_LONG');
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
it('maps token, mark and block paths, with a document-start fallback', () => {
  const map = {
    tokens: [{ start: 2, end: 4 }],
    marks: [{ start: 5, end: 7 }],
    blocks: [{ start: 1, end: 9 }],
  };
  expect(pathRange('tokens[0].text', map)).toEqual(map.tokens[0]);
  expect(pathRange('marks[0].position', map)).toEqual(map.marks[0]);
  expect(pathRange('blocks[0].tokenIds', map)).toEqual(map.blocks[0]);
  expect(pathRange('marks[9]', map)).toEqual({ start: 0, end: 0 });
  expect(pathRange('format', map)).toEqual({ start: 0, end: 0 });
});

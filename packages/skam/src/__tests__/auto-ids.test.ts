import { describe, it, expect } from 'vitest';
import {
  isHandId,
  isAutoId,
  findIdFormIssues,
  groupKanaMarksByAnchor,
  findXmlUnwritableChars,
  renumberAutoIds,
  convertHandIdsToAuto,
} from '../auto-ids.js';
import type { SKAMDocument, Mark } from '../index.js';

function doc(
  partial: Partial<SKAMDocument> & Pick<SKAMDocument, 'tokens' | 'blocks'>
): SKAMDocument {
  return { format: 'skam@0.1', marks: [], readings: [], ...partial };
}

/** 1 ブロック t1..t3 (自動の id) の文書に注記を足す */
function autoDoc(marks: Mark[]): SKAMDocument {
  return doc({
    tokens: [
      { id: 'b#1#1', text: '學' },
      { id: 'b#1#2', text: '而' },
      { id: 'b#1#3', text: '時' },
    ],
    blocks: [{ id: 'b#1', tokenIds: ['b#1#1', 'b#1#2', 'b#1#3'] }],
    marks,
  });
}

describe('isHandId', () => {
  it.each(['1a', 'a:b', 'a b', ' a', 'a#b', '-a', '.a', ''])('%j は手書きの id ではない', (id) => {
    expect(isHandId(id)).toBe(false);
  });

  it.each(['學', '_x', 'a.b', 'a-b', '\u{20000}', 'a1'])('%j は手書きの id', (id) => {
    expect(isHandId(id)).toBe(true);
  });

  it('10 万字の id でも線形の時間で返る', () => {
    const long = 'a'.repeat(100_000) + ' ';
    const start = performance.now();
    expect(isHandId(long)).toBe(false);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('isAutoId', () => {
  it('# を含めば自動の形', () => {
    expect(isAutoId('b#1')).toBe(true);
    expect(isAutoId('m#2')).toBe(true);
    expect(isAutoId('p1')).toBe(false);
  });
});

describe('renumberAutoIds', () => {
  it('位置の値と一致する id は何も変えない', () => {
    const d = doc({
      tokens: [
        { id: 'b#1#1', text: '學' },
        { id: 'b#1#2', text: '而' },
        { id: 'p2#1', text: '時' },
      ],
      blocks: [
        { id: 'b#1', tokenIds: ['b#1#1', 'b#1#2'] },
        { id: 'p2', tokenIds: ['p2#1'] },
      ],
    });
    expect(renumberAutoIds(d)).toEqual(d);
  });

  it('並べ替え後の位置の値に、参照も含めて付け替える', () => {
    const d = doc({
      tokens: [
        { id: 'b#1#1', text: '學' },
        { id: 'b#1#2', text: '而' },
      ],
      blocks: [{ id: 'b#1', tokenIds: ['b#1#2', 'b#1#1'] }],
      marks: [
        { type: 'emphasis', id: 'x', anchor: { from: 'b#1#2', to: 'b#1#2' } },
        { type: 'kutoten', id: 'k', position: { blockId: 'b#1', after: 'b#1#2' }, value: '。' },
        { type: 'ref', id: 'm#2', position: { blockId: 'b#1', after: 'b#1#2' }, label: 'a' },
        {
          type: 'highlight',
          id: 'h',
          anchor: { from: 'b#1#2', to: 'b#1#2' },
          ref: 'm#2',
        },
      ],
      derivations: [{ kind: 'readingOrder', method: 'manual', result: ['b#1#2', 'b#1#1'] }],
    });
    const out = renumberAutoIds(d);
    expect(out.blocks[0]!.tokenIds).toEqual(['b#1#1', 'b#1#2']);
    // 字の配列順は無意味。id は tokenIds の順の値に付け替わる
    expect(out.tokens.map((t) => [t.text, t.id])).toEqual([
      ['學', 'b#1#2'],
      ['而', 'b#1#1'],
    ]);
    expect(out.marks[0]).toMatchObject({ anchor: { from: 'b#1#1', to: 'b#1#1' } });
    expect(out.marks[1]).toMatchObject({ position: { blockId: 'b#1', after: 'b#1#1' } });
    expect(out.marks[2]!.id).toBe('m#3');
    expect(out.marks[3]).toMatchObject({ ref: 'm#3' });
    expect(out.derivations![0]!.result).toEqual(['b#1#1', 'b#1#2']);
  });

  it('注記の自動の id は marks[] の順の値になる', () => {
    const d = autoDoc([
      { type: 'tateten', id: 'a', anchor: { from: 'b#1#1', to: 'b#1#2' } },
      { type: 'tateten', id: 'm#2', anchor: { from: 'b#1#2', to: 'b#1#3' } },
    ]);
    const out = renumberAutoIds(d);
    expect(out.marks.map((m) => m.id)).toEqual(['a', 'm#2']);
    const swapped = { ...d, marks: [d.marks[1]!, d.marks[0]!] };
    expect(renumberAutoIds(swapped).marks.map((m) => m.id)).toEqual(['m#1', 'a']);
  });

  it('入力を変えない', () => {
    const d = autoDoc([{ type: 'tateten', id: 'm#5', anchor: { from: 'b#1#1', to: 'b#1#2' } }]);
    const snapshot = structuredClone(d);
    renumberAutoIds(d);
    expect(d).toEqual(snapshot);
  });

  it('ext と custom の中は見ない', () => {
    const d = autoDoc([
      {
        type: 'tateten',
        id: 'm#9',
        anchor: { from: 'b#1#1', to: 'b#1#2' },
        custom: { target: 'm#9' },
        ext: { x: { target: 'm#9' } },
      },
    ]);
    const out = renumberAutoIds(d);
    expect(out.marks[0]!.id).toBe('m#1');
    expect(out.marks[0]!.custom).toEqual({ target: 'm#9' });
    expect(out.marks[0]!.ext).toEqual({ x: { target: 'm#9' } });
  });

  it('2 回適用しても 1 回と同じ', () => {
    const d = doc({
      tokens: [
        { id: 'b#3#9', text: '學' },
        { id: 'b#3#1', text: '而' },
        { id: 'p#7', text: '時' },
      ],
      blocks: [
        { id: 'b#3', tokenIds: ['b#3#1', 'b#3#9'] },
        { id: 'p1', tokenIds: ['p#7'] },
      ],
      marks: [
        { type: 'tateten', id: 'm#4', anchor: { from: 'b#3#1', to: 'b#3#9' } },
        { type: 'kutoten', id: 'n1', position: { blockId: 'p1', after: 'p#7' }, value: '。' },
      ],
    });
    const once = renumberAutoIds(d);
    expect(renumberAutoIds(once)).toEqual(once);
  });
});

describe('convertHandIdsToAuto', () => {
  const randomDoc = (): SKAMDocument =>
    doc({
      tokens: [
        { id: 't-1a2b3c4d', text: '學' },
        { id: 't-5e6f7a8b', text: '而' },
      ],
      blocks: [{ id: 'b#1', tokenIds: ['t-1a2b3c4d', 't-5e6f7a8b'] }],
      marks: [
        { type: 'emphasis', id: 'm-aaaaaaaa', anchor: { from: 't-1a2b3c4d', to: 't-5e6f7a8b' } },
      ],
      derivations: [{ kind: 'readingOrder', method: 'manual', result: ['t-5e6f7a8b'] }],
    });

  it('keep が空なら手書きの id を位置の値に変え、参照も付け替える', () => {
    const out = convertHandIdsToAuto(randomDoc(), new Set());
    expect(out.tokens.map((t) => t.id)).toEqual(['b#1#1', 'b#1#2']);
    expect(out.blocks[0]!.tokenIds).toEqual(['b#1#1', 'b#1#2']);
    expect(out.marks[0]).toMatchObject({ id: 'm#1', anchor: { from: 'b#1#1', to: 'b#1#2' } });
    expect(out.derivations![0]!.result).toEqual(['b#1#2']);
  });

  it('手書きのブロックの id も位置の値になり、字はその値で作る', () => {
    const d = randomDoc();
    d.blocks[0]!.id = 'blk-1';
    const out = convertHandIdsToAuto(d, new Set());
    expect(out.blocks[0]!.id).toBe('b#1');
    expect(out.tokens.map((t) => t.id)).toEqual(['b#1#1', 'b#1#2']);
  });

  it('keep の id は残る', () => {
    const d = randomDoc();
    d.marks.push({
      type: 'tateten',
      id: 'cite-1',
      anchor: { from: 't-1a2b3c4d', to: 't-5e6f7a8b' },
    });
    const out = convertHandIdsToAuto(d, new Set(['cite-1']));
    expect(out.marks.map((m) => m.id)).toEqual(['m#1', 'cite-1']);
  });

  it('highlight.ref が指す ref の id は、keep に無くても残る', () => {
    const d = autoDoc([
      { type: 'ref', id: 'ref-1', position: { blockId: 'b#1', after: 'b#1#3' }, label: 'a' },
      { type: 'highlight', id: 'h-1', anchor: { from: 'b#1#1', to: 'b#1#2' }, ref: 'ref-1' },
    ]);
    const out = convertHandIdsToAuto(d, new Set());
    expect(out.marks[0]!.id).toBe('ref-1');
    expect(out.marks[1]!.id).toBe('m#2');
    expect(out.marks[1]).toMatchObject({ ref: 'ref-1' });
    expect(findIdFormIssues(out)).toEqual([]);
  });

  it('乱数の手書きの id の ref を highlight が指しても、変換の後に ref の id が残る', () => {
    const d = autoDoc([
      {
        type: 'ref',
        id: 'ref-1a2b3c4d',
        position: { blockId: 'b#1', after: 'b#1#1' },
        label: 'a',
      },
      {
        type: 'highlight',
        id: 'hl-9f8e7d6c',
        anchor: { from: 'b#1#1', to: 'b#1#2' },
        ref: 'ref-1a2b3c4d',
      },
    ]);
    const out = convertHandIdsToAuto(d, new Set());
    expect(out.marks[0]!.id).toBe('ref-1a2b3c4d');
    expect(out.marks[1]).toMatchObject({ id: 'm#2', ref: 'ref-1a2b3c4d' });
  });

  it('変換した注記の m#n は、もとからある自動の id と重ならない', () => {
    const mk = (id: string): Mark => ({
      type: 'tateten',
      id,
      anchor: { from: 'b#1#1', to: 'b#1#2' },
    });
    const d = autoDoc([mk('a'), mk('n1'), mk('b'), mk('c'), mk('m#2')]);
    const out = convertHandIdsToAuto(d, new Set());
    expect(out.marks.map((m) => m.id)).toEqual(['m#1', 'm#2', 'm#3', 'm#4', 'm#5']);
  });

  it('2 回適用しても 1 回と同じ', () => {
    const once = convertHandIdsToAuto(randomDoc(), new Set());
    expect(convertHandIdsToAuto(once, new Set())).toEqual(once);
    expect(renumberAutoIds(once)).toEqual(once);
  });
});

describe('findIdFormIssues', () => {
  it('形の合う文書は空', () => {
    expect(findIdFormIssues(autoDoc([]))).toEqual([]);
  });

  it('字の id が NCName でも位置の値でもなければ当たる', () => {
    const d = autoDoc([]);
    d.tokens[0]!.id = '1a';
    d.blocks[0]!.tokenIds[0] = '1a';
    expect(findIdFormIssues(d)).toEqual([{ path: 'tokens[0].id' }]);
  });

  it('ブロックの id が別の位置の値なら当たる', () => {
    const d = doc({
      tokens: [
        { id: 'b#1#1', text: '學' },
        { id: 'b#1#2', text: '而' },
      ],
      blocks: [
        { id: 'b#1', tokenIds: ['b#1#1'] },
        { id: 'b#1', tokenIds: ['b#1#2'] },
      ],
    });
    expect(findIdFormIssues(d).map((i) => i.path)).toContain('blocks[1].id');
  });

  it('注記の id は NCName か m#<正の整数>', () => {
    const mk = (id: string): Mark => ({
      type: 'tateten',
      id,
      anchor: { from: 'b#1#1', to: 'b#1#2' },
    });
    const d = autoDoc([mk('m#3'), mk('m#0'), mk('m#01'), mk('note-1')]);
    expect(findIdFormIssues(d)).toEqual([{ path: 'marks[1].id' }, { path: 'marks[2].id' }]);
  });

  const hl = (ref: string): Mark => ({
    type: 'highlight',
    id: 'h',
    anchor: { from: 'b#1#1', to: 'b#1#2' },
    ref,
  });
  const refMark = (id: string, after = 'b#1#3'): Mark => ({
    type: 'ref',
    id,
    position: { blockId: 'b#1', after },
    label: 'a',
  });

  it('自動の id の ref を指す highlight.ref は当たる', () => {
    expect(findIdFormIssues(autoDoc([refMark('m#1'), hl('m#1')]))).toEqual([
      { path: 'marks[1].ref' },
    ]);
  });

  it.each(['', 'nowhere', '__proto__'])('どの注記も指さない highlight.ref %j は当たる', (ref) => {
    expect(findIdFormIssues(autoDoc([hl(ref)]))).toEqual([{ path: 'marks[0].ref' }]);
  });

  it('ref でない注記の手書きの id を指す highlight.ref は当たる', () => {
    const d = autoDoc([
      { type: 'tateten', id: 'note', anchor: { from: 'b#1#1', to: 'b#1#1' } },
      hl('note'),
    ]);
    expect(findIdFormIssues(d)).toEqual([{ path: 'marks[1].ref' }]);
  });

  it('手書きの id の ref を、別のブロックの 2 つの highlight が指しても当たらない', () => {
    const d = doc({
      tokens: [
        { id: 'b#1#1', text: '學' },
        { id: 'b#1#2', text: '而' },
        { id: 'b#2#1', text: '時' },
      ],
      blocks: [
        { id: 'b#1', tokenIds: ['b#1#1', 'b#1#2'] },
        { id: 'b#2', tokenIds: ['b#2#1'] },
      ],
      marks: [
        refMark('ref-1', 'b#1#2'),
        hl('ref-1'),
        { type: 'highlight', id: 'h2', anchor: { from: 'b#2#1', to: 'b#2#1' }, ref: 'ref-1' },
      ],
    });
    expect(findIdFormIssues(d)).toEqual([]);
  });

  describe('同じ anchor の読み仮名・送り仮名・添え仮名', () => {
    const kana = (type: 'yomigana' | 'okurigana' | 'soegana', id: string): Mark => ({
      type,
      id,
      anchor: { from: 'b#1#1', to: 'b#1#1' },
      value: 'あ',
    });

    it('yomigana y1 と okurigana o1 は okurigana の id が当たる', () => {
      const d = autoDoc([kana('yomigana', 'y1'), kana('okurigana', 'o1')]);
      expect(findIdFormIssues(d)).toEqual([{ path: 'marks[1].id' }]);
    });

    it('yomigana y1 と okurigana m#3 は当たらない', () => {
      const d = autoDoc([kana('yomigana', 'y1'), kana('okurigana', 'm#3')]);
      expect(findIdFormIssues(d)).toEqual([]);
    });

    it('okurigana o1 と soegana s1 (yomigana なし) は soegana の id が当たる', () => {
      const d = autoDoc([kana('soegana', 's1'), kana('okurigana', 'o1')]);
      expect(findIdFormIssues(d)).toEqual([{ path: 'marks[0].id' }]);
    });

    it('anchor が違えばまとまらない', () => {
      const d = autoDoc([
        kana('yomigana', 'y1'),
        {
          type: 'okurigana',
          id: 'o1',
          anchor: { from: 'b#1#2', to: 'b#1#2' },
          value: 'あ',
        },
      ]);
      expect(findIdFormIssues(d)).toEqual([]);
    });
  });
});

describe('groupKanaMarksByAnchor', () => {
  it('同じ anchor の添字を yomigana、okurigana、soegana の順でまとめる', () => {
    const at = (id: string): { from: string; to: string } => ({ from: id, to: id });
    const d = autoDoc([
      { type: 'okurigana', id: 'm#1', anchor: at('b#1#1'), value: 'ア' },
      { type: 'okurigana', id: 'm#2', anchor: at('b#1#2'), value: 'ア' },
      { type: 'emphasis', id: 'm#3', anchor: at('b#1#1') },
      { type: 'yomigana', id: 'm#4', anchor: at('b#1#1'), value: 'あ' },
    ]);
    expect(groupKanaMarksByAnchor(d)).toEqual([[3, 0], [1]]);
  });
});

describe('findXmlUnwritableChars', () => {
  // formatter が U+FFFE を実際の文字に書き換えないよう、コードから作る
  const fffe = String.fromCharCode(0xfffe);
  const lone = String.fromCharCode(0xd800);

  it('字の text、reading の text、注記の値の書けない文字の path だけを返す', () => {
    const d = autoDoc([
      { type: 'yomigana', id: 'm#1', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: lone },
      { type: 'yomigana', id: 'm#2', anchor: { from: 'b#1#2', to: 'b#1#2' }, value: '\u{20000}' },
      { type: 'yomigana', id: 'm#3', anchor: { from: 'b#1#3', to: 'b#1#3' }, value: '\t' },
      {
        type: 'emphasis',
        id: 'm#4',
        anchor: { from: 'b#1#1', to: 'b#1#1' },
        custom: { note: '\u0001' },
      },
    ]);
    d.tokens[0]!.text = 'a\u0001';
    d.readings = [{ kind: 'kundoku', text: fffe }];
    expect(findXmlUnwritableChars(d)).toEqual([
      { path: 'tokens[0].text' },
      { path: 'readings[0].text' },
      { path: 'marks[0].value' },
    ]);
  });
});

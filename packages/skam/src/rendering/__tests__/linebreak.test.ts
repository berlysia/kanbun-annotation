import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument } from '../../index.js';
import { buildAnnotationIR } from '../build-annotation-ir.js';
import type { AIRBlockChild, AIRHighlightGroupNode } from '../air-types.js';
import { RENDER_PROFILES, RENDER_PROFILE_KEYS } from '../render-profile.js';
import { describeAnnotationIR, formatAccessibleText } from '../accessible-text.js';

const FULL = RENDER_PROFILES.full;

/** 學而時習 (t1〜t4) を 1 ブロックに置く */
function createDoc(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '習' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
    marks,
    readings: [],
  };
}

const br = (after: string): Mark => ({ type: 'linebreak', position: { blockId: 'b1', after } });

/** 印の付いたノードの先頭の字の id (token は自身、tateten-group と ruby-group は最初の字) */
function flaggedIds(children: readonly AIRBlockChild[]): string[] {
  const out: string[] = [];
  const visit = (node: AIRBlockChild | AIRHighlightGroupNode['children'][number]): void => {
    if (node.type === 'highlight-group') {
      node.children.forEach(visit);
      return;
    }
    if (!('lineBreakAfter' in node) || node.lineBreakAfter !== true) return;
    if (node.type === 'token') out.push(node.token.id);
    else {
      const first = node.children.find((c) => c.type === 'token');
      out.push(`group:${first?.type === 'token' ? first.token.id : '?'}`);
    }
  };
  children.forEach(visit);
  return out;
}

describe('profile の linebreak', () => {
  it('すべての preset で linebreak が表示になる', () => {
    for (const preset of Object.values(RENDER_PROFILES)) {
      expect(preset.linebreak).toBe(true);
    }
    expect(RENDER_PROFILE_KEYS).toContain('linebreak');
  });
});

describe('buildAnnotationIR の lineBreakAfter', () => {
  it('學の後ろの linebreak は學のノードにだけ印を付ける', () => {
    const air = buildAnnotationIR(createDoc([br('t1')]), FULL);
    expect(flaggedIds(air.blocks[0]!.children)).toEqual(['t1']);
  });

  it('profile.linebreak が false なら印が無い', () => {
    const air = buildAnnotationIR(createDoc([br('t1')]), { ...FULL, linebreak: false });
    expect(flaggedIds(air.blocks[0]!.children)).toEqual([]);
  });

  it('竪点のグループの最後の字の後ろは、グループのノードに印を付け、字のノードには付けない', () => {
    const doc = createDoc([{ type: 'tateten', anchor: { from: 't1', to: 't2' } }, br('t2')]);
    const air = buildAnnotationIR(doc, FULL);
    expect(flaggedIds(air.blocks[0]!.children)).toEqual(['group:t1']);
    const group = air.blocks[0]!.children[0]!;
    expect(group.type).toBe('tateten-group');
    if (group.type === 'tateten-group') {
      for (const child of group.children) {
        if (child.type === 'token') expect(child).not.toHaveProperty('lineBreakAfter');
      }
    }
  });

  it('highlight の範囲の途中の字の後ろは、highlight-group の分け方を変えず、その子の字に印を付ける', () => {
    const doc = createDoc([{ type: 'highlight', anchor: { from: 't1', to: 't3' } }, br('t1')]);
    const air = buildAnnotationIR(doc, FULL);
    const groups = air.blocks[0]!.children.filter((c) => c.type === 'highlight-group');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.type === 'highlight-group' && groups[0]!.children).toHaveLength(3);
    expect(flaggedIds(air.blocks[0]!.children)).toEqual(['t1']);
  });

  it('複数の字にかかる読みの範囲の後ろは、ruby のグループのノードに印を付ける', () => {
    const doc = createDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'がくじ' },
      br('t2'),
    ]);
    const air = buildAnnotationIR(doc, FULL);
    expect(flaggedIds(air.blocks[0]!.children)).toEqual(['group:t1']);
  });

  it('ブロック末尾の後ろ (block-end) は印を付けず、例外も出さない', () => {
    const air = buildAnnotationIR(createDoc([br('t4')]), FULL);
    expect(flaggedIds(air.blocks[0]!.children)).toEqual([]);
  });

  it('置けない場所 (block-start、inside-unit、duplicate) の linebreak は無視する', () => {
    const doc = createDoc([
      { type: 'linebreak', position: { blockId: 'b1' } },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      br('t1'),
      br('t3'),
      br('t3'),
    ]);
    const air = buildAnnotationIR(doc, FULL);
    expect(flaggedIds(air.blocks[0]!.children)).toEqual(['t3']);
    expect(air.blocks[0]!.blockStartKutoten).toEqual([]);
    expect(air.blocks[0]!.blockStartRefs).toEqual([]);
  });
});

describe('読み上げの linebreak', () => {
  const read = (doc: SKAMDocument) =>
    formatAccessibleText(describeAnnotationIR(buildAnnotationIR(doc, FULL)));

  it('學の後ろの linebreak は、學と而の間に半角空白を 1 つ入れる', () => {
    expect(read(createDoc([]))).toBe('學。而。時。習。');
    expect(read(createDoc([br('t1')]))).toBe('學。 而。時。習。');
  });

  it('linebreak の無い文書は今と同じ文字列', () => {
    const marks: Mark[] = [{ type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ビテ' }];
    expect(read(createDoc(marks))).toBe(
      formatAccessibleText(describeAnnotationIR(buildAnnotationIR(createDoc(marks), FULL)))
    );
    expect(read(createDoc(marks))).not.toContain('  ');
  });

  it('竪点のグループの後ろの linebreak も、グループの最後の単位の後ろに空白を入れる', () => {
    const text = read(createDoc([{ type: 'tateten', anchor: { from: 't1', to: 't2' } }, br('t2')]));
    expect(text).toMatch(/而。 時。/);
  });

  it('highlight の最後の字の後ろの linebreak は、傍線の終わりの単位に付く', () => {
    const doc = createDoc([{ type: 'highlight', anchor: { from: 't1', to: 't2' } }, br('t2')]);
    const units = describeAnnotationIR(buildAnnotationIR(doc, FULL))[0]!.units;
    const flagged = units.filter((u) => u.lineBreakAfter);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.notes).toEqual([{ kind: 'highlightEnd' }]);
  });

  it('profile.linebreak が false なら空白を入れない', () => {
    const air = buildAnnotationIR(createDoc([br('t1')]), { ...FULL, linebreak: false });
    expect(formatAccessibleText(describeAnnotationIR(air))).toBe('學。而。時。習。');
  });

  it('注記の一覧 (notes) には出さない', () => {
    const blocks = describeAnnotationIR(buildAnnotationIR(createDoc([br('t1')]), FULL));
    expect(blocks[0]!.units.flatMap((u) => u.notes)).toEqual([]);
  });
});

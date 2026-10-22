import { describe, it, expect } from 'vitest';
import { stringify as stringifyDocument, type StringifyOptions } from '../index.js';
import { convertHandIdsToAuto, isHandId } from '@kanbun-skam/skam';
import type {
  SKAMDocument,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  SoeganaMark,
  KutotenMark,
  OkimojiMark,
  JojiMark,
  OkototenMark,
  SaidokuMark,
  EmphasisMark,
  TatetenMark,
  HighlightMark,
  RefMark,
} from '@kanbun-skam/skam';

/**
 * 手書きの id (`t1` など) の字は `<skam:t xml:id>` で書かれる。このファイルの検査は注記の書き方なので、
 * 字に手書きの id を使う文書は、ブロックと注記の id を残して字の id だけを位置から決まる形にしてから書く。
 * 字の手書きの id の書き方は graphemes.test.ts が検査する
 */
function stringify(doc: SKAMDocument, options?: StringifyOptions): string {
  if (!doc.tokens.some((token) => isHandId(token.id))) return stringifyDocument(doc, options);
  const keep = new Set([
    ...doc.blocks.map((block) => block.id),
    ...doc.marks.flatMap((mark) => (mark.id === undefined ? [] : [mark.id])),
  ]);
  return stringifyDocument(convertHandIdsToAuto(doc, keep), options);
}

// ============================================================================
// Basic Stringify Tests
// ============================================================================

describe('stringify - basic', () => {
  it('should stringify minimal document', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<skam:doc xmlns:skam="urn:skam:1">');
    expect(xml).toContain('<skam:block xml:id="b1">學</skam:block>');
    expect(xml).toContain('</skam:doc>');
  });

  it('should omit XML declaration when xmlDeclaration is false', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc, { xmlDeclaration: false });

    expect(xml).not.toContain('<?xml');
    expect(xml).toContain('<skam:doc');
  });

  it('should use custom indent size', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc, { indent: 4 });

    expect(xml).toContain('    <skam:meta tokenization="char"/>');
    expect(xml).toContain('    <skam:body>');
  });
});

// ============================================================================
// Kaeri Tests
// ============================================================================

describe('stringify - kaeri', () => {
  it('should stringify kaeri (レ点)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
        { id: 't3', text: '時' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'kaeri',
          id: 'm#1',
          position: { blockId: 'b1', after: 't2' },
          value: '㆑',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學而<skam:kaeri kind="re"/>時');
  });

  it('should stringify multiple kaeri kinds', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '甲' },
        { id: 't2', text: '乙' },
        { id: 't3', text: '丙' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'kaeri',
          id: 'm#1',
          position: { blockId: 'b1', after: 't1' },
          value: '㆒',
        } as KaeriMark,
        {
          type: 'kaeri',
          id: 'm#2',
          position: { blockId: 'b1', after: 't2' },
          value: '㆓',
        } as KaeriMark,
        {
          type: 'kaeri',
          id: 'm#3',
          position: { blockId: 'b1', after: 't3' },
          value: '㆖',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('kind="ichi"');
    expect(xml).toContain('kind="ni"');
    expect(xml).toContain('kind="jo"');
  });
});

// ============================================================================
// Okurigana Tests
// ============================================================================

describe('stringify - okurigana', () => {
  it('should stringify okurigana', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'okurigana',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          value: 'びて',
        } as OkuriganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:kun okuri="びて">學</skam:kun>而');
  });
});

// ============================================================================
// Yomigana Tests
// ============================================================================

describe('stringify - yomigana', () => {
  it('should stringify yomigana', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        } as YomiganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:kun yomi="まな">學</skam:kun>');
  });
});

// ============================================================================
// Soegana Tests
// ============================================================================

describe('stringify - soegana', () => {
  it('should stringify soegana', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '之' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'soegana',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          value: 'を',
        } as SoeganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:kun soe="を">之</skam:kun>');
  });
});

// ============================================================================
// Combined Attributes Tests
// ============================================================================

describe('stringify - combined attributes', () => {
  it('should stringify yomi and okuri on same token', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        } as YomiganaMark,
        {
          type: 'okurigana',
          id: 'm#2',
          anchor: { from: 't1', to: 't1' },
          value: 'びて',
        } as OkuriganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('yomi="まな"');
    expect(xml).toContain('okuri="びて"');
    expect(xml).toContain('>學</skam:kun>');
  });

  it('should stringify yomi, okuri, and soe on same token', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        } as YomiganaMark,
        {
          type: 'okurigana',
          id: 'm#2',
          anchor: { from: 't1', to: 't1' },
          value: 'び',
        } as OkuriganaMark,
        {
          type: 'soegana',
          id: 'm#3',
          anchor: { from: 't1', to: 't1' },
          value: 'を',
        } as SoeganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('yomi="まな"');
    expect(xml).toContain('okuri="び"');
    expect(xml).toContain('soe="を"');
  });
});

// ============================================================================
// Multiple Blocks Tests
// ============================================================================

describe('stringify - multiple blocks', () => {
  it('should stringify multiple blocks', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
        { id: 't3', text: '時' },
        { id: 't4', text: '習' },
      ],
      blocks: [
        { id: 'b1', tokenIds: ['t1', 't2'] },
        { id: 'b2', tokenIds: ['t3', 't4'] },
      ],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:block xml:id="b1">學而</skam:block>');
    expect(xml).toContain('<skam:block xml:id="b2">時習</skam:block>');
  });
});

// ============================================================================
// Kutoten Tests
// ============================================================================

describe('stringify - kutoten', () => {
  it('should stringify kutoten', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'kutoten',
          id: 'm#1',
          position: { blockId: 'b1', after: 't2' },
          value: '。',
        } as KutotenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學而<skam:kutoten value="。"');
  });

  it('should stringify kutoten with kind', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'kutoten',
          id: 'm#1',
          position: { blockId: 'b1', after: 't1' },
          value: '、',
          kind: 'ten',
        } as KutotenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('value="、"');
    expect(xml).toContain('kind="ten"');
  });
});

// ============================================================================
// Okimoji Tests
// ============================================================================

describe('stringify - okimoji', () => {
  it('should stringify okimoji', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'okimoji',
          id: 'm#1',
          anchor: { from: 't2', to: 't2' },
        } as OkimojiMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學<skam:okimoji>而</skam:okimoji>');
  });
});

// ============================================================================
// Joji Tests
// ============================================================================

describe('stringify - joji', () => {
  it('should stringify joji', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '之' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'joji',
          id: 'm#1',
          anchor: { from: 't2', to: 't2' },
        } as JojiMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學<skam:joji>之</skam:joji>');
  });
});

// ============================================================================
// Okototen Tests
// ============================================================================

describe('stringify - okototen', () => {
  it('should stringify okototen', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'okototen',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
          shape: 'dot',
          sound: 'り',
        } as OkototenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:okototen');
    expect(xml).toContain('grid="5x5"');
    expect(xml).toContain('x="4"');
    expect(xml).toContain('y="4"');
    expect(xml).toContain('shape="dot"');
    expect(xml).toContain('sound="り"');
    expect(xml).toContain('>學</skam:okototen>');
  });
});

// ============================================================================
// Saidoku Tests
// ============================================================================

describe('stringify - saidoku', () => {
  it('should stringify saidoku', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '將' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'saidoku',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { n: 1, yomi: 'まさ', okuri: 'に' },
            { n: 2, okuri: 'す' },
          ],
        } as SaidokuMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:saidoku>');
    expect(xml).toContain('<skam:base>將</skam:base>');
    expect(xml).toContain('<skam:kunform n="1" yomi="まさ" okuri="に"/>');
    expect(xml).toContain('<skam:kunform n="2" okuri="す"/>');
    expect(xml).toContain('</skam:saidoku>');
  });

  it('should place kaeri after saidoku element, not inside skam:base', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '將' },
        { id: 't2', text: '死' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'saidoku',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { n: 1, yomi: 'まさ', okuri: 'に' },
            { n: 2, okuri: 'す' },
          ],
        } as SaidokuMark,
        {
          type: 'kaeri',
          id: 'm#2',
          position: { blockId: 'b1', after: 't1' },
          value: '㆑',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('</skam:saidoku><skam:kaeri kind="re"/>');
    expect(xml).not.toContain('<skam:base>將<skam:kaeri');
  });

  it('should place kutoten after saidoku element', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '將' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'saidoku',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { n: 1, yomi: 'まさ', okuri: 'に' },
            { n: 2, okuri: 'す' },
          ],
        } as SaidokuMark,
        {
          type: 'kutoten',
          id: 'm#2',
          position: { blockId: 'b1', after: 't1' },
          value: '。',
        } as KutotenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('</skam:saidoku><skam:kutoten');
    expect(xml).not.toContain('<skam:base>將<skam:kutoten');
  });
});

// ============================================================================
// Emphasis Tests
// ============================================================================

describe('stringify - emphasis', () => {
  it('should stringify emphasis (single token)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'emphasis',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
        } as EmphasisMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:span type="emphasis">學</skam:span>而');
  });

  it('should stringify emphasis (multiple tokens)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
        { id: 't3', text: '時' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'emphasis',
          id: 'm#1',
          anchor: { from: 't1', to: 't2' },
        } as EmphasisMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:span type="emphasis">學而</skam:span>時');
  });

  it('should stringify emphasis with style', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'emphasis',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          style: 'dot',
        } as EmphasisMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('type="emphasis"');
    expect(xml).toContain('style="dot"');
  });
});

// ============================================================================
// Tateten Tests
// ============================================================================

describe('stringify - tateten', () => {
  it('should stringify tateten', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '國' },
        { id: 't2', text: '家' },
        { id: 't3', text: '之' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'tateten',
          id: 'm#1',
          anchor: { from: 't1', to: 't2' },
        } as TatetenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:tateten>國家</skam:tateten>之');
  });
});

// ============================================================================
// Highlight Tests
// ============================================================================

describe('stringify - highlight', () => {
  it('should stringify highlight', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
        { id: 't3', text: '時' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'highlight',
          id: 'm#1',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
        } as HighlightMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:span type="highlight" style="solid">學而</skam:span>時');
  });

  it('should stringify highlight with ref', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'highlight',
          id: 'm#1',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
          ref: 'ref-1',
        } as HighlightMark,
        { type: 'ref', id: 'ref-1', position: { blockId: 'b1', after: 't2' }, label: 'a' },
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('type="highlight"');
    expect(xml).toContain('style="solid"');
    expect(xml).toContain('ref="ref-1"');
  });
});

// ============================================================================
// Ref Tests (stringify-only, no round-trip)
// ============================================================================

describe('stringify - ref', () => {
  it('should stringify ref with format (empty element)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'ref',
          id: 'ref-1',
          position: { blockId: 'b1', after: 't1' },
          format: 'iroha-katakana',
        } as RefMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學<skam:ref xml:id="ref-1" format="iroha-katakana"/>');
  });

  it('should stringify ref with label', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'ref',
          id: 'ref-1',
          position: { blockId: 'b1', after: 't1' },
          label: '(※)',
        } as RefMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('label="(※)"');
  });

  it('should stringify ref with yomigana on same token', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        } as YomiganaMark,
        {
          type: 'ref',
          id: 'ref-1',
          position: { blockId: 'b1', after: 't1' },
          format: 'iroha-katakana',
        } as RefMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('yomi="まな"');
    expect(xml).toContain('<skam:ref xml:id="ref-1" format="iroha-katakana"/>');
    expect(xml).toContain(
      '<skam:kun yomi="まな">學</skam:kun><skam:ref xml:id="ref-1" format="iroha-katakana"/>'
    );
  });

  it('should stringify ref with okurigana on same token', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'okurigana',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          value: 'びて',
        } as OkuriganaMark,
        {
          type: 'ref',
          id: 'ref-1',
          position: { blockId: 'b1', after: 't1' },
          format: 'alpha-upper',
        } as RefMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('okuri="びて"');
    expect(xml).toContain('<skam:ref xml:id="ref-1" format="alpha-upper"/>');
  });

  it('should stringify ref with kaeri on same token', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'kaeri',
          id: 'm#1',
          position: { blockId: 'b1', after: 't1' },
          value: '㆑',
        } as KaeriMark,
        {
          type: 'ref',
          id: 'ref-1',
          position: { blockId: 'b1', after: 't1' },
          format: 'numeric-bracket',
        } as RefMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:kaeri kind="re"/>');
    expect(xml).toContain('<skam:ref xml:id="ref-1" format="numeric-bracket"/>');
  });
});

// ============================================================================
// Nested Range Marks Tests
// ============================================================================

describe('stringify - nested range marks', () => {
  it('should stringify nested emphasis and tateten', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '國' },
        { id: 't2', text: '家' },
        { id: 't3', text: '之' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'emphasis',
          id: 'm#1',
          anchor: { from: 't1', to: 't3' },
        } as EmphasisMark,
        {
          type: 'tateten',
          id: 'm#2',
          anchor: { from: 't1', to: 't2' },
        } as TatetenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain(
      '<skam:span type="emphasis"><skam:tateten>國家</skam:tateten>之</skam:span>'
    );
  });
});

// ============================================================================
// XML Escaping Tests
// ============================================================================

describe('stringify - XML escaping', () => {
  it('should escape special characters in text', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      // 1 token は 1 書記素。複数の字を 1 token にすると MULTI_GRAPHEME_TOKEN の損失になる
      tokens: [...'<>&"\''].map((text, i) => ({ id: `t${i + 1}`, text })),
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('&lt;&gt;&amp;&quot;&apos;');
  });

  it('should escape special characters in attributes', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm#1',
          anchor: { from: 't1', to: 't1' },
          value: '<test>',
        } as YomiganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('yomi="&lt;test&gt;"');
  });
});

// ============================================================================
// Readings Tests
// ============================================================================

describe('stringify - readings', () => {
  it('should stringify readings', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [],
      readings: [
        { kind: 'kakikudashi', text: '学びて' },
        { kind: 'yomiage', text: 'まなびて' },
      ],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:readings>');
    expect(xml).toContain('<skam:reading kind="kakikudashi">学びて</skam:reading>');
    expect(xml).toContain('<skam:reading kind="yomiage">まなびて</skam:reading>');
    expect(xml).toContain('</skam:readings>');
  });

  it('should not output readings element when readings is empty', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).not.toContain('<skam:readings>');
  });
});

// ============================================================================
// id の書き方 (手書きの id だけを xml:id に書く) と highlight の結び
// ============================================================================

describe('stringify - ids', () => {
  const autoDoc = (marks: SKAMDocument['marks'], count = 3): SKAMDocument => {
    const ids = Array.from({ length: count }, (_, i) => `b#1#${i + 1}`);
    return {
      format: 'skam@0.1',
      tokens: ids.map((id, i) => ({ id, text: '學而時之'[i]! })),
      blocks: [{ id: 'b#1', tokenIds: ids }],
      marks,
      readings: [],
    };
  };
  const ref = (after: string | undefined, id: string, extra: Partial<RefMark> = {}): RefMark => ({
    type: 'ref',
    id,
    position: after === undefined ? { blockId: 'b#1' } : { blockId: 'b#1', after },
    label: 'a',
    ...extra,
  });
  const highlight = (
    from: string,
    to: string,
    extra: Partial<HighlightMark> = {}
  ): HighlightMark => ({
    type: 'highlight',
    id: 'm#9',
    anchor: { from, to },
    ...extra,
  });

  it('自動の id だけの文書には xml:id が出ない', () => {
    const xml = stringify(
      autoDoc([
        { type: 'emphasis', id: 'm#1', anchor: { from: 'b#1#1', to: 'b#1#2' } },
        { type: 'kutoten', id: 'm#2', position: { blockId: 'b#1', after: 'b#1#3' }, value: '。' },
      ])
    );
    expect(xml).not.toContain('xml:id');
  });

  it('手書きの id の注記は xml:id に書く', () => {
    const xml = stringify(
      autoDoc([{ type: 'emphasis', id: 'note-1', anchor: { from: 'b#1#1', to: 'b#1#2' } }])
    );
    expect(xml).toContain('<skam:span type="emphasis" xml:id="note-1">');
  });

  it('すべての種類の注記の要素に手書きの id を書く', () => {
    const d = autoDoc(
      [
        { type: 'kaeri', id: 'k', position: { blockId: 'b#1', after: 'b#1#1' }, value: 'レ' },
        { type: 'kutoten', id: 'u', position: { blockId: 'b#1', after: 'b#1#2' }, value: '、' },
        { type: 'tateten', id: 'tt', anchor: { from: 'b#1#1', to: 'b#1#2' } },
        { type: 'okimoji', id: 'oki', anchor: { from: 'b#1#3', to: 'b#1#3' } },
        { type: 'yomigana', id: 'yo', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'a' },
      ] as SKAMDocument['marks'],
      3
    );
    const xml = stringify(d);
    for (const id of ['k', 'u', 'tt', 'oki', 'yo']) expect(xml).toContain(`xml:id="${id}"`);
  });

  it('手書きの id のブロックは xml:id に書く', () => {
    const d = autoDoc([]);
    d.blocks[0]!.id = 'p1';
    d.blocks[0]!.tokenIds = ['p1#1', 'p1#2', 'p1#3'];
    d.tokens.forEach((token, i) => (token.id = `p1#${i + 1}`));
    expect(stringify(d)).toContain('<skam:block xml:id="p1">');
  });

  it('手書きの id の ref を指す highlight は ref 属性で書く', () => {
    const d: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 'b#1#1', text: '學' },
        { id: 'b#2#1', text: '而' },
        { id: 'b#2#2', text: '時' },
      ],
      blocks: [
        { id: 'b#1', tokenIds: ['b#1#1'] },
        { id: 'b#2', tokenIds: ['b#2#1', 'b#2#2'] },
      ],
      marks: [
        { type: 'ref', id: 'ref-1', position: { blockId: 'b#1', after: 'b#1#1' }, label: 'a' },
        highlight('b#2#1', 'b#2#1', { id: 'h1', ref: 'ref-1' }),
        highlight('b#2#2', 'b#2#2', { id: 'h2', ref: 'ref-1' }),
      ],
      readings: [],
    };
    const xml = stringify(d);
    expect(xml.match(/ref="ref-1"/g)).toHaveLength(2);
  });

  it('highlight.ref の無い highlight は ref 属性を書かず、ref は今の位置に書く', () => {
    const xml = stringify(autoDoc([highlight('b#1#1', 'b#1#2'), ref('b#1#1', 'm#2')]));
    expect(xml).not.toContain('ref="');
    expect(xml).toContain('<skam:span type="highlight">學<skam:ref label="a"/>而</skam:span>');
  });

  it('最後の字の後ろの ref も、highlight.ref の無い highlight の外に書く', () => {
    const xml = stringify(autoDoc([highlight('b#1#1', 'b#1#2'), ref('b#1#2', 'm#2')]));
    expect(xml).toContain('<skam:span type="highlight">學而</skam:span><skam:ref label="a"/>');
  });

  it('範囲の外の手書きの id の ref も ref 属性で指せる', () => {
    const xml = stringify(
      autoDoc([highlight('b#1#1', 'b#1#2', { ref: 'r1' }), ref('b#1#3', 'r1')])
    );
    expect(xml).toContain('<skam:span type="highlight" ref="r1">');
    expect(xml).not.toContain('ref=""');
  });

  it('自動の id の ref を指す highlight.ref は ref 属性にできないので書かない', () => {
    const xml = stringify(
      autoDoc([highlight('b#1#1', 'b#1#2', { ref: 'm#2' }), ref('b#1#3', 'm#2')]),
      { lossy: true }
    );
    expect(xml).not.toContain(' ref="m#');
    expect(xml).not.toContain('ref=""');
  });

  it('highlight.ref が空文字でも ref="" は書かない', () => {
    const xml = stringify(autoDoc([highlight('b#1#1', 'b#1#2', { ref: '' })]), { lossy: true });
    expect(xml).not.toContain('ref=""');
  });

  it('同じ字の yomigana (手書きの id) と okurigana (自動の id) は kun の xml:id に yomigana の id を書く', () => {
    const xml = stringify(
      autoDoc([
        { type: 'yomigana', id: 'y1', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'あ' },
        { type: 'okurigana', id: 'm#2', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'イ' },
      ])
    );
    expect(xml).toContain('<skam:kun yomi="あ" okuri="イ" xml:id="y1">');
  });

  it('同じ字の yomigana (自動の id) と okurigana (手書きの id) は、kun の xml:id に書かない (parser が yomigana に付けてしまうため)', () => {
    const d = autoDoc([
      { type: 'yomigana', id: 'm#1', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'あ' },
      { type: 'okurigana', id: 'o1', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'イ' },
    ]);
    const xml = stringify(d, { lossy: true });
    expect(xml).not.toContain('xml:id');
  });
});

// ============================================================================
// ext / custom / placementHint と、文字の書き方 (文字参照)
// ============================================================================

describe('stringify - ext, custom, placementHint attributes', () => {
  const autoDoc = (over: Partial<SKAMDocument> = {}): SKAMDocument => ({
    format: 'skam@0.1',
    readings: [],
    tokens: [
      { id: 'b#1#1', text: '甲' },
      { id: 'b#1#2', text: '乙' },
    ],
    blocks: [{ id: 'b#1', tokenIds: ['b#1#1', 'b#1#2'] }],
    marks: [],
    ...over,
  });
  const anchor = (from: number, to = from) => ({ from: `b#1#${from}`, to: `b#1#${to}` });
  const lossesOf = (d: SKAMDocument, options: StringifyOptions = {}) => {
    const seen: string[] = [];
    stringifyDocument(d, { ...options, lossy: true, onLoss: (l) => seen.push(l.code) });
    return seen;
  };

  it('writes the ext of an undeclared document on the root, and custom on a block, in JSON', () => {
    const d = autoDoc({
      ext: { a: 1 },
      blocks: [
        {
          id: 'b#1',
          tokenIds: ['b#1#1', 'b#1#2'],
          custom: { x: String.fromCharCode(0xffff), y: '\u0001' },
        },
      ],
    });
    expect(lossesOf(d)).toEqual([]);
    const xml = stringify(d);
    expect(xml).toContain('<skam:doc xmlns:skam="urn:skam:1" skam:ext="{&quot;a&quot;:1}">');
    expect(xml).toContain(
      '<skam:block skam:custom="{&quot;x&quot;:&quot;\\uffff&quot;,&quot;y&quot;:&quot;\\u0001&quot;}">'
    );
    expect(xml).not.toContain(String.fromCharCode(0xffff));
    expect(xml).not.toContain('\u0001');
  });

  it('escapes U+FFFE and U+FFFF in JSON as \\u escapes', () => {
    const d = autoDoc({
      custom: { s: `${String.fromCharCode(0xfffe)}${String.fromCharCode(0xffff)}` },
    });
    const xml = stringify(d);
    expect(xml).toContain('\\ufffe\\uffff');
    // formatter が正規表現の U+FFFE の escape を実際の文字に書き換えるので、文字列から組み立てる
    expect(xml).not.toMatch(new RegExp('[\\uFFFE\\uFFFF]'));
  });

  it('writes the ext of a declared extension without a notation under the name key in skam:ext', () => {
    const d = autoDoc({
      extensions: ['zzz'],
      marks: [{ type: 'okimoji', anchor: anchor(1), ext: { zzz: { n: 1 } } }],
    });
    const options = { extensions: [{ name: 'zzz', uri: 'urn:x:zzz', required: false }] };
    expect(lossesOf(d, options)).toEqual([]);
    expect(stringify(d, options)).toContain(
      '<skam:okimoji skam:ext="{&quot;zzz&quot;:{&quot;n&quot;:1}}">'
    );
  });

  it('writes an edu value as a namespaced attribute and custom as skam:custom on the same element', () => {
    const d = autoDoc({
      extensions: ['edu'],
      extensionsRequired: ['edu'],
      marks: [
        {
          type: 'okimoji',
          anchor: anchor(1),
          ext: { edu: { quiz: 'q1' } },
          custom: { k: 1 },
        },
      ],
    });
    expect(lossesOf(d)).toEqual([]);
    expect(stringify(d)).toContain('<skam:okimoji edu:quiz="q1" skam:custom="{&quot;k&quot;:1}">');
  });

  it('writes placementHint as placement-hint and custom on an emphasis span', () => {
    const d = autoDoc({
      marks: [
        { type: 'okimoji', anchor: anchor(1), placementHint: 'left' },
        { type: 'emphasis', anchor: anchor(1, 2), custom: { c: true } },
      ],
    });
    expect(lossesOf(d)).toEqual([]);
    const xml = stringify(d);
    expect(xml).toContain('<skam:okimoji placement-hint="left">');
    expect(xml).toContain('<skam:span type="emphasis" skam:custom="{&quot;c&quot;:true}">');
  });

  it('writes the three attributes on highlight, ref and br', () => {
    const d = autoDoc({
      marks: [
        {
          id: 'm#1',
          type: 'highlight',
          anchor: anchor(1, 2),
          custom: { h: 1 },
          placementHint: 'p',
        },
        {
          id: 'r',
          type: 'ref',
          label: 'a',
          position: { blockId: 'b#1', after: 'b#1#1' },
          ext: { e: 1 },
        },
        {
          id: 'm#3',
          type: 'linebreak',
          position: { blockId: 'b#1', after: 'b#1#1' },
          placementHint: 'q',
        },
      ],
    });
    expect(lossesOf(d)).toEqual([]);
    const xml = stringify(d);
    expect(xml).toContain('type="highlight" skam:custom="{&quot;h&quot;:1}" placement-hint="p"');
    expect(xml).toContain('<skam:ref xml:id="r" label="a" skam:ext="{&quot;e&quot;:1}"/>');
    expect(xml).toContain('<skam:br placement-hint="q"/>');
  });

  it('writes yomigana custom and okurigana placementHint on one skam:kun with the prefixes', () => {
    const d = autoDoc({
      marks: [
        { type: 'yomigana', anchor: anchor(1), value: 'まな', custom: { y: 1 } },
        { type: 'okurigana', anchor: anchor(1), value: 'ブ', placementHint: 'right' },
        { type: 'soegana', anchor: anchor(1), value: 'を', ext: { s: 1 } },
      ],
    });
    expect(lossesOf(d)).toEqual([]);
    expect(stringify(d)).toContain(
      '<skam:kun yomi="まな" okuri="ブ" soe="を" skam:custom="{&quot;y&quot;:1}" okuri-placement-hint="right" skam:soe-ext="{&quot;s&quot;:1}">甲</skam:kun>'
    );
  });

  it('writes ext and custom of a reading, and xml:space="preserve" when the text has surrounding whitespace', () => {
    const d = autoDoc({
      readings: [
        { kind: 'kundoku', text: ' 学 ', custom: { r: 1 } },
        { kind: 'yomiage', text: '学', ext: { e: 1 } },
      ],
    });
    expect(lossesOf(d)).toEqual([]);
    const xml = stringify(d);
    expect(xml).toContain(
      '<skam:reading kind="kundoku" xml:space="preserve" skam:custom="{&quot;r&quot;:1}"> 学 </skam:reading>'
    );
    expect(xml).toContain(
      '<skam:reading kind="yomiage" skam:ext="{&quot;e&quot;:1}">学</skam:reading>'
    );
  });

  it('writes CR in text as a character reference, and TAB, LF and CR in an attribute value', () => {
    const d = autoDoc({
      tokens: [
        { id: 'b#1#1', text: '甲\r' },
        { id: 'b#1#2', text: '乙' },
      ],
      marks: [{ type: 'yomigana', anchor: anchor(2), value: 'a\tb\nc\rd' }],
    });
    const xml = stringify(d);
    expect(xml).toContain('<skam:t>甲&#13;</skam:t>');
    expect(xml).toContain('yomi="a&#9;b&#10;c&#13;d"');
  });
});

// ============================================================================
// 入れ子にできない範囲は空要素の対で書く (plan-3 T3)
// ============================================================================

describe('stringify - nested ranges and empty-element pairs', () => {
  const TEXTS = '甲乙丙丁戊己庚辛';
  const autoDoc = (
    marks: SKAMDocument['marks'],
    count = 3,
    over: Partial<SKAMDocument> = {}
  ): SKAMDocument => {
    const ids = Array.from({ length: count }, (_, i) => `b#1#${i + 1}`);
    return {
      format: 'skam@0.1',
      tokens: ids.map((id, i) => ({ id, text: TEXTS[i] ?? '字' })),
      blocks: [{ id: 'b#1', tokenIds: ids }],
      marks,
      readings: [],
      ...over,
    };
  };
  const a = (from: number, to = from) => ({ from: `b#1#${from}`, to: `b#1#${to}` });
  const lossCodesOf = (d: SKAMDocument): string[] => {
    const seen: string[] = [];
    stringifyDocument(d, { lossy: true, onLoss: (l) => seen.push(l.code) });
    return seen;
  };
  const inner = (d: SKAMDocument): string => {
    const xml = stringifyDocument(d);
    return /<skam:block[^>]*>(.*)<\/skam:block>/s.exec(xml)![1]!;
  };
  const position = (after?: number) =>
    after === undefined ? { blockId: 'b#1' } : { blockId: 'b#1', after: `b#1#${after}` };

  it('writes the crossing highlight as a pair and the emphasis as nested, without loss', () => {
    const d = autoDoc([
      { type: 'emphasis', anchor: a(1, 2) },
      { type: 'highlight', anchor: a(2, 3) },
    ]);
    expect(lossCodesOf(d)).toEqual([]);
    expect(inner(d)).toBe(
      '<skam:span type="emphasis">甲<skam:span type="highlight" sID="r1"/>乙</skam:span>丙<skam:span eID="r1"/>'
    );
  });

  it('writes a range that crosses a nested one as a pair, and one inside it that crosses another too', () => {
    const d = autoDoc(
      [
        { type: 'emphasis', anchor: a(1, 4) },
        { type: 'highlight', anchor: a(2, 5) },
        { type: 'emphasis', anchor: a(4, 5) },
      ],
      5
    );
    expect(lossCodesOf(d)).toEqual([]);
    expect(inner(d)).toBe(
      '<skam:span type="emphasis">甲<skam:span type="highlight" sID="r1"/>乙丙' +
        '<skam:span type="emphasis" sID="r2"/>丁</skam:span>戊<skam:span eID="r2"/><skam:span eID="r1"/>'
    );
  });

  it('writes the tenshō form: a yomigana range with an okimoji inside', () => {
    const d = autoDoc([
      { type: 'yomigana', anchor: a(1, 2), value: 'てん' },
      { type: 'okimoji', anchor: a(2) },
    ]);
    expect(lossCodesOf(d)).toEqual([]);
    expect(inner(d)).toBe(
      '<skam:yomigana value="てん">甲<skam:okimoji>乙</skam:okimoji></skam:yomigana>丙'
    );
  });

  it('writes a position mark between two characters inside the range element', () => {
    const d = autoDoc([
      { type: 'okimoji', anchor: a(1, 2) },
      { type: 'kaeri', value: '㆑', position: position(1) },
    ]);
    expect(lossCodesOf(d)).toEqual([]);
    expect(inner(d)).toBe('<skam:okimoji>甲<skam:kaeri kind="re"/>乙</skam:okimoji>丙');
  });

  it('writes the end element before the position mark that follows the last character', () => {
    const d = autoDoc([
      { type: 'emphasis', anchor: a(1, 2) },
      { type: 'okimoji', anchor: a(2, 3) },
      { type: 'kaeri', value: '㆑', position: position(3) },
    ]);
    expect(inner(d)).toBe(
      '<skam:span type="emphasis">甲<skam:okimoji sID="r1"/>乙</skam:span>丙<skam:okimoji eID="r1"/><skam:kaeri kind="re"/>'
    );
  });

  it('writes block-start position marks, then the start element, then the opening tags', () => {
    const d = autoDoc([
      { type: 'soegana', anchor: a(1, 2), value: 'ヲ' },
      { type: 'saidoku', anchor: a(2), forms: [{ yomi: 'いま' }] },
      { type: 'kutoten', kind: 'ku', value: '。', position: position() },
    ]);
    expect(inner(d)).toBe(
      '<skam:kutoten value="。" kind="ku"/><skam:kun soe="ヲ" sID="r1"/>甲' +
        '<skam:saidoku><skam:base>乙</skam:base><skam:kunform yomi="いま"/></skam:saidoku><skam:kun eID="r1"/>丙'
    );
  });

  it('writes yomigana and okurigana of one anchor as a single <skam:kun> pair', () => {
    const d = autoDoc([
      { type: 'emphasis', anchor: a(1, 2) },
      { type: 'yomigana', anchor: a(2, 3), value: 'あ' },
      { type: 'okurigana', anchor: a(2, 3), value: 'て' },
    ]);
    expect(lossCodesOf(d)).toEqual([]);
    expect(inner(d)).toBe(
      '<skam:span type="emphasis">甲<skam:kun yomi="あ" okuri="て" sID="r1"/>乙</skam:span>丙<skam:kun eID="r1"/>'
    );
  });

  it('puts the hand-written id of a paired yomigana on the start element only', () => {
    const d = autoDoc(
      [
        { type: 'emphasis', anchor: a(1, 2) },
        { id: 'y1', type: 'yomigana', anchor: a(2, 4), value: 'あ' },
        { type: 'okurigana', anchor: a(3), value: 'て' },
      ],
      4
    );
    expect(lossCodesOf(d)).toEqual([]);
    const xml = inner(d);
    expect(xml).toContain('<skam:kun yomi="あ" xml:id="y1" sID="r1"/>');
    expect(xml.match(/xml:id="y1"/g)).toHaveLength(1);
    expect(xml).toContain('<skam:kun okuri="て">丙</skam:kun>');
  });

  it('writes a soegana range that contains a saidoku character as a pair and the saidoku as nested', () => {
    const d = autoDoc([
      { type: 'soegana', anchor: a(2, 3), value: 'ヲ' },
      { type: 'saidoku', anchor: a(2), forms: [{ yomi: 'いま' }] },
    ]);
    expect(lossCodesOf(d)).toEqual([]);
    expect(inner(d)).toBe(
      '甲<skam:kun soe="ヲ" sID="r1"/><skam:saidoku><skam:base>乙</skam:base><skam:kunform yomi="いま"/></skam:saidoku>丙<skam:kun eID="r1"/>'
    );
  });

  it('writes two soegana ranges that contain one saidoku character as two pairs', () => {
    const d = autoDoc([
      { type: 'soegana', anchor: a(1, 3), value: 'ヲ' },
      { type: 'soegana', anchor: a(2, 3), value: 'ニ' },
      { type: 'saidoku', anchor: a(3), forms: [{ yomi: 'いま' }] },
    ]);
    expect(lossCodesOf(d)).toEqual([]);
    expect(inner(d)).toBe(
      '<skam:kun soe="ヲ" sID="r1"/>甲<skam:kun soe="ニ" sID="r2"/>乙' +
        '<skam:saidoku><skam:base>丙</skam:base><skam:kunform yomi="いま"/></skam:saidoku><skam:kun eID="r2"/><skam:kun eID="r1"/>'
    );
  });

  it('keeps a soegana on the same character as a saidoku nested inside the saidoku base', () => {
    const d = autoDoc([
      { type: 'soegana', anchor: a(2), value: 'ヲ' },
      { type: 'saidoku', anchor: a(2), forms: [{ yomi: 'いま' }] },
    ]);
    expect(lossCodesOf(d)).toEqual([]);
    expect(inner(d)).toBe(
      '甲<skam:saidoku><skam:base><skam:kun soe="ヲ">乙</skam:kun></skam:base><skam:kunform yomi="いま"/></skam:saidoku>丙'
    );
  });

  it('writes the two ranges of a document that has a SAIDOKU_READING_OVERLAP as a loss', () => {
    const d = autoDoc([
      { type: 'yomigana', anchor: a(1, 2), value: 'あ' },
      { type: 'saidoku', anchor: a(2), forms: [{ yomi: 'いま' }] },
    ]);
    expect(lossCodesOf(d)).toEqual(['UNNESTABLE_OVERLAP']);
  });

  it('writes a partially overlapping multi-character saidoku as a loss, not as a pair', () => {
    const d = autoDoc([
      { type: 'emphasis', anchor: a(1, 2) },
      { type: 'saidoku', anchor: a(2, 3), forms: [{ yomi: 'いま' }] },
    ]);
    expect(lossCodesOf(d)).toEqual(['UNNESTABLE_OVERLAP']);
  });

  it('writes 56 emphasis marks on one range as nested and 57 as pairs', () => {
    const marks = (n: number): SKAMDocument['marks'] =>
      Array.from({ length: n }, () => ({ type: 'emphasis' as const, anchor: a(1, 2) }));
    const nested = inner(autoDoc(marks(56)));
    expect(nested.match(/<skam:span type="emphasis">/g)).toHaveLength(56);
    expect(nested).not.toContain('sID');
    const paired = inner(autoDoc(marks(57)));
    expect(paired.match(/sID="r\d+"/g)).toHaveLength(57);
    expect(paired).not.toContain('<skam:span type="emphasis">');
  });

  it('writes all of a group as pairs when it exceeds the remaining depth by one', () => {
    const outer = { type: 'okimoji' as const, anchor: a(1, 3) };
    const emphasis = (n: number): SKAMDocument['marks'] =>
      Array.from({ length: n }, () => ({ type: 'emphasis' as const, anchor: a(1, 2) }));
    expect(
      inner(autoDoc([outer, ...emphasis(55)])).match(/<skam:span type="emphasis">/g)
    ).toHaveLength(55);
    const exceeded = inner(autoDoc([outer, ...emphasis(56)]));
    expect(exceeded.match(/sID="r\d+"/g)).toHaveLength(56);
    expect(exceeded).toContain('<skam:okimoji>');
  });

  it('counts a kun group as one level: depth exactly 56 is all nested', () => {
    const marks: SKAMDocument['marks'] = [
      ...Array.from({ length: 54 }, () => ({ type: 'emphasis' as const, anchor: a(1, 2) })),
      { type: 'okimoji', anchor: a(1, 2) },
      { type: 'yomigana', anchor: a(1, 2), value: 'あ' },
      { type: 'okurigana', anchor: a(1, 2), value: 'て' },
      { type: 'soegana', anchor: a(1, 2), value: 'ヲ' },
    ];
    const xml = inner(autoDoc(marks));
    expect(xml).not.toContain('sID');
    expect(xml).toContain('<skam:kun yomi="あ" okuri="て" soe="ヲ">甲乙</skam:kun>');
  });

  it('does not write <skam:t> for a character that follows a pair start element directly', () => {
    const d = autoDoc(
      [
        { type: 'emphasis', anchor: a(1, 2) },
        { type: 'highlight', anchor: a(2, 3) },
      ],
      3,
      {
        tokens: [
          { id: 'b#1#1', text: '甲' },
          { id: 'b#1#2', text: '́' },
          { id: 'b#1#3', text: '丙' },
        ],
      }
    );
    const xml = inner(d);
    expect(xml).not.toContain('<skam:t>');
    expect(xml).toContain('sID="r1"/>́');
  });

  it('writes <skam:extension name> without uri for an unknown extension, with no loss', () => {
    const d = autoDoc([], 3, { extensions: ['zzz'], ext: { zzz: { a: 1 } } });
    expect(lossCodesOf(d)).toEqual([]);
    const xml = stringifyDocument(d);
    expect(xml).toContain('<skam:extension name="zzz"/>');
    expect(xml).toContain('skam:ext="{&quot;zzz&quot;:{&quot;a&quot;:1}}"');
  });
});

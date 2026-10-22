/**
 * 出題の印: AIR が隠すと決めた所と、html が隠した所が、同じ注記の種類と字を指す。
 * 隠す規則は拡張の定義が 1 か所で決め、AIR と html の直接の経路は同じ判定を使う。
 */

import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';
import { defaultExtensions } from '@kanbun-skam/skam/extensions';
import {
  buildAnnotationIR,
  RENDER_PROFILES,
  type AIRBlockChild,
  type AIRDocument,
  type AIRTokenNode,
} from '@kanbun-skam/skam/rendering';
import { render } from '@kanbun-skam/skam-html-renderer';
import { FIXTURES } from '../fixtures/test-documents.js';

const quiz = (name: string) => ({ edu: { quiz: name } });
const range = (from: string, to = from) => ({ from, to });

function doc(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    extensions: ['edu'],
    extensionsRequired: ['edu'],
    tokens: ['甲', '乙', '丙', '丁', '戊'].map((text, i) => ({ id: `t${i + 1}`, text })),
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks,
    readings: [],
  };
}

function airOf(document: SKAMDocument, hideQuiz: unknown): AIRDocument {
  return buildAnnotationIR(document, RENDER_PROFILES.full, {
    extensions: defaultExtensions,
    extensionOptions: { edu: { hideQuiz } },
  });
}

function tokenNodes(children: readonly AIRBlockChild[]): AIRTokenNode[] {
  return children.flatMap((child): AIRTokenNode[] => {
    if (child.type === 'token') return [child];
    if (child.type === 'tateten-separator') return [];
    return tokenNodes(child.children);
  });
}

/** AIR の「隠す」を、html の class で言い直した種類の集合にする */
function airHiddenKinds(air: AIRDocument): Set<string> {
  const kinds = new Set<string>();
  const byName: Record<string, string> = {
    ruby: 'skam-ruby',
    okuri: 'skam-okuri',
    soegana: 'skam-soegana',
    kaeri: 'skam-kaeriten',
    kutoten: 'skam-suffix-kutoten',
    saidokuUnder: 'skam-ruby',
    saidokuOkuri2: 'skam-okuri',
  };
  const walk = (children: readonly AIRBlockChild[]): void => {
    for (const child of children) {
      if (child.type === 'token') {
        for (const slot of child.hiddenSlots ?? []) {
          // 値の無い slot は、html にも隠す要素が出ない
          const value = child.slots[slot as keyof typeof child.slots];
          if (value !== undefined) kinds.add(byName[slot]!);
        }
        continue;
      }
      if (child.type === 'tateten-separator') {
        if (child.kaeriHidden) kinds.add('skam-kaeriten');
        continue;
      }
      if (child.type === 'tateten-group' && child.hidden) kinds.add('skam-tateten-mark');
      if (child.type === 'ruby-group' && child.yomigana.hidden) kinds.add('skam-ruby');
      walk(child.children);
    }
  };
  for (const block of air.blocks) {
    for (const k of block.blockStartKutoten) if (k.hidden) kinds.add('skam-suffix-kutoten');
    walk(block.children);
  }
  return kinds;
}

function htmlHiddenKinds(document: SKAMDocument): Set<string> {
  const { html } = render(document, { hideQuiz: true });
  const kinds = new Set<string>();
  for (const match of html.matchAll(/class="([^"]*\bskam-quiz-hidden\b[^"]*)"/g)) {
    for (const cls of match[1]!.split(' ')) {
      if (cls !== 'skam-quiz-hidden' && cls !== 'skam-saidoku-under') kinds.add(cls);
    }
  }
  return kinds;
}

const cell = (x: number): Mark => ({
  type: 'okototen',
  anchor: range('t2'),
  position: { system: 'glyph-grid', grid: '5x5', x, y: 1 },
  shape: 'dot',
  ext: quiz('問'),
});

const cases: [string, Mark[]][] = [
  ['yomigana', [{ type: 'yomigana', anchor: range('t1'), value: 'ゆ', ext: quiz('問') }]],
  [
    'range yomigana',
    [{ type: 'yomigana', anchor: range('t1', 't2'), value: 'りょ', ext: quiz('問') }],
  ],
  ['okurigana', [{ type: 'okurigana', anchor: range('t1'), value: 'ヅ', ext: quiz('問') }]],
  [
    'range okurigana',
    [{ type: 'okurigana', anchor: range('t1', 't2'), value: 'ヅ', ext: quiz('問') }],
  ],
  ['soegana', [{ type: 'soegana', anchor: range('t1'), value: 'ヲ', ext: quiz('問') }]],
  [
    'kaeri',
    [{ type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒', ext: quiz('問') }],
  ],
  [
    'kutoten',
    [{ type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '‥', ext: quiz('問') }],
  ],
  [
    'block-start kutoten',
    [{ type: 'kutoten', position: { blockId: 'b1' }, value: '‥', ext: quiz('問') }],
  ],
  [
    'saidoku',
    [
      {
        type: 'saidoku',
        anchor: range('t1'),
        forms: [
          { yomi: 'あ', okuri: 'う' },
          { yomi: 'お', okuri: 'き' },
        ],
        ext: quiz('問'),
      },
    ],
  ],
  ['tateten', [{ type: 'tateten', anchor: range('t1', 't2'), ext: quiz('問') }]],
  [
    'tateten separator kaeri',
    [
      { type: 'tateten', anchor: range('t1', 't3') },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒', ext: quiz('問') },
    ],
  ],
  ['okototen', [cell(1)]],
  ['okimoji', [{ type: 'okimoji', anchor: range('t2'), ext: quiz('問') }]],
  ['joji', [{ type: 'joji', anchor: range('t2'), ext: quiz('問') }]],
];

describe('quiz hiding: AIR and html agree', () => {
  it.each(cases)('%s', (_name, marks) => {
    const document = doc(marks);
    const air = airHiddenKinds(airOf(document, true));
    const html = htmlHiddenKinds(document);
    expect(html).toEqual(air);
  });

  it('隠す所が何かしらある（空の比較で通っていない）', () => {
    for (const [name, marks] of cases) {
      if (['okototen', 'okimoji', 'joji'].includes(name)) continue;
      expect(htmlHiddenKinds(doc(marks)).size, name).toBeGreaterThan(0);
    }
  });

  it('okototen: AIR のセルが hidden で、html に要素が出ない', () => {
    const node = tokenNodes(airOf(doc([cell(1)]), true).blocks[0]!.children).find(
      (n) => n.token.id === 't2'
    )!;
    expect(node.slots.okototen).toMatchObject([{ hidden: true }]);
    expect(render(doc([cell(1)]), { hideQuiz: true }).html).not.toContain('skam-okototen"');
  });

  it('okimoji / joji: AIR は isOkimoji / isJoji を立てず、html は class を付けない', () => {
    const okimoji = doc([{ type: 'okimoji', anchor: range('t2'), ext: quiz('問') }]);
    expect(
      tokenNodes(airOf(okimoji, true).blocks[0]!.children)[1]!.slots.isOkimoji
    ).toBeUndefined();
    expect(render(okimoji, { hideQuiz: true }).html).not.toContain('skam-okimoji');
    expect(render(okimoji).html).toContain('skam-okimoji');
  });
});

describe('quiz hiding: documents without hideQuiz', () => {
  it('どの fixture の AIR にも hiddenSlots / hidden / kaeriHidden が無い', () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      const json = JSON.stringify(
        buildAnnotationIR(fixture, RENDER_PROFILES.full, {
          extensions: defaultExtensions,
        })
      );
      expect(json, name).not.toMatch(/hiddenSlots|"hidden"|kaeriHidden/);
      expect(JSON.stringify(buildAnnotationIR(fixture, RENDER_PROFILES.full)), name).not.toMatch(
        /hiddenSlots|"hidden"|kaeriHidden/
      );
    }
  });

  it('宣言のある文書でも、hideQuiz を渡さなければ AIR に印のキーが無い', () => {
    const marks: Mark[] = [
      { type: 'okurigana', anchor: range('t1'), value: 'ヅ', ext: quiz('問') },
    ];
    const json = JSON.stringify(airOf(doc(marks), undefined));
    expect(json).not.toMatch(/hiddenSlots|"hidden"|kaeriHidden/);
  });
});

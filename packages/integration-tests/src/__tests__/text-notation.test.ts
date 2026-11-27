// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { parse } from '@kanbun-skam/skam-text-parser';
import { parse as parseXML } from '@kanbun-skam/skam-xml-parser';
import { stringify } from '@kanbun-skam/skam-xml-stringify';
import { render } from '@kanbun-skam/skam-html-renderer';

const examples = [
  '學（まな）びて而時に習ふ＜レ＞之を。不＜二＞亦た說（よろこ）ばしから＜一＞乎。',
  '過ぎたるは猶（な）ほ｛ごとし｝＜レ＞不ざるが＜レ＞及ば。',
  '｜所＜二＞ー以（ゆゑん）',
  '習ふ＜レ＞之＋を。',
  '學（まな）びて而時に習ふ＜レ＞之を。\n不＜二＞亦た說（よろこ）ばしから＜一＞乎。\n\n有り＜レ＞朋自り＜二＞遠方＜一＞來たる。',
];
it('matches the examples in docs/skam-text-notation.md', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const notation = readFileSync(resolve(root, 'docs/skam-text-notation.md'), 'utf8');
  const section = notation.split('\n## ').find((part) => part.startsWith('書き味')) ?? '';
  const blocks = [...section.matchAll(/^```\n([\s\S]*?)\n```$/gm)].map((match) => match[1]);
  expect(blocks).toEqual(examples);
});
it.each(examples)('roundtrips notation %s through XML', (source) => {
  const result = parse(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  expect(parseXML(stringify(result.document))).toEqual(result.document);
});
it.each(examples)('renders notation %s in token order', (source) => {
  const result = parse(source);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  const { html } = render(result.document);
  const template = document.createElement('template');
  template.innerHTML = html;
  const text = [...template.content.querySelectorAll('.skam-token')]
    .map((unit) => {
      const segments = [...unit.querySelectorAll('.skam-base-seg')];
      return segments.length
        ? segments.map((segment) => segment.textContent ?? '').join('')
        : (unit.querySelector('.skam-base')?.textContent ?? '');
    })
    .join('');
  expect(text).toBe(result.document.tokens.map((token) => token.text).join(''));
});

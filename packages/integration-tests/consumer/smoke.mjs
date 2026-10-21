// 利用者の環境 (tarball からの npm install) で、Node が 6 パッケージを読み込めることを確かめる。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { stringify } from '@kanbun-skam/skam-xml-stringify';
import { render } from '@kanbun-skam/skam-html-renderer';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:kun yomi="まな" okuri="びて">學</skam:kun><skam:okimoji>而</skam:okimoji>時<skam:kun okuri="ふ">習</skam:kun><skam:kaeri kind="re"/><skam:kun soe="を">之</skam:kun>
    </skam:block>
  </skam:body>
</skam:doc>`;

const first = parse(xml);
const second = parse(stringify(first));
assert.ok(first.tokens.length > 0, 'parse produced no tokens');
assert.equal(second.tokens.length, first.tokens.length, 'token count changed across stringify');

const { html } = render(first);
assert.ok(html.includes('skam-document'), 'render output lacks skam-document');

const core = await import('@kanbun-skam/skam');
const legacy = core.moveLegacyExtToCustom({
  format: 'skam@0.1',
  tokens: [{ id: 't1', text: '學' }],
  blocks: [{ id: 'b1', tokenIds: ['t1'] }],
  marks: [
    { type: 'okimoji', id: 'm1', anchor: { from: 't1', to: 't1' }, ext: { edu: { quiz: 'q' } } },
  ],
  readings: [],
});
assert.deepEqual(legacy.registeredNameKeys, ['marks[0].ext.edu']);
assert.deepEqual(legacy.document.marks[0].custom, { edu: { quiz: 'q' } });

// lint: 閉じていない返り点 (二だけ) と、それを指す path
const unclosed = core.lintSKAMDocument({
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '學' },
    { id: 't2', text: '而' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
  marks: [{ type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: '\u3193' }],
  readings: [],
});
assert.deepEqual(
  unclosed.map((d) => [d.code, d.path]),
  [[core.KAERI_UNCLOSED, 'marks[0]']]
);
assert.equal(core.KAERI_UNCLOSED, 'KAERI_UNCLOSED');

// Node での import は、SSR で import するのと同じ条件になる
await import('@kanbun-skam/skam-web-component');
await import('@kanbun-skam/skam-web-component/auto');
await import('@kanbun-skam/skam-canvas-renderer');
await import('@kanbun-skam/skam/rendering');
const extensions = await import('@kanbun-skam/skam/extensions');
assert.ok(Array.isArray(extensions.extensionRegistry), 'extensionRegistry is not exported');
assert.equal(typeof extensions.resolveExtensions, 'function');
const edu = await import('@kanbun-skam/skam/extensions/edu');
assert.equal(edu.eduExtension.name, 'edu');
assert.equal(edu.assertHideQuizOption(true), true);

// JSON Schema は package の exports から解決でき、$id が公開の契約の値
const require = createRequire(import.meta.url);
for (const [file, id] of [
  ['skam.schema.json', 'urn:kanbun-skam:schema:skam-0.1'],
  ['ext-edu.schema.json', 'urn:kanbun-skam:schema:ext-edu-1'],
]) {
  const schema = JSON.parse(
    readFileSync(require.resolve(`@kanbun-skam/skam/schema/${file}`), 'utf8')
  );
  assert.equal(schema.$id, id, `${file}: unexpected $id`);
}

console.log('smoke.mjs: OK');

// 利用者の環境 (tarball からの npm install) で、Node が 6 パッケージを読み込めることを確かめる。
import assert from 'node:assert/strict';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { stringify } from '@kanbun-skam/skam-xml-stringify';
import { render } from '@kanbun-skam/skam-html-renderer';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:kun yomi="まな" okuri="びて">學</skam:kun><skam:okimoji>而</skam:okimoji>時<skam:kaeri kind="re"/><skam:kun soe="を">之</skam:kun><skam:kun okuri="ふ">習</skam:kun>
    </skam:block>
  </skam:body>
</skam:doc>`;

const first = parse(xml);
const second = parse(stringify(first));
assert.ok(first.tokens.length > 0, 'parse produced no tokens');
assert.equal(second.tokens.length, first.tokens.length, 'token count changed across stringify');

const { html } = render(first);
assert.ok(html.includes('skam-document'), 'render output lacks skam-document');

// Node での import は、SSR で import するのと同じ条件になる
await import('@kanbun-skam/skam-web-component');
await import('@kanbun-skam/skam-web-component/auto');
await import('@kanbun-skam/skam-canvas-renderer');
await import('@kanbun-skam/skam/rendering');

console.log('smoke.mjs: OK');

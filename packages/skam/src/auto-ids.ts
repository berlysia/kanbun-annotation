/**
 * id の体系: 手書きの id と自動の id
 *
 * - 手書きの id は XML の NCName (`:` を含まない Name)。`xml:id` で SKAM-ML に書ける
 * - 自動の id は `#` を含み、位置から計算できる値 (ブロック `b#n`、字 `<ブロックの id>#n`、注記 `m#n`)。SKAM-ML には書かない
 *
 * 手書き / 自動の判定、自動の id の計算、付け直しをここに集める。
 * validator の警告と stringify の損失は、`findIdFormIssues` の結果だけを使う。
 */

import type { SKAMDocument, Mark } from './index.js';

// XML 1.0 (5th) の NameStartChar / NameChar から `:` を除いたもの (Namespaces in XML 1.0 の NCName)。
// 入れ子の量指定子や重なる交替を作らないので、長い入力でも線形の時間で終わる
const NAME_START =
  'A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const NCNAME = new RegExp(`^[${NAME_START}][${NAME_CHAR}]*$`, 'u');

const AUTO_MARK_ID = /^m#[1-9][0-9]*$/;

/**
 * 手書きの id か (NCName か)。手書きの id は `#` を含まない。
 * @experimental
 */
export function isHandId(id: string): boolean {
  return NCNAME.test(id);
}

/**
 * 自動の形の id か (`#` を含むか)。
 * @experimental
 */
export function isAutoId(id: string): boolean {
  return id.includes('#');
}

/** 注記の id が自動の形 `m#<正の整数>` か (先頭の 0 を許さない) */
function isAutoMarkId(id: string): boolean {
  return AUTO_MARK_ID.test(id);
}

/** 文書の id (ブロック、字、注記) を集める */
export function collectDocumentIds(doc: SKAMDocument): Set<string> {
  const ids = new Set<string>();
  for (const block of doc.blocks) ids.add(block.id);
  for (const token of doc.tokens) ids.add(token.id);
  for (const mark of doc.marks) {
    if (typeof mark.id === 'string') ids.add(mark.id);
  }
  return ids;
}

/** `used` に無い最小の `m#<正の整数>`。見つけたら `used` に足す */
export function issueAutoMarkId(used: Set<string>): string {
  let n = 1;
  while (used.has(`m#${n}`)) n++;
  const id = `m#${n}`;
  used.add(id);
  return id;
}

// ============================================================================
// 位置の索引
// ============================================================================

interface TokenPlace {
  blockIndex: number;
  /** ブロックの tokenIds の中の 0 始まりの順 */
  order: number;
}

/** 字の id → 属するブロックと順。複数のブロックに属する字は最初のものを返し、`multi` に印を付ける */
function indexTokens(doc: SKAMDocument): { places: Map<string, TokenPlace>; multi: Set<string> } {
  const places = new Map<string, TokenPlace>();
  const multi = new Set<string>();
  doc.blocks.forEach((block, blockIndex) => {
    block.tokenIds.forEach((tokenId, order) => {
      if (places.has(tokenId)) multi.add(tokenId);
      else places.set(tokenId, { blockIndex, order });
    });
  });
  return { places, multi };
}

// ============================================================================
// ID_FORM
// ============================================================================

/**
 * id の形が合わない所の path を返す。validator の `ID_FORM` の警告と stringify の損失は、この結果だけを使う。
 *
 * - `blocks[i].id`: NCName でも `b#<i+1>` でもない
 * - `tokens[k].id`: NCName でも `<属するブロックの id>#<順>` でもない (ちょうど 1 つのブロックに属する字だけを見る)
 * - `marks[i].id`: NCName でも `m#<正の整数>` でもない
 * - `marks[i].ref` (highlight): 文書にある手書きの id の ref を指さない (自動の id の ref、空文字、どの注記も指さない値、ref でない注記を指す値)
 * - `marks[i].id` (yomigana / okurigana / soegana): 同じ anchor のまとまり (`groupKanaMarksByAnchor`) の 2 つ目以降が手書きの id を持つ
 *
 * @experimental
 */
export function findIdFormIssues(doc: SKAMDocument): readonly { path: string }[] {
  const issues: { path: string }[] = [];
  const { places, multi } = indexTokens(doc);

  doc.blocks.forEach((block, index) => {
    if (!isHandId(block.id) && block.id !== `b#${index + 1}`) {
      issues.push({ path: `blocks[${index}].id` });
    }
  });

  doc.tokens.forEach((token, index) => {
    const place = places.get(token.id);
    if (!place || multi.has(token.id)) return;
    const expected = `${doc.blocks[place.blockIndex]!.id}#${place.order + 1}`;
    if (!isHandId(token.id) && token.id !== expected) {
      issues.push({ path: `tokens[${index}].id` });
    }
  });

  doc.marks.forEach((mark, index) => {
    if (typeof mark.id === 'string' && !isHandId(mark.id) && !isAutoMarkId(mark.id)) {
      issues.push({ path: `marks[${index}].id` });
    }
  });

  // Set で引く: `__proto__` などの名前を持つ値でも誤って当たらない
  const handRefIds = new Set<string>();
  for (const mark of doc.marks) {
    if (mark.type === 'ref' && typeof mark.id === 'string' && isHandId(mark.id)) {
      handRefIds.add(mark.id);
    }
  }
  doc.marks.forEach((mark, index) => {
    if (mark.type !== 'highlight' || mark.ref === undefined) return;
    if (!handRefIds.has(mark.ref)) issues.push({ path: `marks[${index}].ref` });
  });

  for (const group of groupKanaMarksByAnchor(doc)) {
    for (const markIndex of group.slice(1)) {
      const id = doc.marks[markIndex]?.id;
      if (typeof id === 'string' && isHandId(id)) issues.push({ path: `marks[${markIndex}].id` });
    }
  }

  return issues;
}

const KANA_KINDS = ['yomigana', 'okurigana', 'soegana'] as const;

/**
 * 同じ anchor (from と to が同じ) の yomigana / okurigana / soegana の marks[] の添字を、まとまりごとに返す。
 * まとまりの中は yomigana、okurigana、soegana の順 (同じ種類は marks[] の順)。
 * まとまりの先頭だけが、`<skam:kun>` の `xml:id` として手書きの id を書ける。
 *
 * @internal
 */
export function groupKanaMarksByAnchor(doc: SKAMDocument): readonly (readonly number[])[] {
  const groups = new Map<string, number[]>();
  for (const kind of KANA_KINDS) {
    doc.marks.forEach((mark, index) => {
      if (mark.type !== kind) return;
      // JSON 配列をキーにする: id に含まれうるどの文字とも衝突しない
      const key = JSON.stringify([mark.anchor.from, mark.anchor.to]);
      const group = groups.get(key);
      if (group) group.push(index);
      else groups.set(key, [index]);
    });
  }
  return [...groups.values()];
}

// ============================================================================
// 付け直し
// ============================================================================

/**
 * `convert` が true の id を位置の値に計算し直した、旧 id → 新 id の対応を返す。
 * ブロックの id を先に決め、字はその値で作る。`convert` が false の id は変えない。
 */
function computeIdMap(doc: SKAMDocument, convert: (id: string) => boolean): Map<string, string> {
  const map = new Map<string, string>();
  const blockIds = doc.blocks.map((block, index) => {
    const next = convert(block.id) ? `b#${index + 1}` : block.id;
    map.set(block.id, next);
    return next;
  });
  const { places, multi } = indexTokens(doc);
  for (const token of doc.tokens) {
    const place = places.get(token.id);
    if (!place || multi.has(token.id) || !convert(token.id)) continue;
    map.set(token.id, `${blockIds[place.blockIndex]!}#${place.order + 1}`);
  }
  doc.marks.forEach((mark, index) => {
    if (typeof mark.id === 'string' && convert(mark.id)) map.set(mark.id, `m#${index + 1}`);
  });
  return map;
}

/**
 * id の対応を、id と id を指す参照 (blocks[].tokenIds、anchor、position、highlight.ref、
 * derivations[].result) に適用した新しい文書を返す。ext と custom の中は見ない。
 */
function applyIdMap(doc: SKAMDocument, map: ReadonlyMap<string, string>): SKAMDocument {
  const rename = (id: string): string => map.get(id) ?? id;
  const out = structuredClone(doc);

  for (const token of out.tokens) token.id = rename(token.id);
  for (const block of out.blocks) {
    block.id = rename(block.id);
    block.tokenIds = block.tokenIds.map(rename);
  }
  out.marks.forEach((mark: Mark) => {
    if (typeof mark.id === 'string') mark.id = rename(mark.id);
    if ('anchor' in mark) {
      mark.anchor.from = rename(mark.anchor.from);
      mark.anchor.to = rename(mark.anchor.to);
    } else {
      mark.position.blockId = rename(mark.position.blockId);
      if (mark.position.after !== undefined) mark.position.after = rename(mark.position.after);
    }
    if (mark.type === 'highlight' && mark.ref !== undefined) mark.ref = rename(mark.ref);
  });
  for (const derivation of out.derivations ?? []) {
    derivation.result = derivation.result.map(rename);
  }
  return out;
}

/**
 * 自動の形の id を位置の値に計算し直した新しい文書を返す。
 *
 * ブロックは `b#<blocks[] の 1 始まりの順>`、字は `<そのブロックの今の id>#<tokenIds の 1 始まりの順>`、
 * 注記は `m#<marks[] の 1 始まりの順>`。手書きの id は変えない。入力は変えない。2 回適用しても結果は同じ。
 * ext と custom の中の id は付け替えない。
 *
 * @experimental
 */
export function renumberAutoIds(doc: SKAMDocument): SKAMDocument {
  return applyIdMap(doc, computeIdMap(doc, isAutoId));
}

/**
 * `keep` に無い手書きの id を自動の形に変え (ブロックと字は位置の値、注記は `m#<marks[] の順>`)、
 * `renumberAutoIds` と同じ参照を付け替えた新しい文書を返す。
 *
 * `highlight.ref` が指す手書きの id の ref は、`keep` に無くても手書きのまま残す (変えると `ID_FORM` になるため)。
 * 変えた後に `renumberAutoIds` を通し、もとからある自動の id と重ならないようにする。
 * ext と custom の中の id は付け替えない。
 *
 * @experimental
 */
export function convertHandIdsToAuto(doc: SKAMDocument, keep: ReadonlySet<string>): SKAMDocument {
  const linkedRefIds = new Set<string>();
  for (const mark of doc.marks) {
    if (mark.type === 'highlight' && mark.ref !== undefined) linkedRefIds.add(mark.ref);
  }
  const pinned = new Set(keep);
  for (const mark of doc.marks) {
    if (
      mark.type === 'ref' &&
      typeof mark.id === 'string' &&
      isHandId(mark.id) &&
      linkedRefIds.has(mark.id)
    ) {
      pinned.add(mark.id);
    }
  }
  const converted = applyIdMap(
    doc,
    computeIdMap(doc, (id) => isAutoId(id) || !pinned.has(id))
  );
  return renumberAutoIds(converted);
}

// ============================================================================
// XML_UNWRITABLE_CHAR
// ============================================================================

// `u` フラグを付けない: 付けると対のサロゲートが 1 文字になり、対の無いものを数えられない
// 文字列から組み立てる: リテラルだと formatter が \uFFFE / \uFFFF を実際の文字に書き換えてしまう
const XML_UNWRITABLE_CHAR_PATTERN = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]' +
    '|[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])' +
    '|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]'
);

/** 値が id か、id を指す参照なので、書けない文字の検査から外す注記のキー (id の形は `ID_FORM` が見る)。ext と custom は `JSON.stringify` が `\u` で書く */
const UNWRITABLE_CHAR_SKIPPED_KEYS: ReadonlySet<string> = new Set([
  'id',
  'ext',
  'custom',
  'anchor',
  'blockId',
  'after',
  'ref',
]);

/** 注記の文字列の値と属性 (入れ子の語形や座標を含む) で、XML に書けない文字を持つ欄の path */
function collectUnwritableMarkPaths(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'string') {
    if (XML_UNWRITABLE_CHAR_PATTERN.test(value)) out.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUnwritableMarkPaths(item, `${path}[${index}]`, out));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (UNWRITABLE_CHAR_SKIPPED_KEYS.has(key)) continue;
      collectUnwritableMarkPaths(child, `${path}.${key}`, out);
    }
  }
}

/**
 * XML 1.0 で書けない文字 (U+0009、U+000A、U+000D を除く U+0000〜U+001F、U+FFFE、U+FFFF、対の無いサロゲート) を
 * 持つ欄の path を返す。対象は字の text、reading の text、注記の文字列の値と属性 (id、ext、custom を除く)、placementHint。
 * 1 つの欄につき 1 件。validator の `XML_UNWRITABLE_CHAR` の警告と stringify の損失は、この結果だけを使う。
 *
 * @experimental
 */
export function findXmlUnwritableChars(doc: SKAMDocument): readonly { path: string }[] {
  const paths: string[] = [];
  doc.tokens.forEach((token, index) => {
    if (XML_UNWRITABLE_CHAR_PATTERN.test(token.text)) paths.push(`tokens[${index}].text`);
  });
  doc.readings.forEach((reading, index) => {
    if (XML_UNWRITABLE_CHAR_PATTERN.test(reading.text)) paths.push(`readings[${index}].text`);
  });
  doc.marks.forEach((mark, index) => {
    collectUnwritableMarkPaths(mark, `marks[${index}]`, paths);
  });
  return paths.map((path) => ({ path }));
}

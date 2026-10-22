/**
 * html-renderer の出力を DOM にして、「どの字の単位のどの部品に何があるか」を引く helper。
 *
 * 文字列への部分一致は、部品がどの字に付いたかを見ない。ここでは次の規則で部品を引く。
 *
 * - 字の単位は `${prefix}-token` の要素。本文の字は単位の中の `${prefix}-base` (範囲の読みは
 *   `${prefix}-base-seg` に分かれ、字の全体で引く) で見分ける。`data-token-id` は interactive の
 *   ときだけ出るので使わない
 * - 部品は単位から祖先へ (ブロックの手前まで) たどり、最も近い段で見つかったものを返す。
 *   読みや送り仮名は竪点のグループや傍線の外の `ruby-grid` / `<ruby>` に出ることがあるため、
 *   単位の中だけを見ない
 * - 各段では、単位の経路に載らない「担い手」(別の字の token、別の ruby-grid / `<ruby>`、
 *   竪点のグループ、傍線) の中を除く。隣の字の部品を拾わないための規則
 * - 字に付く ref (`<sup>`) は単位の直前の兄弟として出る。単位の直前に続く sup だけをその単位の部品とし、
 *   ほかの字の sup は除く。傍線のラベルは sup でない要素なので、傍線の中の字は自分の ref が
 *   無ければ傍線のラベルを引く
 */
import type { AIRTokenSlots } from '@kanbun-skam/skam/rendering';
import { render, type RenderOptions } from '../../index.js';
import type { SKAMDocument } from '@kanbun-skam/skam';

export const DEFAULT_PREFIX = 'skam';

export type PartName =
  | 'ruby'
  | 'okuri'
  | 'soe'
  | 'kaeri'
  | 'kutoten'
  | 'saidokuUnder'
  | 'saidokuOkuri2'
  | 'ref'
  | 'emphasis'
  | 'emphasisRow'
  | 'okimoji'
  | 'joji'
  | 'saidoku'
  | 'okototen'
  | 'hasOkototen'
  | 'tatetenMark'
  | 'tatetenGroup'
  | 'highlight'
  | 'baseSeg'
  | 'anySaidoku'
  | 'notes'
  | 'noteItem'
  | 'noteMarker'
  | 'reading';

/**
 * 部品の名前 → CSS セレクタ。class 名が変わったときに直す所はここだけ。
 * `emphasis`、`okimoji`、`joji`、`saidoku`、`hasOkototen` は単位の要素自身の class。
 */
export const PART_SELECTORS: Record<PartName, (prefix: string) => string> = {
  ruby: (p) => `.${p}-ruby`,
  okuri: (p) => `.${p}-suffix-okuri .${p}-okuri`,
  soe: (p) => `.${p}-soegana`,
  kaeri: (p) => `.${p}-kaeriten`,
  kutoten: (p) => `.${p}-suffix-kutoten`,
  saidokuUnder: (p) => `.${p}-saidoku-under`,
  saidokuOkuri2: (p) => `.${p}-suffix-saidoku .${p}-okuri`,
  ref: (p) => `.${p}-ref`,
  emphasis: (p) => `.${p}-emphasis`,
  emphasisRow: (p) => `.${p}-emphasis-row`,
  okimoji: (p) => `.${p}-okimoji`,
  joji: (p) => `.${p}-joji`,
  saidoku: (p) => `.${p}-saidoku`,
  okototen: (p) => `.${p}-okototen`,
  hasOkototen: (p) => `.${p}-has-okototen`,
  tatetenMark: (p) => `.${p}-tateten-mark`,
  tatetenGroup: (p) => `.${p}-tateten-group`,
  highlight: (p) => `.${p}-highlight`,
  baseSeg: (p) => `.${p}-base-seg`,
  /** 再読文字の描き方 (grid、ruby、下の読み、送り仮名の段) のどれでも、class の語幹が saidoku のもの */
  anySaidoku: (p) => `[class*="${p}-saidoku"]`,
  notes: (p) => `.${p}-notes`,
  noteItem: (p) => `.${p}-note-item`,
  noteMarker: (p) => `.${p}-note-marker`,
  reading: (p) => `.${p}-reading`,
};

/**
 * AIR の slot → 部品。slot を足すと `Record<keyof AIRTokenSlots, ...>` が型検査で落ちる。
 * 一方向 (slot → 部品) だけを確かめる: 表にある部品が slot に対応しないまま増えても捕まえない。
 * `tatetenMark`、`highlight` などの群の部品はもともと slot の外。
 */
export const SLOT_PARTS: Record<keyof AIRTokenSlots, readonly PartName[]> = {
  ruby: ['ruby'],
  okuri: ['okuri'],
  soegana: ['soe'],
  kaeri: ['kaeri'],
  kutoten: ['kutoten'],
  kutotenValues: ['kutoten'],
  isOkimoji: ['okimoji'],
  isJoji: ['joji'],
  emphasis: ['emphasis', 'emphasisRow'],
  emphasisStyle: [],
  saidoku: ['saidoku'],
  saidokuUnder: ['saidokuUnder'],
  saidokuOkuri2: ['saidokuOkuri2'],
  ref: ['ref'],
  refLabels: ['ref'],
  okototen: ['okototen', 'hasOkototen'],
};

/** この単位を含まない (経路に載らない) とき、中を探さない要素 */
const carrierSelector = (p: string): string =>
  [
    `.${p}-token`,
    `.${p}-ruby-grid`,
    `.${p}-ruby-grid--emphasis`,
    `.${p}-ruby-grid--emphasis-no-ruby`,
    `.${p}-saidoku-grid`,
    `.${p}-saidoku-grid--emphasis`,
    'ruby',
    `.${p}-tateten-group`,
    `.${p}-highlight`,
  ].join(', ');

/** render の html を DOM にして、ルートの要素を返す。選択肢は加工せずそのまま渡す */
export function renderDom(doc: SKAMDocument, options?: RenderOptions): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = render(doc, options).html;
  const root = template.content.firstElementChild;
  if (!(root instanceof HTMLElement)) {
    throw new Error('renderDom: the html has no root element');
  }
  return root;
}

function baseTextOf(token: Element, prefix: string): string {
  return token.querySelector(`.${prefix}-base`)?.textContent ?? '';
}

/**
 * `${prefix}-base` の文字が `base` に等しい字の単位の `nth` 番目 (文書の順)。
 * 範囲の読みの単位は、範囲の字の全体 (「論語」) で引く
 */
export function unit(
  root: Element,
  base: string,
  nth = 0,
  prefix: string = DEFAULT_PREFIX
): Element {
  const tokens = [...root.querySelectorAll(`.${prefix}-token`)];
  const matched = tokens.filter((token) => baseTextOf(token, prefix) === base);
  const found = matched[nth];
  if (!found) {
    const seen = tokens.map((token) => `「${baseTextOf(token, prefix)}」`).join('');
    throw new Error(
      `unit: no unit with base text 「${base}」 at index ${nth} (prefix "${prefix}"; found units: ${seen || 'none'})`
    );
  }
  return found;
}

/** 単位の直前に続く、字に付く ref (`<sup>`) */
function ownRefs(unitEl: Element, prefix: string): Element[] {
  const refs: Element[] = [];
  let sibling = unitEl.previousElementSibling;
  while (sibling && sibling.tagName === 'SUP' && sibling.classList.contains(`${prefix}-ref`)) {
    refs.unshift(sibling);
    sibling = sibling.previousElementSibling;
  }
  return refs;
}

/** その字に付く部品 `name` の要素 (文書の順)。無ければ空の配列 */
export function parts(
  root: Element,
  base: string,
  name: PartName,
  nth = 0,
  prefix: string = DEFAULT_PREFIX
): Element[] {
  const unitEl = unit(root, base, nth, prefix);
  const selector = PART_SELECTORS[name](prefix);
  const own = ownRefs(unitEl, prefix);

  let level: Element | null = unitEl;
  while (level && level !== root.parentElement && !level.classList.contains(`${prefix}-block`)) {
    const current: Element = level;
    const excluded = [...current.querySelectorAll(carrierSelector(prefix))].filter(
      (carrier) => !carrier.contains(unitEl) && !unitEl.contains(carrier)
    );
    const candidates = [...current.querySelectorAll(selector)];
    if (current === unitEl) {
      if (unitEl.matches(selector)) candidates.unshift(unitEl);
      for (const ref of own) if (ref.matches(selector)) candidates.unshift(ref);
    }
    const found = candidates.filter((el) => {
      if (excluded.some((carrier) => carrier.contains(el))) return false;
      // ほかの字の sup は拾わない
      if (el.tagName === 'SUP' && !own.includes(el)) return false;
      return true;
    });
    if (found.length > 0) return found;
    level = current.parentElement;
  }
  return [];
}

/** 部品の文字を順につないだもの。部品が無ければ `null` */
export function partText(
  root: Element,
  base: string,
  name: PartName,
  nth = 0,
  prefix: string = DEFAULT_PREFIX
): string | null {
  const found = parts(root, base, name, nth, prefix);
  if (found.length === 0) return null;
  return found.map((el) => el.textContent ?? '').join('');
}

export function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

/**
 * その字を含む群 (傍線、竪点のグループ) の要素。字の要素自身も含めて、最も近い祖先を返す。無ければ `null`
 */
export function closestPart(
  root: Element,
  base: string,
  name: PartName,
  nth = 0,
  prefix: string = DEFAULT_PREFIX
): Element | null {
  return unit(root, base, nth, prefix).closest(PART_SELECTORS[name](prefix));
}

/** 文書の全体にある部品 `name` の要素 (文書の順) */
export function all(root: Element, name: PartName, prefix: string = DEFAULT_PREFIX): Element[] {
  return [...root.querySelectorAll(PART_SELECTORS[name](prefix))];
}

/** 文書の全体にある部品 `name` の数 */
export function count(root: Element, name: PartName, prefix: string = DEFAULT_PREFIX): number {
  return all(root, name, prefix).length;
}

/**
 * 表示設定 (RenderProfile) の型・プリセット・検証。
 *
 * HTML / Canvas 両レンダラーと Web Component が同じ入力から同じ profile を得るために、
 * 解決と検証をここに 1 つだけ置く。
 */

import type { AIRRenderProfile } from './air-types.js';

/** 表示要素の制御プロファイル（13 個の真偽値） */
export type RenderProfile = AIRRenderProfile;

/** プリセット名 */
export type RenderProfileName = 'full' | 'learningBasic' | 'learningHint';

/**
 * `resolveRenderProfile` が受け付ける入力。次の 2 つの形がある。
 *
 * - 部分指定: 13 個のキーの一部を書く。**書かなかったキーは full（すべて表示）になる**。
 *   キーの書き忘れや削除は、隠すつもりの注記を表示する側に倒れる。
 * - `{ base, overrides? }`: プリセットから出発し、`overrides` で一部を変える。
 *   この形は安定した契約で、出題のように注記を隠す用途ではこちらを使う。
 *
 * 2 つの形は混ぜられない（`{ base, okurigana: false }` は TypeError）。
 */
export type RenderProfileInput =
  | (Partial<RenderProfile> & { base?: never })
  | { base: RenderProfileName; overrides?: Partial<RenderProfile> };

const PROFILE_KEYS = [
  'yomigana',
  'okurigana',
  'kaeriten',
  'kutoten',
  'saidoku',
  'okototen',
  'tateten',
  'emphasis',
  'okimoji',
  'joji',
  'soegana',
  'highlight',
  'ref',
] as const satisfies readonly (keyof RenderProfile)[];

/** 全要素表示プロファイル */
const FULL_PROFILE: Readonly<RenderProfile> = Object.freeze({
  yomigana: true,
  okurigana: true,
  kaeriten: true,
  kutoten: true,
  saidoku: true,
  okototen: true,
  tateten: true,
  emphasis: true,
  okimoji: true,
  joji: true,
  soegana: true,
  highlight: true,
  ref: true,
});

/** 学習用基本プロファイル（返り点のみ） */
const LEARNING_BASIC_PROFILE: Readonly<RenderProfile> = Object.freeze({
  yomigana: false,
  okurigana: false,
  kaeriten: true,
  kutoten: true,
  saidoku: false,
  okototen: false,
  tateten: false,
  emphasis: false,
  okimoji: true,
  joji: true,
  soegana: false,
  highlight: true,
  ref: true,
});

/** 学習用ヒント付きプロファイル（返り点+送り仮名+再読文字） */
const LEARNING_HINT_PROFILE: Readonly<RenderProfile> = Object.freeze({
  yomigana: false,
  okurigana: true,
  kaeriten: true,
  kutoten: true,
  saidoku: true,
  okototen: false,
  tateten: false,
  emphasis: false,
  okimoji: true,
  joji: true,
  soegana: true,
  highlight: true,
  ref: true,
});

/** プリセットプロファイル（凍結済み） */
export const RENDER_PROFILES: Readonly<Record<RenderProfileName, Readonly<RenderProfile>>> =
  Object.freeze({
    full: FULL_PROFILE,
    learningBasic: LEARNING_BASIC_PROFILE,
    learningHint: LEARNING_HINT_PROFILE,
  });

const MAX_ECHO = 64;

function echo(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.slice(0, MAX_ECHO));
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return String(value).slice(0, MAX_ECHO);
}

function isProfileKey(key: string): key is keyof RenderProfile {
  return (PROFILE_KEYS as readonly string[]).includes(key);
}

/**
 * クラスのインスタンス（Date など）を除く。プロトタイプの連鎖が、`constructor` を持たない
 * object だけで `Object.prototype` か null に終わるものを plain とみなす。
 * `Object.create(null)` と `Object.create({ ... })` は通り、継承したキーは読まないので無視される。
 */
function hasPlainPrototypeChain(input: object): boolean {
  let proto: object | null = Object.getPrototypeOf(input);
  while (proto !== null && proto !== Object.prototype) {
    if (Object.hasOwn(proto, 'constructor')) return false;
    proto = Object.getPrototypeOf(proto);
  }
  return true;
}

/**
 * own enumerable な string キーの値を 1 回だけ読んだ写しを返す。
 * 検証した値と使う値を一致させるため、以降は入力でなくこの写しを見る。
 */
function snapshotPlainObject(input: unknown, where: string): Map<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError(`${where} must be a plain object (got ${echo(input)})`);
  }
  if (!hasPlainPrototypeChain(input)) {
    throw new TypeError(`${where} must be a plain object (got ${echo(input)})`);
  }
  const snapshot = new Map<string, unknown>();
  for (const key of Object.keys(input)) {
    try {
      snapshot.set(key, (input as Record<string, unknown>)[key]);
    } catch (cause) {
      throw new TypeError(`${where}.${key.slice(0, MAX_ECHO)} could not be read`, { cause });
    }
  }
  return snapshot;
}

function collectFlags(
  snapshot: Map<string, unknown>,
  where: string,
  skip: ReadonlySet<string>
): Map<keyof RenderProfile, boolean> {
  const flags = new Map<keyof RenderProfile, boolean>();
  for (const [key, value] of snapshot) {
    if (skip.has(key)) continue;
    if (!isProfileKey(key)) {
      throw new TypeError(`${where} has an unknown key ${echo(key)}`);
    }
    if (typeof value !== 'boolean') {
      throw new TypeError(`${where}.${key} must be a boolean (got ${echo(value)})`);
    }
    flags.set(key, value);
  }
  return flags;
}

function freezeMerged(
  baseProfile: Readonly<RenderProfile>,
  flags: Map<keyof RenderProfile, boolean>
): RenderProfile {
  const merged = {} as RenderProfile;
  for (const key of PROFILE_KEYS) {
    merged[key] = flags.get(key) ?? baseProfile[key];
  }
  return Object.freeze(merged);
}

const NO_SKIP: ReadonlySet<string> = new Set();
const BASE_FORM_KEYS: ReadonlySet<string> = new Set(['base', 'overrides']);

function resolveBaseForm(snapshot: Map<string, unknown>): RenderProfile {
  for (const key of snapshot.keys()) {
    if (!BASE_FORM_KEYS.has(key)) {
      throw new TypeError(
        `profile with "base" accepts only "base" and "overrides" (got ${echo(key)})`
      );
    }
  }
  const base = snapshot.get('base');
  if (typeof base !== 'string' || !Object.hasOwn(RENDER_PROFILES, base)) {
    throw new TypeError(`profile.base must be a known preset name (got ${echo(base)})`);
  }
  const preset = RENDER_PROFILES[base as RenderProfileName];
  if (!snapshot.has('overrides')) return freezeMerged(preset, new Map());
  const overrides = snapshotPlainObject(snapshot.get('overrides'), 'profile.overrides');
  return freezeMerged(preset, collectFlags(overrides, 'profile.overrides', NO_SKIP));
}

/**
 * 表示設定を検証して、13 個の真偽値がそろった凍結済みの profile にする。
 *
 * - 入力は部分指定か `{ base, overrides }`（{@link RenderProfileInput}）。`{ base, overrides }` の形は安定した契約。
 * - 部分指定は full に重なる。書かなかったキーは表示される側に倒れる。
 * - 未指定（`undefined`）は full。`null`・未知のキー・真偽値でない値・`base` と個別キーの混在は TypeError。
 * - 見るのは own enumerable の string キーだけで、各キーは 1 回だけ読む。getter が投げた例外は TypeError の `cause` に入る。
 * - TypeError のメッセージはプレーンテキストで、値は 64 文字に切り詰めて含む。
 */
export function resolveRenderProfile(input?: unknown): RenderProfile {
  if (input === undefined) return freezeMerged(FULL_PROFILE, new Map());
  const snapshot = snapshotPlainObject(input, 'profile');
  if (snapshot.has('base')) return resolveBaseForm(snapshot);
  return freezeMerged(FULL_PROFILE, collectFlags(snapshot, 'profile', NO_SKIP));
}

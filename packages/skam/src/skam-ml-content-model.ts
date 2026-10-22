/**
 * SKAM-ML-draft §7.0 の内容モデル表。parser と stringify が同じ値を共有するため core に置く
 * (parser と stringify は互いに依存しない)。
 */

/**
 * SKAM-ML-draft §7.0 の内容モデル表のうち、子に制約がある行を字句どおりに転記したもの。
 * キーのない親 (block / span / tateten) は子の制約なし。saidoku は base/kunform の構造として個別に検査する。
 * キー base は「saidoku の中の skam:base」を表す。
 * @experimental 仕様の改訂に合わせて変わる。0.x の間は minor で変わりうる。同じ fixed group の同じ版どうしでのみ一致を保証する。
 */
export const SKAM_ML_CONTENT_MODEL: Readonly<
  Record<
    'yomigana' | 'okimoji' | 'joji' | 'okototen' | 'base' | 'kun' | 'soegana' | 't',
    readonly string[]
  >
> = {
  yomigana: ['#text', 't', 'kun'],
  okimoji: ['#text', 't', 'kun', 'okimoji', 'joji', 'okototen'],
  joji: ['#text', 't', 'kun', 'okimoji', 'joji', 'okototen'],
  okototen: ['#text', 't', 'kun', 'okimoji', 'joji', 'okototen'],
  base: ['#text', 't', 'kun', 'okimoji', 'joji', 'okototen'],
  kun: ['#text', 't'],
  soegana: ['#text', 't'],
  t: ['#text'],
};

/** @experimental SKAM-ML-draft §7.0 の入れ子順 (外側から)。同じ範囲の要素どうしの並びを決める */
export const SKAM_ML_NESTING_ORDER = [
  'span',
  'tateten',
  'saidoku',
  'okimoji',
  'joji',
  'okototen',
  'yomigana',
  'kun',
] as const;

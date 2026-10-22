/**
 * SKAM-ML-draft §7.0 の内容モデル表。parser と stringify が同じ値を共有するため core に置く
 * (parser と stringify は互いに依存しない)。
 */

/** 範囲の要素 (§7.0 の入れ子の順の 1〜7 と soegana)。saidoku を含む */
const RANGE_CHILDREN = [
  'span',
  'tateten',
  'saidoku',
  'okimoji',
  'joji',
  'okototen',
  'yomigana',
  'kun',
  'soegana',
] as const;

/** 位置の注記の要素 */
const POSITION_CHILDREN = ['kaeri', 'kutoten', 'ref', 'br'] as const;

const TEXT_CHILDREN: readonly string[] = ['#text', 't', ...RANGE_CHILDREN, ...POSITION_CHILDREN];
/** 再読文字は読みと送り仮名を forms に内包するので、その字を含む読み・base は saidoku を子に持てない (K8) */
const TEXT_CHILDREN_WITHOUT_SAIDOKU: readonly string[] = TEXT_CHILDREN.filter(
  (name) => name !== 'saidoku'
);

/**
 * SKAM-ML-draft §7.0 の内容モデル表を字句どおりに転記したもの。キーはテキストを持てるすべての親要素。
 * saidoku は base/kunform の構造として個別に検査するのでキーに持たない。
 * キー base は「saidoku の中の skam:base」を表す。
 * 空要素の対 (`sID` / `eID`) の要素の名前は範囲の要素と同じなので、別の名前は足さない。
 * @experimental 仕様の改訂に合わせて変わる。0.x の間は minor で変わりうる。同じ fixed group の同じ版どうしでのみ一致を保証する。
 */
export const SKAM_ML_CONTENT_MODEL: Readonly<
  Record<
    | 'block'
    | 'span'
    | 'tateten'
    | 'yomigana'
    | 'okimoji'
    | 'joji'
    | 'okototen'
    | 'base'
    | 'kun'
    | 'soegana'
    | 't',
    readonly string[]
  >
> = {
  block: TEXT_CHILDREN,
  span: TEXT_CHILDREN,
  tateten: TEXT_CHILDREN,
  yomigana: TEXT_CHILDREN_WITHOUT_SAIDOKU,
  okimoji: TEXT_CHILDREN,
  joji: TEXT_CHILDREN,
  okototen: TEXT_CHILDREN,
  base: TEXT_CHILDREN_WITHOUT_SAIDOKU,
  kun: TEXT_CHILDREN_WITHOUT_SAIDOKU,
  soegana: TEXT_CHILDREN,
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

/**
 * 範囲の深さに数える要素の名前。ブロックの中で開いている数が `SKAM_ML_MAX_RANGE_DEPTH` を超えると parser は誤りにする。
 * `saidoku`、`base`、`t`、位置の注記、空要素の対の要素は数えない (どれも子に範囲の要素の鎖を作らない)。
 * @internal parser と stringify が共有する。公開 API として案内しない
 */
export const SKAM_ML_RANGE_DEPTH_ELEMENTS: readonly string[] = [
  'span',
  'tateten',
  'okimoji',
  'joji',
  'okototen',
  'yomigana',
  'kun',
  'soegana',
];

/**
 * 空要素の対 (`sID` / `eID`) にできる要素の名前。`saidoku` は対にしない (kunform を始まりの要素に持たせる特例が要るため)
 * @internal parser と stringify が共有する。公開 API として案内しない
 */
export const SKAM_ML_PAIRABLE_ELEMENTS: readonly string[] = [...SKAM_ML_RANGE_DEPTH_ELEMENTS];

/**
 * ブロックの中で開いている範囲の要素の数の上限。
 * parser の要素の深さの事前走査は `maxDepth` (既定 64。`skam-xml-parser` の input-limits) で止まる。
 * 範囲の深さが D のとき、要素の深さは skam:doc / skam:body / skam:block の 3 段と D と
 * skam:saidoku / skam:base / skam:t の 3 段で D + 6。D + 6 <= maxDepth - 2 (2 段の余裕) から D <= 56。
 * maxDepth の既定を変えたときは、統合テストの深さ 56 の往復が落ちて知らせる。
 * @internal parser と stringify が共有する。公開 API として案内しない
 */
export const SKAM_ML_MAX_RANGE_DEPTH = 56;

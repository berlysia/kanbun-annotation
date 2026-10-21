/**
 * 言語タグの形の検査
 *
 * BCP 47 の形の大枠だけを見る。登録されたサブタグかどうかは確かめない
 * (登録簿を持ち込むと更新に追従する負担が生じ、`lzh` のような使われ方も弾きかねない)。
 * 検査に通った値は属性値にそのまま出せる (引用符や山括弧を含められない)。
 */
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;

export function isLanguageTag(value: unknown): value is string {
  return typeof value === 'string' && LANGUAGE_TAG.test(value);
}

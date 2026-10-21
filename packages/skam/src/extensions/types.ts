/**
 * 拡張の定義の型。
 *
 * 拡張の定義は core から型だけを import する。core の値を import すると、
 * validator → 拡張の束 → 拡張 → core の循環になる。
 */

import type { Mark, MarkType } from '../index.js';
import type { ValidationError } from '../errors.js';

/** `ext.<名前>` の値が置かれた場所 */
export type ExtensionOwner =
  | { kind: 'document' }
  | { kind: 'reading' }
  | { kind: 'block' }
  | { kind: 'token' }
  | { kind: 'mark'; mark: Mark };

/** SKAM-ML の要素と、その要素が作る注記 (part は skam:kun の yomi / okuri / soe、ほかは self) */
export interface XmlElementMarks {
  element: string;
  marks: ReadonlyArray<{ part: 'self' | 'yomi' | 'okuri' | 'soe'; mark: Mark }>;
}

/** 描画で隠す所。slot の値は AIR から消さず、隠す所の名前だけを返す */
export interface HiddenParts {
  slots: ReadonlyArray<
    'ruby' | 'okuri' | 'soegana' | 'kaeri' | 'kutoten' | 'saidokuUnder' | 'saidokuOkuri2'
  >;
  omitOkimoji: boolean;
  omitJoji: boolean;
}

/** 拡張の定義。名前、SKAM-ML の名前空間の URI、必須かどうかと、各層の hook を持つ */
export interface SKAMExtensionDefinition {
  /** 小文字の英数字 */
  name: string;
  /** SKAM-ML の名前空間の URI。識別子で、取りに行かない */
  uri: string;
  /** 値を使う文書は extensionsRequired に挙げる */
  required: boolean;
  validate?(value: unknown, path: string, owner: ExtensionOwner): ValidationError[];
  /**
   * parser: 要素のこの拡張の名前空間の属性 (local name → 値) から、注記ごとの拡張の値を返す。
   * 誤りは文字列 (値を含めない)
   */
  readXmlAttributes?(
    attributes: ReadonlyMap<string, string>,
    target: XmlElementMarks
  ): { values: ReadonlyArray<{ mark: Mark; value: unknown }> } | { error: string };
  /** stringify: 要素に書くこの拡張の名前空間の属性 (local name → 値) */
  writeXmlAttributes?(target: XmlElementMarks): ReadonlyMap<string, string>;
  /** 描画: 字に付く注記 (種類ごと) から隠す所 */
  hiddenParts?(tokenMarks: ReadonlyMap<MarkType, readonly Mark[]>, options: unknown): HiddenParts;
  /** 描画: 注記 1 つを隠すか (セル、範囲、後ろの注記、竪点、ブロック先頭の kutoten) */
  isHidden?(mark: Mark, options: unknown): boolean;
  /** 描画の選択肢 (extensionOptions[name]) の検査。描画の入口で呼ぶ。誤りは TypeError */
  assertOptions?(options: unknown): void;
}

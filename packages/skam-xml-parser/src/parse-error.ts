/**
 * Parse error types (shared by pre-scan, XML parsers and parser-core; kept separate to avoid circular imports)
 */

/**
 * Position information in the source XML
 */
export interface PositionInfo {
  /** 1-based line number */
  line: number;
  /** 1-based column number */
  column: number;
  /** 0-based byte offset from the start of the source */
  offset: number;
}

/** 目印のキーの文字列は契約 (ADR-033 KD10)。変えると版の違うコピーの間で判別できなくなる */
const PARSE_ERROR_BRAND = Symbol.for('@kanbun-skam/skam-xml-parser/SKAMXMLParseError');

export class SKAMXMLParseError extends Error {
  /**
   * @param line 1-based line. 位置が分かるときだけ付く。
   *   - 要素の処理中の誤りと事前走査の誤り: 開始タグの `<` の位置 (列は UTF-16 単位)。ブラウザ版も Node 版と同じ値になる。
   *     ただし開始タグと DOM の要素の対応が取れないときは付かない
   *   - XML の構文の誤り: Node 版は xmldom の報告、ブラウザ版は Chromium / Firefox が報告した付近の値。
   *     ブラウザごとに意味が違い (Chromium は誤りを検出した後の位置を code point で、Firefox は誤りの字句の付近を指す)、
   *     Node 版とも一致しない。探す手がかりとして使い、比較には使わない。読めない形の報告 (WebKit は未確認) では付かない
   * @param column 1-based column。`line` と同じ条件で付く
   */
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(message);
    this.name = 'SKAMXMLParseError';
  }
  /**
   * パッケージの重複や別の realm (iframe) ではクラスが別になり、通常の instanceof が偽になる。
   * Symbol.for のレジストリは同じ agent の realm の間で共有されるので、目印で判別する (ADR-033 KD10)。
   * `this` がサブクラスのときは通常の判定に任せ、基底のインスタンスまで真になるのを防ぐ。
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    if (this !== SKAMXMLParseError) {
      return Function.prototype[Symbol.hasInstance].call(this, value);
    }
    try {
      if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
        return false;
      return (value as Record<symbol, unknown>)[PARSE_ERROR_BRAND] === true;
    } catch {
      // getter や Proxy が投げても、判定は例外を出さない
      return false;
    }
  }
}

// 目印はプロトタイプの getter。インスタンスの own property にせず、列挙・JSON 化に出さない
Object.defineProperty(SKAMXMLParseError.prototype, PARSE_ERROR_BRAND, {
  get: () => true,
  enumerable: false,
  configurable: true,
});

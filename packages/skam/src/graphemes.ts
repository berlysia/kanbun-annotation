/**
 * 本文を拡張書記素クラスタ (Unicode の extended grapheme cluster) に分ける。
 * IVS・SVS・結合文字は基底の字と同じクラスタに入る。SKAM-ML の token の単位であり、仕様の「字」はこれを指す。
 *
 * 分け方は言語に依存しないので locale は渡さない。正規表現で基底の字・結合文字・選択子をまとめる案は、
 * 書記素の規則 (ハングルなど) を自前で持つことになり Intl.Segmenter と食い違うので取らない。
 * Intl.Segmenter が無い環境の代わりの分け方も持たない (環境ごとに token の数が変わるより失敗させる)。
 */

// 読み込むだけの利用者が Intl.Segmenter の無い環境でも壊れないよう、最初に呼ばれたときに作る
let segmenter: Intl.Segmenter | undefined;

export function splitGraphemes(text: string): string[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  // 描画は 1 字の token ごとに呼ぶので、1 code point の文字列は分割を通さずに返す (canvas の bench で約 2 倍遅くなったため)。
  // Segmenter を先に作るのは、Segmenter の無い環境で入力によらず TypeError にするため
  if (text.length === 1 || (text.length === 2 && text.codePointAt(0)! > 0xffff)) return [text];
  const clusters: string[] = [];
  for (const { segment } of segmenter.segment(text)) clusters.push(segment);
  return clusters;
}

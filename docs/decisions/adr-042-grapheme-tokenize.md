---
status: Complete
---

# ADR-042: 書記素クラスタでの tokenize

## コンテキスト

SKAM-ML の parser は、テキストを Unicode の code point ごとに token にしていた。異体字セレクタ (IVS の U+E0100〜U+E01EF、SVS の U+FE00〜U+FE0F) と結合文字は、基底の字と別の token になり、注記は基底の字の token に付けるしかなかった (ADR-028「既知の制約と未実施の確認」)。stringify は JSON の token の `text` をそのまま書くので、2 字以上の token は XML に書いて読み直すと分かれたが、損失として報告しなかった。描画も、傍点の数、隠す注記の空白、canvas の 1 字ずつの描画とルビの字数を code point で数えていた。

`Intl.Segmenter` は web-features で 2024-04-16 に Baseline newly available になった (Chrome 87、Safari 14.1、Firefox 125)。widely available は、その 30 か月後の 2026-10-16。Node は 16 から使える。

## 利用者の決定 (2026-10-21)

1. 要素の境界のせいで、テキストの先頭に結合文字や異体字セレクタが単独で来たら、それだけで 1 token にする。
2. JSON の 1 token が 2 つ以上の書記素のとき、stringify は損失にする。往復で token の数が変わることを黙って起こさない。

## 決定

### 単位と共通の関数

- token は拡張書記素クラスタ (Unicode の extended grapheme cluster、`Intl.Segmenter` の `granularity: 'grapheme'`) 1 つ。分け方は言語に依存しないので、locale は渡さない。仕様の「字」はこの単位を指す。`tokenization="char"` の名前は変えない。
- `@kanbun-skam/skam` のルートから `splitGraphemes(text)` を配り、parser、stringify、html、canvas はこれで分ける。`Intl.Segmenter` は最初に呼ばれたときに 1 つ作って使い回す。読み込むだけなら `Intl.Segmenter` の無い環境でも誤りにならず、呼ぶと `TypeError` になる。代わりの分け方は持たない。

### parser

- テキストノードごとに分ける。テキストノードをまたいだクラスタは作らない (要素の外の字が要素の中の token に入ると、stringify で元の形に戻らないため)。先頭の孤立した結合文字や選択子は、それだけで 1 token (利用者の決定 1)。
- クラスタの先頭から無視する空白 (U+0009、U+000A、U+000D、U+0020) を取り除き、残りが空ならそのクラスタは token にしない (`\r\n` の 1 クラスタも無視する)。残りがあれば残りを 1 token にする。U+3000 は token。
- クラスタの位置は、クラスタの最初の code point をソースから探して決める。クラスタ全体で探すと、`葛&#xE0100;` のようにリテラルと文字参照が混ざるときに見つからないため。列は UTF-16。

### stringify

token ごとに次の順で判定し、当たった 1 つだけを報告する。message に値を入れない。

| token の `text`   | 損失                                       |
| ----------------- | ------------------------------------------ |
| 無視する空白だけ  | `ASCII_WHITESPACE_TOKEN`                   |
| 書記素が 2 つ以上 | `MULTI_GRAPHEME_TOKEN` (`unrepresentable`) |
| 書記素が 1 つ     | なし                                       |

### 描画

- html の傍点は書記素ごとに 1 つ、隠す注記の空白は書記素ごとに 1 つ (全角か半角かは書記素の先頭の code point で決める)。
- canvas は書記素ごとに描き、ルビなどの字数を書記素で数える。

### そのほか

- validator は token の `text` の長さを制限せず、2 つ以上の書記素の token に警告も出さない。JSON だけで使う利用者には正しい文書のため。
- 1 クラスタの長さは制限しない。parse の入力全体は `maxInputLength` (500 万 UTF-16 単位) が抑え、分割は入力の長さに比例する (結合文字を 500 万個続けた 1 クラスタの分割は 24ms)。

## 受け入れた限界

- 書記素の分け方は、実行環境が持つ Unicode の版で変わりうる (絵文字の ZWJ の並びなど)。同じ文書でも、環境によって token の数と stringify の損失の判定が変わりうる。CJK の字、IVS、SVS、結合文字の組は版で変わらない。処理系をまたいで同じ token の列が要る文書は、この範囲の字で書く。
- 要素をまたぐクラスタは作らない。基底の字と選択子は同じテキストノードに書く。
- 次の 2 つは往復で token が変わるが、損失にしない。どちらも parse が作る token には現れず、手で書いた JSON にだけ現れる。
  - 無視する空白で始まり空白だけではない token (`' ́'`): 読み直しで先頭の空白が落ちる。
  - 結合文字や選択子で始まる token が、前の token と同じテキストに書かれる (`['葛', '\u{E0100}']`): 読み直しで 1 token にまとまる。見つけるには、どの token が同じテキストノードに入るかを stringify の書き出しの全経路で追う必要がある。parse が作る孤立した選択子の token (要素の後ろ) は同じ位置に書き戻されて変わらないので、手で書いた JSON だけのために追う仕組みは足さない。
- `Intl.Segmenter` の無い実行環境 (Firefox 124 以前など) では、parse、stringify、描画が `TypeError` になる。
- canvas は skam を bundle するので、`splitGraphemes` と使い回す Segmenter が canvas の bundle に別に入る。
- playground は選択を token の添字で保つので、IVS や結合文字を含む入力では編集の前後で選択がずれうる (未確認。docs/plans/backlog.md で追う)。

## 却下した案

- **正規表現で基底の字と結合文字と選択子をまとめる**: 書記素の規則を自分で持つことになり、ハングルの音節などで `Intl.Segmenter` と食い違う。
- **孤立した選択子を前の token にくっつける**: 利用者の決定 1。要素の外の字が要素の中の token に入り、stringify で元の形に戻らない。
- **2 つ以上の書記素の token を損失にしない**: 利用者の決定 2。
- **validator で 2 つ以上の書記素の token に警告する**: JSON だけで使う利用者には正しい文書で、警告が常に出る。

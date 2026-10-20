---
status: Complete
---

# ADR-033: 表示設定のキー名を公開の語彙にし、誤りを構造のある形で返す

補う: [ADR-030](adr-030-consumer-feedback.md) の K4 (表示設定を skam/rendering に一本化し、常に厳密に検証する)

この ADR の KD1〜KD10 は、この ADR の中の番号である。

## コンテキスト

教材ビューアの利用者から、0.2.0 を使った 2 回目のフィードバックを受けた (2026-10-20)。この ADR はそのうち 2 つを扱う。

- 1: 作者は教材に `data-hide="kaeriten okurigana"` のように、表示設定のキー名をそのまま書く。ADR-030 K4 が安定と明記したのは `{ base, overrides }` の形と 4 つの API で、13 個のキー名の互換は書いていなかった。キー名が変わると、教材をすべて書き換えることになる。
- 4: `resolveRenderProfile` の誤りは英語の文だけの `TypeError` だった。利用者は作者に日本語の文と候補の一覧を示すため、同じ検査を手前で二重に持っていた。

誤りは `render-profile.ts` の 7 か所で投げていた。種類は 6 つで、plain object でない誤りだけが 2 か所 (null・配列・プリミティブと、クラスのインスタンス) にある。どの経路も `TypeError` を包み直さずに利用者に届く。Web Component の `toTypeError` も `TypeError` ならそのまま返す。

## 利用者の決定 (2026-10-20)

1. キー名は公開の語彙とする。0.x でも改名・削除しない。やむを得ず変えるときは、旧い名前を別名として次の minor まで受け付ける。キーの追加は minor でありうる。
2. 誤りは `TypeError` のサブクラスで返し、種類とキーと場所を持たせる。最初の誤りで投げる。全件を返す検査関数は足さない。
3. キー名の一覧を、凍結した配列の定数として export する。
4. 既存のキーの、各プリセットでの値は約束しない。
5. canvas の IIFE 版と ESM 版を併用しても `instanceof` が効くよう、Symbol の目印と `Symbol.hasInstance` で対処する。対象はこのクラスだけとし、既存の誤りのクラスは後に回す。

## 決定

- **KD1 キー名の互換**
  - 13 個のキー (`yomigana`、`okurigana`、`kaeriten`、`kutoten`、`saidoku`、`okototen`、`tateten`、`emphasis`、`okimoji`、`joji`、`soegana`、`highlight`、`ref`) は、0.x でも改名・削除しない。キーが隠す注記の種類 (意味) を変えることも、改名と同じに扱う。
  - キーの追加は minor でありうる。追加したキーは、部分指定では full (表示) になる。各プリセットでの値は、追加するときに決めて changeset に書く。
  - 既存のキーの、各プリセットでの値は約束しない。minor で変わりうり、変えるときは changeset に書く。README で、出題では隠すキーを `overrides` で明示するよう勧める。
  - キーを足すと型 `RenderProfile` も広がる。README で、`RenderProfile` は `resolveRenderProfile` の戻り値か `RENDER_PROFILES` から得るよう書く。
  - 約束は `render-profile.test.ts` の、13 個の名前をリテラルで並べたテストで固定する。このテストを変える変更は、この ADR の対象である。
- **KD2 別名の仕組みは今は作らない**: 改名の予定が無いため。手順は下の「改名するときの手順」に書く。
- **KD3 誤りのクラス**: `SKAMRenderProfileError extends TypeError`。名前は既存の `SKAMValidationError` などに合わせる。`TypeError` を継承する初めてのクラスで、今の `TypeError` を受けているコードとの互換のためである。`kind` の値は、既存の `ValidationErrorKind` に合わせて大文字のスネークケースにする: `NOT_PLAIN_OBJECT`、`UNREADABLE_KEY`、`UNKNOWN_KEY`、`NOT_BOOLEAN`、`MIXED_BASE`、`UNKNOWN_BASE`。
- **KD4 メッセージと値**
  - メッセージは 0.2.0 と一字一句同じにした。ただし契約はフィールド (`kind`、`where`、`key`) で、文言は契約外とし、minor で変わりうる。
  - `key` は先頭 64 字 (UTF-16 単位。メッセージの切り詰めと同じ)。`NOT_PLAIN_OBJECT` 以外では必ずある。1 つのクラスにしたので、`key` の有無は型で分けていない。
  - 値 (`value`) はフィールドに持たない。メッセージに入っており、大きい object の値で誤りが大きくなるのを避けるため。`UNKNOWN_BASE` で誤った preset 名を知りたい利用者は、自分が渡した `base` を使う。
- **KD5 `RENDER_PROFILE_KEYS`**: 凍結した配列で、安定した API とする。並びは契約外で、キーを足すときは末尾に足す。`RenderProfileKey` (= `keyof RenderProfile`) との過不足は、`render-profile.ts` の型だけの検査で `pnpm typecheck` が落とす。
- **KD6 `kind` と `where` の拡張**: 値は minor で増えうる。既存の値の意味は 0.x でも変えない。README で、`kind` で分岐する利用者に default 節を持つよう書いた。`kind` の一覧の定数は export しない。
- **KD7 Web Component の JSON の誤り**: プリセット名でも JSON でもない `profile` 属性 (`"nope"` など) は、今の `TypeError` のままにする。表示設定の検査の前の、属性の文字列の読み取りの誤りで、6 つの種類に当たらない。JSON として読めた値の誤りは `SKAMRenderProfileError` になる。
- **KD8 判別の仕方**: README の例は `instanceof SKAMRenderProfileError` を使う。コピーや realm をまたぐ場合は KD10 で対処した。
- **KD9 リリース**: changeset は `@kanbun-skam/skam: minor`。API の追加を minor とした先例 (`web-component-errors-and-labels`) に合わせた。6 パッケージは版をそろえて上がる。
- **KD10 コピーと realm をまたぐ判別**
  - canvas-renderer の IIFE 版 (`./browser-bundle`) は skam を内包する。ESM 版と併用したり、skam が重複して入ったり、iframe をまたいだりすると、クラスが別になり、通常の `instanceof` は偽になる。
  - クラスのプロトタイプに、`Symbol.for('@kanbun-skam/skam/SKAMRenderProfileError')` をキーにした目印 (値が `true` の getter。列挙されない) を置く。`static [Symbol.hasInstance]` を差し替え、`this` がこのクラスそのもののときは「object で、目印が厳密に `true`」で判定する。サブクラスでは通常の判定に任せる。目印の読み出しで例外が出ても偽を返す。
  - `Symbol.for` のレジストリは、同じ agent の realm の間で共有される (ECMA-262 の GlobalSymbolRegistry)。integration-tests で、IIFE 版を `node:vm` の別の realm で動かして得た誤りが、ESM 版のクラスの `instanceof` で真になることを確かめた。iframe での共有は仕様を根拠にしている。
  - 目印のキーの文字列は契約で、変えない。変えると、版の違うコピーの間で判別できなくなる。版の違うコピーの間で誤りの形が違っても、KD6 の規則で吸収する。形を壊す変更が要るときは、旧いキーを外さずに新しいキーを足す。キーの名前は `@kanbun-skam/<パッケージ名>/<クラス名>` とし、他の誤りのクラスに広げるときも従う。
  - 限界: 別の realm の誤りは `instanceof TypeError` が偽になる (プラットフォームの性質)。目印を手で付けた object や `Object.create(SKAMRenderProfileError.prototype)` も真になる。`structuredClone` や `postMessage` で複製した誤りは偽になる。目印は信頼の境界ではない。`key` と `message` は利用者の入力を含むので、HTML に出すときはエスケープする。

## 改名するときの手順

1. 旧い名前を別名として、次の minor まで受け付ける。受け付ける間は、旧い名前を `UNKNOWN_KEY` にしない。
2. 別名は `RENDER_PROFILE_KEYS` に載せない (正規の名前だけ)。
3. 受け付ける期間と外す版を、changeset と README に書く。
4. 期間が過ぎた minor で別名を外し、その changeset に書く。

## 却下した案

- **README にキー名の一覧と方針を書くだけ**: 4 を満たさない。約束を機械で守る手段も無い。
- **誤りの配列を返す検査関数を足す**: 作者に複数の誤りをまとめて示せ、`key` の有無も型で分けられる。利用者は最初の誤りで投げるサブクラスを選び、公開 API を増やさなかった。
- **別名の仕組みを今作る**: 改名の予定が無い。求められていない互換の仕組みは作らない。
- **`kind` の一覧の定数を export する**: 利用者が求めていない。
- **値をフィールドに持つ**: KD4 のとおり。
- **既存のキーのプリセットでの値も約束する**: 利用者が約束しないと決めた。
- **判別関数 (`isSKAMRenderProfileError`) を export する、`name` で判別するよう README に書くだけ**: `instanceof` がそのまま効くほうを利用者が選んだ。

## 影響

- `@kanbun-skam/skam/rendering`、html-renderer、canvas-renderer から、`SKAMRenderProfileError`、`RENDER_PROFILE_KEYS`、型 `RenderProfileErrorKind` / `RenderProfileKey` が export される。
- 表示設定の誤りは `SKAMRenderProfileError` になる。`instanceof TypeError` とメッセージは変わらない。`error.constructor === TypeError` の比較は偽になる。
- Web Component の `skam-error` の `error` は、`profile` 属性の誤りで 2 つの型に分かれる (KD7)。

## 残る作業

- `SKAMValidationError`、`SKAMXMLParseError`、`SKAMXMLStringifyError` も、コピーや realm をまたぐと `instanceof` が偽になる。KD10 と同じ目印を入れるかを決める。docs/plans/backlog.md で追う。
  - 2026-10-20 に 3 つのクラスへ KD10 の目印を入れた。キーは `@kanbun-skam/<パッケージ名>/<クラス名>`、値が `true` であることも契約。規則は 4 つのクラスに複製してあり、変えるときは 4 か所を同時に直す。

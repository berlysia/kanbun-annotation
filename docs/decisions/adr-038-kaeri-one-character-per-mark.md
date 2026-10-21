---
status: Complete
---

# ADR-038: 返り点は 1 字ずつの注記で書く

## コンテキスト

同じ字の後に 2 つの返り点 (一レなど) を付ける書き方が 2 通りある。

- 1 つの kaeri の注記に複数の字を書く (`value: "㆒㆑"`、SKAM-ML では `<skam:kaeri kind="ichi-re"/>`)。
- 同じ位置に 1 字ずつの kaeri の注記を 2 つ置く (`<skam:kaeri kind="ichi"/><skam:kaeri kind="re"/>`)。

仕様は、同じ位置の kaeri の重複を決めていなかった (ADR-028)。validator は position の注記の重複を検査せず、kaeri の `value` は Kanbun の字 (U+3191〜U+319F) が何字でも通る。どちらの書き方も往復する。

漢文の慣習では、一レ、上レ、甲レ、天レは 1 つの返り点ではなく、2 つの返り点が同じ字に付いたものとして扱う。Unicode にも一レの合字は無い。

描画には不具合があった。AIR と canvas は、竪点のグループの中では位置の最初の kaeri だけを使い、2 つ目を落としていた。html は注記ごとに span を作るので、2 つの注記と 1 つの注記で出力が違った。

## 利用者の決定 (2026-10-21)

1. 正の書き方は、同じ位置の 1 字ずつの注記にする。
2. 複数の字の値は、validator で警告し、parser は今と同じく読む。shiori で deprecate を管理し、0.4.0 で削除する。
3. validator の `valid: true` の結果に、任意の `warnings` を足す。
4. 複数の字の値を分ける変換の関数を配る。

## 決定

### 書き方と描画

- kaeri の注記の `value` は 1 字で書く。同じ字の後に複数の返り点を付けるときは、同じ `position` に注記を並べる。
- 同じ位置の kaeri の順は marks[] の順で、順は意味を持つ (`㆒`、`㆑` と `㆑`、`㆒` は別の描画になる)。XML の往復で順は保たれる。
- 描画 (AIR、html、canvas、読み上げのテキスト) は、同じ位置の kaeri の値を marks[] の順につなぎ、その値を 1 つの注記のときと同じに描く。つなぐ規則は `@kanbun-skam/skam/rendering` の `joinKaeriValues` の 1 か所にあり、竪点のグループの中では、つないだ値を `splitKaeriForTateten` で分ける。描画は注記の `ext` を使わない。

### 0.3 の互換と警告

- 2 字以上の値は 0.3 でも通る。parser は 1 つの注記のまま読み (分けない)、stringify は 1 つの注記のまま書く (`kind="ichi-re"`)。JSON → XML → JSON の往復で文書は変わらない。
- validator は `valid: true` の結果の `warnings` に `KAERI_MULTI_CHARACTER` を 1 件ずつ足す。警告が無ければ `warnings` のキーは付かない。`message` は固定の文で、値を埋め込まない。
- parser は `skam:kaeri` の `kind` がハイフンで連結されているとき、要素名と位置を持つ `ParseWarning` (`code: 'KAERI_MULTI_CHARACTER'`) を自分で出す。`validate: false` でも出す。`validate: true` で呼ぶ validator の `warnings` は `onWarning` に流さない。validator の警告は要素名と位置を持たないためで、同じことを 2 回知らせないためでもある。決定 3 で「parser は validator の警告を流す」と考えていた形とは、仕組みが違う。
- `ParseWarning.code` と `ValidationWarningKind` は、同じ値を別の型で持つ。値は `@kanbun-skam/skam` の定数 `KAERI_MULTI_CHARACTER` の 1 か所で定め、parser のテストで一致を確かめる。
- `ValidationSuccess<T>` に任意のキーを足すのは minor の変更とする。利用者が自分で作る `ValidationSuccess` の値は型の誤りにならない。`ValidationWarningKind` に値を足すのも minor とする。

### 変換の関数

- `splitMultiCharacterKaeri(doc, { idGenerator? })` は、値が Kanbun の字 2 字以上の kaeri を、同じ位置の 1 字ずつの注記に分ける。分けた注記は元の注記の marks[] の位置に字の順で並べる。
- 1 つ目は元の `id` と `ext` を引き継ぐ。2 つ目以降は新しい id を振り、`ext` を持たない (同じ内容を複数の注記に写さないため)。kaeri の id はほかの注記から参照されないので、参照は壊れない。
- 新しい id が文書の id (blocks、tokens、marks) と重なったら生成器を呼び直し、100 回続けて重なったら `Error` を投げる。
- 文書は書き換えず、2 回かけても結果は変わらない。

### deprecate の管理

- 互換のためのコード (validator の警告、parser のハイフンの扱い) に `shiori:` の注記を付け、`.config/shiori/registry.json` に登録する。削除は日付でなく版で決まるので、期限 (`expires`) は付けない。
- 台帳の `kind` は `intentional` にする (`temporary` は期限を求めるため)。
- CI の `shiori` の job が `shiori check` (走査と照合) を実行し、注記と台帳の食い違いで落ちる。`shiori verify` だけでは走査の結果を標準入力から待つので、CI では使わない。

### 0.4.0 で行うこと

- validator は、同じ名前の `ValidationErrorKind` (`KAERI_MULTI_CHARACTER`) で誤りにする。警告と誤りは同じ定数を使う。
- parser は `validate: false` なら今と同じく読み、`ParseWarning` も出し続ける (変換の関数に渡せるようにするため)。
- 変換の関数は残す (0.3 の文書を移す手段のため)。
- shiori の台帳の項目と注記を消す。

### format の位置づけ

- `format: 'skam@0.1'` は構文の系統の名前である。0.x の間は、minor で注記の種類や属性を足す。新しい機能を使う文書は、古い reader が誤りにすることがある。
- format を上げるのは、必須の要素を足すときと、既存の要素の意味を変えるときである。kaeri の 1 字の制限は既存の文書を誤りにするが、警告の期間と変換の関数を用意し、0.x の major に当たる 0.4.0 で行うので、format は上げない。

## 却下した案

- **複数の字の値だけを正にする**: 漢文の慣習 (2 つの返り点が同じ字に付く) と合わず、同じ位置の 2 つの注記の書き方も残るので、2 通りの書き方が続く。
- **0.3 ですぐ誤りにする**: 既存の文書と XML が、変換の手段を得る前に読めなくなる。
- **parser で自動的に分ける**: 往復で文書が変わる (1 つの注記が 2 つになり、id が増える)。変換は利用者が明示して呼ぶ。

## 結果

- 正の書き方が 1 つになり、仕様、例、playground がそれに揃う。
- 竪点のグループの中で 2 つ目の kaeri を落とす不具合が直る。
- 0.3 の間は、複数の字の値を使う利用者に警告が届く。0.4.0 で誤りになる。

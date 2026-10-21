---
status: Complete
---

# ADR-041: 文書の本文の言語 (`lang`)

## コンテキスト

SKAM-ML の例と fixture のルートは `xml:lang` を持つが、JSON の文書に置き場が無く、parse で捨てられ、stringify は書かなかった。html の描画は、表示層の `lang` を選択肢 `displayLang` (既定 `ja`) で決め、コンテナは `lang="ja"` を決め打ちしていた。読み上げ層は `lang` を持たずコンテナを継ぐ。読み上げ層の中身は、作者の読み (yomiage、kakikudashi)、読みが無ければ白文、`readingLayerSource: 'display'` なら表示層から作った日本語の文である。

公開済みの 0.2.0 で 2026-10-21 に確かめた: `validateSKAMDocument` は最上位の `lang` を誤りにせず、戻りの文書から落とす。parser はルートの `xml:lang` を誤りにせず読み捨て、stringify は `xml:lang` を書かない。

## 利用者の決定 (2026-10-21)

1. 文書の `lang` は、html の表示層と、白文に戻った読み上げ層にだけ使う。コンテナは `ja` のまま。コンテナに付けると、日本語の書き下しを読む読み上げ層まで本文の言語で読まれるため。

## 決定

### JSON とその検査

- 文書の最上位に任意の `lang` (文字列)。本文 (白文) の言語を表す。readings、ブロック、token には置かない。
- 値の形は `/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/` (BCP 47 の言語タグの大枠。例 `ja`、`lzh`、`zh-Hant`)。登録されたサブタグかは確かめない。
- `@kanbun-skam/skam` のルートから型ガード `isLanguageTag(value: unknown): value is string` を配る。文字列でなければ false。validator と html の `displayLang` の検査がこれを使い、式は 1 か所にある。
- validator は、文字列でない `lang` を `INVALID_TYPE`、形に合わない `lang` を `INVALID_VALUE` (`path` は `lang`) にし、通れば戻りの文書に残す。

### SKAM-ML

- ルートの `xml:lang` が文書の `lang`。空の値 (`xml:lang=""`) は言語の情報が無いことを表し、`lang` を持たない文書になる。ルート以外の要素の `xml:lang` は読まない。
- parser の `validate: true` では、`lang` の形の誤りを位置 (`line` / `column`) なしで出す (属性の誤りで、要素の位置に結び付かないため)。`validate: false` では値をそのまま入れる。
- stringify は、`lang` が文字列のときだけルートに `xml:lang` を書き、値を escape する (stringify は validator を通らない JSON も受けるため)。

### 描画

- html の表示層の `lang` は、`displayLang` → 文書の `lang` → `ja` の順。コンテナは `ja`。
- 読み上げ層は、出どころが `'readings'` で yomiage も kakikudashi も無く白文に戻ったときだけ、文書の `lang` を持つ。書き下し、yomiage、`'display'` の読み上げ (`hideQuiz` を渡したときの既定を含む) は日本語のラベルを含むので持たない。
- 文書の `lang` は validator を通っていない文書からも来るので、描画は `isLanguageTag` に通った値だけを属性に出す。形を縛った値なので escape しない (`displayLang` と同じ経路)。合わない値は無いものとして扱う。
- web component は `display-lang` 属性が無いか不正な値なら描画に渡さないので、表示層は文書の `lang`、それも無ければ `ja` になる。
- canvas は言語を扱わない (出力は画素で、言語の属性が無い)。

## 受け入れた限界

- 形の検査は登録されたサブタグを確かめない。`xx-yyyy` のような存在しない言語タグも通る。
- 表示層の `lang` を `ja` 以外 (例 `lzh`) にすると、ブラウザが選ぶ字形と読み上げの声が変わりうる。主要なブラウザと読み上げソフトでは確かめていない。
- ルート以外の要素の `xml:lang` は parse で落ちる。
- `validate: false` の parse の `lang` は形を確かめていない値。`lang` を HTML に使う利用者は `isLanguageTag` を通す。
- 0.2.x の validator と parser は `lang` を誤りにせず落とすので、0.2.x を通して書き戻すと `lang` が消える。

## 却下した案

- **コンテナにも文書の `lang` を使う**: 利用者の決定 1。
- **`ext` や `custom` に置く**: `ext` は拡張の値、`custom` は SKAM が解釈しない値の置き場で、描画が使う core の値を置く所ではない。
- **readings ごとに言語を持たせる**: 読みはどれも日本語の訓読で、今の要求に無い。
- **`Intl.Locale` で言語タグを検査する**: 実行環境の版で結果が変わりうる。HTML の属性に出す値を縛るには、文字の種類を決める今の式で足りる。

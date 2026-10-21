# 0.2.x から上げるときにやること

SKAM の 6 つの公開パッケージ (`@kanbun-skam/skam`、`skam-xml-parser`、`skam-xml-stringify`、`skam-html-renderer`、`skam-canvas-renderer`、`skam-web-component`) を、0.2.x から 0.3.x に上げる人に向けた文書。0.2.x のどの版から上げても手順は同じ。0.1.x から上げるときは、先に [0.1.x から上げるときにやること](migration-0.1-to-0.2.md) を行う。

## やること

### 複数の字の返り点を 1 字ずつの注記に直す (skam、skam-xml-parser)

- 対象: 1 つの kaeri の注記に 2 字以上の返り点を書いている (`value: "㆒㆑"`、SKAM-ML では `<skam:kaeri kind="ichi-re"/>`)。
- 0.3.x では読めるが、警告が出る。0.4.0 で誤りになる。
- やること: 同じ位置に 1 字ずつの注記を並べる (`<skam:kaeri kind="ichi"/><skam:kaeri kind="re"/>`)。JSON の文書は `splitMultiCharacterKaeri(doc)` (`@kanbun-skam/skam`) で変換できる。直した文書は 0.2.x の validator でも通る。
- 警告の受け取り方: XML は `parse` の `onWarning` に `code: 'KAERI_MULTI_CHARACTER'` の警告が届く。JSON を `validateSKAMDocument` に通すときは、結果の `warnings` に `kind: 'KAERI_MULTI_CHARACTER'` が入る。

### 改行の注記を使う文書は 0.3.x で揃えて扱う (すべてのパッケージ)

- 対象: `linebreak` の注記 (SKAM-ML の `<skam:br/>`) を使う文書を書く、または受け取る。
- 0.2.x の validator と parser は、`linebreak` と `<skam:br/>` を誤りにする。
- やること: その文書を読み書きする所を、すべて 0.3.x に上げる。

### 本文の言語 (`lang`) を使う文書は 0.3.x で揃えて扱う (skam、skam-xml-parser、skam-xml-stringify)

- 対象: JSON の文書に `lang` を置く、またはルートに `xml:lang` を持つ XML を読み書きする。
- 0.2.x の validator と parser は `lang` を誤りにせず落とすので、0.2.x を通して書き戻すと `lang` が消える。0.2.x の stringify は `xml:lang` を書かない。
- やること: `lang` を扱う所を、すべて 0.3.x に上げる。

### parse の結果を丸ごと比べるテストを直す (skam-xml-parser)

- 対象: `parse` の結果を `toEqual` などで丸ごと比べている。
- ルートに `xml:lang` を持つ XML の parse の結果に、`lang` が入る (例 `lang: 'ja'`)。
- やること: 期待値に `lang` を足すか、`toMatchObject` などで必要なキーだけを比べる。

### 表示層の言語を確かめる (skam-html-renderer、skam-web-component)

- 対象: `displayLang` (web component は `display-lang`) を渡さずに、`lang` を持つ文書を描画する。
- 表示層の `lang` が文書の `lang` になる (渡さず、文書にも無ければ `ja`)。読み上げ層が白文に戻るときは、読み上げ層も文書の `lang` を持つ。
- やること: 表示層を `ja` に固定したいなら、`displayLang: 'ja'` を渡す。`displayLang` の誤りの文 (`TypeError` の `message`) を比べている所は直す。

### 注記の種類と profile のキーを列挙している所に足す (skam、skam-html-renderer、skam-canvas-renderer)

- 対象: `MarkType`、`Mark`、`ValidationErrorKind` を網羅の `switch` で扱っている。`RenderProfile` や `AIRRenderProfile` を、すべてのキーを書いた object で作っている。
- やること: `linebreak` (`ValidationErrorKind` は `INVALID_LINEBREAK`) を足す。profile は `resolveRenderProfile` に一部のキーだけを渡せば、残りは既定の値で埋まる。

### 拡張を使う文書は 0.3.x で揃えて扱う (すべてのパッケージ)

- 対象: 文書に拡張の宣言 (`extensions`、`extensionsRequired`、SKAM-ML の `skam:extension`) や拡張の値 (`ext.edu` など) がある。例: 学習・教育用拡張の出題の印。
- 0.2.x の parser は拡張の宣言と名前空間の属性を黙って捨て、validator は宣言を落とし、html の描画は出題の答えをそのまま描く。必須の拡張でも止まらない。
- やること: 拡張を使う文書を読み書き、描画する所を、すべて 0.3.x に上げる。

### `ext` の自由なデータを `custom` に移す (skam)

- 対象: 拡張の宣言 (`extensions`、`extensionsRequired`) の無い文書で、文書、readings、ブロック、token、注記、derivations の `ext` にアプリケーションのデータを置いている。
- 0.3.x では読めるが、警告が出る。0.4.0 で誤りになる。
- やること:
  1. `moveLegacyExtToCustom(doc)` (`@kanbun-skam/skam`) で、`ext` を同じ所の `custom` に移す。戻り値は `{ document, registeredNameKeys }`。
  2. `registeredNameKeys` が空でなければ、その path の値が拡張の値 (例: `ext.edu` の出題の印) でないかを確かめる。拡張の値なら、変換の後の文書で、その値を `custom` から同じ所の `ext` に戻し、文書に `extensions` (必須の拡張なら `extensionsRequired` も) を宣言する。
  3. 同じ所に `ext` と `custom` の両方がある文書は、変換の関数が `TypeError` にする。先に手で 1 つにまとめる。
- 警告の受け取り方: `validateSKAMDocument` の結果の `warnings` に `kind: 'LEGACY_EXT'` が `ext` 1 つにつき 1 件入る。`ext` のキーが登録済みの拡張の名前と同じなら、`kind: 'LEGACY_EXT_REGISTERED_NAME'` も入る。
- `custom` は SKAM-ML に書けない。XML に書き出すと損失 `EXT` になる。

### 検証の警告の種類を列挙している所に足す (skam)

- 対象: `ValidationWarningKind` を網羅の `switch` で扱っている。
- やること: `LEGACY_EXT` と `LEGACY_EXT_REGISTERED_NAME` を足す。

### 検証の誤りの種類を列挙している所に足す (skam)

- 対象: `ValidationErrorKind` を網羅の `switch` で扱っている。
- やること: `INVALID_EXTENSION` を足す。

### 検証の結果を丸ごと比べるテストを直す (skam)

- 対象: `validateSKAMDocument` の `valid: true` の結果を `toEqual` などで丸ごと比べている。
- 結果に任意の `warnings` が付くことがある (警告が無ければキーは無い)。
- やること: 期待値に `warnings` を足すか、`toMatchObject` などで必要なキーだけを比べる。

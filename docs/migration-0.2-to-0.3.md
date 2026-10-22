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

### IVS や結合文字を含む XML の token の数が変わる (skam-xml-parser、skam-web-component)

- 対象: XML の本文に、異体字セレクタ (U+E0100〜U+E01EF、U+FE00〜U+FE0F) や結合文字 (Unicode の `\p{M}`) がある。
- parse は、書記素クラスタ 1 つを 1 token にする。基底の字と選択子や結合文字が 1 token になり、token の数、生成される id、添字が変わる。
- やること: その文書の token の数、id、添字を保存している所と、parse の結果を丸ごと比べている所を直す。

### stringify の損失のコードを列挙している所に足す (skam-xml-stringify)

- 対象: `StringifyLossCode` を網羅の `switch` で扱っている。
- やること: `MULTI_GRAPHEME_TOKEN`、`BLOCK_START_LINEBREAK`、`UNKNOWN_EXTENSION`、`ID_FORM`、`XML_UNWRITABLE_CHAR` を足すか、`default` の分岐を置く。

### `Intl.Segmenter` のある実行環境で動かす (skam-xml-parser、skam-xml-stringify、skam-html-renderer、skam-canvas-renderer、skam-web-component)

- 対象: `Intl.Segmenter` の無い実行環境 (Firefox 124 以前など) で動かしている。
- parse、stringify、描画は `TypeError` になる (読み込むだけなら誤りにならない)。
- やること: `Intl.Segmenter` のある実行環境 (Node 16 以上、Chrome 87 以上、Safari 14.1 以上、Firefox 125 以上) で動かす。

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
- `custom` は SKAM-ML の `skam:custom` 属性に書かれ、往復で残る。

### 検証の警告の種類を列挙している所に足す (skam)

- 対象: `ValidationWarningKind` を網羅の `switch` で扱っている。
- やること: `KAERI_MULTI_CHARACTER`、`LEGACY_EXT`、`LEGACY_EXT_REGISTERED_NAME`、`ID_FORM`、`XML_UNWRITABLE_CHAR`、`SAIDOKU_READING_OVERLAP`、`SAIDOKU_MULTI_TOKEN`、`READING_OVERLAP` を足す。

### 検証の誤りの種類を列挙している所に足す (skam)

- 対象: `ValidationErrorKind` を網羅の `switch` で扱っている。
- やること: `INVALID_EXTENSION` を足す。

### 検証の結果を丸ごと比べるテストを直す (skam)

- 対象: `validateSKAMDocument` の `valid: true` の結果を `toEqual` などで丸ごと比べている。
- 結果に任意の `warnings` が付くことがある (警告が無ければキーは無い)。
- やること: 期待値に `warnings` を足すか、`toMatchObject` などで必要なキーだけを比べる。

### parse の `idGenerator` を消し、保存した id を見直す (skam-xml-parser、skam)

- 対象: `parse` に `idGenerator` を渡している。または、parse で付いたブロック・字・注記の id を保存して後で使っている。
- `idGenerator` の引数は無い。手書きの id (`xml:id`) の無いブロックと字には位置から決まる自動の id (`b#1`、`b#1#2`) が、注記には `m#1` の形の id が付く。自動の id は文書を直すと変わる。
- やること: `parse` の呼び出しから `idGenerator` を消す。外から指すブロック・字・注記には、XML に手書きの id (`xml:id`、XML の名前の形) を付ける。

### 乱数の id の JSON は自動の id に直してから XML に書く (skam、skam-xml-stringify)

- 対象: 0.2.x の parser で読んで保存した JSON や、乱数の id (`t-1a2b3c4d` の形) で作った JSON を XML に書く。
- 乱数の id は手書きの id として扱われ、字がすべて `<skam:t xml:id="…">` で書かれる。
- やること: `convertHandIdsToAuto(doc, keep)` (`@kanbun-skam/skam`) を通してから `stringify` する。`keep` は外から指すので残す id の `Set`。`highlight.ref` が指す ref の id は `keep` に無くても残る。

### 注記を足す操作の id の形が変わる (skam)

- 対象: `generateMarkId(doc)` や注記を足す操作の戻り値の id の形 (`m-<8 桁の 16 進>`) に頼っている。
- `generateMarkId` は使われていない最小の `m#<n>` を返す。`generateId(doc, prefix)` は変わらない。
- やること: id の形に頼る所を直す。

### 傍線とラベルを `ref` 属性で結ぶ (skam-xml-parser、skam)

- 対象: SKAM-ML で、`ref` 属性を書かずに、傍線 (`<skam:span type="highlight">`) の中の `<skam:ref>` でラベルを結んでいる。
- parser はこの形を結ばない。`highlight.ref` が無くなり、ラベルが傍線に付かない。
- やること: ref に `xml:id` を付け、傍線に `ref="<その id>"` を書く。該当する文書は `lintSKAMDocument` の `HIGHLIGHT_REF_UNLINKED` が知らせる。

### 新しい検証の警告を直す (skam)

どれも 0.3.x では読めるが警告が出て、0.4.0 で同じコードの誤りになる。警告は `validateSKAMDocument` の結果の `warnings` に入る。

- `ID_FORM`
  - 対象: XML の名前の形でも位置に合う自動の形でもない id。SKAM-ML に書けない ref を指す `highlight.ref`。同じ字の読み仮名・送り仮名・添え仮名の 2 つ目以降の手書きの id。
  - stringify は損失 `ID_FORM` にする。
  - やること: 乱数の id は `convertHandIdsToAuto` で自動の id にし、手書きの id は XML の名前の形にする。`highlight.ref` は手書きの id の ref を指す。
- `XML_UNWRITABLE_CHAR`
  - 対象: 字、読み、注記の値などに、XML 1.0 で書けない文字 (U+0009、U+000A、U+000D を除く制御文字、U+FFFE、U+FFFF、対の無いサロゲート) がある。
  - stringify は損失 `XML_UNWRITABLE_CHAR` にする。
  - やること: その文字を除く。
- `SAIDOKU_READING_OVERLAP`
  - 対象: 読み仮名か送り仮名の範囲が再読文字の字を含む。
  - stringify はその範囲を損失 `UNNESTABLE_OVERLAP` にする。
  - やること: 読みを再読文字の `forms` に移すか、範囲から再読文字の字を外す。
- `SAIDOKU_MULTI_TOKEN`
  - 対象: 再読文字の `anchor` が 2 字以上。
  - stringify は、別の範囲と部分交差するときだけ損失 `UNNESTABLE_OVERLAP` にする。
  - やること: 再読文字の `anchor` を 1 字にする。
- `READING_OVERLAP`
  - 対象: 読み仮名どうし、送り仮名どうし、添え仮名どうしが、別の `anchor` で 1 字でも同じ字を含む。
  - 描画は `marks` で先にある読みを描き、それと字を共有する後の読みを描かない。
  - やること: どちらかの読みを消すか、同じ字を含まないように範囲を分ける。

### 0.3.x で書いた SKAM-ML は 0.3.x 以上で読む (すべてのパッケージ)

- 対象: 0.3.x の stringify で書いた XML を、0.2.x の parser で読む所がある。
- 0.2.x の parser は `<skam:t>`、`skam:ext` / `skam:custom` 属性、`placement-hint` 属性を捨て、空要素の対 (`sID` / `eID`) と緩めた入れ子を誤りにするか捨てる。
- やること: その XML を読む所を、すべて 0.3.x に上げる。

### AIR を直接使う所を直す (skam)

- 対象: `@kanbun-skam/skam/rendering` の AIR を読む、または `getTatetenGroups` / `getHighlightGroups` を呼ぶ。
- AIR の形が変わる。
  - 消えた型とフィールド: `AIRRangeInfo`、`AIRTrailingMark`、`AIRTokenNode` の `rangeInfo` と `rangeConsumed`、`AIRTatetenGroupNode` の `rangeInfo`。
  - 2 字以上の読み仮名は `AIRRubyGroupNode` (`type: 'ruby-group'`)。送り仮名と添え仮名の範囲は、最後の字の slot に入る。
  - 竪点と傍線は、交差する範囲で断片に分かれる (`continuesBefore` / `continuesAfter`)。傍線の `refLabel` は最後の断片だけにある。同じ字を共有する傍線は `lane` が違う。
  - 字の slot に `joinedWithNext`、`saidoku`、`emphasisStyle`、`kutotenValues`、`refLabels` がある。竪点の区切りに `hidden` がある。
  - `AIRBlockChild` とグループの `children` の union に `AIRRubyGroupNode` と `AIRTatetenSeparator` が入る。
- `getTatetenGroups` と `getHighlightGroups` は、字ごとにすべてのグループを `Map<tokenId, Mark[]>` (`marks` の順) で返す。`getRangeMarkGroups` は変わらない。
- やること: 消えた型を使う所と、網羅の `switch` を直す。2 つの関数の戻り値を配列として扱う。

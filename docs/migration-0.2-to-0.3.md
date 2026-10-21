# 0.2.x から上げるときにやること

SKAM の 6 つの公開パッケージ (`@kanbun-skam/skam`、`skam-xml-parser`、`skam-xml-stringify`、`skam-html-renderer`、`skam-canvas-renderer`、`skam-web-component`) を、0.2.x から 0.3.x に上げる人に向けた文書。0.2.x のどの版から上げても手順は同じ。0.1.x から上げるときは、先に [0.1.x から上げるときにやること](migration-0.1-to-0.2.md) を行う。

## やること

### 複数の字の返り点を 1 字ずつの注記に直す (skam、skam-xml-parser)

- 対象: 1 つの kaeri の注記に 2 字以上の返り点を書いている (`value: "㆒㆑"`、SKAM-ML では `<skam:kaeri kind="ichi-re"/>`)。
- 0.3.x では読めるが、警告が出る。0.4.0 で誤りになる。
- やること: 同じ位置に 1 字ずつの注記を並べる (`<skam:kaeri kind="ichi"/><skam:kaeri kind="re"/>`)。JSON の文書は `splitMultiCharacterKaeri(doc)` (`@kanbun-skam/skam`) で変換できる。直した文書は 0.2.x の validator でも通る。
- 警告の受け取り方: XML は `parse` の `onWarning` に `code: 'KAERI_MULTI_CHARACTER'` の警告が届く。JSON を `validateSKAMDocument` に通すときは、結果の `warnings` に `kind: 'KAERI_MULTI_CHARACTER'` が入る。

### 検証の結果を丸ごと比べるテストを直す (skam)

- 対象: `validateSKAMDocument` の `valid: true` の結果を `toEqual` などで丸ごと比べている。
- 結果に任意の `warnings` が付くことがある (警告が無ければキーは無い)。
- やること: 期待値に `warnings` を足すか、`toMatchObject` などで必要なキーだけを比べる。

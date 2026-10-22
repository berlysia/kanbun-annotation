# SKAM Data Model Reference

## ドキュメント構造

```
SKAMDocument
├── lang?       本文（白文）の言語（BCP 47 の形。SKAM-ML ではルートの xml:lang）
├── tokens[]     本文 token のマスター定義
├── blocks[]     ブロック構造（原文順、tokenIds で token を参照）
├── marks[]      注記（返り点・送り仮名等）
├── derivations[]  導出情報（読み順等、計算結果キャッシュ）
├── readings[]   読み層（書き下し文・読み上げ文）
├── extensions?  使う拡張の名前の配列（持てば宣言のある文書）
├── extensionsRequired?  知らなければ読んではいけない拡張の名前の配列
├── ext?         拡張の値（宣言のある文書では ext.<拡張の名前>）
└── custom?      SKAM が解釈しない自由なデータ
```

JSON Schema（`@kanbun-skam/skam/schema/skam.schema.json`）は、この構造と値の規則を写す。id の参照や注記の衝突など、他の要素を見る規則は validator だけが検査する（SKAM-draft §11.4）。

**Stand-off 方式**: 注記は本文テキストを直接分断しない。配置方式は 2 種:

- **anchor ベース** (10 種): `anchor: { from, to }` で token 範囲を参照
- **position ベース** (kaeri, kutoten, ref, linebreak): `position: { blockId, after? }` で token 間位置を参照

## Mark Types (v0.1)

| type        | 配置 | 用途                                     |
| ----------- | ---- | ---------------------------------------- |
| `kaeri`     | P    | 返り点（レ、一二、上下、甲乙）           |
| `okurigana` | A    | 送り仮名                                 |
| `yomigana`  | A    | 読み仮名（ルビ）                         |
| `soegana`   | A    | 添え仮名（訓読時に補う助詞・テニヲハ）   |
| `okimoji`   | A    | 置字（訓読時に読まない漢字をマーク）     |
| `joji`      | A    | 助字（文法的機能を持つ漢字の分類ラベル） |
| `kutoten`   | P    | 句読点                                   |
| `saidoku`   | A    | 再読文字（forms[] で複数回の読みを表現） |
| `okototen`  | A    | ヲコト点（glyph-grid 座標系で位置指定）  |
| `tateten`   | A    | たて点（熟語境界）                       |
| `emphasis`  | A    | 傍点・圏点                               |
| `highlight` | A    | 傍線（ref を参照可）                     |
| `ref`       | P    | 参照識別子・注釈（highlight と連動）     |
| `linebreak` | P    | 改行（ブロックの中で行を改める）         |

`A = anchor: { from, to }、P = position: { blockId, after? }`

## Mark 配置方式の詳細

anchor ベースと position ベースは共通基底 `MarkBase` から対等に分岐。

- `MarkBase`: 共通フィールド（type, id?, placementHint?, ext?, custom?）
- anchor ベース (10 種): `AnchoredMark extends MarkBase`。`anchor: { from, to }` で token 範囲に付随
- position ベース (kaeri, kutoten, ref, linebreak): `PositionedMark extends MarkBase`。`position: { blockId, after? }` で token 間に配置

型ガード: `isAnchorBasedMark(mark)` / `isPositionBasedMark(mark)` で判定可能

## id

- 手書きの id（XML の NCName）と、`#` を含む自動の id（ブロック `b#n`、字 `<ブロックの id>#n`、注記 `m#n`）に分かれる（SKAM-draft §3.1）。判定、付け直し、`ID_FORM` と書けない文字の判定は `packages/skam/src/auto-ids.ts` の 1 か所にあり、validator、parser、stringify が使う
- highlight と ref は `highlight.ref`（SKAM-ML の `ref` 属性）の名前でだけ結ぶ。`highlight.ref` は手書きの id の ref を指す。lint の `HIGHLIGHT_REF_UNLINKED` は、`ref` の無い highlight の範囲に ref がちょうど 1 つある形を知らせる
- parser は `xml:id` の無いブロックと字に位置の値を、注記に出力の順の `m#n` を付ける。stringify は手書きの id だけを `xml:id` で書く
- 形に反する id は validator の警告 `ID_FORM`、XML に書けない文字は `XML_UNWRITABLE_CHAR`（0.3 は警告、0.4.0 で誤り）。stringify は同じ所を同じコードの損失にする
- §7.0 の内容モデルの表（`SKAM_ML_CONTENT_MODEL`、`SKAM_ML_NESTING_ORDER`）は `packages/skam/src/skam-ml-content-model.ts` にあり、parser と stringify が使う

## 拡張（`ext`、`custom`、`extensions`）

- 文書、readings、ブロック、token、注記のどれにも `ext`（拡張の値）と `custom`（自由なデータ）を置ける。型は `Record<string, unknown>`
- 文書が `extensions` を持つ（空の配列も含む）と、宣言のある文書として読む。`ext` のキーは拡張の名前で、`extensions` に無い名前は `INVALID_EXTENSION`。知っている拡張の値はその定義の `validate` が検査し、知らない拡張の値は検査しない
- `extensions` を持たない文書の `ext` は、0.3 では自由なデータとして読み、`LEGACY_EXT` の警告（`valid: true` のまま）を返す。0.4.0 で誤りになる。キーが登録済みの拡張の名前と同じなら `LEGACY_EXT_REGISTERED_NAME` も返す。`moveLegacyExtToCustom(doc)` がすべての `ext` を `custom` に移す
- 拡張の定義（`SKAMExtensionDefinition`）は `@kanbun-skam/skam/extensions` の型。`validate`（値の検査）、`readXmlAttributes` / `writeXmlAttributes`（SKAM-ML の属性）、`hiddenParts` / `isHidden` / `assertOptions`（描画で隠す所）を持てる。定義が `@kanbun-skam/skam` の core から import してよいのは型だけで、個々の拡張を import してよいのは束（`extensions/index.ts`）だけ。`packages/skam/src/__tests__/extensions-import-direction.test.ts` が守る
- `ext` と `custom` は信頼しない入力。入れ子 32 段、キー 1,000 個、配列 10,000、文書全体の値 100,000 個の上限と、`__proto__` / `constructor` / `prototype` のキーの禁止を `extension-validation.ts` が反復で検査する（再帰しない）
- 学習・教育用拡張 `edu` は注記の `ext.edu.quiz`（問いの名前）だけを持つ。付けられる注記は 10 種で、`quiz` は 1〜64 字の制御文字を含まない文字列
- 出題の印を隠す判定は `edu` の定義の `hiddenParts` / `isHidden` に 1 か所だけある。`buildAnnotationIR` の第 3 引数（`extensions`、`extensionOptions`）で定義を受け取り、AIR に `hiddenSlots`（隠す slot の名前。slot の値は消さない）、`hidden`（竪点のグループ、範囲の読み、範囲の後ろの注記、ブロック先頭の句読点、ヲコト点のセル）、`kaeriHidden`（竪点の区切りの返り点）を付ける。置字と助字は `isOkimoji` / `isJoji` を立てない。印が無いとき、宣言の無い文書のとき、定義を渡さないときは、キーごと付かない
- html の直接の経路（`renderToken`）は、`createHiding`（`@kanbun-skam/skam/rendering`）から同じ判定を受け取る。canvas はレイアウトを変えず、`draw.ts` が隠す slot を描かない

## トークン順序

- `tokens[]` 配列の順序は**無意味**（マスター定義のみ）
- **原文順序は `blocks[].tokenIds` の連結順**で規定
- ユーティリティ: `buildTokenIndexMap(doc)` でグローバル位置マップを取得

## イミュータブル操作

全 CRUD 操作は新しいドキュメントオブジェクトを返す。元のドキュメントは変更しない。

## テストヘルパー (`packages/skam/src/__tests__/operations/helpers.ts`)

- `createTestDocument(marks)`: 3 token (子/曰/學, t1-t3) / 1 block (b1)
- `createMultiBlockDocument(marks)`: 6 token (t1-t6) / 2 block (b1, b2)
- `assertValidDocument(doc)`: バリデーター呼び出しラッパー

## XML stringify エッジケース

変更時は roundtrip テストで検証すること:

- saidoku + trailing marks: kaeri/kutoten/ref は `</skam:saidoku>` の外に配置
- multi-token range: 最終トークンの trailing marks は range 要素外に配置
- 複数の字の kaeri 値（`㆒㆑`、非推奨）: `ichi-re` に変換して書く（`kaeriValueToKind` 関数）。正の書き方は同じ位置の 1 字ずつの kaeri で、それぞれ `kind="ichi"`、`kind="re"` として書く。同じ位置の kaeri は `marks[]` の順に出力する
- linebreak: 直前の字の後ろの位置マークとして、kaeri、kutoten、ref の順の後に `<skam:br/>` を書く（`id` があれば `xml:id` も書く）。竪点のグループの最後の字の後ろの位置マークは、どれも `</skam:tateten>` の後ろに書く。`after` が無い linebreak は書けない（`BLOCK_START_LINEBREAK`）
- readings: `doc.readings` を `<skam:readings>` 要素に出力
- token の text: 平文で書くと parser の分け方（書記素クラスタ 1 つを 1 token、各書記素の先頭の ASCII 空白は捨てる。`tokenizePlainText`）で同じ字の並びに戻らない字（2 書記素以上、空白だけ、空白で始まる、前の字と 1 つのクラスタに結合する字）と、手書きの id・ext・custom を持つ字は `<skam:t>` で書く。損失にならない。IVS・SVS・結合文字を基底の字と同じ token に持つ字は平文で書く。本文の CR と属性値の U+0009・U+000A・U+000D は文字参照で書く
- ext・custom・placementHint: 持ち主の要素の属性（`skam:ext`、`skam:custom`、`placement-hint`）に JSON で書く。損失にならない
- 重なる範囲: 入れ子にできない範囲だけを `sID` / `eID` の空要素の対で書き、注記の属性は始まりの要素に書く。範囲を（始まりの昇順、終わりの降順、§7.0 の入れ子の順、注記の順）で並べ、開いている入れ子の範囲と比べて、包含か離れていれば入れ子、そうでなければ対にする。同じ anchor の同じ種類の注記は全部入れ子か全部対にする（混ぜると読み直したときに注記の順が入れ替わる）。範囲の要素の深さの上限は 56（`SKAM_ML_MAX_RANGE_DEPTH`）で、stringify は超える範囲を対にし、parser は超えたら誤りにする。字と字の間の出力の順は、閉じるタグ、終わりの空要素、位置の注記、始まりの空要素、開くタグ。`saidoku` は対にしない。再読文字を入れ子に書けない範囲は損失 `UNNESTABLE_OVERLAP` で、検証が `SAIDOKU_READING_OVERLAP` か `SAIDOKU_MULTI_TOKEN` の警告を返す文書だけに出る
- 拡張: 宣言のある文書は `skam:meta` に `skam:extension` を書き、ルートに拡張の名前空間を宣言する。拡張の値は定義の `writeXmlAttributes` が返す属性を、要素に拡張の名前（接頭辞）をつけて書く。登録簿にも定義にも無い拡張は `uri` を省いて宣言し、値は `skam:ext` に書く。`UNKNOWN_EXTENSION` の損失になるのは、拡張の名前の形でない名前と、知らない必須の拡張だけ。拡張を使わない文書の出力は変わらない。拡張の名前は SKAM-ML の接頭辞になるので、英字で始まり `xml` で始まらない

## AIR（描画の中間表現）

`buildAnnotationIR`（`@kanbun-skam/skam/rendering`）が作る、HTML と canvas の描画が共有する木。型の一覧は [API リファレンス](skam-api-reference.md) の「AIR の形」にある。不変条件:

- どの字もブロックの木に 1 回だけ現れる。字自身の注記（読み、送り仮名、返り点、句読点、傍点、再読文字、ref など）は字の `slots` に入る
- 範囲の注記は区間の入れ子で表す。2 字以上の yomigana は `AIRRubyGroupNode`。送り仮名と添え仮名の範囲は範囲の最後の字の slot に入る
- 竪点と傍線は、交差する範囲で断片に分かれる（`continuesBefore` / `continuesAfter`）。同じ字を共有する傍線は段（`lane`）が違い、段が大きいほど字から離して描く
- 同じ種類の読みが重なる文書（`READING_OVERLAP`）では、`marks[]` で先にある読みを描き、字を共有する後の読みは描かない。同じ字の 2 つ目以降の傍点は描かない
- 描画の上限は、1 ブロックの竪点と傍線の合計 1,024 個、1 つの注記の断片 8 個、範囲の要素の深さ 56（`packages/skam/src/rendering/build-annotation-ir.ts`）。validator を通らない文書でも描画の手間を抑えるためで、上限を超えた注記は描かず、字は必ず描く

## linebreak（改行）

- 置けない場所（ブロックの先頭、ブロックの最後の字の後ろ、不可分単位の中、同じ位置の 2 つ目）の判定は `packages/skam/src/line-units.ts` の `getLinebreakPlacementIssues` の 1 か所にある。validator（`INVALID_LINEBREAK`）と AIR の組み立てが同じ判定を使う
- 不可分単位は、竪点のグループと、yomigana / okurigana / soegana / saidoku / okimoji / joji の anchor の範囲。highlight / emphasis / okototen の範囲は単位を作らない
- 竪点のグループの範囲は、`rendering/mark-groups.ts` の `getTatetenGroups` と同じ規則を `line-units.ts` の中で別に求めている（`getTatetenGroups` は循環する依存を持つため使えない）。2 つの一致は `packages/skam/src/__tests__/linebreak.test.ts` が確かめる
- AIR は改行のためのノードを持たず、単位のノード（`AIRTokenNode` / `AIRRubyGroupNode` / `AIRTatetenGroupNode`）に `lineBreakAfter?: true` を付ける。その字で終わる ruby か竪点のグループがあれば、最も外側のグループに付く。置けない場所の linebreak は描画では無視する
- html は `<br class="{prefix}-linebreak">` を `<wbr>` の代わりに出す。canvas は AIR adapter が改行の後ろでブロックを区間に分け、1 区間を 1 列にする（区間の間の空きは列の間の空きと同じ）。canvas の `buildRenderTree`（AIR を通らない経路）は改行を扱わない
- 読み上げのテキストは、`lineBreakAfter` の単位の後ろにブロックの区切りと同じ半角空白を 1 つ入れる。注記の一覧には出さない

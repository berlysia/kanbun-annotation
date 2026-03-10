# SKAM Data Model Reference

## ドキュメント構造

```
SKAMDocument
├── tokens[]     本文 token のマスター定義
├── blocks[]     ブロック構造（原文順、tokenIds で token を参照）
├── marks[]      注記（返り点・送り仮名等）
├── derivations[]  導出情報（読み順等、計算結果キャッシュ）
└── readings[]   読み層（書き下し文・読み上げ文）
```

**Stand-off 方式**: 注記は本文テキストを直接分断しない。配置方式は 2 種:

- **anchor ベース** (10 種): `anchor: { from, to }` で token 範囲を参照
- **position ベース** (kaeri, kutoten, ref): `position: { blockId, after? }` で token 間位置を参照

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

`A = anchor: { from, to }、P = position: { blockId, after? }`

## Mark 配置方式の詳細

anchor ベースと position ベースは共通基底 `MarkBase` から対等に分岐。

- `MarkBase`: 共通フィールド（type, id?, placementHint?, ext?）
- anchor ベース (10 種): `AnchoredMark extends MarkBase`。`anchor: { from, to }` で token 範囲に付随
- position ベース (kaeri, kutoten, ref): `PositionedMark extends MarkBase`。`position: { blockId, after? }` で token 間に配置

型ガード: `isAnchorBasedMark(mark)` / `isPositionBasedMark(mark)` で判定可能

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
- 複合返り点: `一レ` → `ichi-re` 変換（`kaeriValueToKind` 関数）
- readings: `doc.readings` を `<skam:readings>` 要素に出力

---
status: Accepted
---

# ADR-010: 返り点 value の Unicode Kanbun ブロック正規化

実装計画: [Plan](../plans/plan-kaeri-value-unicode-normalization.md)

## コンテキスト

### 現状

SKAM JSON の `KaeriMark.value` フィールドには、返り点の表示文字として**日本語の慣用漢字/カタカナ**を格納している。

```json
{ "type": "kaeri", "value": "一", "position": { "blockId": "b1", "after": "t1" } }
```

ここで `"一"` は U+4E00 (CJK Unified Ideograph) であり、本文テキスト中に出現する漢字「一」と同一の符号点である。

### 問題

1. **意味的曖昧性**: 返り点の「一」と本文の漢字「一」が符号点レベルで区別できない
2. **Unicode 設計との不一致**: Unicode には返り点専用の Kanbun ブロック (U+3190〜U+319F, Ideographic Annotation) が存在するが、使用していない
3. **renderer での二重変換**: `value` の慣用漢字 → Kanbun ブロックへの変換マップ (`KAERI_UNICODE`) を renderer が独自に保持している。正規形が Kanbun ブロックであれば変換自体が不要になる

### 参考: Unicode Kanbun ブロック (U+3190〜U+319F)

| 符号点 | 文字 | 名称                                | 対応する慣用表記 |
| ------ | ---- | ----------------------------------- | ---------------- |
| U+3190 | ㆐   | IDEOGRAPHIC ANNOTATION LINKING MARK | （未使用）       |
| U+3191 | ㆑   | IDEOGRAPHIC ANNOTATION REVERSE MARK | レ               |
| U+3192 | ㆒   | IDEOGRAPHIC ANNOTATION ONE MARK     | 一               |
| U+3193 | ㆓   | IDEOGRAPHIC ANNOTATION TWO MARK     | 二               |
| U+3194 | ㆔   | IDEOGRAPHIC ANNOTATION THREE MARK   | 三               |
| U+3195 | ㆕   | IDEOGRAPHIC ANNOTATION FOUR MARK    | 四               |
| U+3196 | ㆖   | IDEOGRAPHIC ANNOTATION TOP MARK     | 上               |
| U+3197 | ㆗   | IDEOGRAPHIC ANNOTATION MIDDLE MARK  | 中               |
| U+3198 | ㆘   | IDEOGRAPHIC ANNOTATION BOTTOM MARK  | 下               |
| U+3199 | ㆙   | IDEOGRAPHIC ANNOTATION FIRST MARK   | 甲               |
| U+319A | ㆚   | IDEOGRAPHIC ANNOTATION SECOND MARK  | 乙               |
| U+319B | ㆛   | IDEOGRAPHIC ANNOTATION THIRD MARK   | 丙               |
| U+319C | ㆜   | IDEOGRAPHIC ANNOTATION FOURTH MARK  | 丁               |
| U+319D | ㆝   | IDEOGRAPHIC ANNOTATION HEAVEN MARK  | 天               |
| U+319E | ㆞   | IDEOGRAPHIC ANNOTATION EARTH MARK   | 地               |
| U+319F | ㆟   | IDEOGRAPHIC ANNOTATION MAN MARK     | 人               |

### 仕様書の不整合

SKAM-ML 仕様 (`SKAM-ML-draft.md`) に以下の問題がある:

- `ten` → `点` と記載されているが、実装は `ten` → `天`
- `chi` (地)、`jin` (人) が未記載
- 天地人グループが仕様上未定義

### 返り点のグループ体系（参考情報）

返り点には伝統的なグループ分類がある。本 ADR ではグループ定義のデータ構造化は行わないが、仕様書への記述の参考として記録する。

| グループ   | メンバー    | 用途                       |
| ---------- | ----------- | -------------------------- |
| レ点       | レ          | 直下1字を返す              |
| 一二三四点 | 一→二→三→四 | 番号順に読む（小スコープ） |
| 上中下点   | 上→中→下    | 一二点を跨ぐスコープ       |
| 甲乙丙丁点 | 甲→乙→丙→丁 | 上中下を跨ぐスコープ       |
| 天地人点   | 天→地→人    | 最大スコープ（極めてまれ） |

複合返り点（一レ、上レ等）は「レ + 他グループの一要素」の形をとる。

## 決定

### 1. SKAM JSON の `value` 正規形を Unicode Kanbun ブロックに変更する

```json
// before
{ "type": "kaeri", "value": "一" }

// after
{ "type": "kaeri", "value": "\u3192" }
```

複合返り点も同様:

```json
// before
{ "type": "kaeri", "value": "一レ" }

// after
{ "type": "kaeri", "value": "\u3192\u3191" }
```

### 2. core パッケージに `KAERI` 定数を追加する

TypeScript コード上での入力利便性のため、名前付き定数を提供する。

```typescript
export const KAERI = {
  RE: '\u3191', // ㆑
  ICHI: '\u3192', // ㆒
  NI: '\u3193', // ㆓
  SAN: '\u3194', // ㆔
  SHI: '\u3195', // ㆕
  JO: '\u3196', // ㆖
  CHU: '\u3197', // ㆗
  GE: '\u3198', // ㆘
  KO: '\u3199', // ㆙
  OTSU: '\u319A', // ㆚
  HEI: '\u319B', // ㆛
  TEI: '\u319C', // ㆜
  TEN: '\u319D', // ㆝
  CHI: '\u319E', // ㆞
  JIN: '\u319F', // ㆟
} as const;
```

### 3. 各パッケージのマッピングテーブルを更新する

- **parser**: `kind` → Kanbun ブロック文字に変換（`KAERI_VALUE_MAP` の値を更新）
- **stringify**: Kanbun ブロック文字 → `kind` に逆変換（`KAERI_KIND_MAP` のキーを更新）
- **renderer**: `KAERI_UNICODE` マップと `convertKaeriToUnicode()` を削除（value が既に Kanbun ブロックなので変換不要）。`splitKaeriForTateten()` はレ/非レ分離ロジックが引き続き必要なため、比較対象を `'\u3191'` に更新して維持する
- **playground**: 返り点の表示・選択 UI を更新。`parseKaeriValue()` 内の `value.includes('レ')` を `value.includes('\u3191')` に変更

### 4. 仕様書を修正する

- `SKAM-ML-draft.md`: `ten` → `天` に修正、`chi`/`jin` を追加、kind-value 対応表を Kanbun ブロック文字に更新
- `SKAM-draft.md`: kaeri の value 説明を Kanbun ブロック文字に更新、天地人を明記

### 5. SKAM-ML は変更しない

XML 上の表現 (`kind="ichi"`, `kind="ichi-re"` 等) は現行のまま維持する。変わるのは JSON 側の正規形のみ。

## 影響

### ポジティブ

- 返り点の value が符号点レベルで本文テキストと区別可能になる
- Unicode の設計意図（Kanbun ブロック）に沿った正規形になる
- renderer の変換マップが不要になりシンプル化する
- `KAERI` 定数により TypeScript コード上での入力が容易になる

### ネガティブ

- **破壊的変更**: 既存の SKAM JSON データの `value` フィールドが非互換になる
- JSON ファイルを生で読んだ際に Kanbun ブロック文字は見慣れない（ただし SKAM-ML が人間向けフォーマットであり、JSON を直接読む場面は少ない）
- テストコードの `value` リテラルをすべて `KAERI.*` 定数に置換する必要がある

## 追加考慮事項

### バリデータの強化

現在のバリデータは kaeri の `value` を「string であること」しか検証していない。正規化に合わせて、Kanbun ブロック文字 (U+3190〜U+319F) のみを受け入れるバリデーションを追加する。Plan 作成時に詳細を検討すること。

### 破壊的変更について

SKAM v0.1 はドラフト段階であり、後方互換性を保証しない。既存の SKAM JSON データに対するマイグレーションツールは提供せず、利用者が手動で更新する前提とする。

## 参考

- [Unicode Kanbun Block (U+3190〜U+319F)](https://www.unicode.org/charts/PDF/U3190.pdf)
- `SKAM-draft.md` — SKAM v0.1 仕様
- `SKAM-ML-draft.md` — SKAM-ML/XML 仕様
- [ADR-004](adr-004-kaeri-re-anchor-convention.md) — Kaeri mark を anchor-based から position-based に変更

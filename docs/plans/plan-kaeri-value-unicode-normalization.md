# 返り点 value の Unicode Kanbun ブロック正規化

## 概要

SKAM JSON の `KaeriMark.value` を慣用漢字/カタカナ（「一」「レ」等）から Unicode Kanbun ブロック文字（U+3191〜U+319F）に正規化する。破壊的変更。

関連 ADR: [ADR-010](../decisions/adr-010-kaeri-value-unicode-normalization.md)

## 前提知識

- Unicode Kanbun ブロック (U+3190〜U+319F) は返り点専用の符号点
- 現在の value は慣用漢字（`一` U+4E00 等）で、本文テキストの漢字と区別不可能
- SKAM-ML の XML 表現（`kind="ichi"` 等）は変更しない。JSON 側のみ

## 実装計画

### Step 1: KAERI 定数の追加（@kanbun/skam）

`packages/skam/src/index.ts` に `KAERI` 定数オブジェクトを追加・エクスポート。

```typescript
export const KAERI = {
  RE: '\u3191',
  ICHI: '\u3192',
  NI: '\u3193',
  SAN: '\u3194',
  SHI: '\u3195',
  JO: '\u3196',
  CHU: '\u3197',
  GE: '\u3198',
  KO: '\u3199',
  OTSU: '\u319A',
  HEI: '\u319B',
  TEI: '\u319C',
  TEN: '\u319D',
  CHI: '\u319E',
  JIN: '\u319F',
} as const;
```

### Step 2: バリデータの強化（@kanbun/skam）

`validator.ts` の kaeri 検証に Kanbun ブロック文字範囲チェックを追加。

```typescript
if (!/^[\u3191-\u319F]+$/.test(kaeriValue)) {
  /* error */
}
```

### Step 3: Parser のマッピング更新（@kanbun/skam-xml-parser）

`parser-core.ts` の `KAERI_VALUE_MAP` の値を Unicode Kanbun ブロック文字に変更。

### Step 4: Stringify のマッピング更新（@kanbun/skam-xml-stringify）

`stringify.ts` の `KAERI_KIND_MAP` のキーを Unicode Kanbun ブロック文字に変更。

### Step 5: rendering 共有ユーティリティの更新（@kanbun/skam/rendering）

- `KAERI_UNICODE` マップと `convertKaeriToUnicode()` を削除（変換不要に）
- `splitKaeriForTateten()` のレ判定を `'\u3191'` に更新
- `index.ts` のエクスポートから `KAERI_UNICODE`, `convertKaeriToUnicode` を削除

### Step 6: Canvas レンダラーの更新

- `render-tree.ts`: `convertKaeriToUnicode` のインポート・呼び出しを削除。`m.value` を直接使用
- `convertKaeriToUnicode` のテストを削除

### Step 7: HTML レンダラーの更新

- `convertKaeriToUnicode` のインポートを削除（使用箇所があれば直接値を使用）

### Step 8: Playground の更新

- `main.ts`: `KAERI_GROUPS` の `value` フィールドを Unicode 化
- `parseKaeriValue()`: `'レ'` → `'\u3191'` に更新

### Step 9: テストコード全体の更新

全テストファイルの返り点 value リテラルを Unicode Kanbun ブロック文字に置換。`KAERI` 定数が使えるテストでは定数を使用。

対象パッケージ: skam, skam-xml-parser, skam-xml-stringify, skam-canvas-renderer, skam-html-renderer, integration-tests, playground

### Step 10: 仕様書の更新

- `SKAM-draft.md`: kaeri value の説明を Kanbun ブロック文字に更新
- `SKAM-ML-draft.md`: `ten` → `天` に修正、`chi`/`jin` を追加、kind-value 対応表を更新

## リスクと軽減策

| リスク                              | 影響度 | 軽減策                                                     |
| ----------------------------------- | ------ | ---------------------------------------------------------- |
| 破壊的変更による既存データ非互換    | 低     | v0.1 ドラフト段階。マイグレーション不要                    |
| テスト更新漏れ                      | 中     | roundtrip テストが包括的に検証。grep で残存リテラルを確認  |
| Kanbun ブロック文字のフォント非対応 | 低     | レンダラーは表示用グリフを独自描画。JSON の value は内部値 |

## 検証方法

- `pnpm test` — 全テスト通過
- `pnpm typecheck` — 型チェック通過
- roundtrip テスト（parse → stringify → parse）が SKAM-ML ↔ JSON 間で一致
- grep で旧 value リテラル（`'レ'`, `'一'`, `'二'` 等の kaeri 文脈）が残存しないことを確認

<!-- validated -->

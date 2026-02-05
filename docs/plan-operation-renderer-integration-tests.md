# オペレーション→レンダラー統合テスト計画

## 概要

`@kanbun/skam` のオペレーション（CRUD）適用後のドキュメントを `@kanbun/skam-html-renderer` の `render()` に通した結果が、操作内容を正しく反映しているかを検証する統合テストを追加する。

関連 ADR: [ADR-001](decisions/adr-001-operation-renderer-integration-tests.md)

## ファイル構成

```
packages/skam-html-renderer/src/__tests__/
├── renderer.test.ts          # 既存（静的ドキュメントのレンダリング検証）
├── interactive.test.ts       # 既存（インタラクティブ機能の検証）
└── operation-rendering.test.ts  # 新規（オペレーション→レンダリング統合テスト）
```

## テストヘルパー

既存のテストヘルパー（`@kanbun/skam` の `createTestDocument` 等）は **直接使用しない**。理由:

- `createTestDocument` は `@kanbun/skam` の公開APIに含まれない内部テストヘルパー（`__tests__/operations/helpers.ts`）であり、パッケージ外からの利用は想定されていない
- 統合テストではオペレーション関数を import して使用するが、テストデータは自前で構築する
- 既存 `renderer.test.ts` と同様に、各テスト内で `SKAMDocument` リテラルを定義する

### 共通ドキュメントファクトリ

テストファイル内にローカルヘルパーを定義:

```typescript
function createBaseDocument(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks,
    readings: [],
  };
}
```

## テスト設計

### 基本パターン

各テストは以下の3ステップで構成:

1. **初期ドキュメント作成** → `render()` で操作前HTMLを取得
2. **オペレーション適用**（addMark, removeMark, updateMark, replaceMark）
3. **操作後ドキュメント** → `render()` で操作後HTMLを取得 → before/after を比較

### テストケース一覧

#### 1. addMark → レンダリング反映

各Markタイプの追加がHTML出力に反映されることを検証。

| #    | Mark タイプ | 検証内容     | アサーション                                                          |
| ---- | ----------- | ------------ | --------------------------------------------------------------------- |
| 1.1  | kaeri       | 返り点追加   | 操作前: `skam-kaeriten` 無し → 操作後: `skam-kaeriten` + Unicode文字  |
| 1.2  | okurigana   | 送り仮名追加 | 操作前: `skam-okuri` 無し → 操作後: `skam-okuri` + 仮名テキスト       |
| 1.3  | yomigana    | 読み仮名追加 | 操作前: `<ruby>` 無し → 操作後: `<ruby>` + `<rt>` + 仮名テキスト      |
| 1.4  | soegana     | 添え仮名追加 | 操作前: `skam-soegana` 無し → 操作後: `skam-soegana` + テキスト       |
| 1.5  | okimoji     | 置字追加     | 操作前: `skam-okimoji` 無し → 操作後: `skam-okimoji` クラス付与       |
| 1.6  | joji        | 助字追加     | 操作前: `skam-joji` 無し → 操作後: `skam-joji` クラス付与             |
| 1.7  | kutoten     | 句読点追加   | 操作前: `skam-kutoten` 無し → 操作後: `skam-kutoten` + 「。」等       |
| 1.8  | saidoku     | 再読文字追加 | 操作前: `skam-saidoku` 無し → 操作後: nested ruby 構造                |
| 1.9  | okototen    | ヲコト点追加 | 操作前: `skam-okototen` 無し → 操作後: `skam-okototen` + data属性     |
| 1.10 | tateten     | たて点追加   | 操作前: `skam-tateten` 無し → 操作後: `skam-tateten-group`            |
| 1.11 | emphasis    | 傍点追加     | 操作前: `skam-emphasis` 無し → 操作後: `skam-emphasis` クラス         |
| 1.12 | highlight   | 傍線追加     | 操作前: `skam-highlight` 無し → 操作後: `skam-highlight` + data-style |
| 1.13 | ref         | 参照追加     | 操作前: `skam-ref` 無し → 操作後: `<sup class="skam-ref">`            |

#### 2. removeMark → レンダリング反映

マーク削除がHTML出力から要素を除去することを検証。ADR方針に従い全13種をカバーする。

| #    | Mark タイプ | 検証内容     | アサーション                                                          |
| ---- | ----------- | ------------ | --------------------------------------------------------------------- |
| 2.1  | kaeri       | 返り点削除   | 操作前: `skam-kaeriten` 有り → 操作後: `skam-kaeriten` 無し           |
| 2.2  | okurigana   | 送り仮名削除 | 操作前: `skam-okuri` 有り → 操作後: 仮名テキスト無し                  |
| 2.3  | yomigana    | 読み仮名削除 | 操作前: `<rt>` 有り → 操作後: `<rt>` 無し                             |
| 2.4  | soegana     | 添え仮名削除 | 操作前: `skam-soegana` 有り → 操作後: `skam-soegana` 無し             |
| 2.5  | okimoji     | 置字削除     | 操作前: `skam-okimoji` 有り → 操作後: `skam-okimoji` 無し             |
| 2.6  | joji        | 助字削除     | 操作前: `skam-joji` 有り → 操作後: `skam-joji` 無し                   |
| 2.7  | kutoten     | 句読点削除   | 操作前: `skam-kutoten` 有り → 操作後: `skam-kutoten` 無し             |
| 2.8  | saidoku     | 再読文字削除 | 操作前: `skam-saidoku` 有り → 操作後: nested ruby 消滅                |
| 2.9  | okototen    | ヲコト点削除 | 操作前: `skam-okototen` 有り → 操作後: `skam-okototen` 無し           |
| 2.10 | tateten     | たて点削除   | 操作前: `skam-tateten-group` 有り → 操作後: `skam-tateten-group` 無し |
| 2.11 | emphasis    | 傍点削除     | 操作前: `skam-emphasis` 有り → 操作後: `skam-emphasis` 無し           |
| 2.12 | highlight   | 傍線削除     | 操作前: `skam-highlight` 有り → 操作後: `skam-highlight` 無し         |
| 2.13 | ref         | 参照削除     | 操作前: `skam-ref` 有り → 操作後: `skam-ref` 無し                     |

#### 3. updateMark → レンダリング反映

マーク更新が出力に反映されることを検証。

| #   | 操作                | 検証内容         | アサーション                     |
| --- | ------------------- | ---------------- | -------------------------------- |
| 3.1 | okurigana value変更 | 仮名テキスト更新 | 操作前: 「ブ」 → 操作後: 「ビ」  |
| 3.2 | kaeri value変更     | 返り点種類変更   | 操作前: レ点 → 操作後: 一二点    |
| 3.3 | emphasis style変更  | 傍点スタイル変更 | data属性またはクラスの変更を検証 |
| 3.4 | highlight style変更 | 傍線スタイル変更 | `data-style` 値の変更            |

#### 4. replaceMark → レンダリング反映

マーク型変更がHTML構造の変化に反映されることを検証。

| #   | 操作                 | 検証内容                   | アサーション                           |
| --- | -------------------- | -------------------------- | -------------------------------------- |
| 4.1 | okurigana → yomigana | 送り仮名→読み仮名に変更    | `skam-okuri` 消滅 + `<ruby>/<rt>` 出現 |
| 4.2 | emphasis style変更   | replaceMark でスタイル変更 | 旧スタイルの消滅 + 新スタイルの出現    |

#### 5. 複合オペレーション → レンダリング反映

複数操作の連鎖がHTML出力に正しく反映されることを検証。

| #   | シナリオ                   | 検証内容                                |
| --- | -------------------------- | --------------------------------------- |
| 5.1 | removeHighlightWithRef     | highlight + ref 両方がHTMLから消滅      |
| 5.2 | 返り点追加 → 送り仮名追加  | 両方の要素がHTMLに出現                  |
| 5.3 | yomigana追加 → ref残存確認 | yomigana追加後もref要素が保持されている |
| 5.4 | 複数mark追加 → 1つ削除     | 残りのmark要素は保持されている          |
| 5.5 | kaeri値変更（remove+add）  | 返り点Unicode文字の変化を検証           |

#### 6. プロファイル×オペレーション

プロファイル設定により、操作で追加したマークが表示/非表示になることを検証。

| #   | シナリオ                                    | 検証内容                                  |
| --- | ------------------------------------------- | ----------------------------------------- |
| 6.1 | addMark(yomigana) + profile.yomigana=false  | 追加しても `<rt>` は出力されない          |
| 6.2 | addMark(kaeri) + profile.kaeriten=false     | 追加しても `skam-kaeriten` は出力されない |
| 6.3 | addMark(kaeri) + learningBasic プロファイル | kaeri は表示、yomigana/okurigana は非表示 |

## 検証ポイント（チェックリスト）

各テストで以下を確認:

- [ ] 操作前の `render()` 結果が期待通り（ベースライン確認）
- [ ] 操作後の `render()` 結果に操作が反映されている
- [ ] 操作に関係のない既存要素は影響を受けていない（副作用なし）

## 実装上の注意

### import 構成

```typescript
import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '@kanbun/skam';
import { addMark, removeMark, updateMark, replaceMark, removeHighlightWithRef } from '@kanbun/skam';
import { render, PROFILES } from '../index.js';
```

`@kanbun/skam` のオペレーション関数は `devDependencies` に `@kanbun/skam-xml-parser` が既にある前例に倣い、テストコードからのみ使用する。ただし `@kanbun/skam` は `dependencies` に含まれているため追加設定は不要。

### 既存テストとの棲み分け

| テストファイル                       | 責務                                     |
| ------------------------------------ | ---------------------------------------- |
| `renderer.test.ts`                   | 静的ドキュメントの個別マークレンダリング |
| `interactive.test.ts`                | DOM操作・イベントハンドリング            |
| `operation-rendering.test.ts` (新規) | オペレーション適用後のレンダリング正しさ |

### CSS出力のテスト

CSS は全テストで共通のため、統合テストでは検証対象外。HTML部分のみ検証する。

## 優先度

1. **P0**: add/remove の全Markタイプカバレッジ（セクション1, 2）
2. **P1**: updateMark, replaceMark の値/型変更（セクション3, 4）
3. **P1**: 複合オペレーションシナリオ（セクション5）
4. **P2**: プロファイル×オペレーション（セクション6）

## 見積テスト数

| セクション                     | テスト数 |
| ------------------------------ | -------- |
| 1. addMark                     | 13       |
| 2. removeMark                  | 13       |
| 3. updateMark                  | 4        |
| 4. replaceMark                 | 2        |
| 5. 複合オペレーション          | 5        |
| 6. プロファイル×オペレーション | 3        |
| **合計**                       | **40**   |

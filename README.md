# kanbun-annotation

漢文アノテーションのための意味モデル **SKAM (Stand-off Kanbun Annotation Model)** の仕様定義と参考実装。

## SKAM とは

SKAM は、漢文本文と訓点・注記・読みを**分離して保持**し、表示（HTML/CSS/SVG等）や読み上げ（a11y）を**後工程で生成**するための意味モデル。

### 特徴

- **Stand-off 方式**: 本文テキストを直接分断せず、アノテーションを外付けで管理
- **Token ベース**: 本文を token 列として表現し、全ての参照の基準単位とする
- **読み層の分離**: 表示用と読み上げ用を独立した層として保持
- **拡張性**: `ext` コンテナ方式による安全な拡張と round-trip 保持

## パッケージ構成

| パッケージ         | 説明                      | 状態   |
| ------------------ | ------------------------- | ------ |
| `@kanbun/skam`     | SKAM 型定義（TypeScript） | v0.1.0 |
| `@kanbun/skam-xml` | SKAM-ML/XML パーサー      | 開発中 |

## インストール

```bash
pnpm add @kanbun/skam
```

## 使い方

```typescript
import type { SKAMDocument } from '@kanbun/skam';

const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '学' },
    { id: 't2', text: '而' },
    { id: 't3', text: '時' },
    { id: 't4', text: '習' },
    { id: 't5', text: '之' },
  ],
  marks: [
    { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'びて' },
    { type: 'okurigana', id: 'm2', anchor: { from: 't3', to: 't3' }, value: 'に' },
    { type: 'soegana', id: 'm3', anchor: { from: 't5', to: 't5' }, value: 'を' },
    { type: 'okurigana', id: 'm4', anchor: { from: 't4', to: 't4' }, value: 'ふ' },
    { type: 'kaeri', id: 'm5', anchor: { from: 't5', to: 't5' }, value: 'レ' },
  ],
  readings: [
    { kind: 'kakikudashi', text: '学びて時に之を習ふ' },
    { kind: 'yomiage', text: 'まなびてときにこれをならう' },
  ],
};
```

## 仕様書

| ドキュメント                           | 説明                                            |
| -------------------------------------- | ----------------------------------------------- |
| [SKAM-draft.md](./SKAM-draft.md)       | SKAM v0.1 仕様（JSON 形式）                     |
| [SKAM-ML-draft.md](./SKAM-ML-draft.md) | SKAM-ML/XML v0.1 仕様（人間編集用マークアップ） |

## SKAM v0.1 概要

### データ構造

```
SKAMDocument
├── format: "skam@0.1"
├── tokens: Token[]          # 本文 token 列
├── marks: Mark[]            # 注記（返り点・送り仮名等）
├── derivations?: Derivation[] # 導出情報（読み順等）
├── readings: Reading[]      # 読み層（書き下し文・読み上げ文）
└── ext?: object             # 拡張フィールド
```

### Mark Types (v0.1)

| type        | 意味                               | value                                 |
| ----------- | ---------------------------------- | ------------------------------------- |
| `kaeri`     | 返り点                             | 必須（レ、一、二、上、下、甲、乙 等） |
| `okurigana` | 送り仮名                           | 必須（送り仮名テキスト）              |
| `yomigana`  | 読み仮名（ルビ）                   | 必須（読み仮名テキスト）              |
| `soegana`   | 添え仮名（訓読時に補う助詞）       | 必須（助詞テキスト）                  |
| `okimoji`   | 置字（訓読時に読まない漢字）       | なし                                  |
| `joji`      | 助字（文法的機能を持つ漢字ラベル） | なし                                  |
| `kutoten`   | 句読点                             | 必須（句点・読点等）                  |
| `emphasis`  | 傍点・圏点                         | 任意（傍点の種類）                    |
| `note`      | 注釈（割注・欄外注含む）           | 必須（注釈テキスト）                  |
| `saidoku`   | 再読文字                           | forms 配列必須                        |
| `okototen`  | ヲコト点                           | position・shape 必須                  |
| `tateten`   | たて点（熟語境界）                 | なし                                  |

### Reading Kinds

| kind          | 意味              |
| ------------- | ----------------- |
| `kundoku`     | 訓読文            |
| `kakikudashi` | 書き下し文        |
| `yomiage`     | a11y 用読み上げ文 |

## 開発

```bash
# ビルド
pnpm build

# 型チェック
pnpm typecheck

# テスト
pnpm test

# リント
pnpm lint

# フォーマット
pnpm format
```

## ライセンス

MIT

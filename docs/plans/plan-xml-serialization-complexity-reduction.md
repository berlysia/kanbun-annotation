# XML Serialization 複雑度削減

## 概要

`contentNodeToXml()` 関数（CC 42・103 行）を trailing marks 処理・型別 XML 生成・trailing marks XML 化の 3 層に分解し、CC ~15 に削減する。

関連 ADR: [ADR-025](../decisions/adr-025-xml-serialization-complexity-reduction.md)

## 前提知識

- `contentNodeToXml()` は ContentNode を XML 文字列に変換する再帰関数
- trailing marks（kaeri/kutoten/ref）は range 要素の外側に配置する必要がある
- 現在は annotation オブジェクトの `delete` + 復元という副作用パターンを使用
- roundtrip テスト（parse → stringify → parse）が回帰防止の最重要テスト

## 実装計画

### Step 1: trailing marks XML 化の分離

kaeri/kutoten/ref の XML 生成を `renderTrailingMarks()` 関数に抽出。

### Step 2: 型別 XML 生成の分離

`__kun_range`, `emphasis`, `tateten`, `highlight`, `ref` の各型を `renderRangeElement()` 等に分離。

### Step 3: element ノード処理の再構成

trailing marks の save/suppress/restore を `renderElementWithTrailing()` に閉じ込め。

```
contentNodeToXml(node)
  ├─ text ノード: renderTextNode(node)
  └─ element ノード: renderElementNode(node)
      ├─ renderElementWithTrailing()
      ├─ renderRangeElement()
      └─ renderTrailingMarks()
```

### Step 4: テスト追加

- 既存 roundtrip テストをリグレッションゲートとして維持
- 必須回帰ケース: saidoku + trailing marks、multi-token range、複合返り点、wrapper ネスティング

## リスクと軽減策

| リスク                    | 影響度 | 軽減策                                           |
| ------------------------- | ------ | ------------------------------------------------ |
| trailing marks の位置ずれ | 高     | roundtrip テストで包括的に検証                   |
| 副作用パターンの除去漏れ  | 中     | renderElementWithTrailing に限定して副作用を隔離 |

## 検証方法

- `pnpm --filter @kanbun/skam-xml-stringify test` 成功
- `pnpm --filter @kanbun/integration-tests test` 成功（roundtrip テスト）
- `pnpm typecheck` 成功
- `pnpm lint` で `contentNodeToXml` の complexity warning が消えることを確認

<!-- validated -->

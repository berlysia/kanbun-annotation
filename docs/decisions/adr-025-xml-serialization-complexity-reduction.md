---
status: Complete
plan: plan-xml-serialization-complexity-reduction.md
---

# ADR-025: XML Serialization 複雑度削減

実装計画: [Plan](../plans/plan-xml-serialization-complexity-reduction.md)

## コンテキスト

### contentNodeToXml() (CC 42, 103 行)

`packages/skam-xml-stringify/src/stringify.ts` の `contentNodeToXml()` は、ContentNode を XML 文字列に変換する再帰関数。trailing marks（kaeri/kutoten/ref）を range 要素の外側に配置するために、annotation オブジェクトの `delete` + 復元という副作用パターンを使用している。

**現状の処理フロー**:

```
contentNodeToXml(node)
  ├─ text ノード:
  │   ├─ wrappers あり: tokenBaseToXml + tokenTrailingToXml + applyWrappers
  │   └─ wrappers なし: tokenContentToXml
  └─ element ノード:
      ├─ Step 1. 最後の子の trailing marks を保存
      ├─ Step 2. annotation から delete（副作用）
      ├─ Step 3. 子を再帰処理
      ├─ Step 4. annotation を復元
      ├─ Step 5. 型別 XML 生成（__kun_range, emphasis, tateten, highlight, ref）
      └─ Step 6. 保存した trailing marks を外側に配置
```

**複雑度の原因**:

1. trailing marks の save/suppress/restore パターン（副作用ベース）
2. element 型別の XML 生成（5 種の分岐 + 属性組み立て）
3. trailing marks の XML 化（kaeri/kutoten/ref の 3 種）

### processBlockChildren() (CC 35, 115 行)

`packages/skam-xml-parser/src/parser-core.ts` の `processBlockChildren()` は、block 内の子ノードを処理し、トークンと mark を生成する。要素種別ごとの switch-case で 10+ のハンドラーにディスパッチ。

**特記**: kutoten/ref は「遅延処理」パターン（block 内の全トークン確定後に precedingTokenId を解決）。

### buildContentTree() (CC 28, 200+ 行)

contentNodeToXml() の入力となる木構造を組み立てる関数。activeRanges スタックで範囲マークのネスティングを管理。

## 検討した選択肢

### contentNodeToXml() の分解

#### Option A: 明示的なコンテキスト渡し

- trailing marks を抑制すべきかどうかを引数（`suppressTrailing: boolean`）で渡す
- annotation オブジェクトの mutate を排除し、再帰関数が副作用フリーになる
- 利点: テスタビリティ向上、annotation 破壊のリスク排除
- 欠点: 引数が増える

#### Option B: 2-pass 方式

- 全ノードの XML を trailing marks なしで生成 → 後処理で挿入
- 利点: ロジックが明確
- 欠点: XML 文字列操作が増え、パフォーマンスと複雑さが増す

#### Option C: delete/restore を関数抽出のみ

- `withSuppressedTrailing()` ユーティリティに抽出
- 利点: 最小変更
- 欠点: 副作用が残る

### Parser の分解（P1 方向性）

#### Option D: 型別ハンドラーをモジュール関数に分離

- processKaeri, processKun, processKutoten 等は既に関数分離済み
- processBlockChildren 自体のディスパッチを軽量化

## 決定

### P0: contentNodeToXml() の分解

**Option A と C のハイブリッド** を採用する。

1. **trailing marks 処理の関数分割**: element ノードの trailing marks 処理を専用関数に抽出

```typescript
// trailing marks の保存・抑制・復元・XML化を1つの関数に閉じ込める
function renderElementWithTrailing(
  node: ElementNode,
  renderChildren: () => string,
  renderElement: (childrenXml: string) => string
): string;

// element 型別の XML 生成を分離
function renderRangeElement(node: ElementNode, childrenXml: string): string;
```

2. **型別 XML 生成の分離**: `__kun_range`, `emphasis`, `tateten`, `highlight` の各型を個別関数に

3. **trailing marks XML 化の分離**: kaeri/kutoten/ref の XML 生成を共通関数に

**目標構造**:

```
contentNodeToXml(node)
  ├─ text ノード: renderTextNode(node)
  └─ element ノード: renderElementNode(node)
      ├─ renderElementWithTrailing() — save/suppress/restore を閉じ込め
      ├─ renderRangeElement() — 型別 XML 生成
      └─ renderTrailingMarks() — trailing marks XML 化
```

### P1 方向性: Parser/Serializer 型別ハンドラー分離（未確定）

Parser (`parser-core.ts`) と Serializer (`stringify.ts`) の両方で、マーク型ごとの処理が switch-case に集約されている。P0 完了後の知見を元に以下を検討:

- **Parser**: `processBlockChildren()` のディスパッチ部分を軽量化。既存の型別関数（processKaeri, processKun 等）は分離済みのため、改善余地は限定的。遅延処理パターン（kutoten/ref）の明確化が主な改善対象
- **Serializer**: `buildContentTree()` の activeRanges スタック管理と `contentNodeToXml()` の型別分岐を整理。P0 の分解で基盤が整う

## 予想される効果

| メトリクス                  | 現状     | P0 後                                   |
| --------------------------- | -------- | --------------------------------------- |
| `contentNodeToXml()` CC     | 42       | ~15                                     |
| 副作用（annotation mutate） | あり     | renderElementWithTrailing に限定        |
| テスト粒度                  | 関数単位 | trailing 処理・型別生成を個別テスト可能 |

## テスト戦略

- `integration-tests/roundtrip.test.ts` をリグレッションゲートとして最重要視
- 抽出した関数にユニットテスト追加
- **必須回帰ケース**:
  - saidoku + trailing marks（kaeri/kutoten/ref が `</skam:saidoku>` の外）
  - multi-token range の最終トークン trailing marks
  - 複合返り点（`一レ` → `ichi-re`）
  - wrapper ネスティング（okimoji 内の kun 等）

## 受け入れ条件

- `contentNodeToXml()` の CC が 15 以下に削減されている
- trailing marks の save/suppress/restore が専用関数に閉じ込められている
- 既存の roundtrip テストが全件パスする
- `pnpm --filter @kanbun/skam-xml-stringify test` 成功
- `pnpm --filter @kanbun/integration-tests test` 成功
- `pnpm typecheck` 成功

## 影響

### ポジティブ

- trailing marks 処理の副作用が局所化される
- 型別 XML 生成の修正が他の型に影響しない
- roundtrip テストとの組み合わせでリグレッション検出力が向上

### ネガティブ

- 関数数が増え、呼び出し階層が深くなる
- 小さな関数に分割しすぎると、全体の流れが追いにくくなるリスク

## 参考

- `packages/skam-xml-stringify/src/stringify.ts`
- `packages/skam-xml-parser/src/parser-core.ts`
- `packages/integration-tests/src/roundtrip.test.ts`
- [構造解析レポート 2026-02-16](../structure-analysis-2026-02-16.md)

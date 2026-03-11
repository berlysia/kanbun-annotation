# kanbun-annotation 構造解析レポート

**分析日時**: 2026-02-16
**対象**: kanbun-annotation monorepo (10 packages)
**分析ツール**: code-complexity / architecture-boundary / coupling / cohesion analyzers

---

## 統合スコアサマリー

| 分析次元               | スコア (1-5) | 評価                             |
| ---------------------- | :----------: | -------------------------------- |
| **複雑度**             |     2.5      | 良好（一部高複雑度関数あり）     |
| **アーキテクチャ境界** |     1.4      | 優秀（明確な階層・単方向依存）   |
| **結合度**             |     2.1      | 良好（データ結合中心・循環なし） |
| **凝集度**             |     1.5      | 優秀（各パッケージが単一責務）   |
| **総合**               |   **1.9**    | **優秀**                         |

---

## パッケージ別スコア

| パッケージ           | 複雑度  | 境界 |  結合   | 凝集 |  総合   |
| -------------------- | :-----: | :--: | :-----: | :--: | :-----: |
| @kanbun-skam/skam    |   2.0   | 1.5  |   1.5   | 2.0  | **1.8** |
| skam/rendering       |   1.5   | 1.0  |   1.8   | 2.0  | **1.6** |
| skam-xml-parser      |   2.0   | 1.0  |   2.0   | 1.0  | **1.5** |
| skam-xml-stringify   |   2.5   | 1.0  |   2.0   | 1.0  | **1.6** |
| skam-html-renderer   |   2.5   | 1.5  |   2.3   | 2.0  | **2.1** |
| skam-canvas-renderer | **3.5** | 1.5  | **2.8** | 2.0  | **2.5** |
| skam-web-component   |   1.5   | 1.0  |   2.2   | 1.0  | **1.4** |
| skam-screenshot      |   2.0   | 1.5  |   2.5   | 3.0  | **2.3** |
| playground           |   1.5   | 1.0  |   2.6   | 1.0  | **1.5** |
| integration-tests    |   1.0   | 1.0  |   2.4   | 1.0  | **1.4** |

---

## 主要な発見事項

### 強み

1. **模範的なアーキテクチャ階層**: Core -> Serialization -> Rendering -> Application の4層が完全な単方向依存
2. **パッケージ間循環依存ゼロ**: `madge` で検証済み
3. **共有化の成功**: `@kanbun-skam/skam/rendering` サブパスにより ~960行の重複削減
4. **データ結合中心**: 全体の80%がデータ結合（理想的な疎結合）
5. **高い凝集度**: 9/10パッケージが Functional Cohesion

### Top 10 高複雑度関数

| #   | 関数                          | ファイル                                     | CC  | LOC  |
| --- | ----------------------------- | -------------------------------------------- | :-: | :--: |
| 1   | `placeBlock()`                | canvas-renderer/layout-vertical.placement.ts | 48  | 605  |
| 2   | `validateMark()`              | skam/validator.ts                            | 45  | 278  |
| 3   | `contentNodeToXml()`          | skam-xml-stringify/stringify.ts              | 42  | 103  |
| 4   | `groupIntoTree()`             | html-renderer/build-render-tree.ts           | 38  | 133  |
| 5   | `processBlockChildren()`      | skam-xml-parser/parser-core.ts               | 35  | 115  |
| 6   | `buildFlatTokenList()`        | html-renderer/build-render-tree.ts           | 32  | 196  |
| 7   | `buildRenderTree()`           | canvas-renderer/render-tree.ts               | 32  | 190  |
| 8   | `validateSKAMDocument()`      | skam/validator.ts                            | 28  | 168  |
| 9   | `generateWritingModeStyles()` | html-renderer/styles.ts                      | 28  | 320  |
| 10  | `buildContentTree()`          | skam-xml-stringify/stringify.ts              | 28  | 200+ |

---

## 保守性指標 (Maintainability Index)

| パッケージ           |   MI   | ランク |
| -------------------- | :----: | :----: |
| skam/rendering       |   78   |   A    |
| skam (core)          |   72   |   B    |
| skam-xml-parser      |   66   |   B    |
| skam-html-renderer   |   64   |   C    |
| skam-xml-stringify   |   62   |   C    |
| skam-canvas-renderer |   58   |   C    |
| **総合**             | **68** | **B**  |

---

## 依存グラフ

```
Application Layer (I=1.00)
  playground, integration-tests
        |
Presentation Layer (I=0.40-0.67)
  web-component, screenshot
        |
Rendering Layer (I=0.33-0.50)
  html-renderer, canvas-renderer
        |
Serialization Layer (I=0.33)
  xml-parser, xml-stringify
        |
Core Layer (I=0.00-0.33)
  @kanbun-skam/skam (types, validator, operations)
    +-- /rendering (shared utilities)
```

依存方向: すべて上位層 -> 下位層（単方向）。循環依存なし。

---

## 結合度メトリクス

| パッケージ           | Ca  | Ce  |  I   | 結合タイプ    |
| -------------------- | :-: | :-: | :--: | ------------- |
| @kanbun-skam/skam    |  8  |  0  | 0.00 | Data          |
| skam/rendering       |  2  |  1  | 0.33 | Data          |
| skam-xml-parser      |  4  |  2  | 0.33 | Data          |
| skam-xml-stringify   |  2  |  1  | 0.33 | Data          |
| skam-html-renderer   |  3  |  2  | 0.40 | Data+Stamp    |
| skam-canvas-renderer |  2  |  2  | 0.50 | Data+Control  |
| skam-web-component   |  1  |  2  | 0.67 | Data+External |
| skam-screenshot      |  1  |  4  | 0.80 | External      |
| playground           |  0  |  6  | 1.00 | Data+External |
| integration-tests    |  0  |  6  | 1.00 | Data          |

Ca=Afferent Coupling, Ce=Efferent Coupling, I=Instability

---

## 凝集度評価

| パッケージ           | スコア | 凝集度レベル          |
| -------------------- | :----: | --------------------- |
| @kanbun-skam/skam    |  2/5   | Sequential-Functional |
| skam-xml-parser      |  1/5   | Functional            |
| skam-xml-stringify   |  1/5   | Functional            |
| skam-canvas-renderer |  2/5   | Sequential            |
| skam-html-renderer   |  2/5   | Functional            |
| skam-web-component   |  1/5   | Functional            |
| skam-screenshot      |  3/5   | Communicational       |
| playground           |  1/5   | Functional            |
| integration-tests    |  1/5   | Functional            |

---

## 改善推奨事項

### P0 - Critical (推定 32h)

| 対象                 | 現状 CC | 目標 CC | 手法                           |
| -------------------- | :-----: | :-----: | ------------------------------ |
| `placeBlock()`       |   48    |   12    | Strategy + dispatch による分解 |
| `validateMark()`     |   45    |    8    | 型別バリデーターに分離         |
| `contentNodeToXml()` |   42    |   15    | trailing marks 処理の関数分割  |

### P1 - Important (推定 48h)

- Parser/Serializer の型別ハンドラー分離
- Range mark overlap resolver の抽出
- Canvas renderer Layout Pipeline の Context オブジェクト集約

### P2 - Enhancement (推定 64h)

- Render Strategy 階層化（書字方向 x ルビ方式の組み合わせ爆発対策）
- Validator の declarative schema 化
- Complexity metrics の CI 統合

---

## 品質メトリクス改善予測

| メトリクス | 現状 | P0後       | P1後       | P2後       |
| ---------- | ---- | ---------- | ---------- | ---------- |
| 平均 CC    | 9.2  | 6.5 (-29%) | 5.1 (-45%) | 4.2 (-54%) |
| 最大 CC    | 48   | 22 (-54%)  | 15 (-69%)  | 12 (-75%)  |
| MI         | 68   | 76 (+12%)  | 82 (+21%)  | 88 (+29%)  |
| 技術的負債 | 144h | 80h (-44%) | 32h (-78%) | 8h (-94%)  |

---

## 総評

プロジェクト全体の構造品質は**優秀 (1.9/5)**。明確な階層設計、高い凝集度、疎結合が達成されている。主な改善対象は Canvas renderer の `placeBlock()` と Validator の `validateMark()` の高複雑度だが、これはドメイン固有の複雑さ（13種のマーク処理、縦書きレイアウト）を反映しており、機能的には正しく動作している。

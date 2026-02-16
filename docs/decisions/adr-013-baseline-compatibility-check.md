---
status: Complete
plan: plan-baseline-compatibility-check.md
---

# ADR-013: Web Platform Baseline 互換性チェックの導入

実装計画: [Plan](../plans/plan-baseline-compatibility-check.md)

## コンテキスト

SKAM の HTML レンダラー (`@kanbun/skam-html-renderer`) と Playground は、モダンブラウザ向けの CSS・JS を出力する。現在、ブラウザ互換性の体系的なチェック手段がなく、どの CSS/JS 機能がどのブラウザで利用可能かを把握していない。

[Web Platform Baseline](https://web-platform-dx.github.io/web-features/) は W3C WebDX Community Group が策定した、ブラウザ間の機能サポート状況を分類する枠組みである:

- **Widely available**: 全コアブラウザで 30 ヶ月以上サポート
- **Newly available**: 全コアブラウザでサポートされているが 30 ヶ月未満
- **Limited availability**: 一部のコアブラウザで未サポート

### 現状の CSS 使用状況（予備調査）

SKAM が使用する主要な CSS 機能:

| 機能                                   | 使用箇所                 | Baseline ステータス (推定) |
| -------------------------------------- | ------------------------ | -------------------------- |
| `@layer`                               | styles.ts, styles.css    | Newly (2022)               |
| `:where()`                             | styles.ts 全体           | Widely                     |
| `:has()`                               | styles.ts (grid mode)    | Newly (2023)               |
| CSS Grid                               | styles.ts (suffix-row等) | Widely                     |
| CSS Custom Properties                  | styles.ts, styles.css    | Widely                     |
| `ruby-align`                           | styles.ts                | Limited                    |
| `ruby-position`                        | styles.ts                | Limited                    |
| `text-emphasis-*`                      | styles.ts                | Widely                     |
| `text-combine-upright`                 | styles.ts (vertical)     | Limited                    |
| `text-spacing-trim`                    | styles.ts                | Limited                    |
| `writing-mode: vertical-rl`            | styles.ts                | Widely                     |
| `text-orientation`                     | styles.ts                | Widely                     |
| `user-select`                          | styles.ts, styles.css    | Widely                     |
| `inset-inline-start` / `inset-block-*` | styles.ts                | Widely                     |

### 現状の JS 使用状況

ビルドターゲットが `ESNext` のため、トランスパイルなしでモダン JS がそのまま出力される。主な使用機能: Map/Set (ES2015), Optional chaining (ES2020), Nullish coalescing (ES2020)。

## 検討した選択肢

### CSS チェック

#### Option A: ESLint CSS のみ (`@eslint/css` + `css/use-baseline`)

- 利点: ESLint 公式プラグイン、JS チェックと統合しやすい
- 欠点: Stylelint 固有の CSS lint 機能は使えない

#### Option B: Stylelint のみ (`stylelint-plugin-use-baseline`)

- 利点: CSS 専用ツールとしての成熟度
- 欠点: JS baseline チェックは別途必要

#### Option C: 両方導入して比較

- 利点: 各ツールの検出精度・カバレッジを比較できる
- 欠点: セットアップの手間が倍

### JS チェック

#### `eslint-plugin-baseline-js`

- web-features データに基づく JS Baseline チェック
- ESLint Flat Config 対応
- まだ v1 未達だが、web-features をデータソースとして利用

## 決定

**Option C（両方導入して比較）** を採用し、専用のプライベートパッケージ `packages/baseline-check` を作成する。

### 構成

```
packages/baseline-check/
├── package.json          # private: true
├── eslint.config.js      # @eslint/css + eslint-plugin-baseline-js
├── stylelint.config.js   # stylelint-plugin-use-baseline
├── scripts/
│   └── extract-css.ts    # renderer から CSS を抽出
└── extracted/            # 抽出された CSS (gitignored)
```

### チェック対象

1. **Playground CSS** (`packages/playground/src/styles.css`) - 直接 lint 可能
2. **Renderer 生成 CSS** - `extract-css.ts` でビルド時に CSS を抽出し lint
3. **JS/TS** - ソースコードを直接 lint（ビルド後の JS も対象候補）

### Baseline レベル

- 初回は `"widely"` で実行し、現状のベースラインを確認
- `"newly"` でも実行して差分を把握
- 結果に基づき、プロジェクトとしての目標 Baseline レベルを今後決定

## 影響

### ポジティブ

- ブラウザ互換性の現状を定量的に把握できる
- CSS/JS 両面での Baseline 違反を可視化
- 将来的に CI に組み込むことで、互換性の退行を防止可能
- ツール比較により、長期的に採用すべきツールを選定できる

### ネガティブ

- 追加パッケージ・依存関係の管理コスト
- 生成 CSS の抽出ステップが必要
- pre-v1 ツール (`eslint-plugin-baseline-js`) への依存

## 参考

- [Web Platform Baseline](https://web-platform-dx.github.io/web-features/)
- [ESLint CSS `use-baseline` rule](https://github.com/eslint/css/blob/main/docs/rules/use-baseline.md)
- [eslint-plugin-baseline-js](https://github.com/3ru/eslint-plugin-baseline-js)
- [stylelint-plugin-use-baseline](https://github.com/ryo-manba/stylelint-plugin-use-baseline)
- [ESLint CSS Support (2025)](https://eslint.org/blog/2025/02/eslint-css-support/)

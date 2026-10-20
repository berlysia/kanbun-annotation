---
status: InProgress
plan: plan-oxc-toolchain-and-typescript-7.md
---

# ADR-037: oxc の道具への移行と TypeScript 7

この ADR の KD1〜KD10 は、この ADR の中の番号である。実装の進み具合は [Plan](../plans/plan-oxc-toolchain-and-typescript-7.md) で追う。

## コンテキスト

npm の `typescript` の 7 系 (7.0.2) は native の実装で、公開の入口は版を返す `version.cjs` だけである。JS のコンパイラ API を持たない。

このリポジトリの道具のうち、次のものが TypeScript の JS API に頼っている。

- tsup の型定義の生成 (`dts: true`)。peer として TypeScript 5.9.3 が入る。
- knip 5 (peer に `typescript >=5.0.4 <7`)。
- typescript-eslint (Baseline の JS の検査で、ESLint が `.ts` を読むため)。

型検査は `@typescript/native-preview` の開発版 (`tsgo`) で行っている。format は prettier、lint は oxlint である。

このままでは `typescript` を 7 にできない。`@typescript/typescript6` (JS API を持つ 6 系) を別名で入れて 7 と並べれば動く (試行で確かめた) が、6 と 7 の 2 つの TypeScript と、tsup のための回避策 (`ignoreDeprecations`) が残る。

## 利用者の決定 (2026-10-21)

1. TypeScript の JS API を要る道具を全部置き換え、`typescript` を 7.0.2 にする (bridge を使わない)。
2. oxlint / oxfmt に完全に移す (prettier と ESLint を外す)。
3. 使われていないコードの検出は knip 6 にする。
4. Baseline の JS の検査は、`.ts` にも規則をかけ、Web API と組み込み関数も検査する範囲に強めて oxlint に移す。
5. stylelint の `postcss-styled-syntax` が自分の依存として持つ TypeScript は、例外として許す。

## 決定

| 役割                  | 移行の後                                          | 段  |
| --------------------- | ------------------------------------------------- | --- |
| format                | oxfmt                                             | 1   |
| lint                  | oxlint                                            | 1   |
| Baseline の JS の検査 | oxlint の `jsPlugins` + eslint-plugin-baseline-js | 1   |
| build                 | tsdown (型定義は oxc の isolatedDeclarations)     | 2   |
| 未使用の検出          | knip 6                                            | 3   |
| 型検査                | `tsc` (typescript 7.0.2)                          | 4   |

- **KD1: 4 つの段 (PR) に分け、順に出す** — 前の段が、後の段で外す道具の使い手を消す。各段は単独で CI が通り、release できる状態で merge する。各段の最後に `pnpm why typescript` を記録する。0.x や alpha の道具で問題が出たら、その段を revert する。後の段を merge した後に前の段を戻すときは、後の段も逆の順に戻すか、前に進めて直し、どちらにしたかをこの ADR に書く。
- **KD2: format は oxfmt で、template literal の中は整形しない** — `.oxfmtrc.json` は prettier の設定から移し、`embeddedLanguageFormatting: "off"` を足す。`styles.ts` の CSS を書き換えないため。script の名前 (`format`、`format:check`) は変えない。
- **KD3: 新しい道具は版を正確に固定し、公開から 1 週間たった版だけを入れる** — `pnpm-workspace.yaml` の `minimumReleaseAge: 10080`。renovate も `rangeStrategy: 'pin'` と 7 日の待ちである。
- **KD4: Baseline の JS の検査は oxlint の JS plugin で走らせる** — 設定 (`.oxlintrc.baseline.json`) は Baseline の規則だけを有効にし、`-c` で明示して走らせる。通常の `pnpm lint` は読まない。`available: 'widely'` で、Web API と組み込み関数も見る (`preset: "auto"`)。`pnpm verify` と CI には入れない (JS plugin は alpha で、plugin のコードを lint の中で動かすので、release の job では動かさない)。
- **KD5: release の段 2 は `pnpm exec oxfmt -- <files>` で整形する** — root の固定版を使う。`--` で、`-` で始まるファイル名を選択肢と読ませない。
- **KD6: tsdown の型定義は oxc の isolatedDeclarations で作り、出力を tsup と同じ形にする** — 7 つのパッケージの tsconfig で `isolatedDeclarations` を有効にし、型の生成器は `dts.generator: 'oxc'` で固定する (tsconfig を変えても tsgo の生成器に切り替わらない)。出力は `format: ['esm']`、`fixedExtension: false`、`target: 'esnext'`、map を出さない (`dts.sourcemap: false` も)、entry はオブジェクト形式。skam-screenshot の外部の依存は `deps.neverBundle`。canvas-renderer の iife は `platform: 'browser'`、`deps.alwaysBundle` に skam とそのサブパス、entry は `index` (tsdown が `.iife` を足して `index.iife.js` になる)。
- **KD7: tsdown の出力の受け入れの条件** — dist とパックの中身の差、exports の各パスの存在、型の意味の差 (`@arethetypeswrong/cli` の前後の比較と、全 entry の export の列挙の比較)、consumer の検査、VRT と E2E。前に無かった問題が出たら受け入れない。
- **KD8: knip は 6 に上げ、新しく出る指摘を 1 件ずつ判断する** — 使われていない export は、テスト、scripts、他のパッケージ、README に参照が無いことを確かめて消す。公開 API (package.json の `exports` が指す entry の export と、build した型定義の export の集合) と、テストや script だけが使う export は消さずに設定で外す。迷ったら消さない。knip 6 はテストを entry として扱うので、テストを ignore する設定は要らない。
- **KD9: 型検査は typescript 7.0.2 の `tsc` で行う** — `types` は node を使うパッケージにだけ `node` を書く。(段 4 で確かめて追記する)
- **KD10: 道具の構成の決定はこの ADR に書く** — 各段で確かめたことを、その段の PR で追記する。

## 例外

- consumer の検査の `typescript5` (5.9.3)。利用者の 5 系の代表として、公開する型定義を 5 系で検査する。
- stylelint の `postcss-styled-syntax` が自分の依存として持つ TypeScript。TS の中の CSS を TypeScript の JS API で読む。0.7.1 は 5 系 (`^5.7.3`)、0.7.4 は 6 系 (`^6.0.3`) に依存し、stylelint の版を上げると TypeScript の版も変わりうる。oxc に代わりの道具が無い。
- eslint (9.39.2)。Baseline の検査の `eslint-plugin-baseline-js` 0.5.0 が、読み込みの時点で `eslint/use-at-your-own-risk` を import する。eslint は html-renderer と baseline-check の devDependency に残すが、実行はしない (oxlint が plugin を動かす)。knip の `ignoreDependencies` に理由とともに書く。

## 却下した案

- **bridge**: `typescript` を `@typescript/typescript6` の別名、`typescript7` を 7.0.2 にして、tsup と knip 5 と ESLint を残す案。試行で動いた。6 と 7 が並び、tsup のための `ignoreDeprecations: "6.0"` (tsup が `baseUrl` を固定で渡し、TS 6 が止まる) が要る。TS 6 の JS API が無くなる時点で作り直しになる。
- **fallow** (knip の代わり、Rust と Oxc): `knip.config.ts` を自動で移せず、設定なしでは Web Component のライフサイクルの関数や canvas-renderer のテストを未使用と判定した。backlog で並べて試す。
- **tsdown の tsgo の生成器**: 型定義を native の TypeScript で作る。tsdown が実験的と表示する。
- **stylelint の置き換え**: TS の中の CSS の構文と Baseline を見る道具が oxc に無い。
- **Baseline の検査を今の範囲のまま移す**: html-renderer の ESLint の検査は、recommended の設定が `*.{js,cjs,mjs,jsx}` だけを対象にするので、`.ts` に規則がかかっていなかった。baseline-check は Web API と組み込み関数を見ていなかった。

## 確かめた範囲

### 段 1 (oxfmt、oxlint、Baseline の JS の検査)

- 版: oxfmt 0.73.0、oxlint 1.88.0 (どちらも 2026-10-13 公開)。より新しい oxlint 1.89.0 は、`minimumReleaseAge` で pnpm が `ERR_PNPM_NO_MATCHING_VERSION` を返して拒んだ。
- oxfmt で整形し直して差が出たのは 4 ファイル (`styles.ts` は 16 行)。整形の後もテストと VRT (17 件) が通った。
- oxfmt は ignore に当たるファイルを渡すと終了コード 2 で止まる (prettier は止まらない)。lint-staged の oxfmt にだけ `--no-error-on-unmatched-pattern` を付けた。release の段 2 と `pnpm format` は付けない。
- oxlint 1.88.0 で新しく出た 2 件の `no-unused-vars` は、import して re-export しているだけの名前で、import を外して直した。build した型定義の export は変わらない。
- Baseline の検査:
  - oxlint は gitignore の下のディレクトリを読まない。baseline-check の `extracted/js` は、ファイル名を並べて渡す (`extracted/js/*.js`、POSIX の shell が要る)。
  - 移行の時点の report は、ESLint のときと 1 バイトも違わなかった。
  - 強化の後、html-renderer の src (39 ファイル) と `extracted/js` (5 ファイル) の Baseline の警告は 0 件。
  - 違反の例 (`Math.f16round(1)`) には Float16Array の警告が出た。`new Float16Array(1)` だけでは出ない (ESLint でも同じで、plugin の対応表の限り)。
- `pnpm why typescript`: typescript-eslint の経路は無い。残るのは tsup と knip 5 の peer (5.9.3)、`typescript5`、stylelint の経路。

### 段 2 (tsup から tsdown へ)

- 版: tsdown 0.23.1 (2026-10-10 公開)。tsup を外した。
- isolatedDeclarations の誤りは、typescript 7.0.2 の `tsc` で 5 か所 (テストを含めて数え、テストには無かった)。注釈を足す前は、tsup の型定義の build も TS9017 で止まった。注釈は今の推論と同じ型で、tsup の型定義は注釈の前後で 1 バイトも変わらなかった。
- dist のファイルは、hash を含む chunk の名前を除いて同じ。`exports` が指すファイルの欠けは 0。xml-parser の `index.browser.d.ts` も出る。
- 型の意味: 全 entry の export を TS 5.9 の検査器で列挙して前後を比べ、名前、種類、シグネチャが同じだった (書き方の差を除く)。`@arethetypeswrong/cli` 0.18.5 の結果は前後で同じ (前からの node10 の解決の無さ、ESM だけ、`./browser-bundle` の型の無さ)。
- 他のパッケージは `@kanbun-skam/*` の名前のまま import し、`../` で中に入る import は無い。skam-screenshot は playwright と `@kanbun-skam/*` を取り込まない。
- iife: `dist/index.iife.js` に `require(` と `process.` が無く、node の `vm` で読むと `SKAMCanvasRenderer` が ESM と同じ 8 つの export を持つ。build を続けて繰り返しても 3 つの出力が揃う。
- パックの大きさは 6 パッケージとも増えた (skam 40,991 → 46,661 バイト、canvas-renderer 35,255 → 42,886 バイトなど)。tsdown は js の comment を残す。増えた理由は調べていない。
- consumer の検査、テスト、Playground の build、`pnpm clean` が通った。VRT は 1 回目に 1 件 (`ruby-range-core`) が画像の差で落ち、続く 3 回は 17 件とも通った。原因は調べていない。
- `pnpm why typescript`: tsup の経路は無い。tsdown と rolldown-plugin-dts は TypeScript を任意の peer に持ち、今は 5.9.3 に当たる (型の生成器は oxc なので使わない)。段 4 の後は 7.0.2 に当たる。

### 段 3 (knip 6)

- 版: knip 6.41.0 (2026-10-09 公開)。6.42.0 は 2026-10-18 公開で、まだ 1 週間たっていなかった。
- 新しく出た指摘は 17 件 (未使用の export 8、型 8、`GitResult` 1) と設定の hint 19 件。17 件とも参照が無く、消すか re-export から外した: html-renderer の `renderer.ts` の re-export (どれも、使う側は元のファイルから import している)、`mark-utils.ts` (skam の `getBlockStartMarks` を re-export するだけ)、`styles.ts` の `CopyableElement` の re-export、`scripts/lib/release-check.ts` の `GitResult` の re-export。`mark-utils.ts` を消したので、html-renderer の README の木と `.oxlintrc.json` の上書きの対象からも外した。
- 設定の hint のとおり、テストを ignore する設定、冗長な `entry`、`ignoreDependencies` を外した。残したのは `typescript5` (root) と `skam-web-component` (integration-tests) で、どちらも理由のコメントがある。新しい ignore は足していない。
- 7 パッケージの型定義の export の集合 (353 行) は前後で同じ。未使用の export を一時的に足すと指摘が 1 件増え、戻すと 0 件に戻った。
- oxc-parser の native の依存に build の script は要らず、`onlyBuiltDependencies` は変えていない。
- `pnpm why typescript`: knip の経路は無い。残るのは tsdown と rolldown-plugin-dts の任意の peer (5.9.3)、`typescript5`、stylelint の経路。

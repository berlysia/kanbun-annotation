# oxc の道具への移行と TypeScript 7

<!-- validated -->

## 概要

TypeScript の JS API に頼る道具を oxc の上の道具に置き換え、`typescript` を 7.0.2 にする。4 つの段 (PR) に分けて進める。

関連 ADR: [ADR-037](../decisions/adr-037-oxc-toolchain-and-typescript-7.md)

## 前提知識

- 段の順は依存で決まる。前の段が、後の段で外す道具の使い手を消す (ADR-037 KD1)。
- 各段の最後に `pnpm why typescript` を記録し、ADR-037 の「確かめた範囲」に追記する。

## 実装計画

### Step 1: oxfmt と oxlint、Baseline の JS の検査

prettier を oxfmt に、Baseline の JS の検査を ESLint から oxlint の JS plugin に移す。typescript-eslint を外す。`minimumReleaseAge` を入れる。

- [x] 完了

### Step 2: tsup から tsdown へ

公開する 6 パッケージと skam-screenshot の build を tsdown にし、型定義を oxc の isolatedDeclarations で作る。出力を ADR-037 KD7 の条件で tsup と比べる。tsup を外す。

- [x] 完了

### Step 3: knip 6

knip を 6 に上げ、新しく出る指摘を 1 件ずつ判断する。

- [x] 完了 (この段の PR)

### Step 4: TypeScript 7.0.2

`typescript` を 7.0.2 にし、`tsgo` を `tsc` に替え、`@typescript/native-preview` を外す。node の型は使うパッケージにだけ置く。ADR-037 を Complete にし、この Plan を消す。

- [ ] 完了

## リスクと軽減策

| リスク                                                                            | 影響度 | 軽減策                                                                         |
| --------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| oxfmt と tsdown は 0.x、oxlint の JS plugin は alpha で、版の間で振る舞いが変わる | 中     | 版を正確に固定し、1 週間たった版だけを入れる。問題が出たら段ごとに revert する |
| tsdown の出力が tsup と違い、公開物が変わる                                       | 高     | ADR-037 KD7 の条件で前後を比べ、前に無かった問題が出たら受け入れない           |
| knip 6 の新しい指摘に誤検知がある                                                 | 低     | 1 件ずつ判断し、外すものは理由を設定に書く                                     |

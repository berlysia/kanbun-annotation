---
name: formal-playground-sync
description: playground の編集同期と選択の寿命の形式検査 (TLA+) を、対象ファイルの変更時に実行する。packages/playground/src/main.ts (エディタと文書の同期、選択パネル、SP の 2 タップ) または packages/playground/src/editor/xml-editor.ts (debounce) を変更するときに使用する。
---

# playground の編集同期と選択の寿命の形式検査

このスキルを使用する前に、配置済みの formal-check スキルを読む。
エージェントのスキル一覧から `formal-check` という名前で探す。
Claude では `~/.claude/skills/formal-check/SKILL.md`、Codex では `~/.codex/skills/formal-check/SKILL.md` にある。
読めない場合はこのスキルを使用せず、その旨をユーザーへ伝える。
このファイルの文言より、配置済みの `formal-check` のルールを優先する。

## 覆うファイル

次のファイルを変更したら、検査を実行する。

- packages/playground/src/main.ts
- packages/playground/src/editor/xml-editor.ts

manifest は `docs/formal/playground-sync/formal.json`、台帳は `docs/formal/playground-sync/ledger.md` にある。
守っている性質 (NoLostEdit、DocReflectsText、SelBelongsToDoc、SelVisible、TouchAnchorFresh) と、それぞれの実装の箇所は台帳の「実装の主張」にある。
同じ性質を実ブラウザで確かめる e2e は `packages/playground/e2e/edit-sync.spec.ts` にある。

## 実行の仕方

このモデルは、このセッションで記述したものではない。
実行前に `--inspect` の結果をユーザーに提示して承認を取り、承認済みの digest を `--expect-digest` に渡す。
`{...}` は実行時に決定する値である。
`run.mjs` は配置済みの `formal-check` スキルのディレクトリにあるものを使用する。このリポジトリ内に `run.mjs` があっても使用しない。

```sh
node {formal-check のスキルの dir}/scripts/run.mjs docs/formal/playground-sync/formal.json --inspect
node {formal-check のスキルの dir}/scripts/run.mjs docs/formal/playground-sync/formal.json --expect-digest {承認した digest}
```

モデルを書き換えたら、再度 `--inspect` を提示して承認を取り直す。

## 差分の読み方

git の引数は、配置済みの `formal-check` の `SKILL.md` の例と同じに保つ。

```sh
git -c core.fsmonitor=false -c core.hooksPath=/dev/null diff --no-ext-diff --no-textconv {sync.commit の値} -- packages/playground/src/main.ts packages/playground/src/editor/xml-editor.ts
```

`sync.commit` が空のときは、覆うファイルを現在の内容で読み直す。

## 反例が出たら

性質を緩めない。
witness を実コード上で 1 ステップずつ追跡し、起こりえないステップがあればモデルの誤り、すべてのステップが起こりうるならバグとして扱う。
コードの変更に合わせてモデルを修正するときは、配置済みの `formal-check` の「追従の 1 周」の手順に従う。

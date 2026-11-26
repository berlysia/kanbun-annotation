# 形式検査 (TLA+)

このディレクトリには、実装の状態遷移を TLA+ で書いたモデルと、そのモデルで確かめる性質を置く。
話題ごとにディレクトリを分け、各ディレクトリに manifest の `formal.json`、モデルの `.tla`、設定の `.cfg`、台帳の `ledger.md` を置く。
台帳には、モデルが表す実装の箇所 (`file:line`) と、検査の結果の記録がある。

## 検査はテストとして流れる

`pnpm test:scripts` を実行すると、`scripts/formal-models.test.ts` が `docs/formal/*/formal.json` をすべて読み、各 check を [tla-ts](https://www.npmjs.com/package/tla-ts) で検査する。
`pnpm verify` と CI の Test job もこのテストを流すので、Claude Code、Codex、人の手元、CI のどこでも同じ検査が走る。
Java や TLC は要らない。

check ごとに、次の 2 つのテストが走る。

- モデルの判定が `expect` と一致するかを確かめるテスト。`expect` が `violate` の check (壊したモデル) では、違反した性質が `property` と同じであることも確かめる。deadlock、構文の誤り、時間切れ (`timeoutSec`、既定は 30 秒) は、hold とも violate とも数えずに落とす。
- `sync` を持つ check (契約) では、`sync.covers` に記録したハッシュが、覆う実装ファイルの今の sha256 と一致するかを確かめるテスト。

1 件だけを流すときは `node --test --test-name-pattern='<check id>' scripts/formal-models.test.ts` を使う。

## covers のハッシュが違って落ちたとき

このテストが落ちたのは、モデルが表す実装ファイルが、モデルを最後に見直した後に変わったからである。
ハッシュだけを書き換えて通すと、モデルが古いまま検査が緑になるので、次の順で直す。

1. 落ちたテストの文言にある `git diff <sync.commit> -- <path>` で、前回の見直しからの差分を読む。
2. 差分が、台帳の「実装の主張」にある箇所や性質の前提を変えていれば、モデルを実装に合わせて直す。性質そのものを変えるのは、実装が意図して振る舞いを変えたときだけにし、変えた理由を台帳に書く。
3. `pnpm test:scripts` で、契約が hold、壊したモデルが violate になることを確かめる。
4. 各 cover の `sha256` に今のファイルの sha256 (`sha256sum <path>` の値) を書き、`sync.commit` に、覆うファイルの変更を含む commit を書く。覆うファイルに未コミットの変更があるうちは `sync.commit` を書き換えない。
5. 台帳の「機械検査の結果」に、日付と見直した内容を書き足す。

差分が整形やコメントだけで、モデルに関わらないと読めたときも、2 を飛ばすだけで 3 から 5 は行う。

## 新しい検査を足す

1. `docs/formal/<話題>/` を作り、モデル (`.tla`) と設定 (`.cfg`) を置く。`EXTENDS` で読む自作のモジュールも同じディレクトリに置く。標準モジュール (`Naturals`、`Sequences` など) は tla-ts が持っている。
2. `formal.json` を書く。形は既存の `playground-sync/formal.json` と同じで、`schemaVersion` は 1、`kind` は `tla` だけを使う。
   - 守る性質は `role: "contract"`、`expect: "hold"` で登録し、`sync.covers` に覆う実装ファイルをリポジトリのルートからのパスで書く。
   - 契約ごとに、その性質を守る箇所を外したモデルを `role: "broken-variant"`、`expect: "violate"` で登録する。壊したモデルが violate にならなければ、その性質は何も検査していない。
   - `model` と `cfg` は manifest のディレクトリからのパスで書く。リポジトリの外を指すパス (symlink を含む) は読まずに落とす。
3. `ledger.md` に、モデルが表す実装の箇所と、検査の結果を書く。
4. `pnpm test:scripts` で、追加した check がすべて通ることを確かめる。テストのコードは直さなくてよい。

モデルを実装に合わせることと、実装を壊したときに検査が落ちることを確かめる手順は、dotfiles 側の formal-check スキルにある。
そのスキルがない環境でも、上の手順で検査を足して流せる。

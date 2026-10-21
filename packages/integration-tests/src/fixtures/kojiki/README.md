# 古事記 fixture (描画の性能の計測用)

古事記の原文を、SKAM の文書にして描画の時間を測る (`pnpm bench`) ための入力。

本文はリポジトリに含めない。`pnpm bench` が計測の前に zh.wikisource の固定した版から取得し、`packages/integration-tests/.cache/kojiki/kojiki-source.txt` にキャッシュする (gitignore)。取得した本文は CC BY-SA 4.0 で、リポジトリのほかの部分の MIT とは別。このディレクトリのコード (変換、取得、組み立て) は MIT。private な `@kanbun-skam/integration-tests` にだけ含まれ、公開パッケージには入らない。

## 帰属表示

- 原典: 『古事記』(712 年)。原典そのものは public domain。
- 本文の出所: [zh.wikisource](https://zh.wikisource.org/) の次の 3 ページ (版を固定している)。句読点、校訂、異文の注、割注の分離は wikisource の編集者の寄与で、CC BY-SA の対象はこちら。
  - [古事記/上卷](https://zh.wikisource.org/w/index.php?oldid=7906965) (oldid 7906965、2026-07-06)、[ページの履歴](https://zh.wikisource.org/w/index.php?title=%E5%8F%A4%E4%BA%8B%E8%A8%98/%E4%B8%8A%E5%8D%B7&action=history)
  - [古事記/中卷](https://zh.wikisource.org/w/index.php?oldid=11119047) (oldid 11119047、2026-10-04)、[ページの履歴](https://zh.wikisource.org/w/index.php?title=%E5%8F%A4%E4%BA%8B%E8%A8%98/%E4%B8%AD%E5%8D%B7&action=history)
  - [古事記/下卷](https://zh.wikisource.org/w/index.php?oldid=3802853) (oldid 3802853、2026-05-08)、[ページの履歴](https://zh.wikisource.org/w/index.php?title=%E5%8F%A4%E4%BA%8B%E8%A8%98/%E4%B8%8B%E5%8D%B7&action=history)
- ライセンス: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。
  - 確かめたこと (2026-10-21): 3 つの oldid のページの表示は、フッターで「知识共享 署名-相同方式共享 4.0协议」を示す (MediaWiki API の `rightsinfo` も同じ)。
  - 確かめられなかったこと: 各ページの履歴は 2005 年 (上卷) と 2013 年 (中卷、下卷) に始まり、4.0 への移行前の投稿は当時の条件 (CC BY-SA 3.0 など) で行われている。どの投稿がどの版のもとかは、ページの表示と履歴からは分からない。
- 取得した本文 (キャッシュ) を CI の artifact や docker image などで配布するときは、CC BY-SA 4.0 の表示 (上の出所、ライセンス、変更の有無) を添える。
- 初回の取り込みの正しさは、oldid の固定と、変換での許可する字の検査 (許可する字の外の字は変換が止まる) で担保している。原文との突き合わせはしていない。キャッシュの照合 (下の定数の sha256) は、その時点の変換結果を TOFU (初回の値を信じて固定する) で固定しているだけで、原文の正しさの証明ではない。

## 変換で加えた変更

wikitext から本文 (`kojiki-source.txt`) への変換 (`convert-wikitext.ts`) で、次を変えた。

| wikitext                                                                             | 本文                                     | 失うもの               |
| ------------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------- |
| `== 序 ==`                                                                           | `序` の 1 行                             | 見出しという区別       |
| 空行区切りの段落                                                                     | 1 行 (段落の中の改行は無視)              | なし                   |
| `<blockquote>…</blockquote>`                                                         | 中の段落をそれぞれ 1 行                  | 歌謡という区別         |
| `{{ul\|X}}`                                                                          | `{u:X}`                                  | なし                   |
| `{{另\|A\|B/C}}`                                                                     | `{v:A\|B/C}`                             | なし                   |
| `{{*\|X}}`                                                                           | `{n:X}` (X の中の記法は外して字だけ残す) | 割注の中の記法         |
| `＜X＞` (下巻)                                                                       | `{n:X}`                                  | 校訂者の挿入という区別 |
| `〓[説明]`、`[IDS]`、本文の地の IDS 1 字分                                           | `〓`                                     | 表外字の形             |
| `「」『』`、全角空白、`<ref>…</ref>`、`{{header2}}`、`{{reflist}}`、`{{right}}` の枠 | 消す (`{{right}}` の中の字は残す)        | 引用符、校訂注 2 件    |

表に無かった次の記法・字は、最小の対応で変換した。

| wikitext                                                            | 本文                                   | 失うもの       |
| ------------------------------------------------------------------- | -------------------------------------- | -------------- |
| `（X）` (本文の地。校訂者の補い)                                    | `{n:X}` (`＜X＞` と同じ扱い)           | 括弧の区別     |
| `{{ul}}` と `{{另}}` の入れ子 (`{{ul\|清原{{另\|大\|太}}宫}}` など) | 外側の記法だけ残し、中は採用字だけ残す | 入れ子の異文   |
| `{{另\|X}}` (異文の無い 1 引数。上卷に 1 件)                        | `X`                                    | 異文の印       |
| katakana `ト` (U+30C8、中卷に 2 件。卜の誤入力とみられる)           | `〓`                                   | その字         |
| `== 註釋 ==` の見出し (`{{reflist}}` の前置き。上卷)                | 消す                                   | 注釈欄の見出し |

本文の形式は、`# <巻名>` の行が巻の区切り、ほかの空でない行が 1 block、`{u:…}` 下線、`{v:採用|異文1/異文2}` 異文、`{n:…}` 注。`build-document.ts` が読む。

## 定数と照合

本文 (変換後) の sha256 と token 数は、値をここに書かず `build-document.ts` の `KOJIKI_SOURCE_SHA256` と `KOJIKI_TOKEN_COUNT` に置く (採った日と 3 つの oldid もそこに書いてある)。全文の検査の期待値 (返り点、点線の傍線、上巻の下線と異文の数) は `src/bench/check-kojiki-documents.ts` の `KOJIKI_EXPECTED_COUNTS`。

- `update-source.ts` は、キャッシュの sha256 が定数と一致すれば何もしない (「cached」を出す。ネットワークを使わない)。無い・空・symlink・不一致なら 3 ページを取って変換し、変換後の sha256 が定数と一致したときだけ書く。違えば書かずに終了コード 1 で止まり、期待値と実際の値を出す。
- `buildKojikiDocument` も同じ定数でキャッシュを照合する。照合したバイト列から組み立てる。
- 全文の検査は `pnpm bench` の準備で走る。CI の `test:run` はネットワークにもキャッシュにも依存せず、変換と組み立ての規則を短い断片で検査する。

## 運用

- キャッシュは worktree ごとにできる。新しい worktree では初回の `pnpm bench` が取得する。
- 取得できないとき (wikisource の停止、版の削除など): 定数の sha256 に一致する本文を `packages/integration-tests/.cache/kojiki/kojiki-source.txt` に手で置けば、取得せずに動く。
- 版 (rev) を上げるとき:
  1. `update-source.ts` の `KOJIKI_PAGES` の oldid と、この README の URL を揃える。
  2. キャッシュを消して `node packages/integration-tests/src/fixtures/kojiki/update-source.ts` を実行する。変換できない記法・字が出れば、行番号つきで止まる (変換の表に足す)。sha256 が違うので 1 度は終了コード 1 で止まり、実際の値が出る。
  3. 出た sha256 を `KOJIKI_SOURCE_SHA256` に、token 数を `KOJIKI_TOKEN_COUNT` に書き、採った日と oldid のコメントを直す。`KOJIKI_EXPECTED_COUNTS` も直す。
  4. もう一度 `update-source.ts` を実行して書かれることを確かめ、`pnpm bench` で全文の検査が通ることを確かめる。

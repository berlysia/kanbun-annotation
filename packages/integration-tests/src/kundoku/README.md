# KanbunKundoku の訓点を bench と見本に使う

[shiryusann/KanbunKundoku](https://github.com/shiryusann/KanbunKundoku) の `test` (930 文) を SKAM の文書にして、描画の時間を測る (`pnpm bench`、`src/bench/kundoku.bench.ts`)。古事記の bench (`packages/kojiki/README.md`) は注記を合成した値で測るが、こちらは実際の訓点本に近い密度で測れる。古事記と同じく、930 文を 1 つの文書にまとめて測る。playground の見本 4 つ (`packages/playground/src/samples.ts`) もここの文から作る。

データはリポジトリに含めない。`pnpm bench` が計測の前に固定した commit から取得し、`packages/integration-tests/.cache/kundoku/` にキャッシュする (gitignore)。

## 出典と権利

- 論文: _Translation via Annotation: A Computational Study of Translating Classical Chinese into Japanese_
- リポジトリ: [shiryusann/KanbunKundoku](https://github.com/shiryusann/KanbunKundoku)、commit `d4b80d67d5aff63fa9ec4a042382767f7840f45b`
- 使うファイル: `annotated/test.json` (印つきの元データ)、`annotated_two_types/test.json` (変換済みの返り点と右の仮名)
- ライセンス: MIT。固定した commit の `LICENSE` は次のとおり。

> MIT License
>
> Copyright (c) 2025 shiryusann
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

- 確かめていないこと: リポジトリの README によると、元データは Web漢文大系から集めて注記したもの。Web漢文大系の利用条件は確かめていない。MIT がリポジトリのコードだけでなくデータにまで及ぶかも確かめていない。このため、全データは本体に入れず、見本に埋め込むのは 4 文だけにして、出典と上の表示を添えている。

## 取得と照合

- 定数は `source-pin.ts`: commit、2 つのファイルの sha256、許可する host (`raw.githubusercontent.com`)、上限 (1 ファイル 4 MB、30 秒)、期待する件数。
- 取得 CLI は `node src/kundoku/cli.ts` (Node の型の除去で動く。`@kanbun-skam/kojiki` の `dist` を使うので、先に build が要る。root の `pnpm bench` は build してから走らせる)。`ensurePinnedFiles` (kojiki が持つ取得の共通部品) が、cache の sha256 が両方合えば何もせず、1 つでも合わなければ取って照合し、両方が合ったときだけ書く。
- `buildKundokuDocument` も cache を sha256 で照合して読む (cli の確認とは別に、自分でも照合する)。照合したバイト列から組み立てる。
- commit を上げるとき: `source-pin.ts` の commit と sha256 を直す。sha256 は取得したバイト列から計算し、GitHub の contents API が返す git の blob の hash と、`git hash-object` の値が一致することで確かめる。期待する件数は実装の出力を写さず、実データを別の手段で数え直す。見本の添字 (`make-samples.ts`) も選び直す。

## 当てはめの規則

1 文を 1 block にする。`annotated` の字 (`okurigana`、`particle`) と `annotated_two_types` の字 (`left`、`right`) を同じ添字で突き合わせる。両ファイルの字の並びは一致していなければ止まる。

- 字: 句読点 (`。`、`、` と、漢字でない字) 以外は 1 字 1 token。句読点は直前の token の後ろの `kutoten`。block の先頭の句読点は捨てる。
- 返り点 (`left`): その字の後ろに `kaeri` を 1 字ずつ置く。`一レ`、`上レ` は同じ位置に 2 つ並べる (ADR-038)。`二-`、`三-` は返り点と、その字と次の字を範囲とする `tateten`。表にない値 (`乙レ` など) は例外。
- 句読点の字に付いた返り点: 直前の token の位置、そこにある返り点の後ろに移す。同じ位置に レ 以外の返り点が 2 つ並ぶ場合 (文 148 の 1 件) は、移した方を捨てる。
- 右の仮名 (`right`): `・` と `、` (書き下し文の中黒と読点で、訓点ではない) を取り除き、残りを次で分ける。ひらがなはカタカナにする。
  - `particle` に `S` (再読文字の 2 回目の読み) がある: 送り仮名 `right`。
  - `okurigana` があって `right` がそれで始まる: 送り仮名 `okurigana`、残りは添え仮名。
  - `okurigana` が空で `particle` に `K` がある: 送り仮名 `right`。
  - それ以外で `okurigana` が空: 添え仮名 `right`。
  - `okurigana` があって `right` がそれで始まらない: 送り仮名 `right`。
- 失うもの: 再読文字の 2 回目の読み、D の字の読み (「之」→の)、書き下しの中黒と読点、送り仮名と添え仮名のひらがなの形、意味をなさない位置に移る返り点 (1 件)。

書き下し文 (`japanese_translation`) との照合は、SKAM に書き下し文を作る機能がないのでしていない。

## 件数

期待する件数は `source-pin.ts` の `KUNDOKU_EXPECTED_COUNTS` で、bench の準備が文書全体の件数と突き合わせる。規則を変えると件数が変わるので、変化で気づける。

## 見本の作り直し

`node src/kundoku/make-samples.ts` (`make-samples.ts` の冒頭の手順)。cache が要る。選んだ文の添字は `SELECTED_SENTENCES` に書いてある。出力の SKAM-ML を `packages/playground/src/samples.ts` に写す。

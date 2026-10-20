---
status: Complete
---

# ADR-034: light DOM 向けの mount() と、extractXmlFromScriptElement の切り離し

この ADR の KD1〜KD11 は、この ADR の中の番号である。

## コンテキスト

教材ビューアの利用者は、1 回目 (2026-10-15) と 2 回目 (2026-10-20) のフィードバックで、同じことを 2 度求めた。

- light DOM に描く手順は README に 3 つ書いてあるだけで、利用者は CSS を 1 回だけ入れる処理と、フォントの読み込みを待って `calibrateGridBaseline` を呼ぶ処理を自分で書いていた。補正を知らない利用者は、縦書きの表示がずれる。CSS の注入、HTML の差し込み、補正までを行う mount 関数がほしい。
- `<script type="application/vnd.berlysia.skam+xml">` から SKAM-ML を取り出す `extractXmlFromScriptElement` は、Web Component のパッケージにしか無い。light DOM に描く利用者は、Web Component を依存に入れずに使いたい。

調べて分かったこと。

- `calibrateGridBaseline` は、Chromium が縦書きで `central` の baseline を持たないためのずれ (Chromium のバグ 40403675) を測り、差が 5px を超えると `--{prefix}-grid-baseline-fix: 1` を立てる。立てた値は戻さない。測定は要素から継承したフォントで行う。
- Web Component は、HTML を入れた直後に 1 回だけ補正し、フォントの読み込みは待たない。補正には `variablePrefix` でなく `classPrefix` を渡している。
- html-renderer は parser に依存しない。parser は DOM の型 (tsconfig の lib) を読み込まない。
- 描画の HTML は、ヲコト点の位置と傍点の形をインラインの `style` 属性で出す。

## 利用者の決定 (2026-10-20)

1. 置き場所: mount は html-renderer。`extractXmlFromScriptElement` と `SKAM_XML_MEDIA_TYPE` は skam-xml-parser。Web Component は parser のものを再 export する。
2. mount の入力は `SKAMDocument` だけ。
3. 補正は、描画の直後に 1 回、`document.fonts.ready` の後にもう 1 回。2 回目の完了を Promise で返し、待たなくてもよい。
4. Trusted Types が必須のページには、利用者が policy を渡す形で対応する (レビューの後に足した決定)。

## 決定

- **KD1 置き場所**: mount は `render`、CSS、補正がそろう html-renderer に置き、依存を増やさない。取り出しは SKAM-ML のメディアタイプ (SKAM-ML-draft §3.3) の約束なので、SKAM-ML を扱う parser に置く。Web Component は既に parser に依存している。
- **KD2 入力**: mount は `SKAMDocument` だけを受ける。SKAM-ML の文字列から描く利用者は、先に `parse` を呼ぶ。
- **KD3 補正の時機**: 描画の直後に 1 回、`fonts.ready` の後にもう 1 回。`fonts.ready` は 1 回目の補正の後に読む。1 回目の補正の測定がレイアウトを起こしてフォントの読み込みが始まるので、先に読むと読み込みの始まる前の解決済みの値を受け取りうる。`fonts` は `container.ownerDocument` から取る。`fontsCalibrated` は reject しない。2 回目の補正か `fonts.ready` が失敗したら、`console.warn` を出して解決する。1 回目の補正が誤って変数を立てた場合に 2 回目で戻らないことは、今の `calibrateGridBaseline` の挙動のまま受け入れた。誤って立つ場面は実測していない。
- **KD4 CSS を 1 回だけ入れる判定**: 入れる先 (`container.getRootNode()` が Document ならその `head`、無ければ `documentElement`、ShadowRoot ならその shadow root) に、`data-skam-css` 属性を持ち中身が同じ CSS の `<style>` があれば入れない。判定は DOM だけで行い、モジュールの中に記録を持たない。html-renderer のコピーが 2 つあるページでも重複しない (ADR-033 KD10 と同じ考え方)。古い `<style>` は消さない。
- **KD5 接続されていない要素**: `TypeError` を投げ、DOM を変えない。CSS の入れ先と、補正のためのレイアウトが無いため。オプションの誤りも、DOM を変える前に投げる。
- **KD6 nonce** (利用者の要望でなく、レビューで足した): mount は自分で `<style>` を入れるので、`style-src` に nonce を使う CSP のページのために `nonce` を受ける。既にある `<style>` は、nonce が一致するときだけ使い回す (先に nonce なしで入れて CSP に止められた `<style>` を使い回さないため)。nonce は `<style>` 要素にしか効かず、描画の HTML のインラインの `style` 属性を許すには `style-src-attr` が要る。
- **KD7 Web Component との食い違い**: 描画の経路が mount と Web Component の 2 本になり、補正の時機と prefix の扱いが違う。Web Component の補正に `classPrefix` を渡しているのはバグの可能性がある。今回は揃えず、docs/plans/backlog.md で追う。
- **KD8 実験的な API**: `mount` と `extractXmlFromScriptElement` は `@experimental` で、0.x の minor で変わりうる。`SKAM_XML_MEDIA_TYPE` は仕様で確定した文字列なので安定した API とする。
- **KD9 出題に使うとき**: mount の `readingLayerSource` の既定は `render` と同じ `'readings'` にした。同じオプションで出力が変わると分かりにくいため。そのため mount は、既定では隠した注記も読み層に出す。注記を隠すときは `'display'` を指定するよう README に書いた。
- **KD10 リリース**: changeset は `@kanbun-skam/skam-html-renderer: minor` と `@kanbun-skam/skam-xml-parser: minor` (公開 API の追加)。
- **KD11 Trusted Types** (レビューの後に利用者が足した): `trustedTypesPolicy` を渡すと、mount は `policy.createHTML(html)` の戻り値を `innerHTML` に入れる。`createHTML` は CSS を入れる前に呼び、例外なら DOM を変えずに投げる。policy を渡さずに Trusted Types が必須のページで呼ぶと、代入の時点で `TypeError` になり、そのとき CSS は残る (必須かどうかを事前に確かめる手段が無い)。型は `createHTML(input: string)` を持つ構造の型で、DOM の型定義の版に左右されない。`<style>` の中身と補正は Trusted Types の対象ではない。Chromium で、meta 要素で与えた CSP でも効くことを e2e で確かめた。

## 却下した案

- **README の手順を厚くするだけ**: 2 回求められた関数を出さない。
- **DOM 向けの新しいパッケージ (`@kanbun-skam/skam-dom`) に、取り出し・parse・mount をまとめる**: Web Component との食い違いも構造的に無くせるが、利用者は既存のパッケージに分けて置くことを選んだ。公開パッケージは 6 つで版をそろえており、7 つ目はリリースの手間を増やす。
- **SKAM-ML の文字列も受ける mount**: html-renderer が parser に依存する。
- **async の mount (フォントを待ってから補正)**: 待つ間に表示がずれうる。
- **補正 1 回だけ**: フォントの読み込みの後に測り直さない。
- **モジュールの `WeakMap` で入れた CSS を記録する**: html-renderer のコピーごとに記録が分かれ、`<style>` が重複する。
- **mount だけ既定の `readingLayerSource` を `'display'` にする**: `render` と同じオプションで出力が変わる。
- **mount が自分で Trusted Types の policy を作る**: 「`render` の出力は安全」という判断をライブラリが下すことになり、ページの CSP の `trusted-types` に名前を足させることにもなる。

## 提供しないもの

- 入れた `<style>` を外す手段 (dispose)。オプションが違えば `<style>` が増える。
- Web Component の Trusted Types への対応。

## 残る作業

docs/plans/backlog.md で追う。

- Web Component の描画を mount に寄せるか (補正の時機、`classPrefix` と `variablePrefix`、Trusted Types)。
- インラインの `style` 属性を出さない描画にするか (nonce だけの CSP で表示が崩れる)。

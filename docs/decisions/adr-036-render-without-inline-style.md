---
status: Complete
---

# ADR-036: インラインの style 属性を出さない描画と、Web Component の nonce

この ADR の KD1〜KD7 は、この ADR の中の番号である。

## コンテキスト

描画の HTML は、ヲコト点の位置 (`--okototen-x` などの CSS 変数) と傍点の形 (`text-emphasis-style`) を、インラインの `style` 属性で出していた。出す箇所は `token-renderer.ts` の 2 か所と `render-tree.ts` の 1 か所である。ADR-034 KD6 は、mount が nonce を受けても、これらの属性を許すには `style-src-attr` が要ることを残件にしていた。ADR-035 は、Web Component の shadow root の `<style>` が nonce を持たないことを残件にしていた。

値は決まったクラスの集合では表せない。ヲコト点の格子の大きさは任意の整数で、傍点には任意の 1 字を指定できる。

2026-10-20 に、Chromium (Playwright 1.58.0) で `style-src 'nonce-abc'` の meta のページを使って確かめた。

- インラインの `style` 属性は止められる。色も CSS 変数も効かなかった。
- CSSOM の `el.style.setProperty` は止められない。CSS 変数と `text-emphasis-style` が効いた。

## 利用者の決定 (2026-10-20)

1. 方式: data 属性 + CSSOM。`render` にオプションを足し、mount と Web Component は常にそれを使う。`render` の既定の出力は変えない。data 属性から値を設定する関数を公開する。
2. Web Component の `<style>` の nonce もあわせて扱う。
3. 記録: この ADR を書く。

## 決定

- **KD1 `inlineStyles` オプション**: `RenderOptions` に `inlineStyles` (`@experimental`、既定 `true`) を足した。`false` のとき、HTML に `style` 属性を出さず、ヲコト点に `data-okototen-x` / `-y` / `-cols` / `-rows`、傍点に `data-emphasis-style` を出す。`data-emphasis-style` の値は、CSS の値に変換する前の傍点の指定 (キーワードか字) である。属性の名前と、対応する CSS のプロパティの名前は `style-data.ts` の 1 か所で定め、`classPrefix` に依らない。
- **KD2 `applyRenderedStyles`**: `applyRenderedStyles(root)` (`@experimental`) は、`root` の子孫の data 属性を読み、CSSOM で値を設定する。ヲコト点の値は 0 以上の安全な整数のときだけ設定し、属性ごとに独立して扱う。傍点は `toCssEmphasisValue` を通すので、キーワードか、1 字目のコードポイントの表記にしかならない。`setProperty` は 1 つのプロパティの値しか受けないので、`;` で別のプロパティを足すことはできない。同じ root に何度呼んでも結果は同じである。
- **KD3 既定を変えない**: `render` の既定は `style` 属性のままにした。`render` の文字列をそのまま使う利用者は、関数を呼ばないとヲコト点と傍点が崩れる。VRT の基準画像も既定の出力で撮っている。既定を `false` に反転するのは、`applyRenderedStyles` の `@experimental` を外す時か、次の破壊的なリリースの時に検討する。
- **KD4 mount**: mount は常に `inlineStyles: false` で描き (利用者のオプションの後に置いて上書きする)、`innerHTML` に入れた直後、1 回目の補正の前に `applyRenderedStyles` を呼ぶ。`MountOptions` は `inlineStyles` を受けない。`MountResult.html` と、Trusted Types の `createHTML` に渡る文字列は data 属性の版になる。この HTML を別の場所に入れるときは `applyRenderedStyles` が要る。
- **KD5 Web Component の nonce の読み方**: 描画のたびに、要素の `nonce` の IDL 属性を読む。IDL 属性が無い環境 (happy-dom) では内容属性を読む。`nonce` を observedAttributes に入れない。CSP をヘッダで送るページでは、ブラウザが内容属性を空にして隠し、そのたびに再描画が走るためである。nonce は接続の前に書く前提で、接続した後に変えても、それだけでは描き直さない。
- **KD6 Web Component の nonce の付け方**: nonce が空でなければ、mount に渡し、shadow root の 3 つの `<style>` (フォント、変数の上書き、エラー) に `setAttribute` で付け、その後で中身を入れる。CSP は `<style>` の中身が入るときに nonce を見るので、constructor で中身を入れているエラーの `<style>` は、nonce を付けた後に入れ直す。`auto-font` の Google Fonts の `<link>` は、新しく入れるときだけ nonce を付ける。
- **KD7 nonce の扱いの注意**: nonce はリクエストごとに変える値で、固定の値は CSP の保護にならない。同じオリジンのスクリプトは、もともと `el.nonce` で nonce を読める。Web Component が shadow root の `<style>` に nonce を付けても、読める範囲は広がらない。

## 却下した案

- **README に `style-src-attr 'unsafe-inline'` を書くだけ**: ページの他の部分のインラインの `style` 属性まで許すことになる。
- **文書ごとの CSS ルール**: `render` の CSS に、使った値ごとのルール (`[data-okototen-x="3"]` など) を足す案。JS なしで効くが、CSS が文書ごとに変わり、mount が `head` に入れる `<style>` が文書ごとに増える。mount は古い `<style>` を消さない (ADR-034 KD4)。
- **`render` の既定を変える**: KD3 のとおり、`render` の文字列の利用者と VRT に響く。
- **型つきの CSS `attr()` で data 属性を読む**: Chromium 133 以降だけで、Firefox と Safari は対応していない。
- **nonce を observedAttributes に入れる**: KD5 のとおり、nonce を隠すたびに再描画が走る。

## 確かめた範囲

- CSP の挙動は Chromium だけで確かめた。Firefox と Safari では確かめていない (CSSOM が CSP に止められないのは仕様上の性質)。
- Web Component の CSP の e2e は、手元の WSL の headless Chromium が `requestAnimationFrame` を呼ばないので、CI の Playground E2E で確かめる。

## 提供しないもの

- 接続した後の nonce の変更に追従すること (KD5)。

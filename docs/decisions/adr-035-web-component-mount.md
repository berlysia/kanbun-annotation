---
status: Complete
---

# ADR-035: Web Component の描画を mount に寄せる

この ADR の KD1〜KD9 は、この ADR の中の番号である。

## コンテキスト

ADR-034 で light DOM 向けの `mount()` を足した後も、`<skam-renderer>` は別の経路で描いていた (ADR-034 KD7、KD11)。

- Web Component は、HTML を入れた直後に 1 回だけ補正し、フォントの読み込みを待たない。mount は直後とフォントの読み込みの後の 2 回補正する (ADR-034 KD3)。
- Web Component は `innerHTML` に文字列を入れるので、Trusted Types が必須のページでは描けない。ADR-034 は、これを「提供しないもの」にしていた。
- `class-prefix` を既定以外にすると、補正、ホストからの変数の上書き、auto-font が効かない。`render` の CSS は `variablePrefix` の既定の `skam` で `--skam-*` の変数を宣言する。一方で Web Component は `--{class-prefix}-*` を設定していた。2026-10-20 に、`render(doc, { classPrefix: 'foo' })` の CSS で `--foo-` が 0 か所、`--skam-` が 84 か所であることを確かめた。CSS が `--skam-*` を宣言するのは `:where(.{prefix}-document)` だけで、ホストに `--skam-*` を置いても文書の要素の宣言に負ける。

## 利用者の決定 (2026-10-20)

1. 寄せ方: Web Component が mount を呼ぶ。mount の API は変えない。
2. 変数名: Web Component は `class-prefix` を `variablePrefix` にも渡し、変数を `--{class-prefix}-*` に揃える。
3. Trusted Types: 要素に `trustedTypesPolicy` プロパティを足す。
4. 記録: この ADR を書く。
5. (実装中に追加) parser にも policy を渡す。Web Component は同じ policy を parse と mount に渡す。

5 つ目は、1〜4 を実装した後に分かった事実による。ブラウザ版の parser は `DOMParser.parseFromString` を使い、Trusted Types はこれにも TrustedHTML を求める。Chromium で、policy を渡した `<skam-renderer>` が parse で止まることを確かめた。ADR-034 の mount の e2e は parse 済みの文書を渡していたので、この経路を通らず、見落としていた。light DOM の利用者も、ブラウザで parse すれば同じところで止まっていた。

## 決定

- **KD1 描画の経路**: `<skam-renderer>` は `parse` の後に `mount(#content, doc, options)` を呼ぶ。`render` と `calibrateGridBaseline` を直接呼ばない。補正の時機は mount と同じ 2 回になる。`fontsCalibrated` は待たず、`skam-render` は 1 回目の補正の後に出す。
- **KD2 古い `<style>` を消す責任**: shadow root の `style[data-skam-css]` は、すべてその要素のものとして扱う。描画のたびに、どの経路でもまずすべて消し、mount に今の CSS の `<style>` を 1 つ入れさせる。消すのと入れるのは同じタスクの中で行う。mount は古い `<style>` を消さない (ADR-034 KD4)。light DOM の `head` の `<style>` は他の container と共有するので、mount が消すと他の container が崩れる。shadow root は要素ごとに閉じているので、Web Component が消しても他に響かない。経路ごとの `style[data-skam-css]` の数は次のとおり。

  | 経路                               | 数                                  |
  | ---------------------------------- | ----------------------------------- |
  | 描けた                             | 1                                   |
  | 隠す属性が不正 (blocked)           | 0                                   |
  | 内容が空                           | 0                                   |
  | parse か検証の誤り                 | 0                                   |
  | `createHTML` が投げた              | 0                                   |
  | policy が無く Trusted Types が必須 | 0 (ブラウザ版の parse が先に投げる) |

  mount 自身は、CSS を入れた後の `innerHTML` で投げうる (ADR-034 KD11)。Web Component は必ず parse を先に通るので、policy が無ければ parse で止まり、その経路には来ない。

- **KD3 マーカーの属性名**: `data-skam-css` は、mount と Web Component の両方が持つ文字列である。変えるときは両方を直す。Web Component のテストが「描けたら 1 つ」を確かめるので、片方だけ変えると落ちる。
- **KD4 `<style>` の並び順**: mount の `<style>` は shadow root の末尾に入り、Web Component の変数の上書き (`#main-css`) より後になる。描画の CSS が変数を宣言する `:where(.{prefix}-document)` の詳細度は 0,0,0 で、上書きは `.{prefix}-document` (0,1,0) と `:host` にある。結果は詳細度で決まり、並び順に依らない。Chromium の e2e で、ホストの `--skam-color-kaeriten` と `--foo-color-kaeriten` が返り点の色に効くことを確かめる。
- **KD5 変数の prefix**: `class-prefix` が有効な値なら、`classPrefix` と `variablePrefix` に同じ値を渡す。2 つの検証は同じ正規表現を使う。`class-prefix` を指定しないときの出力は変わらない。以前は `class-prefix` を指定するとどちらの変数名も効かなかったので、この変更で効かなくなる指定は無い。
- **KD6 接続前は描かない**: mount は接続されていない container で `TypeError` を投げる (ADR-034 KD5)。`#performRender` は、接続されていなければ先頭で何もせずに返る。`connectedCallback` が描画を予約するので、接続した後に描かれる。互換より経路の一本化を優先した。以前は接続前でも shadow root に描いていたが、表示は接続した後にしか見えない。
- **KD7 Trusted Types (Web Component)**: `trustedTypesPolicy` (`@experimental`) は JS のプロパティだけで、parse と mount にそのまま渡す。`createHTML` は 1 回の描画につき、元の XML、描画の HTML の順で 2 回呼ばれる。`null` は指定なしとして扱い、同じ参照の再代入は描き直さない (`accessibleLabels` と同じ)。`createHTML` が投げた例外は致命的エラー (`skam-error`、`recoverable: false`) になり、そのメッセージが alert と `error.message` に出る。policy は Trusted Types の強制を満たすためのもので、何を検査するかは利用者の責任である。描画の HTML の安全性は `render` のエスケープに依る。HTML を文字列で入れる処理は mount の中だけにし、内容を空にする処理は `replaceChildren()` にした。parse から描画までの経路に、ほかの Trusted Types の対象 (`insertAdjacentHTML`、`createContextualFragment`、`srcdoc`、`outerHTML`) は無い。
- **KD9 Trusted Types (parser)**: `ParseOptions` に `trustedTypesPolicy` (`@experimental`) を足した。parser の公開 API の拡張である。ブラウザ版は、入力の長さと深さの検査の後に `createHTML(xml)` を 1 回呼び、その戻り値を `parseFromString` に渡す。例外は包まずに投げる。入力の上限と位置は元の文字列で計算するので、`createHTML` は XML をそのまま返す必要がある。XML を書き換える policy (HTML 用のサニタイザ) では、上限が書き換えた後の文字列に効かず、位置がずれ、文書が壊れうる。`application/xml` で読む文書ではスクリプトは動かないので、素通しの policy で足りる。Node 版は xmldom で読むので、policy を呼ばない。SSR では policy の副作用 (記録など) は起きない。
- **KD8 フォントの後の補正の重なり**: フォントの読み込みの前に描き直すと、前回の `fontsCalibrated` が今の内容を補正する。`class-prefix` を変えた直後なら、前の prefix の補正の変数を立てうる。CSS はその変数を読まないので、表示は変わらない。この重なりは許す。

## 却下した案

- **経路を分けたまま、補正と prefix だけ揃える (差分最小案)**: 経路が 2 本のまま残る。今回のずれは 2 本の経路から生じた。
- **mount に「CSS を入れない」オプションを足す**: mount は `@experimental` だが利用者が使い始めており、Web Component の数行で済むことのために公開面を増やさない。
- **mount が古い `<style>` を消す**: light DOM の `head` で共有する `<style>` を消すと、他の container が崩れる (KD2)。
- **変数を常に `--skam-*` にする**: Web Component の README は `--{class-prefix}-font-family` と書いていた。
- **`variable-prefix` 属性を足す**: `class-prefix` と食い違う指定ができ、今回のバグと同じ形を利用者に開く。
- **html-renderer で `variablePrefix` を `classPrefix` から導く**: `render` の既定の出力が変わり、light DOM の利用者の CSS に響く。
- **接続前の描画を `skam-error` にする**: `createElement` → プロパティの設定 → append という正常な使い方が誤りとして通知される。
- **接続前だけ今の経路で描く**: 経路が 2 本に戻る。
- **parse 用の policy を別のプロパティで受ける**: Web Component の公開面が増え、片方だけ渡し忘れると parse か描画の一方だけが止まる。HTML 用のサニタイザを使いたい利用者は、`createHTML` の中で入力が SKAM-ML か描画の HTML かを見分けられる。
- **`createHTML` に、どこで使うかを第 2 引数で渡す**: policy の呼び出しの形を、このライブラリの約束として固定することになる。必要な利用者が出たら足す。
- **parser が自分で素通しの policy を作る**: ADR-034 で mount について却下したのと同じく、「入力は安全」という判断をライブラリが下すことになり、利用者に CSP の `trusted-types` へ名前を足させる。

## 提供しないもの

- Web Component の `<style>` の nonce。shadow root の `<style>` に nonce が無いので、nonce だけの `style-src` では止められる。docs/plans/backlog.md で追う。
- フォントの読み込みの後の補正の完了を知らせるイベント。
- `customElements.define` より前にインスタンスへ代入した `trustedTypesPolicy` と `accessibleLabels` の取り込み (own property になり setter を通らない)。README に define の後に代入するよう書いた。

## 結果

- `class-prefix` を指定すると、変数名が `--{class-prefix}-*` になる。changeset に書いた。
- 接続前の shadow root に本文が入らなくなった。changeset に書いた。

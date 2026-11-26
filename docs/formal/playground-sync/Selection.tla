---- MODULE Selection ----
\* Playground の選択状態の寿命: 選択パネル (currentSelection*)、プレビューの強調 (skam-selected)、
\* SP の 2 タップ範囲選択 (touchRangeState) と、それらを動かす操作。
\*
\* 実装との対応 (packages/playground/src/main.ts):
\*   sel / selGen   = currentSelectionRange (:170) の有無とそれを作った経路 ("none" / "pc" / "touch")、作ったときの文書の世代
\*   hl             = プレビュー上の .skam-selected (setSelectionClasses :22)
\*   docGen         = 表示している文書の世代。loadDocumentText (:2089) で進む (サンプル :2073、ファイル選択 :2348、ドロップ :2380)
\*   touch/touchGen = touchRangeState と touchFirstTokenId (:303-304)、その ID を取ったときの文書の世代
\*   renderer       = HTML / Canvas (getRendererMode)
\*   compact        = isCompactLayout() (:2727)
\*
\* token ID は無注記の字に t1, t2 ... と順に振られる (skam-xml-parser parser-core.ts:800) ので、
\* 別の文書でも同じ ID や同じ位置が存在しうる。存在するかどうかは非決定的に選ぶ。
\*
\* フラグ (formal.json の契約はすべて TRUE、壊したモデルは 1 つだけ FALSE):
\*   ResetOnLoad   : 文書を読み込んだら選択と 2 タップ状態を捨てる (loadDocumentText :2089)
\*   KeepHighlight : HTML で描き直すたびに選択の強調も描き直す (renderDocument :1963)
\*   ResetTouch    : 選択を消す経路すべて (clearSelectionPanel :1695) と画面幅の変化 (:2733) で 2 タップ状態を idle に戻す
\* FALSE の組は 2026-11-26 の修正前の実装を表す。反例は ledger.md にある。
EXTENDS Naturals
CONSTANTS MaxGen, ResetOnLoad, KeepHighlight, ResetTouch

VARIABLES docGen, sel, selGen, hl, touch, touchGen, renderer, compact
vars == <<docGen, sel, selGen, hl, touch, touchGen, renderer, compact>>

Init == /\ docGen = 0
        /\ sel = "none" /\ selGen = 0 /\ hl = FALSE
        /\ touch = "idle" /\ touchGen = 0
        /\ renderer = "html"
        /\ compact \in BOOLEAN

\* clearSelectionPanel + clearSelection (:29) のうち選択パネルと強調の部分
ClearPanel == sel' = "none" /\ hl' = FALSE /\ UNCHANGED selGen

\* 選択を消したときの 2 タップ状態
TouchAfterClear == IF ResetTouch THEN touch' = "idle" /\ UNCHANGED touchGen
                                 ELSE UNCHANGED <<touch, touchGen>>

ClearSel == ClearPanel /\ TouchAfterClear

\* updateSelectionPanel (:712) + setSelectionClasses: いまの文書の上に選択を作る
\* kind はパネルの選択を作った経路: "pc" (クリック / ドラッグ) か "touch" (2 タップ)
SetSel(kind) == sel' = kind /\ selGen' = docGen /\ hl' = TRUE

\* parseAndRender (:2000) の選択の復元: 位置 (index) が新しい文書にあれば同じ位置を選び直す。
\* 復元は位置だけを見るので、selGen (どの文書で作った選択か) は変わらない。
\* 2 タップ状態は呼び出し側が決める。cleared は選択が消えたかどうか
RestorePanel(cleared) == IF renderer = "canvas" \/ sel = "none"
                           THEN ClearPanel /\ cleared
                           ELSE \/ (UNCHANGED <<sel, selGen>> /\ hl' = TRUE /\ ~cleared)
                                \/ (ClearPanel /\ cleared)

RestoreOrClear == \/ RestorePanel(TRUE) /\ TouchAfterClear
                  \/ RestorePanel(FALSE) /\ UNCHANGED <<touch, touchGen>>

\* --- PC: クリック / ドラッグ / Shift+クリック (renderDocument の onTokenClick 以下 :1969) ---
PcSelect == /\ ~compact /\ renderer = "html"
            /\ SetSel("pc")
            /\ UNCHANGED <<docGen, touch, touchGen, renderer, compact>>

PcEmptyClick == /\ ~compact /\ renderer = "html"
                /\ ClearSel
                /\ UNCHANGED <<docGen, renderer, compact>>

\* --- SP: 2 タップ範囲選択 handleTouchTokenTap (:2897) ---
TapToken == /\ compact /\ renderer = "html"
            /\ \/ /\ touch \in {"idle", "range"}
                  /\ touch' = "first" /\ touchGen' = docGen
                  /\ SetSel("touch")
               \/ /\ touch = "first"
                  /\ UNCHANGED touchGen
                  \* updateSelectionPanel(touchFirstTokenId, tokenId): 1 つ目の ID が今の文書になければパネルを消す
                  /\ \/ SetSel("touch") /\ touch' = "range"
                     \/ ClearPanel /\ touch' = IF ResetTouch THEN "idle" ELSE "range"
            /\ UNCHANGED <<docGen, renderer, compact>>

\* handleTouchEmptyTap (:2939) と bottom sheet の背景タップ
TapEmpty == /\ compact /\ renderer = "html"
            /\ ClearPanel /\ touch' = "idle" /\ UNCHANGED touchGen
            /\ UNCHANGED <<docGen, renderer, compact>>

\* タブ切り替え (:2799): preview なら parseAndRender、そのあと 2 タップ状態を idle に戻す
TabSwitch == /\ compact
             /\ (RestorePanel(TRUE) \/ RestorePanel(FALSE))
             /\ touch' = "idle" /\ UNCHANGED touchGen
             /\ UNCHANGED <<docGen, renderer, compact>>

\* 画面幅の変化 (回転など)。isCompactLayout() は呼ぶたびに matchMedia を見る
Resize == /\ compact' = ~compact
          /\ IF ResetTouch THEN touch' = "idle" ELSE UNCHANGED touch
          /\ UNCHANGED <<docGen, sel, selGen, hl, touchGen, renderer>>

\* --- 文書の読み込み: サンプル / ファイル選択 / ドロップ ---
Load == /\ docGen < MaxGen
        /\ docGen' = docGen + 1
        /\ IF ResetOnLoad
             THEN ClearPanel /\ touch' = "idle" /\ UNCHANGED touchGen
             ELSE RestoreOrClear
        /\ UNCHANGED <<renderer, compact>>

\* --- テキスト編集で token 数が変わる / parse 失敗 / 空 (PC のエディタ。parseAndRender と clearDocumentView :2062) ---
EditClears == /\ ~compact
              /\ ClearSel
              /\ UNCHANGED <<docGen, renderer, compact>>

\* --- GUI 操作: commitDocument (:2140) → parseAndRender。token は変わらないので位置は残る ---
GuiOp == /\ sel # "none"
         /\ IF renderer = "canvas"
              THEN ClearSel
              ELSE UNCHANGED <<sel, selGen, touch, touchGen>> /\ hl' = TRUE
         /\ UNCHANGED <<docGen, renderer, compact>>

\* --- 表示設定の変更: 書字方向・ルビ方式・inline・字間・プロファイル (:2512-2560) → renderDocument のみ ---
SettingRerender == /\ hl' = IF KeepHighlight THEN (sel # "none" /\ renderer = "html") ELSE FALSE
                   /\ UNCHANGED <<docGen, sel, selGen, touch, touchGen, renderer, compact>>

\* --- 描画方式の切り替え (:2492) → renderDocument のみ。選択の状態は残る ---
\* Canvas では選択パネルを CSS で隠す (styles.css:501-503) ので、性質 4 は HTML 描画のときだけを見る
SwitchRenderer == /\ renderer' = IF renderer = "html" THEN "canvas" ELSE "html"
                  /\ hl' = (KeepHighlight /\ sel # "none" /\ renderer' = "html")
                  /\ UNCHANGED <<docGen, sel, selGen, touch, touchGen, compact>>

Next == \/ PcSelect \/ PcEmptyClick \/ TapToken \/ TapEmpty \/ TabSwitch \/ Resize
        \/ Load \/ EditClears \/ GuiOp \/ SettingRerender \/ SwitchRenderer

Spec == Init /\ [][Next]_vars

\* 性質 3: 選択パネルが示す選択は、いま表示している文書の上で作ったものである
SelBelongsToDoc == sel # "none" => selGen = docGen

\* 性質 4: HTML 描画で選択パネルが「選択あり」なら、プレビューにもその選択が強調されている
SelVisible == (sel # "none" /\ renderer = "html") => hl

\* 性質 5: 2 タップの 1 つ目を待っている間、その 1 つ目はいまの文書の字で、パネルにもその字が出ている
TouchAnchorFresh == touch = "first" => (touchGen = docGen /\ sel = "touch")
====

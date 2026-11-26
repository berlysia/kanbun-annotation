---- MODULE EditSync ----
\* Playground の編集同期ループ: XML テキスト (xmlEditor) と currentDocument と debounce タイマー。
\* テキストの中身は「含まれる編集 id の集合」に抽象化する。stringify / parse は恒等写像として扱う。
\*
\* 実装との対応 (packages/playground/src):
\*   text   = xmlEditor.getValue()                        editor/xml-editor.ts:217
\*   doc    = currentDocument                             main.ts:166
\*   armed  = xmlEditor.hasPendingChange() (timer が非 null) editor/xml-editor.ts:174-199
\*   intent = 利用者の操作から期待されるテキスト (観測用のゴースト変数。実装にはない)
\*
\* フラグ (formal.json の契約はすべて TRUE、壊したモデルは 1 つだけ FALSE):
\*   FlushOnOp   : 選択パネルの操作の前に保留中の入力を parse する (flushEditorBeforePanelAction main.ts:2828)
\*   SilentCommit: GUI 操作と読み込みの結果をタイマーを張らずに即時 parse する (commitDocument :2142、loadDocumentText :2091)
\*   EmptyClears : 空テキストの parse で文書を null にする (parseAndRender :2002 → clearDocumentView :2064)
\* FALSE の組は 2026-11-26 の修正前の実装を表す。反例は ledger.md にある。
EXTENDS FiniteSets
CONSTANTS UserEdits, GuiOps, FlushOnOp, SilentCommit, EmptyClears
\* テキストが XML として壊れている / 空、文書がない、を表すモデル値 (集合と比較できるよう model value にする)
CONSTANTS INVALID, EMPTY, NULL

VARIABLES text, doc, armed, intent
vars == <<text, doc, armed, intent>>

Parse(t) == IF t \in {INVALID, EMPTY} THEN NULL ELSE t

\* parseAndRender
ParseNow == doc' = IF text = EMPTY /\ ~EmptyClears THEN doc ELSE Parse(text)

Init == /\ text = {}
        /\ doc = {}
        /\ armed = FALSE
        /\ intent = {}

\* --- 利用者がテキストを直接編集する (textarea の input → notifyChange) ---
UserAction(newText) == /\ text' = newText
                       /\ intent' = newText
                       /\ armed' = TRUE
                       /\ UNCHANGED doc

UserType(e) == /\ e \notin (IF Parse(text) = NULL THEN {} ELSE text)
               /\ UserAction(IF Parse(text) = NULL THEN {e} ELSE text \cup {e})
UserBreak == text # INVALID /\ UserAction(INVALID)
UserClear == text # EMPTY /\ UserAction(EMPTY)

\* --- debounce 満了 (xml-editor.ts:176-179 → main.ts:2406) ---
TimerFire == /\ armed
             /\ armed' = FALSE
             /\ ParseNow
             /\ UNCHANGED <<text, intent>>

\* --- 解析ボタン / Ctrl+Enter (main.ts:2343, 2411)。タイマーは残る ---
ManualParse == /\ ParseNow
               /\ UNCHANGED <<text, armed, intent>>

\* --- 文書の読み込み (サンプル / ファイル): テキストを置き換えてから即時 parse ---
LoadSample == /\ text' = {}
              /\ intent' = {}
              /\ doc' = {}
              /\ armed' = ~SilentCommit

\* --- GUI 操作 (handle*Toggle / handleKanaApply など 11 箇所 → commitDocument) ---
\* 利用者の期待: いま見えているテキストに操作 g を足したもの。テキストが壊れていれば何も変わらないこと。
ExpectedAfterOp(g) == IF Parse(text) = NULL THEN intent ELSE Parse(text) \cup {g}

Base == IF FlushOnOp /\ armed THEN Parse(text) ELSE doc

GuiOp(g) == /\ Base # NULL
            /\ g \notin Base
            /\ text' = Base \cup {g}
            /\ intent' = ExpectedAfterOp(g)
            /\ IF SilentCommit
                 THEN armed' = FALSE /\ doc' = Base \cup {g}
                 ELSE armed' = TRUE /\ UNCHANGED doc

\* flush した結果が parse できなければ文書は null になり、handler の guard (`if (!currentDocument ...) return`) で何もしない
GuiOpRefused == /\ FlushOnOp
                /\ armed
                /\ Parse(text) = NULL
                /\ armed' = FALSE
                /\ doc' = NULL
                /\ UNCHANGED <<text, intent>>

Next == \/ \E e \in UserEdits : UserType(e)
        \/ UserBreak
        \/ UserClear
        \/ TimerFire
        \/ ManualParse
        \/ LoadSample
        \/ \E g \in GuiOps : GuiOp(g)
        \/ GuiOpRefused

Spec == Init /\ [][Next]_vars

\* 性質 1: GUI 操作が、利用者の書いたテキストやまだ反映していない操作を消さない
NoLostEdit == text = intent

\* 性質 2: タイマーが止まっているとき、文書はテキストを parse した結果と一致する
DocReflectsText == ~armed => doc = Parse(text)
====

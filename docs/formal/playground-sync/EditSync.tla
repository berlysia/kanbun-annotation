---- MODULE EditSync ----
\* Playground の編集同期ループ: XML テキスト (xmlEditor) と currentDocument と debounce タイマー。
\* テキストの中身は「含まれる編集 id の集合」に抽象化する。stringify / parse は恒等写像として扱う。
\*
\* 実装との対応 (packages/playground/src):
\*   text   = xmlEditor.getValue()                        editor/xml-editor.ts:220
\*   doc    = currentDocument                             main.ts:168
\*   armed  = xmlEditor.hasPendingChange() (timer が非 null) editor/xml-editor.ts:177-215
\*   intent = 利用者の操作から期待されるテキスト (観測用のゴースト変数。実装にはない)
\*   format = currentInputFormat ("xml" か "notation")     main.ts:169
\*   stash  = 表に出ていない形式の本文 inputDrafts[他方].text main.ts:170
\*   stashIntent = 表に出ていない形式の本文に利用者が期待する中身 (ゴースト変数)
\* 2 つの形式の本文は同じ抽象 (編集 id の集合) で表し、parse も同じ Parse で表す。
\*
\* フラグ (formal.json の契約はすべて TRUE、壊したモデルは 1 つだけ FALSE):
\*   FlushOnOp   : 選択パネルの操作の前に保留中の入力を parse する (flushEditorBeforePanelAction main.ts:2896)
\*   SilentCommit: GUI 操作と読み込みの結果をタイマーを張らずに即時 parse する (commitDocument :2202、loadDocumentText :2149)
\*   EmptyClears : 空テキストの parse で文書を null にする (parseAndRender :2031 → clearDocumentView :2081)
\*   KeepDraft   : 形式を切り替えるとき、今の本文を表に出ていない側へ保存する (switchInputFormat :2134)
\* FlushOnOp、SilentCommit、EmptyClears の FALSE の組は 2026-11-26 の修正前の実装を表す。反例は ledger.md にある。
EXTENDS FiniteSets
CONSTANTS UserEdits, GuiOps, FlushOnOp, SilentCommit, EmptyClears, KeepDraft
\* テキストが XML として壊れている / 空、文書がない、を表すモデル値 (集合と比較できるよう model value にする)
CONSTANTS INVALID, EMPTY, NULL

VARIABLES text, doc, armed, intent, format, stash, stashIntent
vars == <<text, doc, armed, intent, format, stash, stashIntent>>

Parse(t) == IF t \in {INVALID, EMPTY} THEN NULL ELSE t

\* parseAndRender
ParseNow == doc' = IF text = EMPTY /\ ~EmptyClears THEN doc ELSE Parse(text)

Init == /\ text = {}
        /\ doc = {}
        /\ armed = FALSE
        /\ intent = {}
        /\ format = "xml"
        /\ stash = {}
        /\ stashIntent = {}

\* 表に出ている本文だけを変える遷移は、形式と表に出ていない側の本文を変えない
Front == UNCHANGED <<format, stash, stashIntent>>

\* --- 利用者がテキストを直接編集する (textarea の input → notifyChange) ---
UserAction(newText) == /\ text' = newText
                       /\ intent' = newText
                       /\ armed' = TRUE
                       /\ UNCHANGED doc
                       /\ Front

UserType(e) == /\ e \notin (IF Parse(text) = NULL THEN {} ELSE text)
               /\ UserAction(IF Parse(text) = NULL THEN {e} ELSE text \cup {e})
UserBreak == text # INVALID /\ UserAction(INVALID)
UserClear == text # EMPTY /\ UserAction(EMPTY)

\* --- debounce 満了 (xml-editor.ts:177-185 → main.ts:2473) ---
TimerFire == /\ armed
             /\ armed' = FALSE
             /\ ParseNow
             /\ UNCHANGED <<text, intent>>
             /\ Front

\* --- 解析ボタン / Ctrl+Enter (main.ts:2404, 2479)。タイマーは残る ---
ManualParse == /\ ParseNow
               /\ UNCHANGED <<text, armed, intent>>
               /\ Front

\* --- 文書の読み込み (サンプル / ファイル): 今の形式の本文を置き換えてから即時 parse ---
LoadSample == /\ text' = {}
              /\ intent' = {}
              /\ doc' = {}
              /\ armed' = ~SilentCommit
              /\ Front

\* --- 形式の切り替え (switchInputFormat main.ts:2134) ---
\* 保留中の入力を反映し (flushPendingChange)、今の本文を表に出ていない側へ保存し、
\* 表に出ていなかった本文をエディタに入れて即時 parse する (loadDocumentText :2149)。
\* 選択は loadDocumentText が捨てる。Selection.tla では Load と同じ遷移にあたる。
SwitchFormat == /\ format' = IF format = "xml" THEN "notation" ELSE "xml"
                /\ stash' = IF KeepDraft THEN text ELSE {}
                /\ stashIntent' = intent
                /\ text' = stash
                /\ intent' = stashIntent
                /\ doc' = IF SilentCommit THEN Parse(stash) ELSE doc
                /\ armed' = ~SilentCommit

\* --- 記法の間に XML のファイルの読み込みが終わる (loadXmlFile main.ts:2412) ---
\* 読んだ本文は表に出ていない XML の本文だけに入れ、エディタは変えない。
FileLoadedAway == /\ format = "notation"
                  /\ stash' = {}
                  /\ stashIntent' = {}
                  /\ UNCHANGED <<text, doc, armed, intent, format>>

\* --- GUI 操作 (handle*Toggle / handleKanaApply など 11 箇所 → commitDocument) ---
\* 利用者の期待: いま見えているテキストに操作 g を足したもの。テキストが壊れていれば何も変わらないこと。
ExpectedAfterOp(g) == IF Parse(text) = NULL THEN intent ELSE Parse(text) \cup {g}

Base == IF FlushOnOp /\ armed THEN Parse(text) ELSE doc

\* 記法の間は GUI の編集ボタンが無効で、commitDocument (:2202) も何もしない
GuiOp(g) == /\ format = "xml"
            /\ Base # NULL
            /\ g \notin Base
            /\ text' = Base \cup {g}
            /\ intent' = ExpectedAfterOp(g)
            /\ IF SilentCommit
                 THEN armed' = FALSE /\ doc' = Base \cup {g}
                 ELSE armed' = TRUE /\ UNCHANGED doc
            /\ Front

\* flush した結果が parse できなければ文書は null になり、handler の guard (`if (!currentDocument ...) return`) で何もしない
GuiOpRefused == /\ format = "xml"
                /\ FlushOnOp
                /\ armed
                /\ Parse(text) = NULL
                /\ armed' = FALSE
                /\ doc' = NULL
                /\ UNCHANGED <<text, intent>>
                /\ Front

Next == \/ \E e \in UserEdits : UserType(e)
        \/ UserBreak
        \/ UserClear
        \/ TimerFire
        \/ ManualParse
        \/ LoadSample
        \/ \E g \in GuiOps : GuiOp(g)
        \/ GuiOpRefused
        \/ SwitchFormat
        \/ FileLoadedAway

Spec == Init /\ [][Next]_vars

\* 性質 1: GUI 操作が、利用者の書いたテキストやまだ反映していない操作を消さない
NoLostEdit == text = intent

\* 性質 2: タイマーが止まっているとき、文書はテキストを parse した結果と一致する
DocReflectsText == ~armed => doc = Parse(text)

\* 性質 3: 形式を切り替えても、表に出ていない形式の本文が利用者の書いた中身のまま残る
NoLostDraft == stash = stashIntent
====

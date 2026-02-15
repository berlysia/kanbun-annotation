# Canvas Renderer 再設計計画の論理検証結果

## 検証日時

2026-02-09

## 検証対象

Canvas Renderer の内部モデルを HTML Renderer の設計から学んで再設計する 4 フェーズ計画

---

## 各 Phase の論理的整合性検証

### Phase 0: 共有ユーティリティの抽出

**計画内容**: 両レンダラーで重複する ~280 行を `@kanbun/skam/rendering` サブパスに集約

#### 🚨 **重大な問題点 1: 実際の重複コードの所在と範囲が未確認**

**問題**:

- 計画では「~280 行」と述べているが、実際の重複範囲を検証していない
- HTML renderer の `renderer.ts` は 1552 行あり、以下の関数が export されている:
  - `convertKaeriToUnicode` - Canvas では `helpers.ts` で定義（完全一致）
  - `resolveEmphasisCharacter` - Canvas では `helpers.ts` で定義（完全一致）
  - `formatRefIndex` - Canvas では `helpers.ts` で定義（完全一致）
  - `resolveRefValues` - Canvas では `helpers.ts` で定義（完全一致）
  - `getTatetenGroups` - Canvas では `render-tree.ts` で **別の実装**（HTML は Mark ベース、Canvas は RenderTree 構築の一部）
  - `getRangeMarkGroups` - Canvas では `render-tree.ts` で **別の実装**
  - `getHighlightGroups` - Canvas では `render-tree.ts` で **別の実装**
  - `getMarksForToken` - Canvas では `render-tree.ts` で **別の実装**
  - `groupTokensByBlock` - Canvas では使用していない

**証拠不足**:

1. **どの関数を抽出するか**が具体的に列挙されていない
2. Canvas と HTML で「完全に同一」のコードと「似ているが異なる」コードの区別が曖昧
3. 定数群（`KAERI_UNICODE` 等）の抽出は明記されているが、両 renderer で既に `constants.ts` として分離されている

**実際の状況**:

- Canvas: `helpers.ts` に `convertKaeriToUnicode`, `resolveEmphasisCharacter`, `splitKaeriForTateten`, `formatRefIndex`, `resolveRefValues` を定義
- HTML: `renderer.ts` に同名の関数を定義（1552 行の巨大ファイル）
- 定数: Canvas `constants.ts` (99 行)、HTML は `renderer.ts` 内に定義されている可能性

**推論**:

- 純粋なユーティリティ関数（convertKaeriToUnicode, formatRefIndex, resolveRefValues 等）は抽出可能
- グルーピング関数（getTatetenGroups 等）は両 renderer で **実装が異なる** ため、抽出不可または大幅な設計変更が必要

#### 🚨 **重大な問題点 2: tsup + package.json exports での monorepo 内依存解決**

**問題**:

- `@kanbun/skam/rendering` サブパスエクスポートは現在存在しない（`@kanbun/skam` は `"."` のみ export）
- tsup.config.ts は単一エントリ `src/index.ts` のみをビルド
- サブパスエクスポートを追加する場合、以下が必要:
  1. tsup の複数エントリ対応（`entry: { index: 'src/index.ts', rendering: 'src/rendering/index.ts' }`）
  2. package.json exports に `"./rendering": { "import": "./dist/rendering.js", "types": "./dist/rendering.d.ts" }` 追加
  3. monorepo 内での依存解決（pnpm workspace protocol 使用時、型定義の解決が正しく動くか）

**証拠不足**:

- 計画書に「tsup.config.ts に新エントリ追加」とあるが、**具体的な設定内容が示されていない**
- monorepo 内での循環依存リスク（`@kanbun/skam` ← `@kanbun/skam-html-renderer` → `@kanbun/skam/rendering`）が検討されていない

**推奨される検証**:

1. tsup での複数エントリビルド設定を事前にテスト
2. pnpm workspace での型解決を確認（`tsc --noEmit` での型チェック）
3. ビルド順序の依存関係を確認（`@kanbun/skam` が先にビルドされる必要がある）

#### 🚨 **重大な問題点 3: splitKaeriForTateten の定数参照**

**問題**:
計画では「Canvas の helpers.ts は splitKaeriForTateten のみ残す」「Canvas の constants.ts は削除」とあるが、**splitKaeriForTateten は KAERI_UNICODE を参照している**。

**証拠**（helpers.ts L52-63）:

```typescript
export function splitKaeriForTateten(value: string): { re: string; nonRe: string } {
  let re = '';
  let nonRe = '';
  for (const char of value) {
    if (char === 'レ') {
      re += KAERI_UNICODE[char] ?? char; // ← constants.ts から import
    } else {
      nonRe += KAERI_UNICODE[char] ?? char;
    }
  }
  return { re, nonRe };
}
```

**矛盾**:

- constants.ts を削除すると、splitKaeriForTateten は KAERI_UNICODE を参照できなくなる
- `@kanbun/skam/rendering` から import する必要があるが、計画書にこの変更が明記されていない

**必要な修正**:

- splitKaeriForTateten も `@kanbun/skam/rendering` に移動するか
- constants.ts を残すか、`@kanbun/skam/rendering` から KAERI_UNICODE を import するかを明確にする

---

### Phase 1: Pass 1 出力の構造エンリッチ

**計画内容**: CanvasRenderTree に `hasSuffix: boolean` 追加 → layout パスの re-infer 不要化

#### ✅ **論理的に正しい**: タイミングは適切

**現状の確認**:

- `layout-vertical.ts` L298-314 で全トークンをスキャンして hasSuffix を計算
- 計算結果は `LayoutContext` に渡され、`layoutSingleToken()` の分岐に使用される

**計画の変更**:

- `buildRenderTree()` で hasSuffix を計算し、`CanvasRenderTree` に保持
- layout パスでは tree.hasSuffix を参照

**タイミングの妥当性**:

- `buildRenderTree()` では全 token の slots が既に解決されている（Pass 1 の役割）
- slots.okuri / slots.soegana / slots.kaeri / slots.kutoten / slots.saidokuUnder / slots.saidokuOkuri2 の有無を判定するのは Pass 1 の責務として自然

**影響範囲**:

- `CanvasRenderTree` 型に `hasSuffix: boolean` 追加（types.ts）
- `buildRenderTree()` で計算ロジック追加（render-tree.ts）
- `layout-vertical.ts` の collectAllTokens() + スキャンループ削除

#### 🟡 **軽微な懸念**: blockStartRef/blockStartKutoten の追加の必要性

**計画内容**: CanvasBlockNode に blockStartRef/blockStartKutoten 追加

**疑問**:

- HTML renderer の `BlockRenderTree` には `blockStartHtml: string` が存在する（build-render-tree.ts L89-111）
- Canvas では Pass 1 で blockStart 要素を **どのように表現しているか** が不明
- 現在の実装を確認する必要がある（render-tree.ts の buildRenderTree() の戻り値）

**リスク**:

- blockStartRef/blockStartKutoten が実際に必要かどうかが検証されていない
- 追加しても使用されない可能性（layout パスで参照されない場合）

---

### Phase 2: range mark 処理の統一

**計画内容**: yomigana/okurigana/soegana の 3 ループを汎用 applyRangeConcentration() に統合

#### 🚨 **重大な問題点: concentration パラメータの設計が不十分**

**計画の RangeSlotConfig**:

```typescript
interface RangeSlotConfig {
  type: 'yomigana' | 'okurigana' | 'soegana';
  slotName: 'ruby' | 'okuri' | 'soegana';
  concentration: 'first' | 'last';
  setSpan: boolean;
}
```

**現状の実装（HTML renderer の renderer.ts を参照）**:

- **yomigana**: mark.value を先頭トークン（anchor.from）の ruby に設定 + rubySpan 設定
- **okurigana**: mark.value を末尾トークン（anchor.to）の okuri に設定
- **soegana**: mark.value を末尾トークン（anchor.to）の soegana に設定

**問題**:

1. **concentration='first'/'last' だけでは不十分**:
   - yomigana は「先頭トークンに設定」だけでなく、**rubySpan** も設定する必要がある
   - okurigana と soegana は両方とも concentration='last' だが、**スロット名が異なる** だけ
   - つまり、concentration は「どこに設定するか」を表すが、「何を設定するか」（rubySpan の有無）は別のパラメータが必要

2. **実装の本質的な差異**:
   - yomigana: `slots.ruby = mark.value`, `slots.rubySpan = tokenIds.length`
   - okurigana: `slots.okuri = mark.value`
   - soegana: `slots.soegana = mark.value`
   - この 3 つは「concentration（first/last）」と「slotName」だけでは表現できない（rubySpan の有無が欠けている）

**修正提案**:

```typescript
interface RangeSlotConfig {
  type: 'yomigana' | 'okurigana' | 'soegana';
  slotName: 'ruby' | 'okuri' | 'soegana';
  concentration: 'first' | 'last';
  setSpan: boolean; // ← これは正しい
}
```

ただし、実装時に `setSpan && concentration === 'first'` の条件で rubySpan を設定する必要がある。

**懸念**:

- 計画では「RangeSlotConfig で type/slotName/concentration/setSpan をパラメータ化」とあるが、**実際に applyRangeConcentration() の実装例が示されていない**
- ロジックが複雑化する可能性（特に multi-token range の処理）

---

### Phase 3: グリッドレイアウトの抽象化

**計画内容**: GridColumns 型で事前計算済み列位置を保持、computeGridColumns() が hasSuffix 分岐を吸収

#### 🚨 **重大な問題点: hasSuffix=false 時のスロット存在可能性**

**計画での GridColumns**:

```typescript
interface GridColumns {
  baseCenterX: number;
  saidoku2X: number; // hasSuffix=false なら 0
  kaeriX: number; // hasSuffix=false なら 0
  okuriX: number;
  kutotenX: number; // hasSuffix=false なら 0
}
```

**問題**:

- 計画では「hasSuffix=false の場合、saidoku2X/kaeriX/kutotenX は 0」としているが、**これらのスロットが実際に存在する場合はどうなるか？**

**現状の実装（layout-vertical.ts L298-314）**:

```typescript
let hasSuffix = false;
for (const tokenNode of allTokens) {
  if (
    slots.okuri ||
    slots.soegana ||
    slots.kaeri ||
    slots.kutoten ||
    slots.saidokuUnder ||
    slots.saidokuOkuri2
  ) {
    hasSuffix = true;
  }
}
```

**矛盾**:

- hasSuffix は「いずれかのスロットが存在するか」で判定される
- つまり、**hasSuffix=false のときは kaeri/kutoten/saidokuOkuri2 は存在しない**（定義上）
- しかし、計画では「hasSuffix=false なら X=0」としており、**存在しないスロットの座標を 0 にする** という論理的矛盾がある

**正しい理解**:

- hasSuffix=false の場合、kaeri/kutoten/saidoku2 スロットは **存在しない** ため、座標計算は不要
- GridColumns に saidoku2X/kaeriX/kutotenX を含める必要があるのは **hasSuffix=true のときのみ**

**修正提案**:

```typescript
interface GridColumns {
  baseCenterX: number;
  okuriX: number; // ruby/emphasis と共通
  saidoku2X?: number; // hasSuffix=true のみ
  kaeriX?: number; // hasSuffix=true のみ
  kutotenX?: number; // hasSuffix=true のみ
}
```

または、hasSuffix で分岐させる:

```typescript
type GridColumns =
  | { hasSuffix: false; baseCenterX: number; okuriX: number }
  | {
      hasSuffix: true;
      baseCenterX: number;
      okuriX: number;
      saidoku2X: number;
      kaeriX: number;
      kutotenX: number;
    };
```

---

### Phase の全体的な依存関係

**計画の順序**:

1. Phase 0: 共有ユーティリティ抽出
2. Phase 1: Pass 1 構造エンリッチ
3. Phase 2: range mark 統一
4. Phase 3: グリッドレイアウト抽象化

#### 🟡 **軽微な懸念**: Phase 0 と Phase 1-3 の独立性

**問題**:

- Phase 0 は「共有ユーティリティの抽出」であり、Phase 1-3 とは独立している
- しかし、Phase 1-3 の実装中に「この関数も抽出すべきでは？」という気づきが生じる可能性がある
- Phase 0 を先に完了させると、後から追加抽出が必要になった場合に再度 Phase 0 に戻る必要がある

**推奨**:

- Phase 0 を Phase 1-3 の **後** に行うか、または Phase 0 を「暫定的な抽出」とし、Phase 3 完了後に「最終的な抽出」を行う

---

## 全体としての論理的整合性評価

### ✅ **正しい点**

1. **hasSuffix を Pass 1 で計算する方針**: タイミングとして適切、layout パスの責務を軽減
2. **range mark 処理の統一**: yomigana/okurigana/soegana の重複ロジックを削減する方針は正しい
3. **GridColumns での座標事前計算**: hasSuffix 分岐を吸収する方針は正しい

### 🚨 **重大な問題点**

1. **Phase 0: 抽出対象コードの具体的な範囲が未確認**
   - どの関数を抽出するかが明確でない（getTatetenGroups 等は実装が異なる）
   - tsup + package.json exports の具体的な設定が示されていない
   - splitKaeriForTatoten の定数参照問題が未解決

2. **Phase 2: RangeSlotConfig の設計が不十分**
   - concentration='first'/'last' だけでは yomigana の rubySpan 設定を表現できない
   - applyRangeConcentration() の実装例が示されていない

3. **Phase 3: hasSuffix=false 時のスロット存在可能性**
   - GridColumns に saidoku2X/kaeriX/kutotenX を含めるべきかが曖昧
   - hasSuffix=false のときは X=0 ではなく、**そもそもスロットが存在しない** という前提を明確にすべき

### 🟡 **軽微な懸念**

1. **Phase 1: blockStartRef/blockStartKutoten の必要性が未検証**
   - 現在の実装で blockStart 要素がどう扱われているかを確認する必要がある

2. **Phase 0 の実施タイミング**
   - Phase 1-3 の後に行う方が、抽出対象が明確になる可能性がある

---

## 推奨される対応

### 即座に実装を停止すべき決定的な欠落: **なし**

ただし、以下の点を **実装前に明確化** する必要がある:

### Phase 0 実装前に確認すべき事項

1. **抽出対象の関数リストを明確化**:
   - HTML と Canvas で **完全に同一** のコードを特定する（diff ツールを使用）
   - getTatetenGroups 等の「似ているが異なる」関数は抽出対象外とする

2. **tsup + package.json exports の具体的な設定を検証**:
   - tsup で複数エントリビルドをテスト
   - pnpm workspace での型解決を確認

3. **splitKaeriForTateten の定数参照問題を解決**:
   - constants.ts を `@kanbun/skam/rendering` に含めるか、splitKaeriForTateten も移動するか決定

### Phase 2 実装前に確認すべき事項

1. **applyRangeConcentration() の実装を事前設計**:
   - yomigana の rubySpan 設定ロジックをどう組み込むか
   - multi-token range の処理をどう一般化するか

### Phase 3 実装前に確認すべき事項

1. **GridColumns の型定義を明確化**:
   - hasSuffix=false のときに saidoku2X 等が存在しないことを型で表現する
   - または optional プロパティとして扱う

---

## 結論

**計画の基本的な方向性は正しいが、以下の3点で証拠不足・設計不足がある:**

1. **Phase 0**: 抽出対象コードの範囲と tsup 設定が具体的でない
2. **Phase 2**: RangeSlotConfig の設計が yomigana の rubySpan を十分に表現できていない
3. **Phase 3**: GridColumns の hasSuffix=false 時の扱いが曖昧

**推奨される対応:**

1. **Phase 0 を後回しにする**: Phase 1-3 を先に実装し、実際に重複が生じたコードを Phase 4 として抽出する
2. **Phase 2 の applyRangeConcentration() を事前設計**: 実装例を書き、yomigana/okurigana/soegana の差異を正しく表現できることを確認する
3. **Phase 3 の GridColumns 型を明確化**: hasSuffix で型を分岐させるか、optional プロパティとして扱うかを決定する

**既存テスト 160+ が全て通る想定について:**

- Phase 1-3 は内部実装の変更であり、Pass 1 → Pass 2 → Pass 3 の出力は変わらないため、理論的にはテストは通る
- ただし、Phase 0 でインポートパスが変わると、**Canvas/HTML 両方のテストでインポートエラー** が発生する可能性がある
- Phase 0 を最後に行うことで、このリスクを軽減できる

---

## 最終判定

**🟡 中程度の問題あり - 修正して再検証を推奨**

- Phase 0: 具体的な設計を詰めてから再検証
- Phase 1: 概ね OK（blockStart 要素の確認のみ）
- Phase 2: applyRangeConcentration() の実装を事前設計
- Phase 3: GridColumns 型を明確化

**実装可否:**

- Phase 1 は即座に実装可能
- Phase 2-3 は設計を詰めてから実装
- Phase 0 は Phase 1-3 の後に実施することを推奨

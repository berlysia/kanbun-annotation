/**
 * 拡張が決める「隠す所」の解決。
 *
 * rendering は拡張を import せず、呼ぶ側 (renderer) が渡した定義の `hiddenParts` / `isHidden` を呼ぶ。
 * AIR (buildAnnotationIR) と html の直接の経路は、同じ判定をここから受け取る。
 */

import type { Mark, SKAMDocument } from '../index.js';
import type { HiddenParts, SKAMExtensionDefinition } from '../extensions/types.js';
import type { AIRRenderProfile } from './air-types.js';
import type { TokenMarks } from './mark-lookup.js';

/** 描画の拡張に関する選択肢 */
export interface RenderExtensionOptions {
  /** 判定に使う拡張の定義。既定の束を含めて渡す (rendering は束を import しない) */
  extensions?: readonly SKAMExtensionDefinition[];
  /** 拡張の名前ごとの選択肢 (例 `{ edu: { hideQuiz: true } }`) */
  extensionOptions?: Readonly<Record<string, unknown>>;
}

/** 文書で宣言された拡張が決める、隠す所の判定 */
export interface Hiding {
  /** 字に付く注記 (種類ごと) から、隠す所。何も隠さなければ undefined */
  parts(tokenMarks: TokenMarks): HiddenParts | undefined;
  /** 注記 1 つを隠すか */
  isHidden(mark: Mark): boolean;
}

/** 注記の種類と、profile のキーが違う種類 */
const PROFILE_KEY_OF_TYPE: Readonly<Record<string, keyof AIRRenderProfile>> = {
  kaeri: 'kaeriten',
};

/**
 * profile で有効な種類の注記だけを残す。画面に出ない注記は、隠す判定に影響しない。
 * `Hiding.parts` に渡す前に使う (AIR と html の直接の経路で同じ判定にするため)
 */
export function visibleTokenMarks(tokenMarks: TokenMarks, profile: AIRRenderProfile): TokenMarks {
  const visible = new Map<Mark['type'], readonly Mark[]>();
  for (const [type, marks] of tokenMarks) {
    const key = PROFILE_KEY_OF_TYPE[type] ?? (type as keyof AIRRenderProfile);
    if (profile[key]) visible.set(type, marks);
  }
  return visible;
}

const NO_OPTIONS: unknown = undefined;

function optionsOf(options: RenderExtensionOptions | undefined, name: string): unknown {
  const table = options?.extensionOptions;
  return table !== undefined && Object.hasOwn(table, name) ? table[name] : NO_OPTIONS;
}

/**
 * 隠す判定を作る。描画の入口で 1 回だけ呼ぶ。
 *
 * - 渡された定義の `assertOptions` を、文書の宣言にかかわらず呼ぶ (誤った選択肢は TypeError)。
 * - 判定に使うのは、文書が `extensions` に挙げた拡張の定義だけ。宣言の無い文書と、定義を渡さないときは undefined
 */
export function createHiding(
  doc: Pick<SKAMDocument, 'extensions'>,
  options: RenderExtensionOptions | undefined
): Hiding | undefined {
  const definitions = options?.extensions ?? [];
  for (const definition of definitions) {
    definition.assertOptions?.(optionsOf(options, definition.name));
  }
  if (!Array.isArray(doc.extensions)) return undefined;
  const declared = new Set<unknown>(doc.extensions);
  const active = definitions.filter(
    (definition) => declared.has(definition.name) && (definition.hiddenParts || definition.isHidden)
  );
  if (active.length === 0) return undefined;

  return {
    parts(tokenMarks) {
      const slots = new Set<HiddenParts['slots'][number]>();
      let omitOkimoji = false;
      let omitJoji = false;
      for (const definition of active) {
        const hidden = definition.hiddenParts?.(tokenMarks, optionsOf(options, definition.name));
        if (!hidden) continue;
        for (const slot of hidden.slots) slots.add(slot);
        omitOkimoji ||= hidden.omitOkimoji;
        omitJoji ||= hidden.omitJoji;
      }
      return slots.size === 0 && !omitOkimoji && !omitJoji
        ? undefined
        : { slots: [...slots], omitOkimoji, omitJoji };
    },
    isHidden(mark) {
      return active.some(
        (definition) => definition.isHidden?.(mark, optionsOf(options, definition.name)) === true
      );
    },
  };
}

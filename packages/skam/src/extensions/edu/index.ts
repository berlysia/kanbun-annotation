/**
 * @kanbun-skam/skam/extensions/edu
 *
 * 学習・教育用拡張 (名前 `edu`、名前空間 `urn:skam:edu:1`、必須)。
 * 注記に出題の印 (`ext.edu.quiz`、問いの名前) を付け、描画で印の付いた注記を隠せるようにする。
 * 隠すのは表示の制御で、秘匿ではない。答えは同じ文書に平文で残る。
 *
 * core の値は import しない (`import type` だけ)。誤りの値は core の `createValidationError` を使わずに組み立てる。
 */

import type { Mark, MarkType } from '../../index.js';
import type { ValidationError } from '../../errors.js';
import type {
  ExtensionOwner,
  HiddenParts,
  SKAMExtensionDefinition,
  XmlElementMarks,
} from '../types.js';

/** 注記の `ext.edu` の形 */
export interface EduExtension {
  quiz?: string;
}

/** 出題の印を付けられる注記の種類 */
export type QuizMarkType =
  | 'kaeri'
  | 'okurigana'
  | 'soegana'
  | 'yomigana'
  | 'saidoku'
  | 'kutoten'
  | 'tateten'
  | 'okototen'
  | 'okimoji'
  | 'joji';

/** 描画の選択肢: `true` は印の付いた注記をすべて、配列は名前がその中にある印の注記を隠す */
export type HideQuizOption = true | readonly string[];

const QUIZ_MARK_TYPES: ReadonlySet<string> = new Set<QuizMarkType>([
  'kaeri',
  'okurigana',
  'soegana',
  'yomigana',
  'saidoku',
  'kutoten',
  'tateten',
  'okototen',
  'okimoji',
  'joji',
]);

const MAX_QUIZ_LENGTH = 64;
const MAX_HIDE_QUIZ_ITEMS = 100;
/** XML の属性の値の正規化で値が変わらないよう、タブと改行を含む制御文字を認めない */

function isQuizName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const characters = [...value];
  if (characters.length < 1 || characters.length > MAX_QUIZ_LENGTH) return false;
  // 制御文字: U+0000〜U+001F と U+007F〜U+009F
  return characters.every((c) => {
    const code = c.codePointAt(0)!;
    return code > 0x1f && (code < 0x7f || code > 0x9f);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 注記の `ext.edu.quiz`。own property だけを見る */
function readQuiz(mark: Mark): string | undefined {
  const ext: unknown = mark.ext;
  if (!isPlainObject(ext) || !Object.hasOwn(ext, 'edu')) return undefined;
  const edu = ext['edu'];
  if (!isPlainObject(edu) || !Object.hasOwn(edu, 'quiz')) return undefined;
  const quiz = edu['quiz'];
  return typeof quiz === 'string' ? quiz : undefined;
}

/** 注記が出題の印を持ち、`hideQuiz` が隠す対象にしているか。宣言の有無は見ない (呼ぶ側が決める) */
export function isQuizHidden(mark: Mark, hideQuiz: HideQuizOption | undefined): boolean {
  if (hideQuiz === undefined) return false;
  const quiz = readQuiz(mark);
  if (quiz === undefined) return false;
  return hideQuiz === true || hideQuiz.includes(quiz);
}

/** `hideQuiz` の形を検査して返す。誤りは TypeError (メッセージに入力の値を入れない) */
export function assertHideQuizOption(value: unknown): HideQuizOption | undefined {
  if (value === undefined || value === true) return value;
  if (Array.isArray(value) && value.length <= MAX_HIDE_QUIZ_ITEMS && value.every(isQuizName)) {
    return value as readonly string[];
  }
  throw new TypeError(
    `hideQuiz must be true or an array of at most ${MAX_HIDE_QUIZ_ITEMS} quiz names (1 to ${MAX_QUIZ_LENGTH} characters)`
  );
}

function invalid(
  kind: ValidationError['kind'],
  path: string,
  message: string,
  expected: string
): ValidationError[] {
  return [{ kind, path, message, expected }];
}

function validateEdu(value: unknown, path: string, owner: ExtensionOwner): ValidationError[] {
  if (owner.kind !== 'mark') {
    return invalid(
      'INVALID_EXTENSION',
      path,
      'ext.edu is only allowed on marks',
      'ext.edu on a mark'
    );
  }
  if (!QUIZ_MARK_TYPES.has(owner.mark.type)) {
    return invalid(
      'INVALID_EXTENSION',
      path,
      `ext.edu is not allowed on ${owner.mark.type}`,
      [...QUIZ_MARK_TYPES].join('|')
    );
  }
  if (!isPlainObject(value)) {
    return invalid('INVALID_TYPE', path, 'ext.edu must be an object', 'object');
  }
  const errors: ValidationError[] = [];
  for (const key of Object.keys(value)) {
    if (key !== 'quiz') {
      errors.push(
        ...invalid('INVALID_VALUE', `${path}.${key}`, 'ext.edu only allows quiz', 'quiz')
      );
    }
  }
  if (!Object.hasOwn(value, 'quiz')) {
    errors.push(...invalid('MISSING_FIELD', `${path}.quiz`, 'ext.edu requires quiz', 'string'));
  } else if (!isQuizName(value['quiz'])) {
    errors.push(
      ...invalid(
        'INVALID_VALUE',
        `${path}.quiz`,
        `quiz must be a string of 1 to ${MAX_QUIZ_LENGTH} characters without control characters`,
        'quiz name'
      )
    );
  }
  return errors;
}

// ============================================================================
// SKAM-ML の属性
// ============================================================================

/** 1 つの要素が 1 つの注記を作る要素。属性は `edu:quiz` */
const SELF_ELEMENTS: ReadonlySet<string> = new Set([
  'skam:kaeri',
  'skam:kutoten',
  'skam:okototen',
  'skam:okimoji',
  'skam:joji',
  'skam:tateten',
  'skam:saidoku',
  'skam:yomigana',
  'skam:soegana',
]);

/** `skam:kun` の部分ごとの属性 (local name) と部分の対応 */
const KUN_PART_ATTRIBUTES: ReadonlyMap<string, 'yomi' | 'okuri' | 'soe'> = new Map([
  ['yomi-quiz', 'yomi'],
  ['okuri-quiz', 'okuri'],
  ['soe-quiz', 'soe'],
]);

function readEduAttributes(
  attributes: ReadonlyMap<string, string>,
  target: XmlElementMarks
): { values: ReadonlyArray<{ mark: Mark; value: unknown }> } | { error: string } {
  const values: { mark: Mark; value: unknown }[] = [];
  const isKun = target.element === 'skam:kun';
  if (!isKun && !SELF_ELEMENTS.has(target.element)) {
    return attributes.size === 0
      ? { values }
      : { error: 'edu attributes are not allowed on this element' };
  }
  for (const [name, quiz] of attributes) {
    const part = isKun ? KUN_PART_ATTRIBUTES.get(name) : name === 'quiz' ? 'self' : undefined;
    if (part === undefined) {
      return { error: 'unknown or misplaced edu attribute on this element' };
    }
    const mark = target.marks.find((entry) => entry.part === part)?.mark;
    if (mark === undefined || !QUIZ_MARK_TYPES.has(mark.type)) {
      return { error: 'edu attribute has no mark to attach to' };
    }
    if (!isQuizName(quiz)) {
      return {
        error: `edu quiz must be 1 to ${MAX_QUIZ_LENGTH} characters without control characters`,
      };
    }
    values.push({ mark, value: { quiz } });
  }
  return { values };
}

const PART_ATTRIBUTE = { self: 'quiz', yomi: 'yomi-quiz', okuri: 'okuri-quiz', soe: 'soe-quiz' };

function writeEduAttributes(target: XmlElementMarks): ReadonlyMap<string, string> {
  const written = new Map<string, string>();
  for (const { part, mark } of target.marks) {
    const quiz = readQuiz(mark);
    if (quiz !== undefined) written.set(PART_ATTRIBUTE[part], quiz);
  }
  return written;
}

// ============================================================================
// 描画: 隠す所
// ============================================================================

/** 描画の選択肢 `extensionOptions.edu` から `hideQuiz` を読む。形は assertOptions が入口で検査済み */
function readHideQuiz(options: unknown): HideQuizOption | undefined {
  if (!isPlainObject(options) || !Object.hasOwn(options, 'hideQuiz')) return undefined;
  return options['hideQuiz'] as HideQuizOption | undefined;
}

function isQuizTarget(mark: Mark, hideQuiz: HideQuizOption | undefined): boolean {
  return QUIZ_MARK_TYPES.has(mark.type) && isQuizHidden(mark, hideQuiz);
}

/**
 * 同じ種類の注記のどれか 1 つでも隠すなら、その種類の slot を隠す。
 * 再読文字を描く字 (1 つ目の saidoku) は ruby と okuri を上書きするので、yomigana と okurigana の印は効かず、
 * 描く saidoku が隠すものなら読みの slot をすべて隠す
 */
function hiddenParts(
  tokenMarks: ReadonlyMap<MarkType, readonly Mark[]>,
  options: unknown
): HiddenParts {
  const hideQuiz = readHideQuiz(options);
  const slots: HiddenParts['slots'][number][] = [];
  const anyHidden = (type: MarkType): boolean =>
    (tokenMarks.get(type) ?? []).some((mark) => isQuizTarget(mark, hideQuiz));
  const saidoku = tokenMarks.get('saidoku')?.[0];
  if (saidoku !== undefined) {
    if (isQuizTarget(saidoku, hideQuiz)) {
      slots.push('ruby', 'okuri', 'saidokuUnder', 'saidokuOkuri2');
    }
  } else {
    if (anyHidden('yomigana')) slots.push('ruby');
    if (anyHidden('okurigana')) slots.push('okuri');
  }
  if (anyHidden('soegana')) slots.push('soegana');
  if (anyHidden('kaeri')) slots.push('kaeri');
  if (anyHidden('kutoten')) slots.push('kutoten');
  return { slots, omitOkimoji: anyHidden('okimoji'), omitJoji: anyHidden('joji') };
}

/** 学習・教育用拡張の定義 */
export const eduExtension: SKAMExtensionDefinition = {
  name: 'edu',
  uri: 'urn:skam:edu:1',
  required: true,
  validate: validateEdu,
  readXmlAttributes: readEduAttributes,
  writeXmlAttributes: writeEduAttributes,
  hiddenParts,
  isHidden: (mark, options) => isQuizTarget(mark, readHideQuiz(options)),
  assertOptions(options) {
    if (options === undefined) return;
    if (!isPlainObject(options)) {
      throw new TypeError('extensionOptions.edu must be an object');
    }
    assertHideQuizOption(options['hideQuiz']);
  },
};

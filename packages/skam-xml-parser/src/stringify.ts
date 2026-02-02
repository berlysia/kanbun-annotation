/**
 * SKAM-ML/XML Stringify
 *
 * SKAMDocument → SKAM-ML/XML 変換
 *
 * 対応するmark種別（v0.1）:
 * - kaeri（返り点）
 * - okurigana（送り仮名）
 * - yomigana（読み仮名）
 * - soegana（添え仮名）
 */

import type {
  SKAMDocument,
  Token,
  Mark,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  SoeganaMark,
} from '@kanbun/skam';

// ============================================================================
// Constants
// ============================================================================

const SKAM_NS = 'urn:skam:1';

// 返り点の value → kind 逆マッピング
const KAERI_KIND_MAP: Record<string, string> = {
  レ: 're',
  一: 'ichi',
  二: 'ni',
  三: 'san',
  四: 'shi',
  上: 'jo',
  中: 'chu',
  下: 'ge',
  点: 'ten',
  甲: 'ko',
  乙: 'otsu',
  丙: 'hei',
  丁: 'tei',
};

// ============================================================================
// Types
// ============================================================================

export interface StringifyOptions {
  /** Indentation size (default: 2) */
  indent?: number;
  /** Include XML declaration (default: true) */
  xmlDeclaration?: boolean;
}

// Token に付随する mark 情報
interface TokenAnnotation {
  /** 読み仮名 */
  yomi?: string;
  /** 送り仮名 */
  okuri?: string;
  /** 添え仮名 */
  soe?: string;
  /** 直後に配置する返り点 */
  kaeriAfter?: KaeriMark[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function indent(level: number, size: number): string {
  return ' '.repeat(level * size);
}

/**
 * Token のブロックID を取得
 */
function getBlockId(token: Token): string | undefined {
  return token.ext?.['blockId'] as string | undefined;
}

/**
 * 返り点の value を kind に変換
 */
function kaeriValueToKind(value: string): string {
  // 複合返り点（例: 一レ → ichi-re）への対応
  // まずは単純なマッピングを試す
  const kind = KAERI_KIND_MAP[value];
  if (kind) {
    return kind;
  }

  // 複合返り点の場合、各文字を変換して連結
  const parts: string[] = [];
  for (const char of value) {
    const k = KAERI_KIND_MAP[char];
    if (k) {
      parts.push(k);
    }
  }

  if (parts.length > 0) {
    return parts.join('-');
  }

  // 不明な場合はそのまま返す
  return value;
}

// ============================================================================
// Annotation Collection
// ============================================================================

/**
 * Token ごとの annotation を収集
 *
 * 複数の token にまたがる mark は現在サポート外
 */
function collectTokenAnnotations(tokens: Token[], marks: Mark[]): Map<string, TokenAnnotation> {
  const annotations = new Map<string, TokenAnnotation>();

  // 各 token の annotation を初期化
  for (const token of tokens) {
    annotations.set(token.id, {});
  }

  // Mark を処理
  for (const mark of marks) {
    // 単一 token を参照する mark のみ処理
    if (mark.anchor.from !== mark.anchor.to) {
      // 複数 token にまたがる mark は現在スキップ
      continue;
    }

    const tokenId = mark.anchor.from;
    const annotation = annotations.get(tokenId);
    if (!annotation) {
      continue;
    }

    switch (mark.type) {
      case 'yomigana':
        annotation.yomi = (mark as YomiganaMark).value;
        break;
      case 'okurigana':
        annotation.okuri = (mark as OkuriganaMark).value;
        break;
      case 'soegana':
        annotation.soe = (mark as SoeganaMark).value;
        break;
      case 'kaeri':
        if (!annotation.kaeriAfter) {
          annotation.kaeriAfter = [];
        }
        annotation.kaeriAfter.push(mark as KaeriMark);
        break;
    }
  }

  return annotations;
}

// ============================================================================
// XML Generation
// ============================================================================

/**
 * Token と annotation から XML 要素を生成
 */
function tokenToXml(token: Token, annotation: TokenAnnotation): string {
  const { yomi, okuri, soe, kaeriAfter } = annotation;
  const hasKunAttrs = yomi || okuri || soe;

  let xml = '';

  if (hasKunAttrs) {
    // skam:kun 要素で囲む
    const attrs: string[] = [];
    if (yomi) {
      attrs.push(`yomi="${escapeXml(yomi)}"`);
    }
    if (okuri) {
      attrs.push(`okuri="${escapeXml(okuri)}"`);
    }
    if (soe) {
      attrs.push(`soe="${escapeXml(soe)}"`);
    }

    xml += `<skam:kun ${attrs.join(' ')}>${escapeXml(token.text)}</skam:kun>`;
  } else {
    // プレーンテキスト
    xml += escapeXml(token.text);
  }

  // 返り点を追加
  if (kaeriAfter) {
    for (const kaeri of kaeriAfter) {
      const kind = kaeriValueToKind(kaeri.value);
      xml += `<skam:kaeri kind="${escapeXml(kind)}"/>`;
    }
  }

  return xml;
}

/**
 * ブロックの XML を生成
 */
function blockToXml(
  tokens: Token[],
  annotations: Map<string, TokenAnnotation>,
  indentLevel: number,
  indentSize: number
): string {
  const ind = indent(indentLevel, indentSize);
  let content = '';

  for (const token of tokens) {
    const annotation = annotations.get(token.id) ?? {};
    content += tokenToXml(token, annotation);
  }

  return `${ind}<skam:block>${content}</skam:block>`;
}

// ============================================================================
// Main Stringify Function
// ============================================================================

/**
 * SKAMDocument を SKAM-ML/XML 文字列に変換
 *
 * @param doc SKAMDocument
 * @param options Stringify options
 * @returns XML string
 */
export function stringify(doc: SKAMDocument, options: StringifyOptions = {}): string {
  const { indent: indentSize = 2, xmlDeclaration = true } = options;

  // Annotation を収集
  const annotations = collectTokenAnnotations(doc.tokens, doc.marks);

  // Token をブロックごとにグループ化
  const blocks: Token[][] = [];
  let currentBlock: Token[] = [];
  let currentBlockId: string | undefined;

  for (const token of doc.tokens) {
    const blockId = getBlockId(token);

    if (blockId !== currentBlockId) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = [];
      currentBlockId = blockId;
    }

    currentBlock.push(token);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  // XML を構築
  const lines: string[] = [];

  // XML 宣言
  if (xmlDeclaration) {
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  }

  // ルート要素開始
  lines.push(`<skam:doc xmlns:skam="${SKAM_NS}">`);

  // meta 要素（常に char tokenization）
  lines.push(`${indent(1, indentSize)}<skam:meta>`);
  lines.push(`${indent(2, indentSize)}<skam:tokenize strategy="char"/>`);
  lines.push(`${indent(1, indentSize)}</skam:meta>`);

  // body 要素
  lines.push(`${indent(1, indentSize)}<skam:body>`);

  for (const blockTokens of blocks) {
    lines.push(blockToXml(blockTokens, annotations, 2, indentSize));
  }

  lines.push(`${indent(1, indentSize)}</skam:body>`);

  // ルート要素終了
  lines.push('</skam:doc>');

  return lines.join('\n');
}

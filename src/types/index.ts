/**
 * Stand-off Kanbun Annotation Model - 型定義
 */

/** テキスト内の位置を表すオフセット（0-indexed, UTF-16コード単位） */
export interface TextSpan {
  /** 開始位置（inclusive） */
  start: number;
  /** 終了位置（exclusive） */
  end: number;
}

/** アノテーションの基底型 */
export interface BaseAnnotation {
  /** アノテーションの一意識別子 */
  id: string;
  /** 対象テキストのスパン */
  span: TextSpan;
}

/** 返り点の種類 */
export type KaeritenType =
  | 'レ' // レ点
  | '一' // 一点
  | '二' // 二点
  | '三' // 三点
  | '四' // 四点
  | '上' // 上点
  | '中' // 中点
  | '下' // 下点
  | '甲' // 甲点
  | '乙' // 乙点
  | '丙' // 丙点
  | '丁' // 丁点
  | '天' // 天点
  | '地' // 地点
  | '人'; // 人点

/** 返り点アノテーション */
export interface KaeritenAnnotation extends BaseAnnotation {
  type: 'kaeriten';
  /** 返り点の種類 */
  mark: KaeritenType;
}

/** 送り仮名アノテーション */
export interface OkuriganaAnnotation extends BaseAnnotation {
  type: 'okurigana';
  /** 送り仮名のテキスト */
  text: string;
}

/** 読み仮名（振り仮名）アノテーション */
export interface YomiganaAnnotation extends BaseAnnotation {
  type: 'yomigana';
  /** 読み仮名のテキスト */
  text: string;
}

/** 再読文字アノテーション */
export interface SaidokumojAnnotation extends BaseAnnotation {
  type: 'saidokumoji';
  /** 最初の読み */
  firstReading: string;
  /** 二度目の読み */
  secondReading: string;
}

/** 句読点アノテーション */
export interface PunctuationAnnotation extends BaseAnnotation {
  type: 'punctuation';
  /** 句読点の種類 */
  mark: '。' | '、' | '・';
}

/** すべてのアノテーション型 */
export type Annotation =
  | KaeritenAnnotation
  | OkuriganaAnnotation
  | YomiganaAnnotation
  | SaidokumojAnnotation
  | PunctuationAnnotation;

/** アノテーション付き漢文ドキュメント */
export interface KanbunDocument {
  /** ドキュメントの一意識別子 */
  id: string;
  /** 原文テキスト（漢文） */
  text: string;
  /** アノテーションの配列 */
  annotations: Annotation[];
  /** メタデータ（任意） */
  metadata?: Record<string, unknown>;
}

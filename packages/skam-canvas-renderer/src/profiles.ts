/**
 * 表示要素の制御プロファイル
 */

export interface RenderProfile {
  yomigana: boolean;
  okurigana: boolean;
  kaeriten: boolean;
  kutoten: boolean;
  saidoku: boolean;
  okototen: boolean;
  tateten: boolean;
  emphasis: boolean;
  okimoji: boolean;
  joji: boolean;
  soegana: boolean;
  highlight: boolean;
  ref: boolean;
}

/** 全要素表示プロファイル */
const FULL_PROFILE: RenderProfile = {
  yomigana: true,
  okurigana: true,
  kaeriten: true,
  kutoten: true,
  saidoku: true,
  okototen: true,
  tateten: true,
  emphasis: true,
  okimoji: true,
  joji: true,
  soegana: true,
  highlight: true,
  ref: true,
};

/** 学習用基本プロファイル（返り点のみ） */
const LEARNING_BASIC_PROFILE: RenderProfile = {
  yomigana: false,
  okurigana: false,
  kaeriten: true,
  kutoten: true,
  saidoku: false,
  okototen: false,
  tateten: false,
  emphasis: false,
  okimoji: true,
  joji: true,
  soegana: false,
  highlight: true,
  ref: true,
};

/** 学習用ヒント付きプロファイル（返り点+送り仮名+再読文字） */
const LEARNING_HINT_PROFILE: RenderProfile = {
  yomigana: false,
  okurigana: true,
  kaeriten: true,
  kutoten: true,
  saidoku: true,
  okototen: false,
  tateten: false,
  emphasis: false,
  okimoji: true,
  joji: true,
  soegana: true,
  highlight: true,
  ref: true,
};

export const PROFILES = {
  full: FULL_PROFILE,
  learningBasic: LEARNING_BASIC_PROFILE,
  learningHint: LEARNING_HINT_PROFILE,
} as const;

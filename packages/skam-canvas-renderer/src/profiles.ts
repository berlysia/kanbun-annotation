/**
 * 表示要素の制御プロファイル
 *
 * 型・プリセット・検証は @kanbun-skam/skam/rendering に一本化している。ここは別名の再 export。
 */

export {
  RENDER_PROFILES as PROFILES,
  RENDER_PROFILE_KEYS,
  SKAMRenderProfileError,
  resolveRenderProfile,
  type RenderProfile,
  type RenderProfileErrorKind,
  type RenderProfileInput,
  type RenderProfileKey,
  type RenderProfileName,
} from '@kanbun-skam/skam/rendering';

/**
 * 表示要素の制御プロファイル
 *
 * 型・プリセット・検証は @kanbun-skam/skam/rendering に一本化している。ここは別名の再 export。
 */

export {
  RENDER_PROFILES as PROFILES,
  resolveRenderProfile,
  type RenderProfile,
  type RenderProfileInput,
  type RenderProfileName,
} from '@kanbun-skam/skam/rendering';

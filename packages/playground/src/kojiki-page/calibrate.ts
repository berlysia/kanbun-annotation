import { calibrateGridBaseline } from '@kanbun-skam/skam-html-renderer';

// 縦書きの inline-grid の基線のずれは、字体が読み込まれてから測らないと値が合わない
// (skam-html-renderer の mount.ts の calibrateAfterFonts と同じ理由)。
// top-level await は vite の既定の target (es2020) で使えないので then で続ける
void document.fonts.ready.then(() => {
  calibrateGridBaseline(document.body);
});

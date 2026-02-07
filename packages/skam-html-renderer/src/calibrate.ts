/**
 * Runtime detection for Chromium's inline-grid baseline alignment bug.
 *
 * In vertical writing mode (`writing-mode: vertical-rl`, `text-orientation: mixed`),
 * CSS specs require `central` as the dominant baseline (CSS Writing Modes L4 §4.2,
 * CSS Inline Layout L3 §4.1). Firefox and Safari implement this correctly, but
 * Chromium does not: Blink's `FontBaseline` only supports `alphabetic` and
 * `ideographic` types, lacking native `central` baseline support.
 * See: https://issues.chromium.org/issues/40403675
 *
 * This causes `display:inline-grid` elements (and potentially other inline-level
 * boxes) to misalign with surrounding text in vertical writing mode — the grid
 * box shifts by an amount proportional to the difference between the alphabetic
 * and central baseline positions.
 *
 * Instead of using CSS browser-detection hacks (@supports, @-moz-document),
 * this module measures the actual rendering behavior at runtime and sets a
 * CSS custom property that the generated stylesheet uses to compensate.
 *
 * @module
 */

/**
 * Detect Chromium's inline-grid baseline alignment bug and set CSS custom property.
 *
 * Measures how much an inline-grid's baseline alignment in vertical writing
 * mode causes the line box to expand compared to top alignment.
 * In Chromium (which lacks central baseline support), baseline alignment
 * shifts the grid, expanding the line box; in spec-compliant browsers
 * (Firefox, Safari) the two widths match.
 *
 * If the bug is detected, `--{prefix}-grid-baseline-fix: 1` is set
 * on the given root element (default: 0 via CSS fallback).
 *
 * Call once after the page loads. The CSS variable cascades to all descendant
 * SKAM-rendered elements.
 *
 * @param root - Element on which to set the CSS variable (ancestor of SKAM HTML)
 * @param options.variablePrefix - CSS variable prefix (default: 'skam')
 *
 * @example
 * ```typescript
 * import { calibrateGridBaseline } from '@kanbun/skam-html-renderer';
 *
 * const container = document.getElementById('render-output')!;
 * calibrateGridBaseline(container);
 * // If the bug is detected, container now has --skam-grid-baseline-fix: 1
 * ```
 */
export function calibrateGridBaseline(
  root: HTMLElement,
  options?: { variablePrefix?: string }
): void {
  const vp = options?.variablePrefix ?? 'skam';

  // Use large font for reliable measurement (amplifies the bug signal)
  const fontSize = 100; // px
  const rowSize = 50; // ruby-ratio=0.5 equivalent

  /**
   * Measure the line-box width (block-axis extent in vertical-rl)
   * of an inline-block wrapper containing a text reference and
   * an inline-grid with the given vertical-align value.
   */
  function measureLineBoxWidth(verticalAlign: string): number {
    const outer = document.createElement('div');
    outer.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;' +
      `writing-mode:vertical-rl;font-size:${fontSize}px;line-height:1;`;

    // inline-block wrapper auto-sizes to its line box content
    const wrapper = document.createElement('span');
    wrapper.style.cssText = 'display:inline-block;';

    // Reference character (establishes surrounding text baseline)
    const ref = document.createElement('span');
    ref.textContent = '字';

    // Inline-grid mimicking suffix-row structure (4 rows)
    const grid = document.createElement('span');
    grid.style.cssText =
      `display:inline-grid;` +
      `grid-template-rows:${rowSize}px ${rowSize}px ${rowSize}px ${rowSize}px;` +
      `vertical-align:${verticalAlign};line-height:1;`;

    // Text content in first row (triggers baseline calculation)
    const slot = document.createElement('span');
    slot.style.cssText = `grid-row:1;font-size:${rowSize}px;line-height:1;`;
    slot.textContent = 'あ';
    grid.appendChild(slot);

    wrapper.append(ref, grid);
    outer.appendChild(wrapper);
    root.appendChild(outer);

    const width = wrapper.getBoundingClientRect().width;
    root.removeChild(outer);
    return width;
  }

  const widthBaseline = measureLineBoxWidth('0');
  const widthTop = measureLineBoxWidth('top');

  // In Chromium (lacking central baseline support): baseline alignment causes
  // ~25 px of line-box expansion because the grid aligns to the wrong baseline.
  // In spec-compliant browsers (Firefox / Safari): both widths are equal (≈ 0 diff).
  const excess = widthBaseline - widthTop;

  if (excess > 5) {
    root.style.setProperty(`--${vp}-grid-baseline-fix`, '1');
  }
}

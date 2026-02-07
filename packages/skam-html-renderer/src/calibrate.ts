/**
 * Runtime detection for inline-grid baseline alignment bug.
 *
 * Some browsers (notably Chromium) calculate the baseline of
 * display:inline-grid elements differently in vertical writing mode,
 * shifting the grid box by an amount proportional to the internal
 * text's central baseline. This causes suffix-row and tateten
 * separators to visually misalign with the main text.
 *
 * Instead of using CSS browser-detection hacks (@supports, @-moz-document),
 * this module measures the actual rendering behavior at runtime and sets a
 * CSS custom property that the generated stylesheet uses to compensate.
 *
 * @module
 */

/**
 * Detect inline-grid baseline alignment behavior and set CSS custom property.
 *
 * Measures how much an inline-grid's baseline alignment in vertical writing
 * mode causes the line box to expand compared to top alignment.
 * In buggy browsers (Chromium), baseline alignment shifts the grid,
 * expanding the line box; in correct browsers the two widths match.
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

  // In Chromium: baseline alignment causes an extra ~25 px of line-box
  // expansion at this scale because the grid is shifted by the bug.
  // In correct browsers (Firefox / Safari): both widths are equal (≈ 0 diff).
  const excess = widthBaseline - widthTop;

  if (excess > 5) {
    root.style.setProperty(`--${vp}-grid-baseline-fix`, '1');
  }
}

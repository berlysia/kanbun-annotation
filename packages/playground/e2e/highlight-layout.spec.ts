import { test, expect, type Page } from '@playwright/test';

/**
 * Highlight layout measurement tests
 *
 * Verify that highlight lines and labels do not overlap with
 * ruby annotations or adjacent columns in vertical writing mode.
 */

/** XML with highlight containing ruby (yomigana + okurigana) and ref label */
const HIGHLIGHT_WITH_RUBY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" style="solid" ref="ref-a">
        <skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而
        <skam:ref xml:id="ref-a" format="alpha-upper"/>
      </skam:span>
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:span type="highlight" style="solid" ref="ref-b">
        <skam:kun soe="ヲ">之</skam:kun>
        <skam:kaeri kind="re"/>
        <skam:ref xml:id="ref-b" format="alpha-upper"/>
      </skam:span>
      <skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
</skam:doc>`;

/** XML with multiple highlight styles + labels for label overlap testing */
const HIGHLIGHT_LABELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" style="solid" ref="ref-a">實線<skam:ref xml:id="ref-a" format="alpha-upper"/></skam:span>
      <skam:span type="highlight" style="wavy" ref="ref-b">波線<skam:ref xml:id="ref-b" format="alpha-upper"/></skam:span>
      <skam:span type="highlight" style="double" ref="ref-c">二重線<skam:ref xml:id="ref-c" format="alpha-upper"/></skam:span>
    </skam:block>
  </skam:body>
</skam:doc>`;

/** XML with emphasis highlight + adjacent block for column overlap testing */
const EMPHASIS_COLUMN_OVERLAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" style="solid" ref="ref-a">
        <skam:span type="emphasis" style="sesame">
          <skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而
        </skam:span>
        <skam:ref xml:id="ref-a" format="alpha-upper"/>
      </skam:span>
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:kun soe="ヲ">之</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kutoten value="。" kind="ku"/>
    </skam:block>
    <skam:block>
      <skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:kun soe="ヲ">之</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
</skam:doc>`;

/** XML with highlight + emphasis (grid mode, all tokens have yomigana → emphasis-row only, no .skam-emphasis) */
const GRID_EMPHASIS_YOMIGANA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" style="solid" ref="ref-a">
        <skam:span type="emphasis" style="sesame">
          <skam:kun yomi="まな" okuri="ビテ">學</skam:kun>
        </skam:span>
        <skam:ref xml:id="ref-a" format="alpha-upper"/>
      </skam:span>
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:kun soe="ヲ">之</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
</skam:doc>`;

/** XML with highlight + emphasis (傍点) for emphasis clearance testing */
const HIGHLIGHT_WITH_EMPHASIS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" style="solid" ref="ref-a">
        <skam:span type="emphasis" style="sesame">
          <skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而
        </skam:span>
        <skam:ref xml:id="ref-a" format="alpha-upper"/>
      </skam:span>
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:kun soe="ヲ">之</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
</skam:doc>`;

async function loadXmlAndWait(page: Page, xml: string): Promise<void> {
  await page.goto('/');
  await page.fill('#xml-input', xml);
  await page.waitForTimeout(400);
}

/** Get bounding rect via evaluate to avoid Playwright's auto-scrolling */
async function getBoundingRect(page: Page, selector: string, index = 0): Promise<DOMRect | null> {
  return page.evaluate(
    ({ sel, idx }) => {
      const els = document.querySelectorAll(sel);
      const el = els[idx];
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        toJSON: rect.toJSON,
      } as DOMRect;
    },
    { sel: selector, idx: index }
  );
}

/** Get all bounding rects for elements matching a selector */
async function getAllBoundingRects(page: Page, selector: string): Promise<DOMRect[]> {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel)).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        toJSON: rect.toJSON,
      } as DOMRect;
    });
  }, selector);
}

test.describe('Highlight layout measurements (vertical writing)', () => {
  test('highlight line should not overlap with ruby annotations', async ({ page }) => {
    await loadXmlAndWait(page, HIGHLIGHT_WITH_RUBY_XML);

    // Ensure vertical writing mode (default)
    await expect(page.locator('input[name="writing-mode"][value="vertical"]')).toBeChecked();

    // Get highlight-content bounding rect (the element where the line is drawn)
    const highlightContentRects = await getAllBoundingRects(page, '.skam-highlight-content');
    expect(highlightContentRects.length).toBeGreaterThan(0);

    // Get ruby element rects inside highlight
    const rubyInsideHighlightRects = await page.evaluate(() => {
      const results: {
        ruby: DOMRect;
        highlightContent: DOMRect;
      }[] = [];
      const highlightContents = document.querySelectorAll('.skam-highlight-content');
      for (const hc of highlightContents) {
        const hcRect = hc.getBoundingClientRect();
        // Find ruby elements (both <rt> and .skam-ruby)
        const rubyEls = hc.querySelectorAll('rt, .skam-ruby');
        for (const ruby of rubyEls) {
          const rubyRect = ruby.getBoundingClientRect();
          results.push({
            ruby: {
              x: rubyRect.x,
              y: rubyRect.y,
              width: rubyRect.width,
              height: rubyRect.height,
              top: rubyRect.top,
              right: rubyRect.right,
              bottom: rubyRect.bottom,
              left: rubyRect.left,
              toJSON: rubyRect.toJSON,
            } as DOMRect,
            highlightContent: {
              x: hcRect.x,
              y: hcRect.y,
              width: hcRect.width,
              height: hcRect.height,
              top: hcRect.top,
              right: hcRect.right,
              bottom: hcRect.bottom,
              left: hcRect.left,
              toJSON: hcRect.toJSON,
            } as DOMRect,
          });
        }
      }
      return results;
    });

    // Log measurements for debugging
    console.log('Ruby-Highlight measurements:', JSON.stringify(rubyInsideHighlightRects, null, 2));

    // In vertical writing, the highlight line is at the RIGHT edge of highlight-content.
    // Ruby text should not extend to the right edge where the line is drawn.
    // The ruby's right edge should be less than the highlight-content's right edge,
    // with at least 1px gap for the line itself.
    for (const { ruby, highlightContent } of rubyInsideHighlightRects) {
      const gap = highlightContent.right - ruby.right;
      console.log(
        `Ruby right: ${ruby.right}, HighlightContent right: ${highlightContent.right}, Gap: ${gap}px`
      );
      expect(
        gap,
        `Ruby annotation (right=${ruby.right}) overlaps highlight line (right=${highlightContent.right}). Gap=${gap}px, need > 1px`
      ).toBeGreaterThan(1);
    }
  });

  test('highlight ref label should not extend beyond column boundary', async ({ page }) => {
    await loadXmlAndWait(page, HIGHLIGHT_LABELS_XML);

    // Ensure vertical writing mode
    await expect(page.locator('input[name="writing-mode"][value="vertical"]')).toBeChecked();

    // Get ref labels and their containing highlight elements
    const labelMeasurements = await page.evaluate(() => {
      const results: {
        label: DOMRect;
        highlight: DOMRect;
        column: DOMRect;
      }[] = [];
      const labels = document.querySelectorAll('.skam-highlight-content > .skam-ref');
      for (const label of labels) {
        const labelRect = label.getBoundingClientRect();
        // Walk up to find .skam-highlight
        const highlight = label.closest('.skam-highlight');
        if (!highlight) continue;
        const highlightRect = highlight.getBoundingClientRect();
        // Find the column container (block element)
        const block = highlight.closest('.skam-block');
        const column = block ?? highlight.parentElement;
        if (!column) continue;
        const columnRect = column.getBoundingClientRect();
        results.push({
          label: {
            x: labelRect.x,
            y: labelRect.y,
            width: labelRect.width,
            height: labelRect.height,
            top: labelRect.top,
            right: labelRect.right,
            bottom: labelRect.bottom,
            left: labelRect.left,
            toJSON: labelRect.toJSON,
          } as DOMRect,
          highlight: {
            x: highlightRect.x,
            y: highlightRect.y,
            width: highlightRect.width,
            height: highlightRect.height,
            top: highlightRect.top,
            right: highlightRect.right,
            bottom: highlightRect.bottom,
            left: highlightRect.left,
            toJSON: highlightRect.toJSON,
          } as DOMRect,
          column: {
            x: columnRect.x,
            y: columnRect.y,
            width: columnRect.width,
            height: columnRect.height,
            top: columnRect.top,
            right: columnRect.right,
            bottom: columnRect.bottom,
            left: columnRect.left,
            toJSON: columnRect.toJSON,
          } as DOMRect,
        });
      }
      return results;
    });

    console.log('Label measurements:', JSON.stringify(labelMeasurements, null, 2));

    // In vertical-rl, "previous column" is to the RIGHT.
    // The ref label should not extend to the right beyond the highlight's padding area.
    for (const { label, highlight } of labelMeasurements) {
      const overshoot = label.right - highlight.right;
      console.log(
        `Label right: ${label.right}, Highlight right: ${highlight.right}, Overshoot: ${overshoot}px`
      );
      expect(
        overshoot,
        `Ref label (right=${label.right}) extends ${overshoot}px beyond highlight boundary (right=${highlight.right})`
      ).toBeLessThanOrEqual(0);
    }
  });

  test('report all highlight layout metrics', async ({ page }) => {
    await loadXmlAndWait(page, HIGHLIGHT_WITH_RUBY_XML);

    // Comprehensive measurement dump for analysis
    const metrics = await page.evaluate(() => {
      const highlights = document.querySelectorAll('.skam-highlight');
      return Array.from(highlights).map((hl, i) => {
        const hlRect = hl.getBoundingClientRect();
        const content = hl.querySelector('.skam-highlight-content');
        const contentRect = content?.getBoundingClientRect();
        const ref = hl.querySelector('.skam-ref');
        const refRect = ref?.getBoundingClientRect();
        const rubies = hl.querySelectorAll('rt, .skam-ruby');
        const rubyRects = Array.from(rubies).map((r) => {
          const rr = r.getBoundingClientRect();
          return {
            right: rr.right,
            left: rr.left,
            top: rr.top,
            bottom: rr.bottom,
            width: rr.width,
            height: rr.height,
            text: r.textContent,
          };
        });
        // Also get suffix elements (okurigana, soegana)
        const suffixes = hl.querySelectorAll('[class*="suffix-okuri"], [class*="suffix-kana"]');
        const suffixRects = Array.from(suffixes).map((s) => {
          const sr = s.getBoundingClientRect();
          return {
            right: sr.right,
            left: sr.left,
            top: sr.top,
            bottom: sr.bottom,
            width: sr.width,
            height: sr.height,
            text: s.textContent,
          };
        });

        return {
          index: i,
          highlight: {
            right: hlRect.right,
            left: hlRect.left,
            top: hlRect.top,
            bottom: hlRect.bottom,
            width: hlRect.width,
          },
          content: contentRect
            ? {
                right: contentRect.right,
                left: contentRect.left,
                top: contentRect.top,
                bottom: contentRect.bottom,
                width: contentRect.width,
              }
            : null,
          ref: refRect
            ? {
                right: refRect.right,
                left: refRect.left,
                top: refRect.top,
                bottom: refRect.bottom,
                width: refRect.width,
                text: ref?.textContent,
              }
            : null,
          rubies: rubyRects,
          suffixes: suffixRects,
        };
      });
    });

    console.log('=== Highlight Layout Metrics ===');
    console.log(JSON.stringify(metrics, null, 2));

    // This test always passes - it's a measurement reporter
    expect(metrics.length).toBeGreaterThan(0);
  });

  test('highlight line should have extra clearance when emphasis is present', async ({ page }) => {
    await loadXmlAndWait(page, HIGHLIGHT_WITH_EMPHASIS_XML);

    // Ensure vertical writing mode
    await expect(page.locator('input[name="writing-mode"][value="vertical"]')).toBeChecked();

    // Verify emphasis is inside highlight
    const hasEmphasisInHighlight = await page.evaluate(() => {
      const hc = document.querySelector('.skam-highlight-content');
      return hc?.querySelector('.skam-emphasis') !== null;
    });
    expect(hasEmphasisInHighlight).toBe(true);

    // Measure highlight-content padding (computed style)
    const contentPaddingRight = await page.evaluate(() => {
      const hc = document.querySelector('.skam-highlight-content');
      if (!hc) return '0px';
      return getComputedStyle(hc).paddingRight;
    });
    console.log(`HighlightContent padding-right (with emphasis): ${contentPaddingRight}`);

    // Get the highlight-content and highlight rects
    const measurements = await page.evaluate(() => {
      const hc = document.querySelector('.skam-highlight-content');
      const hl = document.querySelector('.skam-highlight');
      if (!hc || !hl) return null;
      const hcRect = hc.getBoundingClientRect();
      const hlRect = hl.getBoundingClientRect();
      // Also get ruby rects inside
      const rubyEls = hc.querySelectorAll('rt, .skam-ruby');
      const rubies = Array.from(rubyEls).map((r) => {
        const rr = r.getBoundingClientRect();
        return { right: rr.right, text: r.textContent };
      });
      // Get suffix rects
      const suffixEls = hc.querySelectorAll('[class*="suffix-okuri"], [class*="suffix-kana"]');
      const suffixes = Array.from(suffixEls).map((s) => {
        const sr = s.getBoundingClientRect();
        return { right: sr.right, text: s.textContent };
      });
      return {
        contentRight: hcRect.right,
        highlightRight: hlRect.right,
        contentWidth: hcRect.width,
        highlightWidth: hlRect.width,
        rubies,
        suffixes,
      };
    });

    console.log('Emphasis+Highlight measurements:', JSON.stringify(measurements, null, 2));

    expect(measurements).not.toBeNull();

    // The highlight-content padding-right should be larger when emphasis is present.
    // text-emphasis dots extend ~0.5em from the text edge (not measurable via DOM).
    // We need padding-right >= 1em to clear emphasis dots + provide gap.
    const paddingPx = parseFloat(contentPaddingRight);
    expect(
      paddingPx,
      `HighlightContent padding-right (${paddingPx}px) should be >= 1em (~16px) when emphasis is present to clear emphasis dots`
    ).toBeGreaterThanOrEqual(16);

    // Ruby should still be within highlight-content's right edge
    if (measurements) {
      for (const ruby of measurements.rubies) {
        const gap = measurements.contentRight - ruby.right;
        console.log(
          `Ruby right: ${ruby.right}, Content right: ${measurements.contentRight}, Gap: ${gap}px`
        );
        expect(
          gap,
          `Ruby (right=${ruby.right}) should be inside highlight-content (right=${measurements.contentRight})`
        ).toBeGreaterThan(1);
      }
    }
  });

  test('grid mode: emphasis-row should not overlap with highlight line when yomigana is present', async ({
    page,
  }) => {
    await loadXmlAndWait(page, GRID_EMPHASIS_YOMIGANA_XML);

    // Ensure vertical writing mode (default) and grid ruby method (default)
    await expect(page.locator('input[name="writing-mode"][value="vertical"]')).toBeChecked();
    await expect(page.locator('input[name="ruby-method"][value="grid"]')).toBeChecked();

    // Verify emphasis-row exists but no .skam-emphasis inside highlight
    const emphasisInfo = await page.evaluate(() => {
      const hc = document.querySelector('.skam-highlight-content');
      if (!hc) return null;
      const hasEmphasisClass = hc.querySelector('.skam-emphasis') !== null;
      const hasEmphasisRow = hc.querySelector('.skam-emphasis-row') !== null;
      return { hasEmphasisClass, hasEmphasisRow };
    });

    console.log('Emphasis info:', JSON.stringify(emphasisInfo));
    expect(emphasisInfo).not.toBeNull();
    expect(emphasisInfo!.hasEmphasisRow).toBe(true);

    // Measure emphasis-row position vs highlight line position
    const measurements = await page.evaluate(() => {
      const hc = document.querySelector('.skam-highlight-content');
      const hl = document.querySelector('.skam-highlight');
      const emphasisRow = document.querySelector('.skam-highlight-content .skam-emphasis-row');
      if (!hc || !hl || !emphasisRow) return null;
      const hcRect = hc.getBoundingClientRect();
      const hlRect = hl.getBoundingClientRect();
      const erRect = emphasisRow.getBoundingClientRect();
      const paddingRight = getComputedStyle(hc).paddingRight;
      return {
        highlightContentRight: hcRect.right,
        highlightRight: hlRect.right,
        emphasisRowRight: erRect.right,
        emphasisRowWidth: erRect.width,
        contentPaddingRight: paddingRight,
        gap: hcRect.right - erRect.right,
      };
    });

    console.log('Grid emphasis measurements:', JSON.stringify(measurements, null, 2));

    expect(measurements).not.toBeNull();
    if (!measurements) return;

    // The highlight line is drawn at highlight-content's right edge (via box-shadow inset).
    // The emphasis-row should be inside the content area, with padding providing clearance.
    // Gap between emphasis-row right edge and highlight-content right edge should be > 1px.
    expect(
      measurements.gap,
      `Emphasis-row (right=${measurements.emphasisRowRight}) overlaps highlight line (content right=${measurements.highlightContentRight}). Gap=${measurements.gap}px, need > 1px`
    ).toBeGreaterThan(1);

    // Padding should be >= 1em for emphasis clearance
    const paddingPx = parseFloat(measurements.contentPaddingRight);
    expect(
      paddingPx,
      `padding-right (${paddingPx}px) should be >= 1em (~16px) for emphasis clearance`
    ).toBeGreaterThanOrEqual(16);
  });

  test('emphasis highlight should not overlap with adjacent column', async ({ page }) => {
    await loadXmlAndWait(page, EMPHASIS_COLUMN_OVERLAP_XML);

    // Ensure vertical writing mode
    await expect(page.locator('input[name="writing-mode"][value="vertical"]')).toBeChecked();

    // Get bounding rects for both blocks (columns in vertical-rl)
    const columnMeasurements = await page.evaluate(() => {
      const blocks = document.querySelectorAll('.skam-block');
      if (blocks.length < 2) return null;
      // In vertical-rl, first block is rightmost, second block is to the left
      const block1Rect = blocks[0]!.getBoundingClientRect();
      const block2Rect = blocks[1]!.getBoundingClientRect();
      const highlight = blocks[0]!.querySelector('.skam-highlight');
      const highlightRect = highlight?.getBoundingClientRect();
      return {
        block1: {
          left: block1Rect.left,
          right: block1Rect.right,
          width: block1Rect.width,
        },
        block2: {
          left: block2Rect.left,
          right: block2Rect.right,
          width: block2Rect.width,
        },
        highlight: highlightRect
          ? {
              left: highlightRect.left,
              right: highlightRect.right,
              width: highlightRect.width,
            }
          : null,
        gap: block1Rect.left - block2Rect.right,
      };
    });

    console.log('Column overlap measurements:', JSON.stringify(columnMeasurements, null, 2));

    expect(columnMeasurements).not.toBeNull();
    if (!columnMeasurements) return;

    // In vertical-rl, block1 is to the RIGHT, block2 is to the LEFT.
    // block2.right should be <= block1.left (no overlap).
    // The gap between columns should be >= 0.
    expect(
      columnMeasurements.gap,
      `Adjacent column (right=${columnMeasurements.block2.right}) overlaps with highlight column (left=${columnMeasurements.block1.left}). Gap=${columnMeasurements.gap}px`
    ).toBeGreaterThanOrEqual(0);

    // Additionally, the highlight should be fully contained within its block
    if (columnMeasurements.highlight) {
      const hlOvershoot = columnMeasurements.highlight.right - columnMeasurements.block1.right;
      console.log(
        `Highlight right: ${columnMeasurements.highlight.right}, Block1 right: ${columnMeasurements.block1.right}, Overshoot: ${hlOvershoot}px`
      );
      expect(
        hlOvershoot,
        `Highlight (right=${columnMeasurements.highlight.right}) extends ${hlOvershoot}px beyond its column (right=${columnMeasurements.block1.right})`
      ).toBeLessThanOrEqual(0);
    }
  });
});

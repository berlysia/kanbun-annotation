/**
 * SKAM Playground
 */

import { parse, SKAMXMLParseError } from '@kanbun/skam-xml-parser';
import { stringify } from '@kanbun/skam-xml-stringify';
import {
  render,
  attachInteractiveHandlers,
  setSelectionClasses,
  clearSelection,
  calibrateGridBaseline,
  PROFILES,
  type RenderProfile,
  type RubyMethod,
} from '@kanbun/skam-html-renderer';
import type {
  SKAMDocument,
  RefFormat,
  Mark,
  EmphasisMark,
  HighlightMark,
  SaidokuMark,
} from '@kanbun/skam';
import {
  addMark,
  addMarkWithResult,
  removeMark,
  removeHighlightWithRef,
  updateMark,
  getMarksForToken,
  getMarksForRange,
  getMarksExactRange,
  getMarkById,
  getBlockForToken,
  getTokenIndex,
  getTokenByIndex,
  getAnchorText,
  getAnchorRangeLabel,
  sortMarksByPosition,
  generateId,
  hasMarkValue,
  isExactAnchorMatch,
} from '@kanbun/skam';
import {
  render as canvasRender,
  measure as canvasMeasure,
  loadDefaultFont,
  type CanvasRenderingContext2DLike,
  type CanvasLike,
} from '@kanbun/skam-canvas-renderer';
import { SAMPLES } from './samples.js';
import { ErrorPanel, type ParseError } from './editor/error-panel.js';
import { XmlEditor } from './editor/xml-editor.js';

// ============================================================================
// DOM Elements
// ============================================================================

const xmlEditorWrapper = document.querySelector('.xml-editor-wrapper') as HTMLDivElement;
const parseBtn = document.getElementById('parse-btn') as HTMLButtonElement;
const errorPanelContainer = document.getElementById('error-panel') as HTMLDivElement;
const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const jsonOutput = document.getElementById('json-output')?.querySelector('code') as HTMLElement;
const renderOutput = document.getElementById('render-output') as HTMLDivElement;
const htmlOutput = document.getElementById('html-output')?.querySelector('code') as HTMLElement;
const sampleSelect = document.getElementById('sample-select') as HTMLSelectElement;
const copyJsonBtn = document.getElementById('copy-json-btn') as HTMLButtonElement;
const copyHtmlBtn = document.getElementById('copy-html-btn') as HTMLButtonElement;
const rendererRadios = document.querySelectorAll<HTMLInputElement>('input[name="renderer"]');
const canvasNotice = document.getElementById('canvas-notice') as HTMLParagraphElement;
const writingModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="writing-mode"]');
const rubyMethodRadios = document.querySelectorAll<HTMLInputElement>('input[name="ruby-method"]');
const horizontalNotice = document.getElementById('horizontal-notice') as HTMLSpanElement;
const inlineModeCheckbox = document.getElementById('inline-mode') as HTMLInputElement;
const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
const profileCheckboxes = document.getElementById('profile-checkboxes') as HTMLDivElement;

// 2-pane layout elements
const editorContainer = document.querySelector('.editor-container') as HTMLDivElement;
const xmlPane = document.querySelector('.xml-pane') as HTMLDivElement;
const divider = document.getElementById('divider') as HTMLDivElement;
const previewPane = document.querySelector('.preview-pane') as HTMLDivElement;

// CSS Customize elements
// Selection panel elements
const selectionInfo = document.getElementById('selection-info') as HTMLDivElement;
const selectionActions = document.getElementById('selection-actions') as HTMLDivElement;
const selectionTatetenBtn = document.getElementById('selection-tateten-btn') as HTMLButtonElement;
const selectionEmphasisBtn = document.getElementById('selection-emphasis-btn') as HTMLButtonElement;
const selectionEmphasisStyles = document.getElementById(
  'selection-emphasis-styles'
) as HTMLDivElement;
const selectionUnderlineStyles = document.getElementById(
  'selection-underline-styles'
) as HTMLDivElement;
const selectionUnderlineRefInput = document.getElementById(
  'selection-underline-ref'
) as HTMLInputElement;
const selectionUnderlineFormatSelect = document.getElementById(
  'selection-underline-format'
) as HTMLSelectElement;
const selectionUnderlineBtn = document.getElementById(
  'selection-underline-btn'
) as HTMLButtonElement;
const selectionKaeriButtons = document.getElementById('selection-kaeri-buttons') as HTMLDivElement;
const selectionKanaTypes = document.getElementById('selection-kana-types') as HTMLDivElement;
const selectionKanaInput = document.getElementById('selection-kana-input') as HTMLInputElement;
const selectionKanaApply = document.getElementById('selection-kana-apply') as HTMLButtonElement;
const selectionSaidokuBtn = document.getElementById('selection-saidoku-btn') as HTMLButtonElement;
const selectionSaidokuReread = document.getElementById(
  'selection-saidoku-reread'
) as HTMLDivElement;
const selectionSaidokuRereadYomi = document.getElementById(
  'selection-saidoku-reread-yomi'
) as HTMLInputElement;
const selectionSaidokuRereadOkuri = document.getElementById(
  'selection-saidoku-reread-okuri'
) as HTMLInputElement;
const selectionSaidokuRereadApply = document.getElementById(
  'selection-saidoku-reread-apply'
) as HTMLButtonElement;

// Marks list panel elements
const marksList = document.getElementById('marks-list') as HTMLDivElement;

const colorKaeritenInput = document.getElementById('color-kaeriten') as HTMLInputElement;
const colorRubyInput = document.getElementById('color-ruby') as HTMLInputElement;
const colorEmphasisInput = document.getElementById('color-emphasis') as HTMLInputElement;
const fontFamilySelect = document.getElementById('font-family') as HTMLSelectElement;
const glyphSizeInput = document.getElementById('glyph-size') as HTMLInputElement;
const glyphSizeValue = document.getElementById('glyph-size-value') as HTMLSpanElement;
const rubyRatioInput = document.getElementById('ruby-ratio') as HTMLInputElement;
const rubyRatioValue = document.getElementById('ruby-ratio-value') as HTMLSpanElement;
const lineHeightInput = document.getElementById('line-height') as HTMLInputElement;
const lineHeightValue = document.getElementById('line-height-value') as HTMLSpanElement;
const resetCustomizeBtn = document.getElementById('reset-customize-btn') as HTMLButtonElement;

// ============================================================================
// State
// ============================================================================

let currentDocument: SKAMDocument | null = null;

// Current selection state for panel actions
// Position-based selection (token index) - survives parse/stringify round-trip
let currentSelectionRange: { fromIndex: number; toIndex: number } | null = null;
// Token ID-based selection - derived from range + currentDocument
let currentSelectionFromId: string | null = null;
let currentSelectionToId: string | null = null;

// Existing kana values by type for the current selection
let currentKanaValues: Record<'yomigana' | 'okurigana' | 'soegana', string> = {
  yomigana: '',
  okurigana: '',
  soegana: '',
};

// Currently selected kana type in the panel
let currentSelectedKanaType: 'yomigana' | 'okurigana' | 'soegana' = 'yomigana';

// Kaeriten definitions for selection panel
// group: 'レ' can coexist with others, same group values are mutually exclusive
const KAERI_GROUPS: Array<{ group: string; values: Array<{ label: string; value: string }> }> = [
  { group: 're', values: [{ label: 'レ', value: 'レ' }] },
  {
    group: 'number',
    values: [
      { label: '一', value: '一' },
      { label: '二', value: '二' },
      { label: '三', value: '三' },
      { label: '四', value: '四' },
    ],
  },
  {
    group: 'joge',
    values: [
      { label: '上', value: '上' },
      { label: '中', value: '中' },
      { label: '下', value: '下' },
    ],
  },
  {
    group: 'kouotsu',
    values: [
      { label: '甲', value: '甲' },
      { label: '乙', value: '乙' },
      { label: '丙', value: '丙' },
      { label: '丁', value: '丁' },
    ],
  },
  {
    group: 'tenchijin',
    values: [
      { label: '天', value: '天' },
      { label: '地', value: '地' },
      { label: '人', value: '人' },
    ],
  },
];

// Current kaeri selection state (toggle-based)
// レ点 can coexist with one value from other groups
let currentKaeriRe: boolean = false;
let currentKaeriOther: string | null = null; // value from number/joge/kouotsu/tenchijin

// Current tateten (竪点) state
// - null: no tateten for current selection
// - string: mark ID of existing tateten that matches selection range
let currentTatetenMarkId: string | null = null;

// Current emphasis (傍点) state
// - null: no emphasis for current selection
// - string: mark ID of existing emphasis that overlaps selection range
let currentEmphasisMarkId: string | null = null;
// Whether the emphasis mark exactly matches the selection range (vs partial overlap)
let currentEmphasisIsExactMatch = false;

// Selected emphasis style (CSS text-emphasis-style values)
type EmphasisStyle =
  | 'dot'
  | 'circle'
  | 'double-circle'
  | 'triangle'
  | 'sesame'
  | 'filled dot'
  | 'filled circle'
  | 'filled double-circle'
  | 'filled triangle'
  | 'filled sesame'
  | 'open dot'
  | 'open circle'
  | 'open double-circle'
  | 'open triangle'
  | 'open sesame';
let currentEmphasisStyle: EmphasisStyle = 'filled dot'; // CSS default

// CSS text-emphasis-style treats bare shape (e.g. 'dot') as 'filled dot'.
// Normalize for comparison so 'dot' and 'filled dot' are equivalent.
function normalizeEmphasisStyle(style: string): string {
  return style.replace(/^filled /, '');
}

// Current underline/highlight (傍線) state
// - null: no underline for current selection
// - string: mark ID of existing highlight that overlaps selection range
let currentUnderlineMarkId: string | null = null;
// Whether the underline mark exactly matches the selection range (vs partial overlap)
let currentUnderlineIsExactMatch = false;

// Selected underline style
type UnderlineStyle = 'solid' | 'dotted' | 'dashed' | 'wavy' | 'double';
let currentUnderlineStyle: UnderlineStyle = 'solid';

// Current underline ref value (from existing mark or empty for new)
let currentUnderlineRef: string = '';

// Current underline ref format
let currentUnderlineFormat: RefFormat | '' = '';

// Current saidoku (再読文字) state
// - null: no saidoku for current selection
// - string: mark ID of existing saidoku that overlaps selection range
let currentSaidokuMarkId: string | null = null;
// Whether the saidoku mark exactly matches the selection range (vs partial overlap)
let currentSaidokuIsExactMatch = false;
// Reread part values (forms[1]) for display
let currentSaidokuRereadYomi = '';
let currentSaidokuRereadOkuri = '';

// Selection mode: determines what controls are available
// - 'single': single character selected - kaeri enabled, tateten disabled
// - 'multi': multiple characters selected without tateten - kaeri disabled, tateten enabled
// - 'tateten': selection matches a tateten range - kaeri enabled, tateten shows "解除"
let currentSelectionMode: 'single' | 'multi' | 'tateten' = 'single';

// Cleanup function for interactive handlers
let cleanupInteractiveHandlers: (() => void) | null = null;

// Initialize XML Editor with syntax highlighting
const xmlEditor = new XmlEditor(xmlEditorWrapper, {
  debounceMs: 300,
  showLineNumbers: true,
});

// Error Panel instance
const errorPanel = new ErrorPanel(errorPanelContainer);

// Setup error click callback to scroll to error line in editor
errorPanel.onErrorClick((line, _column) => {
  xmlEditor.scrollToLine(line);
});

// CSS Customize state
interface CustomizeState {
  colorKaeriten: string;
  colorRuby: string;
  colorEmphasis: string;
  fontFamily: string;
  glyphSize: string;
  rubyRatio: string;
  lineHeight: string;
}

const DEFAULT_CUSTOMIZE_STATE: CustomizeState = {
  colorKaeriten: '#000000',
  colorRuby: '#000000',
  colorEmphasis: '#000000',
  fontFamily: "'Noto Serif JP', serif",
  glyphSize: '2',
  rubyRatio: '0.5',
  lineHeight: '2',
};

// ============================================================================
// URL State Management
// ============================================================================

type ProfileName = keyof typeof PROFILES;
type ProfileNameOrCustom = ProfileName | 'custom';

// Current profile settings (initialized from PROFILES.full)
let currentProfileSettings: RenderProfile = { ...PROFILES.full };

interface URLState {
  sample: number;
  renderer: 'html' | 'canvas';
  mode: 'vertical' | 'horizontal';
  inline: boolean;
  profile: ProfileName;
  rubyMethod: RubyMethod;
}

function getStateFromURL(): URLState {
  const params = new URLSearchParams(window.location.search);

  const sampleStr = params.get('sample');
  let sample = 0;
  if (sampleStr !== null) {
    const parsed = parseInt(sampleStr, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed < SAMPLES.length) {
      sample = parsed;
    }
  }

  const rendererStr = params.get('renderer');
  const renderer: 'html' | 'canvas' = rendererStr === 'canvas' ? 'canvas' : 'html';

  const modeStr = params.get('mode');
  const mode: 'vertical' | 'horizontal' = modeStr === 'horizontal' ? 'horizontal' : 'vertical';

  const inlineStr = params.get('inline');
  const inline = inlineStr === '1';

  const profileStr = params.get('profile');
  const profile: ProfileName =
    profileStr === 'learningBasic' || profileStr === 'learningHint' ? profileStr : 'full';

  const rubyMethodStr = params.get('rubyMethod');
  const rubyMethod: RubyMethod = rubyMethodStr === 'ruby' ? 'ruby' : 'grid';

  return { sample, renderer, mode, inline, profile, rubyMethod };
}

function updateURL(state: Partial<URLState>): void {
  const params = new URLSearchParams(window.location.search);

  if (state.sample !== undefined) {
    if (state.sample === 0) {
      params.delete('sample');
    } else {
      params.set('sample', String(state.sample));
    }
  }

  if (state.renderer !== undefined) {
    if (state.renderer === 'html') {
      params.delete('renderer');
    } else {
      params.set('renderer', state.renderer);
    }
  }

  if (state.mode !== undefined) {
    if (state.mode === 'vertical') {
      params.delete('mode');
    } else {
      params.set('mode', state.mode);
    }
  }

  if (state.inline !== undefined) {
    if (state.inline) {
      params.set('inline', '1');
    } else {
      params.delete('inline');
    }
  }

  if (state.profile !== undefined) {
    if (state.profile === 'full') {
      params.delete('profile');
    } else {
      params.set('profile', state.profile);
    }
  }

  if (state.rubyMethod !== undefined) {
    if (state.rubyMethod === 'grid') {
      params.delete('rubyMethod');
    } else {
      params.set('rubyMethod', state.rubyMethod);
    }
  }

  const queryString = params.toString();
  const newURL = queryString
    ? `${window.location.pathname}?${queryString}`
    : window.location.pathname;

  window.history.replaceState(null, '', newURL);
}

// ============================================================================
// Functions
// ============================================================================

function showErrors(errors: ParseError[]): void {
  errorPanel.setErrors(errors);
}

function hideErrors(): void {
  errorPanel.clear();
}

function getCustomizeState(): CustomizeState {
  return {
    colorKaeriten: colorKaeritenInput.value,
    colorRuby: colorRubyInput.value,
    colorEmphasis: colorEmphasisInput.value,
    fontFamily: fontFamilySelect.value,
    glyphSize: glyphSizeInput.value,
    rubyRatio: rubyRatioInput.value,
    lineHeight: lineHeightInput.value,
  };
}

function updateRangeDisplays(): void {
  glyphSizeValue.textContent = `${glyphSizeInput.value}em`;
  rubyRatioValue.textContent = rubyRatioInput.value;
  lineHeightValue.textContent = lineHeightInput.value;
}

function applyCustomStyles(): void {
  const state = getCustomizeState();
  const styleId = 'skam-playground-customize';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  // Apply CSS Variables to override defaults (in skam-overrides layer to override skam-kanbun)
  const css = `@layer skam-overrides {
  .skam-document {
    --skam-color-kaeriten: ${state.colorKaeriten};
    --skam-color-ruby: ${state.colorRuby};
    --skam-color-emphasis: ${state.colorEmphasis};
    --skam-font-family: ${state.fontFamily};
    --skam-glyph-size: ${state.glyphSize}em;
    --skam-ruby-ratio: ${state.rubyRatio};
    --skam-line-height: ${state.lineHeight};
  }
}`;
  styleEl.textContent = css;
  updateRangeDisplays();

  // Canvas mode: re-render with new customize values
  if (getRendererMode() === 'canvas' && currentDocument) {
    renderCanvasDocument(currentDocument);
  }
}

function resetCustomize(): void {
  colorKaeritenInput.value = DEFAULT_CUSTOMIZE_STATE.colorKaeriten;
  colorRubyInput.value = DEFAULT_CUSTOMIZE_STATE.colorRuby;
  colorEmphasisInput.value = DEFAULT_CUSTOMIZE_STATE.colorEmphasis;
  fontFamilySelect.value = DEFAULT_CUSTOMIZE_STATE.fontFamily;
  glyphSizeInput.value = DEFAULT_CUSTOMIZE_STATE.glyphSize;
  rubyRatioInput.value = DEFAULT_CUSTOMIZE_STATE.rubyRatio;
  lineHeightInput.value = DEFAULT_CUSTOMIZE_STATE.lineHeight;
  applyCustomStyles();
}

function getRendererMode(): 'html' | 'canvas' {
  for (const radio of rendererRadios) {
    if (radio.checked) {
      return radio.value as 'html' | 'canvas';
    }
  }
  return 'html';
}

let canvasFontLoaded = false;

async function ensureCanvasFontLoaded(): Promise<void> {
  if (canvasFontLoaded) return;
  await loadDefaultFont();
  canvasFontLoaded = true;
}

function getWritingMode(): 'vertical' | 'horizontal' {
  for (const radio of writingModeRadios) {
    if (radio.checked) {
      return radio.value as 'vertical' | 'horizontal';
    }
  }
  return 'vertical';
}

function getInlineMode(): boolean {
  return inlineModeCheckbox.checked;
}

function getRubyMethod(): RubyMethod {
  for (const radio of rubyMethodRadios) {
    if (radio.checked) {
      return radio.value as RubyMethod;
    }
  }
  return 'ruby';
}

function getProfile(): ProfileNameOrCustom {
  const value = profileSelect.value;
  if (value === 'learningBasic' || value === 'learningHint' || value === 'custom') {
    return value;
  }
  return 'full';
}

/**
 * Get the current profile settings for rendering
 */
function getProfileSettings(): RenderProfile {
  return { ...currentProfileSettings };
}

/**
 * Update checkboxes to match the given profile settings
 */
function syncCheckboxesToProfile(profile: RenderProfile): void {
  const checkboxes =
    profileCheckboxes.querySelectorAll<HTMLInputElement>('input[data-profile-key]');
  for (const checkbox of checkboxes) {
    const key = checkbox.dataset['profileKey'] as keyof RenderProfile;
    if (key && key in profile) {
      checkbox.checked = profile[key];
    }
  }
}

/**
 * Read checkbox states and update currentProfileSettings
 */
function readCheckboxesToProfile(): RenderProfile {
  const profile: RenderProfile = { ...PROFILES.full };
  const checkboxes =
    profileCheckboxes.querySelectorAll<HTMLInputElement>('input[data-profile-key]');
  for (const checkbox of checkboxes) {
    const key = checkbox.dataset['profileKey'] as keyof RenderProfile;
    if (key && key in profile) {
      profile[key] = checkbox.checked;
    }
  }
  return profile;
}

/**
 * Set profile to custom mode
 */
function setCustomProfile(): void {
  const customOption = profileSelect.querySelector<HTMLOptionElement>('option[value="custom"]');
  if (customOption) {
    customOption.disabled = false;
  }
  profileSelect.value = 'custom';
  // Update URL to remove profile (custom is not saved)
  updateURL({ profile: 'full' });
}

/**
 * Apply a preset profile
 */
function applyPresetProfile(profileName: ProfileName): void {
  currentProfileSettings = { ...PROFILES[profileName] };
  syncCheckboxesToProfile(currentProfileSettings);
  profileSelect.value = profileName;
  // Disable custom option when using preset
  const customOption = profileSelect.querySelector<HTMLOptionElement>('option[value="custom"]');
  if (customOption) {
    customOption.disabled = true;
  }
}

/**
 * Find a tateten mark that exactly matches the given selection range
 */
function findTatetenForSelection(
  doc: SKAMDocument,
  fromId: string,
  toId: string
): { markId: string; kaeriValue: string | null } | null {
  const tatetenMarks = getMarksExactRange(doc, fromId, toId, 'tateten');
  const tateten = tatetenMarks[0];
  if (!tateten?.id) return null;

  // Find kaeri mark attached to the same range
  const kaeriMarks = getMarksExactRange(doc, fromId, toId, 'kaeri');
  const firstKaeri = kaeriMarks[0];
  const kaeriValue = firstKaeri && hasMarkValue(firstKaeri) ? String(firstKaeri.value) : null;

  return { markId: tateten.id, kaeriValue };
}

/**
 * Normalize a selection range to canonical (blocks) order
 * Returns null if either token ID is invalid
 */
function normalizeSelection(
  doc: SKAMDocument,
  fromId: string,
  toId: string
): { fromId: string; toId: string; fromIndex: number; toIndex: number } | null {
  const fromIdx = getTokenIndex(doc, fromId);
  const toIdx = getTokenIndex(doc, toId);
  if (fromIdx === undefined || toIdx === undefined) return null;

  const startIndex = Math.min(fromIdx, toIdx);
  const endIndex = Math.max(fromIdx, toIdx);
  const startToken = getTokenByIndex(doc, startIndex);
  const endToken = getTokenByIndex(doc, endIndex);
  if (!startToken || !endToken) return null;

  return { fromId: startToken.id, toId: endToken.id, fromIndex: startIndex, toIndex: endIndex };
}

/**
 * Update selection panel with current selection info
 */
function updateSelectionPanel(fromId: string, toId: string): void {
  if (!currentDocument) {
    clearSelectionPanel();
    return;
  }

  // Get token indices in canonical (blocks) order
  const fromIndex = getTokenIndex(currentDocument, fromId);
  const toIndex = getTokenIndex(currentDocument, toId);

  if (fromIndex === undefined || toIndex === undefined) {
    clearSelectionPanel();
    return;
  }

  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);

  // Update current selection state (position-based)
  currentSelectionRange = { fromIndex: startIndex, toIndex: endIndex };

  const startToken = getTokenByIndex(currentDocument, startIndex);
  const endToken = getTokenByIndex(currentDocument, endIndex);
  if (!startToken || !endToken) {
    clearSelectionPanel();
    return;
  }

  // Update tokenID-based state
  currentSelectionFromId = startToken.id;
  currentSelectionToId = endToken.id;
  const count = endIndex - startIndex + 1;
  const chars: string[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const t = getTokenByIndex(currentDocument, i);
    if (t) chars.push(t.text);
  }
  const charsText = chars.join('');

  // Normalize selection to start/end order
  const normalizedFromId = startToken.id;
  const normalizedToId = endToken.id;

  // Determine selection mode and tateten state
  const tatetenInfo = findTatetenForSelection(currentDocument, normalizedFromId, normalizedToId);
  currentTatetenMarkId = tatetenInfo?.markId ?? null;

  // Determine emphasis state via overlap detection
  const emphasisMarks = getMarksForRange(currentDocument, normalizedFromId, normalizedToId).filter(
    (m): m is EmphasisMark => m.type === 'emphasis'
  );
  if (emphasisMarks.length > 0) {
    const firstEmphasis = emphasisMarks[0]!;
    currentEmphasisMarkId = firstEmphasis.id ?? null;
    currentEmphasisIsExactMatch = isExactAnchorMatch(
      firstEmphasis,
      normalizedFromId,
      normalizedToId
    );
    if (firstEmphasis.style) {
      currentEmphasisStyle = firstEmphasis.style as EmphasisStyle;
    }
  } else {
    currentEmphasisMarkId = null;
    currentEmphasisIsExactMatch = false;
  }

  // Determine underline/highlight state via overlap detection
  const highlightMarks = getMarksForRange(currentDocument, normalizedFromId, normalizedToId).filter(
    (m): m is HighlightMark => m.type === 'highlight'
  );
  if (highlightMarks.length > 0) {
    const firstHighlight = highlightMarks[0]!;
    currentUnderlineMarkId = firstHighlight.id ?? null;
    currentUnderlineIsExactMatch = isExactAnchorMatch(
      firstHighlight,
      normalizedFromId,
      normalizedToId
    );
    currentUnderlineStyle = (firstHighlight.style as UnderlineStyle | undefined) ?? 'solid';
    // Extract ref info from highlight mark
    currentUnderlineRef = firstHighlight.ref ?? '';
    // Find associated ref mark for format
    currentUnderlineFormat = '';
    if (firstHighlight.ref) {
      const refMark = getMarkById(currentDocument, firstHighlight.ref);
      if (refMark && refMark.type === 'ref' && 'format' in refMark) {
        currentUnderlineFormat = (refMark.format as RefFormat | undefined) ?? '';
      }
    }
  } else {
    currentUnderlineMarkId = null;
    currentUnderlineIsExactMatch = false;
    currentUnderlineStyle = 'solid';
    currentUnderlineRef = '';
    currentUnderlineFormat = '';
  }

  // Determine saidoku state via overlap detection
  const saidokuMarks = getMarksForRange(currentDocument, normalizedFromId, normalizedToId).filter(
    (m): m is SaidokuMark => m.type === 'saidoku'
  );
  if (saidokuMarks.length > 0) {
    const firstSaidoku = saidokuMarks[0]!;
    currentSaidokuMarkId = firstSaidoku.id ?? null;
    currentSaidokuIsExactMatch = isExactAnchorMatch(firstSaidoku, normalizedFromId, normalizedToId);
    if (currentSaidokuIsExactMatch) {
      // Populate reread values from forms[1]
      const form1 = firstSaidoku.forms[1];
      currentSaidokuRereadYomi = form1?.yomi ?? '';
      currentSaidokuRereadOkuri = form1?.okuri ?? '';
    } else {
      currentSaidokuRereadYomi = '';
      currentSaidokuRereadOkuri = '';
    }
  } else {
    currentSaidokuMarkId = null;
    currentSaidokuIsExactMatch = false;
    currentSaidokuRereadYomi = '';
    currentSaidokuRereadOkuri = '';
  }

  if (count === 1) {
    currentSelectionMode = 'single';
  } else if (tatetenInfo) {
    currentSelectionMode = 'tateten';
  } else {
    currentSelectionMode = 'multi';
  }

  // Get kaeri value based on selection mode
  let currentKaeriValue: string | null = null;
  if (currentSelectionMode === 'tateten') {
    // For tateten range, use the kaeri attached to the tateten
    currentKaeriValue = tatetenInfo?.kaeriValue ?? null;
  } else if (currentSelectionMode === 'single') {
    // For single selection, get kaeri from that token
    const firstTokenMarks = getMarksForToken(currentDocument, fromId);
    for (const mark of firstTokenMarks) {
      if (mark.type === 'kaeri' && hasMarkValue(mark)) {
        currentKaeriValue = String(mark.value);
        break;
      }
    }
  } else if (currentSelectionMode === 'multi') {
    // For multi selection, check for kaeri at the end of the range
    const lastTokenMarks = getMarksForToken(currentDocument, currentSelectionToId!);
    for (const mark of lastTokenMarks) {
      if (mark.type === 'kaeri' && hasMarkValue(mark)) {
        currentKaeriValue = String(mark.value);
        break;
      }
    }
  }

  // Get kana marks for the entire selection range
  let currentKanaType: 'yomigana' | 'okurigana' | 'soegana' = 'yomigana';
  currentKanaValues = { yomigana: '', okurigana: '', soegana: '' };

  const rangeMarks = getMarksForRange(currentDocument, normalizedFromId, normalizedToId);
  for (const mark of rangeMarks) {
    if (hasMarkValue(mark)) {
      if (mark.type === 'yomigana' || mark.type === 'okurigana' || mark.type === 'soegana') {
        // 同タイプで未設定の場合のみ（最初に見つかったものを採用）
        if (!currentKanaValues[mark.type]) {
          currentKanaValues[mark.type] = mark.value;
        }
      }
    }
  }

  // When saidoku is active with exact match, populate kana values from forms[0]
  // (saidoku absorbs yomigana/okurigana, so they don't exist as separate marks)
  if (currentSaidokuMarkId && currentSaidokuIsExactMatch) {
    const saidokuMark = getMarkById(currentDocument, currentSaidokuMarkId) as
      | SaidokuMark
      | undefined;
    if (saidokuMark) {
      const form0 = saidokuMark.forms[0];
      if (form0?.yomi) currentKanaValues.yomigana = form0.yomi;
      if (form0?.okuri) currentKanaValues.okurigana = form0.okuri;
    }
  }

  // Determine initial kana type: prefer type with existing value, else yomigana
  if (currentKanaValues.yomigana) {
    currentKanaType = 'yomigana';
  } else if (currentKanaValues.okurigana) {
    currentKanaType = 'okurigana';
  } else if (currentKanaValues.soegana) {
    currentKanaType = 'soegana';
  } else {
    currentKanaType = 'yomigana';
  }

  // Build HTML - only selection summary, marks are shown in the marks list panel
  const html = `
    <div class="selection-summary">
      <div class="selection-count">${count}文字選択</div>
      <div class="selection-chars">${charsText}</div>
    </div>
  `;

  selectionInfo.innerHTML = html;

  // Update tateten button
  updateTatetenButton();

  // Update emphasis button
  updateEmphasisButton();

  // Update underline button
  updateUnderlineButton();

  // Update saidoku button and reread section
  updateSaidokuButton();
  updateSaidokuReread();

  // Update kaeriten buttons
  updateKaeriButtons(currentKaeriValue);

  // Update kana type buttons and input
  currentSelectedKanaType = currentKanaType;
  updateKanaTypeButtons();
  selectionKanaInput.value = currentKanaValues[currentKanaType];
  const hasKanaInput = Boolean(selectionKanaInput.value.trim());
  const hasExistingKana = Boolean(currentKanaValues[currentKanaType]);
  selectionKanaApply.disabled = !hasKanaInput && !hasExistingKana;

  // Show actions panel
  selectionActions.style.display = 'block';
}

/**
 * Update kana type buttons state
 */
function updateKanaTypeButtons(): void {
  const buttons = selectionKanaTypes.querySelectorAll<HTMLButtonElement>(
    '.selection-kana-type-btn'
  );
  for (const btn of buttons) {
    const type = btn.dataset['type'];
    // Saidoku button state is managed by updateSaidokuButton()
    if (type === 'saidoku') continue;
    const kanaType = type as 'yomigana' | 'okurigana' | 'soegana';
    btn.classList.toggle('active', kanaType === currentSelectedKanaType);
    btn.classList.toggle('has-value', Boolean(currentKanaValues[kanaType]));
  }
}

/**
 * Update tateten button based on selection mode
 */
function updateTatetenButton(): void {
  switch (currentSelectionMode) {
    case 'single':
      // Single character: tateten disabled
      selectionTatetenBtn.disabled = true;
      selectionTatetenBtn.textContent = '熟語にする';
      selectionTatetenBtn.classList.remove('active');
      break;
    case 'multi':
      // Multiple characters without tateten: can add tateten
      selectionTatetenBtn.disabled = false;
      selectionTatetenBtn.textContent = '熟語にする';
      selectionTatetenBtn.classList.remove('active');
      break;
    case 'tateten':
      // Selection matches tateten: can remove tateten
      selectionTatetenBtn.disabled = false;
      selectionTatetenBtn.textContent = '熟語を解除';
      selectionTatetenBtn.classList.add('active');
      break;
  }
}

/**
 * Update kaeriten buttons in selection panel
 */
/**
 * Parse existing kaeri value into Re + Other components
 */
function parseKaeriValue(value: string | null): { re: boolean; other: string | null } {
  if (!value) return { re: false, other: null };

  const hasRe = value.includes('レ');
  const other = value.replace('レ', '') || null;
  return { re: hasRe, other };
}

/**
 * Combine Re and Other into a kaeri value string
 * Convention: other comes first, then レ (e.g., "一レ", "上レ")
 */
function combineKaeriValue(re: boolean, other: string | null): string | null {
  if (!re && !other) return null;
  if (re && !other) return 'レ';
  if (!re && other) return other;
  return `${other}レ`;
}

function updateKaeriButtons(currentValue: string | null): void {
  selectionKaeriButtons.innerHTML = '';

  // In 'multi' mode, kaeri is placed at the end of the range (no tateten required)
  if (currentSelectionMode === 'multi') {
    const hint = document.createElement('span');
    hint.className = 'selection-kaeri-multi-hint';
    hint.textContent = '末尾に返り点をつけます';
    selectionKaeriButtons.appendChild(hint);
  }

  // Parse current value into components
  const { re, other } = parseKaeriValue(currentValue);
  currentKaeriRe = re;
  currentKaeriOther = other;

  // Add kaeri buttons by group
  for (const group of KAERI_GROUPS) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'selection-kaeri-group';

    for (const kaeri of group.values) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'selection-kaeri-btn';
      btn.textContent = kaeri.label;
      btn.dataset['value'] = kaeri.value;
      btn.dataset['group'] = group.group;

      // Check if this button should be active
      if (group.group === 're' && re) {
        btn.classList.add('active');
      } else if (group.group !== 're' && other === kaeri.value) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', () => {
        handleKaeriToggle(kaeri.value, group.group);
      });

      groupDiv.appendChild(btn);
    }

    selectionKaeriButtons.appendChild(groupDiv);
  }

  // Add clear button if there's a current value
  if (currentValue) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'selection-kaeri-btn selection-kaeri-btn--clear';
    clearBtn.textContent = '✕';
    clearBtn.title = '返り点を削除';
    clearBtn.addEventListener('click', () => {
      applyKaeriValue(null);
    });
    selectionKaeriButtons.appendChild(clearBtn);
  }
}

/**
 * Handle kaeri button toggle
 */
function handleKaeriToggle(value: string, group: string): void {
  if (group === 're') {
    // Toggle レ点
    currentKaeriRe = !currentKaeriRe;
  } else {
    // Toggle other kaeri - same value toggles off, different value replaces
    if (currentKaeriOther === value) {
      currentKaeriOther = null;
    } else {
      currentKaeriOther = value;
    }
  }

  const newValue = combineKaeriValue(currentKaeriRe, currentKaeriOther);
  applyKaeriValue(newValue);
}

/**
 * Handle tateten button click - add or remove tateten
 */
function handleTatetenToggle(): void {
  if (!currentDocument || !currentSelectionFromId || !currentSelectionToId) return;

  let newDoc = currentDocument;

  // Normalize selection range using canonical (blocks) order
  const sel = normalizeSelection(currentDocument, currentSelectionFromId, currentSelectionToId);
  if (!sel) return;
  const { fromId: normalizedFromId, toId: normalizedToId } = sel;

  if (currentSelectionMode === 'tateten' && currentTatetenMarkId) {
    // Remove existing tateten (kaeri is independent and not affected)
    newDoc = removeMark(newDoc, currentTatetenMarkId);
  } else if (currentSelectionMode === 'multi') {
    // Add new tateten
    newDoc = addMark(newDoc, {
      type: 'tateten',
      anchor: { from: normalizedFromId, to: normalizedToId },
    });
  }

  updateXmlFromDocument(newDoc);
  // parseAndRender handles selection restoration automatically
}

/**
 * Update emphasis style buttons state
 */
function updateEmphasisStyleButtons(): void {
  const buttons = selectionEmphasisStyles.querySelectorAll<HTMLButtonElement>(
    '.selection-emphasis-style-btn'
  );
  // Disable style buttons when partial overlap (can't update style of partially overlapping mark)
  const isPartialOverlap = currentEmphasisMarkId !== null && !currentEmphasisIsExactMatch;
  for (const btn of buttons) {
    const style = btn.dataset['style'] as EmphasisStyle;
    btn.classList.toggle(
      'active',
      currentEmphasisMarkId !== null &&
        currentEmphasisIsExactMatch &&
        normalizeEmphasisStyle(style) === normalizeEmphasisStyle(currentEmphasisStyle)
    );
    btn.disabled = isPartialOverlap;
  }
}

/**
 * Update emphasis button based on current selection state
 */
function updateEmphasisButton(): void {
  // Update style buttons
  updateEmphasisStyleButtons();

  if (currentEmphasisMarkId) {
    // Emphasis exists for this selection: show "解除" state
    selectionEmphasisBtn.textContent = '傍点を解除';
    selectionEmphasisBtn.classList.add('active');
  } else {
    // No emphasis: show "つける" state
    selectionEmphasisBtn.textContent = '傍点をつける';
    selectionEmphasisBtn.classList.remove('active');
  }
}

/**
 * Handle emphasis button click - add or remove emphasis
 */
function handleEmphasisToggle(): void {
  if (!currentDocument || !currentSelectionFromId || !currentSelectionToId) return;

  let newDoc = currentDocument;

  // Normalize selection range using canonical (blocks) order
  const sel = normalizeSelection(currentDocument, currentSelectionFromId, currentSelectionToId);
  if (!sel) return;
  const { fromId: normalizedFromId, toId: normalizedToId } = sel;

  if (currentEmphasisMarkId) {
    if (currentEmphasisIsExactMatch) {
      // Exact match: remove emphasis
      newDoc = removeMark(newDoc, currentEmphasisMarkId);
    } else {
      // Partial overlap: confirm removal of entire mark
      const mark = getMarkById(currentDocument, currentEmphasisMarkId);
      const range = mark ? getAnchorRangeLabel(mark) : '';
      if (
        !window.confirm(
          `選択範囲より広い傍点マーク（${range}）が存在します。マーク全体を解除しますか？`
        )
      ) {
        return;
      }
      newDoc = removeMark(newDoc, currentEmphasisMarkId);
    }
  } else {
    // No overlapping emphasis: add new
    newDoc = addMark(newDoc, {
      type: 'emphasis',
      style: currentEmphasisStyle,
      anchor: { from: normalizedFromId, to: normalizedToId },
    });
  }

  updateXmlFromDocument(newDoc);
  // parseAndRender handles selection restoration automatically
}

/**
 * Update existing emphasis with current style settings
 */
function updateExistingEmphasis(): void {
  if (
    !currentDocument ||
    !currentSelectionFromId ||
    !currentSelectionToId ||
    !currentEmphasisMarkId ||
    !currentEmphasisIsExactMatch
  )
    return;

  // Update emphasis style using updateMark
  const newDoc = updateMark(currentDocument, currentEmphasisMarkId, {
    style: currentEmphasisStyle,
  });

  updateXmlFromDocument(newDoc);
  // parseAndRender handles selection restoration automatically
}

/**
 * Update underline style buttons state
 */
function updateUnderlineStyleButtons(): void {
  const buttons = selectionUnderlineStyles.querySelectorAll<HTMLButtonElement>(
    '.selection-underline-style-btn'
  );
  // Disable style buttons when partial overlap (can't update style of partially overlapping mark)
  const isPartialOverlap = currentUnderlineMarkId !== null && !currentUnderlineIsExactMatch;
  for (const btn of buttons) {
    const style = btn.dataset['style'] as UnderlineStyle;
    btn.classList.toggle(
      'active',
      currentUnderlineMarkId !== null &&
        currentUnderlineIsExactMatch &&
        style === currentUnderlineStyle
    );
    btn.disabled = isPartialOverlap;
  }
}

/**
 * Update underline button based on current selection state
 */
function updateUnderlineButton(): void {
  // Update style buttons
  updateUnderlineStyleButtons();

  // Update ref input and format select
  selectionUnderlineRefInput.value = currentUnderlineRef;
  selectionUnderlineFormatSelect.value = currentUnderlineFormat;

  // Disable ref/format inputs when partial overlap
  const isPartialOverlap = currentUnderlineMarkId !== null && !currentUnderlineIsExactMatch;
  selectionUnderlineRefInput.disabled = isPartialOverlap;
  selectionUnderlineFormatSelect.disabled = isPartialOverlap;

  if (currentUnderlineMarkId) {
    // Underline exists for this selection: show "解除" state
    selectionUnderlineBtn.textContent = '傍線を解除';
    selectionUnderlineBtn.classList.add('active');
  } else {
    // No underline: show "引く" state
    selectionUnderlineBtn.textContent = '傍線を引く';
    selectionUnderlineBtn.classList.remove('active');
  }
}

/**
 * Update existing underline with current style/ref/format settings
 */
function updateExistingUnderline(): void {
  if (
    !currentDocument ||
    !currentSelectionFromId ||
    !currentSelectionToId ||
    !currentUnderlineMarkId ||
    !currentUnderlineIsExactMatch
  )
    return;

  let newDoc = currentDocument;

  // Normalize selection range using canonical (blocks) order
  const sel = normalizeSelection(currentDocument, currentSelectionFromId, currentSelectionToId);
  if (!sel) return;
  const { fromId: normalizedFromId, toId: normalizedToId } = sel;

  // Remove existing underline and associated ref mark
  newDoc = removeHighlightWithRef(newDoc, currentUnderlineMarkId);

  // Add new underline with current settings
  const refInputValue = selectionUnderlineRefInput.value.trim();
  const formatValue = selectionUnderlineFormatSelect.value as RefFormat | '';

  // Build ref mark and highlight mark with optional ref
  newDoc = addUnderlineMarks(newDoc, normalizedFromId, normalizedToId, refInputValue, formatValue);

  updateXmlFromDocument(newDoc);
  // parseAndRender handles selection restoration automatically
}

/**
 * Add underline (highlight) marks and optional ref mark to document
 * Shared between updateExistingUnderline and handleUnderlineToggle
 */
function addUnderlineMarks(
  doc: SKAMDocument,
  fromId: string,
  toId: string,
  refInputValue: string,
  formatValue: RefFormat | ''
): SKAMDocument {
  let newDoc = doc;
  let refId: string | undefined;

  if (formatValue) {
    const effectiveRefId = refInputValue || generateId(newDoc, 'ref');
    const refBlock = getBlockForToken(newDoc, toId);
    const refBlockId = refBlock?.id ?? '';
    const result = addMarkWithResult(newDoc, {
      type: 'ref',
      id: effectiveRefId,
      format: formatValue,
      position: { blockId: refBlockId, after: toId },
    });
    newDoc = result.doc;
    refId = result.markId;
  } else if (refInputValue) {
    refId = refInputValue;
  }

  const highlightMark: {
    type: 'highlight';
    style: UnderlineStyle;
    anchor: { from: string; to: string };
    ref?: string;
  } = {
    type: 'highlight',
    style: currentUnderlineStyle,
    anchor: { from: fromId, to: toId },
  };
  if (refId) {
    highlightMark.ref = refId;
  }
  return addMark(newDoc, highlightMark);
}

/**
 * Handle underline button click - add or remove underline (highlight)
 */
function handleUnderlineToggle(): void {
  if (!currentDocument || !currentSelectionFromId || !currentSelectionToId) return;

  let newDoc = currentDocument;

  // Normalize selection range using canonical (blocks) order
  const sel = normalizeSelection(currentDocument, currentSelectionFromId, currentSelectionToId);
  if (!sel) return;
  const { fromId: normalizedFromId, toId: normalizedToId } = sel;

  if (currentUnderlineMarkId) {
    // Partial overlap: confirm removal of entire mark
    if (!currentUnderlineIsExactMatch) {
      const mark = getMarkById(currentDocument, currentUnderlineMarkId);
      const range = mark ? getAnchorRangeLabel(mark) : '';
      if (
        !window.confirm(
          `選択範囲より広い傍線マーク（${range}）が存在します。マーク全体を解除しますか？`
        )
      ) {
        return;
      }
    }
    // Remove existing underline and associated ref mark
    newDoc = removeHighlightWithRef(newDoc, currentUnderlineMarkId);
  } else {
    // No overlapping underline: add new (highlight with selected style and optional ref)
    const refInputValue = selectionUnderlineRefInput.value.trim();
    const formatValue = selectionUnderlineFormatSelect.value as RefFormat | '';
    newDoc = addUnderlineMarks(
      newDoc,
      normalizedFromId,
      normalizedToId,
      refInputValue,
      formatValue
    );
  }

  updateXmlFromDocument(newDoc);
  // parseAndRender handles selection restoration automatically
}

/**
 * Apply kaeri value to document
 */
function applyKaeriValue(value: string | null): void {
  if (!currentDocument || !currentSelectionFromId || !currentSelectionToId) return;

  let newDoc = currentDocument;

  // Normalize selection range using canonical (blocks) order
  const sel = normalizeSelection(currentDocument, currentSelectionFromId, currentSelectionToId);
  if (!sel) return;
  const { fromId: normalizedFromId, toId: normalizedToId } = sel;

  // Determine kaeri position based on selection mode
  // - single: place after the selected token
  // - tateten/multi: place after the last token (end of range)
  const afterTokenId = currentSelectionMode === 'single' ? normalizedFromId : normalizedToId;
  const searchTo = currentSelectionMode === 'single' ? normalizedFromId : normalizedToId;

  // Find and remove existing kaeri mark for this range
  const existingKaeri = getMarksExactRange(newDoc, afterTokenId, searchTo, 'kaeri');
  const kaeriToRemove = existingKaeri[0];
  if (kaeriToRemove?.id) {
    newDoc = removeMark(newDoc, kaeriToRemove.id);
  }

  // Add new mark if value is provided
  if (value) {
    const block = getBlockForToken(newDoc, afterTokenId);
    if (!block) return;
    newDoc = addMark(newDoc, {
      type: 'kaeri',
      value: value,
      position: { blockId: block.id, after: afterTokenId },
    });
  }

  updateXmlFromDocument(newDoc);
  // parseAndRender handles selection restoration automatically
}

/**
 * Handle kana apply in selection panel
 */
function handleKanaApply(): void {
  if (!currentDocument || !currentSelectionFromId || !currentSelectionToId) return;

  const type = currentSelectedKanaType;
  const value = selectionKanaInput.value.trim();

  // When saidoku active and editing yomigana/okurigana, update saidoku forms[0]
  if (
    currentSaidokuMarkId &&
    currentSaidokuIsExactMatch &&
    (type === 'yomigana' || type === 'okurigana')
  ) {
    applySaidokuForm0(type, value);
    return;
  }

  // Normalize selection range using canonical (blocks) order
  const sel = normalizeSelection(currentDocument, currentSelectionFromId, currentSelectionToId);
  if (!sel) return;
  const { fromId: normalizedFromId, toId: normalizedToId } = sel;

  let newDoc = currentDocument;

  // Find existing marks of the same type within the selection range
  const existingMarks = getMarksForRange(currentDocument, normalizedFromId, normalizedToId).filter(
    (m) => m.type === type
  );

  if (existingMarks.length > 0) {
    // Check if any overlapping mark has partial overlap (not exact match)
    const hasPartialOverlap = existingMarks.some(
      (m) =>
        !('anchor' in m) || m.anchor.from !== normalizedFromId || m.anchor.to !== normalizedToId
    );

    if (hasPartialOverlap) {
      if (!value) {
        // Empty value with partial overlap: confirm deletion
        if (
          !window.confirm('選択範囲と部分的に重なるマークがあります。マーク全体を削除しますか？')
        ) {
          return;
        }
      } else {
        // Non-empty value with partial overlap: reject
        window.alert(
          '選択範囲と部分的に重なる同種のマークが存在します。先に既存のマークを解除してください。'
        );
        return;
      }
    }

    // Remove existing marks
    for (const mark of existingMarks) {
      if (mark.id) {
        newDoc = removeMark(newDoc, mark.id);
      }
    }
  }

  // Empty value: just remove (already done above)
  if (!value) {
    if (existingMarks.length > 0) {
      updateXmlFromDocument(newDoc);
    }
    return;
  }

  // Add new mark
  newDoc = addMark(newDoc, {
    type,
    value,
    anchor: { from: currentSelectionFromId, to: currentSelectionToId },
  });

  updateXmlFromDocument(newDoc);
  // parseAndRender handles selection restoration automatically
}

/**
 * Update saidoku button based on current selection state
 */
function updateSaidokuButton(): void {
  // Saidoku is only applicable to single-character selections
  // (or when an existing saidoku mark already spans the selection)
  const isSingleChar = currentSelectionMode === 'single';
  const hasSaidoku = Boolean(currentSaidokuMarkId);
  selectionSaidokuBtn.disabled = !isSingleChar && !hasSaidoku;
  selectionSaidokuBtn.classList.toggle('active', hasSaidoku);
  selectionSaidokuBtn.classList.toggle('has-value', hasSaidoku);
}

/**
 * Update saidoku forms[0] yomi or okuri from kana UI
 * Called when kana apply/delete targets yomigana/okurigana while saidoku is active
 */
function applySaidokuForm0(type: 'yomigana' | 'okurigana', value: string): void {
  if (!currentDocument || !currentSaidokuMarkId || !currentSaidokuIsExactMatch) return;

  const mark = getMarkById(currentDocument, currentSaidokuMarkId) as SaidokuMark | undefined;
  if (!mark) return;

  const field = type === 'yomigana' ? 'yomi' : 'okuri';
  const trimmed = value.trim();

  // Build updated forms array
  const newForms = mark.forms.map((f, i) => {
    if (i !== 0) return { ...f };
    const updated = { ...f };
    if (trimmed) {
      updated[field] = trimmed;
    } else {
      delete updated[field];
    }
    return updated;
  });

  const newDoc = updateMark(currentDocument, currentSaidokuMarkId, { forms: newForms });
  updateXmlFromDocument(newDoc);
}

/**
 * Show/hide reread section and populate input values
 */
function updateSaidokuReread(): void {
  if (!currentSaidokuMarkId || !currentSaidokuIsExactMatch) {
    selectionSaidokuReread.style.display = 'none';
    return;
  }

  selectionSaidokuReread.style.display = 'block';
  selectionSaidokuRereadYomi.value = currentSaidokuRereadYomi;
  selectionSaidokuRereadOkuri.value = currentSaidokuRereadOkuri;
}

/**
 * Handle saidoku toggle - add or remove saidoku mark
 *
 * Creation: migrate existing yomigana/okurigana into forms[0] (no data loss, no confirm needed)
 * Removal (exact match): restore forms[0] to yomigana/okurigana marks.
 *   If forms[1] has values, confirm with user first.
 * Removal (partial overlap): confirm removal of entire mark.
 */
function handleSaidokuToggle(): void {
  if (!currentDocument || !currentSelectionFromId || !currentSelectionToId) return;

  let newDoc = currentDocument;
  const sel = normalizeSelection(currentDocument, currentSelectionFromId, currentSelectionToId);
  if (!sel) return;
  const { fromId: normalizedFromId, toId: normalizedToId } = sel;

  if (currentSaidokuMarkId) {
    // Remove existing saidoku
    if (!currentSaidokuIsExactMatch) {
      const mark = getMarkById(currentDocument, currentSaidokuMarkId);
      const range = mark ? getAnchorRangeLabel(mark) : '';
      if (
        !window.confirm(
          `選択範囲より広い再読文字マーク（${range}）が存在します。マーク全体を解除しますか？`
        )
      ) {
        return;
      }
      newDoc = removeMark(newDoc, currentSaidokuMarkId);
    } else {
      // Exact match: restore forms[0] to individual marks
      const mark = getMarkById(currentDocument, currentSaidokuMarkId) as SaidokuMark | undefined;
      if (!mark) return;

      // Check if forms[1] has values - warn about data loss
      const form1 = mark.forms[1];
      const hasRereadData = form1 && (form1.yomi || form1.okuri);
      if (hasRereadData) {
        if (!window.confirm('再読部分のデータが失われます。解除しますか？')) {
          return;
        }
      }

      // Remove saidoku mark
      newDoc = removeMark(newDoc, currentSaidokuMarkId);

      // Restore forms[0] values as individual marks
      const form0 = mark.forms[0];
      if (form0?.yomi) {
        newDoc = addMark(newDoc, {
          type: 'yomigana',
          value: form0.yomi,
          anchor: { from: normalizedFromId, to: normalizedToId },
        });
      }
      if (form0?.okuri) {
        newDoc = addMark(newDoc, {
          type: 'okurigana',
          value: form0.okuri,
          anchor: { from: normalizedFromId, to: normalizedToId },
        });
      }
    }
  } else {
    // Create saidoku: migrate existing yomigana/okurigana into forms[0]
    const rangeMarks = getMarksForRange(newDoc, normalizedFromId, normalizedToId);
    const yomigana = rangeMarks.find((m) => m.type === 'yomigana');
    const okurigana = rangeMarks.find((m) => m.type === 'okurigana');

    type SaidokuFormData = { n: number; yomi?: string; okuri?: string };
    const form0: SaidokuFormData = { n: 1 };
    if (yomigana && hasMarkValue(yomigana)) form0.yomi = yomigana.value;
    if (okurigana && hasMarkValue(okurigana)) form0.okuri = okurigana.value;

    // Remove existing yomigana/okurigana marks (migrated into saidoku)
    if (yomigana?.id) newDoc = removeMark(newDoc, yomigana.id);
    if (okurigana?.id) newDoc = removeMark(newDoc, okurigana.id);

    // Add saidoku mark with forms[0] from existing marks, empty forms[1]
    newDoc = addMark(newDoc, {
      type: 'saidoku',
      anchor: { from: normalizedFromId, to: normalizedToId },
      forms: [form0, { n: 2 }],
    });
  }

  updateXmlFromDocument(newDoc);
}

/**
 * Apply reread part (forms[1]) changes to the saidoku mark
 */
function handleSaidokuRereadApply(): void {
  if (!currentDocument || !currentSaidokuMarkId || !currentSaidokuIsExactMatch) return;

  const mark = getMarkById(currentDocument, currentSaidokuMarkId) as SaidokuMark | undefined;
  if (!mark) return;

  const yomi = selectionSaidokuRereadYomi.value.trim();
  const okuri = selectionSaidokuRereadOkuri.value.trim();

  // Build updated form1
  const form1: { n: number; yomi?: string; okuri?: string } = { n: 2 };
  if (yomi) form1.yomi = yomi;
  if (okuri) form1.okuri = okuri;

  // Keep forms[0], update forms[1]
  const form0 = mark.forms[0] ?? { n: 1 };
  const newDoc = updateMark(currentDocument, currentSaidokuMarkId, { forms: [form0, form1] });
  updateXmlFromDocument(newDoc);
}

/**
 * Clear selection panel
 */
function clearSelectionPanel(): void {
  currentSelectionRange = null;
  currentSelectionFromId = null;
  currentSelectionToId = null;
  currentKanaValues = { yomigana: '', okurigana: '', soegana: '' };
  currentSelectedKanaType = 'yomigana';
  currentKaeriRe = false;
  currentKaeriOther = null;
  currentTatetenMarkId = null;
  currentEmphasisMarkId = null;
  currentEmphasisIsExactMatch = false;
  currentUnderlineMarkId = null;
  currentUnderlineIsExactMatch = false;
  currentSaidokuMarkId = null;
  currentSaidokuIsExactMatch = false;
  currentSaidokuRereadYomi = '';
  currentSaidokuRereadOkuri = '';
  currentSelectionMode = 'single';
  selectionInfo.innerHTML = '<p class="selection-empty">文字をクリックまたはドラッグで選択</p>';
  selectionActions.style.display = 'none';
  selectionKaeriButtons.innerHTML = '';
  selectionTatetenBtn.disabled = true;
  selectionTatetenBtn.textContent = '熟語にする';
  selectionTatetenBtn.classList.remove('active');
  selectionEmphasisBtn.textContent = '傍点をつける';
  selectionEmphasisBtn.classList.remove('active');
  currentEmphasisStyle = 'filled dot';
  updateEmphasisStyleButtons();
  selectionUnderlineBtn.textContent = '傍線を引く';
  selectionUnderlineBtn.classList.remove('active');
  currentUnderlineStyle = 'solid';
  currentUnderlineRef = '';
  currentUnderlineFormat = '';
  updateUnderlineStyleButtons();
  selectionUnderlineRefInput.value = '';
  selectionUnderlineFormatSelect.value = '';
  selectionSaidokuBtn.classList.remove('active', 'has-value');
  selectionSaidokuReread.style.display = 'none';
  selectionSaidokuRereadYomi.value = '';
  selectionSaidokuRereadOkuri.value = '';
  updateKanaTypeButtons();
  selectionKanaInput.value = '';
  selectionKanaApply.disabled = true;
}

/**
 * Get human-readable label for mark type
 */
function getMarkTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    kaeri: '返り点',
    okurigana: '送り仮名',
    yomigana: '読み仮名',
    soegana: '添え仮名',
    okimoji: '置字',
    joji: '助字',
    kutoten: '句読点',
    saidoku: '再読',
    okototen: 'ヲコト点',
    tateten: 'たて点',
    emphasis: '傍点',
    highlight: '傍線',
    ref: '参照',
    note: '注釈',
  };
  return labels[type] ?? type;
}

/**
 * Update marks list panel with all marks from the document
 */
function updateMarksList(doc: SKAMDocument | null): void {
  if (!doc || doc.marks.length === 0) {
    marksList.innerHTML = '<p class="marks-list-empty">マークがありません</p>';
    return;
  }

  // Sort marks by their position in the document (appearance order)
  const sortedMarks = sortMarksByPosition(doc);

  // Build HTML - display in appearance order with type inline
  let html = '';
  for (const mark of sortedMarks) {
    const anchorText = getAnchorText(doc, mark);

    let value = '';
    if (hasMarkValue(mark)) {
      value = String(mark.value);
    }

    html += `
      <div class="marks-list-item">
        <span class="marks-list-anchor">${anchorText}</span>
        <span class="marks-list-type">${getMarkTypeLabel(mark.type)}</span>
        ${value ? `<span class="marks-list-value">${value}</span>` : ''}
      </div>
    `;
  }

  marksList.innerHTML = html;
}

function renderCanvasDocument(doc: SKAMDocument): void {
  currentDocument = doc;

  // Cleanup previous interactive handlers (not used in Canvas mode)
  cleanupInteractiveHandlers?.();
  cleanupInteractiveHandlers = null;

  // Update marks list panel
  updateMarksList(doc);

  // JSON output
  jsonOutput.textContent = JSON.stringify(doc, null, 2);

  // Build Canvas render options from customize panel
  const writingMode = getWritingMode();
  const state = getCustomizeState();
  const fontSize = parseFloat(state.glyphSize) * 16; // em → px
  const fontFamily = state.fontFamily.replace(/'/g, '');
  const rubyRatio = parseFloat(state.rubyRatio);
  const lineHeight = parseFloat(state.lineHeight);
  const profile = getProfileSettings();

  // Map HTML RenderProfile to Canvas RenderProfile
  const canvasProfile: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(profile)) {
    canvasProfile[key] = value;
  }

  const dpr = window.devicePixelRatio || 1;

  // Sync container writing-mode for correct scroll direction
  renderOutput.style.writingMode = writingMode === 'vertical' ? 'vertical-rl' : '';

  // Get or create canvas element
  let canvas = renderOutput.querySelector('canvas');
  if (!canvas) {
    renderOutput.innerHTML = '';
    canvas = document.createElement('canvas');
    // Some browsers let CSS writing-mode affect Canvas 2D fillText() direction.
    // Force horizontal-tb so the renderer's own coordinate-based layout is not disrupted.
    canvas.style.writingMode = 'horizontal-tb';
    renderOutput.appendChild(canvas);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Cast to CanvasRenderingContext2DLike (browser's fillStyle is wider than string-only)
  const ctxLike = ctx as unknown as CanvasRenderingContext2DLike;

  // Measure dimensions
  const dims = canvasMeasure(doc, ctxLike, {
    writingMode,
    profile: canvasProfile,
    fontSize,
    fontFamily,
    rubyRatio,
    lineHeight,
  });

  // HiDPI setup
  canvas.width = dims.width * dpr;
  canvas.height = dims.height * dpr;
  canvas.style.width = dims.width + 'px';
  canvas.style.height = dims.height + 'px';

  // Render (cast to CanvasLike for type compatibility)
  canvasRender(doc, canvas as unknown as CanvasLike, {
    writingMode,
    profile: canvasProfile,
    fontSize,
    fontFamily,
    rubyRatio,
    lineHeight,
    textColor: '#000',
    backgroundColor: '#fff',
    pixelRatio: dpr,
  });

  // HTML output placeholder
  htmlOutput.textContent = '(Canvas mode - no HTML output)';
}

function renderDocument(doc: SKAMDocument): void {
  if (getRendererMode() === 'canvas') {
    renderCanvasDocument(doc);
    return;
  }

  currentDocument = doc;

  // Cleanup previous interactive handlers
  cleanupInteractiveHandlers?.();
  cleanupInteractiveHandlers = null;

  // Note: Selection panel is NOT cleared here.
  // parseAndRender handles selection restoration via position-based tracking.

  // Update marks list panel
  updateMarksList(doc);

  // JSON output
  jsonOutput.textContent = JSON.stringify(doc, null, 2);

  // HTML render with interactive mode enabled
  const writingMode = getWritingMode();
  const inline = getInlineMode();
  const profile = getProfileSettings();
  const rubyMethod = getRubyMethod();
  const result = render(doc, { writingMode, inline, profile, interactive: true, rubyMethod });

  // Sync writing-mode on the scroll container (.preview-content itself)
  // so the scroll origin matches the content direction (right edge for vertical-rl).
  renderOutput.style.writingMode = writingMode === 'vertical' ? 'vertical-rl' : '';

  // Apply CSS and HTML
  const styleId = 'skam-playground-styles';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = result.css;

  // If inline mode, add surrounding text
  if (inline) {
    const writingModeClass = writingMode === 'vertical' ? ' inline-demo--vertical' : '';
    renderOutput.innerHTML = `<p class="inline-demo${writingModeClass}">本文中に「${result.html}」のように漢文を埋め込める。</p>`;
  } else {
    renderOutput.innerHTML = result.html;
  }

  // HTML source output
  htmlOutput.textContent = result.html;

  // Setup interactive event handlers (not in inline mode)
  if (!inline) {
    cleanupInteractiveHandlers = attachInteractiveHandlers(renderOutput, {
      onTokenClick: (tokenId) => {
        if (!currentDocument) return;
        // Update selection panel (selection visual handled by interactive handlers)
        updateSelectionPanel(tokenId, tokenId);
        // Apply selection classes
        setSelectionClasses(renderOutput, tokenId, tokenId);
      },
      onTokenSelect: (fromId, toId) => {
        if (!currentDocument) return;
        // Update selection panel
        updateSelectionPanel(fromId, toId);
        // Apply selection classes
        setSelectionClasses(renderOutput, fromId, toId);
      },
      onEmptyClick: () => {
        // Clear selection when clicking empty area
        clearSelectionPanel();
        clearSelection(renderOutput);
      },
    });
  }
}

function parseAndRender(): void {
  hideErrors();

  const xmlText = xmlEditor.getValue().trim();
  if (!xmlText) {
    showErrors([{ message: 'XMLを入力してください' }]);
    return;
  }

  // Save selection range before parse (position-based)
  const savedRange = currentSelectionRange;

  try {
    const doc = parse(xmlText);

    // Canvas mode: skip selection restoration (no interactive selection in Canvas)
    if (getRendererMode() === 'canvas') {
      clearSelectionPanel();
      renderDocument(doc);
    } else {
      // Try to restore selection from position (using canonical blocks order)
      const fromToken = savedRange ? getTokenByIndex(doc, savedRange.fromIndex) : undefined;
      const toToken = savedRange ? getTokenByIndex(doc, savedRange.toIndex) : undefined;
      if (fromToken && toToken) {
        const fromId = fromToken.id;
        const toId = toToken.id;
        renderDocument(doc);
        updateSelectionPanel(fromId, toId);
        setSelectionClasses(renderOutput, fromId, toId);
      } else {
        // Token count changed or no selection - clear all selection state
        clearSelectionPanel();
        renderDocument(doc);
      }
    }
  } catch (err) {
    if (err instanceof SKAMXMLParseError) {
      const parseError: ParseError = { message: err.message };
      if (err.line !== undefined) {
        parseError.line = err.line;
      }
      if (err.column !== undefined) {
        parseError.column = err.column;
      }
      showErrors([parseError]);
    } else if (err instanceof Error) {
      showErrors([{ message: err.message }]);
    } else {
      showErrors([{ message: '不明なエラーが発生しました' }]);
    }
    jsonOutput.textContent = '';
    renderOutput.innerHTML = '';
    htmlOutput.textContent = '';
    currentDocument = null;
    clearSelectionPanel();
  }
}

function loadSample(index: number, updateUrlState = true): void {
  const sample = SAMPLES[index];
  if (sample) {
    xmlEditor.setValue(sample.xml);
    sampleSelect.value = String(index);
    if (updateUrlState) {
      updateURL({ sample: index });
    }
    parseAndRender();
  }
}

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {
    // fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  });
}

function downloadXml(): void {
  const xml = xmlEditor.getValue();
  if (!xml.trim()) {
    alert('保存するXMLがありません');
    return;
  }

  const filename = prompt('ファイル名を入力', 'document.skam.xml');
  if (!filename) return;

  // Ensure .xml extension
  const finalFilename = filename.endsWith('.xml') ? filename : `${filename}.xml`;

  const blob = new Blob([xml], { type: 'application/xml; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Update XML editor from a SKAMDocument (GUI operation -> XML sync)
 *
 * This function is called when GUI operations modify the document.
 * It converts the document back to XML and updates the editor.
 * The onContentChange callback will trigger parseAndRender,
 * which restores selection using position-based tracking.
 *
 * @param doc The updated SKAMDocument
 */
function updateXmlFromDocument(doc: SKAMDocument): void {
  const xml = stringify(doc);
  xmlEditor.setValue(xml);
  // onContentChange → parseAndRender will be triggered automatically
  // Selection is restored via position-based tracking in parseAndRender
}

// Export updateXmlFromDocument to window for console testing and future GUI operations
declare global {
  interface Window {
    updateXmlFromDocument: (doc: SKAMDocument) => void;
    currentDocument: SKAMDocument | null;
  }
}
window.updateXmlFromDocument = updateXmlFromDocument;
// Also expose currentDocument for testing purposes
Object.defineProperty(window, 'currentDocument', {
  get: () => currentDocument,
});

// ============================================================================
// Resizable Divider
// ============================================================================

function setupResizableDivider(): void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startXmlPaneWidth = 0;
  let startXmlPaneHeight = 0;

  function isVerticalLayout(): boolean {
    return window.innerWidth <= 768;
  }

  function onMouseDown(e: MouseEvent): void {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const xmlPaneRect = xmlPane.getBoundingClientRect();
    startXmlPaneWidth = xmlPaneRect.width;
    startXmlPaneHeight = xmlPaneRect.height;

    divider.classList.add('dragging');
    document.body.classList.add('resizing');
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent): void {
    if (!isDragging) return;

    const containerRect = editorContainer.getBoundingClientRect();

    if (isVerticalLayout()) {
      // Vertical layout: resize height
      const deltaY = e.clientY - startY;
      const newHeight = startXmlPaneHeight + deltaY;
      const minHeight = 150;
      const maxHeight = containerRect.height - 150 - divider.offsetHeight;

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        const heightPercent = (newHeight / containerRect.height) * 100;
        xmlPane.style.flex = 'none';
        xmlPane.style.height = `${heightPercent}%`;
        previewPane.style.flex = '1';
        previewPane.style.height = 'auto';
      }
    } else {
      // Horizontal layout: resize width
      const deltaX = e.clientX - startX;
      const newWidth = startXmlPaneWidth + deltaX;
      const minWidth = 300;
      const maxWidth = containerRect.width - 300 - divider.offsetWidth;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        const widthPercent = (newWidth / containerRect.width) * 100;
        xmlPane.style.flex = 'none';
        xmlPane.style.width = `${widthPercent}%`;
        previewPane.style.flex = '1';
        previewPane.style.width = 'auto';
      }
    }
  }

  function onMouseUp(): void {
    if (isDragging) {
      isDragging = false;
      divider.classList.remove('dragging');
      document.body.classList.remove('resizing');
    }
  }

  // Touch support
  function onTouchStart(e: TouchEvent): void {
    const touch = e.touches[0];
    if (touch) {
      isDragging = true;
      startX = touch.clientX;
      startY = touch.clientY;

      const xmlPaneRect = xmlPane.getBoundingClientRect();
      startXmlPaneWidth = xmlPaneRect.width;
      startXmlPaneHeight = xmlPaneRect.height;

      divider.classList.add('dragging');
      document.body.classList.add('resizing');
      e.preventDefault();
    }
  }

  function onTouchMove(e: TouchEvent): void {
    if (!isDragging) return;

    const touch = e.touches[0];
    if (!touch) return;

    const containerRect = editorContainer.getBoundingClientRect();

    if (isVerticalLayout()) {
      const deltaY = touch.clientY - startY;
      const newHeight = startXmlPaneHeight + deltaY;
      const minHeight = 150;
      const maxHeight = containerRect.height - 150 - divider.offsetHeight;

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        const heightPercent = (newHeight / containerRect.height) * 100;
        xmlPane.style.flex = 'none';
        xmlPane.style.height = `${heightPercent}%`;
        previewPane.style.flex = '1';
        previewPane.style.height = 'auto';
      }
    } else {
      const deltaX = touch.clientX - startX;
      const newWidth = startXmlPaneWidth + deltaX;
      const minWidth = 300;
      const maxWidth = containerRect.width - 300 - divider.offsetWidth;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        const widthPercent = (newWidth / containerRect.width) * 100;
        xmlPane.style.flex = 'none';
        xmlPane.style.width = `${widthPercent}%`;
        previewPane.style.flex = '1';
        previewPane.style.width = 'auto';
      }
    }
  }

  function onTouchEnd(): void {
    if (isDragging) {
      isDragging = false;
      divider.classList.remove('dragging');
      document.body.classList.remove('resizing');
    }
  }

  // Reset pane sizes on layout change (responsive)
  function onResize(): void {
    // Reset inline styles when layout changes
    xmlPane.style.flex = '';
    xmlPane.style.width = '';
    xmlPane.style.height = '';
    previewPane.style.flex = '';
    previewPane.style.width = '';
    previewPane.style.height = '';
  }

  // Event listeners
  divider.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  divider.addEventListener('touchstart', onTouchStart, { passive: false });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd);

  // Debounced resize handler
  let resizeTimeout: number | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(onResize, 150);
  });
}

// ============================================================================
// Event Listeners
// ============================================================================

parseBtn.addEventListener('click', parseAndRender);

// File upload
uploadBtn.addEventListener('click', () => {
  fileUpload.click();
});

fileUpload.addEventListener('change', async () => {
  const file = fileUpload.files?.[0];
  if (file) {
    try {
      const text = await file.text();
      xmlEditor.setValue(text);
      // Clear sample select when loading external file
      sampleSelect.value = '';
      updateURL({ sample: 0 });
      parseAndRender();
      console.log(`Loaded: ${file.name}`);
    } catch (e) {
      console.error('Failed to read file:', e);
      showErrors([{ message: `ファイルの読み込みに失敗しました: ${file.name}` }]);
    }
  }
  // Reset to allow selecting the same file again
  fileUpload.value = '';
});

// Drag and drop file support
xmlPane.addEventListener('dragover', (e) => {
  e.preventDefault();
  xmlPane.classList.add('drag-over');
});

xmlPane.addEventListener('dragleave', (e) => {
  // Only remove class if leaving the pane entirely
  if (!xmlPane.contains(e.relatedTarget as Node)) {
    xmlPane.classList.remove('drag-over');
  }
});

xmlPane.addEventListener('drop', async (e) => {
  e.preventDefault();
  xmlPane.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file && (file.name.endsWith('.xml') || file.name.endsWith('.skam.xml'))) {
    try {
      const text = await file.text();
      xmlEditor.setValue(text);
      // Clear sample select when loading external file
      sampleSelect.value = '';
      updateURL({ sample: 0 });
      parseAndRender();
      console.log(`Loaded: ${file.name}`);
    } catch (err) {
      console.error('Failed to read file:', err);
      showErrors([{ message: `ファイルの読み込みに失敗しました: ${file.name}` }]);
    }
  } else if (file) {
    showErrors([{ message: `XMLファイル (.xml, .skam.xml) を選択してください` }]);
  }
});

// Register debounced content change callback from XmlEditor
// This enables auto-parse on content change (after debounce)
// Selection is restored via position-based tracking in parseAndRender
xmlEditor.onContentChange(() => {
  parseAndRender();
});

// Ctrl/Cmd+Enter to parse
xmlEditor.getTextareaElement().addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    parseAndRender();
  }
});

// Sample select
for (let i = 0; i < SAMPLES.length; i++) {
  const sample = SAMPLES[i];
  if (sample) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = sample.name;
    sampleSelect.appendChild(option);
  }
}

sampleSelect.addEventListener('change', () => {
  const index = parseInt(sampleSelect.value, 10);
  if (!isNaN(index)) {
    loadSample(index, true);
  }
});

// Copy buttons
copyJsonBtn.addEventListener('click', () => {
  if (currentDocument) {
    copyToClipboard(JSON.stringify(currentDocument, null, 2));
  }
});

copyHtmlBtn.addEventListener('click', () => {
  if (htmlOutput.textContent) {
    copyToClipboard(htmlOutput.textContent);
  }
});

// Download button
downloadBtn.addEventListener('click', downloadXml);

// Ctrl/Cmd+S to download
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    downloadXml();
  }
});

// Writing mode change
function updateHorizontalNotice(): void {
  horizontalNotice.hidden = getWritingMode() !== 'horizontal';
}

function updateRendererModeUI(): void {
  const isCanvas = getRendererMode() === 'canvas';
  previewPane.classList.toggle('canvas-mode', isCanvas);
  canvasNotice.hidden = !isCanvas;

  // Disable horizontal writing mode in Canvas mode (not implemented)
  for (const radio of writingModeRadios) {
    if (radio.value === 'horizontal') {
      radio.disabled = isCanvas;
      if (isCanvas && radio.checked) {
        // Force vertical when switching to Canvas mode with horizontal active
        for (const r of writingModeRadios) {
          r.checked = r.value === 'vertical';
        }
        updateURL({ mode: 'vertical' });
        updateHorizontalNotice();
      }
    }
  }

  // Inline mode not available in Canvas mode
  inlineModeCheckbox.disabled = isCanvas;
  if (isCanvas && inlineModeCheckbox.checked) {
    inlineModeCheckbox.checked = false;
    updateURL({ inline: false });
  }
}

// Renderer mode change
for (const radio of rendererRadios) {
  radio.addEventListener('change', () => {
    updateURL({ renderer: getRendererMode() });
    updateRendererModeUI();
    if (getRendererMode() === 'canvas') {
      ensureCanvasFontLoaded().then(() => {
        if (currentDocument) {
          renderDocument(currentDocument);
        }
      });
    } else {
      // Switching back to HTML: clear canvas and re-render
      if (currentDocument) {
        renderDocument(currentDocument);
      }
    }
  });
}

for (const radio of writingModeRadios) {
  radio.addEventListener('change', () => {
    updateURL({ mode: getWritingMode() });
    updateHorizontalNotice();
    if (currentDocument) {
      renderDocument(currentDocument);
    }
  });
}

// Ruby method change
for (const radio of rubyMethodRadios) {
  radio.addEventListener('change', () => {
    updateURL({ rubyMethod: getRubyMethod() });
    if (currentDocument) {
      renderDocument(currentDocument);
    }
  });
}

// Inline mode change
inlineModeCheckbox.addEventListener('change', () => {
  updateURL({ inline: getInlineMode() });
  if (currentDocument) {
    renderDocument(currentDocument);
  }
});

// Profile change
profileSelect.addEventListener('change', () => {
  const profile = getProfile();
  if (profile !== 'custom') {
    applyPresetProfile(profile);
    updateURL({ profile });
  }
  if (currentDocument) {
    renderDocument(currentDocument);
  }
});

// Profile checkboxes change
profileCheckboxes.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (!target.dataset['profileKey']) return;

  // Update current profile settings from checkboxes
  currentProfileSettings = readCheckboxesToProfile();
  // Switch to custom mode
  setCustomProfile();

  if (currentDocument) {
    renderDocument(currentDocument);
  }
});

// CSS Customize
colorKaeritenInput.addEventListener('input', applyCustomStyles);
colorRubyInput.addEventListener('input', applyCustomStyles);
colorEmphasisInput.addEventListener('input', applyCustomStyles);
fontFamilySelect.addEventListener('change', applyCustomStyles);
glyphSizeInput.addEventListener('input', applyCustomStyles);
rubyRatioInput.addEventListener('input', applyCustomStyles);
lineHeightInput.addEventListener('input', applyCustomStyles);
resetCustomizeBtn.addEventListener('click', resetCustomize);

// Selection panel kana type buttons
selectionKanaTypes.addEventListener('click', (e) => {
  const target = e.target as HTMLButtonElement;
  if (!target.classList.contains('selection-kana-type-btn')) return;
  if (target.disabled) return;

  const type = target.dataset['type'] as
    | 'yomigana'
    | 'okurigana'
    | 'soegana'
    | 'saidoku'
    | undefined;
  if (!type) return;

  // Saidoku is a toggle, not a kana type selector
  if (type === 'saidoku') {
    handleSaidokuToggle();
    return;
  }

  currentSelectedKanaType = type;
  updateKanaTypeButtons();

  // Update input with existing value for this type
  selectionKanaInput.value = currentKanaValues[type];
  const hasInput = Boolean(selectionKanaInput.value.trim());
  const hasExisting = Boolean(currentKanaValues[type]);
  selectionKanaApply.disabled = !hasInput && !hasExisting;
  selectionKanaInput.focus();
});

// Selection panel kana input
selectionKanaInput.addEventListener('input', () => {
  const hasText = Boolean(selectionKanaInput.value.trim());
  const hasExistingMark = Boolean(currentKanaValues[currentSelectedKanaType]);
  selectionKanaApply.disabled = !hasText && !hasExistingMark;
});

selectionKanaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const hasText = Boolean(selectionKanaInput.value.trim());
    const hasExistingMark = Boolean(currentKanaValues[currentSelectedKanaType]);
    if (hasText || hasExistingMark) {
      e.preventDefault();
      handleKanaApply();
    }
  }
});

selectionKanaApply.addEventListener('click', handleKanaApply);

// Selection panel saidoku reread controls
selectionSaidokuRereadApply.addEventListener('click', handleSaidokuRereadApply);

// Enter key in reread inputs triggers apply
selectionSaidokuRereadYomi.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSaidokuRereadApply();
  }
});

selectionSaidokuRereadOkuri.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSaidokuRereadApply();
  }
});

// Selection panel tateten button
selectionTatetenBtn.addEventListener('click', handleTatetenToggle);

// Selection panel emphasis button
selectionEmphasisBtn.addEventListener('click', handleEmphasisToggle);

// Selection panel emphasis style buttons
selectionEmphasisStyles.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('selection-emphasis-style-btn')) return;

  const style = target.dataset['style'] as EmphasisStyle | undefined;
  if (!style) return;

  currentEmphasisStyle = style;

  if (currentEmphasisMarkId) {
    // If emphasis already exists, update it immediately
    updateExistingEmphasis();
  } else {
    // If no emphasis exists, add one with the selected style
    handleEmphasisToggle();
  }
});

// Selection panel underline style buttons
selectionUnderlineStyles.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('selection-underline-style-btn')) return;

  const style = target.dataset['style'] as UnderlineStyle | undefined;
  if (!style) return;

  currentUnderlineStyle = style;

  if (currentUnderlineMarkId) {
    // If underline already exists, update it immediately
    updateExistingUnderline();
  } else {
    // If no underline exists, add one with the selected style
    handleUnderlineToggle();
  }
});

// Selection panel underline ref input change
selectionUnderlineRefInput.addEventListener('change', () => {
  // If underline already exists, update it immediately
  if (currentUnderlineMarkId) {
    updateExistingUnderline();
  }
});

// Selection panel underline format change
selectionUnderlineFormatSelect.addEventListener('change', () => {
  // If underline already exists, update it immediately
  if (currentUnderlineMarkId) {
    updateExistingUnderline();
  }
});

// Selection panel underline button
selectionUnderlineBtn.addEventListener('click', handleUnderlineToggle);

// ============================================================================
// Initialize
// ============================================================================

// Setup resizable divider
setupResizableDivider();

// Detect inline-grid baseline bug and set CSS compensation variable
calibrateGridBaseline(renderOutput);

// Restore state from URL
const initialState = getStateFromURL();

// Set renderer mode
for (const radio of rendererRadios) {
  radio.checked = radio.value === initialState.renderer;
}
updateRendererModeUI();

// Set writing mode
for (const radio of writingModeRadios) {
  radio.checked = radio.value === initialState.mode;
}
updateHorizontalNotice();

// Set inline mode
inlineModeCheckbox.checked = initialState.inline;

// Set ruby method
for (const radio of rubyMethodRadios) {
  radio.checked = radio.value === initialState.rubyMethod;
}

// Set profile and sync checkboxes
applyPresetProfile(initialState.profile);

// Preload Canvas font in background (index.html already loads Noto Serif JP via <link>)
ensureCanvasFontLoaded();

// Load sample (without updating URL since we're restoring from URL)
loadSample(initialState.sample, false);

// Apply initial customize styles
applyCustomStyles();

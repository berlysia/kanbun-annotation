/**
 * SKAM Playground
 */

import { parse, stringify, SKAMXMLParseError } from '@kanbun/skam-xml-parser';
import {
  render,
  attachInteractiveHandlers,
  setSelectionClasses,
  clearSelection,
  PROFILES,
} from '@kanbun/skam-html-renderer';
import type { SKAMDocument, RefFormat } from '@kanbun/skam';
import { SAMPLES } from './samples.js';
import { ErrorPanel, type ParseError } from './editor/error-panel.js';
import { XmlEditor } from './editor/xml-editor.js';
import { addMark, removeMark, getMarksForToken } from './editor/document-operations.js';

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
const writingModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="writing-mode"]');
const inlineModeCheckbox = document.getElementById('inline-mode') as HTMLInputElement;
const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;

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
// - string: mark ID of existing emphasis that matches selection range
let currentEmphasisMarkId: string | null = null;

// Current underline/region (傍線) state
// - null: no underline for current selection
// - string: mark ID of existing region that matches selection range
let currentUnderlineMarkId: string | null = null;

// Selected underline style
type UnderlineStyle = 'solid' | 'dotted' | 'dashed' | 'wavy' | 'double';
let currentUnderlineStyle: UnderlineStyle = 'solid';

// Current underline ref value (from existing mark or empty for new)
let currentUnderlineRef: string = '';

// Current underline ref format
let currentUnderlineFormat: RefFormat | '' = '';

// Selection mode: determines what controls are available
// - 'single': single character selected - kaeri enabled, tateten disabled
// - 'multi': multiple characters selected without tateten - kaeri disabled, tateten enabled
// - 'tateten': selection matches a tateten range - kaeri enabled, tateten shows "解除"
let currentSelectionMode: 'single' | 'multi' | 'tateten' = 'single';

// Flag to prevent double updates when GUI operation triggers XML update
// which would trigger parseAndRender again
let isUpdatingFromGui = false;

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

interface URLState {
  sample: number;
  mode: 'vertical' | 'horizontal';
  inline: boolean;
  profile: ProfileName;
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

  const modeStr = params.get('mode');
  const mode: 'vertical' | 'horizontal' = modeStr === 'horizontal' ? 'horizontal' : 'vertical';

  const inlineStr = params.get('inline');
  const inline = inlineStr === '1';

  const profileStr = params.get('profile');
  const profile: ProfileName =
    profileStr === 'learningBasic' || profileStr === 'learningHint' ? profileStr : 'full';

  return { sample, mode, inline, profile };
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

function getProfile(): ProfileName {
  const value = profileSelect.value;
  if (value === 'learningBasic' || value === 'learningHint') {
    return value;
  }
  return 'full';
}

/**
 * Find a tateten mark that exactly matches the given selection range
 */
function findTatetenForSelection(
  doc: SKAMDocument,
  fromId: string,
  toId: string
): { markId: string; kaeriValue: string | null } | null {
  const tokens = doc.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === fromId);
  const toIndex = tokens.findIndex((t) => t.id === toId);
  if (fromIndex === -1 || toIndex === -1) return null;

  const selStartIndex = Math.min(fromIndex, toIndex);
  const selEndIndex = Math.max(fromIndex, toIndex);
  const selStartId = tokens[selStartIndex]?.id;
  const selEndId = tokens[selEndIndex]?.id;

  for (const mark of doc.marks) {
    if (mark.type !== 'tateten') continue;
    if (!mark.id) continue; // Skip marks without ID

    const markFromIndex = tokens.findIndex((t) => t.id === mark.anchor.from);
    const markToIndex = tokens.findIndex((t) => t.id === mark.anchor.to);
    if (markFromIndex === -1 || markToIndex === -1) continue;

    const markStartIndex = Math.min(markFromIndex, markToIndex);
    const markEndIndex = Math.max(markFromIndex, markToIndex);
    const markStartToken = tokens[markStartIndex];
    const markEndToken = tokens[markEndIndex];
    if (!markStartToken || !markEndToken) continue;

    const markStartId = markStartToken.id;
    const markEndId = markEndToken.id;

    // Check if selection exactly matches tateten range
    if (selStartId === markStartId && selEndId === markEndId) {
      // Find kaeri mark attached to this tateten range
      let kaeriValue: string | null = null;
      for (const m of doc.marks) {
        if (m.type === 'kaeri' && m.anchor.from === markStartId && m.anchor.to === markEndId) {
          if ('value' in m) {
            kaeriValue = String(m.value);
          }
          break;
        }
      }
      return { markId: mark.id, kaeriValue };
    }
  }

  return null;
}

/**
 * Find an emphasis mark that exactly matches the given selection range
 */
function findEmphasisForSelection(
  doc: SKAMDocument,
  fromId: string,
  toId: string
): { markId: string } | null {
  const tokens = doc.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === fromId);
  const toIndex = tokens.findIndex((t) => t.id === toId);
  if (fromIndex === -1 || toIndex === -1) return null;

  const selStartIndex = Math.min(fromIndex, toIndex);
  const selEndIndex = Math.max(fromIndex, toIndex);
  const selStartId = tokens[selStartIndex]?.id;
  const selEndId = tokens[selEndIndex]?.id;

  for (const mark of doc.marks) {
    if (mark.type !== 'emphasis') continue;
    if (!mark.id) continue;

    const markFromIndex = tokens.findIndex((t) => t.id === mark.anchor.from);
    const markToIndex = tokens.findIndex((t) => t.id === mark.anchor.to);
    if (markFromIndex === -1 || markToIndex === -1) continue;

    const markStartIndex = Math.min(markFromIndex, markToIndex);
    const markEndIndex = Math.max(markFromIndex, markToIndex);
    const markStartToken = tokens[markStartIndex];
    const markEndToken = tokens[markEndIndex];
    if (!markStartToken || !markEndToken) continue;

    const markStartId = markStartToken.id;
    const markEndId = markEndToken.id;

    // Check if selection exactly matches emphasis range
    if (selStartId === markStartId && selEndId === markEndId) {
      return { markId: mark.id };
    }
  }

  return null;
}

/**
 * Find a region (underline) mark that exactly matches the given selection range
 */
function findRegionForSelection(
  doc: SKAMDocument,
  fromId: string,
  toId: string
): {
  markId: string;
  style: UnderlineStyle | undefined;
  ref: string | undefined;
  refFormat: RefFormat | undefined;
  refMarkId: string | undefined;
} | null {
  const tokens = doc.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === fromId);
  const toIndex = tokens.findIndex((t) => t.id === toId);
  if (fromIndex === -1 || toIndex === -1) return null;

  const selStartIndex = Math.min(fromIndex, toIndex);
  const selEndIndex = Math.max(fromIndex, toIndex);
  const selStartId = tokens[selStartIndex]?.id;
  const selEndId = tokens[selEndIndex]?.id;

  for (const mark of doc.marks) {
    if (mark.type !== 'region') continue;
    if (!mark.id) continue;

    const markFromIndex = tokens.findIndex((t) => t.id === mark.anchor.from);
    const markToIndex = tokens.findIndex((t) => t.id === mark.anchor.to);
    if (markFromIndex === -1 || markToIndex === -1) continue;

    const markStartIndex = Math.min(markFromIndex, markToIndex);
    const markEndIndex = Math.max(markFromIndex, markToIndex);
    const markStartToken = tokens[markStartIndex];
    const markEndToken = tokens[markEndIndex];
    if (!markStartToken || !markEndToken) continue;

    const markStartId = markStartToken.id;
    const markEndId = markEndToken.id;

    // Check if selection exactly matches region range
    if (selStartId === markStartId && selEndId === markEndId) {
      // Extract style and ref from the mark
      const style = 'style' in mark ? (mark.style as UnderlineStyle | undefined) : undefined;
      const ref = 'ref' in mark ? (mark.ref as string | undefined) : undefined;

      // Find associated ref mark and its format
      let refFormat: RefFormat | undefined;
      let refMarkId: string | undefined;
      if (ref) {
        for (const refMark of doc.marks) {
          if (refMark.type === 'ref' && refMark.id === ref) {
            refMarkId = refMark.id;
            if ('format' in refMark) {
              refFormat = refMark.format as RefFormat | undefined;
            }
            break;
          }
        }
      }

      return { markId: mark.id, style, ref, refFormat, refMarkId };
    }
  }

  return null;
}

/**
 * Update selection panel with current selection info
 */
function updateSelectionPanel(fromId: string, toId: string): void {
  if (!currentDocument) {
    clearSelectionPanel();
    return;
  }

  // Update current selection state
  currentSelectionFromId = fromId;
  currentSelectionToId = toId;

  // Get tokens in range
  const tokens = currentDocument.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === fromId);
  const toIndex = tokens.findIndex((t) => t.id === toId);

  if (fromIndex === -1 || toIndex === -1) {
    clearSelectionPanel();
    return;
  }

  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);
  const selectedTokens = tokens.slice(startIndex, endIndex + 1);
  const count = selectedTokens.length;
  const chars = selectedTokens.map((t) => t.text).join('');

  // Normalize selection to start/end order
  const normalizedFromId = tokens[startIndex]!.id;
  const normalizedToId = tokens[endIndex]!.id;

  // Determine selection mode and tateten state
  const tatetenInfo = findTatetenForSelection(currentDocument, normalizedFromId, normalizedToId);
  currentTatetenMarkId = tatetenInfo?.markId ?? null;

  // Determine emphasis state
  const emphasisInfo = findEmphasisForSelection(currentDocument, normalizedFromId, normalizedToId);
  currentEmphasisMarkId = emphasisInfo?.markId ?? null;

  // Determine underline/region state
  const regionInfo = findRegionForSelection(currentDocument, normalizedFromId, normalizedToId);
  currentUnderlineMarkId = regionInfo?.markId ?? null;
  // If existing region found, use its style, ref and format; otherwise reset to defaults
  if (regionInfo) {
    currentUnderlineStyle = regionInfo.style ?? 'solid';
    currentUnderlineRef = regionInfo.ref ?? '';
    currentUnderlineFormat = regionInfo.refFormat ?? '';
  } else {
    currentUnderlineStyle = 'solid';
    currentUnderlineRef = '';
    currentUnderlineFormat = '';
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
      if (mark.type === 'kaeri' && 'value' in mark) {
        currentKaeriValue = String(mark.value);
        break;
      }
    }
  }

  // Get kana marks for first token
  let currentKanaType: 'yomigana' | 'okurigana' | 'soegana' = 'yomigana';
  currentKanaValues = { yomigana: '', okurigana: '', soegana: '' };

  const firstTokenMarks = getMarksForToken(currentDocument, fromId);
  for (const mark of firstTokenMarks) {
    if ('value' in mark && typeof mark.value === 'string') {
      if (mark.type === 'yomigana' || mark.type === 'okurigana' || mark.type === 'soegana') {
        currentKanaValues[mark.type] = mark.value;
      }
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
      <div class="selection-chars">${chars}</div>
    </div>
  `;

  selectionInfo.innerHTML = html;

  // Update tateten button
  updateTatetenButton();

  // Update emphasis button
  updateEmphasisButton();

  // Update underline button
  updateUnderlineButton();

  // Update kaeriten buttons
  updateKaeriButtons(currentKaeriValue);

  // Update kana type buttons and input
  currentSelectedKanaType = currentKanaType;
  updateKanaTypeButtons();
  selectionKanaInput.value = currentKanaValues[currentKanaType];
  selectionKanaApply.disabled = !selectionKanaInput.value.trim();

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
    const type = btn.dataset['type'] as 'yomigana' | 'okurigana' | 'soegana';
    btn.classList.toggle('active', type === currentSelectedKanaType);
    btn.classList.toggle('has-value', Boolean(currentKanaValues[type]));
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

  // In 'multi' mode (multiple chars without tateten), kaeri is disabled
  const isDisabled = currentSelectionMode === 'multi';

  if (isDisabled) {
    // Show disabled message
    const msg = document.createElement('span');
    msg.className = 'selection-kaeri-disabled-msg';
    msg.textContent = '竪点をつけると返り点が使えます';
    selectionKaeriButtons.appendChild(msg);
    return;
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

  // Normalize selection range
  const tokens = currentDocument.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === currentSelectionFromId);
  const toIndex = tokens.findIndex((t) => t.id === currentSelectionToId);
  if (fromIndex === -1 || toIndex === -1) return;

  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);
  const normalizedFromId = tokens[startIndex]!.id;
  const normalizedToId = tokens[endIndex]!.id;

  if (currentSelectionMode === 'tateten' && currentTatetenMarkId) {
    // Remove existing tateten
    // Also remove any kaeri attached to this tateten range
    for (const mark of currentDocument.marks) {
      if (
        mark.type === 'kaeri' &&
        mark.anchor.from === normalizedFromId &&
        mark.anchor.to === normalizedToId &&
        mark.id
      ) {
        newDoc = removeMark(newDoc, mark.id);
        break;
      }
    }
    newDoc = removeMark(newDoc, currentTatetenMarkId);
  } else if (currentSelectionMode === 'multi') {
    // Add new tateten
    newDoc = addMark(newDoc, {
      type: 'tateten',
      anchor: { from: normalizedFromId, to: normalizedToId },
    });
  }

  updateXmlFromDocument(newDoc);

  // Re-update selection panel
  if (currentSelectionFromId && currentSelectionToId) {
    updateSelectionPanel(currentSelectionFromId, currentSelectionToId);
  }
}

/**
 * Update emphasis button based on current selection state
 */
function updateEmphasisButton(): void {
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

  // Normalize selection range
  const tokens = currentDocument.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === currentSelectionFromId);
  const toIndex = tokens.findIndex((t) => t.id === currentSelectionToId);
  if (fromIndex === -1 || toIndex === -1) return;

  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);
  const normalizedFromId = tokens[startIndex]!.id;
  const normalizedToId = tokens[endIndex]!.id;

  if (currentEmphasisMarkId) {
    // Remove existing emphasis
    newDoc = removeMark(newDoc, currentEmphasisMarkId);
  } else {
    // Add new emphasis
    newDoc = addMark(newDoc, {
      type: 'emphasis',
      anchor: { from: normalizedFromId, to: normalizedToId },
    });
  }

  updateXmlFromDocument(newDoc);

  // Re-update selection panel
  if (currentSelectionFromId && currentSelectionToId) {
    updateSelectionPanel(currentSelectionFromId, currentSelectionToId);
  }
}

/**
 * Update underline style buttons state
 */
function updateUnderlineStyleButtons(): void {
  const buttons = selectionUnderlineStyles.querySelectorAll<HTMLButtonElement>(
    '.selection-underline-style-btn'
  );
  for (const btn of buttons) {
    const style = btn.dataset['style'] as UnderlineStyle;
    btn.classList.toggle('active', style === currentUnderlineStyle);
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
    !currentUnderlineMarkId
  )
    return;

  let newDoc = currentDocument;

  // Normalize selection range
  const tokens = currentDocument.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === currentSelectionFromId);
  const toIndex = tokens.findIndex((t) => t.id === currentSelectionToId);
  if (fromIndex === -1 || toIndex === -1) return;

  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);
  const normalizedFromId = tokens[startIndex]!.id;
  const normalizedToId = tokens[endIndex]!.id;

  // Remove existing underline and associated ref mark
  const regionInfo = findRegionForSelection(newDoc, normalizedFromId, normalizedToId);
  if (regionInfo?.refMarkId) {
    newDoc = removeMark(newDoc, regionInfo.refMarkId);
  }
  newDoc = removeMark(newDoc, currentUnderlineMarkId);

  // Add new underline with current settings
  const refInputValue = selectionUnderlineRefInput.value.trim();
  const formatValue = selectionUnderlineFormatSelect.value as RefFormat | '';

  // If format is specified, create a ref mark
  let refId: string | undefined;
  if (formatValue) {
    refId = refInputValue || generateRefId(newDoc);
    const refMark: {
      type: 'ref';
      id?: string;
      format: RefFormat;
      anchor: { from: string; to: string };
    } = {
      type: 'ref',
      id: refId,
      format: formatValue,
      anchor: { from: normalizedFromId, to: normalizedToId },
    };
    newDoc = addMark(newDoc, refMark);
    // Find the newly added ref mark to get its generated ID
    const addedRefMark = newDoc.marks.find(
      (m) =>
        m.type === 'ref' &&
        'format' in m &&
        m.format === formatValue &&
        m.anchor.from === normalizedFromId &&
        m.anchor.to === normalizedToId
    );
    if (addedRefMark?.id) {
      refId = addedRefMark.id;
    }
  } else if (refInputValue) {
    refId = refInputValue;
  }

  const regionMark: {
    type: 'region';
    style: UnderlineStyle;
    anchor: { from: string; to: string };
    ref?: string;
  } = {
    type: 'region',
    style: currentUnderlineStyle,
    anchor: { from: normalizedFromId, to: normalizedToId },
  };
  if (refId) {
    regionMark.ref = refId;
  }
  newDoc = addMark(newDoc, regionMark);

  updateXmlFromDocument(newDoc);

  // Re-update selection panel
  if (currentSelectionFromId && currentSelectionToId) {
    updateSelectionPanel(currentSelectionFromId, currentSelectionToId);
  }
}

/**
 * Generate a unique ref ID based on existing marks
 */
function generateRefId(doc: SKAMDocument): string {
  let maxNum = 0;
  for (const mark of doc.marks) {
    if (mark.type === 'ref' && mark.id) {
      const match = /^ref-(\d+)$/.exec(mark.id);
      if (match?.[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }
  return `ref-${maxNum + 1}`;
}

/**
 * Handle underline button click - add or remove underline (region)
 */
function handleUnderlineToggle(): void {
  if (!currentDocument || !currentSelectionFromId || !currentSelectionToId) return;

  let newDoc = currentDocument;

  // Normalize selection range
  const tokens = currentDocument.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === currentSelectionFromId);
  const toIndex = tokens.findIndex((t) => t.id === currentSelectionToId);
  if (fromIndex === -1 || toIndex === -1) return;

  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);
  const normalizedFromId = tokens[startIndex]!.id;
  const normalizedToId = tokens[endIndex]!.id;

  if (currentUnderlineMarkId) {
    // Remove existing underline and associated ref mark
    const regionInfo = findRegionForSelection(newDoc, normalizedFromId, normalizedToId);
    if (regionInfo?.refMarkId) {
      newDoc = removeMark(newDoc, regionInfo.refMarkId);
    }
    newDoc = removeMark(newDoc, currentUnderlineMarkId);
  } else {
    // Add new underline (region with selected style and optional ref)
    const refInputValue = selectionUnderlineRefInput.value.trim();
    const formatValue = selectionUnderlineFormatSelect.value as RefFormat | '';

    // If format is specified, create a ref mark
    let refId: string | undefined;
    if (formatValue) {
      refId = refInputValue || generateRefId(newDoc);
      const refMark: {
        type: 'ref';
        id?: string;
        format: RefFormat;
        anchor: { from: string; to: string };
      } = {
        type: 'ref',
        id: refId,
        format: formatValue,
        anchor: { from: normalizedFromId, to: normalizedToId },
      };
      newDoc = addMark(newDoc, refMark);
      // Update refId to match the generated mark ID (addMark generates new IDs)
      // We need to find the newly added ref mark
      const addedRefMark = newDoc.marks.find(
        (m) =>
          m.type === 'ref' &&
          'format' in m &&
          m.format === formatValue &&
          m.anchor.from === normalizedFromId &&
          m.anchor.to === normalizedToId
      );
      if (addedRefMark?.id) {
        refId = addedRefMark.id;
      }
    } else if (refInputValue) {
      // Just use the ref ID without creating a ref mark
      refId = refInputValue;
    }

    const regionMark: {
      type: 'region';
      style: UnderlineStyle;
      anchor: { from: string; to: string };
      ref?: string;
    } = {
      type: 'region',
      style: currentUnderlineStyle,
      anchor: { from: normalizedFromId, to: normalizedToId },
    };
    if (refId) {
      regionMark.ref = refId;
    }
    newDoc = addMark(newDoc, regionMark);
  }

  updateXmlFromDocument(newDoc);

  // Re-update selection panel
  if (currentSelectionFromId && currentSelectionToId) {
    updateSelectionPanel(currentSelectionFromId, currentSelectionToId);
  }
}

/**
 * Apply kaeri value to document
 */
function applyKaeriValue(value: string | null): void {
  if (!currentDocument || !currentSelectionFromId || !currentSelectionToId) return;

  let newDoc = currentDocument;

  // Normalize selection range
  const tokens = currentDocument.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === currentSelectionFromId);
  const toIndex = tokens.findIndex((t) => t.id === currentSelectionToId);
  if (fromIndex === -1 || toIndex === -1) return;

  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);
  const normalizedFromId = tokens[startIndex]!.id;
  const normalizedToId = tokens[endIndex]!.id;

  // For single selection or tateten range, apply kaeri to the full range
  const anchorFrom = currentSelectionMode === 'single' ? normalizedFromId : normalizedFromId;
  const anchorTo = currentSelectionMode === 'single' ? normalizedFromId : normalizedToId;

  // Find and remove existing kaeri mark for this range
  for (const mark of currentDocument.marks) {
    if (
      mark.type === 'kaeri' &&
      mark.anchor.from === anchorFrom &&
      mark.anchor.to === anchorTo &&
      mark.id
    ) {
      newDoc = removeMark(newDoc, mark.id);
      break;
    }
  }

  // Add new mark if value is provided
  if (value) {
    newDoc = addMark(newDoc, {
      type: 'kaeri',
      value: value,
      anchor: { from: anchorFrom, to: anchorTo },
    });
  }

  updateXmlFromDocument(newDoc);

  // Re-update selection panel with new state
  if (currentSelectionFromId && currentSelectionToId) {
    updateSelectionPanel(currentSelectionFromId, currentSelectionToId);
  }
}

/**
 * Handle kana apply in selection panel
 */
function handleKanaApply(): void {
  if (!currentDocument || !currentSelectionFromId || !currentSelectionToId) return;

  const type = currentSelectedKanaType;
  const value = selectionKanaInput.value.trim();

  if (!value) return;

  let newDoc = currentDocument;

  // Find and remove existing mark of the same type
  const existingMark = getMarksForToken(currentDocument, currentSelectionFromId).find(
    (m) => m.type === type
  );
  if (existingMark?.id) {
    newDoc = removeMark(newDoc, existingMark.id);
  }

  // Add new mark
  newDoc = addMark(newDoc, {
    type,
    value,
    anchor: { from: currentSelectionFromId, to: currentSelectionToId },
  });

  updateXmlFromDocument(newDoc);

  // Re-update selection panel
  updateSelectionPanel(currentSelectionFromId, currentSelectionToId);
}

/**
 * Clear selection panel
 */
function clearSelectionPanel(): void {
  currentSelectionFromId = null;
  currentSelectionToId = null;
  currentKanaValues = { yomigana: '', okurigana: '', soegana: '' };
  currentSelectedKanaType = 'yomigana';
  currentKaeriRe = false;
  currentKaeriOther = null;
  currentTatetenMarkId = null;
  currentEmphasisMarkId = null;
  currentUnderlineMarkId = null;
  currentSelectionMode = 'single';
  selectionInfo.innerHTML = '<p class="selection-empty">文字をクリックまたはドラッグで選択</p>';
  selectionActions.style.display = 'none';
  selectionKaeriButtons.innerHTML = '';
  selectionTatetenBtn.disabled = true;
  selectionTatetenBtn.textContent = '熟語にする';
  selectionTatetenBtn.classList.remove('active');
  selectionEmphasisBtn.textContent = '傍点をつける';
  selectionEmphasisBtn.classList.remove('active');
  selectionUnderlineBtn.textContent = '傍線を引く';
  selectionUnderlineBtn.classList.remove('active');
  currentUnderlineStyle = 'solid';
  currentUnderlineRef = '';
  currentUnderlineFormat = '';
  updateUnderlineStyleButtons();
  selectionUnderlineRefInput.value = '';
  selectionUnderlineFormatSelect.value = '';
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
    region: '傍線',
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

  // Sort marks by their anchor position in the document (appearance order)
  const sortedMarks = [...doc.marks].sort((a, b) => {
    const aFromIndex = doc.tokens.findIndex((t) => t.id === a.anchor.from);
    const bFromIndex = doc.tokens.findIndex((t) => t.id === b.anchor.from);
    return aFromIndex - bFromIndex;
  });

  // Build HTML - display in appearance order with type inline
  let html = '';
  for (const mark of sortedMarks) {
    const anchorFrom = mark.anchor.from;
    const anchorTo = mark.anchor.to;

    // Get text for the anchor range
    let anchorText = '';
    const fromIndex = doc.tokens.findIndex((t) => t.id === anchorFrom);
    const toIndex = doc.tokens.findIndex((t) => t.id === anchorTo);
    if (fromIndex !== -1 && toIndex !== -1) {
      const startIdx = Math.min(fromIndex, toIndex);
      const endIdx = Math.max(fromIndex, toIndex);
      anchorText = doc.tokens
        .slice(startIdx, endIdx + 1)
        .map((t) => t.text)
        .join('');
    }

    let value = '';
    if ('value' in mark && mark.value !== undefined) {
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

function renderDocument(doc: SKAMDocument, preserveSelection = false): void {
  currentDocument = doc;

  // Save current selection state before cleanup
  const savedFromId = preserveSelection ? currentSelectionFromId : null;
  const savedToId = preserveSelection ? currentSelectionToId : null;

  // Cleanup previous interactive handlers
  cleanupInteractiveHandlers?.();
  cleanupInteractiveHandlers = null;

  // Clear selection panel only if not preserving
  if (!preserveSelection) {
    clearSelectionPanel();
  }

  // Update marks list panel
  updateMarksList(doc);

  // JSON output
  jsonOutput.textContent = JSON.stringify(doc, null, 2);

  // HTML render with interactive mode enabled
  const writingMode = getWritingMode();
  const inline = getInlineMode();
  const profileName = getProfile();
  const profile = PROFILES[profileName];
  const result = render(doc, { writingMode, inline, profile, interactive: true });

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

    // Restore selection if preserving
    if (savedFromId && savedToId) {
      updateSelectionPanel(savedFromId, savedToId);
      setSelectionClasses(renderOutput, savedFromId, savedToId);
    }
  }
}

function parseAndRender(): void {
  hideErrors();

  const xmlText = xmlEditor.getValue().trim();
  if (!xmlText) {
    showErrors([{ message: 'XMLを入力してください' }]);
    return;
  }

  try {
    const doc = parse(xmlText);
    renderDocument(doc);
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
 * It converts the document back to XML and updates the editor,
 * while preventing the change from triggering a re-parse.
 *
 * @param doc The updated SKAMDocument
 */
function updateXmlFromDocument(doc: SKAMDocument): void {
  isUpdatingFromGui = true;
  try {
    currentDocument = doc;
    const xml = stringify(doc);
    xmlEditor.setValue(xml);
    // Preserve selection when updating from GUI actions
    renderDocument(doc, true);
    hideErrors();
  } finally {
    isUpdatingFromGui = false;
  }
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
xmlEditor.onContentChange(() => {
  // Skip if this change was triggered by GUI operation (updateXmlFromDocument)
  if (isUpdatingFromGui) return;

  // Auto-parse on content change
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
for (const radio of writingModeRadios) {
  radio.addEventListener('change', () => {
    updateURL({ mode: getWritingMode() });
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
  updateURL({ profile: getProfile() });
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
  const target = e.target as HTMLElement;
  if (!target.classList.contains('selection-kana-type-btn')) return;

  const type = target.dataset['type'] as 'yomigana' | 'okurigana' | 'soegana' | undefined;
  if (!type) return;

  currentSelectedKanaType = type;
  updateKanaTypeButtons();

  // Update input with existing value for this type
  selectionKanaInput.value = currentKanaValues[type];
  selectionKanaApply.disabled = !selectionKanaInput.value.trim();
  selectionKanaInput.focus();
});

// Selection panel kana input
selectionKanaInput.addEventListener('input', () => {
  selectionKanaApply.disabled = !selectionKanaInput.value.trim();
});

selectionKanaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && selectionKanaInput.value.trim()) {
    e.preventDefault();
    handleKanaApply();
  }
});

selectionKanaApply.addEventListener('click', handleKanaApply);

// Selection panel tateten button
selectionTatetenBtn.addEventListener('click', handleTatetenToggle);

// Selection panel emphasis button
selectionEmphasisBtn.addEventListener('click', handleEmphasisToggle);

// Selection panel underline style buttons
selectionUnderlineStyles.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('selection-underline-style-btn')) return;

  const style = target.dataset['style'] as UnderlineStyle | undefined;
  if (!style) return;

  currentUnderlineStyle = style;
  updateUnderlineStyleButtons();

  // If underline already exists, update it immediately
  if (currentUnderlineMarkId) {
    updateExistingUnderline();
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

// Restore state from URL
const initialState = getStateFromURL();

// Set writing mode
for (const radio of writingModeRadios) {
  radio.checked = radio.value === initialState.mode;
}

// Set inline mode
inlineModeCheckbox.checked = initialState.inline;

// Set profile
profileSelect.value = initialState.profile;

// Load sample (without updating URL since we're restoring from URL)
loadSample(initialState.sample, false);

// Apply initial customize styles
applyCustomStyles();

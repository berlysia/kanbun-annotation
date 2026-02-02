/**
 * SKAM Playground
 */

import { parse, stringify, SKAMXMLParseError } from '@kanbun/skam-xml-parser';
import { render, attachInteractiveHandlers, PROFILES } from '@kanbun/skam-html-renderer';
import type { SKAMDocument } from '@kanbun/skam';
import { SAMPLES } from './samples.js';
import { ErrorPanel, type ParseError } from './editor/error-panel.js';
import { XmlEditor } from './editor/xml-editor.js';
import { MarkPopup, getKaeriValueFromKind, type ExistingKanaMarks } from './editor/mark-popup.js';
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
const selectionKaeriButtons = document.getElementById('selection-kaeri-buttons') as HTMLDivElement;
const selectionKanaType = document.getElementById('selection-kana-type') as HTMLSelectElement;
const selectionKanaInput = document.getElementById('selection-kana-input') as HTMLInputElement;
const selectionKanaApply = document.getElementById('selection-kana-apply') as HTMLButtonElement;

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

// Kaeriten definitions for selection panel
const KAERI_VALUES = [
  { label: 'レ', value: 'レ' },
  { label: '一', value: '一' },
  { label: '二', value: '二' },
  { label: '三', value: '三' },
  { label: '四', value: '四' },
  { label: '上', value: '上' },
  { label: '中', value: '中' },
  { label: '下', value: '下' },
  { label: '甲', value: '甲' },
  { label: '乙', value: '乙' },
  { label: '丙', value: '丙' },
  { label: '天', value: '天' },
  { label: '地', value: '地' },
  { label: '人', value: '人' },
];

// Flag to prevent double updates when GUI operation triggers XML update
// which would trigger parseAndRender again
let isUpdatingFromGui = false;

// Cleanup function for interactive handlers
let cleanupInteractiveHandlers: (() => void) | null = null;

// Mark Popup instance for adding/editing marks
const markPopup = new MarkPopup(document.body);

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

  // Get marks for selected tokens
  const allMarks: Array<{ tokenChar: string; type: string; value: string }> = [];
  let currentKaeriValue: string | null = null;
  let currentKanaValue = '';
  let currentKanaType: 'yomigana' | 'okurigana' | 'soegana' = 'yomigana';

  for (const token of selectedTokens) {
    const marks = getMarksForToken(currentDocument, token.id);
    for (const mark of marks) {
      let value = '';
      if (mark.type === 'kaeri' && 'value' in mark) {
        value = String(mark.value);
        // Only use first token's kaeri for panel
        if (token.id === fromId) {
          currentKaeriValue = value;
        }
      } else if ('value' in mark && typeof mark.value === 'string') {
        value = mark.value;
        // Use first token's kana for panel
        if (token.id === fromId) {
          if (mark.type === 'yomigana' || mark.type === 'okurigana' || mark.type === 'soegana') {
            currentKanaType = mark.type;
            currentKanaValue = value;
          }
        }
      }
      if (value) {
        allMarks.push({
          tokenChar: token.text,
          type: mark.type,
          value,
        });
      }
    }
  }

  // Build HTML
  let html = `
    <div class="selection-summary">
      <div class="selection-count">${count}文字選択</div>
      <div class="selection-chars">${chars}</div>
    </div>
  `;

  if (allMarks.length > 0) {
    html += `
      <div class="selection-marks">
        <div class="selection-marks-title">マーク情報</div>
        ${allMarks
          .map(
            (m) => `
          <div class="selection-mark-item">
            <span class="selection-mark-type">${m.tokenChar}: ${getMarkTypeLabel(m.type)}</span>
            <span class="selection-mark-value">${m.value}</span>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  selectionInfo.innerHTML = html;

  // Update kaeriten buttons
  updateKaeriButtons(currentKaeriValue);

  // Update kana input
  selectionKanaType.value = currentKanaType;
  selectionKanaInput.value = currentKanaValue;
  selectionKanaApply.disabled = !currentKanaValue.trim();

  // Show actions panel
  selectionActions.style.display = 'block';
}

/**
 * Update kaeriten buttons in selection panel
 */
function updateKaeriButtons(currentValue: string | null): void {
  selectionKaeriButtons.innerHTML = '';

  // Add kaeri buttons
  for (const kaeri of KAERI_VALUES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'selection-kaeri-btn';
    btn.textContent = kaeri.label;
    btn.dataset['value'] = kaeri.value;

    if (currentValue === kaeri.value) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () => {
      handleKaeriButtonClick(kaeri.value, currentValue === kaeri.value);
    });

    selectionKaeriButtons.appendChild(btn);
  }

  // Add clear button if there's a current value
  if (currentValue) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'selection-kaeri-btn selection-kaeri-btn--clear';
    clearBtn.textContent = '✕';
    clearBtn.title = '返り点を削除';
    clearBtn.addEventListener('click', () => {
      handleKaeriButtonClick(null, false);
    });
    selectionKaeriButtons.appendChild(clearBtn);
  }
}

/**
 * Handle kaeriten button click in selection panel
 */
function handleKaeriButtonClick(value: string | null, isToggleOff: boolean): void {
  if (!currentDocument || !currentSelectionFromId) return;

  let newDoc = currentDocument;

  // Find and remove existing kaeri mark
  const existingMark = getMarksForToken(currentDocument, currentSelectionFromId).find(
    (m) => m.type === 'kaeri'
  );
  if (existingMark?.id) {
    newDoc = removeMark(newDoc, existingMark.id);
  }

  // Add new mark if not toggling off and value is provided
  if (!isToggleOff && value) {
    newDoc = addMark(newDoc, {
      type: 'kaeri',
      value: value,
      anchor: { from: currentSelectionFromId, to: currentSelectionFromId },
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

  const type = selectionKanaType.value as 'yomigana' | 'okurigana' | 'soegana';
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
  selectionInfo.innerHTML = '<p class="selection-empty">文字をクリックまたはドラッグで選択</p>';
  selectionActions.style.display = 'none';
  selectionKaeriButtons.innerHTML = '';
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
    note: '注釈',
  };
  return labels[type] ?? type;
}

function renderDocument(doc: SKAMDocument): void {
  currentDocument = doc;

  // Cleanup previous interactive handlers
  cleanupInteractiveHandlers?.();
  cleanupInteractiveHandlers = null;

  // Clear selection panel
  clearSelectionPanel();

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
      onTokenClick: (tokenId, event) => {
        if (!currentDocument) return;

        // Update selection panel
        updateSelectionPanel(tokenId, tokenId);

        // Find existing marks for this token
        const marks = getMarksForToken(currentDocument, tokenId);
        const existingKaeri = marks.find((m) => m.type === 'kaeri');

        // Collect existing kana marks by type
        const existingKanaMarks: ExistingKanaMarks = {};
        for (const mark of marks) {
          if (mark.type === 'okurigana') existingKanaMarks.okurigana = mark;
          if (mark.type === 'yomigana') existingKanaMarks.yomigana = mark;
          if (mark.type === 'soegana') existingKanaMarks.soegana = mark;
        }

        // Show unified popup with kaeri tab as default for single click
        markPopup.showUnifiedPopup(
          { x: event.clientX, y: event.clientY },
          tokenId,
          tokenId,
          'kaeri',
          existingKaeri,
          existingKanaMarks
        );
      },
      onTokenSelect: (fromId, toId) => {
        if (!currentDocument) return;

        // Update selection panel
        updateSelectionPanel(fromId, toId);

        // Find existing marks for the first token
        const marks = getMarksForToken(currentDocument, fromId);
        const existingKaeri = marks.find((m) => m.type === 'kaeri');

        // Collect existing kana marks by type
        const existingKanaMarks: ExistingKanaMarks = {};
        for (const mark of marks) {
          if (mark.type === 'okurigana') existingKanaMarks.okurigana = mark;
          if (mark.type === 'yomigana') existingKanaMarks.yomigana = mark;
          if (mark.type === 'soegana') existingKanaMarks.soegana = mark;
        }

        // Calculate position: use the center of the selection range
        const tokenElement = renderOutput.querySelector(`[data-token-id="${fromId}"]`);
        let position = { x: 0, y: 0 };
        if (tokenElement) {
          const rect = tokenElement.getBoundingClientRect();
          position = { x: rect.left + rect.width / 2, y: rect.bottom + 5 };
        }

        // Show unified popup with kana tab as default for range selection
        markPopup.showUnifiedPopup(position, fromId, toId, 'kana', existingKaeri, existingKanaMarks);
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
    renderDocument(doc);
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

// ============================================================================
// Mark Popup Callbacks
// ============================================================================

// Kaeri (返り点) selection callback
markPopup.onKaeriSelect((tokenId, kind) => {
  if (!currentDocument) return;

  let newDoc = currentDocument;

  // Find and remove existing kaeri mark for this token
  const existingMark = getMarksForToken(currentDocument, tokenId).find((m) => m.type === 'kaeri');
  if (existingMark?.id) {
    newDoc = removeMark(newDoc, existingMark.id);
  }

  // Add new mark if kind is provided (not a delete operation)
  if (kind) {
    const kaeriValue = getKaeriValueFromKind(kind);
    if (kaeriValue) {
      newDoc = addMark(newDoc, {
        type: 'kaeri',
        value: kaeriValue,
        anchor: { from: tokenId, to: tokenId },
      });
    }
  }

  updateXmlFromDocument(newDoc);
});

// Kana (送り仮名/読み仮名/添え仮名) selection callback
markPopup.onKanaSelect((fromId, toId, type, value) => {
  if (!currentDocument) return;

  let newDoc = currentDocument;

  // Find and remove existing mark of the SAME type only
  // This preserves other kana types (e.g., when adding yomigana, keep okurigana)
  if (type) {
    const existingMark = getMarksForToken(currentDocument, fromId).find((m) => m.type === type);
    if (existingMark?.id) {
      newDoc = removeMark(newDoc, existingMark.id);
    }
  }
  // Note: if type is null/undefined without value, nothing is deleted (no-op)

  // Add new mark if type is provided (not a delete operation)
  if (type && value) {
    newDoc = addMark(newDoc, {
      type,
      value,
      anchor: { from: fromId, to: toId },
    });
  }

  updateXmlFromDocument(newDoc);
});

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

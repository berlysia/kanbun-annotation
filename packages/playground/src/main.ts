/**
 * SKAM Playground
 */

import { parse, SKAMXMLParseError } from '@kanbun/skam-xml-parser';
import { render } from '@kanbun/skam-html-renderer';
import type { SKAMDocument } from '@kanbun/skam';
import { SAMPLES } from './samples.js';

// ============================================================================
// DOM Elements
// ============================================================================

const xmlInput = document.getElementById('xml-input') as HTMLTextAreaElement;
const parseBtn = document.getElementById('parse-btn') as HTMLButtonElement;
const errorMessage = document.getElementById('error-message') as HTMLDivElement;
const jsonOutput = document.getElementById('json-output')?.querySelector('code') as HTMLElement;
const renderOutput = document.getElementById('render-output') as HTMLDivElement;
const htmlOutput = document.getElementById('html-output')?.querySelector('code') as HTMLElement;
const sampleSelect = document.getElementById('sample-select') as HTMLSelectElement;
const copyJsonBtn = document.getElementById('copy-json-btn') as HTMLButtonElement;
const copyHtmlBtn = document.getElementById('copy-html-btn') as HTMLButtonElement;
const writingModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="writing-mode"]');
const inlineModeCheckbox = document.getElementById('inline-mode') as HTMLInputElement;

// CSS Customize elements
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
  glyphSize: '1',
  rubyRatio: '0.5',
  lineHeight: '2',
};

// ============================================================================
// URL State Management
// ============================================================================

interface URLState {
  sample: number;
  mode: 'vertical' | 'horizontal';
  inline: boolean;
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

  return { sample, mode, inline };
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

  const queryString = params.toString();
  const newURL = queryString
    ? `${window.location.pathname}?${queryString}`
    : window.location.pathname;

  window.history.replaceState(null, '', newURL);
}

// ============================================================================
// Functions
// ============================================================================

function showError(message: string): void {
  errorMessage.textContent = message;
  errorMessage.classList.add('visible');
}

function hideError(): void {
  errorMessage.classList.remove('visible');
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

function renderDocument(doc: SKAMDocument): void {
  currentDocument = doc;

  // JSON output
  jsonOutput.textContent = JSON.stringify(doc, null, 2);

  // HTML render
  const writingMode = getWritingMode();
  const inline = getInlineMode();
  const result = render(doc, { writingMode, inline });

  // Apply CSS and HTML
  const styleId = 'skam-playground-styles';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = result.css;

  // インラインモードの場合は前後にテキストを追加
  if (inline) {
    const writingModeClass = writingMode === 'vertical' ? ' inline-demo--vertical' : '';
    renderOutput.innerHTML = `<p class="inline-demo${writingModeClass}">本文中に「${result.html}」のように漢文を埋め込める。</p>`;
  } else {
    renderOutput.innerHTML = result.html;
  }

  // HTML source output
  htmlOutput.textContent = result.html;
}

function parseAndRender(): void {
  hideError();

  const xmlText = xmlInput.value.trim();
  if (!xmlText) {
    showError('XMLを入力してください');
    return;
  }

  try {
    const doc = parse(xmlText);
    renderDocument(doc);
  } catch (err) {
    if (err instanceof SKAMXMLParseError) {
      showError(`パースエラー: ${err.message}`);
    } else if (err instanceof Error) {
      showError(`エラー: ${err.message}`);
    } else {
      showError('不明なエラーが発生しました');
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
    xmlInput.value = sample.xml;
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

// ============================================================================
// Event Listeners
// ============================================================================

parseBtn.addEventListener('click', parseAndRender);

xmlInput.addEventListener('keydown', (e) => {
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

// CSS Customize
colorKaeritenInput.addEventListener('input', applyCustomStyles);
colorRubyInput.addEventListener('input', applyCustomStyles);
colorEmphasisInput.addEventListener('input', applyCustomStyles);
fontFamilySelect.addEventListener('change', applyCustomStyles);
glyphSizeInput.addEventListener('input', applyCustomStyles);
rubyRatioInput.addEventListener('input', applyCustomStyles);
lineHeightInput.addEventListener('input', applyCustomStyles);
resetCustomizeBtn.addEventListener('click', resetCustomize);

// ============================================================================
// Initialize
// ============================================================================

// Restore state from URL
const initialState = getStateFromURL();

// Set writing mode
for (const radio of writingModeRadios) {
  radio.checked = radio.value === initialState.mode;
}

// Set inline mode
inlineModeCheckbox.checked = initialState.inline;

// Load sample (without updating URL since we're restoring from URL)
loadSample(initialState.sample, false);

// Apply initial customize styles
applyCustomStyles();

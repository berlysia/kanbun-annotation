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

// ============================================================================
// State
// ============================================================================

let currentDocument: SKAMDocument | null = null;

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

function loadSample(index: number): void {
  const sample = SAMPLES[index];
  if (sample) {
    xmlInput.value = sample.xml;
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
    loadSample(index);
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
    if (currentDocument) {
      renderDocument(currentDocument);
    }
  });
}

// Inline mode change
inlineModeCheckbox.addEventListener('change', () => {
  if (currentDocument) {
    renderDocument(currentDocument);
  }
});

// ============================================================================
// Initialize
// ============================================================================

// Load first sample on init
loadSample(0);

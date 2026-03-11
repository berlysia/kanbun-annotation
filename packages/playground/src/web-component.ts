/**
 * Web Component demo page entry point
 *
 * <skam-renderer> カスタムエレメントの動作確認ページ
 */

import { SkamRendererElement } from '@kanbun-skam/skam-web-component';

customElements.define('skam-renderer', SkamRendererElement);

// --- Demo 2: Writing mode toggle ---
const wmRadios = document.querySelectorAll<HTMLInputElement>('input[name="wm-demo"]');
const wmRenderer = document.getElementById('wm-renderer') as HTMLElement;

for (const radio of wmRadios) {
  radio.addEventListener('change', () => {
    wmRenderer.setAttribute('writing-mode', radio.value);
  });
}

// --- Demo 3: Profile toggle ---
const profileSelect = document.getElementById('profile-demo-select') as HTMLSelectElement;
const profileRenderer = document.getElementById('profile-renderer') as HTMLElement;

profileSelect.addEventListener('change', () => {
  if (profileSelect.value) {
    profileRenderer.setAttribute('profile', profileSelect.value);
  } else {
    profileRenderer.removeAttribute('profile');
  }
});

// --- Demo 4: CSS Variables ---
const cssFontSize = document.getElementById('css-font-size') as HTMLInputElement;
const cssFontSizeValue = document.getElementById('css-font-size-value') as HTMLElement;
const cssKaeriColor = document.getElementById('css-kaeri-color') as HTMLInputElement;
const cssRubyColor = document.getElementById('css-ruby-color') as HTMLInputElement;
const cssVarsRenderer = document.getElementById('css-vars-renderer') as HTMLElement;

function updateCssVars(): void {
  cssVarsRenderer.style.setProperty('--skam-glyph-size', `${cssFontSize.value}em`);
  cssFontSizeValue.textContent = `${cssFontSize.value}em`;
}

cssFontSize.addEventListener('input', updateCssVars);
updateCssVars();

cssKaeriColor.addEventListener('input', () => {
  cssVarsRenderer.style.setProperty('--skam-color-kaeriten', cssKaeriColor.value);
});

cssRubyColor.addEventListener('input', () => {
  cssVarsRenderer.style.setProperty('--skam-color-ruby', cssRubyColor.value);
});

// --- Demo 5: Programmatic / Interactive ---
const interactiveRenderer = document.getElementById('interactive-renderer') as HTMLElement & {
  xmlContent: string | undefined;
};
const interactiveXml = document.getElementById('interactive-xml') as HTMLTextAreaElement;
const applyXmlBtn = document.getElementById('apply-xml-btn') as HTMLButtonElement;
const eventLog = document.getElementById('event-log') as HTMLElement;

applyXmlBtn.addEventListener('click', () => {
  interactiveRenderer.xmlContent = interactiveXml.value;
});

function logEvent(target: string, type: string, detail: string): void {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${target}: ${type} - ${detail}\n`;
  eventLog.textContent = line + (eventLog.textContent ?? '');
}

interactiveRenderer.addEventListener('skam-render', ((e: CustomEvent) => {
  const doc = e.detail.document;
  const tokenCount = doc.tokens?.length ?? 0;
  const markCount = doc.marks?.length ?? 0;
  logEvent('#interactive-renderer', 'skam-render', `tokens: ${tokenCount}, marks: ${markCount}`);
}) as EventListener);

interactiveRenderer.addEventListener('skam-error', ((e: CustomEvent) => {
  const msg = e.detail.error instanceof Error ? e.detail.error.message : String(e.detail.error);
  logEvent('#interactive-renderer', 'skam-error', msg);
}) as EventListener);

// --- Demo 6: Error handling ---
const errorRenderer = document.getElementById('error-renderer') as HTMLElement;
const errorLog = document.getElementById('error-log') as HTMLElement;

errorRenderer.addEventListener('skam-error', ((e: CustomEvent) => {
  const msg = e.detail.error instanceof Error ? e.detail.error.message : String(e.detail.error);
  const time = new Date().toLocaleTimeString();
  errorLog.textContent = `[${time}] skam-error: ${msg}`;
}) as EventListener);

import { describe, it, expect, beforeEach } from 'vitest';
import type { LintDiagnostic } from '@kanbun-skam/skam';
import { LintPanel, LINT_PANEL_LIMIT, updateLintPanel } from '../lint-panel.js';

function diag(i: number, message = `message ${i}`): LintDiagnostic {
  return { code: 'EMPTY_KANA', path: `marks[${i}].value`, message };
}

describe('LintPanel', () => {
  let container: HTMLDivElement;
  let panel: LintPanel;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    panel = new LintPanel(container);
  });

  it('shows the count heading and one item per diagnostic with code, message and path', () => {
    panel.setDiagnostics([diag(0), diag(1)]);
    expect(container.querySelector('.lint-heading')?.textContent).toBe('診断 2 件');
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('EMPTY_KANA');
    expect(items[0]?.textContent).toContain('message 0');
    expect(items[0]?.textContent).toContain('marks[0].value');
  });

  it('keeps the container in the DOM with empty content for zero diagnostics', () => {
    panel.setDiagnostics([diag(0)]);
    panel.setDiagnostics([]);
    expect(container.isConnected).toBe(true);
    expect(container.innerHTML).toBe('');
    expect(container.hidden).toBe(false);
  });

  it('clear() empties the content', () => {
    panel.setDiagnostics([diag(0)]);
    panel.clear();
    expect(container.innerHTML).toBe('');
  });

  it('sets the live region attributes', () => {
    expect(container.getAttribute('role')).toBe('status');
    expect(container.getAttribute('aria-live')).toBe('polite');
    expect(container.getAttribute('aria-atomic')).toBe('false');
    expect(container.getAttribute('aria-label')).toBeTruthy();
  });

  it('lists the first 100 and adds a remainder line for 101', () => {
    panel.setDiagnostics(Array.from({ length: LINT_PANEL_LIMIT + 1 }, (_, i) => diag(i)));
    expect(container.querySelectorAll('li')).toHaveLength(100);
    expect(container.querySelector('.lint-more')?.textContent).toBe('ほか 1 件');
    expect(container.querySelector('.lint-heading')?.textContent).toBe('診断 101 件');
  });

  it('has no remainder line for exactly 100', () => {
    panel.setDiagnostics(Array.from({ length: 100 }, (_, i) => diag(i)));
    expect(container.querySelector('.lint-more')).toBeNull();
  });

  it.each(['<b>x</b>', '<img src=x onerror=alert(1)>', '&amp;'])(
    'renders %s as text, not elements',
    (message) => {
      panel.setDiagnostics([diag(0, message)]);
      expect(container.querySelector('b')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelectorAll('*').length).toBe(
        // heading, ul, li, and the spans inside li
        container.querySelectorAll('.lint-heading, ul, li, li > span').length
      );
      expect(container.textContent).toContain(message);
    }
  );
});

describe('updateLintPanel', () => {
  const XML_DOC = {
    format: 'skam@0.1',
    tokens: [{ id: 't1', text: '將' }],
    blocks: [{ id: 'b1', tokenIds: ['t1'] }],
    marks: [
      {
        id: 'm1',
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [{ yomi: 'まさ', okuri: 'ニ' }],
      },
    ],
    readings: [],
  };

  it('shows diagnostics for a document', () => {
    const container = document.createElement('div');
    const panel = new LintPanel(container);
    updateLintPanel(panel, XML_DOC);
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.textContent).toContain('SAIDOKU_SINGLE_READING');
  });

  it('empties the panel and does not throw when the linter throws', () => {
    const container = document.createElement('div');
    const panel = new LintPanel(container);
    panel.setDiagnostics([diag(0)]);
    expect(() =>
      updateLintPanel(panel, XML_DOC, () => {
        throw new Error('boom');
      })
    ).not.toThrow();
    expect(container.innerHTML).toBe('');
  });
});

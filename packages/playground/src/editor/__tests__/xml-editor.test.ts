import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { XmlEditor } from '../xml-editor.js';

const DEBOUNCE_MS = 300;

describe('XmlEditor pending change', () => {
  let editor: XmlEditor;
  let textarea: HTMLTextAreaElement;
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="wrapper"><textarea></textarea></div>';
    editor = new XmlEditor(document.getElementById('wrapper')!, { debounceMs: DEBOUNCE_MS });
    textarea = editor.getTextareaElement();
    onChange = vi.fn();
    editor.onContentChange(onChange);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function typeText(value: string): void {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
  }

  it('flushes a pending input at once and does not notify again later', () => {
    typeText('<a/>');
    expect(editor.hasPendingChange()).toBe(true);

    expect(editor.flushPendingChange()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('<a/>');
    expect(editor.hasPendingChange()).toBe(false);

    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does nothing when nothing is pending', () => {
    expect(editor.flushPendingChange()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is no longer pending once the debounce has fired', () => {
    typeText('<a/>');
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(editor.hasPendingChange()).toBe(false);

    expect(editor.flushPendingChange()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('replaceValue cancels a pending input and does not notify', () => {
    typeText('<a/>');
    editor.replaceValue('<b/>');
    expect(editor.hasPendingChange()).toBe(false);
    expect(editor.getValue()).toBe('<b/>');

    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('setValue still notifies after the debounce', () => {
    editor.setValue('<a/>');
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

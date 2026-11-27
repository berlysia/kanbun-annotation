import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorPanel } from '../error-panel.js';

describe('ErrorPanel', () => {
  let container: HTMLDivElement;
  let panel: ErrorPanel;

  beforeEach(() => {
    container = document.createElement('div');
    panel = new ErrorPanel(container);
  });

  it('distinguishes warnings and shows their code and position', () => {
    panel.setErrors([{ message: 'a', line: 2, column: 3, severity: 'warning', code: 'X' }]);
    const items = container.querySelectorAll('.error-item');
    expect(items).toHaveLength(1);
    expect(items[0]?.classList.contains('error-item--warning')).toBe(true);
    expect(items[0]?.textContent).toContain('行 2, 列 3');
    expect(items[0]?.querySelector('.error-message')?.textContent).toBe('X a');
  });

  it('keeps the existing display for errors without severity', () => {
    panel.setErrors([{ message: 'a', line: 2, column: 3 }]);
    const item = container.querySelector('.error-item');
    expect(item?.className).toBe('error-item');
    expect(item?.querySelector('.error-location')?.textContent).toBe('行 2, 列 3:');
    expect(item?.querySelector('.error-message')?.textContent).toBe('a');
    expect(container.classList.contains('visible')).toBe(true);
  });

  it('jumps to a warning position when clicked', () => {
    const onClick = vi.fn();
    panel.onErrorClick(onClick);
    panel.setErrors([{ message: 'a', line: 2, column: 3, severity: 'warning', code: 'X' }]);
    container.querySelector<HTMLElement>('.error-item')?.click();
    expect(onClick).toHaveBeenCalledExactlyOnceWith(2, 3);
  });

  it('clears the panel after a valid input', () => {
    panel.setErrors([{ message: 'a' }]);
    panel.setErrors([]);
    expect(container.childElementCount).toBe(0);
    expect(container.classList.contains('visible')).toBe(false);
  });
});

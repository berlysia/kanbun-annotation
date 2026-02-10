import { describe, it, expect } from 'vitest';

describe('happy-dom API support', () => {
  it('supports customElements.define', () => {
    expect(customElements).toBeDefined();
    expect(typeof customElements.define).toBe('function');
  });

  it('supports attachShadow', () => {
    const el = document.createElement('div');
    expect(typeof el.attachShadow).toBe('function');
  });

  it('supports MutationObserver', () => {
    expect(typeof MutationObserver).toBe('function');
  });

  it('supports requestAnimationFrame', () => {
    expect(typeof requestAnimationFrame).toBe('function');
  });

  it('can define and use a custom element', () => {
    class TestElement extends HTMLElement {
      connectedCallback() {
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<p>hello</p>';
      }
    }
    customElements.define('test-happy-dom', TestElement);
    const el = document.createElement('test-happy-dom');
    document.body.appendChild(el);
    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot!.innerHTML).toBe('<p>hello</p>');
    document.body.removeChild(el);
  });
});

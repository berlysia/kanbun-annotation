import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkamRendererElement } from '../skam-renderer.js';

// Register the custom element for tests
if (!customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:kun okuri="ク">子</skam:kun>曰學
    </skam:block>
  </skam:body>
</skam:doc>`;

function createElement(): SkamRendererElement {
  return document.createElement('skam-renderer') as SkamRendererElement;
}

// oxlint-disable-next-line eslint/no-unused-vars -- kept for future interactive tests
function appendAndWait(el: SkamRendererElement): Promise<void> {
  document.body.appendChild(el);
  return vi.waitFor(() => {
    // Wait until content is rendered or error is shown
    const shadow = el.shadowRoot!;
    const content = shadow.getElementById('content')!;
    if (content.innerHTML === '' && el.xmlContent !== '' && el.xmlContent !== undefined) {
      throw new Error('Not rendered yet');
    }
  });
}

describe('SkamRendererElement', () => {
  let el: SkamRendererElement;

  beforeEach(() => {
    el = createElement();
  });

  afterEach(() => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });

  describe('Shadow DOM structure', () => {
    it('creates shadow DOM with required elements', () => {
      expect(el.shadowRoot).not.toBeNull();
      expect(el.shadowRoot!.getElementById('font-css')).not.toBeNull();
      expect(el.shadowRoot!.getElementById('main-css')).not.toBeNull();
      expect(el.shadowRoot!.getElementById('error-css')).not.toBeNull();
      expect(el.shadowRoot!.getElementById('content')).not.toBeNull();
    });
  });

  describe('xmlContent property', () => {
    it('is undefined by default', () => {
      expect(el.xmlContent).toBeUndefined();
    });

    it('can be set programmatically', async () => {
      el.xmlContent = SAMPLE_XML;
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const content = el.shadowRoot!.getElementById('content')!;
        expect(content.innerHTML).not.toBe('');
      });
    });
  });

  describe('rendering via <script type="text/skam-ml">', () => {
    it('renders from script element', async () => {
      const script = document.createElement('script');
      script.setAttribute('type', 'text/skam-ml');
      script.textContent = SAMPLE_XML;
      el.appendChild(script);
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const content = el.shadowRoot!.getElementById('content')!;
        expect(content.innerHTML).not.toBe('');
      });
    });
  });

  describe('attributes', () => {
    it('defaults to vertical writing mode', async () => {
      el.xmlContent = SAMPLE_XML;
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const content = el.shadowRoot!.getElementById('content')!;
        expect(content.innerHTML).toContain('vertical');
      });
    });

    it('respects writing-mode="horizontal"', async () => {
      el.setAttribute('writing-mode', 'horizontal');
      el.xmlContent = SAMPLE_XML;
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const content = el.shadowRoot!.getElementById('content')!;
        expect(content.innerHTML).toContain('horizontal');
      });
    });
  });

  describe('error handling', () => {
    it('shows error for invalid XML', async () => {
      el.xmlContent = '<invalid>not closed';
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const content = el.shadowRoot!.getElementById('content')!;
        const alert = content.querySelector('[role="alert"]');
        expect(alert).not.toBeNull();
      });
    });

    it('dispatches skam-error event on parse failure', async () => {
      const handler = vi.fn();
      el.addEventListener('skam-error', handler);
      el.xmlContent = '<invalid>not closed';
      document.body.appendChild(el);
      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalled();
      });
    });
  });

  describe('events', () => {
    it('dispatches skam-render event on successful render', async () => {
      const handler = vi.fn();
      el.addEventListener('skam-render', handler);
      el.xmlContent = SAMPLE_XML;
      document.body.appendChild(el);
      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalled();
        const event = handler.mock.calls[0]![0] as CustomEvent;
        expect(event.detail.document).toBeDefined();
      });
    });
  });

  describe('cleanup', () => {
    it('clears content when removed from DOM and re-added without xml', async () => {
      el.xmlContent = SAMPLE_XML;
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const content = el.shadowRoot!.getElementById('content')!;
        expect(content.innerHTML).not.toBe('');
      });
      document.body.removeChild(el);
      // Reset xmlContent
      el.xmlContent = undefined;
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const content = el.shadowRoot!.getElementById('content')!;
        expect(content.innerHTML).toBe('');
      });
    });
  });

  describe('empty state', () => {
    it('shows nothing when no XML is provided', async () => {
      document.body.appendChild(el);
      // Give RAF time to fire
      await new Promise((resolve) => setTimeout(resolve, 50));
      const content = el.shadowRoot!.getElementById('content')!;
      expect(content.innerHTML).toBe('');
    });
  });

  describe('auto font loading', () => {
    afterEach(() => {
      // Clean up injected Google Fonts link
      document
        .querySelectorAll('link[href*="fonts.googleapis.com"][href*="Noto+Serif+JP"]')
        .forEach((el) => el.remove());
    });

    it('does not inject Google Fonts link by default', () => {
      document.body.appendChild(el);
      const link = document.querySelector(
        'link[href*="fonts.googleapis.com"][href*="Noto+Serif+JP"]'
      );
      expect(link).toBeNull();
    });

    it('injects Google Fonts link when auto-font is set', () => {
      el.setAttribute('auto-font', '');
      document.body.appendChild(el);
      const link = document.querySelector(
        'link[href*="fonts.googleapis.com"][href*="Noto+Serif+JP"]'
      );
      expect(link).not.toBeNull();
    });

    it('sets font CSS variables in shadow DOM after render when auto-font is set', async () => {
      el.setAttribute('auto-font', '');
      el.xmlContent = SAMPLE_XML;
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const fontStyle = el.shadowRoot!.getElementById('font-css')!;
        expect(fontStyle.textContent).toContain('--skam-font-family');
        expect(fontStyle.textContent).toContain('Noto Serif JP');
      });
    });

    it('does not set font CSS variables without auto-font', async () => {
      el.xmlContent = SAMPLE_XML;
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const content = el.shadowRoot!.getElementById('content')!;
        expect(content.innerHTML).not.toBe('');
      });
      const fontStyle = el.shadowRoot!.getElementById('font-css')!;
      expect(fontStyle.textContent).toBe('');
    });

    it('uses custom class-prefix for font CSS variables', async () => {
      el.setAttribute('auto-font', '');
      el.setAttribute('class-prefix', 'kb');
      el.xmlContent = SAMPLE_XML;
      document.body.appendChild(el);
      await vi.waitFor(() => {
        const fontStyle = el.shadowRoot!.getElementById('font-css')!;
        expect(fontStyle.textContent).toContain('--kb-font-family');
        expect(fontStyle.textContent).toContain('--kb-font-family-ruby');
      });
    });
  });
});

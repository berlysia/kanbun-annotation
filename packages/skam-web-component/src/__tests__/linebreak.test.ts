import { describe, it, expect, vi, afterEach } from 'vitest';
import { SkamRendererElement } from '../skam-renderer.js';

if (!customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

const XML =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學<skam:br/>而時習</skam:block></skam:body></skam:doc>';

afterEach(() => {
  document.body.replaceChildren();
});

describe('<skam:br/> を含む XML', () => {
  it('描いた DOM に br.skam-linebreak が 1 つある', async () => {
    const el = document.createElement('skam-renderer') as SkamRendererElement;
    const renders: CustomEvent[] = [];
    const errors: CustomEvent[] = [];
    el.addEventListener('skam-render', (e) => renders.push(e as CustomEvent));
    el.addEventListener('skam-error', (e) => errors.push(e as CustomEvent));
    el.textContent = XML;
    document.body.append(el);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(errors).toHaveLength(0);
    expect(el.shadowRoot!.querySelectorAll('br.skam-linebreak')).toHaveLength(1);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertHideQuizOption, type HideQuizOption } from '@kanbun-skam/skam-html-renderer';
import { SkamRendererElement } from '../skam-renderer.js';
import { buildRenderOptions } from '../attribute-map.js';

if (!customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

const XML =
  '<skam:doc xmlns:skam="urn:skam:1" xmlns:edu="urn:skam:edu:1">' +
  '<skam:meta><skam:extension name="edu" uri="urn:skam:edu:1" required="true"/></skam:meta>' +
  '<skam:body><skam:block>' +
  '<skam:kun okuri="ヅ" edu:okuri-quiz="問1">學</skam:kun>' +
  '<skam:kun okuri="ガ" edu:okuri-quiz="問2">而</skam:kun>' +
  '</skam:block></skam:body></skam:doc>';

function mount(attrs: Record<string, string>) {
  const el = document.createElement('skam-renderer') as SkamRendererElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const errors: CustomEvent[] = [];
  const renders: CustomEvent[] = [];
  el.addEventListener('skam-error', (e) => errors.push(e as CustomEvent));
  el.addEventListener('skam-render', (e) => renders.push(e as CustomEvent));
  el.textContent = XML;
  document.body.append(el);
  return { el, errors, renders };
}

const html = (el: HTMLElement) => el.shadowRoot!.innerHTML;
const display = (el: HTMLElement) => el.shadowRoot!.querySelector('.skam-display')?.innerHTML ?? '';

afterEach(() => {
  document.body.replaceChildren();
});

describe('hide-quiz attribute', () => {
  it('空の値はすべて隠す', async () => {
    const { el, renders } = mount({ 'hide-quiz': '' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(display(el)).not.toContain('ヅ');
    expect(display(el)).not.toContain('ガ');
    expect(el.shadowRoot!.querySelectorAll('.skam-quiz-hidden')).toHaveLength(2);
  });

  it('JSON の配列は名前の合う印だけ隠す', async () => {
    const { el, renders } = mount({ 'hide-quiz': '["問1"]' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(display(el)).not.toContain('ヅ');
    expect(display(el)).toContain('ガ');
  });

  it('空の配列は何も隠さない', async () => {
    const { el, renders } = mount({ 'hide-quiz': '[]' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(display(el)).toContain('ヅ');
    expect(display(el)).toContain('ガ');
  });

  it('属性が無ければ何も隠さない', async () => {
    const { el, renders } = mount({});
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(display(el)).toContain('ヅ');
  });

  it.each([
    ['問1', 'not JSON'],
    ['[""]', 'empty name'],
    [JSON.stringify(Array.from({ length: 101 }, () => 'a')), '101 names'],
    ['false', 'false'],
    ['1', 'number'],
    ['{}', 'object'],
  ])('不正な値 %s (%s) は描画せず、回復不能のエラーを 1 回出す', async (value) => {
    const { el, errors, renders } = mount({ 'hide-quiz': value });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(renders).toHaveLength(0);
    expect(errors[0]!.detail).toMatchObject({ recoverable: false, attribute: 'hide-quiz' });
    expect(el.shadowRoot!.querySelector('.skam-document')).toBeNull();
    expect(html(el)).not.toContain('ヅ');
    expect(errors[0]!.detail.error.message).not.toContain('問1');
  });

  it('正しい値から不正な値に変えると描画が空になり、属性を消すと隠さずに描き直す', async () => {
    const { el, errors, renders } = mount({ 'hide-quiz': '' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.setAttribute('hide-quiz', 'x');
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')).toBeNull();
    el.removeAttribute('hide-quiz');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(display(el)).toContain('ヅ');
    expect(display(el)).toContain('ガ');
  });

  it('observedAttributes に hide-quiz がある', () => {
    expect(SkamRendererElement.observedAttributes).toContain('hide-quiz');
  });
});

describe('buildRenderOptions: hide-quiz', () => {
  const base = {
    'writing-mode': null,
    profile: null,
    inline: null,
    'include-reading-layer': null,
    copyable: null,
    'class-prefix': null,
  };

  it('値を hideQuiz に写す', () => {
    expect(buildRenderOptions({ ...base, 'hide-quiz': '' }).options.hideQuiz).toBe(true);
    expect(buildRenderOptions({ ...base, 'hide-quiz': '["問1"]' }).options.hideQuiz).toEqual([
      '問1',
    ]);
    expect(buildRenderOptions({ ...base, 'hide-quiz': null }).options.hideQuiz).toBeUndefined();
  });

  it('不正な値は blocked に入れる', () => {
    const { blocked, options } = buildRenderOptions({ ...base, 'hide-quiz': 'SECRETVALUE' });
    expect(blocked.map((b) => b.attribute)).toEqual(['hide-quiz']);
    expect(blocked[0]!.error.message).not.toContain('SECRETVALUE');
    expect(options.hideQuiz).toBeUndefined();
  });
});

describe('html-renderer からの再公開', () => {
  it('assertHideQuizOption と HideQuizOption を import して使える', () => {
    const option: HideQuizOption | undefined = assertHideQuizOption(['問1']);
    expect(option).toEqual(['問1']);
    expect(() => assertHideQuizOption('x')).toThrow(TypeError);
  });
});

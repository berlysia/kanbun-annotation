import { describe, it, expect } from 'vitest';
import {
  extractXmlFromScriptElement as parserExtractXmlFromScriptElement,
  SKAM_XML_MEDIA_TYPE as PARSER_SKAM_XML_MEDIA_TYPE,
} from '@kanbun-skam/skam-xml-parser';
import {
  extractXml,
  extractXmlFromScriptElement,
  extractXmlFromLightDOM,
  SKAM_XML_MEDIA_TYPE,
} from '../xml-extraction.js';

describe('extractXmlFromScriptElement', () => {
  it('returns textContent of <script type="application/vnd.berlysia.skam+xml">', () => {
    const el = document.createElement('div');
    const script = document.createElement('script');
    script.setAttribute('type', SKAM_XML_MEDIA_TYPE);
    script.textContent = '<skam:doc>test</skam:doc>';
    el.appendChild(script);
    expect(extractXmlFromScriptElement(el)).toBe('<skam:doc>test</skam:doc>');
  });

  it('returns first script when multiple exist', () => {
    const el = document.createElement('div');
    const script1 = document.createElement('script');
    script1.setAttribute('type', SKAM_XML_MEDIA_TYPE);
    script1.textContent = 'first';
    const script2 = document.createElement('script');
    script2.setAttribute('type', SKAM_XML_MEDIA_TYPE);
    script2.textContent = 'second';
    el.appendChild(script1);
    el.appendChild(script2);
    expect(extractXmlFromScriptElement(el)).toBe('first');
  });

  it('returns null when no script element exists', () => {
    const el = document.createElement('div');
    expect(extractXmlFromScriptElement(el)).toBeNull();
  });

  it('fixes the media type string as part of the SKAM-ML spec (§3.3)', () => {
    expect(SKAM_XML_MEDIA_TYPE).toBe('application/vnd.berlysia.skam+xml');
  });

  it('ignores a script that only has type="application/xml"', () => {
    const el = document.createElement('div');
    const script = document.createElement('script');
    script.setAttribute('type', 'application/xml');
    script.textContent = '<skam:doc>test</skam:doc>';
    el.appendChild(script);
    expect(extractXmlFromScriptElement(el)).toBeNull();
  });

  it('ignores script with different type', () => {
    const el = document.createElement('div');
    const script = document.createElement('script');
    script.setAttribute('type', 'application/json');
    script.textContent = '{"key":"value"}';
    el.appendChild(script);
    expect(extractXmlFromScriptElement(el)).toBeNull();
  });
});

describe('extractXmlFromLightDOM', () => {
  it('returns textContent when present', () => {
    const el = document.createElement('div');
    el.textContent = 'some text';
    expect(extractXmlFromLightDOM(el)).toBe('some text');
  });

  it('returns null for empty textContent', () => {
    const el = document.createElement('div');
    expect(extractXmlFromLightDOM(el)).toBeNull();
  });

  it('returns null for whitespace-only textContent', () => {
    const el = document.createElement('div');
    el.textContent = '   \n  ';
    expect(extractXmlFromLightDOM(el)).toBeNull();
  });
});

describe('extractXml', () => {
  it('returns xmlContent when defined (priority 1)', () => {
    const el = document.createElement('div');
    const script = document.createElement('script');
    script.setAttribute('type', SKAM_XML_MEDIA_TYPE);
    script.textContent = 'from-script';
    el.appendChild(script);

    expect(extractXml('from-property', el)).toBe('from-property');
  });

  it('returns null for empty xmlContent (empty string is "set")', () => {
    const el = document.createElement('div');
    el.textContent = 'fallback';
    expect(extractXml('', el)).toBeNull();
  });

  it('falls back to script element when xmlContent is undefined', () => {
    const el = document.createElement('div');
    const script = document.createElement('script');
    script.setAttribute('type', SKAM_XML_MEDIA_TYPE);
    script.textContent = 'from-script';
    el.appendChild(script);

    expect(extractXml(undefined, el)).toBe('from-script');
  });

  it('falls back to light DOM textContent as last resort', () => {
    const el = document.createElement('div');
    el.textContent = 'light-dom-text';
    expect(extractXml(undefined, el)).toBe('light-dom-text');
  });

  it('returns null when nothing is available', () => {
    const el = document.createElement('div');
    expect(extractXml(undefined, el)).toBeNull();
  });
});

describe('re-export from @kanbun-skam/skam-xml-parser', () => {
  it('shares the same references as the parser', () => {
    expect(extractXmlFromScriptElement).toBe(parserExtractXmlFromScriptElement);
    expect(SKAM_XML_MEDIA_TYPE).toBe(PARSER_SKAM_XML_MEDIA_TYPE);
  });

  it('accepts HTMLElement and Document (type check)', () => {
    const fromElement: string | null = extractXmlFromScriptElement(document.createElement('div'));
    const fromDocument: string | null = extractXmlFromScriptElement(document);
    expect(fromElement).toBeNull();
    expect(fromDocument).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { extractXmlFromScriptElement, SKAM_XML_MEDIA_TYPE } from '../xml-extraction.js';
import * as nodeIndex from '../index.js';
import * as browserIndex from '../index.browser.js';

function hostReturning(value: { textContent: string | null } | null) {
  return { querySelector: vi.fn((_selector: string) => value) };
}

describe('extractXmlFromScriptElement', () => {
  it('returns the trimmed textContent of the found script', () => {
    const host = hostReturning({ textContent: '  <skam:doc/>  ' });
    expect(extractXmlFromScriptElement(host)).toBe('<skam:doc/>');
  });

  it('returns null when textContent is whitespace only', () => {
    expect(extractXmlFromScriptElement(hostReturning({ textContent: '   ' }))).toBeNull();
  });

  it('returns null when textContent is null', () => {
    expect(extractXmlFromScriptElement(hostReturning({ textContent: null }))).toBeNull();
  });

  it('returns null when no script is found', () => {
    expect(extractXmlFromScriptElement(hostReturning(null))).toBeNull();
  });

  it('queries once with the SKAM-ML media type selector', () => {
    const host = hostReturning({ textContent: 'x' });
    extractXmlFromScriptElement(host);
    expect(host.querySelector).toHaveBeenCalledTimes(1);
    expect(host.querySelector).toHaveBeenCalledWith(
      'script[type="application/vnd.berlysia.skam+xml"]'
    );
  });
});

describe('SKAM_XML_MEDIA_TYPE', () => {
  it('is the SKAM-ML media type', () => {
    expect(SKAM_XML_MEDIA_TYPE).toBe('application/vnd.berlysia.skam+xml');
  });

  it('is exported by both the Node and browser entry points as the same references', () => {
    expect(nodeIndex.SKAM_XML_MEDIA_TYPE).toBe(SKAM_XML_MEDIA_TYPE);
    expect(browserIndex.SKAM_XML_MEDIA_TYPE).toBe(SKAM_XML_MEDIA_TYPE);
    expect(nodeIndex.extractXmlFromScriptElement).toBe(extractXmlFromScriptElement);
    expect(browserIndex.extractXmlFromScriptElement).toBe(extractXmlFromScriptElement);
  });
});

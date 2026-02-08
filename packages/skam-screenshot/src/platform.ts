import type { Browser } from './types.js';

export const VALID_BROWSERS: readonly Browser[] = [
  'chromium',
  'firefox',
  'webkit',
] as const;

/**
 * Returns default browsers based on the current platform.
 * macOS supports all three engines; other platforms default to chromium + firefox.
 */
export function getDefaultBrowsers(): Browser[] {
  if (process.platform === 'darwin') {
    return ['chromium', 'firefox', 'webkit'];
  }
  return ['chromium', 'firefox'];
}

/**
 * Parses a comma-separated browser list string into validated Browser array.
 * Throws on invalid browser names.
 */
export function parseBrowserList(input: string): Browser[] {
  const browsers = input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (browsers.length === 0) {
    throw new Error('Browser list cannot be empty');
  }

  const invalid = browsers.filter(
    (b) => !VALID_BROWSERS.includes(b as Browser),
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid browser(s): ${invalid.join(', ')}. Valid browsers: ${VALID_BROWSERS.join(', ')}`,
    );
  }

  return browsers as Browser[];
}

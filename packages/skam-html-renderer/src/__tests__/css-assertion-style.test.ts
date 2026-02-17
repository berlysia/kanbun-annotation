import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CSS_DIRECT_ASSERTION_PATTERN =
  /expect\((css|result\.css|cssOnly|cssWithInline|cssWithoutInline)\)\.(toContain|toMatch|not\.toContain|not\.toMatch)\(/;

function collectTestFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...collectTestFiles(path));
      continue;
    }

    if (entry.endsWith('.test.ts')) {
      files.push(path);
    }
  }

  return files;
}

describe('CSS assertion style guard', () => {
  it('uses css-contract helper instead of raw css string assertions', () => {
    const testDir = import.meta.dirname;
    const files = collectTestFiles(testDir).filter(
      (file) => !file.endsWith('css-assertion-style.test.ts')
    );
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (CSS_DIRECT_ASSERTION_PATTERN.test(lines[i]!)) {
          violations.push(`${file}:${i + 1}`);
        }
      }
    }

    expect(
      violations,
      `Found raw CSS assertions. Use helpers from ./helpers/css-contract.ts instead.\n${violations.join('\n')}`
    ).toEqual([]);
  });
});

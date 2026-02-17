import { expect } from 'vitest';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRuleBody(css: string, selector: string): string {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`);
  const match = css.match(pattern);
  expect(match, `No rule found for selector: ${selector}`).not.toBeNull();
  return match![1]!.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function expectStyleDeclaration(
  css: string,
  selector: string,
  property: string,
  value?: string | RegExp
): void {
  const body = getRuleBody(css, selector);
  const declarationPattern = new RegExp(`${escapeRegExp(property)}\\s*:\\s*([^;}]*)`);
  const declaration = body.match(declarationPattern);
  expect(declaration, `Missing declaration ${property} in ${selector}`).not.toBeNull();

  if (value === undefined) return;
  const actualValue = declaration![1]!.trim();
  if (typeof value === 'string') {
    expect(actualValue).toBe(value);
  } else {
    const normalized = new RegExp(value.source, value.flags.replace(/g/g, ''));
    expect(normalized.test(actualValue)).toBe(true);
  }
}

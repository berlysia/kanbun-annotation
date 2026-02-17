import { expect } from 'vitest';

type SelectorMatcher = string | RegExp;
type DeclarationValue = string | RegExp;

interface DeclarationExpectation {
  property: string;
  value: DeclarationValue;
}

function normalizeRegexFlags(flags: string): string {
  return flags.replace(/g/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasDeclaration(body: string, { property, value }: DeclarationExpectation): boolean {
  const bodyWithoutComments = body.replace(/\/\*[\s\S]*?\*\//g, '');
  const declarationPattern = new RegExp(`${escapeRegExp(property)}\\s*:\\s*([^;}]*)`, 'g');
  let match = declarationPattern.exec(bodyWithoutComments);
  while (match) {
    const actualValue = match[1]!.trim();
    if (typeof value === 'string') {
      if (actualValue === value) return true;
    } else {
      const valuePattern = new RegExp(value.source, normalizeRegexFlags(value.flags));
      if (valuePattern.test(actualValue)) return true;
    }
    match = declarationPattern.exec(bodyWithoutComments);
  }
  return false;
}

function findMatchingRuleBodies(css: string, selectorMatcher: SelectorMatcher): string[] {
  const sourceWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bodies: string[] = [];

  const matchesSelector = (selector: string): boolean => {
    if (typeof selectorMatcher === 'string') return selector.includes(selectorMatcher);
    const pattern = new RegExp(selectorMatcher.source, normalizeRegexFlags(selectorMatcher.flags));
    return pattern.test(selector);
  };

  const walk = (source: string): void => {
    let cursor = 0;

    while (cursor < source.length) {
      const openBrace = source.indexOf('{', cursor);
      if (openBrace === -1) break;

      const selector = source.slice(cursor, openBrace).trim();
      let depth = 1;
      let index = openBrace + 1;
      while (index < source.length && depth > 0) {
        const ch = source[index];
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;
        index += 1;
      }

      if (depth !== 0) break;

      const body = source.slice(openBrace + 1, index - 1);
      if (selector.startsWith('@')) {
        walk(body);
      } else if (selector !== '' && matchesSelector(selector)) {
        bodies.push(body);
      }

      cursor = index;
    }
  };

  walk(sourceWithoutComments);
  return bodies;
}

export function expectCSSSelector(css: string, selectorMatcher: SelectorMatcher): void {
  const bodies = findMatchingRuleBodies(css, selectorMatcher);
  expect(bodies.length, `No CSS rule matched selector: ${String(selectorMatcher)}`).toBeGreaterThan(
    0
  );
}

export function expectCSSRule(
  css: string,
  selectorMatcher: SelectorMatcher,
  declarations: DeclarationExpectation[]
): void {
  const bodies = findMatchingRuleBodies(css, selectorMatcher);
  expectCSSSelector(css, selectorMatcher);

  const matched = bodies.some((body) =>
    declarations.every((declaration) => hasDeclaration(body, declaration))
  );
  expect(
    matched,
    `CSS rule ${String(selectorMatcher)} is missing expected declarations: ${declarations
      .map((d) => `${d.property}: ${String(d.value)}`)
      .join(', ')}`
  ).toBe(true);
}

export function expectCSSRuleLacksDeclaration(
  css: string,
  selectorMatcher: SelectorMatcher,
  declaration: DeclarationExpectation
): void {
  const bodies = findMatchingRuleBodies(css, selectorMatcher);
  expect(bodies.length, `No CSS rule matched selector: ${String(selectorMatcher)}`).toBeGreaterThan(
    0
  );

  const matched = bodies.some((body) => hasDeclaration(body, declaration));
  expect(
    matched,
    `CSS rule ${String(selectorMatcher)} unexpectedly contains declaration ${declaration.property}: ${String(
      declaration.value
    )}`
  ).toBe(false);
}

export function expectNoCSSSelector(css: string, selectorMatcher: SelectorMatcher): void {
  const bodies = findMatchingRuleBodies(css, selectorMatcher);
  expect(bodies.length, `Unexpected CSS selector matched: ${String(selectorMatcher)}`).toBe(0);
}

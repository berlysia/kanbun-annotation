export interface IdGenerator {
  generate(prefix: string): string;
}

export function createRandomIdGenerator(): IdGenerator {
  return {
    generate(prefix: string): string {
      const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      return `${prefix}-${hex}`;
    },
  };
}

export function createSequentialIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    generate(prefix: string): string {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}${next}`;
    },
  };
}

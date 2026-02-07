export interface IdGenerator {
  generate(prefix: string): string;
}

export function createRandomIdGenerator(): IdGenerator {
  return {
    generate(prefix: string): string {
      const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join(
        ''
      );
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

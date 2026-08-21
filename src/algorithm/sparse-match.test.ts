import { describe, expect, it, vi } from 'vitest';
import { DELETE, EQUAL, INSERT, type DiffAlgorithm, type DiffOperation } from '../types';
import { diffTokens, type TokenDiff } from './myers';
import { tryAppendSparseMatchDiff } from './sparse-match';

const allTokenArrays = <T>(alphabet: readonly T[], maximumLength: number): T[][] => {
  const arrays: T[][] = [[]];
  let current: T[][] = [[]];

  for (let length = 1; length <= maximumLength; length++) {
    current = current.flatMap((prefix) => alphabet.map((token) => [...prefix, token]));
    arrays.push(...current);
  }

  return arrays;
};

const lcsLength = <T>(before: readonly T[], after: readonly T[]): number => {
  let previous = new Uint32Array(after.length + 1);

  for (const beforeToken of before) {
    const current = new Uint32Array(after.length + 1);
    for (let afterIndex = 1; afterIndex <= after.length; afterIndex++) {
      current[afterIndex] =
        beforeToken === after[afterIndex - 1]
          ? (previous[afterIndex - 1] as number) + 1
          : Math.max(previous[afterIndex] as number, current[afterIndex - 1] as number);
    }
    previous = current;
  }

  return previous[after.length] as number;
};

const expectSameTokens = <T>(actual: readonly T[], expected: readonly T[]): void => {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index++) {
    const actualToken = actual[index];
    const expectedToken = expected[index];
    expect(
      actualToken === expectedToken ||
        (typeof actualToken === 'number' &&
          typeof expectedToken === 'number' &&
          Number.isNaN(actualToken) &&
          Number.isNaN(expectedToken)),
    ).toBe(true);
  }
};

const expectShortestNormalizedReconstruction = <T>(
  before: readonly T[],
  after: readonly T[],
  diffs: readonly TokenDiff<T>[],
): void => {
  const reconstructedBefore: T[] = [];
  const reconstructedAfter: T[] = [];
  let editCost = 0;

  for (let index = 0; index < diffs.length; index++) {
    const [operation, tokens] = diffs[index] as TokenDiff<T>;
    expect([DELETE, EQUAL, INSERT]).toContain(operation);
    expect(tokens.length).toBeGreaterThan(0);
    if (index > 0) {
      expect(operation).not.toBe(diffs[index - 1]?.[0]);
    }
    if (operation !== INSERT) {
      reconstructedBefore.push(...tokens);
    }
    if (operation !== DELETE) {
      reconstructedAfter.push(...tokens);
    }
    if (operation !== EQUAL) {
      editCost += tokens.length;
    }
  }

  expectSameTokens(reconstructedBefore, before);
  expectSameTokens(reconstructedAfter, after);
  expect(editCost).toBe(before.length + after.length - 2 * lcsLength(before, after));
};

const algorithms = ['adaptive', 'myers', 'sparse'] as const satisfies readonly DiffAlgorithm[];

describe('sparse-match LCS', () => {
  it.each(algorithms)('returns exact normalized diffs for exhaustive duplicate-heavy arrays with %s', (algorithm) => {
    const arrays = allTokenArrays(['a', 'b'], 5);

    for (const before of arrays) {
      for (const after of arrays) {
        expectShortestNormalizedReconstruction(before, after, diffTokens(before, after, algorithm));
      }
    }
  });

  it.each(algorithms)('preserves strict equality for generic tokens with %s', (algorithm) => {
    const sharedObject = { kind: 'shared' };
    const beforeOnlyObject = { kind: 'before' };
    const afterOnlyObject = { kind: 'after' };
    const sharedSymbol = Symbol('shared');
    const before = [Number.NaN, 0, sharedObject, beforeOnlyObject, sharedSymbol, 'tail'];
    const after = [Number.NaN, -0, afterOnlyObject, sharedObject, sharedSymbol, 'tail'];
    const diffs = diffTokens(before, after, algorithm);

    expectShortestNormalizedReconstruction(before, after, diffs);
    expect(diffs.flatMap(([operation, tokens]) => (operation === EQUAL ? tokens : []))).not.toContain(Number.NaN);
    expect(diffs.flatMap(([operation, tokens]) => (operation === EQUAL ? tokens : []))).toContain(sharedObject);
  });

  it('matches a strict-equality LCS oracle for deterministic mixed-token arrays', () => {
    const sharedObject = Object.freeze({ kind: 'shared' });
    const beforeOnlyObject = Object.freeze({ kind: 'before' });
    const afterOnlyObject = Object.freeze({ kind: 'after' });
    const sharedSymbol = Symbol('shared');
    const beforeOnlySymbol = Symbol('before');
    const afterOnlySymbol = Symbol('after');
    const common = ['a', 1, 0, -0, Number.NaN, sharedObject, sharedSymbol] as const;
    const beforeAlphabet = [...common, beforeOnlyObject, beforeOnlySymbol] as const;
    const afterAlphabet = [...common, afterOnlyObject, afterOnlySymbol] as const;
    let state = 0x9e37_79b9;
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    };

    for (let caseIndex = 0; caseIndex < 100; caseIndex++) {
      const before: readonly unknown[] = Object.freeze(
        Array.from({ length: random() % 13 }, () => beforeAlphabet[random() % beforeAlphabet.length]),
      );
      const after: readonly unknown[] = Object.freeze(
        Array.from({ length: random() % 13 }, () => afterAlphabet[random() % afterAlphabet.length]),
      );

      for (const algorithm of algorithms) {
        expectShortestNormalizedReconstruction(before, after, diffTokens(before, after, algorithm));
      }
    }
  });

  it('selects sparse for reversed and disjoint unique ranges with a clear work advantage', () => {
    const tokenCount = 256;
    const before = Array.from({ length: tokenCount }, (_, index) => index);
    const after = before.toReversed();
    const disjointAfter = before.map((token) => tokenCount + token);

    const expectSelected = (candidateAfter: readonly number[]): void => {
      const diffs: TokenDiff<number>[] = [];
      const selected = tryAppendSparseMatchDiff(
        before,
        0,
        before.length,
        candidateAfter,
        0,
        candidateAfter.length,
        'adaptive',
        (operation: DiffOperation, source: readonly number[], start: number, end: number) => {
          if (start < end) {
            diffs.push([operation, source.slice(start, end)]);
          }
        },
      );

      expect(selected).toBe(true);
      expectShortestNormalizedReconstruction(before, candidateAfter, diffs);
    };

    expectSelected(after);
    expectSelected(disjointAfter);
  });

  it('prefers Myers for low-distance and duplicate-heavy ranges', () => {
    const unique = Array.from({ length: 256 }, (_, index) => index);
    const rotated = [unique.at(-1) as number, ...unique.slice(0, -1)];
    const repeatedBefore = Array.from({ length: 128 }, (_, index) => index % 2);
    const repeatedAfter = Array.from({ length: 128 }, (_, index) => (index + 1) % 2);
    let appendCount = 0;
    const append = (): void => {
      appendCount++;
    };

    expect(tryAppendSparseMatchDiff(unique, 0, unique.length, rotated, 0, rotated.length, 'adaptive', append)).toBe(
      false,
    );
    expect(
      tryAppendSparseMatchDiff(
        repeatedBefore,
        0,
        repeatedBefore.length,
        repeatedAfter,
        0,
        repeatedAfter.length,
        'adaptive',
        append,
      ),
    ).toBe(false);
    expect(appendCount).toBe(0);
  });

  it('prefers Myers at the conservative sides of the relative selector boundaries', () => {
    const isSelected = (before: readonly number[], after: readonly number[]): boolean =>
      tryAppendSparseMatchDiff(before, 0, before.length, after, 0, after.length, 'adaptive', () => undefined);
    const reversed = (length: number): readonly [readonly number[], readonly number[]] => {
      const before = Array.from({ length }, (_, index) => index);
      return [before, before.toReversed()];
    };
    const partiallyShared = (length: number, sharedCount: number): readonly [readonly number[], readonly number[]] => {
      const before = Array.from({ length }, (_, index) => index);
      const after = Array.from({ length }, (_, index) => length + index);
      for (let matchIndex = 0; matchIndex < sharedCount; matchIndex++) {
        const position = Math.floor(((matchIndex + 1) * (length - 1)) / (sharedCount + 1));
        after[position] = before[position] as number;
      }
      return [before, after];
    };

    expect(isSelected(...reversed(92))).toBe(false);
    expect(isSelected(...reversed(93))).toBe(true);
    expect(isSelected(...partiallyShared(512, 512 / 2 - 2))).toBe(true);
    expect(isSelected(...partiallyShared(512, 512 / 2 - 1))).toBe(false);
  });

  it('supports forced-sparse offsets and record IDs beyond 16 bits', () => {
    const tokenCount = 65_537;
    const before = Array.from({ length: tokenCount }, (_, index) => index);
    const after = before.toReversed();
    const diffs = diffTokens(before, after, 'sparse');
    const reconstructedBefore = diffs.flatMap(([operation, tokens]) => (operation === INSERT ? [] : tokens));
    const reconstructedAfter = diffs.flatMap(([operation, tokens]) => (operation === DELETE ? [] : tokens));
    const editCost = diffs.reduce((cost, [operation, tokens]) => cost + (operation === EQUAL ? 0 : tokens.length), 0);

    expectSameTokens(reconstructedBefore, before);
    expectSameTokens(reconstructedAfter, after);
    expect(diffs.flatMap(([operation, tokens]) => (operation === EQUAL ? tokens : []))).toHaveLength(1);
    expect(editCost).toBe(2 * tokenCount - 2);
  });

  it('retains an adaptive Myers fallback across child ranges', () => {
    const before = Array.from({ length: 80 }, (_, index) => index);
    const after = before.slice();
    for (const start of [10, 35, 60]) {
      for (let index = start; index < start + 3; index++) {
        after[index] = 1_000 + index;
      }
    }

    const NativeMap = Map;
    let mapConstructionCount = 0;
    class CountingMap<K, V> extends NativeMap<K, V> {
      constructor(entries?: readonly (readonly [K, V])[] | null) {
        super(entries);
        mapConstructionCount++;
      }
    }

    vi.stubGlobal('Map', CountingMap);
    let diffs: readonly TokenDiff<number>[] = [];
    try {
      diffs = diffTokens(before, after, 'adaptive');
    } finally {
      vi.unstubAllGlobals();
    }

    expect(mapConstructionCount).toBe(1);
    expectShortestNormalizedReconstruction(before, after, diffs);
  });

  it('emits one exact diff for disjoint and crossing forced-sparse ranges', () => {
    const disjointBefore = ['a', 'b', 'c'];
    const disjointAfter = ['x', 'y', 'z'];
    expect(diffTokens(disjointBefore, disjointAfter, 'sparse')).toEqual([
      [DELETE, disjointBefore],
      [INSERT, disjointAfter],
    ]);

    const crossingBefore = ['a', 'b', 'c', 'd'];
    const crossingAfter = ['c', 'd', 'a', 'b'];
    expectShortestNormalizedReconstruction(
      crossingBefore,
      crossingAfter,
      diffTokens(crossingBefore, crossingAfter, 'sparse'),
    );
  });

  it('returns freshly owned sparse results across repeated calls', () => {
    const before = ['a', 'b', 'c', 'd'];
    const after = ['d', 'c', 'b', 'a'];
    const first = diffTokens(before, after, 'sparse');
    const second = diffTokens(before, after, 'sparse');

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    for (let index = 0; index < first.length; index++) {
      expect(first[index]).not.toBe(second[index]);
      expect(first[index]?.[1]).not.toBe(second[index]?.[1]);
      expect(first[index]?.[1]).not.toBe(before);
      expect(first[index]?.[1]).not.toBe(after);
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { DELETE, EQUAL, INSERT } from '../types';
import { diffTokens as diffTokensWithAlgorithm, type TokenDiff } from './myers';

const diffTokens = <T>(before: readonly T[], after: readonly T[]): TokenDiff<T>[] =>
  diffTokensWithAlgorithm(before, after, 'myers');

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
          ? (previous[afterIndex - 1] ?? 0) + 1
          : Math.max(previous[afterIndex] ?? 0, current[afterIndex - 1] ?? 0);
    }

    previous = current;
  }

  return previous[after.length] ?? 0;
};

const editCost = <T>(diffs: readonly TokenDiff<T>[]): number =>
  diffs.reduce((cost, [operation, tokens]) => cost + (operation === EQUAL ? 0 : tokens.length), 0);

const expectNormalizedReconstruction = <T>(
  before: readonly T[],
  after: readonly T[],
  diffs: readonly TokenDiff<T>[],
): void => {
  const reconstructedBefore: T[] = [];
  const reconstructedAfter: T[] = [];

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
  }

  expect(reconstructedBefore).toEqual(before);
  expect(reconstructedAfter).toEqual(after);
};

describe('diffTokens', () => {
  it('exhaustively returns normalized shortest edit scripts for small token arrays', () => {
    const arrays = allTokenArrays(['a', 'b'], 6);

    for (const before of arrays) {
      for (const after of arrays) {
        const diffs = diffTokens(before, after);

        expectNormalizedReconstruction(before, after, diffs);
        expect(editCost(diffs)).toBe(before.length + after.length - 2 * lcsLength(before, after));
      }
    }
  });

  it('handles an append beyond common historical token limits', () => {
    const tokenCount = 70_001;
    const before = Array.from({ length: tokenCount }, (_, index) => index);
    const appended = [tokenCount, tokenCount + 1, tokenCount + 2];
    const after = [...before, ...appended];
    const diffs = diffTokens(before, after);

    expectNormalizedReconstruction(before, after, diffs);
    expect(diffs).toEqual([
      [EQUAL, before],
      [INSERT, appended],
    ]);
  });

  it('finds sparse edits in a large token array', () => {
    const tokenCount = 80_003;
    const before = Array.from({ length: tokenCount }, (_, index) => index);
    const after = before.slice();
    const changedIndices = [1, 40_001, tokenCount - 2];

    for (const [replacement, index] of changedIndices.entries()) {
      after[index] = tokenCount + replacement;
    }

    const diffs = diffTokens(before, after);
    const edits = diffs.filter(([operation]) => operation !== EQUAL);

    expectNormalizedReconstruction(before, after, diffs);
    expect(editCost(diffs)).toBe(2 * changedIndices.length);
    expect(edits.filter(([operation]) => operation === DELETE).map(([, tokens]) => tokens)).toEqual(
      changedIndices.map((index) => [index]),
    );
    expect(edits.filter(([operation]) => operation === INSERT).map(([, tokens]) => tokens)).toEqual(
      changedIndices.map((_index, replacement) => [tokenCount + replacement]),
    );
  });

  it.each([
    [18, 18],
    [18, 19],
    [19, 18],
  ])('grows its frontier for disjoint ranges of lengths %d and %d', (beforeLength, afterLength) => {
    const before = Array.from({ length: beforeLength }, (_, index) => `before-${index}`);
    const after = Array.from({ length: afterLength }, (_, index) => `after-${index}`);
    const diffs = diffTokens(before, after);

    expectNormalizedReconstruction(before, after, diffs);
    expect(diffs).toEqual([
      [DELETE, before],
      [INSERT, after],
    ]);
  });

  it('grows its frontier for a highly skewed range', () => {
    const before = ['before-a', 'before-b'];
    const after = Array.from({ length: 100 }, (_, index) => `after-${index}`);
    const diffs = diffTokens(before, after);

    expectNormalizedReconstruction(before, after, diffs);
    expect(diffs).toEqual([
      [DELETE, before],
      [INSERT, after],
    ]);
  });

  it('reuses one frontier pair and KMP table across sequential sparse bisections', () => {
    const before = Array.from({ length: 80 }, (_, index) => index);
    const after = before.slice();
    for (const start of [10, 35, 60]) {
      for (let index = start; index < start + 3; index++) {
        after[index] = 1_000 + index;
      }
    }

    const NativeUint32Array = Uint32Array;
    const allocationLengths: number[] = [];
    class CountingUint32Array extends NativeUint32Array {
      constructor(length: number) {
        super(length);
        allocationLengths.push(length);
      }
    }

    vi.stubGlobal('Uint32Array', CountingUint32Array);
    let diffs: readonly TokenDiff<number>[] = [];
    try {
      diffs = diffTokens(before, after);
    } finally {
      vi.unstubAllGlobals();
    }

    expectNormalizedReconstruction(before, after, diffs);
    expect(allocationLengths).toEqual([33, 33, 25]);
  });

  it('finds one-token ranges at either reachable interior edge', () => {
    expect(diffTokens(['x'], ['a', 'x', 'b', 'c'])).toEqual([
      [INSERT, ['a']],
      [EQUAL, ['x']],
      [INSERT, ['b', 'c']],
    ]);
    expect(diffTokens(['x'], ['a', 'b', 'x', 'c'])).toEqual([
      [INSERT, ['a', 'b']],
      [EQUAL, ['x']],
      [INSERT, ['c']],
    ]);
    expect(diffTokens(['a', 'x', 'b', 'c'], ['x'])).toEqual([
      [DELETE, ['a']],
      [EQUAL, ['x']],
      [DELETE, ['b', 'c']],
    ]);
    expect(diffTokens(['a', 'b', 'x', 'c'], ['x'])).toEqual([
      [DELETE, ['a', 'b']],
      [EQUAL, ['x']],
      [DELETE, ['c']],
    ]);
  });

  it('handles an absent one-token range in either direction', () => {
    expect(diffTokens(['x'], ['a', 'b', 'c'])).toEqual([
      [DELETE, ['x']],
      [INSERT, ['a', 'b', 'c']],
    ]);
    expect(diffTokens(['a', 'b', 'c'], ['x'])).toEqual([
      [DELETE, ['a', 'b', 'c']],
      [INSERT, ['x']],
    ]);
  });

  it.each([
    {
      branch: 'empty before range',
      before: ['suffix'],
      after: ['inserted', 'suffix'],
      expected: [
        [INSERT, ['inserted']],
        [EQUAL, ['suffix']],
      ],
    },
    {
      branch: 'empty after range',
      before: ['deleted', 'suffix'],
      after: ['suffix'],
      expected: [
        [DELETE, ['deleted']],
        [EQUAL, ['suffix']],
      ],
    },
    {
      branch: 'containment',
      before: ['a', 'b', 'suffix'],
      after: ['left', 'a', 'b', 'right', 'suffix'],
      expected: [
        [INSERT, ['left']],
        [EQUAL, ['a', 'b']],
        [INSERT, ['right']],
        [EQUAL, ['suffix']],
      ],
    },
    {
      branch: 'one-token fallback',
      before: ['a', 'suffix'],
      after: ['b', 'c', 'suffix'],
      expected: [
        [DELETE, ['a']],
        [INSERT, ['b', 'c']],
        [EQUAL, ['suffix']],
      ],
    },
    {
      branch: 'failed split',
      before: ['a', 'b', 'suffix'],
      after: ['x', 'y', 'suffix'],
      expected: [
        [DELETE, ['a', 'b']],
        [INSERT, ['x', 'y']],
        [EQUAL, ['suffix']],
      ],
    },
  ])('coalesces operations around the $branch terminal suffix', ({ before, after, expected }) => {
    const diffs = diffTokens(before, after);

    expectNormalizedReconstruction(before, after, diffs);
    expect(diffs).toEqual(expected);
  });

  it('handles equal-length replacements and ranges with a one-token length gap', () => {
    expect(diffTokens(['a', 'b', 'a'], ['b', 'a', 'b'])).toEqual([
      [DELETE, ['a']],
      [EQUAL, ['b', 'a']],
      [INSERT, ['b']],
    ]);
    expect(diffTokens(['a', 'b'], ['x', 'a', 'y'])).toEqual([
      [INSERT, ['x']],
      [EQUAL, ['a']],
      [INSERT, ['y']],
      [DELETE, ['b']],
    ]);
  });

  it('checks the only possible interior match for a two-token length gap', () => {
    expect(diffTokens(['a', 'b'], ['x', 'a', 'b', 'y'])).toEqual([
      [INSERT, ['x']],
      [EQUAL, ['a', 'b']],
      [INSERT, ['y']],
    ]);
    expect(diffTokens(['x', 'a', 'b', 'y'], ['a', 'b'])).toEqual([
      [DELETE, ['x']],
      [EQUAL, ['a', 'b']],
      [DELETE, ['y']],
    ]);
    expect(diffTokens(['a', 'b'], ['x', 'a', 'a', 'y'])).toEqual([
      [INSERT, ['x']],
      [EQUAL, ['a']],
      [DELETE, ['b']],
      [INSERT, ['a', 'y']],
    ]);
  });

  it('finds repeated-token ranges in the searchable interior', () => {
    expect(diffTokens(['a', 'b', 'a'], ['x', 'a', 'b', 'a', 'b', 'a', 'y'])).toEqual([
      [INSERT, ['x']],
      [EQUAL, ['a', 'b', 'a']],
      [INSERT, ['b', 'a', 'y']],
    ]);
    expect(diffTokens(['x', 'a', 'b', 'a', 'b', 'a', 'y'], ['a', 'b', 'a'])).toEqual([
      [DELETE, ['x']],
      [EQUAL, ['a', 'b', 'a']],
      [DELETE, ['b', 'a', 'y']],
    ]);
  });

  it('handles a very deep, highly skewed input without recursive stack growth', () => {
    const tokenCount = 100_000;
    const before = Array.from({ length: tokenCount }, (_, index) => index);
    const after = [tokenCount, ...before, tokenCount + 1];
    const diffs = diffTokens(before, after);

    expectNormalizedReconstruction(before, after, diffs);
    expect(diffs).toEqual([
      [INSERT, [tokenCount]],
      [EQUAL, before],
      [INSERT, [tokenCount + 1]],
    ]);
  });
});

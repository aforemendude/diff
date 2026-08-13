import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT } from '../types';
import { diffTokens, type TokenDiff } from './myers';

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

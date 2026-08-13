import { expect } from 'vitest';
import {
  DELETE,
  EQUAL,
  INSERT,
  type Diff,
  type DiffOperation,
  type LineEnding,
  type SegmentOptions,
} from '../../src/index';

export const lineEndings = [
  ['LF', '\n'],
  ['CRLF', '\r\n'],
  ['CR', '\r'],
] as const satisfies readonly (readonly [string, LineEnding])[];

export const segmentGraphemes = (text: string, options: SegmentOptions = {}): string[] =>
  Array.from(new Intl.Segmenter(options.locale, { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);

export const canonicalLineTokens = (text: string, lineEnding: LineEnding = '\n'): string[] => {
  const tokens = text.split(lineEnding);
  if (tokens.at(-1) === '') {
    tokens.pop();
  }
  return tokens;
};

export const reconstructBefore = (diffs: readonly Diff[]): string[] =>
  diffs.flatMap(([operation, tokens]) => (operation === INSERT ? [] : tokens));

export const reconstructAfter = (diffs: readonly Diff[]): string[] =>
  diffs.flatMap(([operation, tokens]) => (operation === DELETE ? [] : tokens));

export const expectNormalized = (diffs: readonly Diff[]): void => {
  for (let index = 0; index < diffs.length; index++) {
    const current = diffs[index];
    expect(current, `missing diff entry ${index}`).toBeDefined();
    if (current === undefined) {
      continue;
    }
    expect([DELETE, EQUAL, INSERT]).toContain(current[0]);
    expect(current[1].length, `empty token array at entry ${index}`).toBeGreaterThan(0);
    expect(current[0], `adjacent operation at entry ${index}`).not.toBe(diffs[index - 1]?.[0]);
  }
};

export const expectLineDiff = (
  before: string,
  after: string,
  diffs: readonly Diff[],
  lineEnding: LineEnding = '\n',
): void => {
  expectNormalized(diffs);
  expect(reconstructBefore(diffs)).toEqual(canonicalLineTokens(before, lineEnding));
  expect(reconstructAfter(diffs)).toEqual(canonicalLineTokens(after, lineEnding));
};

export const expectGraphemeDiff = (
  before: string,
  after: string,
  diffs: readonly Diff[],
  options: SegmentOptions = {},
): void => {
  expectNormalized(diffs);
  expect(reconstructBefore(diffs).join('')).toBe(before);
  expect(reconstructAfter(diffs).join('')).toBe(after);

  for (const [, tokens] of diffs) {
    for (const token of tokens) {
      expect(segmentGraphemes(token, options)).toEqual([token]);
    }
  }
};

export const editCost = (diffs: readonly Diff[]): number =>
  diffs.reduce((cost, [operation, tokens]) => cost + (operation === EQUAL ? 0 : tokens.length), 0);

export const lcsLength = <T>(left: readonly T[], right: readonly T[]): number => {
  const previous = new Uint32Array(right.length + 1);
  const current = new Uint32Array(right.length + 1);

  for (const leftValue of left) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex++) {
      current[rightIndex + 1] =
        leftValue === right[rightIndex]
          ? (previous[rightIndex] ?? 0) + 1
          : Math.max(previous[rightIndex + 1] ?? 0, current[rightIndex] ?? 0);
    }
    previous.set(current);
    current.fill(0);
  }
  return previous[right.length] ?? 0;
};

export const expectShortestEdit = <T>(before: readonly T[], after: readonly T[], diffs: readonly Diff[]): void => {
  expect(editCost(diffs)).toBe(before.length + after.length - 2 * lcsLength(before, after));
};

export const sequences = <T>(alphabet: readonly T[], maximumLength: number): T[][] => {
  const result: T[][] = [[]];
  let previous: T[][] = [[]];
  for (let length = 1; length <= maximumLength; length++) {
    const next: T[][] = [];
    for (const prefix of previous) {
      for (const value of alphabet) {
        next.push(prefix.concat([value]));
      }
    }
    result.push(...next);
    previous = next;
  }
  return result;
};

export const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
};

export const textDiff = (
  entries: readonly (readonly [DiffOperation, string])[],
  options: SegmentOptions = {},
): Diff[] => entries.map(([operation, text]) => [operation, segmentGraphemes(text, options)]);

export const expectCleanupResult = (
  input: readonly Diff[],
  output: readonly Diff[],
  options: SegmentOptions = {},
): void => {
  expectNormalized(output);
  expect(reconstructBefore(output)).toEqual(reconstructBefore(input));
  expect(reconstructAfter(output)).toEqual(reconstructAfter(input));

  for (const [, tokens] of output) {
    for (const token of tokens) {
      expect(segmentGraphemes(token, options)).toEqual([token]);
    }
  }
};

export const freezeDiff = (diffs: readonly Diff[]): readonly Diff[] =>
  Object.freeze(diffs.map(([operation, tokens]) => Object.freeze([operation, Object.freeze(tokens.slice())] as const)));

export const expectFreshOutput = (input: readonly Diff[], output: readonly Diff[]): void => {
  expect(output).not.toBe(input);
  for (let index = 0; index < Math.min(input.length, output.length); index++) {
    expect(output[index]).not.toBe(input[index]);
    expect(output[index]?.[1]).not.toBe(input[index]?.[1]);
  }
};

import { expect } from 'vitest';
import { tokenizeGraphemes } from '../tokenize/graphemes';
import { tokenizeLines } from '../tokenize/lines';
import { DELETE, EQUAL, INSERT, type Diff, type LineEnding } from '../types';

const reconstructBefore = (diffs: readonly Diff[]): readonly string[] =>
  diffs.filter(([operation]) => operation !== INSERT).flatMap(([, tokens]) => tokens);

const reconstructAfter = (diffs: readonly Diff[]): readonly string[] =>
  diffs.filter(([operation]) => operation !== DELETE).flatMap(([, tokens]) => tokens);

const expectValidTokenDiff = (before: readonly string[], after: readonly string[], diffs: readonly Diff[]): void => {
  expect(reconstructBefore(diffs)).toEqual(before);
  expect(reconstructAfter(diffs)).toEqual(after);

  for (let index = 0; index < diffs.length; index++) {
    const [operation, tokens] = diffs[index] as Diff;

    expect([DELETE, EQUAL, INSERT]).toContain(operation);
    expect(tokens.length).toBeGreaterThan(0);
    if (index > 0) {
      expect(operation).not.toBe(diffs[index - 1]?.[0]);
    }
  }
};

export const expectValidLineDiff = (
  before: string,
  after: string,
  diffs: readonly Diff[],
  lineEnding: LineEnding = '\n',
): void => {
  expectValidTokenDiff(tokenizeLines(before, lineEnding), tokenizeLines(after, lineEnding), diffs);
};

export const expectValidGraphemeDiff = (
  before: string,
  after: string,
  diffs: readonly Diff[],
  locale?: Intl.LocalesArgument,
): void => {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
  expectValidTokenDiff(tokenizeGraphemes(before, segmenter), tokenizeGraphemes(after, segmenter), diffs);
};

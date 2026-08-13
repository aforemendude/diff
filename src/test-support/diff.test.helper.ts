import { expect } from 'vitest';
import { DELETE, EQUAL, INSERT, type Diff } from '../types';

const reconstructBefore = (diffs: readonly Diff[]): string =>
  diffs
    .filter(([operation]) => operation !== INSERT)
    .map(([, text]) => text)
    .join('');

const reconstructAfter = (diffs: readonly Diff[]): string =>
  diffs
    .filter(([operation]) => operation !== DELETE)
    .map(([, text]) => text)
    .join('');

export const expectValidDiff = (before: string, after: string, diffs: readonly Diff[]): void => {
  expect(reconstructBefore(diffs)).toBe(before);
  expect(reconstructAfter(diffs)).toBe(after);

  for (let index = 0; index < diffs.length; index++) {
    const [operation, text] = diffs[index] as Diff;

    expect([DELETE, EQUAL, INSERT]).toContain(operation);
    expect(text).not.toBe('');
    if (index > 0) {
      expect(operation).not.toBe(diffs[index - 1]?.[0]);
    }
  }
};

const graphemeBoundaries = (text: string, locale?: Intl.LocalesArgument): ReadonlySet<number> => {
  const boundaries = new Set<number>([0, text.length]);
  const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });

  for (const { index, segment } of segmenter.segment(text)) {
    boundaries.add(index);
    boundaries.add(index + segment.length);
  }

  return boundaries;
};

export const expectValidGraphemeDiff = (
  before: string,
  after: string,
  diffs: readonly Diff[],
  locale?: Intl.LocalesArgument,
): void => {
  expectValidDiff(before, after, diffs);

  const beforeBoundaries = graphemeBoundaries(before, locale);
  const afterBoundaries = graphemeBoundaries(after, locale);
  let beforeOffset = 0;
  let afterOffset = 0;

  for (const [operation, text] of diffs) {
    if (operation !== INSERT) {
      beforeOffset += text.length;
      expect(beforeBoundaries.has(beforeOffset)).toBe(true);
    }

    if (operation !== DELETE) {
      afterOffset += text.length;
      expect(afterBoundaries.has(afterOffset)).toBe(true);
    }
  }
};

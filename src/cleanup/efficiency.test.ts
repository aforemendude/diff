/*
 * Efficiency-cleanup fixtures adapted from diff-match-patch-es v2.0.1 and Google Diff Match and Patch, Copyright 2018
 * The diff-match-patch Authors, under Apache-2.0. Modified for grapheme coverage and an immutable API.
 */

import { describe, expect, it } from 'vitest';
import { cleanupEfficiency } from '../cleanup';
import { expectValidGraphemeDiff } from '../test-support/diff.test.helper';
import * as unicodeFixtures from '../test-support/unicode.test.fixtures';
import { tokenizeGraphemes } from '../tokenize/graphemes';
import { DELETE, EQUAL, INSERT, type CleanupEfficiencyOptions, type Diff, type DiffOperation } from '../types';

type TextDiff = readonly [operation: DiffOperation, text: string];

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const tokenizeDiff = (diffs: readonly TextDiff[]): Diff[] =>
  diffs.map(([operation, text]) => [operation, tokenizeGraphemes(text, graphemeSegmenter)]);

describe('cleanupEfficiency', () => {
  it('does not mutate or alias the input tuples or token arrays', () => {
    const input = tokenizeDiff([
      [EQUAL, 'a'],
      [INSERT, 'b'],
    ]);
    const output = cleanupEfficiency(input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    for (let index = 0; index < input.length; index++) {
      expect(output[index]).not.toBe(input[index]);
      expect(output[index]?.[1]).not.toBe(input[index]?.[1]);
    }
  });

  it('returns a freshly owned empty diff', () => {
    const input: Diff[] = [];
    const output = cleanupEfficiency(input);

    expect(output).toEqual([]);
    expect(output).not.toBe(input);
  });

  it('omits empty token arrays and coalesces adjacent operations', () => {
    expect(
      cleanupEfficiency([
        [EQUAL, []],
        [DELETE, ['a']],
        [DELETE, ['b']],
        [INSERT, ['c']],
        [INSERT, []],
        [EQUAL, ['d']],
        [EQUAL, ['e']],
      ]),
    ).toEqual(
      tokenizeDiff([
        [DELETE, 'ab'],
        [INSERT, 'c'],
        [EQUAL, 'de'],
      ]),
    );
  });

  it('keeps an equality whose length equals the default edit cost', () => {
    const input = tokenizeDiff([
      [DELETE, 'ab'],
      [INSERT, '12'],
      [EQUAL, 'wxyz'],
      [DELETE, 'cd'],
      [INSERT, '34'],
    ]);

    expect(cleanupEfficiency(input)).toEqual(input);
  });

  it('eliminates a short equality surrounded by all four edit kinds', () => {
    const before = 'abxyzcd';
    const after = '12xyz34';
    const diffs = cleanupEfficiency(
      tokenizeDiff([
        [DELETE, 'ab'],
        [INSERT, '12'],
        [EQUAL, 'xyz'],
        [DELETE, 'cd'],
        [INSERT, '34'],
      ]),
    );

    expect(diffs).toEqual(
      tokenizeDiff([
        [DELETE, before],
        [INSERT, after],
      ]),
    );
    expect(diffs[0]?.[1]).not.toBe(diffs[1]?.[1]);
    expectValidGraphemeDiff(before, after, diffs);
  });

  it('eliminates a very short equality surrounded by three edit kinds', () => {
    expect(
      cleanupEfficiency(
        tokenizeDiff([
          [INSERT, '12'],
          [EQUAL, 'x'],
          [DELETE, 'cd'],
          [INSERT, '34'],
        ]),
      ),
    ).toEqual(
      tokenizeDiff([
        [DELETE, 'xcd'],
        [INSERT, '12x34'],
      ]),
    );
  });

  it('backtracks to eliminate an earlier candidate', () => {
    expect(
      cleanupEfficiency(
        tokenizeDiff([
          [DELETE, 'ab'],
          [INSERT, '12'],
          [EQUAL, 'xy'],
          [INSERT, '34'],
          [EQUAL, 'z'],
          [DELETE, 'cd'],
          [INSERT, '56'],
        ]),
      ),
    ).toEqual(
      tokenizeDiff([
        [DELETE, 'abxyzcd'],
        [INSERT, '12xy34z56'],
      ]),
    );
  });

  it('uses a custom edit cost', () => {
    const options = { editCost: 5 } satisfies CleanupEfficiencyOptions;

    expect(
      cleanupEfficiency(
        tokenizeDiff([
          [DELETE, 'ab'],
          [INSERT, '12'],
          [EQUAL, 'wxyz'],
          [DELETE, 'cd'],
          [INSERT, '34'],
        ]),
        options,
      ),
    ).toEqual(
      tokenizeDiff([
        [DELETE, 'abwxyzcd'],
        [INSERT, '12wxyz34'],
      ]),
    );
  });

  it.each([
    ['zero', 0],
    ['a fraction below one', 0.5],
    ['one', 1],
  ] as const)('normalizes to an owned result at an edit cost of %s', (_name, editCost) => {
    const input = tokenizeDiff([
      [DELETE, 'a'],
      [DELETE, 'b'],
      [INSERT, '12'],
      [EQUAL, 'x'],
      [DELETE, 'cd'],
      [INSERT, '34'],
    ]);
    const output = cleanupEfficiency(input, { editCost });

    expect(output).toEqual(
      tokenizeDiff([
        [DELETE, 'ab'],
        [INSERT, '12'],
        [EQUAL, 'x'],
        [DELETE, 'cd'],
        [INSERT, '34'],
      ]),
    );
    expect(output).not.toBe(input);
    for (const outputEntry of output) {
      for (const inputEntry of input) {
        expect(outputEntry).not.toBe(inputEntry);
        expect(outputEntry[1]).not.toBe(inputEntry[1]);
      }
    }
  });

  it('eliminates a one-token equality at the first edit cost above one', () => {
    expect(
      cleanupEfficiency(
        tokenizeDiff([
          [DELETE, 'ab'],
          [INSERT, '12'],
          [EQUAL, 'x'],
          [DELETE, 'cd'],
          [INSERT, '34'],
        ]),
        { editCost: 1 + Number.EPSILON },
      ),
    ).toEqual(
      tokenizeDiff([
        [DELETE, 'abxcd'],
        [INSERT, '12x34'],
      ]),
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -Number.MIN_VALUE])(
    'rejects an invalid edit cost of %s',
    (editCost) => {
      expect(() => cleanupEfficiency([], { editCost })).toThrow(
        new RangeError('editCost must be a finite, non-negative number'),
      );
    },
  );

  it.each([0, -0, 0.5, Number.MIN_VALUE, Number.MAX_VALUE])('accepts a valid edit cost of %s', (editCost) => {
    expect(cleanupEfficiency([], { editCost })).toEqual([]);
  });

  it('measures edit cost in grapheme tokens', () => {
    const equality =
      unicodeFixtures.WOMAN_TECHNOLOGIST +
      unicodeFixtures.UNITED_NATIONS_FLAG +
      unicodeFixtures.THUMBS_UP_MEDIUM_SKIN_TONE;
    const before = `a${equality}c`;
    const after = `b${equality}d`;
    const diffs = cleanupEfficiency(
      tokenizeDiff([
        [DELETE, 'a'],
        [INSERT, 'b'],
        [EQUAL, equality],
        [DELETE, 'c'],
        [INSERT, 'd'],
      ]),
    );

    expect(diffs).toEqual(
      tokenizeDiff([
        [DELETE, before],
        [INSERT, after],
      ]),
    );
    expectValidGraphemeDiff(before, after, diffs);
  });

  it('keeps a three-edit equality at the half-cost threshold', () => {
    const input = tokenizeDiff([
      [INSERT, '12'],
      [EQUAL, 'xy'],
      [DELETE, 'cd'],
      [INSERT, '34'],
    ]);

    expect(cleanupEfficiency(input)).toEqual(input);
  });
});

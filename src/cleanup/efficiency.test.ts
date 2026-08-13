/*
 * Efficiency-cleanup fixtures adapted from diff-match-patch-es v2.0.1 and
 * Google Diff Match and Patch, Copyright 2018 The diff-match-patch Authors,
 * under Apache-2.0. Modified for grapheme coverage and an immutable API.
 */

import { describe, expect, it } from 'vitest';
import { expectValidGraphemeDiff } from '../test-support/diff.test.helper';
import { tokenizeGraphemes } from '../tokenize/graphemes';
import { DELETE, EQUAL, INSERT, type CleanupEfficiencyOptions, type Diff, type DiffOperation } from '../types';
import { cleanupEfficiency } from './efficiency';

type TextDiff = readonly [operation: DiffOperation, text: string];

const tokenizeDiff = (diffs: readonly TextDiff[]): Diff[] =>
  diffs.map(([operation, text]) => [operation, tokenizeGraphemes(text)]);

describe('cleanupEfficiency', () => {
  it('does not mutate or alias the input tuples or token arrays', () => {
    const input = tokenizeDiff([
      [EQUAL, 'a'],
      [INSERT, 'b'],
    ]);
    const output = cleanupEfficiency(input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output[0]).not.toBe(input[0]);
    expect(output[0]?.[1]).not.toBe(input[0]?.[1]);
  });

  it('returns an empty diff unchanged', () => {
    expect(cleanupEfficiency([])).toEqual([]);
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

  it('measures edit cost in grapheme tokens', () => {
    const equality = '👩‍💻🇺🇳👍🏽';
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

/*
 * Efficiency-cleanup fixtures adapted from diff-match-patch-es v2.0.1 and
 * Google Diff Match and Patch, Copyright 2018 The diff-match-patch Authors,
 * under Apache-2.0. Modified for grapheme coverage and an immutable API.
 */

import { describe, expect, it } from 'vitest';
import { expectValidGraphemeDiff } from '../test-support/diff.test.helper';
import { DELETE, EQUAL, INSERT, type CleanupEfficiencyOptions, type Diff } from '../types';
import { cleanupEfficiency } from './efficiency';

describe('cleanupEfficiency', () => {
  it('does not mutate or alias the input tuples', () => {
    const input: Diff[] = [
      [EQUAL, 'a'],
      [INSERT, 'b'],
    ];
    const output = cleanupEfficiency(input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output[0]).not.toBe(input[0]);
  });

  it('rejects an invalid operation with a meaningful error', () => {
    const input = [[2, 'text']] as unknown as readonly Diff[];

    expect(() => cleanupEfficiency(input)).toThrowError('Invalid diff operation: 2');
  });

  it('repairs input operation boundaries that split a grapheme', () => {
    const before = 'e';
    const after = 'e\u0301';
    const diffs = cleanupEfficiency([
      [EQUAL, 'e'],
      [INSERT, '\u0301'],
    ]);

    expect(diffs).toEqual([
      [DELETE, before],
      [INSERT, after],
    ]);
    expectValidGraphemeDiff(before, after, diffs);
  });

  it('passes the locale hint to grapheme segmentation', () => {
    expect(() => cleanupEfficiency([], { locale: 'not_a_locale' })).toThrow(RangeError);
  });

  it('returns an empty diff unchanged', () => {
    expect(cleanupEfficiency([])).toEqual([]);
  });

  it('omits empty tuples and coalesces adjacent operations', () => {
    expect(
      cleanupEfficiency([
        [EQUAL, ''],
        [DELETE, 'a'],
        [DELETE, 'b'],
        [INSERT, 'c'],
        [INSERT, ''],
        [EQUAL, 'd'],
        [EQUAL, 'e'],
      ]),
    ).toEqual([
      [DELETE, 'ab'],
      [INSERT, 'c'],
      [EQUAL, 'de'],
    ]);
  });

  it('keeps an equality whose length equals the default edit cost', () => {
    const input = [
      [DELETE, 'ab'],
      [INSERT, '12'],
      [EQUAL, 'wxyz'],
      [DELETE, 'cd'],
      [INSERT, '34'],
    ] as const;

    expect(cleanupEfficiency(input)).toEqual(input);
  });

  it('eliminates a short equality surrounded by all four edit kinds', () => {
    const before = 'abxyzcd';
    const after = '12xyz34';
    const diffs = cleanupEfficiency([
      [DELETE, 'ab'],
      [INSERT, '12'],
      [EQUAL, 'xyz'],
      [DELETE, 'cd'],
      [INSERT, '34'],
    ]);

    expect(diffs).toEqual([
      [DELETE, before],
      [INSERT, after],
    ]);
    expectValidGraphemeDiff(before, after, diffs);
  });

  it('eliminates a very short equality surrounded by three edit kinds', () => {
    expect(
      cleanupEfficiency([
        [INSERT, '12'],
        [EQUAL, 'x'],
        [DELETE, 'cd'],
        [INSERT, '34'],
      ]),
    ).toEqual([
      [DELETE, 'xcd'],
      [INSERT, '12x34'],
    ]);
  });

  it('backtracks to eliminate an earlier candidate', () => {
    expect(
      cleanupEfficiency([
        [DELETE, 'ab'],
        [INSERT, '12'],
        [EQUAL, 'xy'],
        [INSERT, '34'],
        [EQUAL, 'z'],
        [DELETE, 'cd'],
        [INSERT, '56'],
      ]),
    ).toEqual([
      [DELETE, 'abxyzcd'],
      [INSERT, '12xy34z56'],
    ]);
  });

  it('uses a custom edit cost', () => {
    const options = { editCost: 5 } satisfies CleanupEfficiencyOptions;

    expect(
      cleanupEfficiency(
        [
          [DELETE, 'ab'],
          [INSERT, '12'],
          [EQUAL, 'wxyz'],
          [DELETE, 'cd'],
          [INSERT, '34'],
        ],
        options,
      ),
    ).toEqual([
      [DELETE, 'abwxyzcd'],
      [INSERT, '12wxyz34'],
    ]);
  });

  it('measures edit cost in graphemes', () => {
    const equality = '👩‍💻🇺🇳👍🏽';
    const before = `a${equality}c`;
    const after = `b${equality}d`;
    const diffs = cleanupEfficiency([
      [DELETE, 'a'],
      [INSERT, 'b'],
      [EQUAL, equality],
      [DELETE, 'c'],
      [INSERT, 'd'],
    ]);

    expect(diffs).toEqual([
      [DELETE, before],
      [INSERT, after],
    ]);
    expectValidGraphemeDiff(before, after, diffs);
  });

  it('keeps a three-edit equality at the half-cost threshold', () => {
    const input = [
      [INSERT, '12'],
      [EQUAL, 'xy'],
      [DELETE, 'cd'],
      [INSERT, '34'],
    ] as const;

    expect(cleanupEfficiency(input)).toEqual(input);
  });
});

import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT } from '../types';
import {
  append,
  cleanupMerge,
  coalesce,
  commonPrefixLength,
  commonSuffixLength,
  equalTokens,
  prepare,
  type GraphemeDiff,
} from './common';

describe('cleanup common helpers', () => {
  it('appends independent, non-empty, coalesced operations', () => {
    const sourceTokens = ['a'];
    const diffs: GraphemeDiff[] = [];

    append(diffs, EQUAL, []);
    append(diffs, DELETE, sourceTokens);
    append(diffs, DELETE, ['b']);
    append(diffs, INSERT, ['c']);
    sourceTokens[0] = 'changed';

    expect(diffs).toEqual([
      [DELETE, ['a', 'b']],
      [INSERT, ['c']],
    ]);
  });

  it('counts exact common prefixes at empty, partial, and full boundaries', () => {
    expect(commonPrefixLength([], [])).toBe(0);
    expect(commonPrefixLength(['a', 'b', 'c'], ['a', 'b', 'd'])).toBe(2);
    expect(commonPrefixLength(['a', 'b'], ['a', 'b', 'c'])).toBe(2);
  });

  it('counts exact common suffixes at empty, partial, and full boundaries', () => {
    expect(commonSuffixLength([], [])).toBe(0);
    expect(commonSuffixLength(['a', 'b', 'c'], ['d', 'b', 'c'])).toBe(2);
    expect(commonSuffixLength(['b', 'c'], ['a', 'b', 'c'])).toBe(2);
  });

  it('compares complete token arrays exactly', () => {
    expect(equalTokens(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(equalTokens(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(equalTokens(['a'], ['a', 'b'])).toBe(false);
  });

  it.each([
    ['coalesce', coalesce],
    ['prepare', prepare],
  ] as const)('%s creates independent compact working storage', (_name, normalize) => {
    const sourceTokens = ['a'];
    const input: GraphemeDiff[] = [
      [EQUAL, []],
      [DELETE, sourceTokens],
      [DELETE, ['b']],
      [INSERT, []],
      [INSERT, ['c']],
      [EQUAL, ['d']],
      [EQUAL, ['e']],
    ];
    const output = normalize(input);

    sourceTokens[0] = 'changed';

    expect(output).toEqual([
      [DELETE, ['a', 'b']],
      [INSERT, ['c']],
      [EQUAL, ['d', 'e']],
    ]);
  });

  it('factors common edit prefixes and suffixes without mutating the input', () => {
    const input: GraphemeDiff[] = [
      [EQUAL, ['start']],
      [DELETE, ['a', 'b', 'c']],
      [INSERT, ['a', 'x', 'c']],
      [EQUAL, ['end']],
    ];

    expect(cleanupMerge(input)).toEqual([
      [EQUAL, ['start', 'a']],
      [DELETE, ['b']],
      [INSERT, ['x']],
      [EQUAL, ['c', 'end']],
    ]);
    expect(input).toEqual([
      [EQUAL, ['start']],
      [DELETE, ['a', 'b', 'c']],
      [INSERT, ['a', 'x', 'c']],
      [EQUAL, ['end']],
    ]);
  });

  it.each([
    [
      'left across an insertion',
      [
        [EQUAL, ['a']],
        [INSERT, ['b', 'a']],
        [EQUAL, ['c']],
      ],
      [
        [INSERT, ['a', 'b']],
        [EQUAL, ['a', 'c']],
      ],
    ],
    [
      'right across a deletion',
      [
        [EQUAL, ['a']],
        [DELETE, ['c', 'b']],
        [EQUAL, ['c']],
      ],
      [
        [EQUAL, ['a', 'c']],
        [DELETE, ['b', 'c']],
      ],
    ],
  ] satisfies readonly (readonly [string, GraphemeDiff[], GraphemeDiff[]])[])(
    'shifts an equivalent equality %s',
    (_name, input, expected) => {
      expect(cleanupMerge(input)).toEqual(expected);
    },
  );
});

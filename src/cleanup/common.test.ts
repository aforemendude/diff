import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT } from '../types';
import {
  append,
  cleanupMerge,
  coalesce,
  compactOwned,
  commonPrefixLength,
  commonSuffixLength,
  equalTokens,
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
    expect(equalTokens([], [])).toBe(true);
    expect(equalTokens(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(equalTokens(['a', 'b'], ['c', 'b'])).toBe(false);
    expect(equalTokens(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(equalTokens(['a'], ['a', 'b'])).toBe(false);
    expect(equalTokens(['a', 'b'], ['a'])).toBe(false);
  });

  it('coalesce creates independent compact working storage', () => {
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
    const output = coalesce(input);

    sourceTokens[0] = 'changed';

    expect(output).toEqual([
      [DELETE, ['a', 'b']],
      [INSERT, ['c']],
      [EQUAL, ['d', 'e']],
    ]);
  });

  it('compacts owned working storage in place and reuses surviving entries', () => {
    const firstDeletion: GraphemeDiff = [DELETE, ['a']];
    const secondDeletion: GraphemeDiff = [DELETE, ['b']];
    const insertion: GraphemeDiff = [INSERT, ['c']];
    const equality: GraphemeDiff = [EQUAL, ['d']];
    const input: GraphemeDiff[] = [
      [EQUAL, []],
      firstDeletion,
      [INSERT, []],
      secondDeletion,
      insertion,
      equality,
      [EQUAL, []],
    ];

    const output = compactOwned(input);

    expect(output).toBe(input);
    expect(output).toEqual([
      [DELETE, ['a', 'b']],
      [INSERT, ['c']],
      [EQUAL, ['d']],
    ]);
    expect(output[0]).toBe(firstDeletion);
    expect(output[0]?.[1]).toBe(firstDeletion[1]);
    expect(output[1]).toBe(insertion);
    expect(output[2]).toBe(equality);
  });

  it('ignores an empty equality inside an edit block before factoring', () => {
    expect(
      cleanupMerge([
        [DELETE, ['a']],
        [EQUAL, []],
        [INSERT, ['a']],
      ]),
    ).toEqual([[EQUAL, ['a']]]);
  });

  it('coalesces split homogeneous edit blocks without flattening their tokens', () => {
    const input: GraphemeDiff[] = [
      [DELETE, ['a']],
      [DELETE, []],
      [EQUAL, []],
      [DELETE, ['b']],
      [EQUAL, ['middle']],
      [INSERT, ['c']],
      [INSERT, []],
      [EQUAL, []],
      [INSERT, ['d']],
    ];

    expect(cleanupMerge(input)).toEqual([
      [DELETE, ['a', 'b']],
      [EQUAL, ['middle']],
      [INSERT, ['c', 'd']],
    ]);
  });

  it('does not mutate frozen homogeneous edit blocks', () => {
    const input = Object.freeze([
      Object.freeze([DELETE, Object.freeze(['a'])]),
      Object.freeze([DELETE, Object.freeze([])]),
      Object.freeze([EQUAL, Object.freeze([])]),
      Object.freeze([DELETE, Object.freeze(['b'])]),
      Object.freeze([EQUAL, Object.freeze(['middle'])]),
      Object.freeze([INSERT, Object.freeze(['c'])]),
      Object.freeze([INSERT, Object.freeze([])]),
      Object.freeze([EQUAL, Object.freeze([])]),
      Object.freeze([INSERT, Object.freeze(['d'])]),
    ]) as unknown as GraphemeDiff[];

    expect(cleanupMerge(input)).toEqual([
      [DELETE, ['a', 'b']],
      [EQUAL, ['middle']],
      [INSERT, ['c', 'd']],
    ]);
    expect(input).toEqual([
      [DELETE, ['a']],
      [DELETE, []],
      [EQUAL, []],
      [DELETE, ['b']],
      [EQUAL, ['middle']],
      [INSERT, ['c']],
      [INSERT, []],
      [EQUAL, []],
      [INSERT, ['d']],
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

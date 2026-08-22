import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT } from '../types';
import { append, appendRange, compactOwned, commonSuffixLength, type GraphemeDiff } from './common';

describe('cleanup common helpers', () => {
  it('appends only the requested token range into independent storage', () => {
    const source = ['outside-left', 'a', 'b', 'outside-right'];
    const diffs: GraphemeDiff[] = [];

    appendRange(diffs, DELETE, source, 1, 3);
    appendRange(diffs, DELETE, source, 2, 2);
    source[1] = 'changed';

    expect(diffs).toEqual([[DELETE, ['a', 'b']]]);
  });

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

  it('counts exact common suffixes at empty, partial, and full boundaries', () => {
    expect(commonSuffixLength([], [])).toBe(0);
    expect(commonSuffixLength(['a', 'b', 'c'], ['d', 'b', 'c'])).toBe(2);
    expect(commonSuffixLength(['b', 'c'], ['a', 'b', 'c'])).toBe(2);
    expect(commonSuffixLength(['a', 'b', 'c'], ['a', 'b', 'c'], 0)).toBe(0);
    expect(commonSuffixLength(['a', 'b', 'c'], ['a', 'b', 'c'], 1)).toBe(1);
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
});

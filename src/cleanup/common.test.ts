import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT, type Diff, type DiffOperation } from '../types';
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

const referenceMergeEditBlocks = (diffs: readonly Diff[]): GraphemeDiff[] => {
  const merged: GraphemeDiff[] = [];
  let pointer = 0;

  while (pointer < diffs.length) {
    const current = diffs[pointer] as Diff;
    if (current[1].length === 0) {
      pointer++;
      continue;
    }
    if (current[0] === EQUAL) {
      append(merged, EQUAL, current[1]);
      pointer++;
      continue;
    }

    const block: Diff[] = [];
    let operation: typeof DELETE | typeof INSERT | undefined;
    let mixed = false;
    while (pointer < diffs.length) {
      const edit = diffs[pointer] as Diff;
      if (edit[1].length === 0) {
        pointer++;
        continue;
      }
      if (edit[0] === EQUAL) {
        break;
      }
      if (operation === undefined) {
        operation = edit[0];
      } else if (operation !== edit[0]) {
        mixed = true;
      }
      block.push(edit);
      pointer++;
    }

    if (!mixed) {
      for (const edit of block) {
        append(merged, edit[0], edit[1]);
      }
      continue;
    }

    const deletions: string[] = [];
    const insertions: string[] = [];
    for (const edit of block) {
      const target = edit[0] === DELETE ? deletions : insertions;
      for (const token of edit[1]) {
        target.push(token);
      }
    }
    const prefixLength = commonPrefixLength(deletions, insertions);
    const maximumSuffix = Math.min(deletions.length, insertions.length) - prefixLength;
    const suffixLength = commonSuffixLength(deletions, insertions, maximumSuffix);

    append(merged, EQUAL, insertions.slice(0, prefixLength));
    append(merged, DELETE, deletions.slice(prefixLength, deletions.length - suffixLength));
    append(merged, INSERT, insertions.slice(prefixLength, insertions.length - suffixLength));
    append(merged, EQUAL, insertions.slice(insertions.length - suffixLength));
  }

  return merged;
};

const referenceStartsWith = (tokens: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length <= tokens.length && prefix.every((token, index) => token === tokens[index]);

const referenceEndsWith = (tokens: readonly string[], suffix: readonly string[]): boolean => {
  const offset = tokens.length - suffix.length;
  return offset >= 0 && suffix.every((token, index) => token === tokens[offset + index]);
};

const referenceCleanupMerge = (diffs: readonly Diff[]): GraphemeDiff[] => {
  let merged = referenceMergeEditBlocks(diffs);

  while (true) {
    let shifted = false;
    for (let pointer = 1; pointer < merged.length - 1; pointer++) {
      const left = merged[pointer - 1] as GraphemeDiff;
      const edit = merged[pointer] as GraphemeDiff;
      const right = merged[pointer + 1] as GraphemeDiff;
      if (left[0] !== EQUAL || edit[0] === EQUAL || right[0] !== EQUAL) {
        continue;
      }

      if (referenceEndsWith(edit[1], left[1])) {
        merged.splice(
          pointer - 1,
          3,
          [edit[0], left[1].concat(edit[1].slice(0, edit[1].length - left[1].length))],
          [EQUAL, left[1].concat(right[1])],
        );
        shifted = true;
        break;
      }
      if (referenceStartsWith(edit[1], right[1])) {
        merged.splice(
          pointer - 1,
          3,
          [EQUAL, left[1].concat(right[1])],
          [edit[0], edit[1].slice(right[1].length).concat(right[1])],
        );
        shifted = true;
        break;
      }
    }

    if (!shifted) {
      return merged;
    }
    merged = referenceMergeEditBlocks(merged);
  }
};

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
    expect(commonSuffixLength(['a', 'b', 'c'], ['a', 'b', 'c'], 0)).toBe(0);
    expect(commonSuffixLength(['a', 'b', 'c'], ['a', 'b', 'c'], 1)).toBe(1);
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

  it.each([
    [
      'none',
      [
        [DELETE, ['a', 'b']],
        [INSERT, ['c', 'd']],
      ],
      [
        [DELETE, ['a', 'b']],
        [INSERT, ['c', 'd']],
      ],
    ],
    [
      'part',
      [
        [DELETE, ['a', 'b', 'c']],
        [INSERT, ['a', 'x', 'c']],
      ],
      [
        [EQUAL, ['a']],
        [DELETE, ['b']],
        [INSERT, ['x']],
        [EQUAL, ['c']],
      ],
    ],
    [
      'all',
      [
        [DELETE, ['a', 'b']],
        [INSERT, ['a', 'x', 'b']],
      ],
      [
        [EQUAL, ['a']],
        [INSERT, ['x']],
        [EQUAL, ['b']],
      ],
    ],
  ] satisfies readonly (readonly [string, GraphemeDiff[], GraphemeDiff[]])[])(
    'factors common edit prefixes and suffixes that consume %s of the shorter edit',
    (_name, input, expected) => {
      expect(cleanupMerge(input)).toEqual(expected);
    },
  );

  it('factors identical edit blocks without mutating the input', () => {
    const input: GraphemeDiff[] = [
      [EQUAL, ['start']],
      [DELETE, ['a', 'b']],
      [INSERT, ['a', 'b']],
      [EQUAL, ['end']],
    ];

    expect(cleanupMerge(input)).toEqual([[EQUAL, ['start', 'a', 'b', 'end']]]);
    expect(input).toEqual([
      [EQUAL, ['start']],
      [DELETE, ['a', 'b']],
      [INSERT, ['a', 'b']],
      [EQUAL, ['end']],
    ]);
  });

  it('factors a prefix and suffix across differently split edit chunks', () => {
    expect(
      cleanupMerge([
        [DELETE, ['a']],
        [DELETE, ['b', 'c']],
        [INSERT, ['a', 'b']],
        [INSERT, ['x', 'c']],
      ]),
    ).toEqual([
      [EQUAL, ['a', 'b']],
      [INSERT, ['x']],
      [EQUAL, ['c']],
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

  it('keeps the left shift rule ahead of an equally valid right shift', () => {
    expect(
      cleanupMerge([
        [EQUAL, ['a']],
        [INSERT, ['a', 'a']],
        [EQUAL, ['a']],
      ]),
    ).toEqual([
      [INSERT, ['a', 'a']],
      [EQUAL, ['a', 'a']],
    ]);
  });

  it('normalizes a joined edit block that cancels completely', () => {
    expect(
      cleanupMerge([
        [INSERT, ['b', 'c']],
        [EQUAL, ['b']],
        [DELETE, ['c', 'b']],
        [EQUAL, ['d']],
      ]),
    ).toEqual([[EQUAL, ['b', 'c', 'b', 'd']]]);
  });

  it('revisits the local edit created by factoring a joined block', () => {
    expect(
      cleanupMerge([
        [INSERT, ['a', 'x', 'a', 'c']],
        [EQUAL, ['a']],
        [DELETE, ['c', 'a']],
        [EQUAL, ['d']],
      ]),
    ).toEqual([
      [INSERT, ['a', 'x']],
      [EQUAL, ['a', 'c', 'a', 'd']],
    ]);
  });

  it('matches whole-array restart cleanup over generated diffs', () => {
    const operations = [DELETE, EQUAL, INSERT] as const;
    const tokens = ['a', 'b', 'c'] as const;
    let state = 0x1f83_d9ab;
    const next = (limit: number): number => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) % limit;
    };

    for (let caseIndex = 0; caseIndex < 6_000; caseIndex++) {
      const input: Array<[DiffOperation, string[]]> = [];
      const entryCount = next(16);
      for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
        input.push([
          operations[next(operations.length)] as DiffOperation,
          Array.from({ length: next(5) }, () => tokens[next(tokens.length)] as string),
        ]);
      }

      expect(cleanupMerge(input), `case ${caseIndex}`).toEqual(referenceCleanupMerge(input));
    }
  });
});

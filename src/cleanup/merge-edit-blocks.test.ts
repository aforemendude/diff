import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT } from '../types';
import type { GraphemeDiff } from './common';
import { mergeEditBlocks } from './merge-edit-blocks';

describe('cleanup edit-block merging', () => {
  it('ignores an empty equality inside an edit block before factoring', () => {
    expect(
      mergeEditBlocks([
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

    expect(mergeEditBlocks(input)).toEqual([
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

    expect(mergeEditBlocks(input)).toEqual([
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
      expect(mergeEditBlocks(input)).toEqual(expected);
    },
  );

  it('factors identical edit blocks without mutating the input', () => {
    const input: GraphemeDiff[] = [
      [EQUAL, ['start']],
      [DELETE, ['a', 'b']],
      [INSERT, ['a', 'b']],
      [EQUAL, ['end']],
    ];

    expect(mergeEditBlocks(input)).toEqual([[EQUAL, ['start', 'a', 'b', 'end']]]);
    expect(input).toEqual([
      [EQUAL, ['start']],
      [DELETE, ['a', 'b']],
      [INSERT, ['a', 'b']],
      [EQUAL, ['end']],
    ]);
  });

  it('factors a prefix and suffix across differently split edit chunks', () => {
    expect(
      mergeEditBlocks([
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
});

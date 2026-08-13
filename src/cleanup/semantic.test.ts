/*
 * Semantic-cleanup fixtures adapted from diff-match-patch-es v2.0.1 and
 * Google Diff Match and Patch, Copyright 2018 The diff-match-patch Authors,
 * under Apache-2.0. Modified for grapheme and Intl.Segmenter coverage.
 */

import { describe, expect, it } from 'vitest';
import { expectValidGraphemeDiff } from '../test-support/diff.test.helper';
import { DELETE, EQUAL, INSERT, type Diff } from '../types';
import { cleanupSemantic } from './semantic';

describe('cleanupSemantic', () => {
  it('does not mutate or alias the input tuples', () => {
    const input: Diff[] = [
      [EQUAL, 'a'],
      [INSERT, 'b'],
    ];
    const output = cleanupSemantic(input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output[0]).not.toBe(input[0]);
  });

  it('rejects an invalid operation with a meaningful error', () => {
    const input = [[2, 'text']] as unknown as readonly Diff[];

    expect(() => cleanupSemantic(input)).toThrowError('Invalid diff operation: 2');
  });

  it('repairs input operation boundaries that split a grapheme', () => {
    const before = 'e';
    const after = 'e\u0301';
    const diffs = cleanupSemantic([
      [EQUAL, 'e'],
      [INSERT, '\u0301'],
    ]);

    expect(diffs).toEqual([
      [DELETE, before],
      [INSERT, after],
    ]);
    expectValidGraphemeDiff(before, after, diffs);
  });

  it('eliminates a small equality surrounded by edits', () => {
    const input = [
      [DELETE, 'a'],
      [INSERT, 'b'],
      [EQUAL, 'c'],
      [DELETE, 'd'],
      [INSERT, 'e'],
    ] as const;

    expect(cleanupSemantic(input)).toEqual([
      [DELETE, 'acd'],
      [INSERT, 'bce'],
    ]);
    expect(input).toEqual([
      [DELETE, 'a'],
      [INSERT, 'b'],
      [EQUAL, 'c'],
      [DELETE, 'd'],
      [INSERT, 'e'],
    ]);
  });

  it('counts a multi-code-point equality as one grapheme', () => {
    const diffs = cleanupSemantic([
      [DELETE, 'a'],
      [EQUAL, '👩‍💻'],
      [DELETE, 'b'],
    ]);

    expect(diffs).toEqual([
      [DELETE, 'a👩‍💻b'],
      [INSERT, '👩‍💻'],
    ]);
    expectValidGraphemeDiff('a👩‍💻b', '👩‍💻', diffs);
  });

  it('shifts an edit to a more useful semantic boundary', () => {
    expect(
      cleanupSemantic([
        [EQUAL, 'The c'],
        [INSERT, 'ow and the c'],
        [EQUAL, 'at.'],
      ]),
    ).toEqual([
      [EQUAL, 'The '],
      [INSERT, 'cow and the '],
      [EQUAL, 'cat.'],
    ]);
  });

  it.each([
    [
      [
        [EQUAL, 'AAA\r\n\r\nBBB'],
        [INSERT, '\r\nDDD\r\n\r\nBBB'],
        [EQUAL, '\r\nEEE'],
      ],
      [
        [EQUAL, 'AAA\r\n\r\n'],
        [INSERT, 'BBB\r\nDDD\r\n\r\n'],
        [EQUAL, 'BBB\r\nEEE'],
      ],
    ],
    [
      [
        [EQUAL, 'AAA\r\nBBB'],
        [INSERT, ' DDD\r\nBBB'],
        [EQUAL, ' EEE'],
      ],
      [
        [EQUAL, 'AAA\r\n'],
        [INSERT, 'BBB DDD\r\n'],
        [EQUAL, 'BBB EEE'],
      ],
    ],
    [
      [
        [EQUAL, 'The xxx. The '],
        [INSERT, 'zzz. The '],
        [EQUAL, 'yyy.'],
      ],
      [
        [EQUAL, 'The xxx.'],
        [INSERT, ' The zzz.'],
        [EQUAL, ' The yyy.'],
      ],
    ],
  ] as const)('prefers blank-line, line, and sentence boundaries in DMP style', (input, expected) => {
    expect(cleanupSemantic(input)).toEqual(expected);
  });

  it.each([
    [
      [
        [DELETE, 'abcxxx'],
        [INSERT, 'xxxdef'],
      ],
      [
        [DELETE, 'abc'],
        [EQUAL, 'xxx'],
        [INSERT, 'def'],
      ],
    ],
    [
      [
        [DELETE, 'xxxabc'],
        [INSERT, 'defxxx'],
      ],
      [
        [INSERT, 'def'],
        [EQUAL, 'xxx'],
        [DELETE, 'abc'],
      ],
    ],
  ] as const)('extracts a substantial edit overlap as an equality', (input, expected) => {
    expect(cleanupSemantic(input)).toEqual(expected);
  });

  it('extracts multiple independent overlaps', () => {
    expect(
      cleanupSemantic([
        [DELETE, 'abcd1212'],
        [INSERT, '1212efghi'],
        [EQUAL, '----'],
        [DELETE, 'A3'],
        [INSERT, '3BC'],
      ]),
    ).toEqual([
      [DELETE, 'abcd'],
      [EQUAL, '1212'],
      [INSERT, 'efghi'],
      [EQUAL, '----'],
      [DELETE, 'A'],
      [EQUAL, '3'],
      [INSERT, 'BC'],
    ]);
  });

  it('uses Thai word boundaries to choose an unambiguous edit placement', () => {
    const before = 'ฉันกินข้าว';
    const after = 'ฉันกิจกรรมกินข้าว';
    const raw = [
      [EQUAL, 'ฉันกิ'],
      [INSERT, 'จกรรมกิ'],
      [EQUAL, 'นข้าว'],
    ] as const;
    const expected = [
      [EQUAL, 'ฉัน'],
      [INSERT, 'กิจกรรม'],
      [EQUAL, 'กินข้าว'],
    ] as const;
    const cleaned = cleanupSemantic(raw, { locale: 'th' });

    expect(cleaned).toEqual(expected);
    expectValidGraphemeDiff(before, after, cleaned, 'th');
  });
});

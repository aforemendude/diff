/*
 * Semantic-cleanup fixtures adapted from diff-match-patch-es v2.0.1 and
 * Google Diff Match and Patch, Copyright 2018 The diff-match-patch Authors,
 * under Apache-2.0. Modified for grapheme and Intl.Segmenter coverage.
 */

import { describe, expect, it } from 'vitest';
import { expectValidGraphemeDiff } from '../test-support/diff.test.helper';
import { tokenizeGraphemes } from '../tokenize/graphemes';
import { DELETE, EQUAL, INSERT, type Diff, type DiffOperation } from '../types';
import { cleanupSemantic } from './semantic';

type TextDiff = readonly [operation: DiffOperation, text: string];

const tokenizeDiff = (diffs: readonly TextDiff[], locale?: Intl.LocalesArgument): Diff[] =>
  diffs.map(([operation, text]) => [operation, tokenizeGraphemes(text, { locale })]);

describe('cleanupSemantic', () => {
  it('does not mutate or alias the input tuples or token arrays', () => {
    const input = tokenizeDiff([
      [EQUAL, 'a'],
      [INSERT, 'b'],
    ]);
    const output = cleanupSemantic(input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output[0]).not.toBe(input[0]);
    expect(output[0]?.[1]).not.toBe(input[0]?.[1]);
  });

  it('eliminates a small equality surrounded by edits', () => {
    const input = tokenizeDiff([
      [DELETE, 'a'],
      [INSERT, 'b'],
      [EQUAL, 'c'],
      [DELETE, 'd'],
      [INSERT, 'e'],
    ]);

    expect(cleanupSemantic(input)).toEqual(
      tokenizeDiff([
        [DELETE, 'acd'],
        [INSERT, 'bce'],
      ]),
    );
    expect(input).toEqual(
      tokenizeDiff([
        [DELETE, 'a'],
        [INSERT, 'b'],
        [EQUAL, 'c'],
        [DELETE, 'd'],
        [INSERT, 'e'],
      ]),
    );
  });

  it('counts a multi-code-point equality as one grapheme token', () => {
    const diffs = cleanupSemantic(
      tokenizeDiff([
        [DELETE, 'a'],
        [EQUAL, '👩‍💻'],
        [DELETE, 'b'],
      ]),
    );

    expect(diffs).toEqual(
      tokenizeDiff([
        [DELETE, 'a👩‍💻b'],
        [INSERT, '👩‍💻'],
      ]),
    );
    expectValidGraphemeDiff('a👩‍💻b', '👩‍💻', diffs);
  });

  it('shifts an edit to a more useful semantic boundary', () => {
    expect(
      cleanupSemantic(
        tokenizeDiff([
          [EQUAL, 'The c'],
          [INSERT, 'ow and the c'],
          [EQUAL, 'at.'],
        ]),
      ),
    ).toEqual(
      tokenizeDiff([
        [EQUAL, 'The '],
        [INSERT, 'cow and the '],
        [EQUAL, 'cat.'],
      ]),
    );
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
    expect(cleanupSemantic(tokenizeDiff(input))).toEqual(tokenizeDiff(expected));
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
    expect(cleanupSemantic(tokenizeDiff(input))).toEqual(tokenizeDiff(expected));
  });

  it('extracts multiple independent overlaps', () => {
    expect(
      cleanupSemantic(
        tokenizeDiff([
          [DELETE, 'abcd1212'],
          [INSERT, '1212efghi'],
          [EQUAL, '----'],
          [DELETE, 'A3'],
          [INSERT, '3BC'],
        ]),
      ),
    ).toEqual(
      tokenizeDiff([
        [DELETE, 'abcd'],
        [EQUAL, '1212'],
        [INSERT, 'efghi'],
        [EQUAL, '----'],
        [DELETE, 'A'],
        [EQUAL, '3'],
        [INSERT, 'BC'],
      ]),
    );
  });

  it('uses Thai word boundaries to choose an unambiguous edit placement', () => {
    const before = 'ฉันกินข้าว';
    const after = 'ฉันกิจกรรมกินข้าว';
    const raw = tokenizeDiff(
      [
        [EQUAL, 'ฉันกิ'],
        [INSERT, 'จกรรมกิ'],
        [EQUAL, 'นข้าว'],
      ],
      'th',
    );
    const expected = tokenizeDiff(
      [
        [EQUAL, 'ฉัน'],
        [INSERT, 'กิจกรรม'],
        [EQUAL, 'กินข้าว'],
      ],
      'th',
    );
    const cleaned = cleanupSemantic(raw, { locale: 'th' });

    expect(cleaned).toEqual(expected);
    expectValidGraphemeDiff(before, after, cleaned, 'th');
  });
});

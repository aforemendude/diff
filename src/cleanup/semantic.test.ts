/*
 * Semantic-cleanup fixtures adapted from diff-match-patch-es v2.0.1 and
 * Google Diff Match and Patch, Copyright 2018 The diff-match-patch Authors,
 * under Apache-2.0. Modified for grapheme and Intl.Segmenter coverage.
 */

import { describe, expect, it, vi } from 'vitest';
import { cleanupSemantic } from '../cleanup';
import { expectValidGraphemeDiff } from '../test-support/diff.test.helper';
import * as unicodeFixtures from '../test-support/unicode.test.fixtures';
import { tokenizeGraphemes } from '../tokenize/graphemes';
import { DELETE, EQUAL, INSERT, type Diff, type DiffOperation } from '../types';

type TextDiff = readonly [operation: DiffOperation, text: string];

const tokenizeDiff = (diffs: readonly TextDiff[], locale?: Intl.LocalesArgument): Diff[] => {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
  return diffs.map(([operation, text]) => [operation, tokenizeGraphemes(text, segmenter)]);
};

describe('cleanupSemantic', () => {
  it('reuses one word segmenter for every isolated edit', () => {
    const input = tokenizeDiff([
      [EQUAL, 'left boundary'],
      [INSERT, 'first'],
      [EQUAL, 'middle boundary'],
      [DELETE, 'second'],
      [EQUAL, 'right boundary'],
    ]);
    const NativeSegmenter = Intl.Segmenter;
    const segmenter = vi.spyOn(Intl, 'Segmenter').mockImplementation(function (locales, options) {
      return new NativeSegmenter(locales, options);
    });

    try {
      cleanupSemantic(input, { locale: 'en' });

      expect(segmenter).toHaveBeenCalledOnce();
      expect(segmenter).toHaveBeenCalledWith('en', { granularity: 'word' });
    } finally {
      segmenter.mockRestore();
    }
  });

  it.each([
    ['insertion', INSERT],
    ['deletion', DELETE],
  ] as const)('skips semantic scoring when an isolated %s cannot shift', (_name, operation) => {
    const input = tokenizeDiff([
      [EQUAL, 'L'],
      [operation, 'X'],
      [EQUAL, 'R'],
    ]);
    const segment = vi.spyOn(Intl.Segmenter.prototype, 'segment');

    try {
      expect(cleanupSemantic(input)).toEqual(input);
      expect(segment).not.toHaveBeenCalled();
    } finally {
      segment.mockRestore();
    }
  });

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

    const output = cleanupSemantic(input);

    expect(output).toEqual(
      tokenizeDiff([
        [DELETE, 'acd'],
        [INSERT, 'bce'],
      ]),
    );
    expect(output[0]?.[1]).not.toBe(output[1]?.[1]);
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
        [EQUAL, unicodeFixtures.WOMAN_TECHNOLOGIST],
        [DELETE, 'b'],
      ]),
    );

    expect(diffs).toEqual(
      tokenizeDiff([
        [DELETE, `a${unicodeFixtures.WOMAN_TECHNOLOGIST}b`],
        [INSERT, unicodeFixtures.WOMAN_TECHNOLOGIST],
      ]),
    );
    expectValidGraphemeDiff(`a${unicodeFixtures.WOMAN_TECHNOLOGIST}b`, unicodeFixtures.WOMAN_TECHNOLOGIST, diffs);
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

  it('grows and reuses one KMP prefix table across overlap pairs', () => {
    const input = tokenizeDiff([
      [DELETE, 'A3'],
      [INSERT, '3BC'],
      [EQUAL, '----------'],
      [DELETE, 'abcd1212'],
      [INSERT, '1212efghi'],
      [EQUAL, '=========='],
      [DELETE, 'xaba'],
      [INSERT, 'abay'],
    ]);
    const NativeUint32Array = Uint32Array;
    let allocations = 0;

    class CountingUint32Array extends NativeUint32Array {
      constructor(length: number) {
        super(length);
        allocations++;
      }
    }

    vi.stubGlobal('Uint32Array', CountingUint32Array);
    let output: readonly Diff[] | undefined;
    try {
      output = cleanupSemantic(input);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(output).toEqual(
      tokenizeDiff([
        [DELETE, 'A'],
        [EQUAL, '3'],
        [INSERT, 'BC'],
        [EQUAL, '----------'],
        [DELETE, 'abcd'],
        [EQUAL, '1212'],
        [INSERT, 'efghi'],
        [EQUAL, '=========='],
        [DELETE, 'x'],
        [EQUAL, 'aba'],
        [INSERT, 'y'],
      ]),
    );
    expect(allocations).toBe(3);
  });

  it('uses Thai word boundaries to choose an unambiguous edit placement', () => {
    const before = unicodeFixtures.THAI_BEFORE;
    const after = unicodeFixtures.THAI_AFTER;
    const raw = tokenizeDiff(
      [
        [EQUAL, unicodeFixtures.THAI_RAW_EQUALITY_PREFIX],
        [INSERT, unicodeFixtures.THAI_RAW_INSERTION],
        [EQUAL, unicodeFixtures.THAI_RAW_EQUALITY_SUFFIX],
      ],
      'th',
    );
    const expected = tokenizeDiff(
      [
        [EQUAL, unicodeFixtures.THAI_PRONOUN_I],
        [INSERT, unicodeFixtures.THAI_ACTIVITY],
        [EQUAL, unicodeFixtures.THAI_EAT_RICE],
      ],
      'th',
    );
    const cleaned = cleanupSemantic(raw, { locale: 'th' });

    expect(cleaned).toEqual(expected);
    expectValidGraphemeDiff(before, after, cleaned, 'th');
  });
});

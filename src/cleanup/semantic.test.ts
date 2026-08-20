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

const referenceWhitespacePattern = /^\s+$/u;
const referencePunctuationPattern = /[\p{P}\p{S}]/u;

/** Preserve the former full-region scorer as an exact differential oracle. */
const referenceBoundaryScores = (tokens: readonly string[], wordSegmenter: Intl.Segmenter): Uint8Array => {
  const wordBoundaries = new Set<number>();
  for (const segment of wordSegmenter.segment(tokens.join(''))) {
    if (segment.isWordLike) {
      wordBoundaries.add(segment.index);
      wordBoundaries.add(segment.index + segment.segment.length);
    }
  }

  const isLineBreak = (token: string | undefined): boolean =>
    token !== undefined && (token.includes('\r') || token.includes('\n'));
  const isWhitespace = (token: string | undefined): boolean =>
    token !== undefined && referenceWhitespacePattern.test(token);
  const isPunctuation = (token: string | undefined): boolean =>
    token !== undefined && referencePunctuationPattern.test(token);
  const scores = new Uint8Array(tokens.length + 1);
  let offset = 0;

  for (let cut = 0; cut <= tokens.length; cut++) {
    if (cut === 0 || cut === tokens.length) {
      scores[cut] = 6;
    } else {
      const previous = tokens[cut - 1];
      const next = tokens[cut];
      const previousLineBreak = isLineBreak(previous);
      const nextLineBreak = isLineBreak(next);
      const previousWhitespace = isWhitespace(previous);
      const nextWhitespace = isWhitespace(next);
      const previousPunctuation = isPunctuation(previous);
      const nextPunctuation = isPunctuation(next);
      const blankLine =
        (previousLineBreak && isLineBreak(tokens[cut - 2])) || (nextLineBreak && isLineBreak(tokens[cut + 1]));

      if (blankLine) {
        scores[cut] = 5;
      } else if (previousLineBreak || nextLineBreak) {
        scores[cut] = 4;
      } else if (previousPunctuation && !previousWhitespace && nextWhitespace) {
        scores[cut] = 3;
      } else if (wordBoundaries.has(offset) || previousWhitespace || nextWhitespace) {
        scores[cut] = 2;
      } else if (previousPunctuation || nextPunctuation) {
        scores[cut] = 1;
      }
    }
    if (cut < tokens.length) {
      offset += (tokens[cut] as string).length;
    }
  }
  return scores;
};

const referenceLosslessPlacement = (
  left: readonly string[],
  operation: typeof DELETE | typeof INSERT,
  edit: readonly string[],
  right: readonly string[],
  wordSegmenter: Intl.Segmenter,
): Diff[] => {
  let commonLength = 0;
  const commonLimit = Math.min(left.length, edit.length);
  while (commonLength < commonLimit && left[left.length - commonLength - 1] === edit[edit.length - commonLength - 1]) {
    commonLength++;
  }

  const common = edit.slice(edit.length - commonLength);
  const baseLeft = left.slice(0, left.length - commonLength);
  const baseEdit = common.concat(edit.slice(0, edit.length - commonLength));
  const baseRight = common.concat(right);
  const region = baseLeft.concat(baseEdit, baseRight);
  const scores = referenceBoundaryScores(region, wordSegmenter);
  let bestShift = 0;
  let bestScore = (scores[baseLeft.length] as number) + (scores[baseLeft.length + edit.length] as number);
  let shift = 0;

  while (
    shift < baseRight.length &&
    region[baseLeft.length + shift] === region[baseLeft.length + edit.length + shift]
  ) {
    shift++;
    const score =
      (scores[baseLeft.length + shift] as number) + (scores[baseLeft.length + edit.length + shift] as number);
    if (score >= bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  const firstCut = baseLeft.length + bestShift;
  const secondCut = firstCut + edit.length;
  const result: Diff[] = [];
  if (firstCut > 0) {
    result.push([EQUAL, region.slice(0, firstCut)]);
  }
  result.push([operation, region.slice(firstCut, secondCut)]);
  if (secondCut < region.length) {
    result.push([EQUAL, region.slice(secondCut)]);
  }
  return result;
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

  it('scores only reachable cuts and caches token classifications for one call', () => {
    const input = tokenizeDiff([
      [EQUAL, 'aaa'],
      [INSERT, 'a.'],
      [EQUAL, 'a..STABLEaaa'],
      [DELETE, 'a.'],
      [EQUAL, 'a..'],
    ]);
    const patternTest = vi.spyOn(RegExp.prototype, 'test');
    let firstWhitespaceCalls = 0;
    let firstPunctuationCalls = 0;
    let secondWhitespaceCalls = 0;
    let secondPunctuationCalls = 0;

    const countCalls = (source: string): number =>
      patternTest.mock.contexts.filter((context) => context instanceof RegExp && context.source === source).length;

    try {
      cleanupSemantic(input);
      firstWhitespaceCalls = countCalls(referenceWhitespacePattern.source);
      firstPunctuationCalls = countCalls(referencePunctuationPattern.source);
      cleanupSemantic(input);
      secondWhitespaceCalls = countCalls(referenceWhitespacePattern.source);
      secondPunctuationCalls = countCalls(referencePunctuationPattern.source);
    } finally {
      patternTest.mockRestore();
    }

    expect([firstWhitespaceCalls, firstPunctuationCalls]).toEqual([2, 2]);
    expect([secondWhitespaceCalls, secondPunctuationCalls]).toEqual([4, 4]);
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
      'the initial placement when it beats one alternative',
      [
        [EQUAL, 'a'],
        [INSERT, 'aaa '],
        [EQUAL, 'ab'],
      ],
      [
        [EQUAL, 'a'],
        [INSERT, 'aaa '],
        [EQUAL, 'ab'],
      ],
    ],
    [
      'the original interior placement',
      [
        [EQUAL, 'aa'],
        [INSERT, '.a'],
        [EQUAL, '..'],
      ],
      [
        [EQUAL, 'aa'],
        [INSERT, '.a'],
        [EQUAL, '..'],
      ],
    ],
  ] as const)('keeps %s without rematerializing the triple', (_name, input, expected) => {
    expect(cleanupSemantic(tokenizeDiff(input))).toEqual(tokenizeDiff(expected));
  });

  it('removes an exhausted right equality and normalizes the newly adjacent edits', () => {
    const input = tokenizeDiff([
      [EQUAL, 'x a'],
      [INSERT, 'a'],
      [EQUAL, 'aa'],
      [INSERT, 'b'],
      [EQUAL, 'z'],
    ]);

    expect(cleanupSemantic(input)).toEqual(
      tokenizeDiff([
        [EQUAL, 'x aaa'],
        [INSERT, 'ab'],
        [EQUAL, 'z'],
      ]),
    );
  });

  it('tracks candidate cuts by UTF-16 offset rather than token index', () => {
    const emoji = unicodeFixtures.WOMAN_TECHNOLOGIST;
    const input = tokenizeDiff([
      [EQUAL, 'a'],
      [INSERT, emoji],
      [EQUAL, `${emoji}a`],
    ]);

    expect(cleanupSemantic(input)).toEqual(
      tokenizeDiff([
        [EQUAL, `a${emoji}`],
        [INSERT, emoji],
        [EQUAL, 'a'],
      ]),
    );
  });

  it('matches the legacy scorer over generated shiftable grapheme triples', () => {
    const tokenPool = [
      'a',
      'b',
      ' ',
      '\n',
      '\r\n',
      '.',
      unicodeFixtures.SPARKLES,
      unicodeFixtures.E_WITH_COMBINING_ACUTE,
      unicodeFixtures.WOMAN_TECHNOLOGIST,
      unicodeFixtures.UNITED_NATIONS_FLAG,
      unicodeFixtures.THAI_CHO_CHING_WITH_MAI_HAN_AKAT,
    ] as const;
    const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });
    let state = 0x6a09_e667;
    const next = (limit: number): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state % limit;
    };
    const createTokens = (length: number): string[] =>
      Array.from({ length }, () => tokenPool[next(tokenPool.length)] as string);

    for (const operation of [DELETE, INSERT] as const) {
      for (let caseIndex = 0; caseIndex < 320; caseIndex++) {
        const edit = createTokens(1 + next(4));
        const left = createTokens(6 + next(3));
        const right = createTokens(6 + next(3));

        if (caseIndex % 2 === 0) {
          right[0] = edit[0] as string;
        }
        if (caseIndex % 3 === 0) {
          left[left.length - 1] = edit[edit.length - 1] as string;
        }
        if (caseIndex % 5 === 0) {
          const repeatedToken = tokenPool[next(tokenPool.length)] as string;
          edit.fill(repeatedToken);
          left.fill(repeatedToken, left.length - edit.length);
          right.fill(repeatedToken, 0, 1 + next(right.length));
        }

        const input: Diff[] = [
          [EQUAL, left],
          [operation, edit],
          [EQUAL, right],
        ];
        const expected = referenceLosslessPlacement(left, operation, edit, right, wordSegmenter);

        expect(cleanupSemantic(input, { locale: 'en' }), `${operation} case ${caseIndex}`).toEqual(expected);
      }
    }
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

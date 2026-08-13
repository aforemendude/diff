/*
 * Semantic-cleanup fixtures adapted from diff-match-patch-es v2.0.1 and
 * Google Diff Match and Patch, Copyright 2018 The diff-match-patch Authors,
 * under Apache-2.0. Modified for grapheme and Intl.Segmenter coverage.
 */

import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT, cleanupSemantic, diffGraphemes, diffText, type Diff } from './index';

type DiffTuple = readonly [operation: number, text: string];

const reconstructBefore = (diffs: readonly DiffTuple[]): string =>
  diffs
    .filter(([operation]) => operation !== INSERT)
    .map(([, text]) => text)
    .join('');

const reconstructAfter = (diffs: readonly DiffTuple[]): string =>
  diffs
    .filter(([operation]) => operation !== DELETE)
    .map(([, text]) => text)
    .join('');

const graphemeBoundaries = (text: string, locale?: Intl.LocalesArgument): ReadonlySet<number> => {
  const boundaries = new Set<number>([0, text.length]);
  const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });

  for (const { index, segment } of segmenter.segment(text)) {
    boundaries.add(index);
    boundaries.add(index + segment.length);
  }

  return boundaries;
};

const expectValidGraphemeDiff = (
  before: string,
  after: string,
  diffs: readonly DiffTuple[],
  locale?: Intl.LocalesArgument,
): void => {
  expect(reconstructBefore(diffs)).toBe(before);
  expect(reconstructAfter(diffs)).toBe(after);

  const beforeBoundaries = graphemeBoundaries(before, locale);
  const afterBoundaries = graphemeBoundaries(after, locale);
  let beforeOffset = 0;
  let afterOffset = 0;

  for (let index = 0; index < diffs.length; index++) {
    const [operation, text] = diffs[index] ?? [EQUAL, ''];
    expect(text).not.toBe('');

    if (index > 0) {
      expect(operation).not.toBe(diffs[index - 1]?.[0]);
    }

    if (operation !== INSERT) {
      beforeOffset += text.length;
      expect(beforeBoundaries.has(beforeOffset)).toBe(true);
    }

    if (operation !== DELETE) {
      afterOffset += text.length;
      expect(afterBoundaries.has(afterOffset)).toBe(true);
    }
  }
};

describe('diffGraphemes', () => {
  it.each([
    ['combining sequences', 'e\u0301', 'e\u0300'],
    ['emoji ZWJ sequences', '👩‍💻', '👩‍🔬'],
    ['regional-indicator flags', '🇺🇳', '🇺🇸'],
    ['emoji with skin tones', '👍🏻', '👍🏽'],
    ['variation-selector sequences', '✈️', '✈︎'],
  ])('treats %s as indivisible tokens', (_name, beforeCluster, afterCluster) => {
    const before = `A${beforeCluster}B`;
    const after = `A${afterCluster}B`;
    const diffs = diffGraphemes(before, after, { locale: 'en' });

    expect(diffs).toEqual([
      [EQUAL, 'A'],
      [DELETE, beforeCluster],
      [INSERT, afterCluster],
      [EQUAL, 'B'],
    ]);
    expectValidGraphemeDiff(before, after, diffs, 'en');
  });

  it('does not normalize canonically equivalent graphemes', () => {
    const composed = 'é';
    const decomposed = 'e\u0301';
    const diffs = diffGraphemes(composed, decomposed);

    expect(diffs).toEqual([
      [DELETE, composed],
      [INSERT, decomposed],
    ]);
    expectValidGraphemeDiff(composed, decomposed, diffs);
  });

  it('reconstructs both inputs without introducing grapheme boundaries', () => {
    const cases = [
      ['', '👨‍👩‍👧‍👦'],
      ['Cafe\u0301 and 🇺🇳', 'Café and 🇺🇸'],
      ['क्‍ष 👍🏻', 'क्ष 👍🏽'],
      ['ฉันกินข้าว', 'ฉันกิจกรรมกินข้าว'],
    ] as const;

    for (const [before, after] of cases) {
      expectValidGraphemeDiff(before, after, diffGraphemes(before, after));
    }
  });
});

describe('grapheme diff invariants', () => {
  it('preserves reconstruction and cluster boundaries across deterministic randomized inputs', () => {
    const pieces = ['a', 'b', ' ', '.', '\n', '\r', '\u0301', 'e\u0300', '👩‍💻', '👍🏽', '🇺🇳', 'ฉั', 'กิ', 'क्‍ष'] as const;
    let state = 0x1234_5678;
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const makeText = (): string => {
      const length = Math.floor(random() * 24);
      return Array.from({ length }, () => pieces[Math.floor(random() * pieces.length)]).join('');
    };

    for (let iteration = 0; iteration < 500; iteration++) {
      const before = makeText();
      const after = makeText();
      expectValidGraphemeDiff(before, after, diffText(before, after));
    }
  });
});

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

  it('handles a single edit well beyond JavaScript argument-count limits', () => {
    const before = 'a'.repeat(130_000);
    const diffs = diffText(before, '');

    expect(diffs).toEqual([[DELETE, before]]);
    expectValidGraphemeDiff(before, '', diffs);
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

  it('keeps a useful partial-word edit instead of forcing the whole word', () => {
    const diffs = diffText('cat', 'cut', { cleanup: 'semantic', locale: 'en' });

    expect(diffs).toEqual([
      [EQUAL, 'c'],
      [DELETE, 'a'],
      [INSERT, 'u'],
      [EQUAL, 't'],
    ]);
    expectValidGraphemeDiff('cat', 'cut', diffs, 'en');
  });

  it('uses Thai word boundaries to choose an unambiguous edit placement', () => {
    const before = 'ฉันกินข้าว';
    const after = 'ฉันกิจกรรมกินข้าว';
    const raw = diffText(before, after, { cleanup: 'none', locale: 'th' });
    const expected = [
      [EQUAL, 'ฉัน'],
      [INSERT, 'กิจกรรม'],
      [EQUAL, 'กินข้าว'],
    ] as const;

    expect(raw).toEqual([
      [EQUAL, 'ฉันกิ'],
      [INSERT, 'จกรรมกิ'],
      [EQUAL, 'นข้าว'],
    ]);
    expect(cleanupSemantic(raw, { locale: 'th' })).toEqual(expected);
    expect(diffText(before, after, { cleanup: 'semantic', locale: 'th' })).toEqual(expected);
    expectValidGraphemeDiff(before, after, expected, 'th');
  });
});

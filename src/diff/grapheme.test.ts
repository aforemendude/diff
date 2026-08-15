import { describe, expect, it, vi } from 'vitest';
import { expectValidGraphemeDiff } from '../test-support/diff.test.helper';
import * as unicodeFixtures from '../test-support/unicode.test.fixtures';
import { DELETE, EQUAL, INSERT } from '../types';
import { diffGraphemes } from './grapheme';

describe('diffGraphemes', () => {
  it('reuses one segmenter for both inputs', () => {
    const NativeSegmenter = Intl.Segmenter;
    const segmenter = vi.spyOn(Intl, 'Segmenter').mockImplementation(function (locales, options) {
      return new NativeSegmenter(locales, options);
    });

    try {
      diffGraphemes('before', 'after', { locale: 'en' });

      expect(segmenter).toHaveBeenCalledOnce();
      expect(segmenter).toHaveBeenCalledWith('en', { granularity: 'grapheme' });
    } finally {
      segmenter.mockRestore();
    }
  });

  it('only tokenizes identical inputs once when the fast path is enabled', () => {
    const segment = vi.spyOn(Intl.Segmenter.prototype, 'segment');
    const before = ['A', unicodeFixtures.WOMAN_TECHNOLOGIST, 'B'].join('');
    const independentlyConstructedAfter = `_${before}`.slice(1);

    try {
      expect(diffGraphemes(before, independentlyConstructedAfter)).toEqual([
        [EQUAL, ['A', unicodeFixtures.WOMAN_TECHNOLOGIST, 'B']],
      ]);
      expect(segment).toHaveBeenCalledTimes(2);

      segment.mockClear();
      expect(diffGraphemes(before, independentlyConstructedAfter, { optimizeTrivialCases: true })).toEqual([
        [EQUAL, ['A', unicodeFixtures.WOMAN_TECHNOLOGIST, 'B']],
      ]);
      expect(segment).toHaveBeenCalledOnce();

      segment.mockClear();
      expect(diffGraphemes('', '', { optimizeTrivialCases: true })).toEqual([]);
      expect(segment).toHaveBeenCalledOnce();
    } finally {
      segment.mockRestore();
    }
  });

  it('only tokenizes the nonempty input in one-sided trivial cases', () => {
    const segment = vi.spyOn(Intl.Segmenter.prototype, 'segment');
    const text = `A${unicodeFixtures.WOMAN_TECHNOLOGIST}B`;

    try {
      expect(diffGraphemes('', text)).toEqual([[INSERT, ['A', unicodeFixtures.WOMAN_TECHNOLOGIST, 'B']]]);
      expect(segment).toHaveBeenCalledTimes(2);

      segment.mockClear();
      expect(diffGraphemes('', text, { optimizeTrivialCases: true })).toEqual([
        [INSERT, ['A', unicodeFixtures.WOMAN_TECHNOLOGIST, 'B']],
      ]);
      expect(segment).toHaveBeenCalledOnce();

      segment.mockClear();
      expect(diffGraphemes(text, '', { optimizeTrivialCases: true })).toEqual([
        [DELETE, ['A', unicodeFixtures.WOMAN_TECHNOLOGIST, 'B']],
      ]);
      expect(segment).toHaveBeenCalledOnce();
    } finally {
      segment.mockRestore();
    }
  });

  it('returns freshly owned one-sided trivial-case results', () => {
    const first = diffGraphemes('', `A${unicodeFixtures.WOMAN_TECHNOLOGIST}B`, { optimizeTrivialCases: true });
    const second = diffGraphemes('', `A${unicodeFixtures.WOMAN_TECHNOLOGIST}B`, { optimizeTrivialCases: true });

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0]?.[1]).not.toBe(first[0]?.[1]);
  });

  it.each([
    ['same', 'same'],
    ['', 'after'],
    ['before', ''],
  ])('validates the locale before using a trivial-case fast path for %j and %j', (before, after) => {
    expect(() => diffGraphemes(before, after, { locale: 'not_a_locale', optimizeTrivialCases: true })).toThrow(
      RangeError,
    );
  });

  it('handles empty, inserted, deleted, and equal inputs', () => {
    expect(diffGraphemes('', '')).toEqual([]);
    expect(diffGraphemes('', 'after')).toEqual([[INSERT, ['a', 'f', 't', 'e', 'r']]]);
    expect(diffGraphemes('before', '')).toEqual([[DELETE, ['b', 'e', 'f', 'o', 'r', 'e']]]);
    expect(diffGraphemes('same', 'same')).toEqual([[EQUAL, ['s', 'a', 'm', 'e']]]);
  });

  it.each([
    ['combining sequences', unicodeFixtures.E_WITH_COMBINING_ACUTE, unicodeFixtures.E_WITH_COMBINING_GRAVE],
    ['emoji ZWJ sequences', unicodeFixtures.WOMAN_TECHNOLOGIST, unicodeFixtures.WOMAN_SCIENTIST],
    ['regional-indicator flags', unicodeFixtures.UNITED_NATIONS_FLAG, unicodeFixtures.UNITED_STATES_FLAG],
    ['emoji with skin tones', unicodeFixtures.THUMBS_UP_LIGHT_SKIN_TONE, unicodeFixtures.THUMBS_UP_MEDIUM_SKIN_TONE],
    ['variation-selector sequences', unicodeFixtures.AIRPLANE_EMOJI_STYLE, unicodeFixtures.AIRPLANE_TEXT_STYLE],
  ])('treats %s as indivisible tokens', (_name, beforeCluster, afterCluster) => {
    const before = `A${beforeCluster}B`;
    const after = `A${afterCluster}B`;
    const diffs = diffGraphemes(before, after, { locale: 'en' });

    expect(diffs).toEqual([
      [EQUAL, ['A']],
      [DELETE, [beforeCluster]],
      [INSERT, [afterCluster]],
      [EQUAL, ['B']],
    ]);
    expectValidGraphemeDiff(before, after, diffs, 'en');
  });

  it('does not normalize canonically equivalent graphemes', () => {
    const composed = unicodeFixtures.LATIN_SMALL_LETTER_E_WITH_ACUTE;
    const decomposed = unicodeFixtures.E_WITH_COMBINING_ACUTE;
    const diffs = diffGraphemes(composed, decomposed);

    expect(diffs).toEqual([
      [DELETE, [composed]],
      [INSERT, [decomposed]],
    ]);
    expectValidGraphemeDiff(composed, decomposed, diffs);
  });

  it('reconstructs both inputs without introducing grapheme boundaries', () => {
    const cases = [
      ['', unicodeFixtures.MAN_WOMAN_GIRL_BOY_FAMILY],
      [
        `Caf${unicodeFixtures.E_WITH_COMBINING_ACUTE} and ${unicodeFixtures.UNITED_NATIONS_FLAG}`,
        `Caf${unicodeFixtures.LATIN_SMALL_LETTER_E_WITH_ACUTE} and ${unicodeFixtures.UNITED_STATES_FLAG}`,
      ],
      [
        `${unicodeFixtures.DEVANAGARI_KSSA_WITH_ZWJ} ${unicodeFixtures.THUMBS_UP_LIGHT_SKIN_TONE}`,
        `${unicodeFixtures.DEVANAGARI_KSSA} ${unicodeFixtures.THUMBS_UP_MEDIUM_SKIN_TONE}`,
      ],
      [unicodeFixtures.THAI_BEFORE, unicodeFixtures.THAI_AFTER],
    ] as const;

    for (const [before, after] of cases) {
      expectValidGraphemeDiff(before, after, diffGraphemes(before, after));
    }
  });
});

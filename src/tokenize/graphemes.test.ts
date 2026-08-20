import { describe, expect, it } from 'vitest';
import * as unicodeFixtures from '../test-support/unicode.test.fixtures';
import { tokenizeGraphemes } from './graphemes';

const createSegmenter = (locale?: Intl.LocalesArgument): Intl.Segmenter =>
  new Intl.Segmenter(locale, { granularity: 'grapheme' });

describe('tokenizeGraphemes', () => {
  it('handles empty text', () => {
    expect(tokenizeGraphemes('', createSegmenter())).toEqual([]);
  });

  it('keeps extended grapheme clusters intact', () => {
    const text =
      `A${unicodeFixtures.E_WITH_COMBINING_ACUTE}` +
      unicodeFixtures.WOMAN_TECHNOLOGIST +
      unicodeFixtures.UNITED_NATIONS_FLAG +
      `${unicodeFixtures.THUMBS_UP_MEDIUM_SKIN_TONE}B`;

    expect(tokenizeGraphemes(text, createSegmenter('en'))).toEqual([
      'A',
      unicodeFixtures.E_WITH_COMBINING_ACUTE,
      unicodeFixtures.WOMAN_TECHNOLOGIST,
      unicodeFixtures.UNITED_NATIONS_FLAG,
      unicodeFixtures.THUMBS_UP_MEDIUM_SKIN_TONE,
      'B',
    ]);
  });

  it('uses the segmenter prepared by the public API', () => {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

    const text =
      `A${unicodeFixtures.E_WITH_COMBINING_ACUTE}` +
      unicodeFixtures.WOMAN_TECHNOLOGIST +
      unicodeFixtures.UNITED_NATIONS_FLAG +
      `${unicodeFixtures.THUMBS_UP_MEDIUM_SKIN_TONE}B`;

    expect(tokenizeGraphemes(text, segmenter)).toEqual([
      'A',
      unicodeFixtures.E_WITH_COMBINING_ACUTE,
      unicodeFixtures.WOMAN_TECHNOLOGIST,
      unicodeFixtures.UNITED_NATIONS_FLAG,
      unicodeFixtures.THUMBS_UP_MEDIUM_SKIN_TONE,
      'B',
    ]);
  });

  it('preserves canonically distinct text without normalization', () => {
    const text = `${unicodeFixtures.LATIN_SMALL_LETTER_E_WITH_ACUTE} ${unicodeFixtures.E_WITH_COMBINING_ACUTE}`;

    expect(tokenizeGraphemes(text, createSegmenter())).toEqual([
      unicodeFixtures.LATIN_SMALL_LETTER_E_WITH_ACUTE,
      ' ',
      unicodeFixtures.E_WITH_COMBINING_ACUTE,
    ]);
  });
});

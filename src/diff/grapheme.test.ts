import { describe, expect, it } from 'vitest';
import { expectValidGraphemeDiff } from '../test-support/diff.test.helper';
import { DELETE, EQUAL, INSERT } from '../types';
import { diffGraphemes } from './grapheme';

describe('diffGraphemes', () => {
  it('handles empty, inserted, deleted, and equal inputs', () => {
    expect(diffGraphemes('', '')).toEqual([]);
    expect(diffGraphemes('', 'after')).toEqual([[INSERT, ['a', 'f', 't', 'e', 'r']]]);
    expect(diffGraphemes('before', '')).toEqual([[DELETE, ['b', 'e', 'f', 'o', 'r', 'e']]]);
    expect(diffGraphemes('same', 'same')).toEqual([[EQUAL, ['s', 'a', 'm', 'e']]]);
  });

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
      [EQUAL, ['A']],
      [DELETE, [beforeCluster]],
      [INSERT, [afterCluster]],
      [EQUAL, ['B']],
    ]);
    expectValidGraphemeDiff(before, after, diffs, 'en');
  });

  it('does not normalize canonically equivalent graphemes', () => {
    const composed = 'é';
    const decomposed = 'e\u0301';
    const diffs = diffGraphemes(composed, decomposed);

    expect(diffs).toEqual([
      [DELETE, [composed]],
      [INSERT, [decomposed]],
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

import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT, diffGraphemes, type Diff, type SegmentOptions } from '../../src/grapheme.js';
import {
  createRandom,
  editCost,
  expectNormalized,
  expectShortestEdit,
  reconstructAfter,
  reconstructBefore,
  segmentGraphemes,
  sequences,
} from './support.js';

const expectExactGraphemeDiff = (
  before: string,
  after: string,
  diffs: readonly Diff[],
  options: SegmentOptions = {},
): void => {
  expectNormalized(diffs);
  expect(reconstructBefore(diffs)).toEqual(segmentGraphemes(before, options));
  expect(reconstructAfter(diffs)).toEqual(segmentGraphemes(after, options));
};

describe('diffGraphemes public API', () => {
  it.each([
    ['empty inputs', '', '', []],
    ['insertion into an empty input', '', 'A👩‍💻', [[INSERT, ['A', '👩‍💻']]]],
    ['deletion to an empty input', 'A👩‍💻', '', [[DELETE, ['A', '👩‍💻']]]],
    ['equal inputs', 'A👩‍💻', 'A👩‍💻', [[EQUAL, ['A', '👩‍💻']]]],
    [
      'middle insertion',
      'AB',
      'A🙂B',
      [
        [EQUAL, ['A']],
        [INSERT, ['🙂']],
        [EQUAL, ['B']],
      ],
    ],
    [
      'middle deletion',
      'A🙂B',
      'AB',
      [
        [EQUAL, ['A']],
        [DELETE, ['🙂']],
        [EQUAL, ['B']],
      ],
    ],
    [
      'replacement',
      'AoldB',
      'AnewB',
      [
        [EQUAL, ['A']],
        [DELETE, ['o', 'l', 'd']],
        [INSERT, ['n', 'e', 'w']],
        [EQUAL, ['B']],
      ],
    ],
  ] as const)('handles %s', (_name, before, after, expected) => {
    const diffs = diffGraphemes(before, after);

    expect(diffs).toEqual(expected);
    expectExactGraphemeDiff(before, after, diffs);
  });

  it.each([
    ['combining-mark sequences', 'e\u0301', 'e\u0300'],
    ['emoji ZWJ family sequences', '👨‍👩‍👧‍👦', '👩‍👩‍👧‍👦'],
    ['regional-indicator flags', '🇺🇳', '🇺🇸'],
    ['emoji skin tones', '👍🏽', '👍🏻'],
    ['variation selectors', '✈️', '✈︎'],
    ['keycap sequences', '1️⃣', '2️⃣'],
    ['Indic conjuncts', 'क्ष', 'ज्ञ'],
    ['CRLF', '\r\n', '\n'],
    ['NUL', '\0', '\u0001'],
  ] as const)('keeps %s intact', (_name, beforeCluster, afterCluster) => {
    const before = `A${beforeCluster}B`;
    const after = `A${afterCluster}B`;
    const diffs = diffGraphemes(before, after);

    expect(segmentGraphemes(beforeCluster)).toEqual([beforeCluster]);
    expect(segmentGraphemes(afterCluster)).toEqual([afterCluster]);
    expect(diffs).toEqual([
      [EQUAL, ['A']],
      [DELETE, [beforeCluster]],
      [INSERT, [afterCluster]],
      [EQUAL, ['B']],
    ]);
    expectExactGraphemeDiff(before, after, diffs);
  });

  it('compares canonically equivalent text exactly without normalizing it', () => {
    const composed = 'Café';
    const decomposed = 'Cafe\u0301';
    const diffs = diffGraphemes(composed, decomposed);

    expect(diffs).toEqual([
      [EQUAL, ['C', 'a', 'f']],
      [DELETE, ['é']],
      [INSERT, ['e\u0301']],
    ]);
    expectExactGraphemeDiff(composed, decomposed, diffs);
  });

  it('uses the default locale when the options argument is omitted', () => {
    const before = 'A👩‍💻B';
    const after = 'A👩‍🔬B';
    const diffs = diffGraphemes(before, after);

    expectExactGraphemeDiff(before, after, diffs);
    expect(diffs).toEqual([
      [EQUAL, ['A']],
      [DELETE, ['👩‍💻']],
      [INSERT, ['👩‍🔬']],
      [EQUAL, ['B']],
    ]);
  });

  it.each([
    ['a locale string', 'en-US'],
    ['a fallback locale array', ['zz-ZZ', 'en-US']],
    ['an Intl.Locale instance', new Intl.Locale('en-US')],
  ] as const)('accepts %s', (_name, locale) => {
    const before = 'Aक्षB';
    const after = 'Aज्ञB';
    const options: SegmentOptions = { locale };
    const diffs = diffGraphemes(before, after, options);

    expectExactGraphemeDiff(before, after, diffs, options);
    expect(diffs).toEqual([
      [EQUAL, ['A']],
      [DELETE, ['क्ष']],
      [INSERT, ['ज्ञ']],
      [EQUAL, ['B']],
    ]);
  });

  it('propagates invalid-locale errors from the public interface', () => {
    expect(() => diffGraphemes('before', 'after', { locale: 'not_a_locale' })).toThrow(RangeError);
    expect(() => diffGraphemes('before', 'after', { locale: ['en-US', 'not_a_locale'] })).toThrow(RangeError);
  });

  it('exhaustively returns normalized shortest scripts for generated small Unicode strings', () => {
    const alphabet = ['a', 'β', 'e\u0301', '👩‍💻'] as const;
    const inputs = sequences(alphabet, 3).map((tokens) => ({ text: tokens.join(''), tokens }));

    for (const { text, tokens } of inputs) {
      expect(segmentGraphemes(text)).toEqual(tokens);
    }

    for (const before of inputs) {
      for (const after of inputs) {
        const diffs = diffGraphemes(before.text, after.text);

        expectNormalized(diffs);
        expect(reconstructBefore(diffs)).toEqual(before.tokens);
        expect(reconstructAfter(diffs)).toEqual(after.tokens);
        expectShortestEdit(before.tokens, after.tokens, diffs);
      }
    }
  });

  it('returns freshly owned results on every call', () => {
    const before = 'A👩‍💻middle🇺🇳Z';
    const after = 'A👩‍🔬middle🇺🇸Z';
    const first = diffGraphemes(before, after);
    const second = diffGraphemes(before, after);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(new Set(first.map(([, tokens]) => tokens)).size).toBe(first.length);
    for (let index = 0; index < first.length; index++) {
      expect(first[index]).not.toBe(second[index]);
      expect(first[index]?.[1]).not.toBe(second[index]?.[1]);
    }
  });

  it('handles deterministic, generated large mixed-Unicode input with sparse edits', () => {
    const random = createRandom(0xd1ff_cafe);
    const clusterPool = ['a', 'β', 'e\u0301', '👨‍👩‍👧‍👦', '🇺🇳', '👍🏽', '✈️', '1️⃣', 'क्ष', '\r\n', '\0'] as const;
    const recordCount = 12_000;
    const editCount = 24;
    const beforeClusters = Array.from(
      { length: recordCount },
      () => clusterPool[random() % clusterPool.length] as string,
    );
    const afterClusters = beforeClusters.slice();
    const editedRecords = new Set<number>();

    while (editedRecords.size < editCount) {
      editedRecords.add(random() % recordCount);
    }
    for (const record of editedRecords) {
      const originalIndex = clusterPool.indexOf(beforeClusters[record] as (typeof clusterPool)[number]);
      const offset = 1 + (random() % (clusterPool.length - 1));
      afterClusters[record] = clusterPool[(originalIndex + offset) % clusterPool.length] as string;
    }

    const toTokens = (clusters: readonly string[]): string[] =>
      clusters.flatMap((cluster, index) => [cluster, String.fromCodePoint(0xf_0000 + index)]);
    const beforeTokens = toTokens(beforeClusters);
    const afterTokens = toTokens(afterClusters);
    const before = beforeTokens.join('');
    const after = afterTokens.join('');
    const diffs = diffGraphemes(before, after);

    expect(segmentGraphemes(before)).toEqual(beforeTokens);
    expect(segmentGraphemes(after)).toEqual(afterTokens);
    expectNormalized(diffs);
    expect(reconstructBefore(diffs)).toEqual(beforeTokens);
    expect(reconstructAfter(diffs)).toEqual(afterTokens);
    expect(editCost(diffs)).toBe(2 * editCount);
  });
});

import type { Diff, DiffMatchPathOptions } from '../../src/index.js';
import * as upstream from 'diff-match-patch-es';
import { describe, expect, it } from 'vitest';

import * as fork from '../../src/index.js';

const unlimitedOptions = { diffTimeout: 0 } satisfies DiffMatchPathOptions;
const lineModeText1 = Array.from({ length: 30 }, (_, index) => `original line ${index}`).join('\n');
const lineModeText2 = Array.from({ length: 30 }, (_, index) => `modified line ${index}`).join('\n');

function cloneDiffs(diffs: readonly Diff[]): Diff[] {
  return diffs.map(([operation, text]) => [operation, text]);
}

describe('diff-match-patch-es baseline parity', () => {
  it('matches the public constants and default options', () => {
    expect(fork.DIFF_DELETE).toBe(upstream.DIFF_DELETE);
    expect(fork.DIFF_EQUAL).toBe(upstream.DIFF_EQUAL);
    expect(fork.DIFF_INSERT).toBe(upstream.DIFF_INSERT);
    expect(fork.defaultOptions).toEqual(upstream.defaultOptions);
    expect(fork.resolveOptions({ diffEditCost: 7, diffTimeout: 0 })).toEqual(
      upstream.resolveOptions({ diffEditCost: 7, diffTimeout: 0 }),
    );
  });

  it.each([
    ['', ''],
    ['identical', 'identical'],
    ['kitten', 'sitting'],
    ['The quick brown fox jumps over the lazy dog.', 'The quick red fox jumped over a lazy dog.'],
    ['alpha\nbeta\nalpha\n', 'beta\nalpha\nbeta\n'],
    ['A\uD83D\uDE00B', 'A\uD83D\uDE03B'],
    [lineModeText1, lineModeText2],
  ])('matches diff output for %#', (text1, text2) => {
    expect(fork.diff(text1, text2, unlimitedOptions)).toEqual(upstream.diff(text1, text2, unlimitedOptions));
    expect(fork.diffMain(text1, text2, unlimitedOptions, false)).toEqual(
      upstream.diffMain(text1, text2, unlimitedOptions, false),
    );
  });

  it('matches line encoding and decoding', () => {
    const text1 = 'alpha\r\nbeta\r\nalpha';
    const text2 = 'beta\r\nalpha\r\nbeta';
    const forkEncoded = fork.diffLinesToChars(text1, text2);
    const upstreamEncoded = upstream.diffLinesToChars(text1, text2);

    expect(forkEncoded).toEqual(upstreamEncoded);

    const forkDiffs = fork.diffMain(forkEncoded.chars1, forkEncoded.chars2, unlimitedOptions, false);
    const upstreamDiffs = upstream.diffMain(upstreamEncoded.chars1, upstreamEncoded.chars2, unlimitedOptions, false);
    fork.diffCharsToLines(forkDiffs, forkEncoded.lineArray);
    upstream.diffCharsToLines(upstreamDiffs, upstreamEncoded.lineArray);

    expect(forkDiffs).toEqual(upstreamDiffs);
  });

  it('matches cleanup behavior', () => {
    const rawDiffs: Diff[] = [
      [fork.DIFF_DELETE, 'The c'],
      [fork.DIFF_INSERT, 'the '],
      [fork.DIFF_EQUAL, 'at c'],
      [fork.DIFF_DELETE, 'ame'],
      [fork.DIFF_INSERT, 'aught'],
      [fork.DIFF_EQUAL, '.'],
    ];

    const forkSemantic = cloneDiffs(rawDiffs);
    const upstreamSemantic = cloneDiffs(rawDiffs);
    fork.diffCleanupSemantic(forkSemantic);
    upstream.diffCleanupSemantic(upstreamSemantic);
    expect(forkSemantic).toEqual(upstreamSemantic);

    const forkLossless = cloneDiffs(rawDiffs);
    const upstreamLossless = cloneDiffs(rawDiffs);
    fork.diffCleanupSemanticLossless(forkLossless);
    upstream.diffCleanupSemanticLossless(upstreamLossless);
    expect(forkLossless).toEqual(upstreamLossless);

    const forkEfficient = cloneDiffs(rawDiffs);
    const upstreamEfficient = cloneDiffs(rawDiffs);
    fork.diffCleanupEfficiency(forkEfficient, { diffEditCost: 6 });
    upstream.diffCleanupEfficiency(upstreamEfficient, { diffEditCost: 6 });
    expect(forkEfficient).toEqual(upstreamEfficient);

    const forkMerged = cloneDiffs(rawDiffs);
    const upstreamMerged = cloneDiffs(rawDiffs);
    fork.diffCleanupMerge(forkMerged);
    upstream.diffCleanupMerge(upstreamMerged);
    expect(forkMerged).toEqual(upstreamMerged);
  });

  it('matches the remaining exported diff helpers', () => {
    const diffs: Diff[] = [
      [fork.DIFF_DELETE, 'Hello'],
      [fork.DIFF_INSERT, 'Goodbye'],
      [fork.DIFF_EQUAL, ' world.'],
    ];

    expect(fork.diffCommonPrefix('1234', '1234xyz')).toBe(upstream.diffCommonPrefix('1234', '1234xyz'));
    expect(fork.diffCommonSuffix('abcdef1234', 'xyz1234')).toBe(upstream.diffCommonSuffix('abcdef1234', 'xyz1234'));
    expect(fork.diffPrettyHtml(diffs)).toBe(upstream.diffPrettyHtml(diffs));
    expect(fork.diffText1(diffs)).toBe(upstream.diffText1(diffs));
    expect(fork.diffText2(diffs)).toBe(upstream.diffText2(diffs));
    expect(fork.diffLevenshtein(diffs)).toBe(upstream.diffLevenshtein(diffs));

    for (const location of [0, 1, 5, 10, 20])
      expect(fork.diffXIndex(diffs, location)).toBe(upstream.diffXIndex(diffs, location));

    const delta = upstream.diffToDelta(diffs);
    expect(fork.diffToDelta(diffs)).toBe(delta);
    expect(fork.diffFromDelta(upstream.diffText1(diffs), delta)).toEqual(
      upstream.diffFromDelta(upstream.diffText1(diffs), delta),
    );
  });
});

/*
 * Semantic cleanup derived from diff-match-patch-es v2.0.1 and Google
 * Diff Match and Patch.
 *
 * Copyright 2018 The diff-match-patch Authors.
 * Original implementation by Neil Fraser; TypeScript/ES module rewrite by
 * Anthony Fu. See https://github.com/google/diff-match-patch and
 * https://github.com/antfu/diff-match-patch-es.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modified to operate exclusively on grapheme tokens, use Intl.Segmenter word
 * boundaries, avoid recursive/string-index operations, and return a new
 * compact tuple array.
 */

import { DELETE, EQUAL, INSERT, type Diff, type SegmentOptions } from '../types';
import { cleanupMerge, compactOwned, commonSuffixLength, equalTokens, type GraphemeDiff } from './common';

/** Eliminate equalities that are no larger than the edits on either side. */
const eliminateTrivialEqualities = (diffs: GraphemeDiff[]): boolean => {
  let changed = false;
  const equalities: number[] = [];
  let lastEquality: string[] | undefined;
  let pointer = 0;
  let insertionsBefore = 0;
  let deletionsBefore = 0;
  let insertionsAfter = 0;
  let deletionsAfter = 0;

  while (pointer < diffs.length) {
    const current = diffs[pointer];
    if (current === undefined) {
      break;
    }

    if (current[0] === EQUAL) {
      equalities.push(pointer);
      insertionsBefore = insertionsAfter;
      deletionsBefore = deletionsAfter;
      insertionsAfter = 0;
      deletionsAfter = 0;
      lastEquality = current[1];
    } else {
      if (current[0] === INSERT) {
        insertionsAfter += current[1].length;
      } else {
        deletionsAfter += current[1].length;
      }

      if (
        lastEquality !== undefined &&
        lastEquality.length <= Math.max(insertionsBefore, deletionsBefore) &&
        lastEquality.length <= Math.max(insertionsAfter, deletionsAfter)
      ) {
        const equalityIndex = equalities[equalities.length - 1];
        if (equalityIndex === undefined) {
          break;
        }
        diffs.splice(equalityIndex, 0, [DELETE, lastEquality.slice()]);
        diffs[equalityIndex + 1] = [INSERT, lastEquality.slice()];
        equalities.pop();
        equalities.pop();
        pointer = equalities.length > 0 ? (equalities[equalities.length - 1] ?? -1) : -1;
        insertionsBefore = 0;
        deletionsBefore = 0;
        insertionsAfter = 0;
        deletionsAfter = 0;
        lastEquality = undefined;
        changed = true;
      }
    }
    pointer++;
  }

  return changed;
};

const whitespacePattern = /^\s+$/u;
const punctuationPattern = /[\p{P}\p{S}]/u;

const isLineBreak = (token: string | undefined): boolean =>
  token !== undefined && (token.includes('\r') || token.includes('\n'));
const isWhitespace = (token: string | undefined): boolean => token !== undefined && whitespacePattern.test(token);
const isPunctuation = (token: string | undefined): boolean => token !== undefined && punctuationPattern.test(token);

/** Precompute the DMP-style quality score at every grapheme cut. */
const boundaryScores = (tokens: readonly string[], wordSegmenter: Intl.Segmenter): Uint8Array => {
  const text = tokens.join('');
  const wordBoundaries = new Set<number>();
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike) {
      wordBoundaries.add(segment.index);
      wordBoundaries.add(segment.index + segment.segment.length);
    }
  }

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
    offset += tokens[cut]?.length ?? 0;
  }
  return scores;
};

/** Shift isolated edits across equivalent text to the best semantic cuts. */
const cleanupSemanticLossless = (diffs: GraphemeDiff[], wordSegmenter: Intl.Segmenter): void => {
  let pointer = 1;

  while (pointer < diffs.length - 1) {
    const left = diffs[pointer - 1];
    const edit = diffs[pointer];
    const right = diffs[pointer + 1];
    if (left?.[0] !== EQUAL || edit === undefined || edit[0] === EQUAL || right?.[0] !== EQUAL) {
      pointer++;
      continue;
    }

    const commonLength = commonSuffixLength(left[1], edit[1]);
    if (commonLength === 0 && edit[1][0] !== right[1][0]) {
      pointer++;
      continue;
    }

    const common = edit[1].slice(edit[1].length - commonLength);
    const baseLeft = left[1].slice(0, left[1].length - commonLength);
    const baseEdit = common.concat(edit[1].slice(0, edit[1].length - commonLength));
    const baseRight = common.concat(right[1]);
    const region = baseLeft.concat(baseEdit, baseRight);
    const editLength = baseEdit.length;
    const scores = boundaryScores(region, wordSegmenter);
    let bestShift = 0;
    let bestScore = (scores[baseLeft.length] ?? 0) + (scores[baseLeft.length + editLength] ?? 0);
    let shift = 0;

    while (
      shift < baseRight.length &&
      region[baseLeft.length + shift] === region[baseLeft.length + editLength + shift]
    ) {
      shift++;
      const score = (scores[baseLeft.length + shift] ?? 0) + (scores[baseLeft.length + editLength + shift] ?? 0);
      // Match DMP's preference for a later cut when two positions tie.
      if (score >= bestScore) {
        bestScore = score;
        bestShift = shift;
      }
    }

    const firstCut = baseLeft.length + bestShift;
    const secondCut = firstCut + editLength;
    const bestLeft = region.slice(0, firstCut);
    const bestEdit = region.slice(firstCut, secondCut);
    const bestRight = region.slice(secondCut);

    if (!equalTokens(left[1], bestLeft)) {
      if (bestLeft.length > 0) {
        diffs[pointer - 1] = [EQUAL, bestLeft];
      } else {
        diffs.splice(pointer - 1, 1);
        pointer--;
      }

      diffs[pointer] = [edit[0], bestEdit];
      if (bestRight.length > 0) {
        diffs[pointer + 1] = [EQUAL, bestRight];
      } else {
        diffs.splice(pointer + 1, 1);
      }
    }
    pointer++;
  }
};

/** Longest suffix of `left` that is also a prefix of `right`, in linear time. */
const commonOverlapLength = (left: readonly string[], right: readonly string[]): number => {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 0;
  }
  const pattern = right.slice(0, length);
  const prefix = new Uint32Array(length);
  let matched = 0;

  for (let index = 1; index < pattern.length; index++) {
    while (matched > 0 && pattern[index] !== pattern[matched]) {
      matched = prefix[matched - 1] ?? 0;
    }
    if (pattern[index] === pattern[matched]) {
      matched++;
    }
    prefix[index] = matched;
  }

  matched = 0;
  for (let index = left.length - length; index < left.length; index++) {
    while (matched > 0 && left[index] !== pattern[matched]) {
      matched = prefix[matched - 1] ?? 0;
    }
    if (left[index] === pattern[matched]) {
      matched++;
    }
    if (matched === pattern.length && index < left.length - 1) {
      matched = prefix[matched - 1] ?? 0;
    }
  }
  return matched;
};

/** Extract substantial deletion/insertion overlaps as equalities. */
const extractOverlaps = (diffs: readonly GraphemeDiff[]): GraphemeDiff[] => {
  const result: GraphemeDiff[] = [];

  for (const current of diffs) {
    const deletionDiff = result[result.length - 1];
    if (deletionDiff?.[0] !== DELETE || current[0] !== INSERT) {
      result.push(current);
      continue;
    }

    const deletion = deletionDiff[1];
    const insertion = current[1];
    const forward = commonOverlapLength(deletion, insertion);
    const reverse = commonOverlapLength(insertion, deletion);

    if (forward >= reverse) {
      if (forward >= deletion.length / 2 || forward >= insertion.length / 2) {
        result.pop();
        result.push(
          [DELETE, deletion.slice(0, deletion.length - forward)],
          [EQUAL, insertion.slice(0, forward)],
          [INSERT, insertion.slice(forward)],
        );
        continue;
      }
    } else if (reverse >= deletion.length / 2 || reverse >= insertion.length / 2) {
      result.pop();
      result.push(
        [INSERT, insertion.slice(0, insertion.length - reverse)],
        [EQUAL, deletion.slice(0, reverse)],
        [DELETE, deletion.slice(reverse)],
      );
      continue;
    }

    result.push(current);
  }

  return result;
};

/** Apply semantic cleanup to grapheme tokens without splitting a token or mutating the input. */
export const cleanupSemantic = (diffs: readonly Diff[], options: SegmentOptions = {}): readonly Diff[] => {
  let working = cleanupMerge(diffs);

  if (eliminateTrivialEqualities(working)) {
    working = cleanupMerge(working);
  }

  const wordSegmenter = new Intl.Segmenter(options.locale, { granularity: 'word' });
  cleanupSemanticLossless(working, wordSegmenter);
  return compactOwned(extractOverlaps(working));
};

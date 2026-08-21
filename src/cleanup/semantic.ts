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

import { DELETE, EQUAL, INSERT, type Diff } from '../types.js';
import { compactOwned, commonSuffixLength, type GraphemeDiff } from './common.js';
import { CleanupWorklist } from './worklist.js';

const NO_NODE = -1;

/** Eliminate equalities that are no larger than the edits on either side. */
export const eliminateSemanticEqualities = (diffs: CleanupWorklist): number[] => {
  const changedNodes: number[] = [];
  const equalities: number[] = [];
  const insertionRuns: number[] = [0];
  const deletionRuns: number[] = [0];
  let pointer = diffs.first;

  // Treat the normalized list as alternating maximal edit runs and
  // equalities. Cached run lengths let a backtracked candidate be reconsidered
  // without traversing the same edits again.
  while (pointer !== NO_NODE && (diffs.entry(pointer) as GraphemeDiff)[0] !== EQUAL) {
    const current = diffs.entry(pointer) as GraphemeDiff;
    if (current[0] === INSERT) {
      insertionRuns[0] = (insertionRuns[0] as number) + current[1].length;
    } else {
      deletionRuns[0] = (deletionRuns[0] as number) + current[1].length;
    }
    pointer = diffs.next(pointer);
  }

  while (pointer !== NO_NODE) {
    const equalityIndex = pointer;
    let insertionsAfter = 0;
    let deletionsAfter = 0;
    pointer = diffs.next(pointer);
    while (pointer !== NO_NODE && (diffs.entry(pointer) as GraphemeDiff)[0] !== EQUAL) {
      const current = diffs.entry(pointer) as GraphemeDiff;
      if (current[0] === INSERT) {
        insertionsAfter += current[1].length;
      } else {
        deletionsAfter += current[1].length;
      }
      pointer = diffs.next(pointer);
    }

    equalities.push(equalityIndex);
    insertionRuns.push(insertionsAfter);
    deletionRuns.push(deletionsAfter);

    while (equalities.length > 0) {
      const candidateIndex = equalities[equalities.length - 1] as number;
      const equality = diffs.entry(candidateIndex) as GraphemeDiff;
      const rightRun = insertionRuns.length - 1;
      const leftRun = rightRun - 1;
      if (
        equality[1].length > Math.max(insertionRuns[leftRun] as number, deletionRuns[leftRun] as number) ||
        equality[1].length > Math.max(insertionRuns[rightRun] as number, deletionRuns[rightRun] as number)
      ) {
        break;
      }

      const equalityLength = equality[1].length;
      diffs.setOperation(candidateIndex, DELETE);
      diffs.insertAfter(candidateIndex, INSERT, equality[1].slice());
      changedNodes.push(candidateIndex);
      equalities.pop();
      // Replacing an equality contributes its tokens to both edit kinds and
      // joins its surrounding runs. Retest the preceding stack candidate
      // against the combined totals.
      insertionRuns[leftRun] = (insertionRuns[leftRun] as number) + equalityLength + (insertionRuns.pop() as number);
      deletionRuns[leftRun] = (deletionRuns[leftRun] as number) + equalityLength + (deletionRuns.pop() as number);
    }
  }

  return changedNodes;
};

const whitespacePattern = /^\s+$/u;
const punctuationPattern = /[\p{P}\p{S}]/u;

const LINE_BREAK = 1;
const WHITESPACE = 2;
const PUNCTUATION = 4;

type TokenSpans = readonly [left: readonly string[], edit: readonly string[], right: readonly string[]];

const spanToken = (spans: TokenSpans, index: number): string => {
  const left = spans[0];
  if (index < left.length) {
    return left[index] as string;
  }

  const edit = spans[1];
  const editIndex = index - left.length;
  if (editIndex < edit.length) {
    return edit[editIndex] as string;
  }

  return spans[2][editIndex - edit.length] as string;
};

const spanLength = (spans: TokenSpans): number => spans[0].length + spans[1].length + spans[2].length;

const spanText = (spans: TokenSpans): string => spans[0].join('') + spans[1].join('') + spans[2].join('');

const appendSpanRange = (target: string[], spans: TokenSpans, start: number, end: number): void => {
  let spanStart = 0;
  for (const source of spans) {
    const sourceStart = Math.max(0, start - spanStart);
    const sourceEnd = Math.min(source.length, end - spanStart);
    for (let index = sourceStart; index < sourceEnd; index++) {
      target.push(source[index] as string);
    }
    spanStart += source.length;
    if (spanStart >= end) {
      return;
    }
  }
};

const copySpanRange = (spans: TokenSpans, start: number, end: number): string[] => {
  const result: string[] = [];
  appendSpanRange(result, spans, start, end);
  return result;
};

const classifyToken = (token: string | undefined, classifications: Map<string, number>): number => {
  if (token === undefined) {
    return 0;
  }

  const cached = classifications.get(token);
  if (cached !== undefined) {
    return cached;
  }

  let classification = 0;
  if (token.includes('\r') || token.includes('\n')) {
    classification |= LINE_BREAK;
  }
  if (whitespacePattern.test(token)) {
    classification |= WHITESPACE;
  }
  if (punctuationPattern.test(token)) {
    classification |= PUNCTUATION;
  }
  classifications.set(token, classification);
  return classification;
};

const wordBoundaryOffsets = (text: string, wordSegmenter: Intl.Segmenter): Set<number> => {
  const wordBoundaries = new Set<number>();
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike) {
      wordBoundaries.add(segment.index);
      wordBoundaries.add(segment.index + segment.segment.length);
    }
  }
  return wordBoundaries;
};

/** Compute the DMP-style quality score for one reachable grapheme cut. */
const boundaryScore = (
  spans: TokenSpans,
  regionLength: number,
  cut: number,
  offset: number,
  wordBoundaries: ReadonlySet<number>,
  classifications: Map<string, number>,
): number => {
  if (cut === 0 || cut === regionLength) {
    return 6;
  }

  const previous = classifyToken(spanToken(spans, cut - 1), classifications);
  const next = classifyToken(spanToken(spans, cut), classifications);
  const previousLineBreak = (previous & LINE_BREAK) !== 0;
  const nextLineBreak = (next & LINE_BREAK) !== 0;
  const previousWhitespace = (previous & WHITESPACE) !== 0;
  const nextWhitespace = (next & WHITESPACE) !== 0;
  const previousPunctuation = (previous & PUNCTUATION) !== 0;
  const nextPunctuation = (next & PUNCTUATION) !== 0;
  const blankLine =
    (previousLineBreak &&
      (classifyToken(cut > 1 ? spanToken(spans, cut - 2) : undefined, classifications) & LINE_BREAK) !== 0) ||
    (nextLineBreak &&
      (classifyToken(cut + 1 < regionLength ? spanToken(spans, cut + 1) : undefined, classifications) & LINE_BREAK) !==
        0);

  if (blankLine) {
    return 5;
  }
  if (previousLineBreak || nextLineBreak) {
    return 4;
  }
  if (previousPunctuation && !previousWhitespace && nextWhitespace) {
    return 3;
  }
  if (wordBoundaries.has(offset) || previousWhitespace || nextWhitespace) {
    return 2;
  }
  return previousPunctuation || nextPunctuation ? 1 : 0;
};

/** Shift isolated edits across equivalent text to the best semantic cuts. */
const cleanupSemanticLossless = (diffs: GraphemeDiff[], wordSegmenter: Intl.Segmenter): void => {
  let classifications: Map<string, number> | undefined;
  let pointer = 1;

  while (pointer < diffs.length - 1) {
    const left = diffs[pointer - 1] as GraphemeDiff;
    const edit = diffs[pointer] as GraphemeDiff;
    const right = diffs[pointer + 1] as GraphemeDiff;
    if (left[0] !== EQUAL || edit[0] === EQUAL || right[0] !== EQUAL) {
      pointer++;
      continue;
    }

    const commonLength = commonSuffixLength(left[1], edit[1]);
    if (commonLength === 0 && edit[1][0] !== right[1][0]) {
      pointer++;
      continue;
    }

    const spans: TokenSpans = [left[1], edit[1], right[1]];
    const regionLength = spanLength(spans);
    const editLength = edit[1].length;
    const initialFirstCut = left[1].length - commonLength;
    const initialSecondCut = initialFirstCut + editLength;
    let maximumShift = 0;
    while (
      initialSecondCut + maximumShift < regionLength &&
      spanToken(spans, initialFirstCut + maximumShift) === spanToken(spans, initialSecondCut + maximumShift)
    ) {
      maximumShift++;
    }
    if (maximumShift === 0) {
      pointer++;
      continue;
    }

    const wordBoundaries = wordBoundaryOffsets(spanText(spans), wordSegmenter);
    classifications ??= new Map<string, number>();
    let firstOffset = 0;
    for (let index = 0; index < initialFirstCut; index++) {
      firstOffset += spanToken(spans, index).length;
    }
    let secondOffset = firstOffset;
    for (let index = initialFirstCut; index < initialSecondCut; index++) {
      secondOffset += spanToken(spans, index).length;
    }

    let bestShift = 0;
    let bestScore =
      boundaryScore(spans, regionLength, initialFirstCut, firstOffset, wordBoundaries, classifications) +
      boundaryScore(spans, regionLength, initialSecondCut, secondOffset, wordBoundaries, classifications);

    for (let shift = 1; shift <= maximumShift; shift++) {
      firstOffset += spanToken(spans, initialFirstCut + shift - 1).length;
      secondOffset += spanToken(spans, initialSecondCut + shift - 1).length;
      const score =
        boundaryScore(spans, regionLength, initialFirstCut + shift, firstOffset, wordBoundaries, classifications) +
        boundaryScore(spans, regionLength, initialSecondCut + shift, secondOffset, wordBoundaries, classifications);
      // Match DMP's preference for a later cut when two positions tie.
      if (score >= bestScore) {
        bestScore = score;
        bestShift = shift;
      }
    }

    if (bestShift === commonLength) {
      pointer++;
      continue;
    }

    const firstCut = initialFirstCut + bestShift;
    const secondCut = firstCut + editLength;
    const bestLeft = copySpanRange(spans, 0, firstCut);
    const bestEdit = copySpanRange(spans, firstCut, secondCut);
    const bestRight = copySpanRange(spans, secondCut, regionLength);

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
    pointer++;
  }
};

/** Longest suffix of one token range that is also a prefix of another, in linear time. */
const commonOverlapLength = (
  left: readonly string[],
  leftStart: number,
  leftEnd: number,
  right: readonly string[],
  rightStart: number,
  rightEnd: number,
  prefix: Uint32Array,
): number => {
  const length = Math.min(leftEnd - leftStart, rightEnd - rightStart);
  if (length === 0) {
    return 0;
  }
  const patternEnd = rightStart + length;
  prefix[0] = 0;
  let matched = 0;

  for (let index = rightStart + 1; index < patternEnd; index++) {
    while (matched > 0 && right[index] !== right[rightStart + matched]) {
      matched = prefix[matched - 1] as number;
    }
    if (right[index] === right[rightStart + matched]) {
      matched++;
    }
    prefix[index - rightStart] = matched;
  }

  matched = 0;
  for (let index = leftEnd - length; index < leftEnd; index++) {
    while (matched > 0 && left[index] !== right[rightStart + matched]) {
      matched = prefix[matched - 1] as number;
    }
    if (left[index] === right[rightStart + matched]) {
      matched++;
    }
    if (matched === length && index < leftEnd - 1) {
      matched = prefix[matched - 1] as number;
    }
  }
  return matched;
};

/** Extract substantial deletion/insertion overlaps as equalities. */
const extractOverlaps = (diffs: readonly GraphemeDiff[]): GraphemeDiff[] => {
  const result: GraphemeDiff[] = [];
  let prefix = new Uint32Array(0);

  for (const current of diffs) {
    const deletionDiff = result[result.length - 1];
    if (deletionDiff?.[0] !== DELETE || current[0] !== INSERT) {
      result.push(current);
      continue;
    }

    const deletion = deletionDiff[1];
    const insertion = current[1];
    const length = Math.min(deletion.length, insertion.length);
    if (prefix.length < length) {
      prefix = new Uint32Array(length);
    }
    const forward = commonOverlapLength(deletion, 0, deletion.length, insertion, 0, insertion.length, prefix);
    const reverse = commonOverlapLength(insertion, 0, insertion.length, deletion, 0, deletion.length, prefix);

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

/** Run semantic cleanup with a word segmenter constructed by the public API. */
export const cleanupSemanticCore = (diffs: readonly Diff[], wordSegmenter: Intl.Segmenter): readonly Diff[] => {
  const worklist = new CleanupWorklist(diffs);
  worklist.cleanupShifts();

  const changedNodes = eliminateSemanticEqualities(worklist);
  if (changedNodes.length > 0) {
    worklist.cleanupChanged(changedNodes);
  }

  const working = worklist.toDiffs();
  cleanupSemanticLossless(working, wordSegmenter);
  return compactOwned(extractOverlaps(working));
};

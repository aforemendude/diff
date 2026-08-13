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
 * boundaries, avoid recursive/string-index operations, repair unsafe incoming
 * tuple boundaries, and return a new compact tuple array.
 */

import { diffTokens, type TokenDiff } from '../algorithm/myers';
import { tokenizeGraphemes } from '../tokenize/graphemes';
import { DELETE, EQUAL, INSERT, type Diff, type DiffOperation, type SegmentOptions } from '../types';

type GraphemeDiff = TokenDiff<string>;

const append = (diffs: GraphemeDiff[], operation: DiffOperation, tokens: readonly string[]): void => {
  if (tokens.length === 0) {
    return;
  }

  const previous = diffs[diffs.length - 1];
  if (previous !== undefined && previous[0] === operation) {
    for (const token of tokens) {
      previous[1].push(token);
    }
  } else {
    diffs.push([operation, tokens.slice()]);
  }
};

const commonPrefixLength = (left: readonly string[], right: readonly string[]): number => {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[length] === right[length]) {
    length++;
  }
  return length;
};

const commonSuffixLength = (left: readonly string[], right: readonly string[]): number => {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[left.length - length - 1] === right[right.length - length - 1]) {
    length++;
  }
  return length;
};

const startsWith = (tokens: readonly string[], prefix: readonly string[]): boolean => {
  if (prefix.length > tokens.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index++) {
    if (tokens[index] !== prefix[index]) {
      return false;
    }
  }
  return true;
};

const endsWith = (tokens: readonly string[], suffix: readonly string[]): boolean => {
  if (suffix.length > tokens.length) {
    return false;
  }
  const offset = tokens.length - suffix.length;
  for (let index = 0; index < suffix.length; index++) {
    if (tokens[offset + index] !== suffix[index]) {
      return false;
    }
  }
  return true;
};

const equalTokens = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((token, index) => token === right[index]);

const coalesce = (diffs: readonly GraphemeDiff[]): GraphemeDiff[] => {
  const result: GraphemeDiff[] = [];
  for (const [operation, tokens] of diffs) {
    append(result, operation, tokens);
  }
  return result;
};

/** Merge edit runs and factor common grapheme prefixes and suffixes. */
const mergeEditBlocks = (diffs: readonly GraphemeDiff[]): GraphemeDiff[] => {
  const merged: GraphemeDiff[] = [];
  let pointer = 0;

  while (pointer < diffs.length) {
    const current = diffs[pointer];
    if (current === undefined) {
      break;
    }
    if (current[0] === EQUAL) {
      append(merged, EQUAL, current[1]);
      pointer++;
      continue;
    }

    const deletions: string[] = [];
    const insertions: string[] = [];
    while (pointer < diffs.length && diffs[pointer]?.[0] !== EQUAL) {
      const edit = diffs[pointer];
      if (edit === undefined) {
        break;
      }
      if (edit[0] === DELETE) {
        for (const token of edit[1]) {
          deletions.push(token);
        }
      } else {
        for (const token of edit[1]) {
          insertions.push(token);
        }
      }
      pointer++;
    }

    const prefixLength = commonPrefixLength(deletions, insertions);
    const maximumSuffix = Math.min(deletions.length, insertions.length) - prefixLength;
    let suffixLength = commonSuffixLength(deletions, insertions);
    suffixLength = Math.min(suffixLength, maximumSuffix);

    append(merged, EQUAL, insertions.slice(0, prefixLength));
    append(merged, DELETE, deletions.slice(prefixLength, deletions.length - suffixLength));
    append(merged, INSERT, insertions.slice(prefixLength, insertions.length - suffixLength));
    append(merged, EQUAL, insertions.slice(insertions.length - suffixLength));
  }

  return merged;
};

/** DMP-style normalization, including shifts that eliminate an equality. */
const cleanupMerge = (diffs: readonly GraphemeDiff[]): GraphemeDiff[] => {
  let merged = mergeEditBlocks(diffs);

  while (true) {
    let shifted = false;
    for (let pointer = 1; pointer < merged.length - 1; pointer++) {
      const left = merged[pointer - 1];
      const edit = merged[pointer];
      const right = merged[pointer + 1];
      if (left?.[0] !== EQUAL || edit === undefined || edit[0] === EQUAL || right?.[0] !== EQUAL) {
        continue;
      }

      if (endsWith(edit[1], left[1])) {
        const shiftedEdit = left[1].concat(edit[1].slice(0, edit[1].length - left[1].length));
        const shiftedEquality = left[1].concat(right[1]);
        merged.splice(pointer - 1, 3, [edit[0], shiftedEdit], [EQUAL, shiftedEquality]);
        shifted = true;
        break;
      }

      if (startsWith(edit[1], right[1])) {
        const shiftedEquality = left[1].concat(right[1]);
        const shiftedEdit = edit[1].slice(right[1].length).concat(right[1]);
        merged.splice(pointer - 1, 3, [EQUAL, shiftedEquality], [edit[0], shiftedEdit]);
        shifted = true;
        break;
      }
    }

    if (!shifted) {
      return merged;
    }
    merged = mergeEditBlocks(merged);
  }
};

const boundaryMap = (tokens: readonly string[]): Map<number, number> => {
  const boundaries = new Map<number, number>([[0, 0]]);
  let offset = 0;
  for (let index = 0; index < tokens.length; index++) {
    offset += tokens[index]?.length ?? 0;
    boundaries.set(offset, index + 1);
  }
  return boundaries;
};

/**
 * Convert public tuples to grapheme-token tuples. If a caller supplied a tuple
 * boundary inside a grapheme, recompute the shortest safe diff from the two
 * reconstructed texts instead of retaining that unsafe boundary.
 */
const prepare = (diffs: readonly Diff[], options: SegmentOptions): GraphemeDiff[] => {
  const beforeParts: string[] = [];
  const afterParts: string[] = [];

  for (const [operation, text] of diffs) {
    if (operation !== DELETE && operation !== EQUAL && operation !== INSERT) {
      throw new TypeError(`Invalid diff operation: ${String(operation)}`);
    }
    if (operation !== INSERT) {
      beforeParts.push(text);
    }
    if (operation !== DELETE) {
      afterParts.push(text);
    }
  }

  const before = beforeParts.join('');
  const after = afterParts.join('');
  const beforeTokens = tokenizeGraphemes(before, options);
  const afterTokens = tokenizeGraphemes(after, options);
  const beforeBoundaries = boundaryMap(beforeTokens);
  const afterBoundaries = boundaryMap(afterTokens);
  const prepared: GraphemeDiff[] = [];
  let beforeOffset = 0;
  let afterOffset = 0;
  let safe = true;

  for (const [operation, text] of diffs) {
    const nextBeforeOffset = beforeOffset + (operation === INSERT ? 0 : text.length);
    const nextAfterOffset = afterOffset + (operation === DELETE ? 0 : text.length);
    const beforeStart = beforeBoundaries.get(beforeOffset);
    const beforeEnd = beforeBoundaries.get(nextBeforeOffset);
    const afterStart = afterBoundaries.get(afterOffset);
    const afterEnd = afterBoundaries.get(nextAfterOffset);

    if (beforeStart === undefined || beforeEnd === undefined || afterStart === undefined || afterEnd === undefined) {
      safe = false;
      break;
    }

    let tokens: string[];
    if (operation === INSERT) {
      tokens = afterTokens.slice(afterStart, afterEnd);
    } else if (operation === DELETE) {
      tokens = beforeTokens.slice(beforeStart, beforeEnd);
    } else {
      const tokensBefore = beforeTokens.slice(beforeStart, beforeEnd);
      const tokensAfter = afterTokens.slice(afterStart, afterEnd);
      if (!equalTokens(tokensBefore, tokensAfter)) {
        safe = false;
        break;
      }
      tokens = tokensBefore;
    }

    append(prepared, operation, tokens);
    beforeOffset = nextBeforeOffset;
    afterOffset = nextAfterOffset;
  }

  if (!safe || beforeOffset !== before.length || afterOffset !== after.length) {
    return diffTokens(beforeTokens, afterTokens);
  }

  return prepared;
};

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

const isLineBreak = (token: string | undefined): boolean => token !== undefined && /[\r\n]/u.test(token);
const isWhitespace = (token: string | undefined): boolean => token !== undefined && whitespacePattern.test(token);
const isPunctuation = (token: string | undefined): boolean => token !== undefined && punctuationPattern.test(token);

/** Precompute the DMP-style quality score at every grapheme cut. */
const boundaryScores = (tokens: readonly string[], options: SegmentOptions): Uint8Array => {
  const text = tokens.join('');
  const wordBoundaries = new Set<number>();
  const wordSegmenter = new Intl.Segmenter(options.locale, { granularity: 'word' });
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
      const blankLine =
        (isLineBreak(previous) && isLineBreak(tokens[cut - 2])) || (isLineBreak(next) && isLineBreak(tokens[cut + 1]));

      if (blankLine) {
        scores[cut] = 5;
      } else if (isLineBreak(previous) || isLineBreak(next)) {
        scores[cut] = 4;
      } else if (isPunctuation(previous) && !isWhitespace(previous) && isWhitespace(next)) {
        scores[cut] = 3;
      } else if (wordBoundaries.has(offset) || isWhitespace(previous) || isWhitespace(next)) {
        scores[cut] = 2;
      } else if (isPunctuation(previous) || isPunctuation(next)) {
        scores[cut] = 1;
      }
    }
    offset += tokens[cut]?.length ?? 0;
  }
  return scores;
};

/** Shift isolated edits across equivalent text to the best semantic cuts. */
const cleanupSemanticLossless = (diffs: GraphemeDiff[], options: SegmentOptions): void => {
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
    const common = edit[1].slice(edit[1].length - commonLength);
    const baseLeft = left[1].slice(0, left[1].length - commonLength);
    const baseEdit = common.concat(edit[1].slice(0, edit[1].length - commonLength));
    const baseRight = common.concat(right[1]);
    const region = baseLeft.concat(baseEdit, baseRight);
    const editLength = baseEdit.length;
    const scores = boundaryScores(region, options);
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
const extractOverlaps = (diffs: GraphemeDiff[]): void => {
  let pointer = 1;
  while (pointer < diffs.length) {
    const deletionDiff = diffs[pointer - 1];
    const insertionDiff = diffs[pointer];
    if (deletionDiff?.[0] !== DELETE || insertionDiff?.[0] !== INSERT) {
      pointer++;
      continue;
    }

    const deletion = deletionDiff[1];
    const insertion = insertionDiff[1];
    const forward = commonOverlapLength(deletion, insertion);
    const reverse = commonOverlapLength(insertion, deletion);

    if (forward >= reverse) {
      if (forward >= deletion.length / 2 || forward >= insertion.length / 2) {
        diffs.splice(pointer, 0, [EQUAL, insertion.slice(0, forward)]);
        deletionDiff[1] = deletion.slice(0, deletion.length - forward);
        insertionDiff[1] = insertion.slice(forward);
        pointer++;
      }
    } else if (reverse >= deletion.length / 2 || reverse >= insertion.length / 2) {
      diffs.splice(pointer, 0, [EQUAL, deletion.slice(0, reverse)]);
      deletionDiff[0] = INSERT;
      deletionDiff[1] = insertion.slice(0, insertion.length - reverse);
      insertionDiff[0] = DELETE;
      insertionDiff[1] = deletion.slice(reverse);
      pointer++;
    }
    pointer++;
  }
};

const joinDiffs = (diffs: readonly GraphemeDiff[]): Diff[] =>
  diffs.map(([operation, tokens]) => [operation, tokens.join('')]);

/**
 * Apply Diff Match Patch-style semantic cleanup without ever splitting an
 * extended grapheme cluster. The input is not mutated.
 */
export const cleanupSemantic = (diffs: readonly Diff[], options: SegmentOptions = {}): readonly Diff[] => {
  let working = cleanupMerge(prepare(diffs, options));

  if (eliminateTrivialEqualities(working)) {
    working = cleanupMerge(working);
  }

  cleanupSemanticLossless(working, options);
  extractOverlaps(working);
  return joinDiffs(coalesce(working));
};

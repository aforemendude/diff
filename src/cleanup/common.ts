/*
 * Cleanup normalization derived from diff-match-patch-es v2.0.1 and Google
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
 * Modified to operate on grapheme-token arrays and return compact copies
 * instead of mutating public inputs.
 */

import type { TokenDiff } from '../algorithm/myers.js';
import { DELETE, EQUAL, INSERT, type Diff, type DiffOperation } from '../types.js';

export type GraphemeDiff = TokenDiff<string>;

const appendRange = (
  diffs: GraphemeDiff[],
  operation: DiffOperation,
  source: readonly string[],
  start: number,
  end: number,
): void => {
  if (start >= end) {
    return;
  }

  const previous = diffs[diffs.length - 1];
  if (previous !== undefined && previous[0] === operation) {
    for (let index = start; index < end; index++) {
      previous[1].push(source[index] as string);
    }
  } else {
    diffs.push([operation, source.slice(start, end)]);
  }
};

export const append = (diffs: GraphemeDiff[], operation: DiffOperation, tokens: readonly string[]): void =>
  appendRange(diffs, operation, tokens, 0, tokens.length);

export const commonPrefixLength = (left: readonly string[], right: readonly string[]): number => {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[length] === right[length]) {
    length++;
  }
  return length;
};

export const commonSuffixLength = (
  left: readonly string[],
  right: readonly string[],
  maximumLength = Math.min(left.length, right.length),
): number => {
  const limit = Math.min(left.length, right.length, maximumLength);
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

export const equalTokens = (left: readonly string[], right: readonly string[]): boolean => {
  const length = left.length;
  if (length !== right.length) {
    return false;
  }

  for (let index = 0; index < length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

export const coalesce = (diffs: readonly GraphemeDiff[]): GraphemeDiff[] => {
  const result: GraphemeDiff[] = [];
  for (const [operation, tokens] of diffs) {
    append(result, operation, tokens);
  }
  return result;
};

/** Compact exclusively owned working storage without copying surviving entries. */
export const compactOwned = (diffs: GraphemeDiff[]): GraphemeDiff[] => {
  let writeIndex = 0;

  for (let readIndex = 0; readIndex < diffs.length; readIndex++) {
    const current = diffs[readIndex] as GraphemeDiff;
    if (current[1].length === 0) {
      continue;
    }

    const previous = diffs[writeIndex - 1];
    if (previous !== undefined && previous[0] === current[0]) {
      for (const token of current[1]) {
        previous[1].push(token);
      }
    } else {
      diffs[writeIndex] = current;
      writeIndex++;
    }
  }

  diffs.length = writeIndex;
  return diffs;
};

/** Merge edit runs and factor common grapheme prefixes and suffixes. */
const mergeEditBlocks = (diffs: readonly Diff[]): GraphemeDiff[] => {
  const merged: GraphemeDiff[] = [];
  let pointer = 0;

  while (pointer < diffs.length) {
    const current = diffs[pointer] as Diff;
    if (current[1].length === 0) {
      pointer++;
      continue;
    }
    if (current[0] === EQUAL) {
      append(merged, EQUAL, current[1]);
      pointer++;
      continue;
    }

    const blockEdits: Diff[] = [];
    let blockOperation: typeof DELETE | typeof INSERT | undefined;
    let hasMixedOperations = false;
    while (pointer < diffs.length) {
      const edit = diffs[pointer] as Diff;
      if (edit[1].length === 0) {
        pointer++;
        continue;
      }
      if (edit[0] === EQUAL) {
        break;
      }
      if (blockOperation === undefined) {
        blockOperation = edit[0];
      } else if (blockOperation !== edit[0]) {
        hasMixedOperations = true;
      }
      blockEdits.push(edit);
      pointer++;
    }

    if (!hasMixedOperations) {
      for (const edit of blockEdits) {
        append(merged, edit[0], edit[1]);
      }
      continue;
    }

    const deletions: string[] = [];
    const insertions: string[] = [];
    for (const edit of blockEdits) {
      if (edit[0] === DELETE) {
        for (const token of edit[1]) {
          deletions.push(token);
        }
      } else {
        for (const token of edit[1]) {
          insertions.push(token);
        }
      }
    }

    const prefixLength = commonPrefixLength(deletions, insertions);
    const maximumSuffix = Math.min(deletions.length, insertions.length) - prefixLength;
    const suffixLength = commonSuffixLength(deletions, insertions, maximumSuffix);

    appendRange(merged, EQUAL, insertions, 0, prefixLength);
    appendRange(merged, DELETE, deletions, prefixLength, deletions.length - suffixLength);
    appendRange(merged, INSERT, insertions, prefixLength, insertions.length - suffixLength);
    appendRange(merged, EQUAL, insertions, insertions.length - suffixLength, insertions.length);
  }

  return merged;
};

/** DMP-style normalization, including shifts that eliminate an equality. */
export const cleanupMerge = (diffs: readonly Diff[]): GraphemeDiff[] => {
  let merged = mergeEditBlocks(diffs);

  while (true) {
    let shifted = false;
    for (let pointer = 1; pointer < merged.length - 1; pointer++) {
      const left = merged[pointer - 1] as GraphemeDiff;
      const edit = merged[pointer] as GraphemeDiff;
      const right = merged[pointer + 1] as GraphemeDiff;
      if (left[0] !== EQUAL || edit[0] === EQUAL || right[0] !== EQUAL) {
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

/*
 * Cleanup normalization derived from diff-match-patch-es v2.0.1 and Google Diff Match and Patch.
 *
 * Copyright 2018 The diff-match-patch Authors. Original implementation by Neil Fraser; TypeScript/ES module rewrite by
 * Anthony Fu. See https://github.com/google/diff-match-patch and https://github.com/antfu/diff-match-patch-es.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 *
 * Modified to operate on grapheme-token arrays and return compact copies instead of mutating public inputs.
 */

import { DELETE, EQUAL, INSERT, type Diff, type DiffOperation } from '../types.js';
import { append, appendRange, type GraphemeDiff } from './common.js';

type TokenChunks = readonly (readonly string[])[];

const commonChunkPrefixLength = (left: TokenChunks, right: TokenChunks): number => {
  let leftChunk = 0;
  let leftOffset = 0;
  let rightChunk = 0;
  let rightOffset = 0;
  let length = 0;

  while (leftChunk < left.length && rightChunk < right.length) {
    const leftTokens = left[leftChunk] as readonly string[];
    const rightTokens = right[rightChunk] as readonly string[];
    if (leftTokens[leftOffset] !== rightTokens[rightOffset]) {
      break;
    }
    length++;
    leftOffset++;
    rightOffset++;
    if (leftOffset === leftTokens.length) {
      leftChunk++;
      leftOffset = 0;
    }
    if (rightOffset === rightTokens.length) {
      rightChunk++;
      rightOffset = 0;
    }
  }
  return length;
};

const commonChunkSuffixLength = (left: TokenChunks, right: TokenChunks, maximumLength: number): number => {
  let leftChunk = left.length - 1;
  let rightChunk = right.length - 1;
  let leftOffset = (left[leftChunk]?.length ?? 0) - 1;
  let rightOffset = (right[rightChunk]?.length ?? 0) - 1;
  let length = 0;

  while (leftChunk >= 0 && rightChunk >= 0 && length < maximumLength) {
    const leftTokens = left[leftChunk] as readonly string[];
    const rightTokens = right[rightChunk] as readonly string[];
    if (leftTokens[leftOffset] !== rightTokens[rightOffset]) {
      break;
    }
    length++;
    leftOffset--;
    rightOffset--;
    if (leftOffset < 0) {
      leftChunk--;
      leftOffset = (left[leftChunk]?.length ?? 0) - 1;
    }
    if (rightOffset < 0) {
      rightChunk--;
      rightOffset = (right[rightChunk]?.length ?? 0) - 1;
    }
  }
  return length;
};

const appendChunkRange = (
  diffs: GraphemeDiff[],
  operation: DiffOperation,
  chunks: TokenChunks,
  start: number,
  end: number,
): void => {
  let chunkStart = 0;
  for (const chunk of chunks) {
    const sourceStart = Math.max(0, start - chunkStart);
    const sourceEnd = Math.min(chunk.length, end - chunkStart);
    appendRange(diffs, operation, chunk, sourceStart, sourceEnd);
    chunkStart += chunk.length;
    if (chunkStart >= end) {
      return;
    }
  }
};

/** Merge edit runs and factor common grapheme prefixes and suffixes. */
export const mergeEditBlocks = (diffs: readonly Diff[]): GraphemeDiff[] => {
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

    let deletionChunks: (readonly string[])[] | undefined;
    let insertionChunks: (readonly string[])[] | undefined;
    let deletionLength = 0;
    let insertionLength = 0;
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
      if (edit[0] === DELETE) {
        (deletionChunks ??= []).push(edit[1]);
        deletionLength += edit[1].length;
      } else {
        (insertionChunks ??= []).push(edit[1]);
        insertionLength += edit[1].length;
      }
      pointer++;
    }

    if (!hasMixedOperations) {
      const chunks = (blockOperation === DELETE ? deletionChunks : insertionChunks) as (readonly string[])[];
      for (const chunk of chunks) {
        append(merged, blockOperation as typeof DELETE | typeof INSERT, chunk);
      }
      continue;
    }

    const deletions = deletionChunks as (readonly string[])[];
    const insertions = insertionChunks as (readonly string[])[];
    const prefixLength = commonChunkPrefixLength(deletions, insertions);
    const maximumSuffix = Math.min(deletionLength, insertionLength) - prefixLength;
    const suffixLength = commonChunkSuffixLength(deletions, insertions, maximumSuffix);

    appendChunkRange(merged, EQUAL, insertions, 0, prefixLength);
    appendChunkRange(merged, DELETE, deletions, prefixLength, deletionLength - suffixLength);
    appendChunkRange(merged, INSERT, insertions, prefixLength, insertionLength - suffixLength);
    appendChunkRange(merged, EQUAL, insertions, insertionLength - suffixLength, insertionLength);
  }

  return merged;
};

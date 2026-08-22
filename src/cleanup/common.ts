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

import type { TokenDiff } from '../algorithm/myers.js';
import type { DiffOperation } from '../types.js';

export type GraphemeDiff = TokenDiff<string>;

export const appendRange = (
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

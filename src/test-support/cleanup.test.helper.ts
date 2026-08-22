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
 * Test-only reference helpers for grapheme-token cleanup normalization.
 */

import type { GraphemeDiff } from '../cleanup/common';
import { append } from '../cleanup/common';
import { CleanupWorklist } from '../cleanup/worklist';
import type { Diff } from '../types';

export const commonPrefixLength = (left: readonly string[], right: readonly string[]): number => {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[length] === right[length]) {
    length++;
  }
  return length;
};

export const equalTokens = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((token, index) => token === right[index]);
};

export const coalesce = (diffs: readonly GraphemeDiff[]): GraphemeDiff[] => {
  const result: GraphemeDiff[] = [];
  for (const [operation, tokens] of diffs) {
    append(result, operation, tokens);
  }
  return result;
};

/** DMP-style normalization, including shifts that eliminate an equality. */
export const cleanupMerge = (diffs: readonly Diff[]): GraphemeDiff[] => {
  const worklist = new CleanupWorklist(diffs);
  worklist.cleanupShifts();
  return worklist.toDiffs();
};

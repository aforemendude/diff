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

import type { Diff } from '../types.js';
import type { GraphemeDiff } from './common.js';
import { CleanupWorklist } from './worklist.js';

/** DMP-style normalization, including shifts that eliminate an equality. */
export const cleanupMerge = (diffs: readonly Diff[]): GraphemeDiff[] => {
  const worklist = new CleanupWorklist(diffs);
  worklist.cleanupShifts();
  return worklist.toDiffs();
};

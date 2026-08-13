/*
 * Efficiency cleanup derived from diff-match-patch-es v2.0.1 and Google
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
 * Modified to measure edit cost in grapheme tokens and return a new compact
 * tuple array.
 */

import { DELETE, EQUAL, INSERT, type CleanupEfficiencyOptions, type Diff } from '../types';
import { cleanupMerge, prepare, type GraphemeDiff } from './common';

/** Eliminate operationally trivial equalities using the DMP edit-cost model. */
const eliminateTrivialEqualities = (diffs: GraphemeDiff[], editCost: number): boolean => {
  let changed = false;
  const equalities: number[] = [];
  let lastEquality: string[] | undefined;
  let pointer = 0;
  let insertionBefore = false;
  let deletionBefore = false;
  let insertionAfter = false;
  let deletionAfter = false;

  while (pointer < diffs.length) {
    const current = diffs[pointer];
    if (current === undefined) {
      break;
    }

    if (current[0] === EQUAL) {
      if (current[1].length < editCost && (insertionAfter || deletionAfter)) {
        equalities.push(pointer);
        insertionBefore = insertionAfter;
        deletionBefore = deletionAfter;
        lastEquality = current[1];
      } else {
        equalities.length = 0;
        lastEquality = undefined;
      }
      insertionAfter = false;
      deletionAfter = false;
    } else {
      if (current[0] === DELETE) {
        deletionAfter = true;
      } else {
        insertionAfter = true;
      }

      const surroundingEditKinds =
        Number(insertionBefore) + Number(deletionBefore) + Number(insertionAfter) + Number(deletionAfter);
      const shouldEliminate =
        lastEquality !== undefined &&
        (surroundingEditKinds === 4 || (lastEquality.length < editCost / 2 && surroundingEditKinds === 3));

      if (shouldEliminate) {
        const equalityIndex = equalities[equalities.length - 1];
        if (equalityIndex === undefined || lastEquality === undefined) {
          break;
        }

        diffs.splice(equalityIndex, 0, [DELETE, lastEquality.slice()]);
        diffs[equalityIndex + 1] = [INSERT, lastEquality.slice()];
        equalities.pop();
        lastEquality = undefined;

        if (insertionBefore && deletionBefore) {
          insertionAfter = true;
          deletionAfter = true;
          equalities.length = 0;
        } else {
          equalities.pop();
          pointer = equalities.length > 0 ? (equalities[equalities.length - 1] ?? -1) : -1;
          insertionAfter = false;
          deletionAfter = false;
        }
        changed = true;
      }
    }
    pointer++;
  }

  return changed;
};

/** Apply efficiency cleanup to grapheme tokens without splitting a token or mutating the input. */
export const cleanupEfficiency = (diffs: readonly Diff[], options: CleanupEfficiencyOptions = {}): readonly Diff[] => {
  const editCost = options.editCost ?? 4;
  if (!Number.isFinite(editCost) || editCost < 0) {
    throw new RangeError('editCost must be a finite, non-negative number');
  }

  let working = cleanupMerge(prepare(diffs));

  if (eliminateTrivialEqualities(working, editCost)) {
    working = cleanupMerge(working);
  }

  return working;
};

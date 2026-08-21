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

import { DELETE, EQUAL, INSERT, type Diff } from '../types.js';
import type { GraphemeDiff } from './common.js';
import { CleanupWorklist } from './worklist.js';

const NO_NODE = -1;
const INSERTION_KIND = 1;
const DELETION_KIND = 2;
const BOTH_EDIT_KINDS = INSERTION_KIND | DELETION_KIND;
const EDIT_KIND_COUNTS = [0, 1, 1, 2] as const;

/** Eliminate operationally trivial equalities using the DMP edit-cost model. */
export const eliminateEfficiencyEqualities = (diffs: CleanupWorklist, editCost: number): number[] => {
  const changedNodes: number[] = [];
  const equalities: number[] = [];
  const editRuns: number[] = [0];
  let pointer = diffs.first;

  // Treat the normalized list as alternating maximal edit runs and
  // equalities. Run masks let a backtracked candidate be reconsidered without
  // traversing the same edits again.
  while (pointer !== NO_NODE && (diffs.entry(pointer) as GraphemeDiff)[0] !== EQUAL) {
    const current = diffs.entry(pointer) as GraphemeDiff;
    editRuns[0] = (editRuns[0] as number) | (current[0] === DELETE ? DELETION_KIND : INSERTION_KIND);
    pointer = diffs.next(pointer);
  }

  while (pointer !== NO_NODE) {
    const equalityIndex = pointer;
    const equality = diffs.entry(equalityIndex) as GraphemeDiff;
    let editsAfter = 0;
    pointer = diffs.next(pointer);
    while (pointer !== NO_NODE && (diffs.entry(pointer) as GraphemeDiff)[0] !== EQUAL) {
      const current = diffs.entry(pointer) as GraphemeDiff;
      editsAfter |= current[0] === DELETE ? DELETION_KIND : INSERTION_KIND;
      pointer = diffs.next(pointer);
    }

    const editsBefore = editRuns[editRuns.length - 1] as number;
    if (equality[1].length >= editCost || editsBefore === 0) {
      equalities.length = 0;
      editRuns.length = 1;
      editRuns[0] = editsAfter;
      continue;
    }

    equalities.push(equalityIndex);
    editRuns.push(editsAfter);

    while (equalities.length > 0) {
      const candidateIndex = equalities[equalities.length - 1] as number;
      const candidate = diffs.entry(candidateIndex) as GraphemeDiff;
      const rightRun = editRuns.length - 1;
      const leftRun = rightRun - 1;
      const leftKinds = editRuns[leftRun] as number;
      const surroundingEditKinds =
        (EDIT_KIND_COUNTS[leftKinds] as number) + (EDIT_KIND_COUNTS[editRuns[rightRun] as number] as number);
      if (surroundingEditKinds !== 4 && (candidate[1].length >= editCost / 2 || surroundingEditKinds !== 3)) {
        break;
      }

      diffs.setOperation(candidateIndex, DELETE);
      diffs.insertAfter(candidateIndex, INSERT, candidate[1].slice());
      changedNodes.push(candidateIndex);
      equalities.pop();
      editRuns.pop();
      // Replacing an equality contributes both edit kinds and joins its two
      // surrounding runs. The previous stack candidate can be tested against
      // that aggregate immediately.
      editRuns[leftRun] = BOTH_EDIT_KINDS;

      if (leftKinds === BOTH_EDIT_KINDS) {
        equalities.length = 0;
        editRuns.length = 1;
        editRuns[0] = BOTH_EDIT_KINDS;
        break;
      }
    }
  }

  return changedNodes;
};

/** Run efficiency cleanup with an edit cost admitted by the public API. */
export const cleanupEfficiencyCore = (diffs: readonly Diff[], editCost: number): readonly Diff[] => {
  const worklist = new CleanupWorklist(diffs);
  worklist.cleanupShifts();

  if (editCost <= 1) {
    return worklist.toDiffs();
  }

  const changedNodes = eliminateEfficiencyEqualities(worklist, editCost);
  if (changedNodes.length > 0) {
    worklist.cleanupChanged(changedNodes);
  }

  return worklist.toDiffs();
};

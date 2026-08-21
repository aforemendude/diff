/*
 * Diff core derived from the `diffMain`, `diffCompute`, and `diffBisect` algorithms in diff-match-patch-es v2.0.1,
 * itself based on Google's Diff Match and Patch implementation.
 *
 * Copyright 2018 The diff-match-patch Authors. https://github.com/google/diff-match-patch
 * https://github.com/antfu/diff-match-patch-es
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
 * Modified to operate on generic token arrays, remove deadlines and other heuristic limits, use range indices instead
 * of substring copies, and use an explicit work stack instead of recursive calls.
 */

import { DELETE, EQUAL, INSERT, type DiffAlgorithm, type DiffOperation } from '../types.js';
import {
  createMyersWorkspace,
  getPrefixTable,
  growFrontiers,
  prepareFrontiers,
  resetFrontiers,
  type MyersWorkspace,
} from './myers-workspace.js';
import { tryAppendSparseMatchDiff } from './sparse-match.js';

export type TokenDiff<T> = [operation: DiffOperation, tokens: T[]];

interface RangeTask {
  readonly kind: 'range';
  readonly beforeStart: number;
  readonly beforeEnd: number;
  readonly afterStart: number;
  readonly afterEnd: number;
}

interface EqualTask {
  readonly kind: 'equal';
  readonly start: number;
  readonly end: number;
}

type Task = RangeTask | EqualTask;

interface Split {
  readonly before: number;
  readonly after: number;
}

const frontierValue = (frontier: Uint32Array, index: number): number => (frontier[index] as number) - 1;

const commonPrefixLength = <T>(
  before: readonly T[],
  beforeStart: number,
  beforeEnd: number,
  after: readonly T[],
  afterStart: number,
  afterEnd: number,
): number => {
  const length = Math.min(beforeEnd - beforeStart, afterEnd - afterStart);
  let common = 0;

  while (common < length && before[beforeStart + common] === after[afterStart + common]) {
    common++;
  }

  return common;
};

const commonSuffixLength = <T>(
  before: readonly T[],
  beforeStart: number,
  beforeEnd: number,
  after: readonly T[],
  afterStart: number,
  afterEnd: number,
): number => {
  const length = Math.min(beforeEnd - beforeStart, afterEnd - afterStart);
  let common = 0;

  while (common < length && before[beforeEnd - common - 1] === after[afterEnd - common - 1]) {
    common++;
  }

  return common;
};

/** Find the first interior occurrence of one trimmed token range in another in linear time. */
const findSubsequence = <T>(
  haystack: readonly T[],
  haystackStart: number,
  haystackEnd: number,
  needle: readonly T[],
  needleStart: number,
  needleEnd: number,
  workspace: MyersWorkspace,
): number => {
  const needleLength = needleEnd - needleStart;
  if (needleLength === 0) {
    return haystackStart;
  }

  const lengthDifference = haystackEnd - haystackStart - needleLength;
  if (lengthDifference < 2) {
    return -1;
  }

  const searchStart = haystackStart + 1;
  const searchEnd = haystackEnd - 1;

  if (lengthDifference === 2) {
    for (let index = 0; index < needleLength; index++) {
      if (haystack[searchStart + index] !== needle[needleStart + index]) {
        return -1;
      }
    }

    return searchStart;
  }

  if (needleLength === 1) {
    const token = needle[needleStart];
    for (let index = searchStart; index < searchEnd; index++) {
      if (haystack[index] === token) {
        return index;
      }
    }

    return -1;
  }

  const prefix = getPrefixTable(workspace, needleLength);
  let prefixLength = 0;

  for (let index = 1; index < needleLength; index++) {
    while (prefixLength > 0 && needle[needleStart + index] !== needle[needleStart + prefixLength]) {
      prefixLength = prefix[prefixLength - 1] as number;
    }

    if (needle[needleStart + index] === needle[needleStart + prefixLength]) {
      prefixLength++;
    }

    prefix[index] = prefixLength;
  }

  let matched = 0;
  for (let index = searchStart; index < searchEnd; index++) {
    while (matched > 0 && haystack[index] !== needle[needleStart + matched]) {
      matched = prefix[matched - 1] as number;
    }

    if (haystack[index] === needle[needleStart + matched]) {
      matched++;
      if (matched === needleLength) {
        return index - needleLength + 1;
      }
    }
  }

  return -1;
};

/**
 * Find an overlap between forward and reverse Myers searches. Coordinates in the returned split are absolute indices
 * into the original token arrays.
 */
const bisect = <T>(
  before: readonly T[],
  beforeStart: number,
  beforeEnd: number,
  after: readonly T[],
  afterStart: number,
  afterEnd: number,
  workspace: MyersWorkspace,
): Split | undefined => {
  const beforeLength = beforeEnd - beforeStart;
  const afterLength = afterEnd - afterStart;
  const maxDistance = Math.ceil((beforeLength + afterLength) / 2);
  const frontiers = prepareFrontiers(workspace, maxDistance);
  let vectorOffset = frontiers.center;
  let vectorBound = Math.min(frontiers.distanceCapacity, maxDistance);
  let forward = frontiers.forward;
  let reverse = frontiers.reverse;

  const delta = beforeLength - afterLength;
  const overlapsOnForwardSearch = delta % 2 !== 0;
  let forwardStart = 0;
  let forwardEnd = 0;
  let reverseStart = 0;
  let reverseEnd = 0;

  try {
    for (let distance = 0; distance < maxDistance; distance++) {
      if (distance > frontiers.distanceCapacity) {
        growFrontiers(frontiers, distance, maxDistance);
        vectorOffset = frontiers.center;
        vectorBound = Math.min(frontiers.distanceCapacity, maxDistance);
        forward = frontiers.forward;
        reverse = frontiers.reverse;
      }
      frontiers.activeDistance = distance;

      for (let diagonal = -distance + forwardStart; diagonal <= distance - forwardEnd; diagonal += 2) {
        const offset = vectorOffset + diagonal;
        let beforeIndex: number;

        if (
          diagonal === -distance ||
          (diagonal !== distance && frontierValue(forward, offset - 1) < frontierValue(forward, offset + 1))
        ) {
          beforeIndex = frontierValue(forward, offset + 1);
        } else {
          beforeIndex = frontierValue(forward, offset - 1) + 1;
        }

        let afterIndex = beforeIndex - diagonal;
        while (
          beforeIndex < beforeLength &&
          afterIndex < afterLength &&
          before[beforeStart + beforeIndex] === after[afterStart + afterIndex]
        ) {
          beforeIndex++;
          afterIndex++;
        }
        // The public combined-length guard proves this encoded write cannot wrap.
        forward[offset] = beforeIndex + 1;

        if (beforeIndex > beforeLength) {
          forwardEnd += 2;
        } else if (afterIndex > afterLength) {
          forwardStart += 2;
        } else if (overlapsOnForwardSearch) {
          const reverseDiagonal = delta - diagonal;
          if (reverseDiagonal >= -vectorBound && reverseDiagonal <= vectorBound) {
            const reverseIndex = frontierValue(reverse, vectorOffset + reverseDiagonal);

            if (reverseIndex !== -1 && beforeIndex >= beforeLength - reverseIndex) {
              return {
                before: beforeStart + beforeIndex,
                after: afterStart + afterIndex,
              };
            }
          }
        }
      }

      for (let diagonal = -distance + reverseStart; diagonal <= distance - reverseEnd; diagonal += 2) {
        const offset = vectorOffset + diagonal;
        let beforeIndex: number;

        if (
          diagonal === -distance ||
          (diagonal !== distance && frontierValue(reverse, offset - 1) < frontierValue(reverse, offset + 1))
        ) {
          beforeIndex = frontierValue(reverse, offset + 1);
        } else {
          beforeIndex = frontierValue(reverse, offset - 1) + 1;
        }

        let afterIndex = beforeIndex - diagonal;
        while (
          beforeIndex < beforeLength &&
          afterIndex < afterLength &&
          before[beforeEnd - beforeIndex - 1] === after[afterEnd - afterIndex - 1]
        ) {
          beforeIndex++;
          afterIndex++;
        }
        // The public combined-length guard proves this encoded write cannot wrap.
        reverse[offset] = beforeIndex + 1;

        if (beforeIndex > beforeLength) {
          reverseEnd += 2;
        } else if (afterIndex > afterLength) {
          reverseStart += 2;
        } else if (!overlapsOnForwardSearch) {
          const forwardDiagonal = delta - diagonal;
          if (forwardDiagonal >= -vectorBound && forwardDiagonal <= vectorBound) {
            const forwardIndex = frontierValue(forward, vectorOffset + forwardDiagonal);

            if (forwardIndex !== -1 && forwardIndex >= beforeLength - beforeIndex) {
              return {
                before: beforeStart + forwardIndex,
                after: afterStart + forwardIndex - forwardDiagonal,
              };
            }
          }
        }
      }
    }
  } finally {
    resetFrontiers(frontiers);
  }

  return undefined;
};

/**
 * Compute a shortest edit script for two token arrays.
 *
 * Tokens compare by exact (`===`) equality. The adaptive default selects between Myers bisection and exact sparse-match
 * LCS, while an explicit algorithm forces either engine after the shared shortcuts. The implementation has no deadline
 * or heuristic edit cutoff.
 */
export function diffTokens<T>(
  before: readonly T[],
  after: readonly T[],
  algorithm: DiffAlgorithm = 'adaptive',
): TokenDiff<T>[] {
  const diffs: TokenDiff<T>[] = [];
  const workspace = createMyersWorkspace();
  let selectedAlgorithm = algorithm;
  const tasks: Task[] = [
    {
      kind: 'range',
      beforeStart: 0,
      beforeEnd: before.length,
      afterStart: 0,
      afterEnd: after.length,
    },
  ];

  const append = (operation: DiffOperation, source: readonly T[], start: number, end: number): void => {
    if (start >= end) {
      return;
    }

    const previous = diffs[diffs.length - 1];
    if (previous !== undefined && previous[0] === operation) {
      for (let index = start; index < end; index++) {
        previous[1].push(source[index] as T);
      }
      return;
    }

    diffs.push([operation, source.slice(start, end)]);
  };

  let task: Task | undefined;
  while ((task = tasks.pop()) !== undefined) {
    if (task.kind === 'equal') {
      append(EQUAL, before, task.start, task.end);
      continue;
    }

    let beforeStart = task.beforeStart;
    let beforeEnd = task.beforeEnd;
    let afterStart = task.afterStart;
    let afterEnd = task.afterEnd;

    const prefixLength = commonPrefixLength(before, beforeStart, beforeEnd, after, afterStart, afterEnd);
    append(EQUAL, before, beforeStart, beforeStart + prefixLength);
    beforeStart += prefixLength;
    afterStart += prefixLength;

    const suffixEnd = beforeEnd;
    const suffixLength = commonSuffixLength(before, beforeStart, beforeEnd, after, afterStart, afterEnd);
    const suffixStart = suffixEnd - suffixLength;
    beforeEnd = suffixStart;
    afterEnd -= suffixLength;

    if (beforeStart === beforeEnd) {
      append(INSERT, after, afterStart, afterEnd);
      if (suffixStart < suffixEnd) {
        append(EQUAL, before, suffixStart, suffixEnd);
      }
      continue;
    }
    if (afterStart === afterEnd) {
      append(DELETE, before, beforeStart, beforeEnd);
      if (suffixStart < suffixEnd) {
        append(EQUAL, before, suffixStart, suffixEnd);
      }
      continue;
    }

    const beforeLength = beforeEnd - beforeStart;
    const afterLength = afterEnd - afterStart;
    const beforeIsLonger = beforeLength > afterLength;
    const longTokens = beforeIsLonger ? before : after;
    const longStart = beforeIsLonger ? beforeStart : afterStart;
    const longEnd = beforeIsLonger ? beforeEnd : afterEnd;
    const shortTokens = beforeIsLonger ? after : before;
    const shortStart = beforeIsLonger ? afterStart : beforeStart;
    const shortEnd = beforeIsLonger ? afterEnd : beforeEnd;
    const matchStart = findSubsequence(longTokens, longStart, longEnd, shortTokens, shortStart, shortEnd, workspace);

    if (matchStart !== -1) {
      const matchEnd = matchStart + shortEnd - shortStart;
      if (beforeIsLonger) {
        append(DELETE, before, beforeStart, matchStart);
        append(EQUAL, before, matchStart, matchEnd);
        append(DELETE, before, matchEnd, beforeEnd);
      } else {
        append(INSERT, after, afterStart, matchStart);
        append(EQUAL, before, beforeStart, beforeEnd);
        append(INSERT, after, matchEnd, afterEnd);
      }
      if (suffixStart < suffixEnd) {
        append(EQUAL, before, suffixStart, suffixEnd);
      }
      continue;
    }

    if (Math.min(beforeLength, afterLength) === 1) {
      append(DELETE, before, beforeStart, beforeEnd);
      append(INSERT, after, afterStart, afterEnd);
      if (suffixStart < suffixEnd) {
        append(EQUAL, before, suffixStart, suffixEnd);
      }
      continue;
    }

    if (
      selectedAlgorithm !== 'myers' &&
      tryAppendSparseMatchDiff(before, beforeStart, beforeEnd, after, afterStart, afterEnd, selectedAlgorithm, append)
    ) {
      if (suffixStart < suffixEnd) {
        append(EQUAL, before, suffixStart, suffixEnd);
      }
      continue;
    }
    if (selectedAlgorithm === 'adaptive') {
      selectedAlgorithm = 'myers';
    }

    const split = bisect(before, beforeStart, beforeEnd, after, afterStart, afterEnd, workspace);

    if (
      split === undefined ||
      (split.before === beforeStart && split.after === afterStart) ||
      (split.before === beforeEnd && split.after === afterEnd)
    ) {
      append(DELETE, before, beforeStart, beforeEnd);
      append(INSERT, after, afterStart, afterEnd);
      if (suffixStart < suffixEnd) {
        append(EQUAL, before, suffixStart, suffixEnd);
      }
      continue;
    }

    if (suffixStart < suffixEnd) {
      tasks.push({
        kind: 'equal',
        start: suffixStart,
        end: suffixEnd,
      });
    }
    tasks.push({
      kind: 'range',
      beforeStart: split.before,
      beforeEnd,
      afterStart: split.after,
      afterEnd,
    });
    tasks.push({
      kind: 'range',
      beforeStart,
      beforeEnd: split.before,
      afterStart,
      afterEnd: split.after,
    });
  }

  return diffs;
}

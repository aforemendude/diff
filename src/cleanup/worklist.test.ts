/*
 * Cleanup normalization reference helpers adapted from diff-match-patch-es v2.0.1 and Google Diff Match and Patch,
 * Copyright 2018 The diff-match-patch Authors, under Apache-2.0.
 */

import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT, type Diff, type DiffOperation } from '../types';
import type { GraphemeDiff } from './common';
import { eliminateEfficiencyEqualities } from './efficiency';
import { eliminateSemanticEqualities } from './semantic';
import { CleanupWorklist } from './worklist';

const appendReference = (diffs: GraphemeDiff[], operation: DiffOperation, tokens: readonly string[]): void => {
  if (tokens.length === 0) {
    return;
  }

  const previous = diffs.at(-1);
  if (previous !== undefined && previous[0] === operation) {
    previous[1].push(...tokens);
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

const commonSuffixLength = (left: readonly string[], right: readonly string[], maximumLength: number): number => {
  const limit = Math.min(left.length, right.length, maximumLength);
  let length = 0;
  while (length < limit && left[left.length - length - 1] === right[right.length - length - 1]) {
    length++;
  }
  return length;
};

const referenceMergeEditBlocks = (diffs: readonly Diff[]): GraphemeDiff[] => {
  const merged: GraphemeDiff[] = [];
  let pointer = 0;

  while (pointer < diffs.length) {
    const current = diffs[pointer] as Diff;
    if (current[1].length === 0) {
      pointer++;
      continue;
    }
    if (current[0] === EQUAL) {
      appendReference(merged, EQUAL, current[1]);
      pointer++;
      continue;
    }

    const block: Diff[] = [];
    let operation: typeof DELETE | typeof INSERT | undefined;
    let mixed = false;
    while (pointer < diffs.length) {
      const edit = diffs[pointer] as Diff;
      if (edit[1].length === 0) {
        pointer++;
        continue;
      }
      if (edit[0] === EQUAL) {
        break;
      }
      if (operation === undefined) {
        operation = edit[0];
      } else if (operation !== edit[0]) {
        mixed = true;
      }
      block.push(edit);
      pointer++;
    }

    if (!mixed) {
      for (const edit of block) {
        appendReference(merged, edit[0], edit[1]);
      }
      continue;
    }

    const deletions: string[] = [];
    const insertions: string[] = [];
    for (const edit of block) {
      const target = edit[0] === DELETE ? deletions : insertions;
      target.push(...edit[1]);
    }
    const prefixLength = commonPrefixLength(deletions, insertions);
    const maximumSuffix = Math.min(deletions.length, insertions.length) - prefixLength;
    const suffixLength = commonSuffixLength(deletions, insertions, maximumSuffix);

    appendReference(merged, EQUAL, insertions.slice(0, prefixLength));
    appendReference(merged, DELETE, deletions.slice(prefixLength, deletions.length - suffixLength));
    appendReference(merged, INSERT, insertions.slice(prefixLength, insertions.length - suffixLength));
    appendReference(merged, EQUAL, insertions.slice(insertions.length - suffixLength));
  }

  return merged;
};

const startsWith = (tokens: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length <= tokens.length && prefix.every((token, index) => token === tokens[index]);

const endsWith = (tokens: readonly string[], suffix: readonly string[]): boolean => {
  const offset = tokens.length - suffix.length;
  return offset >= 0 && suffix.every((token, index) => token === tokens[offset + index]);
};

const referenceCleanupShifts = (diffs: readonly Diff[]): GraphemeDiff[] => {
  let merged = referenceMergeEditBlocks(diffs);

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
        merged.splice(
          pointer - 1,
          3,
          [edit[0], left[1].concat(edit[1].slice(0, edit[1].length - left[1].length))],
          [EQUAL, left[1].concat(right[1])],
        );
        shifted = true;
        break;
      }
      if (startsWith(edit[1], right[1])) {
        merged.splice(
          pointer - 1,
          3,
          [EQUAL, left[1].concat(right[1])],
          [edit[0], edit[1].slice(right[1].length).concat(right[1])],
        );
        shifted = true;
        break;
      }
    }

    if (!shifted) {
      return merged;
    }
    merged = referenceMergeEditBlocks(merged);
  }
};

const cleanupShifts = (diffs: readonly Diff[]): GraphemeDiff[] => {
  const worklist = new CleanupWorklist(diffs);
  worklist.cleanupShifts();
  return worklist.toDiffs();
};

const referenceSemanticElimination = (diffs: GraphemeDiff[]): boolean => {
  let changed = false;
  const equalities: number[] = [];
  let lastEquality: string[] | undefined;
  let pointer = 0;
  let insertionsBefore = 0;
  let deletionsBefore = 0;
  let insertionsAfter = 0;
  let deletionsAfter = 0;

  while (pointer < diffs.length) {
    const current = diffs[pointer] as GraphemeDiff;

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
        const equalityIndex = equalities[equalities.length - 1] as number;
        diffs.splice(equalityIndex, 0, [DELETE, lastEquality.slice()]);
        diffs[equalityIndex + 1] = [INSERT, lastEquality];
        equalities.pop();
        equalities.pop();
        pointer = equalities.length > 0 ? (equalities[equalities.length - 1] as number) : -1;
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

const referenceEfficiencyElimination = (diffs: GraphemeDiff[], editCost: number): boolean => {
  let changed = false;
  const equalities: number[] = [];
  let lastEquality: string[] | undefined;
  let pointer = 0;
  let insertionBefore = false;
  let deletionBefore = false;
  let insertionAfter = false;
  let deletionAfter = false;

  while (pointer < diffs.length) {
    const current = diffs[pointer] as GraphemeDiff;

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
        const equalityIndex = equalities[equalities.length - 1] as number;
        const equality = lastEquality as string[];

        diffs.splice(equalityIndex, 0, [DELETE, equality.slice()]);
        diffs[equalityIndex + 1] = [INSERT, equality];
        equalities.pop();
        lastEquality = undefined;

        if (insertionBefore && deletionBefore) {
          insertionAfter = true;
          deletionAfter = true;
          equalities.length = 0;
        } else {
          equalities.pop();
          pointer = equalities.length > 0 ? (equalities[equalities.length - 1] as number) : -1;
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

const copyDiffs = (diffs: readonly Diff[]): GraphemeDiff[] =>
  diffs.map(([operation, tokens]) => [operation, tokens.slice()]);

describe('CleanupWorklist cleanup shifts', () => {
  it.each([
    [
      'left across an insertion',
      [
        [EQUAL, ['a']],
        [INSERT, ['b', 'a']],
        [EQUAL, ['c']],
      ],
      [
        [INSERT, ['a', 'b']],
        [EQUAL, ['a', 'c']],
      ],
    ],
    [
      'right across a deletion',
      [
        [EQUAL, ['a']],
        [DELETE, ['c', 'b']],
        [EQUAL, ['c']],
      ],
      [
        [EQUAL, ['a', 'c']],
        [DELETE, ['b', 'c']],
      ],
    ],
  ] satisfies readonly (readonly [string, GraphemeDiff[], GraphemeDiff[]])[])(
    'shifts an equivalent equality %s',
    (_name, input, expected) => {
      expect(cleanupShifts(input)).toEqual(expected);
    },
  );

  it('keeps the left shift rule ahead of an equally valid right shift', () => {
    expect(
      cleanupShifts([
        [EQUAL, ['a']],
        [INSERT, ['a', 'a']],
        [EQUAL, ['a']],
      ]),
    ).toEqual([
      [INSERT, ['a', 'a']],
      [EQUAL, ['a', 'a']],
    ]);
  });

  it('normalizes a joined edit block that cancels completely', () => {
    expect(
      cleanupShifts([
        [INSERT, ['b', 'c']],
        [EQUAL, ['b']],
        [DELETE, ['c', 'b']],
        [EQUAL, ['d']],
      ]),
    ).toEqual([[EQUAL, ['b', 'c', 'b', 'd']]]);
  });

  it('revisits the local edit created by factoring a joined block', () => {
    expect(
      cleanupShifts([
        [INSERT, ['a', 'x', 'a', 'c']],
        [EQUAL, ['a']],
        [DELETE, ['c', 'a']],
        [EQUAL, ['d']],
      ]),
    ).toEqual([
      [INSERT, ['a', 'x']],
      [EQUAL, ['a', 'c', 'a', 'd']],
    ]);
  });

  it('matches whole-array restart cleanup over generated diffs', () => {
    const operations = [DELETE, EQUAL, INSERT] as const;
    const tokens = ['a', 'b', 'c'] as const;
    let state = 0x1f83_d9ab;
    const next = (limit: number): number => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) % limit;
    };

    for (let caseIndex = 0; caseIndex < 6_000; caseIndex++) {
      const input: Array<[DiffOperation, string[]]> = [];
      const entryCount = next(16);
      for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
        input.push([
          operations[next(operations.length)] as DiffOperation,
          Array.from({ length: next(5) }, () => tokens[next(tokens.length)] as string),
        ]);
      }

      expect(cleanupShifts(input), `case ${caseIndex}`).toEqual(referenceCleanupShifts(input));
    }
  });
});

describe('cleanup equality worklists', () => {
  it('exposes empty and dense normalized entries through exact neighbor navigation', () => {
    const empty = new CleanupWorklist([]);
    expect(empty.first).toBe(-1);
    expect(empty.toDiffs()).toEqual([]);

    const worklist = new CleanupWorklist([
      [EQUAL, []],
      [DELETE, ['a']],
      [DELETE, ['b']],
      [EQUAL, ['c']],
    ]);
    const first = worklist.first;
    const second = worklist.next(first);

    expect(first).toBe(0);
    expect(worklist.entry(first)).toEqual([DELETE, ['a', 'b']]);
    expect(worklist.previous(first)).toBe(-1);
    expect(second).toBe(1);
    expect(worklist.entry(second)).toEqual([EQUAL, ['c']]);
    expect(worklist.previous(second)).toBe(first);
    expect(worklist.next(second)).toBe(-1);
    expect(worklist.toDiffs()).toEqual([
      [DELETE, ['a', 'b']],
      [EQUAL, ['c']],
    ]);
  });

  it('maintains exact entries and neighbor links while linked storage grows', () => {
    const worklist = new CleanupWorklist([[EQUAL, ['tail']]]);
    const originalFirst = worklist.first;
    const head = worklist.insertAfter(-1, DELETE, ['head']);
    const insertedNodes: number[] = [];
    const insertedEntries: GraphemeDiff[] = [];
    let anchor = originalFirst;

    for (let index = 0; index < 9; index++) {
      const entry: GraphemeDiff = [index % 2 === 0 ? INSERT : DELETE, [`edit-${index}`]];
      anchor = worklist.insertAfter(anchor, entry[0], entry[1]);
      insertedNodes.push(anchor);
      insertedEntries.push(entry);
    }
    worklist.setOperation(head, INSERT);

    const order = [head, originalFirst, ...insertedNodes];
    const expected: GraphemeDiff[] = [[INSERT, ['head']], [EQUAL, ['tail']], ...insertedEntries];
    const output = worklist.toDiffs();

    expect(worklist.first).toBe(head);
    expect(output).toEqual(expected);
    for (let index = 0; index < order.length; index++) {
      const node = order[index] as number;
      expect(worklist.entry(node)).toBe(output[index]);
      expect(worklist.previous(node)).toBe(index === 0 ? -1 : order[index - 1]);
      expect(worklist.next(node)).toBe(index === order.length - 1 ? -1 : order[index + 1]);
    }
  });

  it('matches the array equality passes over generated normalized diffs', () => {
    const operations = [DELETE, EQUAL, INSERT] as const;
    const tokenPool = ['a', 'b', 'c'] as const;
    const editCosts = [1 + Number.EPSILON, 2, 4, 5, 9] as const;
    let state = 0x510e_527f;
    let semanticChanges = 0;
    let efficiencyChanges = 0;
    const next = (limit: number): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state % limit;
    };

    for (let caseIndex = 0; caseIndex < 4_000; caseIndex++) {
      const input: Array<[DiffOperation, string[]]> = [];
      const entryCount = next(18);
      for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
        const tokens = Array.from({ length: next(5) }, () => tokenPool[next(tokenPool.length)] as string);
        input.push([operations[next(operations.length)] as DiffOperation, tokens]);
      }
      const normalized = referenceCleanupShifts(input);

      const semanticReference = copyDiffs(normalized);
      const semanticChanged = referenceSemanticElimination(semanticReference);
      const semanticWorklist = new CleanupWorklist(normalized);
      semanticWorklist.cleanupShifts();
      const semanticChangedNodes = eliminateSemanticEqualities(semanticWorklist);
      semanticChanges += semanticChangedNodes.length;
      expect(semanticChangedNodes.length > 0, `semantic change case ${caseIndex}`).toBe(semanticChanged);
      expect(semanticWorklist.toDiffs(), `semantic pass case ${caseIndex}`).toEqual(semanticReference);
      if (semanticChanged) {
        semanticWorklist.cleanupChanged(semanticChangedNodes);
        expect(semanticWorklist.toDiffs(), `semantic merge case ${caseIndex}`).toEqual(
          referenceCleanupShifts(semanticReference),
        );
      }

      const editCost = editCosts[next(editCosts.length)] as number;
      const efficiencyReference = copyDiffs(normalized);
      const efficiencyChanged = referenceEfficiencyElimination(efficiencyReference, editCost);
      const efficiencyWorklist = new CleanupWorklist(normalized);
      efficiencyWorklist.cleanupShifts();
      const efficiencyChangedNodes = eliminateEfficiencyEqualities(efficiencyWorklist, editCost);
      efficiencyChanges += efficiencyChangedNodes.length;
      expect(efficiencyChangedNodes.length > 0, `efficiency change case ${caseIndex}`).toBe(efficiencyChanged);
      expect(efficiencyWorklist.toDiffs(), `efficiency pass case ${caseIndex}`).toEqual(efficiencyReference);
      if (efficiencyChanged) {
        efficiencyWorklist.cleanupChanged(efficiencyChangedNodes);
        expect(efficiencyWorklist.toDiffs(), `efficiency merge case ${caseIndex}`).toEqual(
          referenceCleanupShifts(efficiencyReference),
        );
      }
    }

    expect([semanticChanges, efficiencyChanges]).toEqual([1_637, 631]);
  });
});

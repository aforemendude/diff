import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT, type Diff, type DiffOperation } from '../types';
import type { GraphemeDiff } from './common';
import { eliminateEfficiencyEqualities } from './efficiency';
import { cleanupMerge } from './merge';
import { eliminateSemanticEqualities } from './semantic';
import { CleanupWorklist } from './worklist';

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
      const normalized = cleanupMerge(input);

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
        expect(semanticWorklist.toDiffs(), `semantic merge case ${caseIndex}`).toEqual(cleanupMerge(semanticReference));
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
          cleanupMerge(efficiencyReference),
        );
      }
    }

    expect([semanticChanges, efficiencyChanges]).toEqual([1_637, 631]);
  });
});

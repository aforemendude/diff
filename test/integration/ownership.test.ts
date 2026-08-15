import { describe, expect, it } from 'vitest';
import {
  cleanupEfficiency,
  cleanupSemantic,
  DELETE,
  EQUAL,
  INSERT,
  type Diff,
  type DiffOperation,
} from '../../src/cleanup.js';
import { diffGraphemes } from '../../src/grapheme.js';
import { diffLines } from '../../src/line.js';
import * as unicodeFixtures from '../../src/test-support/unicode.test.fixtures.js';

type MutableDiff = [operation: DiffOperation, tokens: string[]];

interface OwnershipCase {
  readonly name: string;
  readonly invoke: () => readonly Diff[];
  readonly invokeEmpty: () => readonly Diff[];
  readonly argumentReferences: readonly unknown[];
  readonly emptyArgumentReferences: readonly unknown[];
  readonly expectArgumentsUnchanged: () => void;
}

const copyDiff = (diffs: readonly Diff[]): Diff[] =>
  diffs.map(([operation, tokens]): Diff => [operation, tokens.slice()]);

const containerReferences = (diffs: readonly Diff[]): unknown[] => [
  diffs,
  ...diffs.flatMap((entry) => [entry, entry[1]]),
];

const expectOwnedContainers = (diffs: readonly Diff[], externalReferences: readonly unknown[]): void => {
  const references = containerReferences(diffs);
  expect(new Set(references).size, 'result containers must be pairwise distinct').toBe(references.length);

  const external = new Set(externalReferences);
  for (const reference of references) {
    expect(external.has(reference), 'result container must not alias an argument or another call').toBe(false);
  }
};

const lineOptions = Object.freeze({ lineEnding: '\n' as const, optimizeTrivialCases: true });
const expectedLineOptions = { lineEnding: '\n', optimizeTrivialCases: true } as const;

const graphemeLocales = Object.freeze(['en']);
const graphemeOptions = Object.freeze({ locale: graphemeLocales, optimizeTrivialCases: true });
const expectedGraphemeOptions = { locale: ['en'], optimizeTrivialCases: true } as const;

const sharedTokens = Object.freeze(['x']);
const sharedEquality = Object.freeze([EQUAL, sharedTokens] as const);
const cleanupInput: readonly Diff[] = Object.freeze([
  sharedEquality,
  Object.freeze([DELETE, Object.freeze(['a'])] as const),
  Object.freeze([INSERT, Object.freeze(['b'])] as const),
  sharedEquality,
]);
const cleanupInputSnapshot = copyDiff(cleanupInput);
const cleanupInputReferences = containerReferences(cleanupInput);
const emptyCleanupInput: readonly Diff[] = Object.freeze([]);
const emptyCleanupInputReferences = containerReferences(emptyCleanupInput);

const semanticLocales = Object.freeze(['en']);
const semanticOptions = Object.freeze({ locale: semanticLocales });
const expectedSemanticOptions = { locale: ['en'] } as const;

const efficiencyOptions = Object.freeze({ editCost: 4 });
const expectedEfficiencyOptions = { editCost: 4 } as const;

const ownershipCases: readonly OwnershipCase[] = [
  {
    name: 'diffLines',
    invoke: () => diffLines('same\nbefore\ntail', 'same\nafter\ntail', lineOptions),
    invokeEmpty: () => diffLines('', '', lineOptions),
    argumentReferences: [lineOptions],
    emptyArgumentReferences: [lineOptions],
    expectArgumentsUnchanged: () => expect(lineOptions).toEqual(expectedLineOptions),
  },
  {
    name: 'diffGraphemes',
    invoke: () =>
      diffGraphemes(`A${unicodeFixtures.WOMAN_TECHNOLOGIST}Z`, `A${unicodeFixtures.WOMAN_SCIENTIST}Z`, graphemeOptions),
    invokeEmpty: () => diffGraphemes('', '', graphemeOptions),
    argumentReferences: [graphemeOptions, graphemeLocales],
    emptyArgumentReferences: [graphemeOptions, graphemeLocales],
    expectArgumentsUnchanged: () => expect(graphemeOptions).toEqual(expectedGraphemeOptions),
  },
  {
    name: 'cleanupSemantic',
    invoke: () => cleanupSemantic(cleanupInput, semanticOptions),
    invokeEmpty: () => cleanupSemantic(emptyCleanupInput, semanticOptions),
    argumentReferences: [...cleanupInputReferences, semanticOptions, semanticLocales],
    emptyArgumentReferences: [...emptyCleanupInputReferences, semanticOptions, semanticLocales],
    expectArgumentsUnchanged: () => {
      expect(cleanupInput).toEqual(cleanupInputSnapshot);
      expect(emptyCleanupInput).toEqual([]);
      expect(semanticOptions).toEqual(expectedSemanticOptions);
    },
  },
  {
    name: 'cleanupEfficiency',
    invoke: () => cleanupEfficiency(cleanupInput, efficiencyOptions),
    invokeEmpty: () => cleanupEfficiency(emptyCleanupInput, efficiencyOptions),
    argumentReferences: [...cleanupInputReferences, efficiencyOptions],
    emptyArgumentReferences: [...emptyCleanupInputReferences, efficiencyOptions],
    expectArgumentsUnchanged: () => {
      expect(cleanupInput).toEqual(cleanupInputSnapshot);
      expect(emptyCleanupInput).toEqual([]);
      expect(efficiencyOptions).toEqual(expectedEfficiencyOptions);
    },
  },
];

describe('public mutation and ownership guarantees', () => {
  it.each(ownershipCases)('$name returns an isolated, freshly owned object graph on every call', (testCase) => {
    const first = testCase.invoke();
    const second = testCase.invoke();
    const secondSnapshot = copyDiff(second);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expectOwnedContainers(first, testCase.argumentReferences);
    expectOwnedContainers(second, [...testCase.argumentReferences, ...containerReferences(first)]);
    testCase.expectArgumentsUnchanged();

    const mutableFirst = first as unknown as MutableDiff[];
    const firstEntry = mutableFirst[0];
    const siblingSnapshot = mutableFirst[1]?.[1].slice();
    expect(firstEntry).toBeDefined();
    expect(siblingSnapshot).toBeDefined();
    if (firstEntry === undefined || siblingSnapshot === undefined) {
      return;
    }

    firstEntry[1].push('__token-array mutation__');
    expect(mutableFirst[1]?.[1]).toEqual(siblingSnapshot);
    expect(second).toEqual(secondSnapshot);
    testCase.expectArgumentsUnchanged();

    firstEntry[0] = firstEntry[0] === DELETE ? INSERT : DELETE;
    mutableFirst.push([INSERT, ['__top-level-array mutation__']]);
    expect(second).toEqual(secondSnapshot);
    testCase.expectArgumentsUnchanged();
  });

  it.each(ownershipCases)('$name freshly allocates every empty result', (testCase) => {
    const first = testCase.invokeEmpty();
    const second = testCase.invokeEmpty();

    expect(first).toEqual([]);
    expect(second).toEqual(first);
    expectOwnedContainers(first, testCase.emptyArgumentReferences);
    expectOwnedContainers(second, [...testCase.emptyArgumentReferences, ...containerReferences(first)]);
    testCase.expectArgumentsUnchanged();
  });
});

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
import { createRandom, expectCleanupResult, expectGraphemeDiff, freezeDiff, segmentGraphemes } from './support.js';

const SEED = 0xc1ea_4e57;
const OPERATIONS = [DELETE, EQUAL, INSERT] as const;
const TOKENS = ['a', 'b', 'Z', '0', ' ', '\n', '.', '👩‍💻', '🇺🇳', '👍🏽', 'é', 'ก'] as const;

const expectNoInputAliases = (input: readonly Diff[], output: readonly Diff[]): void => {
  const inputReferences = new Set<unknown>([input]);
  for (const entry of input) {
    inputReferences.add(entry);
    inputReferences.add(entry[1]);
  }

  expect(inputReferences.has(output)).toBe(false);
  for (const entry of output) {
    expect(inputReferences.has(entry)).toBe(false);
    expect(inputReferences.has(entry[1])).toBe(false);
  }
};

const generateArbitraryDiffs = (seed: number, count: number): Diff[][] => {
  const random = createRandom(seed);
  const corpus: Diff[][] = [];

  for (let caseIndex = 0; caseIndex < count; caseIndex++) {
    const entries: Diff[] = [];
    const entryCount = random() % 24;
    for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
      const operation = OPERATIONS[random() % OPERATIONS.length] as DiffOperation;
      const tokenCount = random() % 5;
      const tokens: string[] = [];
      for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
        tokens.push(TOKENS[random() % TOKENS.length] ?? 'a');
      }
      entries.push([operation, tokens]);
    }
    corpus.push(entries);
  }

  return corpus;
};

const generateText = (random: () => number, maximumTokens: number): string => {
  const tokenCount = random() % (maximumTokens + 1);
  let text = '';
  for (let index = 0; index < tokenCount; index++) {
    text += TOKENS[random() % TOKENS.length] ?? 'a';
  }
  return text;
};

describe('deterministic generated cleanup properties', () => {
  it('reproduces the same arbitrary valid-diff corpus for a fixed seed', () => {
    expect(generateArbitraryDiffs(SEED, 128)).toEqual(generateArbitraryDiffs(SEED, 128));
  });

  it('normalizes and preserves arbitrary valid diffs without mutating or aliasing them', () => {
    const editCosts = [0, 0.5, 2, 4, 7.25, Number.MAX_VALUE] as const;
    const corpus = generateArbitraryDiffs(SEED, 256);

    for (let caseIndex = 0; caseIndex < corpus.length; caseIndex++) {
      const candidate = corpus[caseIndex] ?? [];
      const input = freezeDiff(candidate);
      const efficiency = cleanupEfficiency(input, { editCost: editCosts[caseIndex % editCosts.length] });
      const semantic = cleanupSemantic(input, { locale: caseIndex % 2 === 0 ? 'en' : 'th' });

      expectCleanupResult(input, efficiency);
      expectCleanupResult(input, semantic);
      expectNoInputAliases(input, efficiency);
      expectNoInputAliases(input, semantic);
    }
  });

  it('composes with public grapheme diffs across fixed-seed Unicode texts', () => {
    const random = createRandom(SEED ^ 0x9e37_79b9);

    for (let caseIndex = 0; caseIndex < 128; caseIndex++) {
      const before = generateText(random, 32);
      const after = generateText(random, 32);
      const raw = freezeDiff(diffGraphemes(before, after));
      const efficiency = cleanupEfficiency(raw, { editCost: (caseIndex % 9) / 2 });
      const semantic = cleanupSemantic(raw, { locale: caseIndex % 3 === 0 ? 'th' : undefined });
      const repeatedSemantic = cleanupSemantic(semantic, { locale: caseIndex % 3 === 0 ? 'th' : undefined });

      expectGraphemeDiff(before, after, raw);
      expectGraphemeDiff(before, after, efficiency);
      expectGraphemeDiff(before, after, semantic);
      expectGraphemeDiff(before, after, repeatedSemantic);
      expectCleanupResult(raw, efficiency);
      expectCleanupResult(raw, semantic);
      expectCleanupResult(raw, repeatedSemantic);
      expectNoInputAliases(raw, efficiency);
      expectNoInputAliases(raw, semantic);
    }
  });

  it('handles a generated large cleanup input reproducibly', () => {
    const random = createRandom(SEED ^ 0xa11c_e5ed);
    const entries: Diff[] = [];

    for (let index = 0; index < 2_048; index++) {
      const operation = OPERATIONS[index % OPERATIONS.length] ?? EQUAL;
      const token = TOKENS[random() % TOKENS.length] ?? 'a';
      entries.push([operation, segmentGraphemes(token)]);
    }

    const input = freezeDiff(entries);
    const efficiency = cleanupEfficiency(input, { editCost: 4.5 });
    const semantic = cleanupSemantic(input, { locale: 'en' });

    expectCleanupResult(input, efficiency);
    expectCleanupResult(input, semantic);
    expectNoInputAliases(input, efficiency);
    expectNoInputAliases(input, semantic);
  });
});

import { beforeAll, bench, describe } from 'vitest';
import { cleanupEfficiency, cleanupSemantic, DELETE, EQUAL, INSERT, type Diff } from '../../src/cleanup.js';
import { cleanupMerge } from '../../src/cleanup/common.js';
import { benchmarkOptions } from './helpers/options.js';
import { validateCleanupResult } from './helpers/preflight.js';

const createMergeChain = (groupCount: number, shiftable: boolean): readonly Diff[] => {
  const diffs: Diff[] = [];
  for (let group = 0; group < groupCount; group++) {
    diffs.push([EQUAL, ['a']], [INSERT, ['x', shiftable ? 'a' : 'b']], [EQUAL, ['c']]);
    if (group + 1 < groupCount) {
      diffs.push([DELETE, ['z']]);
    }
  }
  return diffs;
};

const createEqualityChain = (groupCount: number): readonly Diff[] => {
  const diffs: Diff[] = [];
  for (let group = 0; group < groupCount; group++) {
    diffs.push([DELETE, ['d']], [INSERT, ['i']], [EQUAL, ['x']], [DELETE, ['r']], [INSERT, ['s']], [EQUAL, ['Q']]);
  }
  return diffs;
};

const createEfficiencyBacktrackingChain = (equalityCount: number): readonly Diff[] => {
  const diffs: Diff[] = [];
  const appendEditRun = (index: number): void => {
    diffs.push([DELETE, ['d']]);
    if (index % 2 === 0) {
      diffs.push([INSERT, ['i']]);
    }
  };

  for (let equality = 0; equality < equalityCount; equality++) {
    appendEditRun(equality);
    diffs.push([EQUAL, Array.from({ length: equality % 2 === 0 ? 4 : 1 }, () => 'x')]);
  }
  appendEditRun(equalityCount);
  return diffs;
};

const unchanged = [[EQUAL, Array.from({ length: 100_000 }, () => 'a')]] satisfies readonly Diff[];
const oneReplacement = [
  [EQUAL, Array.from({ length: 49_999 }, () => 'a')],
  [DELETE, ['x']],
  [INSERT, ['y']],
  [EQUAL, Array.from({ length: 49_999 }, () => 'b')],
] satisfies readonly Diff[];
const mergeScales = [100, 400, 1_600, 6_400] as const;
const equalityScales = [250, 500, 1_000, 2_000, 4_000] as const;
const backtrackingScales = [160, 320, 640, 1_280] as const;
const stableMergeChains = mergeScales.map((groupCount) => createMergeChain(groupCount, false));
const shiftableMergeChains = mergeScales.map((groupCount) => createMergeChain(groupCount, true));
const equalityChains = equalityScales.map(createEqualityChain);
const efficiencyBacktrackingChains = backtrackingScales.map(createEfficiencyBacktrackingChain);
const semanticCleanup = (diffs: readonly Diff[]) => cleanupSemantic(diffs, { locale: 'en' });
const backtrackingEfficiencyCleanup = (diffs: readonly Diff[]) => cleanupEfficiency(diffs, { editCost: 7.25 });

beforeAll(() => {
  validateCleanupResult(unchanged, cleanupEfficiency(unchanged), 'unchanged cleanupEfficiency');
  validateCleanupResult(oneReplacement, cleanupEfficiency(oneReplacement), 'one-replacement cleanupEfficiency');

  for (let index = 0; index < mergeScales.length; index++) {
    const stable = stableMergeChains[index] as readonly Diff[];
    const shiftable = shiftableMergeChains[index] as readonly Diff[];
    const stableResult = cleanupMerge(stable);
    const shiftableResult = cleanupMerge(shiftable);
    validateCleanupResult(stable, stableResult, 'stable cleanupMerge');
    validateCleanupResult(shiftable, shiftableResult, 'shiftable cleanupMerge');
    if (stableResult.length !== stable.length || shiftableResult.length >= shiftable.length) {
      throw new Error('Merge-worklist benchmark did not preserve its intended rewrite schedule');
    }
  }

  for (const equalityChain of equalityChains) {
    const efficiencyResult = cleanupEfficiency(equalityChain);
    const semanticResult = semanticCleanup(equalityChain);
    validateCleanupResult(equalityChain, efficiencyResult, 'worklist cleanupEfficiency');
    validateCleanupResult(equalityChain, semanticResult, 'worklist cleanupSemantic');
    if (efficiencyResult.length >= equalityChain.length || semanticResult.length >= equalityChain.length) {
      throw new Error('Equality-worklist benchmark did not eliminate trivial equalities');
    }
  }

  for (const backtrackingChain of efficiencyBacktrackingChains) {
    const result = backtrackingEfficiencyCleanup(backtrackingChain);
    validateCleanupResult(backtrackingChain, result, 'backtracking cleanupEfficiency');
    if (result.length >= backtrackingChain.length) {
      throw new Error('Efficiency-worklist benchmark did not create a backtracking cascade');
    }
  }
});

describe('cleanup worklist low-edit workloads', () => {
  bench('one 100,000-token equality', () => void cleanupEfficiency(unchanged), benchmarkOptions);
  bench('one replacement among 100,000 tokens', () => void cleanupEfficiency(oneReplacement), benchmarkOptions);
});

describe('cleanup merge worklist scaling', () => {
  for (let index = 0; index < mergeScales.length; index++) {
    const groupCount = mergeScales[index] as number;
    const stable = stableMergeChains[index] as readonly Diff[];
    const shiftable = shiftableMergeChains[index] as readonly Diff[];
    bench(`${groupCount.toLocaleString('en-US')} stable groups`, () => void cleanupMerge(stable), benchmarkOptions);
    bench(
      `${groupCount.toLocaleString('en-US')} shiftable groups`,
      () => void cleanupMerge(shiftable),
      benchmarkOptions,
    );
  }
});

describe('cleanup equality worklist scaling', () => {
  for (let index = 0; index < equalityScales.length; index++) {
    const groupCount = equalityScales[index] as number;
    const equalityChain = equalityChains[index] as readonly Diff[];
    bench(
      `cleanupEfficiency over ${groupCount.toLocaleString('en-US')} groups`,
      () => void cleanupEfficiency(equalityChain),
      benchmarkOptions,
    );
    bench(
      `cleanupSemantic over ${groupCount.toLocaleString('en-US')} groups`,
      () => void semanticCleanup(equalityChain),
      benchmarkOptions,
    );
  }
});

describe('cleanup efficiency backtracking scaling', () => {
  for (let index = 0; index < backtrackingScales.length; index++) {
    const equalityCount = backtrackingScales[index] as number;
    const backtrackingChain = efficiencyBacktrackingChains[index] as readonly Diff[];
    bench(
      `${equalityCount.toLocaleString('en-US')} alternating equality candidates`,
      () => void backtrackingEfficiencyCleanup(backtrackingChain),
      benchmarkOptions,
    );
  }
});

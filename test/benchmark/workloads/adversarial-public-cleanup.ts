import { DELETE, EQUAL, INSERT, type Diff } from '../../../src/cleanup.js';

const createShiftChain = (groupCount: number): readonly Diff[] => {
  const diffs: Diff[] = [];
  for (let group = 0; group < groupCount; group++) {
    diffs.push([EQUAL, ['a']], [INSERT, ['x', 'a']], [EQUAL, ['c']]);
    if (group + 1 < groupCount) {
      diffs.push([DELETE, ['z']]);
    }
  }
  return diffs;
};

const createEqualityChain = (groupCount: number): readonly Diff[] => {
  const diffs: Diff[] = [];
  for (let group = 0; group < groupCount; group++) {
    diffs.push([DELETE, ['d']], [INSERT, ['i']], [EQUAL, ['x']], [DELETE, ['r']], [INSERT, ['s']], [EQUAL, ['q']]);
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
    diffs.push([EQUAL, Array.from({ length: equality % 2 === 0 ? 3 : 1 }, () => 'x')]);
  }
  appendEditRun(equalityCount);
  return diffs;
};

export const unchangedCleanupDiff = [[EQUAL, Array.from({ length: 100_000 }, () => 'a')]] satisfies readonly Diff[];

export const oneReplacementCleanupDiff = [
  [EQUAL, Array.from({ length: 49_999 }, () => 'a')],
  [DELETE, ['x']],
  [INSERT, ['y']],
  [EQUAL, Array.from({ length: 49_999 }, () => 'b')],
] satisfies readonly Diff[];

export const cleanupShiftGroupCounts = [100, 400, 1_600, 6_400] as const;
export const cleanupShiftChains = cleanupShiftGroupCounts.map(createShiftChain);

export const cleanupEqualityGroupCounts = [250, 500, 1_000, 2_000, 4_000] as const;
export const cleanupEqualityChains = cleanupEqualityGroupCounts.map(createEqualityChain);

export const efficiencyBacktrackingEqualityCounts = [160, 320, 640, 1_280] as const;
export const efficiencyBacktrackingChains = efficiencyBacktrackingEqualityCounts.map(createEfficiencyBacktrackingChain);

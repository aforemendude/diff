import { beforeAll, bench, describe } from 'vitest';
import { cleanupEfficiency, EQUAL, type Diff } from '../../src/cleanup.js';
import { diffGraphemes } from '../../src/grapheme.js';
import { benchmarkOptions, defaultEfficiencyCleanupOptions, defaultGraphemeDiffOptions } from './helpers/options.js';
import { validateCleanupResult, validateCleanupWorkload } from './helpers/preflight.js';
import {
  adversarialEfficiencyGroupCount,
  adversarialEfficiencyWorkload,
} from './workloads/adversarial-efficiency-cleanup.js';
import {
  cleanupEqualityChains,
  cleanupEqualityGroupCounts,
  cleanupShiftChains,
  cleanupShiftGroupCounts,
  efficiencyBacktrackingChains,
  efficiencyBacktrackingEqualityCounts,
  oneReplacementCleanupDiff,
  unchangedCleanupDiff,
} from './workloads/adversarial-public-cleanup.js';

const cleanup = (diffs: readonly Diff[]) => cleanupEfficiency(diffs, defaultEfficiencyCleanupOptions);

beforeAll(() => {
  const { cleaned, raw } = validateCleanupWorkload(adversarialEfficiencyWorkload, cleanup, 'cleanupEfficiency');
  const rawEqualityCount = raw.filter(([operation]) => operation === EQUAL).length;
  if (rawEqualityCount < adversarialEfficiencyGroupCount / 2 || cleaned.length >= raw.length) {
    throw new Error('Adversarial efficiency-cleanup benchmark did not create a chain of trivial equalities');
  }

  validateCleanupResult(unchangedCleanupDiff, cleanup(unchangedCleanupDiff), 'unchanged cleanupEfficiency');
  validateCleanupResult(
    oneReplacementCleanupDiff,
    cleanup(oneReplacementCleanupDiff),
    'one-replacement cleanupEfficiency',
  );

  for (const shiftChain of cleanupShiftChains) {
    const result = cleanup(shiftChain);
    validateCleanupResult(shiftChain, result, 'shift-chain cleanupEfficiency');
    if (result.length >= shiftChain.length) {
      throw new Error('Adversarial cleanupEfficiency shift chain did not exercise repeated normalization');
    }
  }

  for (const equalityChain of cleanupEqualityChains) {
    const result = cleanup(equalityChain);
    validateCleanupResult(equalityChain, result, 'equality-chain cleanupEfficiency');
    if (result.length >= equalityChain.length) {
      throw new Error('Adversarial cleanupEfficiency equality chain did not eliminate trivial equalities');
    }
  }

  for (const backtrackingChain of efficiencyBacktrackingChains) {
    const result = cleanup(backtrackingChain);
    validateCleanupResult(backtrackingChain, result, 'backtracking cleanupEfficiency');
    if (result.length >= backtrackingChain.length) {
      throw new Error('Adversarial cleanupEfficiency input did not create a backtracking cascade');
    }
  }
});

describe('adversarial diffGraphemes and cleanupEfficiency workload', () => {
  bench(
    `one composed call with ${adversarialEfficiencyGroupCount.toLocaleString('en-US')} interleaved replacements`,
    () =>
      void cleanupEfficiency(
        diffGraphemes(
          adversarialEfficiencyWorkload.before,
          adversarialEfficiencyWorkload.after,
          defaultGraphemeDiffOptions,
        ),
        defaultEfficiencyCleanupOptions,
      ),
    benchmarkOptions,
  );
});

describe('adversarial cleanupEfficiency low-edit inputs', () => {
  bench(
    'one 100,000-token equality',
    () => void cleanupEfficiency(unchangedCleanupDiff, defaultEfficiencyCleanupOptions),
    benchmarkOptions,
  );
  bench(
    'one replacement among 100,000 tokens',
    () => void cleanupEfficiency(oneReplacementCleanupDiff, defaultEfficiencyCleanupOptions),
    benchmarkOptions,
  );
});

describe('adversarial cleanupEfficiency normalization inputs', () => {
  for (let index = 0; index < cleanupShiftGroupCounts.length; index++) {
    const groupCount = cleanupShiftGroupCounts[index] as number;
    const shiftChain = cleanupShiftChains[index] as readonly Diff[];
    bench(
      `${groupCount.toLocaleString('en-US')} consecutive shiftable edits`,
      () => void cleanupEfficiency(shiftChain, defaultEfficiencyCleanupOptions),
      benchmarkOptions,
    );
  }

  for (let index = 0; index < cleanupEqualityGroupCounts.length; index++) {
    const groupCount = cleanupEqualityGroupCounts[index] as number;
    const equalityChain = cleanupEqualityChains[index] as readonly Diff[];
    bench(
      `${groupCount.toLocaleString('en-US')} chained trivial equalities`,
      () => void cleanupEfficiency(equalityChain, defaultEfficiencyCleanupOptions),
      benchmarkOptions,
    );
  }
});

describe('adversarial cleanupEfficiency backtracking inputs', () => {
  for (let index = 0; index < efficiencyBacktrackingEqualityCounts.length; index++) {
    const equalityCount = efficiencyBacktrackingEqualityCounts[index] as number;
    const backtrackingChain = efficiencyBacktrackingChains[index] as readonly Diff[];
    bench(
      `${equalityCount.toLocaleString('en-US')} alternating equality candidates`,
      () => void cleanupEfficiency(backtrackingChain, defaultEfficiencyCleanupOptions),
      benchmarkOptions,
    );
  }
});

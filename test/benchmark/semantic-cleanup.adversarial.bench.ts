import { beforeAll, bench, describe } from 'vitest';
import { cleanupSemantic, EQUAL, INSERT, type Diff } from '../../src/cleanup.js';
import { diffGraphemes } from '../../src/grapheme.js';
import { benchmarkOptions, defaultGraphemeDiffOptions, defaultSemanticCleanupOptions } from './helpers/options.js';
import { validateCleanupResult, validateCleanupWorkload } from './helpers/preflight.js';
import {
  adversarialSemanticPlacementCount,
  adversarialSemanticWorkload,
} from './workloads/adversarial-semantic-cleanup.js';
import {
  cleanupEqualityChains,
  cleanupEqualityGroupCounts,
  cleanupShiftChains,
  cleanupShiftGroupCounts,
} from './workloads/adversarial-public-cleanup.js';

const cleanup = (diffs: readonly Diff[]) => cleanupSemantic(diffs, defaultSemanticCleanupOptions);

beforeAll(() => {
  const { raw } = validateCleanupWorkload(adversarialSemanticWorkload, cleanup, 'cleanupSemantic');
  if (
    raw.length !== 3 ||
    raw[0]?.[0] !== EQUAL ||
    raw[1]?.[0] !== INSERT ||
    raw[1][1].length !== adversarialSemanticPlacementCount ||
    raw[2]?.[0] !== EQUAL
  ) {
    throw new Error('Adversarial semantic-cleanup benchmark did not create one isolated shiftable edit');
  }

  for (const shiftChain of cleanupShiftChains) {
    const result = cleanup(shiftChain);
    validateCleanupResult(shiftChain, result, 'shift-chain cleanupSemantic');
    if (result.length >= shiftChain.length) {
      throw new Error('Adversarial cleanupSemantic shift chain did not exercise repeated normalization');
    }
  }

  for (const equalityChain of cleanupEqualityChains) {
    const result = cleanup(equalityChain);
    validateCleanupResult(equalityChain, result, 'equality-chain cleanupSemantic');
    if (result.length >= equalityChain.length) {
      throw new Error('Adversarial cleanupSemantic equality chain did not eliminate trivial equalities');
    }
  }
});

describe('adversarial diffGraphemes and cleanupSemantic workload', () => {
  bench(
    `one composed call with ${adversarialSemanticPlacementCount.toLocaleString('en-US')} equivalent semantic placements`,
    () =>
      void cleanupSemantic(
        diffGraphemes(
          adversarialSemanticWorkload.before,
          adversarialSemanticWorkload.after,
          defaultGraphemeDiffOptions,
        ),
        defaultSemanticCleanupOptions,
      ),
    benchmarkOptions,
  );
});

describe('adversarial cleanupSemantic inputs', () => {
  for (let index = 0; index < cleanupShiftGroupCounts.length; index++) {
    const groupCount = cleanupShiftGroupCounts[index] as number;
    const shiftChain = cleanupShiftChains[index] as readonly Diff[];
    bench(
      `${groupCount.toLocaleString('en-US')} consecutive shiftable edits`,
      () => void cleanupSemantic(shiftChain, defaultSemanticCleanupOptions),
      benchmarkOptions,
    );
  }

  for (let index = 0; index < cleanupEqualityGroupCounts.length; index++) {
    const groupCount = cleanupEqualityGroupCounts[index] as number;
    const equalityChain = cleanupEqualityChains[index] as readonly Diff[];
    bench(
      `${groupCount.toLocaleString('en-US')} chained trivial equalities`,
      () => void cleanupSemantic(equalityChain, defaultSemanticCleanupOptions),
      benchmarkOptions,
    );
  }
});

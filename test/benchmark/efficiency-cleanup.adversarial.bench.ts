import { beforeAll, bench, describe } from 'vitest';
import { cleanupEfficiency, EQUAL } from '../../src/cleanup.js';
import { diffGraphemes } from '../../src/grapheme.js';
import { benchmarkOptions } from './helpers/options.js';
import { validateCleanupWorkload } from './helpers/preflight.js';
import {
  adversarialEfficiencyGroupCount,
  adversarialEfficiencyWorkload,
} from './workloads/adversarial-efficiency-cleanup.js';

beforeAll(() => {
  const { cleaned, raw } = validateCleanupWorkload(
    adversarialEfficiencyWorkload,
    cleanupEfficiency,
    'cleanupEfficiency',
  );
  const rawEqualityCount = raw.filter(([operation]) => operation === EQUAL).length;
  if (rawEqualityCount < adversarialEfficiencyGroupCount / 2 || cleaned.length >= raw.length) {
    throw new Error('Adversarial efficiency-cleanup benchmark did not create a chain of trivial equalities');
  }
});

describe('adversarial diffGraphemes and cleanupEfficiency workload', () => {
  bench(
    `one composed call with ${adversarialEfficiencyGroupCount.toLocaleString('en-US')} interleaved replacements`,
    () =>
      void cleanupEfficiency(
        diffGraphemes(adversarialEfficiencyWorkload.before, adversarialEfficiencyWorkload.after, {
          algorithm: 'adaptive',
          locale: 'en',
        }),
      ),
    benchmarkOptions,
  );
});

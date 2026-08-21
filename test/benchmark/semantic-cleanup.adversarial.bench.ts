import { beforeAll, bench, describe } from 'vitest';
import { cleanupSemantic, EQUAL, INSERT } from '../../src/cleanup.js';
import { diffGraphemes } from '../../src/grapheme.js';
import { benchmarkOptions } from './helpers/options.js';
import { validateCleanupWorkload } from './helpers/preflight.js';
import {
  adversarialSemanticPlacementCount,
  adversarialSemanticWorkload,
} from './workloads/adversarial-semantic-cleanup.js';

const cleanup = (diffs: Parameters<typeof cleanupSemantic>[0]) => cleanupSemantic(diffs, { locale: 'en' });

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
});

describe('adversarial diffGraphemes and cleanupSemantic workload', () => {
  bench(
    `one composed call with ${adversarialSemanticPlacementCount.toLocaleString('en-US')} equivalent semantic placements`,
    () =>
      void cleanupSemantic(
        diffGraphemes(adversarialSemanticWorkload.before, adversarialSemanticWorkload.after, {
          algorithm: 'adaptive',
          locale: 'en',
        }),
        { locale: 'en' },
      ),
    benchmarkOptions,
  );
});

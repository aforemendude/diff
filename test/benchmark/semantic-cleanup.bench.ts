import { beforeAll, bench, describe } from 'vitest';
import { cleanupSemantic } from '../../src/cleanup.js';
import { diffGraphemes } from '../../src/grapheme.js';
import { REPRESENTATIVE_CALL_COUNT, benchmarkOptions, runWorkloadSchedule } from './helpers/options.js';
import { validateCleanupWorkload } from './helpers/preflight.js';
import {
  createRepresentativeGraphemeWorkloadSet,
  representativeSentenceCountScales,
} from './workloads/representative-graphemes.js';

const cleanup = (diffs: Parameters<typeof cleanupSemantic>[0]) => cleanupSemantic(diffs, { locale: 'en' });
const { schedule, workloads } = createRepresentativeGraphemeWorkloadSet(
  representativeSentenceCountScales.semanticCleanup,
);

beforeAll(() => {
  if (workloads.length !== 100 || schedule.length !== REPRESENTATIVE_CALL_COUNT) {
    throw new Error('Representative semantic-cleanup benchmark has an unexpected schedule size');
  }
  for (const workload of workloads) {
    validateCleanupWorkload(workload, cleanup, 'cleanupSemantic');
  }
});

describe('representative diffGraphemes and cleanupSemantic workload', () => {
  bench(
    '1,000 composed calls across a deterministic prose and mixed-Unicode mix',
    () =>
      runWorkloadSchedule(schedule, (workload) =>
        cleanupSemantic(diffGraphemes(workload.before, workload.after, { locale: 'en' }), { locale: 'en' }),
      ),
    benchmarkOptions,
  );
});

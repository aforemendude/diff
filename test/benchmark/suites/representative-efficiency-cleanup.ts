import { beforeAll, bench, describe } from 'vitest';
import { cleanupEfficiency } from '../../../src/cleanup.js';
import { diffGraphemes } from '../../../src/grapheme.js';
import { REPRESENTATIVE_CALL_COUNT, benchmarkOptions, runWorkloadSchedule } from '../helpers/options.js';
import { validateCleanupWorkload } from '../helpers/preflight.js';
import {
  createRepresentativeGraphemeWorkloadSet,
  representativeSentenceCountScales,
} from '../workloads/representative-graphemes.js';

const { schedule, workloads } = createRepresentativeGraphemeWorkloadSet(
  representativeSentenceCountScales.efficiencyCleanup,
);

export const registerRepresentativeEfficiencyCleanupBenchmark = (): void => {
  beforeAll(() => {
    if (workloads.length !== 100 || schedule.length !== REPRESENTATIVE_CALL_COUNT) {
      throw new Error('Representative efficiency-cleanup benchmark has an unexpected schedule size');
    }
    for (const workload of workloads) {
      validateCleanupWorkload(workload, cleanupEfficiency, 'cleanupEfficiency');
    }
  });

  describe('representative diffGraphemes and cleanupEfficiency workload', () => {
    bench(
      '1,000 composed calls across a deterministic prose and mixed-Unicode mix',
      () =>
        runWorkloadSchedule(schedule, (workload) =>
          cleanupEfficiency(diffGraphemes(workload.before, workload.after, { locale: 'en' })),
        ),
      benchmarkOptions,
    );
  });
};

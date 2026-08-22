import { beforeAll, bench, describe } from 'vitest';
import { diffGraphemes } from '../../src/grapheme.js';
import {
  REPRESENTATIVE_CALL_COUNT,
  benchmarkOptions,
  defaultGraphemeDiffOptions,
  runWorkloadSchedule,
} from './helpers/options.js';
import { validateGraphemeWorkload } from './helpers/preflight.js';
import {
  createRepresentativeGraphemeWorkloadSet,
  representativeSentenceCountScales,
} from './workloads/representative-graphemes.js';

const { schedule, workloads } = createRepresentativeGraphemeWorkloadSet(
  representativeSentenceCountScales.diffGraphemes,
);

beforeAll(() => {
  if (workloads.length !== 100 || schedule.length !== REPRESENTATIVE_CALL_COUNT) {
    throw new Error('Representative diffGraphemes benchmark has an unexpected schedule size');
  }
  for (const workload of workloads) {
    validateGraphemeWorkload(workload);
  }
});

describe('representative diffGraphemes workload', () => {
  bench(
    '1,000 calls across a deterministic prose and mixed-Unicode mix',
    () =>
      runWorkloadSchedule(schedule, (workload) =>
        diffGraphemes(workload.before, workload.after, defaultGraphemeDiffOptions),
      ),
    benchmarkOptions,
  );
});

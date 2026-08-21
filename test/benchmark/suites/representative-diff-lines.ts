import { beforeAll, bench, describe } from 'vitest';
import { diffLines } from '../../../src/line.js';
import { REPRESENTATIVE_CALL_COUNT, benchmarkOptions, runWorkloadSchedule } from '../helpers/options.js';
import { validateRepresentativeLineWorkload } from '../helpers/preflight.js';
import { representativeLineSchedule, representativeLineWorkloads } from '../workloads/representative-lines.js';

export const registerRepresentativeDiffLinesBenchmark = (): void => {
  beforeAll(() => {
    if (representativeLineWorkloads.length !== 100 || representativeLineSchedule.length !== REPRESENTATIVE_CALL_COUNT) {
      throw new Error('Representative diffLines benchmark has an unexpected schedule size');
    }
    for (const {
      changeRatioLabel,
      changedPortion,
      inputSizeLabel,
      requestedEditHunkCount,
      targetByteCount,
      workload,
    } of representativeLineWorkloads) {
      validateRepresentativeLineWorkload(
        workload,
        targetByteCount,
        changedPortion,
        requestedEditHunkCount,
        `${inputSizeLabel}/${changeRatioLabel}`,
      );
    }
  });

  describe('representative diffLines workload', () => {
    bench(
      '1,000 calls across the documented size, change-ratio, and edit-topology mix',
      () =>
        runWorkloadSchedule(representativeLineSchedule, ({ workload }) => diffLines(workload.before, workload.after)),
      benchmarkOptions,
    );
  });
};

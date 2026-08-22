import { beforeAll, bench, describe } from 'vitest';
import { diffLines } from '../../src/line.js';
import { benchmarkOptions, defaultLineDiffOptions, runWorkloadSchedule } from './helpers/options.js';
import { validateLineWorkload } from './helpers/preflight.js';
import {
  adversarialLineCount,
  adversarialLineWorkload,
  adversarialSparseIndexLineWorkloads,
  adversarialSparseIndexLongLineCount,
  adversarialSparseIndexShortLineCount,
} from './workloads/adversarial-diff-lines.js';
import { adaptiveSelectionLineWorkloadGroups } from './workloads/adaptive-selection-lines.js';

beforeAll(() => {
  validateLineWorkload(adversarialLineWorkload);
  for (const workload of adversarialSparseIndexLineWorkloads) {
    validateLineWorkload(workload);
  }
  for (const { workloads } of adaptiveSelectionLineWorkloadGroups) {
    for (const workload of workloads) {
      validateLineWorkload(workload);
    }
  }
});

describe('adversarial diffLines workload', () => {
  bench(
    `one call with ${adversarialLineCount.toLocaleString('en-US')} disjoint unique lines per side`,
    () => void diffLines(adversarialLineWorkload.before, adversarialLineWorkload.after, defaultLineDiffOptions),
    benchmarkOptions,
  );

  bench(
    `${adversarialSparseIndexShortLineCount.toLocaleString('en-US')} repeated lines and ${adversarialSparseIndexLongLineCount.toLocaleString('en-US')} disjoint unique lines in both orientations`,
    () =>
      runWorkloadSchedule(adversarialSparseIndexLineWorkloads, (workload) =>
        diffLines(workload.before, workload.after, defaultLineDiffOptions),
      ),
    benchmarkOptions,
  );
});

describe('adversarial diffLines adaptive-boundary workloads', () => {
  for (const { label, lineCounts, workloads } of adaptiveSelectionLineWorkloadGroups) {
    const sizeLabel = lineCounts.map((lineCount) => lineCount.toLocaleString('en-US')).join(', ');
    bench(
      `${label} at ${sizeLabel} lines per side`,
      () =>
        runWorkloadSchedule(workloads, (workload) =>
          diffLines(workload.before, workload.after, defaultLineDiffOptions),
        ),
      benchmarkOptions,
    );
  }
});

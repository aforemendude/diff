import { beforeAll, bench, describe } from 'vitest';
import { diffLines } from '../../src/line.js';
import { benchmarkOptions, runWorkloadSchedule } from './helpers/options.js';
import { validateLineWorkload } from './helpers/preflight.js';
import { adaptiveSelectionLineWorkloadGroups } from './workloads/adaptive-selection-lines.js';

beforeAll(() => {
  for (const { workloads } of adaptiveSelectionLineWorkloadGroups) {
    for (const workload of workloads) {
      validateLineWorkload(workload);
    }
  }
});

describe('adaptive line-diff engine selection', () => {
  for (const { label, lineCounts, workloads } of adaptiveSelectionLineWorkloadGroups) {
    const sizeLabel = lineCounts.map((lineCount) => lineCount.toLocaleString('en-US')).join(', ');
    bench(
      `${label} at ${sizeLabel} lines per side`,
      () =>
        runWorkloadSchedule(workloads, (workload) =>
          diffLines(workload.before, workload.after, {
            algorithm: 'adaptive',
            lineEnding: '\n',
            optimizeTrivialCases: false,
          }),
        ),
      benchmarkOptions,
    );
  }
});

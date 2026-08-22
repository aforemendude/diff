import type { CleanupEfficiencyOptions, SegmentOptions } from '../../../src/cleanup.js';
import type { GraphemeDiffOptions } from '../../../src/grapheme.js';
import type { LineDiffOptions } from '../../../src/line.js';

type FullySpecified<Options> = Options & {
  readonly [Key in keyof Options]-?: unknown;
};

export const defaultLineDiffOptions = {
  algorithm: 'adaptive',
  lineEnding: '\n',
  optimizeTrivialCases: false,
} as const satisfies FullySpecified<LineDiffOptions>;

export const defaultGraphemeDiffOptions = {
  algorithm: 'adaptive',
  locale: undefined,
  optimizeTrivialCases: false,
} as const satisfies FullySpecified<GraphemeDiffOptions>;

export const defaultSemanticCleanupOptions = {
  locale: undefined,
} as const satisfies FullySpecified<SegmentOptions>;

export const defaultEfficiencyCleanupOptions = {
  editCost: 4,
} as const satisfies FullySpecified<CleanupEfficiencyOptions>;

export const REPRESENTATIVE_CALL_COUNT = 1_000;

export const benchmarkOptions = {
  iterations: 3,
  time: 0,
  warmupIterations: 1,
  warmupTime: 0,
} as const;

export const runWorkloadSchedule = <Workload>(
  schedule: readonly Workload[],
  invoke: (workload: Workload) => unknown,
): void => {
  for (const workload of schedule) {
    void invoke(workload);
  }
};

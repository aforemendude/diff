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

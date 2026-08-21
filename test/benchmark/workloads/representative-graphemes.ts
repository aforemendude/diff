import { createProseWorkload } from '../fixtures/graphemes.js';
import type { TextWorkload } from '../fixtures/types.js';
import { createRepeatedSchedule } from '../helpers/distribution.js';

const sizeBuckets = [
  { fixtureCount: 55, maximumSentenceCount: 80, minimumSentenceCount: 20 },
  { fixtureCount: 30, maximumSentenceCount: 160, minimumSentenceCount: 80 },
  { fixtureCount: 12, maximumSentenceCount: 320, minimumSentenceCount: 160 },
  { fixtureCount: 3, maximumSentenceCount: 600, minimumSentenceCount: 320 },
] as const;

const createWorkloads = (sentenceCountScale: number): readonly TextWorkload[] =>
  sizeBuckets.flatMap(({ fixtureCount, maximumSentenceCount, minimumSentenceCount }, bucketIndex) => {
    const logarithmicRange = Math.log(maximumSentenceCount / minimumSentenceCount);
    return Array.from({ length: fixtureCount }, (_, index) => {
      const sentenceCount = Math.max(
        1,
        Math.round(
          sentenceCountScale * minimumSentenceCount * Math.exp(((index + 0.5) / fixtureCount) * logarithmicRange),
        ),
      );
      const workload = createProseWorkload(
        sentenceCount,
        0x510e_527f + bucketIndex * 0x100 + index,
        (index + bucketIndex) % 4 === 0,
      );

      // Match the ordinary-diff heuristic by making 15 of the 100 fixtures identical.
      return bucketIndex === 0 && index < 15 ? { before: workload.before, after: workload.before } : workload;
    });
  });

interface RepresentativeGraphemeWorkloadSet {
  readonly schedule: readonly TextWorkload[];
  readonly workloads: readonly TextWorkload[];
}

// Preserve one distribution shape while sizing each workflow for a roughly two-second, 1,000-call sample on the
// benchmark reference machine.
export const representativeSentenceCountScales = {
  diffGraphemes: 0.92,
  efficiencyCleanup: 0.88,
  semanticCleanup: 0.78,
} as const;

export const createRepresentativeGraphemeWorkloadSet = (
  sentenceCountScale: number,
): RepresentativeGraphemeWorkloadSet => {
  const workloads = createWorkloads(sentenceCountScale);
  return {
    schedule: createRepeatedSchedule(workloads, 10, 0x9b05_688c),
    workloads,
  };
};

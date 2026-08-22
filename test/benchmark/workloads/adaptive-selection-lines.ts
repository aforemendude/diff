import {
  createDuplicateHeavyLineWorkload,
  createMostlyEqualUniqueLineWorkload,
  createPartiallySharedUniqueLineWorkload,
  createReversedUniqueLineWorkload,
} from '../fixtures/adaptive-selection-lines.js';
import type { CertifiedTextWorkload } from '../fixtures/types.js';

export interface AdaptiveSelectionLineWorkloadGroup {
  readonly label: string;
  readonly lineCounts: readonly number[];
  readonly workloads: readonly CertifiedTextWorkload[];
}

const geometricLineCounts = [256, 512, 1_024, 2_048] as const;
const crossoverLineCounts = [512, 1_024, 2_048] as const;

const createGeometricGroup = (
  label: string,
  create: (lineCount: number) => CertifiedTextWorkload,
  lineCounts: readonly number[] = geometricLineCounts,
): AdaptiveSelectionLineWorkloadGroup => ({
  label,
  lineCounts,
  workloads: lineCounts.map(create),
});

const sharedPositionPairGroups = ([1, 5, 10] as const).map((sharedPercentage) =>
  createGeometricGroup(`${sharedPercentage}% shared position pairs over unique alphabets`, (lineCount) =>
    createPartiallySharedUniqueLineWorkload(lineCount, Math.max(1, Math.round((lineCount * sharedPercentage) / 100))),
  ),
);

export const adaptiveSelectionLineWorkloadGroups: readonly AdaptiveSelectionLineWorkloadGroup[] = [
  createGeometricGroup('reversed unique lines', createReversedUniqueLineWorkload),
  createGeometricGroup('Myers side of the relative work crossover', createReversedUniqueLineWorkload, [100]),
  createGeometricGroup('sparse side of the relative work crossover', createReversedUniqueLineWorkload, [101]),
  createGeometricGroup('disjoint unique lines', (lineCount) => createPartiallySharedUniqueLineWorkload(lineCount, 0)),
  ...sharedPositionPairGroups,
  createGeometricGroup('duplicate-heavy low-distance fallback', (lineCount) =>
    createDuplicateHeavyLineWorkload(lineCount, 8),
  ),
  createGeometricGroup('mostly equal unique low-distance inputs', createMostlyEqualUniqueLineWorkload),
  createGeometricGroup(
    'lower-match side of the relative memory crossover',
    (lineCount) => createPartiallySharedUniqueLineWorkload(lineCount, lineCount / 2 - 2),
    crossoverLineCounts,
  ),
  createGeometricGroup(
    'higher-match side of the relative memory crossover',
    (lineCount) => createPartiallySharedUniqueLineWorkload(lineCount, lineCount / 2 - 1),
    crossoverLineCounts,
  ),
];

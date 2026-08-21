import { createSizedLineWorkload } from '../fixtures/lines.js';
import type { SizedLineWorkload } from '../fixtures/types.js';
import { allocateWeightedValues, createRepeatedSchedule, repeat, shuffle } from '../helpers/distribution.js';

export interface RepresentativeLineWorkload {
  readonly changeRatioLabel: string;
  readonly changedPortion: number;
  readonly inputSizeLabel: string;
  readonly requestedEditHunkCount: number;
  readonly targetByteCount: number;
  readonly workload: SizedLineWorkload;
}

const changeRatios = [
  { changeRatioLabel: 'identical', changedPortion: 0 },
  { changeRatioLabel: 'less than 1%', changedPortion: 0.005 },
  { changeRatioLabel: '1-5%', changedPortion: 0.03 },
  { changeRatioLabel: '5-20%', changedPortion: 0.125 },
  { changeRatioLabel: '20-50%', changedPortion: 0.35 },
  { changeRatioLabel: 'more than 50%', changedPortion: 0.6 },
] as const;

// Each fixture appears ten times in the score. These per-bucket counts keep the
// global ratio exact and approximate each bucket as closely as its size permits.
const inputCases = [
  {
    changeRatioFixtureCounts: [8, 16, 14, 8, 6, 3],
    fixtureCount: 55,
    label: 'small',
    maximum: 10_000,
    minimum: 100,
  },
  {
    changeRatioFixtureCounts: [5, 9, 7, 5, 3, 1],
    fixtureCount: 30,
    label: 'medium',
    maximum: 100_000,
    minimum: 10_000,
  },
  {
    changeRatioFixtureCounts: [2, 4, 3, 1, 1, 1],
    fixtureCount: 12,
    label: 'large',
    maximum: 1_000_000,
    minimum: 100_000,
  },
  {
    changeRatioFixtureCounts: [0, 1, 1, 1, 0, 0],
    fixtureCount: 3,
    label: 'very large',
    maximum: 10_000_000,
    minimum: 1_000_000,
  },
].flatMap(({ changeRatioFixtureCounts, fixtureCount, label, maximum, minimum }, bucketIndex) => {
  const logarithmicRange = Math.log(maximum / minimum);
  const inputSizes = Array.from({ length: fixtureCount }, (_, index) => ({
    inputSizeLabel: label,
    targetByteCount: Math.round(minimum * Math.exp(((index + 0.5) / fixtureCount) * logarithmicRange)),
  }));
  const bucketChangeRatios = shuffle(
    changeRatios.flatMap((changeRatio, index) => repeat(changeRatio, changeRatioFixtureCounts[index] ?? 0)),
    0x6a09_e667 + bucketIndex,
  );
  if (bucketChangeRatios.length !== inputSizes.length) {
    throw new Error('Representative line benchmark per-size change-ratio distribution is incomplete');
  }

  return inputSizes.map((inputSize, index) => {
    const changeRatio = bucketChangeRatios[index];
    if (changeRatio === undefined) {
      throw new Error('Representative line benchmark change-ratio distribution is incomplete');
    }
    return { ...inputSize, ...changeRatio };
  });
});

const editTopologies = shuffle(
  allocateWeightedValues(85, [
    { value: 1, weight: 30 },
    { value: 6, weight: 40 },
    { value: 40, weight: 20 },
    { value: 100, weight: 10 },
  ]),
  0xbb67_ae85,
);

let editTopologyIndex = 0;
export const representativeLineWorkloads = shuffle(
  inputCases.map(
    ({ changeRatioLabel, changedPortion, inputSizeLabel, targetByteCount }): RepresentativeLineWorkload => {
      const requestedEditHunkCount = changedPortion === 0 ? 0 : editTopologies[editTopologyIndex++];
      if (requestedEditHunkCount === undefined) {
        throw new Error('Representative line benchmark edit-topology distribution is incomplete');
      }

      return {
        changeRatioLabel,
        changedPortion,
        inputSizeLabel,
        requestedEditHunkCount,
        targetByteCount,
        workload: createSizedLineWorkload(targetByteCount, changedPortion, requestedEditHunkCount),
      };
    },
  ),
  0x3c6e_f372,
);

export const representativeLineSchedule = createRepeatedSchedule(representativeLineWorkloads, 10, 0xa54f_f53a);

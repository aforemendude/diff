import { beforeAll, bench, describe } from 'vitest';
import { DELETE, EQUAL, INSERT, cleanupEfficiency, cleanupSemantic, type Diff } from '../../src/cleanup.js';
import { diffGraphemes } from '../../src/grapheme.js';
import { diffLines, type LineEnding } from '../../src/line.js';
import { diffTokens } from '../../src/algorithm/myers';
import { coalesce, compactOwned, type GraphemeDiff } from '../../src/cleanup/common';
import { tokenizeGraphemes } from '../../src/tokenize/graphemes';
import { tokenizeLines } from '../../src/tokenize/lines';
import * as unicodeFixtures from '../../src/test-support/unicode.test.fixtures.js';
import {
  createDenseGraphemeWorkload,
  createEfficiencyDiff,
  createGraphemeWorkload,
  createLargeEditBlockDiff,
  createLineWorkload,
  createOverlapDiff,
  createProseWorkload,
  createSemanticCurrentWinnerDiff,
  createSemanticDiff,
  createSemanticManyAlternativeDiff,
  createSemanticNoShiftDiff,
  createSizedLineWorkload,
  createSourceLineWorkload,
  createUnrelatedLineWorkload,
  type SizedLineWorkload,
  type TextWorkload,
} from './fixtures';

const benchmarkOptions = {
  iterations: 3,
  time: 300,
  warmupIterations: 1,
  warmupTime: 75,
} as const;

const representativeScoreOptions = {
  ...benchmarkOptions,
  time: 0,
  warmupTime: 0,
} as const;

const benchmarkGraphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

interface TokenWorkload {
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly shortestEditCost?: number;
}

interface RepresentativeDistributionWorkload {
  readonly changeRatioLabel: string;
  readonly changedPortion: number;
  readonly inputSizeLabel: string;
  readonly requestedEditHunkCount: number;
  readonly targetByteCount: number;
  readonly workload: SizedLineWorkload;
}

const shuffled = <Value>(values: readonly Value[], seed: number): Value[] => {
  const result = values.slice();
  let state = seed >>> 0;

  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    const value = result[index];
    const swapValue = result[swapIndex];
    if (value === undefined || swapValue === undefined) {
      throw new Error('Representative benchmark shuffle received a sparse array');
    }
    result[index] = swapValue;
    result[swapIndex] = value;
  }

  return result;
};

const repeated = <Value>(value: Value, count: number): Value[] => Array.from({ length: count }, () => value);

interface WeightedValue<Value> {
  readonly value: Value;
  readonly weight: number;
}

const allocateWeightedValues = <Value>(total: number, weightedValues: readonly WeightedValue<Value>[]): Value[] => {
  const allocations = weightedValues.map(({ weight }, index) => {
    const exactCount = (total * weight) / 100;
    return { count: Math.floor(exactCount), index, remainder: exactCount % 1 };
  });
  const allocatedCount = allocations.reduce((sum, { count }) => sum + count, 0);
  const remainderOrder = allocations
    .slice()
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let index = 0; index < total - allocatedCount; index++) {
    const allocation = remainderOrder[index];
    if (allocation === undefined) {
      throw new Error('Representative benchmark weights do not sum to 100%');
    }
    allocation.count++;
  }

  return allocations.flatMap(({ count, index }) => {
    const weightedValue = weightedValues[index];
    if (weightedValue === undefined) {
      throw new Error('Representative benchmark weight allocation is incomplete');
    }
    return repeated(weightedValue.value, count);
  });
};

const representativeChangeRatios = [
  { changeRatioLabel: 'identical', changedPortion: 0 },
  { changeRatioLabel: 'less than 1%', changedPortion: 0.005 },
  { changeRatioLabel: '1-5%', changedPortion: 0.03 },
  { changeRatioLabel: '5-20%', changedPortion: 0.125 },
  { changeRatioLabel: '20-50%', changedPortion: 0.35 },
  { changeRatioLabel: 'more than 50%', changedPortion: 0.6 },
] as const;

// Each fixture appears ten times in the score. These per-bucket counts keep the
// global ratio exact and approximate each bucket as closely as its size permits.
const representativeInputCases = [
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
  const changeRatios = shuffled(
    representativeChangeRatios.flatMap((changeRatio, index) =>
      repeated(changeRatio, changeRatioFixtureCounts[index] ?? 0),
    ),
    0x6a09_e667 + bucketIndex,
  );
  if (changeRatios.length !== inputSizes.length) {
    throw new Error('Representative benchmark per-size change-ratio distribution is incomplete');
  }

  return inputSizes.map((inputSize, index) => {
    const changeRatio = changeRatios[index];
    if (changeRatio === undefined) {
      throw new Error('Representative benchmark change-ratio distribution is incomplete');
    }
    return { ...inputSize, ...changeRatio };
  });
});

const representativeEditTopologies = shuffled(
  allocateWeightedValues(85, [
    { value: 1, weight: 30 },
    { value: 6, weight: 40 },
    { value: 40, weight: 20 },
    { value: 100, weight: 10 },
  ]),
  0xbb67_ae85,
);
let editTopologyIndex = 0;
const representativeDistributionWorkloads = shuffled(
  representativeInputCases.map(
    ({ changeRatioLabel, changedPortion, inputSizeLabel, targetByteCount }): RepresentativeDistributionWorkload => {
      const requestedEditHunkCount = changedPortion === 0 ? 0 : representativeEditTopologies[editTopologyIndex++];
      if (requestedEditHunkCount === undefined) {
        throw new Error('Representative benchmark edit-topology distribution is incomplete');
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

const representativeDistributionSchedule = Array.from({ length: 10 }, (_, repetition) =>
  shuffled(representativeDistributionWorkloads, 0xa54f_f53a + repetition),
).flat();

const oneLineEdit = [{ at: 32, deleteCount: 1, insertCount: 1 }] as const;
const medianLineEdits = [
  { at: 16, deleteCount: 1, insertCount: 3 },
  { at: 48, deleteCount: 2, insertCount: 2 },
  { at: 80, deleteCount: 3, insertCount: 3 },
] as const;
const upperQuartileLineEdits = [
  { at: 16, deleteCount: 0, insertCount: 4 },
  { at: 32, deleteCount: 4, insertCount: 0 },
  { at: 48, deleteCount: 3, insertCount: 3 },
  { at: 72, deleteCount: 3, insertCount: 3 },
  { at: 96, deleteCount: 3, insertCount: 3 },
  { at: 120, deleteCount: 3, insertCount: 3 },
  { at: 144, deleteCount: 3, insertCount: 3 },
  { at: 168, deleteCount: 4, insertCount: 4 },
] as const;
const representativeLineWorkloads = [
  {
    label: '64 source-like LF lines with one replaced line in one hunk',
    lineEnding: '\n',
    workload: createSourceLineWorkload(64, '\n', oneLineEdit),
  },
  {
    label: '96 source-like LF lines with 14 changed lines across 3 hunks',
    lineEnding: '\n',
    workload: createSourceLineWorkload(96, '\n', medianLineEdits),
  },
  {
    label: '192 source-like LF lines with 46 changed lines across 8 hunks',
    lineEnding: '\n',
    workload: createSourceLineWorkload(192, '\n', upperQuartileLineEdits),
  },
  {
    label: '96 source-like CRLF lines with 14 changed lines across 3 hunks',
    lineEnding: '\r\n',
    workload: createSourceLineWorkload(96, '\r\n', medianLineEdits),
  },
] as const satisfies readonly {
  readonly label: string;
  readonly lineEnding: LineEnding;
  readonly workload: TextWorkload;
}[];

// Fixed seeds keep every pseudorandom workload identical across processes and runs.
const largeLineWorkload = createLineWorkload(66_000, '\n', 0x1a2b_3c4d);
const independentlyConstructedEqualLines = `_${largeLineWorkload.before}`.slice(1);
const insignificantTerminalEndingLineWorkload = {
  before: largeLineWorkload.before,
  after: `${largeLineWorkload.before}\n`,
  shortestEditCost: 0,
} satisfies TextWorkload;
const crlfLineWorkload = createLineWorkload(24_000, '\r\n', 0x2b3c_4d5e);
const unrelatedLineWorkloads = [
  createUnrelatedLineWorkload(400, 0x3141_5926),
  createUnrelatedLineWorkload(800, 0x5358_9793),
] as const;
const unicodeWorkload = createGraphemeWorkload(20_000, 0x3c4d_5e6f);
const independentlyConstructedEqualGraphemes = `_${unicodeWorkload.before}`.slice(1);
const denseGraphemeWorkload = createDenseGraphemeWorkload(1_500, 0x4d5e_6f70);
const representativeProseWorkloads = [
  { sentenceCount: 4, workload: createProseWorkload(4, 0x1c2d_3e4f) },
  { sentenceCount: 24, workload: createProseWorkload(24, 0x2d3e_4f50) },
] as const;
const shortMixedUnicodeWorkload = {
  before: `Caf${unicodeFixtures.E_WITH_COMBINING_ACUTE} ${unicodeFixtures.WOMAN_TECHNOLOGIST} ${unicodeFixtures.UNITED_NATIONS_FLAG}`,
  after: `Caf${unicodeFixtures.LATIN_SMALL_LETTER_E_WITH_ACUTE} ${unicodeFixtures.WOMAN_SCIENTIST} ${unicodeFixtures.UNITED_STATES_FLAG}`,
} satisfies TextWorkload;
const largeProseWorkload = createProseWorkload(600, 0x5e6f_7081);
const semanticNoShiftDiff = createSemanticNoShiftDiff(2_000, 0x6071_8293);
const semanticDiff = createSemanticDiff(2_000, 0x6f70_8192);
const semanticManyAlternativeDiff = createSemanticManyAlternativeDiff(2_000, 32, 0x7e81_90a3);
const semanticCurrentWinnerDiff = createSemanticCurrentWinnerDiff(2_000, 32, 0x8d92_a1b4);
const efficiencyDiff = createEfficiencyDiff(1_200, 0x7081_92a3);
const efficiencyBoundaryCosts = [
  ['zero', 0],
  ['fractional below one', 0.5],
  ['exactly one', 1],
  ['first above one', 1 + Number.EPSILON],
] as const;
const largeEditBlockDiff = createLargeEditBlockDiff(100_000);
const overlapDiffs = [createOverlapDiff(4_000, 0x2384_6264), createOverlapDiff(8_000, 0x3383_2795)] as const;
const compactionDiff: GraphemeDiff[] = [];
for (let index = 0; index < 8_000; index++) {
  compactionDiff.push(
    [DELETE, ['a']],
    [EQUAL, ['x', 'y']],
    [INSERT, ['z']],
    [EQUAL, Array.from(` stable-${index.toString(36)} `)],
  );
}

const lowDistanceTokenWorkload = {
  before: tokenizeLines(largeLineWorkload.before, '\n'),
  after: tokenizeLines(largeLineWorkload.after, '\n'),
  shortestEditCost: largeLineWorkload.shortestEditCost,
} satisfies TokenWorkload;
const containedTokens = lowDistanceTokenWorkload.before.slice(17_000, 49_000);
const containmentTokenWorkloads = [
  {
    before: containedTokens,
    after: lowDistanceTokenWorkload.before,
    shortestEditCost: lowDistanceTokenWorkload.before.length - containedTokens.length,
  },
  {
    before: lowDistanceTokenWorkload.before,
    after: containedTokens,
    shortestEditCost: lowDistanceTokenWorkload.before.length - containedTokens.length,
  },
] as const satisfies readonly TokenWorkload[];
const disjointTokenWorkloads = unrelatedLineWorkloads.map((workload): TokenWorkload => ({
  before: tokenizeLines(workload.before, '\n'),
  after: tokenizeLines(workload.after, '\n'),
  shortestEditCost: workload.shortestEditCost,
}));
const reversedUniqueTokenWorkloads = [256, 512].map((tokenCount): TokenWorkload => {
  const before = lowDistanceTokenWorkload.before.slice(0, tokenCount);
  return {
    before,
    after: before.slice().reverse(),
    shortestEditCost: 2 * (tokenCount - 1),
  };
});
const repetitiveTokenWorkload = {
  before: tokenizeGraphemes(unicodeWorkload.before, benchmarkGraphemeSegmenter),
  after: tokenizeGraphemes(unicodeWorkload.after, benchmarkGraphemeSegmenter),
  // Repeated tokens can align more cheaply than the fixture's scripted mutations.
  // Its optimum is intentionally not inferred from the generator.
} satisfies TokenWorkload;

const projectTokens = (diffs: readonly Diff[], exclude: typeof DELETE | typeof INSERT): string[] =>
  diffs.flatMap(([operation, tokens]) => (operation === exclude ? [] : tokens));

const validateNormalized = (diffs: readonly Diff[], label: string): void => {
  for (let index = 0; index < diffs.length; index++) {
    const current = diffs[index];
    if (
      current === undefined ||
      ![DELETE, EQUAL, INSERT].includes(current[0]) ||
      current[1].length === 0 ||
      current[0] === diffs[index - 1]?.[0]
    ) {
      throw new Error(`${label} benchmark normalization preflight failed`);
    }
  }
};

const assertEqualTokens = (actual: readonly string[], expected: readonly string[], label: string): void => {
  if (actual.length !== expected.length || actual.some((token, index) => token !== expected[index])) {
    throw new Error(`${label} benchmark preflight failed`);
  }
};

const validateShortestEditCost = (diffs: readonly Diff[], expected: number, label: string): void => {
  const actual = diffs.reduce((cost, [operation, tokens]) => cost + (operation === EQUAL ? 0 : tokens.length), 0);
  if (actual !== expected) {
    throw new Error(`${label} benchmark shortest-edit preflight failed: expected ${expected}, received ${actual}`);
  }
};

const validateKnownShortestEditCost = (
  workload: { readonly shortestEditCost?: number },
  result: readonly Diff[],
  label: string,
): void => {
  if (workload.shortestEditCost !== undefined) {
    validateShortestEditCost(result, workload.shortestEditCost, label);
  }
};

const validateKnownEditHunkCount = (
  workload: { readonly editHunkCount?: number },
  result: readonly Diff[],
  label: string,
): void => {
  if (workload.editHunkCount === undefined) {
    return;
  }

  const actual = result.reduce(
    (count, [operation], index) =>
      operation !== EQUAL && (index === 0 || result[index - 1]?.[0] === EQUAL) ? count + 1 : count,
    0,
  );
  if (actual !== workload.editHunkCount) {
    throw new Error(
      `${label} benchmark edit-hunk preflight failed: expected ${workload.editHunkCount}, received ${actual}`,
    );
  }
};

const canonicalLines = (text: string, lineEnding: LineEnding): string[] => {
  const tokens = text.split(lineEnding);
  if (tokens.at(-1) === '') {
    tokens.pop();
  }
  return tokens;
};

const validateLineResult = (
  workload: TextWorkload,
  lineEnding: LineEnding = '\n',
  optimizeTrivialCases = false,
): void => {
  const result = diffLines(workload.before, workload.after, { lineEnding, optimizeTrivialCases });
  validateNormalized(result, 'diffLines');
  assertEqualTokens(projectTokens(result, INSERT), canonicalLines(workload.before, lineEnding), 'diffLines before');
  assertEqualTokens(projectTokens(result, DELETE), canonicalLines(workload.after, lineEnding), 'diffLines after');
  validateKnownEditHunkCount(workload, result, 'diffLines');
  validateKnownShortestEditCost(workload, result, 'diffLines');
};

const validateGraphemeResult = (workload: TextWorkload): void => {
  const result = diffGraphemes(workload.before, workload.after, { locale: 'en' });
  validateNormalized(result, 'diffGraphemes');
  if (
    projectTokens(result, INSERT).join('') !== workload.before ||
    projectTokens(result, DELETE).join('') !== workload.after
  ) {
    throw new Error('diffGraphemes benchmark preflight failed');
  }
  validateKnownShortestEditCost(workload, result, 'diffGraphemes');
};

const validateTokenResult = (workload: TokenWorkload, label: string): void => {
  const result = diffTokens(workload.before, workload.after);
  validateNormalized(result, label);
  assertEqualTokens(projectTokens(result, INSERT), workload.before, `${label} before`);
  assertEqualTokens(projectTokens(result, DELETE), workload.after, `${label} after`);
  validateKnownShortestEditCost(workload, result, label);
};

const validateCleanupResult = (input: readonly Diff[], result: readonly Diff[], label: string): void => {
  validateNormalized(result, label);
  assertEqualTokens(projectTokens(result, INSERT), projectTokens(input, INSERT), `${label} before`);
  assertEqualTokens(projectTokens(result, DELETE), projectTokens(input, DELETE), `${label} after`);
};

const validateSemanticDiagnosticResult = (
  input: readonly Diff[],
  result: readonly Diff[],
  label: string,
  placementChanges: boolean,
): void => {
  validateCleanupResult(input, result, label);
  const samePlacement =
    input.length === result.length &&
    input.every(
      ([operation, tokens], index) =>
        operation === result[index]?.[0] &&
        tokens.length === result[index]?.[1].length &&
        tokens.every((token, tokenIndex) => token === result[index]?.[1][tokenIndex]),
    );
  if (samePlacement === placementChanges) {
    throw new Error(`${label} benchmark did not exercise its expected semantic placement`);
  }
};

const validateRepresentativeDistributionWorkload = ({
  changeRatioLabel,
  changedPortion,
  inputSizeLabel,
  requestedEditHunkCount,
  targetByteCount,
  workload,
}: RepresentativeDistributionWorkload): void => {
  if (workload.before.length !== targetByteCount || workload.after.length !== targetByteCount) {
    throw new Error(`${inputSizeLabel} representative benchmark did not preserve its target byte size`);
  }

  let actualChangedCharacterCount = 0;
  for (let index = 0; index < workload.before.length; index++) {
    if (workload.before[index] !== workload.after[index]) {
      actualChangedCharacterCount++;
    }
  }

  const expectedChangedCharacterCount =
    changedPortion === 0 ? 0 : Math.max(1, Math.round(targetByteCount * changedPortion));
  if (
    workload.changedCharacterCount !== expectedChangedCharacterCount ||
    actualChangedCharacterCount !== expectedChangedCharacterCount
  ) {
    throw new Error(`${changeRatioLabel} representative benchmark did not realize its target change ratio`);
  }
  if (workload.editHunkCount > requestedEditHunkCount) {
    throw new Error(`${changeRatioLabel} representative benchmark exceeded its requested edit fragmentation`);
  }

  validateLineResult(workload);
};

beforeAll(() => {
  if (representativeDistributionWorkloads.length !== 100 || representativeDistributionSchedule.length !== 1_000) {
    throw new Error('Representative benchmark distribution has an unexpected number of cases');
  }
  const validatedRepresentativeWorkloads = new Set<SizedLineWorkload>();
  for (const representativeWorkload of representativeDistributionWorkloads) {
    if (!validatedRepresentativeWorkloads.has(representativeWorkload.workload)) {
      validateRepresentativeDistributionWorkload(representativeWorkload);
      validatedRepresentativeWorkloads.add(representativeWorkload.workload);
    }
  }
  for (const { lineEnding, workload } of representativeLineWorkloads) {
    validateLineResult(workload, lineEnding);
  }
  for (const { workload } of representativeProseWorkloads) {
    validateGraphemeResult(workload);
    const proseDiff = diffGraphemes(workload.before, workload.after, { locale: 'en' });
    validateCleanupResult(proseDiff, cleanupSemantic(proseDiff, { locale: 'en' }), 'representative prose cleanup');
  }
  validateGraphemeResult(shortMixedUnicodeWorkload);
  validateTokenResult(lowDistanceTokenWorkload, 'diffTokens low-distance');
  for (const [index, workload] of containmentTokenWorkloads.entries()) {
    validateTokenResult(workload, `diffTokens containment ${index + 1}`);
  }
  for (const [index, workload] of disjointTokenWorkloads.entries()) {
    validateTokenResult(workload, `diffTokens disjoint ${index + 1}`);
  }
  for (const [index, workload] of reversedUniqueTokenWorkloads.entries()) {
    validateTokenResult(workload, `diffTokens reversed unique ${index + 1}`);
  }
  validateTokenResult(repetitiveTokenWorkload, 'diffTokens repetitive');
  validateLineResult(largeLineWorkload);
  validateLineResult(insignificantTerminalEndingLineWorkload);
  validateLineResult(insignificantTerminalEndingLineWorkload, '\n', true);
  validateLineResult(crlfLineWorkload, '\r\n');
  for (const workload of unrelatedLineWorkloads) {
    validateLineResult(workload);
  }
  validateGraphemeResult(unicodeWorkload);
  validateGraphemeResult(denseGraphemeWorkload);
  validateGraphemeResult(largeProseWorkload);
  const proseDiff = diffGraphemes(largeProseWorkload.before, largeProseWorkload.after, { locale: 'en' });
  validateCleanupResult(proseDiff, cleanupSemantic(proseDiff, { locale: 'en' }), 'composed cleanupSemantic');
  validateSemanticDiagnosticResult(
    semanticNoShiftDiff,
    cleanupSemantic(semanticNoShiftDiff, { locale: 'en' }),
    'cleanupSemantic no-shift',
    false,
  );
  validateSemanticDiagnosticResult(
    semanticDiff,
    cleanupSemantic(semanticDiff, { locale: 'en' }),
    'cleanupSemantic one-alternative',
    true,
  );
  validateSemanticDiagnosticResult(
    semanticManyAlternativeDiff,
    cleanupSemantic(semanticManyAlternativeDiff, { locale: 'en' }),
    'cleanupSemantic many-alternative',
    true,
  );
  validateSemanticDiagnosticResult(
    semanticCurrentWinnerDiff,
    cleanupSemantic(semanticCurrentWinnerDiff, { locale: 'en' }),
    'cleanupSemantic current-winner',
    false,
  );
  for (const input of overlapDiffs) {
    validateCleanupResult(input, cleanupSemantic(input, { locale: 'en' }), 'cleanupSemantic overlap');
  }
  validateCleanupResult(compactionDiff, coalesce(compactionDiff), 'copy semantic result');
  validateCleanupResult(compactionDiff, compactOwned(compactionDiff.slice()), 'compact semantic result');
  validateCleanupResult(efficiencyDiff, cleanupEfficiency(efficiencyDiff), 'cleanupEfficiency');
  validateCleanupResult(efficiencyDiff, cleanupEfficiency(efficiencyDiff, { editCost: 8 }), 'custom cleanupEfficiency');
  for (const [label, editCost] of efficiencyBoundaryCosts) {
    validateCleanupResult(
      efficiencyDiff,
      cleanupEfficiency(efficiencyDiff, { editCost }),
      `cleanupEfficiency ${label}`,
    );
  }
  validateCleanupResult(
    largeEditBlockDiff,
    cleanupEfficiency(largeEditBlockDiff),
    'cleanupEfficiency large edit block',
  );
});

describe('weighted representative score', () => {
  bench(
    '1,000 diffLines calls across the documented size, change-ratio, and edit-topology mix',
    () => {
      for (const { workload } of representativeDistributionSchedule) {
        void diffLines(workload.before, workload.after);
      }
    },
    representativeScoreOptions,
  );
});

describe('representative public API diagnostic benchmarks', () => {
  describe('diffLines', () => {
    for (const { label, lineEnding, workload } of representativeLineWorkloads) {
      bench(label, () => void diffLines(workload.before, workload.after, { lineEnding }), benchmarkOptions);
    }
  });

  describe('diffGraphemes', () => {
    for (const { sentenceCount, workload } of representativeProseWorkloads) {
      const graphemeCount = tokenizeGraphemes(workload.before, benchmarkGraphemeSegmenter).length;
      bench(
        `${graphemeCount} ASCII prose graphemes in ${sentenceCount} sentences with local word edits`,
        () => void diffGraphemes(workload.before, workload.after, { locale: 'en' }),
        benchmarkOptions,
      );
    }

    bench(
      'short mixed-Unicode text with three local edits',
      () => void diffGraphemes(shortMixedUnicodeWorkload.before, shortMixedUnicodeWorkload.after, { locale: 'en' }),
      benchmarkOptions,
    );
  });

  describe('composed grapheme diff and cleanup', () => {
    for (const { sentenceCount, workload } of representativeProseWorkloads) {
      bench(
        `${sentenceCount} ASCII prose sentences with local word edits`,
        () =>
          void cleanupSemantic(diffGraphemes(workload.before, workload.after, { locale: 'en' }), {
            locale: 'en',
          }),
        benchmarkOptions,
      );
    }
  });
});

describe('algorithm scale and adversarial benchmarks', () => {
  bench(
    '66,000 unique tokens with sparse low-distance edits',
    () => void diffTokens(lowDistanceTokenWorkload.before, lowDistanceTokenWorkload.after),
    benchmarkOptions,
  );

  bench(
    '32,000 unique tokens contained in 66,000 tokens',
    () => void diffTokens(containmentTokenWorkloads[0].before, containmentTokenWorkloads[0].after),
    benchmarkOptions,
  );

  bench(
    '66,000 unique tokens containing 32,000 tokens',
    () => void diffTokens(containmentTokenWorkloads[1].before, containmentTokenWorkloads[1].after),
    benchmarkOptions,
  );

  for (const [index, workload] of disjointTokenWorkloads.entries()) {
    bench(
      `${400 * 2 ** index} disjoint tokens per side`,
      () => void diffTokens(workload.before, workload.after),
      benchmarkOptions,
    );
  }

  for (const [index, workload] of reversedUniqueTokenWorkloads.entries()) {
    bench(
      `${256 * 2 ** index} reversed unique tokens`,
      () => void diffTokens(workload.before, workload.after),
      benchmarkOptions,
    );
  }

  bench(
    '20,000 repetitive mixed-Unicode tokens with sparse edits',
    () => void diffTokens(repetitiveTokenWorkload.before, repetitiveTokenWorkload.after),
    benchmarkOptions,
  );
});

describe('public API scale, edge, and adversarial benchmarks', () => {
  describe('diffLines', () => {
    bench(
      '66,000 equal unique LF lines (default path)',
      () => void diffLines(largeLineWorkload.before, largeLineWorkload.before),
      benchmarkOptions,
    );

    bench(
      '66,000 equal unique LF lines (fast path, same source)',
      () =>
        void diffLines(largeLineWorkload.before, largeLineWorkload.before, {
          optimizeTrivialCases: true,
        }),
      benchmarkOptions,
    );

    bench(
      '66,000 equal unique LF lines (fast path, independently constructed)',
      () =>
        void diffLines(largeLineWorkload.before, independentlyConstructedEqualLines, {
          optimizeTrivialCases: true,
        }),
      benchmarkOptions,
    );

    bench(
      '66,000 unique LF lines with one insignificant terminal ending (default path)',
      () =>
        void diffLines(insignificantTerminalEndingLineWorkload.before, insignificantTerminalEndingLineWorkload.after),
      benchmarkOptions,
    );

    bench(
      '66,000 unique LF lines with one insignificant terminal ending (trivial-case fast path)',
      () =>
        void diffLines(insignificantTerminalEndingLineWorkload.before, insignificantTerminalEndingLineWorkload.after, {
          optimizeTrivialCases: true,
        }),
      benchmarkOptions,
    );

    bench(
      '66,000 unique LF lines inserted (default path)',
      () => void diffLines('', largeLineWorkload.before),
      benchmarkOptions,
    );

    bench(
      '66,000 unique LF lines inserted (trivial-case fast path)',
      () => void diffLines('', largeLineWorkload.before, { optimizeTrivialCases: true }),
      benchmarkOptions,
    );

    bench(
      '66,000 unique LF lines deleted (default path)',
      () => void diffLines(largeLineWorkload.before, ''),
      benchmarkOptions,
    );

    bench(
      '66,000 unique LF lines deleted (trivial-case fast path)',
      () => void diffLines(largeLineWorkload.before, '', { optimizeTrivialCases: true }),
      benchmarkOptions,
    );

    bench(
      '66,000 unique LF lines with sparse edits',
      () => void diffLines(largeLineWorkload.before, largeLineWorkload.after),
      benchmarkOptions,
    );

    bench(
      '24,000 unique CRLF lines with sparse edits',
      () => void diffLines(crlfLineWorkload.before, crlfLineWorkload.after, { lineEnding: '\r\n' }),
      benchmarkOptions,
    );

    for (const [index, workload] of unrelatedLineWorkloads.entries()) {
      bench(
        `${400 * 2 ** index} lines with no common tokens`,
        () => void diffLines(workload.before, workload.after),
        benchmarkOptions,
      );
    }
  });

  describe('diffGraphemes', () => {
    bench(
      '20,000 equal mixed Unicode graphemes (default path)',
      () => void diffGraphemes(unicodeWorkload.before, unicodeWorkload.before, { locale: 'en' }),
      benchmarkOptions,
    );

    bench(
      '20,000 equal mixed Unicode graphemes (fast path, same source)',
      () =>
        void diffGraphemes(unicodeWorkload.before, unicodeWorkload.before, {
          locale: 'en',
          optimizeTrivialCases: true,
        }),
      benchmarkOptions,
    );

    bench(
      '20,000 equal mixed Unicode graphemes (fast path, independently constructed)',
      () =>
        void diffGraphemes(unicodeWorkload.before, independentlyConstructedEqualGraphemes, {
          locale: 'en',
          optimizeTrivialCases: true,
        }),
      benchmarkOptions,
    );

    bench(
      '20,000 mixed Unicode graphemes inserted (default path)',
      () => void diffGraphemes('', unicodeWorkload.before, { locale: 'en' }),
      benchmarkOptions,
    );

    bench(
      '20,000 mixed Unicode graphemes inserted (trivial-case fast path)',
      () => void diffGraphemes('', unicodeWorkload.before, { locale: 'en', optimizeTrivialCases: true }),
      benchmarkOptions,
    );

    bench(
      '20,000 mixed Unicode graphemes deleted (default path)',
      () => void diffGraphemes(unicodeWorkload.before, '', { locale: 'en' }),
      benchmarkOptions,
    );

    bench(
      '20,000 mixed Unicode graphemes deleted (trivial-case fast path)',
      () => void diffGraphemes(unicodeWorkload.before, '', { locale: 'en', optimizeTrivialCases: true }),
      benchmarkOptions,
    );

    bench(
      '20,000 mixed Unicode graphemes with sparse edits',
      () => void diffGraphemes(unicodeWorkload.before, unicodeWorkload.after, { locale: 'en' }),
      benchmarkOptions,
    );

    bench(
      '1,500 graphemes with no common tokens',
      () => void diffGraphemes(denseGraphemeWorkload.before, denseGraphemeWorkload.after),
      benchmarkOptions,
    );
  });

  describe('cleanupSemantic', () => {
    bench(
      '2,000 generated edits with no reachable alternative',
      () => void cleanupSemantic(semanticNoShiftDiff, { locale: 'en' }),
      benchmarkOptions,
    );

    bench(
      '2,000 generated word-boundary edits with one alternative',
      () => void cleanupSemantic(semanticDiff, { locale: 'en' }),
      benchmarkOptions,
    );

    bench(
      '2,000 generated edits with 32 alternatives',
      () => void cleanupSemantic(semanticManyAlternativeDiff, { locale: 'en' }),
      benchmarkOptions,
    );

    bench(
      '2,000 generated edits with 32 alternatives and the current placement winning',
      () => void cleanupSemantic(semanticCurrentWinnerDiff, { locale: 'en' }),
      benchmarkOptions,
    );

    bench(
      'diff and clean 600 generated sentences',
      () =>
        void cleanupSemantic(diffGraphemes(largeProseWorkload.before, largeProseWorkload.after, { locale: 'en' }), {
          locale: 'en',
        }),
      benchmarkOptions,
    );

    for (const [index, input] of overlapDiffs.entries()) {
      bench(
        `${4_000 * 2 ** index} generated deletion/insertion overlaps`,
        () => void cleanupSemantic(input, { locale: 'en' }),
        benchmarkOptions,
      );
    }
  });

  describe('semantic result compaction', () => {
    bench('copy 8,000 short-overlap groups', () => void coalesce(compactionDiff), benchmarkOptions);

    bench('compact 8,000 owned short-overlap groups', () => void compactOwned(compactionDiff), benchmarkOptions);
  });

  describe('cleanupEfficiency', () => {
    for (const [label, editCost] of efficiencyBoundaryCosts) {
      bench(
        `1,200 generated short equalities at ${label} edit cost`,
        () => void cleanupEfficiency(efficiencyDiff, { editCost }),
        benchmarkOptions,
      );
    }

    bench(
      '1,200 generated short equalities at default cost',
      () => void cleanupEfficiency(efficiencyDiff),
      benchmarkOptions,
    );

    bench(
      '1,200 generated short equalities at custom cost',
      () => void cleanupEfficiency(efficiencyDiff, { editCost: 8 }),
      benchmarkOptions,
    );

    bench(
      '100,000-token deletion and insertion block',
      () => void cleanupEfficiency(largeEditBlockDiff),
      benchmarkOptions,
    );
  });
});

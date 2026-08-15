import { beforeAll, bench, describe } from 'vitest';
import {
  DELETE,
  EQUAL,
  INSERT,
  cleanupEfficiency,
  cleanupSemantic,
  diffGraphemes,
  diffLines,
  type Diff,
  type LineEnding,
} from '../../src/index';
import { coalesce, compactOwned, type GraphemeDiff } from '../../src/cleanup/common';
import {
  createDenseGraphemeWorkload,
  createEfficiencyDiff,
  createGraphemeWorkload,
  createLargeEditBlockDiff,
  createLineWorkload,
  createOverlapDiff,
  createProseWorkload,
  createSemanticDiff,
  createUnrelatedLineWorkload,
} from './fixtures';

const benchmarkOptions = {
  iterations: 3,
  time: 300,
  warmupIterations: 1,
  warmupTime: 75,
} as const;

// Fixed seeds keep every generated workload identical across processes and runs.
const largeLineWorkload = createLineWorkload(66_000, '\n', 0x1a2b_3c4d);
const independentlyConstructedEqualLines = `_${largeLineWorkload.before}`.slice(1);
const crlfLineWorkload = createLineWorkload(24_000, '\r\n', 0x2b3c_4d5e);
const unrelatedLineWorkloads = [
  createUnrelatedLineWorkload(400, 0x3141_5926),
  createUnrelatedLineWorkload(800, 0x5358_9793),
] as const;
const unicodeWorkload = createGraphemeWorkload(20_000, 0x3c4d_5e6f);
const independentlyConstructedEqualGraphemes = `_${unicodeWorkload.before}`.slice(1);
const denseGraphemeWorkload = createDenseGraphemeWorkload(1_500, 0x4d5e_6f70);
const proseWorkload = createProseWorkload(600, 0x5e6f_7081);
const semanticDiff = createSemanticDiff(2_000, 0x6f70_8192);
const efficiencyDiff = createEfficiencyDiff(1_200, 0x7081_92a3);
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

const canonicalLines = (text: string, lineEnding: LineEnding): string[] => {
  const tokens = text.split(lineEnding);
  if (tokens.at(-1) === '') {
    tokens.pop();
  }
  return tokens;
};

const validateLineResult = (workload: TextWorkload, lineEnding: LineEnding = '\n'): void => {
  const result = diffLines(workload.before, workload.after, { lineEnding });
  validateNormalized(result, 'diffLines');
  assertEqualTokens(projectTokens(result, INSERT), canonicalLines(workload.before, lineEnding), 'diffLines before');
  assertEqualTokens(projectTokens(result, DELETE), canonicalLines(workload.after, lineEnding), 'diffLines after');
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
};

const validateCleanupResult = (input: readonly Diff[], result: readonly Diff[], label: string): void => {
  validateNormalized(result, label);
  assertEqualTokens(projectTokens(result, INSERT), projectTokens(input, INSERT), `${label} before`);
  assertEqualTokens(projectTokens(result, DELETE), projectTokens(input, DELETE), `${label} after`);
};

interface TextWorkload {
  readonly before: string;
  readonly after: string;
}

beforeAll(() => {
  validateLineResult(largeLineWorkload);
  validateLineResult(crlfLineWorkload, '\r\n');
  for (const workload of unrelatedLineWorkloads) {
    validateLineResult(workload);
  }
  validateGraphemeResult(unicodeWorkload);
  validateGraphemeResult(denseGraphemeWorkload);
  validateGraphemeResult(proseWorkload);
  const proseDiff = diffGraphemes(proseWorkload.before, proseWorkload.after, { locale: 'en' });
  validateCleanupResult(proseDiff, cleanupSemantic(proseDiff, { locale: 'en' }), 'composed cleanupSemantic');
  validateCleanupResult(semanticDiff, cleanupSemantic(semanticDiff, { locale: 'en' }), 'cleanupSemantic');
  for (const input of overlapDiffs) {
    validateCleanupResult(input, cleanupSemantic(input, { locale: 'en' }), 'cleanupSemantic overlap');
  }
  validateCleanupResult(compactionDiff, coalesce(compactionDiff), 'copy semantic result');
  validateCleanupResult(compactionDiff, compactOwned(compactionDiff.slice()), 'compact semantic result');
  validateCleanupResult(efficiencyDiff, cleanupEfficiency(efficiencyDiff), 'cleanupEfficiency');
  validateCleanupResult(efficiencyDiff, cleanupEfficiency(efficiencyDiff, { editCost: 8 }), 'custom cleanupEfficiency');
  validateCleanupResult(
    largeEditBlockDiff,
    cleanupEfficiency(largeEditBlockDiff),
    'cleanupEfficiency large edit block',
  );
});

describe('public API benchmarks', () => {
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
          optimizeIdenticalInputs: true,
        }),
      benchmarkOptions,
    );

    bench(
      '66,000 equal unique LF lines (fast path, independently constructed)',
      () =>
        void diffLines(largeLineWorkload.before, independentlyConstructedEqualLines, {
          optimizeIdenticalInputs: true,
        }),
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
          optimizeIdenticalInputs: true,
        }),
      benchmarkOptions,
    );

    bench(
      '20,000 equal mixed Unicode graphemes (fast path, independently constructed)',
      () =>
        void diffGraphemes(unicodeWorkload.before, independentlyConstructedEqualGraphemes, {
          locale: 'en',
          optimizeIdenticalInputs: true,
        }),
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

    bench(
      'short mixed-Unicode call throughput',
      () => void diffGraphemes('Cafe\u0301 👩‍💻 🇺🇳', 'Café 👩‍🔬 🇺🇸', { locale: 'en' }),
      benchmarkOptions,
    );
  });

  describe('cleanupSemantic', () => {
    bench(
      '2,000 generated word-boundary edits',
      () => void cleanupSemantic(semanticDiff, { locale: 'en' }),
      benchmarkOptions,
    );

    bench(
      'diff and clean 600 generated sentences',
      () =>
        void cleanupSemantic(diffGraphemes(proseWorkload.before, proseWorkload.after, { locale: 'en' }), {
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

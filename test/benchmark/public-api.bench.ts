import { beforeAll, bench, describe } from 'vitest';
import { DELETE, EQUAL, INSERT, cleanupEfficiency, cleanupSemantic, type Diff } from '../../src/cleanup.js';
import { diffGraphemes } from '../../src/grapheme.js';
import { diffLines, type LineEnding } from '../../src/line.js';
import { diffTokens } from '../../src/algorithm/myers';
import { coalesce, compactOwned, type GraphemeDiff } from '../../src/cleanup/common';
import { tokenizeGraphemes } from '../../src/tokenize/graphemes';
import { tokenizeLines } from '../../src/tokenize/lines';
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
  type TextWorkload,
} from './fixtures';

const benchmarkOptions = {
  iterations: 3,
  time: 300,
  warmupIterations: 1,
  warmupTime: 75,
} as const;

interface TokenWorkload {
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly shortestEditCost?: number;
}

// Fixed seeds keep every generated workload identical across processes and runs.
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
const proseWorkload = createProseWorkload(600, 0x5e6f_7081);
const semanticDiff = createSemanticDiff(2_000, 0x6f70_8192);
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
  before: tokenizeLines(largeLineWorkload.before),
  after: tokenizeLines(largeLineWorkload.after),
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
  before: tokenizeLines(workload.before),
  after: tokenizeLines(workload.after),
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
  before: tokenizeGraphemes(unicodeWorkload.before, { locale: 'en' }),
  after: tokenizeGraphemes(unicodeWorkload.after, { locale: 'en' }),
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

beforeAll(() => {
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

describe('diffTokens benchmarks', () => {
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

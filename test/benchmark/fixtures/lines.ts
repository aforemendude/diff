import { createRandom } from './random.js';
import type { CertifiedTextWorkload, SizedLineWorkload } from './types.js';

const distributeTotal = (total: number, groupCount: number): number[] => {
  const quotient = Math.floor(total / groupCount);
  const remainder = total % groupCount;
  return Array.from({ length: groupCount }, (_, index) => quotient + (index < remainder ? 1 : 0));
};

interface SizedLineSource {
  readonly before: string;
  readonly beforeLines: readonly string[];
  readonly lineCount: number;
  readonly minimumMutableCharacters: number;
}

const sizedLineSources = new Map<number, SizedLineSource>();
const representativeCharactersPerLine = 47;
const representativeMinimumLineCount = 199;
const representativeMaximumLineCount = 1_344;

const createSizedLineSource = (byteCount: number, maximumLineCount: number): SizedLineSource => {
  const cached = sizedLineSources.get(byteCount);
  if (cached !== undefined) {
    return cached;
  }

  // A fixed line layout for each byte size lets change-ratio and fragmentation variants share their original string
  // without affecting the timed calls.
  const lineCount = Math.min(
    maximumLineCount,
    Math.max(3, Math.floor(byteCount / representativeCharactersPerLine), representativeMinimumLineCount),
  );
  const sourceCharacterCount = byteCount - lineCount + 1;
  const lineLengths = distributeTotal(sourceCharacterCount, lineCount);
  const beforeLines = lineLengths.map((lineLength, index) => {
    const prefix = `b${index.toString(36)}|`;
    return `${prefix}${'x'.repeat(lineLength - prefix.length)}`;
  });
  const source = {
    before: beforeLines.join('\n'),
    beforeLines,
    lineCount,
    minimumMutableCharacters: Math.min(
      ...beforeLines.map((line, index) => line.length - `b${index.toString(36)}|`.length + 1),
    ),
  };
  sizedLineSources.set(byteCount, source);
  return source;
};

/**
 * Create an exact-size ASCII line workload for the representative benchmark.
 *
 * Changed lines remain unique replacements, so the unchanged lines are a proven longest common subsequence even when
 * only part of each replacement line changes.
 */
export const createSizedLineWorkload = (
  byteCount: number,
  changedPortion: number,
  requestedEditHunkCount: number,
): SizedLineWorkload => {
  const minimumLineLength = 12;
  const maximumLineCount = Math.min(
    representativeMaximumLineCount,
    Math.floor((byteCount + 1) / (minimumLineLength + 1)),
  );
  if (
    !Number.isInteger(byteCount) ||
    byteCount < 100 ||
    changedPortion < 0 ||
    changedPortion > 1 ||
    !Number.isInteger(requestedEditHunkCount) ||
    requestedEditHunkCount < 0 ||
    (changedPortion === 0) !== (requestedEditHunkCount === 0) ||
    maximumLineCount < 3
  ) {
    throw new Error('Sized-line benchmark parameters are outside their supported ranges');
  }

  const changedCharacterCount = changedPortion === 0 ? 0 : Math.max(1, Math.round(byteCount * changedPortion));
  const source = createSizedLineSource(byteCount, maximumLineCount);

  if (changedCharacterCount === 0) {
    return {
      before: source.before,
      after: source.before,
      changedCharacterCount,
      editHunkCount: 0,
      shortestEditCost: 0,
    };
  }

  const possibleHunkCount = Math.min(requestedEditHunkCount, changedCharacterCount);
  const changedLineCount = Math.min(
    source.lineCount,
    Math.max(possibleHunkCount, Math.ceil(changedCharacterCount / source.minimumMutableCharacters)),
  );
  const editHunkCount = Math.min(possibleHunkCount, changedLineCount, source.lineCount - changedLineCount + 1);
  const changedLinesPerHunk = distributeTotal(changedLineCount, editHunkCount);
  const unchangedGapSizes = Array.from({ length: editHunkCount + 1 }, () => 0);

  for (let index = 1; index < editHunkCount; index++) {
    unchangedGapSizes[index] = 1;
  }

  const distributableUnchangedLines = source.lineCount - changedLineCount - editHunkCount + 1;
  for (let index = 0; index < distributableUnchangedLines; index++) {
    const gapIndex = index % unchangedGapSizes.length;
    unchangedGapSizes[gapIndex] = (unchangedGapSizes[gapIndex] ?? 0) + 1;
  }

  const changedLineIndexes: number[] = [];
  let lineIndex = unchangedGapSizes[0] ?? 0;
  for (let hunkIndex = 0; hunkIndex < editHunkCount; hunkIndex++) {
    const changedLinesInHunk = changedLinesPerHunk[hunkIndex] ?? 0;
    for (let index = 0; index < changedLinesInHunk; index++) {
      changedLineIndexes.push(lineIndex++);
    }
    lineIndex += unchangedGapSizes[hunkIndex + 1] ?? 0;
  }

  const afterLines = source.beforeLines.slice();
  const additionalChangesByLine = distributeTotal(
    changedCharacterCount - changedLineIndexes.length,
    changedLineIndexes.length,
  );
  for (const [changedIndex, sourceLineIndex] of changedLineIndexes.entries()) {
    const original = source.beforeLines[sourceLineIndex];
    if (original === undefined) {
      throw new Error('Sized-line benchmark generated an out-of-range edit');
    }

    const identifier = sourceLineIndex.toString(36);
    const fillerLength = original.length - identifier.length - 2;
    const additionalChanges = additionalChangesByLine[changedIndex] ?? 0;
    if (additionalChanges > fillerLength) {
      throw new Error('Sized-line benchmark could not realize its requested change ratio');
    }
    afterLines[sourceLineIndex] = `a${identifier}|${'y'.repeat(additionalChanges)}${'x'.repeat(
      fillerLength - additionalChanges,
    )}`;
  }

  return {
    before: source.before,
    after: afterLines.join('\n'),
    changedCharacterCount,
    editHunkCount,
    shortestEditCost: changedLineCount * 2,
  };
};

export const createUnrelatedLineWorkload = (lineCount: number, seed: number): CertifiedTextWorkload => {
  const random = createRandom(seed);
  const before = Array.from(
    { length: lineCount },
    (_, index) => `before-${index.toString(36)}-${random().toString(16)}`,
  );
  const after = Array.from({ length: lineCount }, (_, index) => `after-${index.toString(36)}-${random().toString(16)}`);
  return {
    before: before.join('\n'),
    after: after.join('\n'),
    shortestEditCost: before.length + after.length,
  };
};

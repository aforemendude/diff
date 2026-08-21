import type { CertifiedTextWorkload } from './types.js';

const validateLineCount = (lineCount: number): void => {
  if (!Number.isInteger(lineCount) || lineCount < 2) {
    throw new Error('Adaptive-selection benchmark line count must be an integer of at least two');
  }
};

const createUniqueTokens = (lineCount: number, prefix: string): string[] =>
  Array.from({ length: lineCount }, (_, index) => `${prefix}-${index.toString(36)}`);

const createWorkload = (
  beforeTokens: readonly string[],
  afterTokens: readonly string[],
  shortestEditCost: number,
): CertifiedTextWorkload => ({
  after: afterTokens.join('\n'),
  before: beforeTokens.join('\n'),
  shortestEditCost,
});

/** Create unique inputs whose only cross-input matches occur at selected interior positions. */
export const createPartiallySharedUniqueLineWorkload = (
  lineCount: number,
  sharedPositionPairCount: number,
): CertifiedTextWorkload => {
  validateLineCount(lineCount);
  if (
    !Number.isInteger(sharedPositionPairCount) ||
    sharedPositionPairCount < 0 ||
    sharedPositionPairCount > lineCount - 2
  ) {
    throw new Error('Adaptive-selection shared-position-pair count is outside its supported range');
  }

  const beforeTokens = createUniqueTokens(lineCount, 'before');
  const afterTokens = createUniqueTokens(lineCount, 'after');

  for (let matchIndex = 0; matchIndex < sharedPositionPairCount; matchIndex++) {
    const position = Math.floor(((matchIndex + 1) * (lineCount - 1)) / (sharedPositionPairCount + 1));
    afterTokens[position] = beforeTokens[position] as string;
  }

  return createWorkload(beforeTokens, afterTokens, 2 * (lineCount - sharedPositionPairCount));
};

/** Create two equal-length unique inputs in reverse order, whose LCS has length one. */
export const createReversedUniqueLineWorkload = (lineCount: number): CertifiedTextWorkload => {
  validateLineCount(lineCount);
  const beforeTokens = createUniqueTokens(lineCount, 'token');
  return createWorkload(beforeTokens, beforeTokens.toReversed(), 2 * lineCount - 2);
};

/** Create a distance-two rotation over unique tokens with no aligned common boundary. */
export const createMostlyEqualUniqueLineWorkload = (lineCount: number): CertifiedTextWorkload => {
  validateLineCount(lineCount);
  const beforeTokens = createUniqueTokens(lineCount, 'token');
  const last = beforeTokens.at(-1) as string;
  return createWorkload(beforeTokens, [last, ...beforeTokens.slice(0, -1)], 2);
};

/** Create a distance-two rotation whose repeated-token match relation is quadratic. */
export const createDuplicateHeavyLineWorkload = (lineCount: number, alphabetSize: number): CertifiedTextWorkload => {
  validateLineCount(lineCount);
  if (!Number.isInteger(alphabetSize) || alphabetSize < 2 || lineCount % alphabetSize !== 0) {
    throw new Error('Adaptive-selection duplicate alphabet must divide the line count and contain at least two tokens');
  }

  const beforeTokens = Array.from({ length: lineCount }, (_, index) => `repeat-${(index % alphabetSize).toString(36)}`);
  return createWorkload(beforeTokens, [...beforeTokens.slice(1), beforeTokens[0] as string], 2);
};

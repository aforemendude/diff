import { cleanupEfficiencyCore } from './cleanup/efficiency.js';
import { cleanupSemanticCore } from './cleanup/semantic.js';
import type { CleanupEfficiencyOptions, Diff, SegmentOptions } from './types.js';

/** Apply semantic cleanup to grapheme tokens without splitting a token or mutating the input. */
export const cleanupSemantic = (diffs: readonly Diff[], options: SegmentOptions = {}): readonly Diff[] => {
  const wordSegmenter = new Intl.Segmenter(options.locale, { granularity: 'word' });
  return cleanupSemanticCore(diffs, wordSegmenter);
};

/** Apply efficiency cleanup to grapheme tokens without splitting a token or mutating the input. */
export const cleanupEfficiency = (diffs: readonly Diff[], options: CleanupEfficiencyOptions = {}): readonly Diff[] => {
  const editCost = options.editCost ?? 4;
  if (!Number.isFinite(editCost) || editCost < 0) {
    throw new RangeError('editCost must be a finite, non-negative number');
  }

  return cleanupEfficiencyCore(diffs, editCost);
};

export { DELETE, EQUAL, INSERT } from './types.js';
export type { CleanupEfficiencyOptions, Diff, DiffOperation, SegmentOptions } from './types.js';

import { cleanupSemantic } from '../cleanup/semantic';
import type { Diff, TextDiffOptions } from '../types';
import { diffGraphemes } from './grapheme';

/** Compute a grapheme-safe text diff with semantic cleanup by default. */
export const diffText = (before: string, after: string, options: TextDiffOptions = {}): readonly Diff[] => {
  const diffs = diffGraphemes(before, after, options);
  return options.cleanup === 'none' ? diffs : cleanupSemantic(diffs, options);
};

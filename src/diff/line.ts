import { diffTokens } from '../algorithm/myers';
import { tokenizeLines } from '../tokenize/lines';
import type { Diff } from '../types';
import { joinTokenDiffs } from './from-tokens';

/** Compute a line-level diff while preserving exact line endings. */
export const diffLines = (before: string, after: string): readonly Diff[] =>
  joinTokenDiffs(diffTokens(tokenizeLines(before), tokenizeLines(after)));

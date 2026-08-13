import { diffTokens } from '../algorithm/myers';
import { tokenizeLines } from '../tokenize/lines';
import type { Diff, LineDiffOptions } from '../types';

/** Compute a line-level diff using one exact line ending as the delimiter. */
export const diffLines = (before: string, after: string, options: LineDiffOptions = {}): readonly Diff[] => {
  const lineEnding = options.lineEnding ?? '\n';
  return diffTokens(tokenizeLines(before, lineEnding), tokenizeLines(after, lineEnding));
};

import { diffTokens } from '../algorithm/myers';
import { tokenizeLines } from '../tokenize/lines';
import type { Diff, LineEnding } from '../types';

/** Compute a line-level diff using one exact line ending as the delimiter. */
export const diffLines = (before: string, after: string, lineEnding: LineEnding = '\n'): readonly Diff[] =>
  diffTokens(tokenizeLines(before, lineEnding), tokenizeLines(after, lineEnding));

import { diffTokens } from '../algorithm/myers';
import { tokenizeLines } from '../tokenize/lines';
import type { Diff, LineEnding } from '../types';
import { joinTokenDiffs } from './from-tokens';

/** Compute a line-level diff using one exact line ending as the delimiter. */
export const diffLines = (before: string, after: string, lineEnding: LineEnding = '\n'): readonly Diff[] =>
  joinTokenDiffs(diffTokens(tokenizeLines(before, lineEnding), tokenizeLines(after, lineEnding)));

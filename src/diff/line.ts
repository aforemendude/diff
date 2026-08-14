import { diffTokens } from '../algorithm/myers';
import { tokenizeLines } from '../tokenize/lines';
import { EQUAL, type Diff, type LineDiffOptions } from '../types';

/** Compute a line-level diff using one exact line ending as the delimiter. */
export const diffLines = (before: string, after: string, options: LineDiffOptions = {}): readonly Diff[] => {
  const lineEnding = options.lineEnding ?? '\n';

  if (options.optimizeIdenticalInputs && before === after) {
    const tokens = tokenizeLines(before, lineEnding);
    return tokens.length === 0 ? [] : [[EQUAL, tokens]];
  }

  return diffTokens(tokenizeLines(before, lineEnding), tokenizeLines(after, lineEnding));
};

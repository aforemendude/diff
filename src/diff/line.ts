import { diffTokens } from '../algorithm/myers';
import { tokenizeLines } from '../tokenize/lines';
import { DELETE, EQUAL, INSERT, type Diff, type LineDiffOptions } from '../types';

/** Compute a line-level diff using one exact line ending as the delimiter. */
export const diffLines = (before: string, after: string, options: LineDiffOptions = {}): readonly Diff[] => {
  const lineEnding = options.lineEnding ?? '\n';

  if (options.optimizeTrivialCases) {
    if (before === after) {
      const tokens = tokenizeLines(before, lineEnding);
      return tokens.length === 0 ? [] : [[EQUAL, tokens]];
    }
    if (before === '') {
      return [[INSERT, tokenizeLines(after, lineEnding)]];
    }
    if (after === '') {
      return [[DELETE, tokenizeLines(before, lineEnding)]];
    }

    const beforeIsShorter = before.length < after.length;
    const shorter = beforeIsShorter ? before : after;
    const longer = beforeIsShorter ? after : before;
    if (
      shorter.length > 0 &&
      longer.length === shorter.length + lineEnding.length &&
      !shorter.endsWith(lineEnding) &&
      longer.endsWith(lineEnding) &&
      longer.startsWith(shorter)
    ) {
      return [[EQUAL, tokenizeLines(shorter, lineEnding)]];
    }
  }

  return diffTokens(tokenizeLines(before, lineEnding), tokenizeLines(after, lineEnding));
};

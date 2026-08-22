import { MAX_COMBINED_INPUT_LENGTH } from './algorithm/limits.js';
import { diffTokens } from './algorithm/myers.js';
import { tokenizeLines } from './tokenize/lines.js';
import { DELETE, EQUAL, INSERT, type Diff, type DiffAlgorithm, type LineDiffOptions } from './types.js';

/** Compute a shortest insertion/deletion script over lines using one exact line ending as the delimiter. */
export const diffLines = (before: string, after: string, options: LineDiffOptions = {}): readonly Diff[] => {
  if (before.length > MAX_COMBINED_INPUT_LENGTH - after.length) {
    throw new RangeError('Combined input length exceeds 4,294,967,294 UTF-16 code units');
  }

  const algorithm: DiffAlgorithm = options.algorithm === undefined ? 'adaptive' : options.algorithm;
  if (algorithm !== 'adaptive' && algorithm !== 'myers' && algorithm !== 'sparse') {
    throw new RangeError("algorithm must be 'adaptive', 'myers', or 'sparse'");
  }

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

  return diffTokens(tokenizeLines(before, lineEnding), tokenizeLines(after, lineEnding), algorithm);
};

export { DELETE, EQUAL, INSERT } from './types.js';
export type { Diff, DiffAlgorithm, DiffOperation, LineDiffOptions, LineEnding } from './types.js';

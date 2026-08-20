import { MAX_COMBINED_INPUT_LENGTH } from './algorithm/limits.js';
import { diffTokens } from './algorithm/myers.js';
import { tokenizeGraphemes } from './tokenize/graphemes.js';
import { DELETE, EQUAL, INSERT, type Diff, type GraphemeDiffOptions } from './types.js';

/** Compute an exact diff whose smallest indivisible unit is one grapheme. */
export const diffGraphemes = (before: string, after: string, options: GraphemeDiffOptions = {}): readonly Diff[] => {
  if (before.length > MAX_COMBINED_INPUT_LENGTH - after.length) {
    throw new RangeError('Combined input length exceeds 4,294,967,294 UTF-16 code units');
  }

  const segmenter = new Intl.Segmenter(options.locale, { granularity: 'grapheme' });

  if (options.optimizeTrivialCases) {
    if (before === after) {
      const tokens = tokenizeGraphemes(before, segmenter);
      return tokens.length === 0 ? [] : [[EQUAL, tokens]];
    }
    if (before === '') {
      return [[INSERT, tokenizeGraphemes(after, segmenter)]];
    }
    if (after === '') {
      return [[DELETE, tokenizeGraphemes(before, segmenter)]];
    }
  }

  return diffTokens(tokenizeGraphemes(before, segmenter), tokenizeGraphemes(after, segmenter));
};

export { DELETE, EQUAL, INSERT } from './types.js';
export type { Diff, DiffOperation, GraphemeDiffOptions, SegmentOptions } from './types.js';

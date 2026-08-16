import { diffTokens } from '../algorithm/myers.js';
import { assertCombinedInputLength } from '../input-length.js';
import { tokenizeGraphemesWithSegmenter } from '../tokenize/graphemes.js';
import { DELETE, EQUAL, INSERT, type Diff, type GraphemeDiffOptions } from '../types.js';

/** Compute an exact diff whose smallest indivisible unit is one grapheme. */
export const diffGraphemes = (before: string, after: string, options: GraphemeDiffOptions = {}): readonly Diff[] => {
  assertCombinedInputLength(before, after);

  const segmenter = new Intl.Segmenter(options.locale, { granularity: 'grapheme' });

  if (options.optimizeTrivialCases) {
    if (before === after) {
      const tokens = tokenizeGraphemesWithSegmenter(before, segmenter);
      return tokens.length === 0 ? [] : [[EQUAL, tokens]];
    }
    if (before === '') {
      return [[INSERT, tokenizeGraphemesWithSegmenter(after, segmenter)]];
    }
    if (after === '') {
      return [[DELETE, tokenizeGraphemesWithSegmenter(before, segmenter)]];
    }
  }

  return diffTokens(
    tokenizeGraphemesWithSegmenter(before, segmenter),
    tokenizeGraphemesWithSegmenter(after, segmenter),
  );
};

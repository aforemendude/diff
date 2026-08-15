import { diffTokens } from '../algorithm/myers';
import { tokenizeGraphemesWithSegmenter } from '../tokenize/graphemes';
import { DELETE, EQUAL, INSERT, type Diff, type GraphemeDiffOptions } from '../types';

/** Compute an exact diff whose smallest indivisible unit is one grapheme. */
export const diffGraphemes = (before: string, after: string, options: GraphemeDiffOptions = {}): readonly Diff[] => {
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

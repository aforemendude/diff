import { diffTokens } from '../algorithm/myers';
import { tokenizeGraphemesWithSegmenter } from '../tokenize/graphemes';
import { EQUAL, type Diff, type GraphemeDiffOptions } from '../types';

/** Compute an exact diff whose smallest indivisible unit is one grapheme. */
export const diffGraphemes = (before: string, after: string, options: GraphemeDiffOptions = {}): readonly Diff[] => {
  const segmenter = new Intl.Segmenter(options.locale, { granularity: 'grapheme' });

  if (options.optimizeIdenticalInputs && before === after) {
    const tokens = tokenizeGraphemesWithSegmenter(before, segmenter);
    return tokens.length === 0 ? [] : [[EQUAL, tokens]];
  }

  return diffTokens(
    tokenizeGraphemesWithSegmenter(before, segmenter),
    tokenizeGraphemesWithSegmenter(after, segmenter),
  );
};

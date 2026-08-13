import { diffTokens } from '../algorithm/myers';
import { tokenizeGraphemesWithSegmenter } from '../tokenize/graphemes';
import type { Diff, SegmentOptions } from '../types';

/** Compute an exact diff whose smallest indivisible unit is one grapheme. */
export const diffGraphemes = (before: string, after: string, options: SegmentOptions = {}): readonly Diff[] => {
  const segmenter = new Intl.Segmenter(options.locale, { granularity: 'grapheme' });
  return diffTokens(
    tokenizeGraphemesWithSegmenter(before, segmenter),
    tokenizeGraphemesWithSegmenter(after, segmenter),
  );
};

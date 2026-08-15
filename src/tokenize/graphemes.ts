import type { SegmentOptions } from '../types.js';

/** Split text with an existing grapheme segmenter. */
export const tokenizeGraphemesWithSegmenter = (text: string, segmenter: Intl.Segmenter): string[] => {
  const tokens: string[] = [];
  for (const part of segmenter.segment(text)) {
    tokens.push(part.segment);
  }
  return tokens;
};

/** Split text into extended grapheme clusters without normalizing it. */
export const tokenizeGraphemes = (text: string, options: SegmentOptions = {}): string[] => {
  const segmenter = new Intl.Segmenter(options.locale, { granularity: 'grapheme' });
  return tokenizeGraphemesWithSegmenter(text, segmenter);
};

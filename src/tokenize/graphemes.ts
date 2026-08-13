import type { SegmentOptions } from '../types';

/** Split text with an existing grapheme segmenter. */
export const tokenizeGraphemesWithSegmenter = (text: string, segmenter: Intl.Segmenter): string[] =>
  Array.from(segmenter.segment(text), ({ segment }) => segment);

/** Split text into extended grapheme clusters without normalizing it. */
export const tokenizeGraphemes = (text: string, options: SegmentOptions = {}): string[] => {
  const segmenter = new Intl.Segmenter(options.locale, { granularity: 'grapheme' });
  return tokenizeGraphemesWithSegmenter(text, segmenter);
};

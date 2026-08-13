import type { SegmentOptions } from '../types';

/** Split text into extended grapheme clusters without normalizing it. */
export const tokenizeGraphemes = (text: string, options: SegmentOptions = {}): string[] => {
  const segmenter = new Intl.Segmenter(options.locale, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
};

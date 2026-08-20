/** Split text with the grapheme segmenter prepared by the public API. */
export const tokenizeGraphemes = (text: string, segmenter: Intl.Segmenter): string[] => {
  const tokens: string[] = [];
  for (const part of segmenter.segment(text)) {
    tokens.push(part.segment);
  }
  return tokens;
};

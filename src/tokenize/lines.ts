import type { LineEnding } from '../types.js';

/** Split text on one exact line ending and discard exactly one terminal empty segment. */
export const tokenizeLines = (text: string, lineEnding: LineEnding = '\n'): string[] => {
  const tokens = text.split(lineEnding);
  if (tokens[tokens.length - 1] === '') {
    tokens.pop();
  }
  return tokens;
};

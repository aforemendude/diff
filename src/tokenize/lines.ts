import type { LineEnding } from '../types';

/** Split text on one exact line ending, retaining each ending as a token. */
export const tokenizeLines = (text: string, lineEnding: LineEnding = '\n'): string[] => {
  const tokens: string[] = [];
  const contentParts = text.split(lineEnding);

  for (let index = 0; index < contentParts.length; index++) {
    const content = contentParts[index];
    if (content !== undefined && content.length > 0) {
      tokens.push(content);
    }

    if (index < contentParts.length - 1) {
      tokens.push(lineEnding);
    }
  }

  return tokens;
};

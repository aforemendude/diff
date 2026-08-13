/**
 * Split text into atomic line content and line-ending tokens.
 *
 * Keeping every line ending separate makes tokenization stable when an ending
 * changes from terminal to internal (for example, when a line is appended).
 */
export const tokenizeLines = (text: string): string[] => {
  const tokens: string[] = [];
  let contentStart = 0;
  let index = 0;

  while (index < text.length) {
    const character = text[index];
    if (character !== '\n' && character !== '\r') {
      index++;
      continue;
    }

    if (contentStart < index) {
      tokens.push(text.slice(contentStart, index));
    }

    if (character === '\r' && text[index + 1] === '\n') {
      tokens.push('\r\n');
      index += 2;
    } else {
      tokens.push(character);
      index++;
    }
    contentStart = index;
  }

  if (contentStart < text.length) {
    tokens.push(text.slice(contentStart));
  }

  return tokens;
};

import { describe, expect, it } from 'vitest';
import { tokenizeLines } from './lines';

describe('tokenizeLines', () => {
  it('handles empty text and text without a line ending', () => {
    expect(tokenizeLines('')).toEqual([]);
    expect(tokenizeLines('one line')).toEqual(['one line']);
  });

  it.each([
    ['LF', 'first\nsecond', ['first', '\n', 'second']],
    ['CRLF', 'first\r\nsecond', ['first', '\r\n', 'second']],
    ['lone CR', 'first\rsecond', ['first', '\r', 'second']],
  ] as const)('keeps %s endings as atomic tokens', (_name, text, expected) => {
    expect(tokenizeLines(text)).toEqual(expected);
  });

  it('preserves consecutive and mixed endings exactly', () => {
    expect(tokenizeLines('\r\n\n\rtext\r\n')).toEqual(['\r\n', '\n', '\r', 'text', '\r\n']);
  });
});

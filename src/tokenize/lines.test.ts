import { describe, expect, it } from 'vitest';
import type { LineEnding } from '../types';
import { tokenizeLines } from './lines';

describe('tokenizeLines', () => {
  it.each([
    ['LF', '\n'],
    ['CR', '\r'],
    ['CRLF', '\r\n'],
  ] as const satisfies readonly (readonly [string, LineEnding])[])(
    'splits on %s without retaining the ending and removes exactly one trailing empty segment',
    (_name, lineEnding) => {
      expect(tokenizeLines('', lineEnding)).toEqual([]);
      expect(tokenizeLines('a', lineEnding)).toEqual(['a']);
      expect(tokenizeLines(`a${lineEnding}`, lineEnding)).toEqual(['a']);
      expect(tokenizeLines(`a${lineEnding}${lineEnding}`, lineEnding)).toEqual(['a', '']);
      expect(tokenizeLines(lineEnding, lineEnding)).toEqual(['']);
      expect(tokenizeLines(`${lineEnding}${lineEnding}`, lineEnding)).toEqual(['', '']);
      expect(tokenizeLines(`a${lineEnding}${lineEnding}${lineEnding}`, lineEnding)).toEqual(['a', '', '']);
    },
  );

  it('leaves CR in line content when the public API has selected LF', () => {
    expect(tokenizeLines('a\rb\n', '\n')).toEqual(['a\rb']);
  });

  it.each([
    ['LF', '\n', 'first\rsecond\nthird', ['first\rsecond', 'third']],
    ['CR', '\r', 'first\nsecond\rthird', ['first\nsecond', 'third']],
    ['CRLF', '\r\n', 'first\nsecond\rthird\r\nfourth', ['first\nsecond\rthird', 'fourth']],
  ] as const)('leaves non-selected endings in line content when using %s', (_name, lineEnding, text, expected) => {
    expect(tokenizeLines(text, lineEnding)).toEqual(expected);
  });

  it('treats CR and LF within CRLF according to the selected delimiter', () => {
    expect(tokenizeLines('a\r\nb', '\n')).toEqual(['a\r', 'b']);
    expect(tokenizeLines('a\r\nb', '\r')).toEqual(['a', '\nb']);
    expect(tokenizeLines('a\r\nb', '\r\n')).toEqual(['a', 'b']);
  });
});

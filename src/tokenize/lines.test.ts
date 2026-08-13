import { describe, expect, it } from 'vitest';
import type { LineEnding } from '../types';
import { tokenizeLines } from './lines';

describe('tokenizeLines', () => {
  it('handles empty text and text without a line ending', () => {
    expect(tokenizeLines('')).toEqual([]);
    expect(tokenizeLines('one line')).toEqual(['one line']);
  });

  it.each([
    ['LF', '\n', 'first\nsecond', ['first', '\n', 'second']],
    ['CR', '\r', 'first\rsecond', ['first', '\r', 'second']],
    ['CRLF', '\r\n', 'first\r\nsecond', ['first', '\r\n', 'second']],
  ] as const)('keeps the selected %s ending as atomic tokens', (_name, lineEnding, text, expected) => {
    expect(tokenizeLines(text, lineEnding)).toEqual(expected);
  });

  it('uses LF by default and leaves CR in line content', () => {
    expect(tokenizeLines('a\rb\n')).toEqual(['a\rb', '\n']);
  });

  it.each([
    ['LF', '\n', 'first\rsecond\nthird', ['first\rsecond', '\n', 'third']],
    ['CR', '\r', 'first\nsecond\rthird', ['first\nsecond', '\r', 'third']],
    ['CRLF', '\r\n', 'first\nsecond\rthird\r\nfourth', ['first\nsecond\rthird', '\r\n', 'fourth']],
  ] as const)('leaves non-selected endings in line content when using %s', (_name, lineEnding, text, expected) => {
    expect(tokenizeLines(text, lineEnding)).toEqual(expected);
  });

  it.each([
    ['LF', '\n'],
    ['CR', '\r'],
    ['CRLF', '\r\n'],
  ] as const satisfies readonly (readonly [string, LineEnding])[])(
    'preserves consecutive and trailing %s endings',
    (_name, lineEnding) => {
      expect(tokenizeLines(`${lineEnding}${lineEnding}text${lineEnding}`, lineEnding)).toEqual([
        lineEnding,
        lineEnding,
        'text',
        lineEnding,
      ]);
    },
  );

  it('treats CR and LF within CRLF according to the selected delimiter', () => {
    expect(tokenizeLines('a\r\nb', '\n')).toEqual(['a\r', '\n', 'b']);
    expect(tokenizeLines('a\r\nb', '\r')).toEqual(['a', '\r', '\nb']);
    expect(tokenizeLines('a\r\nb', '\r\n')).toEqual(['a', '\r\n', 'b']);
  });
});

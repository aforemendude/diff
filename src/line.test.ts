import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT, diffLines } from './index';

type DiffTuple = readonly [operation: number, text: string];

const reconstructBefore = (diffs: readonly DiffTuple[]): string =>
  diffs
    .filter(([operation]) => operation !== INSERT)
    .map(([, text]) => text)
    .join('');

const reconstructAfter = (diffs: readonly DiffTuple[]): string =>
  diffs
    .filter(([operation]) => operation !== DELETE)
    .map(([, text]) => text)
    .join('');

const expectValidDiff = (before: string, after: string, diffs: readonly DiffTuple[]): void => {
  expect(reconstructBefore(diffs)).toBe(before);
  expect(reconstructAfter(diffs)).toBe(after);

  for (let index = 0; index < diffs.length; index++) {
    expect(diffs[index]?.[1]).not.toBe('');
    if (index > 0) {
      expect(diffs[index]?.[0]).not.toBe(diffs[index - 1]?.[0]);
    }
  }
};

describe('diffLines', () => {
  it('handles empty and equal inputs', () => {
    expect(diffLines('', '')).toEqual([]);
    expect(diffLines('alpha\r\nbeta\ngamma\r', 'alpha\r\nbeta\ngamma\r')).toEqual([[EQUAL, 'alpha\r\nbeta\ngamma\r']]);
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['lone CR', '\r'],
  ])('represents adding a final %s without replacing the final line', (_name, newline) => {
    expect(diffLines('a', `a${newline}`)).toEqual([
      [EQUAL, 'a'],
      [INSERT, newline],
    ]);
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['lone CR', '\r'],
  ])('represents removing a final %s without replacing the final line', (_name, newline) => {
    expect(diffLines(`a${newline}`, 'a')).toEqual([
      [EQUAL, 'a'],
      [DELETE, newline],
    ]);
  });

  it('keeps CRLF atomic when a final line ending changes', () => {
    expect(diffLines('a\r\n', 'a\n')).toEqual([
      [EQUAL, 'a'],
      [DELETE, '\r\n'],
      [INSERT, '\n'],
    ]);
  });

  it('preserves mixed line endings exactly', () => {
    const before = 'alpha\r\nbeta\ngamma\rdelta';
    const after = 'alpha\r\nbeta\r\ngamma\rdelta';
    const diffs = diffLines(before, after);

    expect(diffs).toEqual([
      [EQUAL, 'alpha\r\nbeta'],
      [DELETE, '\n'],
      [INSERT, '\r\n'],
      [EQUAL, 'gamma\rdelta'],
    ]);
    expectValidDiff(before, after, diffs);
  });

  it('treats an additional trailing blank line as a newline insertion', () => {
    expect(diffLines('a\n', 'a\n\n')).toEqual([
      [EQUAL, 'a\n'],
      [INSERT, '\n'],
    ]);
  });

  it('treats changed line contents atomically', () => {
    const before = 'alpha\nbefore 👩‍💻 text\nomega\n';
    const after = 'alpha\nafter 👩‍🔬 text\nomega\n';
    const diffs = diffLines(before, after);

    expect(diffs).toEqual([
      [EQUAL, 'alpha\n'],
      [DELETE, 'before 👩‍💻 text'],
      [INSERT, 'after 👩‍🔬 text'],
      [EQUAL, '\nomega\n'],
    ]);
    expectValidDiff(before, after, diffs);
  });

  it('reconstructs both sides across representative line edits', () => {
    const cases = [
      ['', '\n'],
      ['one\n', 'one\ntwo\n'],
      ['one\r\ntwo', 'zero\rone\r\ntwo\n'],
      ['same\nremove\nend', 'same\nend\r'],
      ['a\n\nb\n', 'a\r\n\nb'],
    ] as const;

    for (const [before, after] of cases) {
      expectValidDiff(before, after, diffLines(before, after));
    }
  });

  it('has no 65,535-unique-line token limit', () => {
    const lineCount = 65_537;
    const changedIndex = Math.floor(lineCount / 2);
    const beforeLines = Array.from({ length: lineCount }, (_, index) => `line-${index}`);
    const afterLines = beforeLines.slice();
    afterLines[changedIndex] = 'replacement-line';

    const before = beforeLines.join('\n');
    const after = afterLines.join('\n');
    const diffs = diffLines(before, after);

    expectValidDiff(before, after, diffs);
    expect(diffs.filter(([operation]) => operation !== EQUAL)).toEqual([
      [DELETE, `line-${changedIndex}`],
      [INSERT, 'replacement-line'],
    ]);
  });
});

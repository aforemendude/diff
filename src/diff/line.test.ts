import { describe, expect, it } from 'vitest';
import { expectValidDiff } from '../test-support/diff.test.helper';
import { DELETE, EQUAL, INSERT, type LineEnding } from '../types';
import { diffLines } from './line';

describe('diffLines', () => {
  it('handles empty and equal inputs', () => {
    expect(diffLines('', '')).toEqual([]);
    expect(diffLines('alpha\r\nbeta\ngamma\r', 'alpha\r\nbeta\ngamma\r')).toEqual([[EQUAL, 'alpha\r\nbeta\ngamma\r']]);
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ] as const satisfies readonly (readonly [string, LineEnding])[])(
    'represents adding a final %s without replacing the final line',
    (_name, lineEnding) => {
      expect(diffLines('a', `a${lineEnding}`, lineEnding)).toEqual([
        [EQUAL, 'a'],
        [INSERT, lineEnding],
      ]);
    },
  );

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ] as const satisfies readonly (readonly [string, LineEnding])[])(
    'represents removing a final %s without replacing the final line',
    (_name, lineEnding) => {
      expect(diffLines(`a${lineEnding}`, 'a', lineEnding)).toEqual([
        [EQUAL, 'a'],
        [DELETE, lineEnding],
      ]);
    },
  );

  it('uses LF by default and treats CR as line content', () => {
    const before = 'a\rb\n';
    const after = 'a\rc\n';
    const diffs = diffLines(before, after);

    expect(diffs).toEqual([
      [DELETE, 'a\rb'],
      [INSERT, 'a\rc'],
      [EQUAL, '\n'],
    ]);
    expectValidDiff(before, after, diffs);
  });

  it('uses a selected CR line ending throughout', () => {
    const before = 'same\rbefore\ntext\rend';
    const after = 'same\rafter\ntext\rend';
    const diffs = diffLines(before, after, '\r');

    expect(diffs).toEqual([
      [EQUAL, 'same\r'],
      [DELETE, 'before\ntext'],
      [INSERT, 'after\ntext'],
      [EQUAL, '\rend'],
    ]);
    expectValidDiff(before, after, diffs);
  });

  it('uses a selected CRLF line ending throughout', () => {
    const before = 'same\r\nbefore\ntext\r\nend';
    const after = 'same\r\nafter\ntext\r\nend';
    const diffs = diffLines(before, after, '\r\n');

    expect(diffs).toEqual([
      [EQUAL, 'same\r\n'],
      [DELETE, 'before\ntext'],
      [INSERT, 'after\ntext'],
      [EQUAL, '\r\nend'],
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
      ['', '\n', '\n'],
      ['one\n', 'one\ntwo\n', '\n'],
      ['one\r\ntwo', 'zero\r\none\r\ntwo\r\n', '\r\n'],
      ['same\rremove\rend', 'same\rend\r', '\r'],
      ['a\r\n\r\nb\r\n', 'a\r\nb', '\r\n'],
    ] as const satisfies readonly (readonly [string, string, LineEnding])[];

    for (const [before, after, lineEnding] of cases) {
      expectValidDiff(before, after, diffLines(before, after, lineEnding));
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

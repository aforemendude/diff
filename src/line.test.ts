import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { expectValidLineDiff } from './test-support/diff.test.helper';
import * as unicodeFixtures from './test-support/unicode.test.fixtures';
import {
  diffLines,
  type Diff,
  type DiffAlgorithm,
  type DiffOperation,
  type LineDiffOptions,
  type LineEnding,
} from './line';
import * as lineEntry from './line';
import { DELETE, EQUAL, INSERT } from './types';

const lineEndings = [
  ['LF', '\n'],
  ['CRLF', '\r\n'],
  ['CR', '\r'],
] as const satisfies readonly (readonly [string, LineEnding])[];
const algorithms = ['adaptive', 'myers', 'sparse'] as const satisfies readonly DiffAlgorithm[];

describe('line entry point', () => {
  it('exposes only the line diff runtime API', () => {
    expect({ ...lineEntry }).toEqual({ DELETE, EQUAL, INSERT, diffLines });
  });

  it('exposes the exact line types and function signature', () => {
    expectTypeOf<DiffOperation>().toEqualTypeOf<-1 | 0 | 1>();
    expectTypeOf<Diff>().toEqualTypeOf<readonly [operation: DiffOperation, tokens: readonly string[]]>();
    expectTypeOf<DiffAlgorithm>().toEqualTypeOf<'adaptive' | 'myers' | 'sparse'>();
    expectTypeOf<LineEnding>().toEqualTypeOf<'\r' | '\n' | '\r\n'>();
    expectTypeOf<LineDiffOptions>().toEqualTypeOf<{
      readonly algorithm?: DiffAlgorithm;
      readonly lineEnding?: LineEnding;
      readonly optimizeTrivialCases?: boolean;
    }>();
    expectTypeOf(diffLines).parameters.toEqualTypeOf<[before: string, after: string, options?: LineDiffOptions]>();
    expectTypeOf(diffLines).returns.toEqualTypeOf<readonly Diff[]>();
  });
});

describe('diffLines', () => {
  it('uses adaptive selection when the algorithm is omitted', () => {
    const before = 'alpha\nbeta\ngamma\ndelta';
    const after = 'delta\ngamma\nbeta\nalpha';
    const NativeMap = Map;
    let mapConstructionCount = 0;
    class CountingMap<K, V> extends NativeMap<K, V> {
      constructor(entries?: readonly (readonly [K, V])[] | null) {
        super(entries);
        mapConstructionCount++;
      }
    }

    vi.stubGlobal('Map', CountingMap);
    let defaultDiff: ReturnType<typeof diffLines> = [];
    try {
      defaultDiff = diffLines(before, after);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(mapConstructionCount).toBe(1);
    expect(defaultDiff).toEqual(diffLines(before, after, { algorithm: 'adaptive' }));
  });

  it.each(algorithms)('accepts the %s algorithm', (algorithm) => {
    const before = 'a\nb\nc\nd';
    const after = 'c\nd\na\nb';
    const diffs = diffLines(before, after, { algorithm });

    expectValidLineDiff(before, after, diffs);
    expect(diffs.reduce((cost, [operation, tokens]) => cost + (operation === EQUAL ? 0 : tokens.length), 0)).toBe(4);
  });

  it('rejects an unsupported algorithm before tokenization or trivial-case shortcuts', () => {
    const split = vi.spyOn(String.prototype, 'split');

    try {
      expect(() =>
        diffLines('same', 'same', {
          algorithm: 'unsupported' as unknown as DiffAlgorithm,
          optimizeTrivialCases: true,
        }),
      ).toThrowError(new RangeError("algorithm must be 'adaptive', 'myers', or 'sparse'"));
      expect(split).not.toHaveBeenCalled();
    } finally {
      split.mockRestore();
    }
  });

  it('handles empty and equal inputs', () => {
    expect(diffLines('', '')).toEqual([]);
    expect(diffLines('alpha\r\nbeta\ngamma\r', 'alpha\r\nbeta\ngamma\r')).toEqual([
      [EQUAL, ['alpha\r', 'beta', 'gamma\r']],
    ]);
  });

  it('only tokenizes identical inputs once when the fast path is enabled', () => {
    const split = vi.spyOn(String.prototype, 'split');
    const before = ['alpha', 'beta'].join('\n');
    const independentlyConstructedAfter = `_${before}`.slice(1);

    try {
      expect(diffLines(before, independentlyConstructedAfter)).toEqual([[EQUAL, ['alpha', 'beta']]]);
      expect(split).toHaveBeenCalledTimes(2);

      split.mockClear();
      expect(diffLines(before, independentlyConstructedAfter, { optimizeTrivialCases: true })).toEqual([
        [EQUAL, ['alpha', 'beta']],
      ]);
      expect(split).toHaveBeenCalledOnce();

      split.mockClear();
      expect(diffLines('', '', { optimizeTrivialCases: true })).toEqual([]);
      expect(split).toHaveBeenCalledOnce();
    } finally {
      split.mockRestore();
    }
  });

  it('only tokenizes the nonempty input in one-sided trivial cases', () => {
    const split = vi.spyOn(String.prototype, 'split');
    const text = 'alpha\nbeta';

    try {
      expect(diffLines('', text)).toEqual([[INSERT, ['alpha', 'beta']]]);
      expect(split).toHaveBeenCalledTimes(2);

      split.mockClear();
      expect(diffLines('', text, { optimizeTrivialCases: true })).toEqual([[INSERT, ['alpha', 'beta']]]);
      expect(split).toHaveBeenCalledOnce();

      split.mockClear();
      expect(diffLines(text, '', { optimizeTrivialCases: true })).toEqual([[DELETE, ['alpha', 'beta']]]);
      expect(split).toHaveBeenCalledOnce();
    } finally {
      split.mockRestore();
    }
  });

  it.each(lineEndings)('only tokenizes the shorter input when one final %s is insignificant', (_name, lineEnding) => {
    const split = vi.spyOn(String.prototype, 'split');
    const shorter = `alpha${lineEnding}beta`;
    const longer = `${shorter}${lineEnding}`;

    try {
      expect(diffLines(shorter, longer, { lineEnding })).toEqual([[EQUAL, ['alpha', 'beta']]]);
      expect(split).toHaveBeenCalledTimes(2);

      split.mockClear();
      expect(diffLines(shorter, longer, { lineEnding, optimizeTrivialCases: true })).toEqual([
        [EQUAL, ['alpha', 'beta']],
      ]);
      expect(split).toHaveBeenCalledOnce();

      split.mockClear();
      expect(diffLines(longer, shorter, { lineEnding, optimizeTrivialCases: true })).toEqual([
        [EQUAL, ['alpha', 'beta']],
      ]);
      expect(split).toHaveBeenCalledOnce();
    } finally {
      split.mockRestore();
    }
  });

  it.each(lineEndings)('requires an exact appended final %s for the shortcut', (_name, lineEnding) => {
    const nonEndingSuffix = 'x'.repeat(lineEnding.length);

    expect(diffLines('alpha', `alpha${nonEndingSuffix}`, { lineEnding, optimizeTrivialCases: true })).toEqual([
      [DELETE, ['alpha']],
      [INSERT, [`alpha${nonEndingSuffix}`]],
    ]);
    expect(diffLines('alpha', `omega${lineEnding}`, { lineEnding, optimizeTrivialCases: true })).toEqual([
      [DELETE, ['alpha']],
      [INSERT, ['omega']],
    ]);
  });

  it('returns freshly owned one-sided trivial-case results', () => {
    const first = diffLines('', 'alpha\nbeta', { optimizeTrivialCases: true });
    const second = diffLines('', 'alpha\nbeta', { optimizeTrivialCases: true });

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0]?.[1]).not.toBe(first[0]?.[1]);
  });

  it('returns freshly owned terminal-ending trivial-case results', () => {
    const first = diffLines('alpha\nbeta', 'alpha\nbeta\n', { optimizeTrivialCases: true });
    const second = diffLines('alpha\nbeta', 'alpha\nbeta\n', { optimizeTrivialCases: true });

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0]?.[1]).not.toBe(first[0]?.[1]);
  });

  it.each(lineEndings)('ignores the presence of one final %s', (_name, lineEnding) => {
    expect(diffLines('a', `a${lineEnding}`, { lineEnding })).toEqual([[EQUAL, ['a']]]);
    expect(diffLines(`a${lineEnding}`, 'a', { lineEnding })).toEqual([[EQUAL, ['a']]]);
  });

  it('uses LF by default and treats CR as line content', () => {
    const before = 'a\rb\n';
    const after = 'a\rc\n';
    const diffs = diffLines(before, after);

    expect(diffs).toEqual([
      [DELETE, ['a\rb']],
      [INSERT, ['a\rc']],
    ]);
    expectValidLineDiff(before, after, diffs);
  });

  it('uses a selected CR line ending throughout', () => {
    const before = 'same\rbefore\ntext\rend';
    const after = 'same\rafter\ntext\rend';
    const diffs = diffLines(before, after, { lineEnding: '\r' });

    expect(diffs).toEqual([
      [EQUAL, ['same']],
      [DELETE, ['before\ntext']],
      [INSERT, ['after\ntext']],
      [EQUAL, ['end']],
    ]);
    expectValidLineDiff(before, after, diffs, '\r');
  });

  it('uses a selected CRLF line ending throughout', () => {
    const before = 'same\r\nbefore\ntext\r\nend';
    const after = 'same\r\nafter\ntext\r\nend';
    const diffs = diffLines(before, after, { lineEnding: '\r\n' });

    expect(diffs).toEqual([
      [EQUAL, ['same']],
      [DELETE, ['before\ntext']],
      [INSERT, ['after\ntext']],
      [EQUAL, ['end']],
    ]);
    expectValidLineDiff(before, after, diffs, '\r\n');
  });

  it.each(lineEndings)('preserves a trailing blank %s line as an empty-string token', (_name, lineEnding) => {
    expect(diffLines(`a${lineEnding}`, `a${lineEnding}${lineEnding}`, { lineEnding })).toEqual([
      [EQUAL, ['a']],
      [INSERT, ['']],
    ]);
    expect(diffLines(`a${lineEnding}${lineEnding}`, `a${lineEnding}`, { lineEnding })).toEqual([
      [EQUAL, ['a']],
      [DELETE, ['']],
    ]);
    expect(
      diffLines(`a${lineEnding}`, `a${lineEnding}${lineEnding}`, {
        lineEnding,
        optimizeTrivialCases: true,
      }),
    ).toEqual([
      [EQUAL, ['a']],
      [INSERT, ['']],
    ]);
    expect(
      diffLines(`a${lineEnding}${lineEnding}`, `a${lineEnding}`, {
        lineEnding,
        optimizeTrivialCases: true,
      }),
    ).toEqual([
      [EQUAL, ['a']],
      [DELETE, ['']],
    ]);
  });

  it.each(lineEndings)('distinguishes empty text from blank %s lines', (_name, lineEnding) => {
    expect(diffLines('', lineEnding, { lineEnding })).toEqual([[INSERT, ['']]]);
    expect(diffLines(lineEnding, '', { lineEnding })).toEqual([[DELETE, ['']]]);
    expect(diffLines('', lineEnding, { lineEnding, optimizeTrivialCases: true })).toEqual([[INSERT, ['']]]);
    expect(diffLines(lineEnding, '', { lineEnding, optimizeTrivialCases: true })).toEqual([[DELETE, ['']]]);
    expect(diffLines(lineEnding, `${lineEnding}${lineEnding}`, { lineEnding })).toEqual([
      [EQUAL, ['']],
      [INSERT, ['']],
    ]);
    expect(diffLines('a', `a${lineEnding}${lineEnding}`, { lineEnding })).toEqual([
      [EQUAL, ['a']],
      [INSERT, ['']],
    ]);
  });

  it('treats changed line contents atomically', () => {
    const before = `alpha\nbefore ${unicodeFixtures.WOMAN_TECHNOLOGIST} text\nomega\n`;
    const after = `alpha\nafter ${unicodeFixtures.WOMAN_SCIENTIST} text\nomega\n`;
    const diffs = diffLines(before, after);

    expect(diffs).toEqual([
      [EQUAL, ['alpha']],
      [DELETE, [`before ${unicodeFixtures.WOMAN_TECHNOLOGIST} text`]],
      [INSERT, [`after ${unicodeFixtures.WOMAN_SCIENTIST} text`]],
      [EQUAL, ['omega']],
    ]);
    expectValidLineDiff(before, after, diffs);
  });

  it('reconstructs both canonical token streams across representative line edits', () => {
    const cases = [
      ['', '\n', '\n'],
      ['one\n', 'one\ntwo\n', '\n'],
      ['one\r\ntwo', 'zero\r\none\r\ntwo\r\n', '\r\n'],
      ['same\rremove\rend', 'same\rend\r', '\r'],
      ['a\r\n\r\nb\r\n', 'a\r\nb', '\r\n'],
    ] as const satisfies readonly (readonly [string, string, LineEnding])[];

    for (const [before, after, lineEnding] of cases) {
      expectValidLineDiff(before, after, diffLines(before, after, { lineEnding }), lineEnding);
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

    expectValidLineDiff(before, after, diffs);
    expect(diffs.filter(([operation]) => operation !== EQUAL)).toEqual([
      [DELETE, [`line-${changedIndex}`]],
      [INSERT, ['replacement-line']],
    ]);
  });
});

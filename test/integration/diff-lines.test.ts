import { describe, expect, it } from 'vitest';
import { DELETE, EQUAL, INSERT, diffLines, type Diff, type LineEnding } from '../../src/line.js';
import * as unicodeFixtures from '../../src/test-support/unicode.test.fixtures.js';
import {
  canonicalLineTokens,
  editCost,
  expectFreshOutput,
  expectLineDiff,
  expectShortestEdit,
  lcsLength,
  lineEndings,
  reconstructAfter,
  reconstructBefore,
  sequences,
} from './support.js';

const joinLines = (tokens: readonly string[], lineEnding: LineEnding): string => tokens.join(lineEnding);

describe('diffLines public API', () => {
  describe('line-ending selection', () => {
    it('defaults to LF for omitted, undefined, and empty options', () => {
      const before = 'alpha\r\nbefore\romega\n';
      const after = 'alpha\r\nafter\romega\n';
      const expected: readonly Diff[] = [
        [EQUAL, ['alpha\r']],
        [DELETE, ['before\romega']],
        [INSERT, ['after\romega']],
      ];
      const frozenOptions = Object.freeze({});

      expect(diffLines(before, after)).toEqual(expected);
      expect(diffLines(before, after, undefined)).toEqual(expected);
      expect(diffLines(before, after, frozenOptions)).toEqual(expected);
      expect(diffLines(before, after, { lineEnding: '\n' })).toEqual(expected);
    });

    it.each(lineEndings)('uses an explicitly selected %s delimiter throughout both inputs', (_name, lineEnding) => {
      const before = joinLines(['first', 'before', 'last'], lineEnding);
      const after = joinLines(['first', 'after', 'last'], lineEnding);
      const options = Object.freeze({ lineEnding });
      const diffs = diffLines(before, after, options);

      expect(diffs).toEqual([
        [EQUAL, ['first']],
        [DELETE, ['before']],
        [INSERT, ['after']],
        [EQUAL, ['last']],
      ]);
      expectLineDiff(before, after, diffs, lineEnding);
      expect(options).toEqual({ lineEnding });
    });

    it.each([
      ['LF', '\n', 'first\rsecond\nthird\r\nfourth', ['first\rsecond', 'third\r', 'fourth']],
      ['CR', '\r', 'first\nsecond\rthird\r\nfourth', ['first\nsecond', 'third', '\nfourth']],
      ['CRLF', '\r\n', 'first\nsecond\rthird\r\nfourth', ['first\nsecond\rthird', 'fourth']],
    ] as const satisfies readonly (readonly [string, LineEnding, string, readonly string[]])[])(
      'leaves non-selected CR and LF characters in line content with %s',
      (_name, lineEnding, text, expectedTokens) => {
        expect(diffLines(text, text, { lineEnding })).toEqual([[EQUAL, expectedTokens]]);
      },
    );

    it.each(lineEndings)('leaves non-CR/LF newline characters in line content with %s', (_name, lineEnding) => {
      const line =
        `vertical\vform\fnext${unicodeFixtures.NEXT_LINE_CHARACTER}` +
        `line${unicodeFixtures.LINE_SEPARATOR}paragraph${unicodeFixtures.PARAGRAPH_SEPARATOR}end`;
      const withInsignificantEnding = `${line}${lineEnding}`;

      expect(diffLines(line, withInsignificantEnding, { lineEnding })).toEqual([[EQUAL, [line]]]);
    });
  });

  describe.each(lineEndings)('%s empty, blank, and trailing-line semantics', (_name, lineEnding) => {
    it('distinguishes empty text from one or more blank lines', () => {
      expect(diffLines('', '', { lineEnding })).toEqual([]);
      expect(diffLines('', lineEnding, { lineEnding })).toEqual([[INSERT, ['']]]);
      expect(diffLines(lineEnding, '', { lineEnding })).toEqual([[DELETE, ['']]]);
      expect(diffLines(lineEnding, `${lineEnding}${lineEnding}`, { lineEnding })).toEqual([
        [EQUAL, ['']],
        [INSERT, ['']],
      ]);
      expect(diffLines(`${lineEnding}${lineEnding}`, lineEnding, { lineEnding })).toEqual([
        [EQUAL, ['']],
        [DELETE, ['']],
      ]);
    });

    it('ignores exactly one terminal delimiter without discarding preceding blank lines', () => {
      expect(diffLines('line', `line${lineEnding}`, { lineEnding })).toEqual([[EQUAL, ['line']]]);
      expect(diffLines(`line${lineEnding}`, 'line', { lineEnding })).toEqual([[EQUAL, ['line']]]);
      expect(diffLines('line', `line${lineEnding}`, { lineEnding, optimizeTrivialCases: true })).toEqual([
        [EQUAL, ['line']],
      ]);
      expect(diffLines(`line${lineEnding}`, 'line', { lineEnding, optimizeTrivialCases: true })).toEqual([
        [EQUAL, ['line']],
      ]);
      expect(diffLines(`line${lineEnding}`, `line${lineEnding}${lineEnding}`, { lineEnding })).toEqual([
        [EQUAL, ['line']],
        [INSERT, ['']],
      ]);
      expect(
        diffLines(`line${lineEnding}`, `line${lineEnding}${lineEnding}`, {
          lineEnding,
          optimizeTrivialCases: true,
        }),
      ).toEqual([
        [EQUAL, ['line']],
        [INSERT, ['']],
      ]);
      expect(
        diffLines(`line${lineEnding}${lineEnding}`, `line${lineEnding}${lineEnding}${lineEnding}`, {
          lineEnding,
        }),
      ).toEqual([
        [EQUAL, ['line', '']],
        [INSERT, ['']],
      ]);
    });

    it('preserves leading, interior, and trailing blank-line tokens', () => {
      const before = joinLines(['', 'alpha', '', 'omega', ''], lineEnding) + lineEnding;
      const after = joinLines(['', 'alpha', '', '', 'omega', ''], lineEnding) + lineEnding;
      const diffs = diffLines(before, after, { lineEnding });

      expect(diffs).toEqual([
        [EQUAL, ['', 'alpha', '']],
        [INSERT, ['']],
        [EQUAL, ['omega', '']],
      ]);
      expectLineDiff(before, after, diffs, lineEnding);
    });
  });

  it.each(lineEndings)('treats changed %s-delimited lines as atomic tokens', (_name, lineEnding) => {
    const beforeLine =
      `before ${unicodeFixtures.E_WITH_COMBINING_ACUTE} ` +
      `${unicodeFixtures.WOMAN_TECHNOLOGIST}${unicodeFixtures.LINE_SEPARATOR}text`;
    const afterLine =
      `after ${unicodeFixtures.LATIN_SMALL_LETTER_E_WITH_ACUTE} ` +
      `${unicodeFixtures.WOMAN_SCIENTIST_MEDIUM_SKIN_TONE}${unicodeFixtures.LINE_SEPARATOR}text`;
    const before = joinLines(['shared', beforeLine, 'shared tail'], lineEnding);
    const after = joinLines(['shared', afterLine, 'shared tail'], lineEnding);
    const diffs = diffLines(before, after, { lineEnding });

    expect(diffs).toEqual([
      [EQUAL, ['shared']],
      [DELETE, [beforeLine]],
      [INSERT, [afterLine]],
      [EQUAL, ['shared tail']],
    ]);
    expectLineDiff(before, after, diffs, lineEnding);
  });

  describe('containment and repeated lines', () => {
    it.each(lineEndings)(
      'finds a repeated %s-delimited stream contained within a larger stream',
      (_name, lineEnding) => {
        const contained = ['repeat', 'pivot', 'repeat', 'pivot'];
        const containing = ['prefix', ...contained, 'suffix'];
        const shortText = joinLines(contained, lineEnding);
        const longText = joinLines(containing, lineEnding);

        const insertion = diffLines(shortText, longText, { lineEnding });
        expect(insertion).toEqual([
          [INSERT, ['prefix']],
          [EQUAL, contained],
          [INSERT, ['suffix']],
        ]);
        expectLineDiff(shortText, longText, insertion, lineEnding);
        expectShortestEdit(contained, containing, insertion);

        const deletion = diffLines(longText, shortText, { lineEnding });
        expect(deletion).toEqual([
          [DELETE, ['prefix']],
          [EQUAL, contained],
          [DELETE, ['suffix']],
        ]);
        expectLineDiff(longText, shortText, deletion, lineEnding);
        expectShortestEdit(containing, contained, deletion);
      },
    );

    it('chooses a deterministic shortest edit script when repetitions make the match ambiguous', () => {
      const beforeTokens = ['a', 'b', 'a', 'b', 'a'];
      const afterTokens = ['b', 'a', 'b', 'a', 'b'];
      const before = joinLines(beforeTokens, '\n');
      const after = joinLines(afterTokens, '\n');
      const first = diffLines(before, after);

      expectLineDiff(before, after, first);
      expectShortestEdit(beforeTokens, afterTokens, first);
      for (let repetition = 0; repetition < 20; repetition++) {
        expect(diffLines(before, after)).toEqual(first);
      }
    });
  });

  it('exhaustively returns normalized shortest edit scripts for generated small line streams', () => {
    const streams = sequences(['', 'alpha', unicodeFixtures.GREEK_SMALL_LETTER_BETA], 4);

    const encode = (tokens: readonly string[], lineEnding: LineEnding): string =>
      tokens.length === 0 ? '' : `${tokens.join(lineEnding)}${lineEnding}`;
    const equalTokens = (left: readonly string[], right: readonly string[]): boolean =>
      left.length === right.length && left.every((token, index) => token === right[index]);

    for (const [, lineEnding] of lineEndings) {
      for (const beforeTokens of streams) {
        const before = encode(beforeTokens, lineEnding);
        for (const afterTokens of streams) {
          const after = encode(afterTokens, lineEnding);
          const diffs = diffLines(before, after, { lineEnding });

          const structurallyValid = diffs.every(
            ([operation, tokens], index) =>
              (operation === DELETE || operation === EQUAL || operation === INSERT) &&
              tokens.length > 0 &&
              operation !== diffs[index - 1]?.[0],
          );
          const shortestCost = beforeTokens.length + afterTokens.length - 2 * lcsLength(beforeTokens, afterTokens);

          if (
            !structurallyValid ||
            !equalTokens(reconstructBefore(diffs), canonicalLineTokens(before, lineEnding)) ||
            !equalTokens(reconstructAfter(diffs), canonicalLineTokens(after, lineEnding)) ||
            editCost(diffs) !== shortestCost
          ) {
            throw new Error(
              `invalid exhaustive ${JSON.stringify(lineEnding)} case: ${JSON.stringify({ before, after })}`,
            );
          }
        }
      }
    }
  });

  it('returns deterministic results with freshly owned arrays on every call', () => {
    const before = 'shared\nbefore\nrepeat\nbefore\ntail';
    const after = 'shared\nafter\nrepeat\nafter\ntail';
    const first = diffLines(before, after);
    const second = diffLines(before, after);

    expect(second).toEqual(first);
    expectFreshOutput(first, second);
    expect(new Set(second.map((diff) => diff[1])).size).toBe(second.length);

    const firstEmpty = diffLines('', '');
    const secondEmpty = diffLines('', '');
    expect(firstEmpty).toEqual([]);
    expect(secondEmpty).toEqual(firstEmpty);
    expect(secondEmpty).not.toBe(firstEmpty);
  });

  it('handles a generated stream of more than 65,535 unique lines', () => {
    const lineCount = 70_003;
    const changedIndices = [1, Math.floor(lineCount / 2), lineCount - 2] as const;
    const beforeLines = Array.from({ length: lineCount }, (_value, index) => `generated-line-${index}`);
    const afterLines = beforeLines.slice();
    for (const index of changedIndices) {
      afterLines[index] = `generated-replacement-${index}`;
    }
    const before = beforeLines.join('\n');
    const after = afterLines.join('\n');
    const diffs = diffLines(before, after);

    expect(new Set(beforeLines)).toHaveLength(lineCount);
    expect(new Set(afterLines)).toHaveLength(lineCount);
    expectLineDiff(before, after, diffs);
    expect(editCost(diffs)).toBe(2 * changedIndices.length);
    expect(diffs.filter(([operation]) => operation === DELETE)).toEqual(
      changedIndices.map((index) => [DELETE, [`generated-line-${index}`]]),
    );
    expect(diffs.filter(([operation]) => operation === INSERT)).toEqual(
      changedIndices.map((index) => [INSERT, [`generated-replacement-${index}`]]),
    );
    expect(canonicalLineTokens(before)).toHaveLength(lineCount);
    expect(canonicalLineTokens(after)).toHaveLength(lineCount);
  });
});

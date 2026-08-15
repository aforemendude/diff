import { describe, expect, it } from 'vitest';
import {
  cleanupEfficiency,
  DELETE,
  EQUAL,
  INSERT,
  type CleanupEfficiencyOptions,
  type Diff,
  type DiffOperation,
} from '../../src/cleanup.js';
import * as unicodeFixtures from '../../src/test-support/unicode.test.fixtures.js';
import {
  expectCleanupResult,
  expectFreshOutput,
  freezeDiff,
  reconstructAfter,
  reconstructBefore,
  textDiff,
} from './support.js';

const expectOwnedOutput = (input: readonly Diff[], output: readonly Diff[]): void => {
  expectFreshOutput(input, output);
  const inputReferences = new Set<unknown>([input]);
  for (const entry of input) {
    inputReferences.add(entry);
    inputReferences.add(entry[1]);
  }

  expect(inputReferences.has(output)).toBe(false);
  for (const entry of output) {
    expect(inputReferences.has(entry)).toBe(false);
    expect(inputReferences.has(entry[1])).toBe(false);
  }
};

const allKinds = (equality: string): Diff[] =>
  textDiff([
    [DELETE, 'ab'],
    [INSERT, '12'],
    [EQUAL, equality],
    [DELETE, 'cd'],
    [INSERT, '34'],
  ]);

type ThreeKindCase = readonly [
  name: string,
  before: readonly (readonly [DiffOperation, string])[],
  after: readonly (readonly [DiffOperation, string])[],
];

const threeKindCases = [
  [
    'deletion before',
    [[DELETE, 'a']],
    [
      [DELETE, 'c'],
      [INSERT, 'd'],
    ],
  ],
  [
    'insertion before',
    [[INSERT, 'b']],
    [
      [DELETE, 'c'],
      [INSERT, 'd'],
    ],
  ],
  [
    'deletion after',
    [
      [DELETE, 'a'],
      [INSERT, 'b'],
    ],
    [[DELETE, 'c']],
  ],
  [
    'insertion after',
    [
      [DELETE, 'a'],
      [INSERT, 'b'],
    ],
    [[INSERT, 'd']],
  ],
] as const satisfies readonly ThreeKindCase[];

describe('cleanupEfficiency through the public API', () => {
  it('normalizes empty and adjacent entries and factors common edit text', () => {
    const input = textDiff([
      [EQUAL, ''],
      [DELETE, 'ax'],
      [DELETE, 'z'],
      [INSERT, ''],
      [INSERT, 'ayz'],
      [EQUAL, ''],
      [EQUAL, '!'],
    ]);
    const output = cleanupEfficiency(input);

    expect(output).toEqual(
      textDiff([
        [EQUAL, 'a'],
        [DELETE, 'x'],
        [INSERT, 'y'],
        [EQUAL, 'z!'],
      ]),
    );
    expectCleanupResult(input, output);
  });

  it('normalizes an edit that can be shifted across an equality', () => {
    const input = textDiff([
      [EQUAL, 'a'],
      [INSERT, 'ba'],
      [EQUAL, 'c'],
    ]);

    expect(cleanupEfficiency(input)).toEqual(
      textDiff([
        [INSERT, 'ab'],
        [EQUAL, 'ac'],
      ]),
    );
  });

  it('accepts deeply frozen input, preserves both streams, and owns every returned container', () => {
    const input = freezeDiff(
      textDiff([
        [DELETE, 'ab'],
        [INSERT, '12'],
        [EQUAL, 'xy'],
        [INSERT, '34'],
        [EQUAL, 'z'],
        [DELETE, 'cd'],
        [INSERT, '56'],
      ]),
    );
    const before = reconstructBefore(input).slice();
    const after = reconstructAfter(input).slice();
    const output = cleanupEfficiency(input);

    expect(reconstructBefore(input)).toEqual(before);
    expect(reconstructAfter(input)).toEqual(after);
    expectCleanupResult(input, output);
    expectOwnedOutput(input, output);
  });

  it('returns a separately owned empty result', () => {
    const input = freezeDiff([]);
    const output = cleanupEfficiency(input);

    expect(output).toEqual([]);
    expect(output).not.toBe(input);
  });

  it('eliminates an equality below the four-kind edit-cost threshold', () => {
    expect(cleanupEfficiency(allKinds('xyz'))).toEqual(
      textDiff([
        [DELETE, 'abxyzcd'],
        [INSERT, '12xyz34'],
      ]),
    );
  });

  it('keeps an equality exactly at the four-kind edit-cost threshold', () => {
    const input = allKinds('wxyz');

    expect(cleanupEfficiency(input)).toEqual(input);
  });

  it.each(threeKindCases)('eliminates a short equality with three kinds (%s)', (_name, before, after) => {
    const input = textDiff([...before, [EQUAL, 'x'], ...after]);
    const output = cleanupEfficiency(input);

    expect(output.some(([operation]) => operation === EQUAL)).toBe(false);
    expectCleanupResult(input, output);
  });

  it.each(threeKindCases)('keeps an equality at the half-cost threshold (%s)', (_name, before, after) => {
    const input = textDiff([...before, [EQUAL, 'xy'], ...after]);

    expect(cleanupEfficiency(input)).toEqual(input);
  });

  it('does not eliminate an equality surrounded by only two edit kinds', () => {
    const cases = [
      textDiff([
        [DELETE, 'a'],
        [EQUAL, 'x'],
        [INSERT, 'b'],
      ]),
      textDiff([
        [INSERT, 'a'],
        [EQUAL, 'x'],
        [DELETE, 'b'],
      ]),
      textDiff([
        [DELETE, 'a'],
        [EQUAL, 'x'],
        [DELETE, 'b'],
      ]),
      textDiff([
        [INSERT, 'a'],
        [EQUAL, 'x'],
        [INSERT, 'b'],
      ]),
    ];

    for (const input of cases) {
      expect(cleanupEfficiency(input)).toEqual(input);
    }
  });

  it('backtracks through earlier candidates after eliminating a later equality', () => {
    const input = textDiff([
      [DELETE, 'ab'],
      [INSERT, '12'],
      [EQUAL, 'xy'],
      [INSERT, '34'],
      [EQUAL, 'z'],
      [DELETE, 'cd'],
      [INSERT, '56'],
    ]);

    expect(cleanupEfficiency(input)).toEqual(
      textDiff([
        [DELETE, 'abxyzcd'],
        [INSERT, '12xy34z56'],
      ]),
    );
  });

  it('uses grapheme-token counts rather than code-unit or code-point counts', () => {
    const equality =
      unicodeFixtures.WOMAN_TECHNOLOGIST +
      unicodeFixtures.UNITED_NATIONS_FLAG +
      unicodeFixtures.THUMBS_UP_MEDIUM_SKIN_TONE;
    const input = allKinds(equality);
    const output = cleanupEfficiency(input);

    expect(output).toEqual(
      textDiff([
        [DELETE, `ab${equality}cd`],
        [INSERT, `12${equality}34`],
      ]),
    );
    expectCleanupResult(input, output);
  });

  it('honors custom fractional costs on both strict thresholds', () => {
    expect(cleanupEfficiency(allKinds('xyz'), { editCost: 3 })).toEqual(allKinds('xyz'));
    expect(cleanupEfficiency(allKinds('xyz'), { editCost: 3.5 })).toEqual(
      textDiff([
        [DELETE, 'abxyzcd'],
        [INSERT, '12xyz34'],
      ]),
    );

    const threeKinds = textDiff([
      [INSERT, 'a'],
      [EQUAL, 'xy'],
      [DELETE, 'b'],
      [INSERT, 'c'],
    ]);
    expect(cleanupEfficiency(threeKinds, { editCost: 4 })).toEqual(threeKinds);
    expect(cleanupEfficiency(threeKinds, { editCost: 4.5 }).some(([operation]) => operation === EQUAL)).toBe(false);
  });

  it('treats omitted, empty, and explicitly undefined options as the default cost', () => {
    const input = allKinds('xyz');
    const expected = cleanupEfficiency(input, { editCost: 4 });

    expect(cleanupEfficiency(input)).toEqual(expected);
    expect(cleanupEfficiency(input, {})).toEqual(expected);
    expect(cleanupEfficiency(input, { editCost: undefined })).toEqual(expected);
  });

  it.each([
    ['zero', 0],
    ['negative zero', -0],
    ['smallest positive', Number.MIN_VALUE],
    ['fractional', 0.5],
    ['default boundary', 4],
    ['largest finite', Number.MAX_VALUE],
  ] as const)('accepts the valid %s edit cost', (_name, editCost) => {
    const options = Object.freeze({ editCost }) satisfies CleanupEfficiencyOptions;

    expect(cleanupEfficiency([], options)).toEqual([]);
  });

  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['negative integer', -1],
    ['negative fraction', -0.5],
    ['smallest negative magnitude', -Number.MIN_VALUE],
    ['largest negative finite', -Number.MAX_VALUE],
  ] as const)('rejects the invalid %s edit cost', (_name, editCost) => {
    expect(() => cleanupEfficiency([], { editCost })).toThrow(
      new RangeError('editCost must be a finite, non-negative number'),
    );
  });
});

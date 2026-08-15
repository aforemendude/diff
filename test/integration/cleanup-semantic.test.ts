import { describe, expect, it } from 'vitest';
import { cleanupSemantic, DELETE, EQUAL, INSERT, type Diff } from '../../src/index';
import {
  expectCleanupResult,
  expectFreshOutput,
  freezeDiff,
  reconstructAfter,
  reconstructBefore,
  textDiff,
} from './support';

const expectOwnedOutput = (input: readonly Diff[], output: readonly Diff[]): void => {
  expectFreshOutput(input, output);
  const inputReferences = new Set<unknown>([input]);
  for (const entry of input) {
    inputReferences.add(entry);
    inputReferences.add(entry[1]);
  }
  for (const entry of output) {
    expect(inputReferences.has(entry)).toBe(false);
    expect(inputReferences.has(entry[1])).toBe(false);
  }
};

describe('cleanupSemantic through the public API', () => {
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
    const output = cleanupSemantic(input);

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

  it('accepts deeply frozen input, preserves both streams, and owns every returned container', () => {
    const input = freezeDiff(
      textDiff([
        [EQUAL, 'The c'],
        [INSERT, 'ow and the c'],
        [EQUAL, 'at.'],
      ]),
    );
    const before = reconstructBefore(input).slice();
    const after = reconstructAfter(input).slice();
    const output = cleanupSemantic(input);

    expect(reconstructBefore(input)).toEqual(before);
    expect(reconstructAfter(input)).toEqual(after);
    expectCleanupResult(input, output);
    expectOwnedOutput(input, output);
  });

  it('returns a separately owned empty result', () => {
    const input = freezeDiff([]);
    const output = cleanupSemantic(input);

    expect(output).toEqual([]);
    expect(output).not.toBe(input);
  });

  it('eliminates an equality exactly as large as the edits on both sides', () => {
    const input = textDiff([
      [DELETE, 'ab'],
      [INSERT, '12'],
      [EQUAL, 'xy'],
      [DELETE, 'cd'],
      [INSERT, '34'],
    ]);

    expect(cleanupSemantic(input)).toEqual(
      textDiff([
        [DELETE, 'abxycd'],
        [INSERT, '12xy34'],
      ]),
    );
  });

  it('keeps an equality larger than the edits on either side', () => {
    const inputs = [
      textDiff([
        [DELETE, 'a'],
        [INSERT, '1'],
        [EQUAL, 'xy'],
        [DELETE, 'cd'],
        [INSERT, '23'],
      ]),
      textDiff([
        [DELETE, 'ab'],
        [INSERT, '12'],
        [EQUAL, 'xy'],
        [DELETE, 'c'],
        [INSERT, '3'],
      ]),
    ];

    for (const input of inputs) {
      expect(cleanupSemantic(input)).toEqual(input);
    }
  });

  it('compares an equality with the largest edit kind, not the combined edit length', () => {
    const input = textDiff([
      [DELETE, 'a'],
      [INSERT, '1'],
      [EQUAL, 'xy'],
      [DELETE, 'b'],
      [INSERT, '2'],
    ]);

    expect(cleanupSemantic(input)).toEqual(input);
  });

  it('eliminates equalities between same-kind edits and restores the shared stream', () => {
    const deletion = textDiff([
      [DELETE, 'a'],
      [EQUAL, '👩‍💻'],
      [DELETE, 'b'],
    ]);
    const insertion = textDiff([
      [INSERT, 'a'],
      [EQUAL, '👩‍💻'],
      [INSERT, 'b'],
    ]);

    expect(cleanupSemantic(deletion)).toEqual(
      textDiff([
        [DELETE, 'a👩‍💻b'],
        [INSERT, '👩‍💻'],
      ]),
    );
    expect(cleanupSemantic(insertion)).toEqual(
      textDiff([
        [DELETE, '👩‍💻'],
        [INSERT, 'a👩‍💻b'],
      ]),
    );
  });

  it('measures equality thresholds in grapheme tokens', () => {
    const equality = '👩‍💻🇺🇳';
    const input = textDiff([
      [DELETE, 'ab'],
      [INSERT, '12'],
      [EQUAL, equality],
      [DELETE, 'cd'],
      [INSERT, '34'],
    ]);

    expect(cleanupSemantic(input)).toEqual(
      textDiff([
        [DELETE, `ab${equality}cd`],
        [INSERT, `12${equality}34`],
      ]),
    );
  });

  it.each([
    [
      'blank-line',
      [
        [EQUAL, 'AAA\r\n\r\nBBB'],
        [INSERT, '\r\nDDD\r\n\r\nBBB'],
        [EQUAL, '\r\nEEE'],
      ],
      [
        [EQUAL, 'AAA\r\n\r\n'],
        [INSERT, 'BBB\r\nDDD\r\n\r\n'],
        [EQUAL, 'BBB\r\nEEE'],
      ],
    ],
    [
      'line-break',
      [
        [EQUAL, 'AAA\r\nBBB'],
        [INSERT, ' DDD\r\nBBB'],
        [EQUAL, ' EEE'],
      ],
      [
        [EQUAL, 'AAA\r\n'],
        [INSERT, 'BBB DDD\r\n'],
        [EQUAL, 'BBB EEE'],
      ],
    ],
    [
      'sentence',
      [
        [EQUAL, 'The xxx. The '],
        [INSERT, 'zzz. The '],
        [EQUAL, 'yyy.'],
      ],
      [
        [EQUAL, 'The xxx.'],
        [INSERT, ' The zzz.'],
        [EQUAL, ' The yyy.'],
      ],
    ],
    [
      'word',
      [
        [EQUAL, 'The c'],
        [INSERT, 'ow and the c'],
        [EQUAL, 'at.'],
      ],
      [
        [EQUAL, 'The '],
        [INSERT, 'cow and the '],
        [EQUAL, 'cat.'],
      ],
    ],
    [
      'punctuation',
      [
        [EQUAL, 'The-c'],
        [INSERT, 'ow-and-the-c'],
        [EQUAL, 'at.'],
      ],
      [
        [EQUAL, 'The-'],
        [INSERT, 'cow-and-the-'],
        [EQUAL, 'cat.'],
      ],
    ],
  ] as const)('places an isolated edit at the best %s boundary', (_name, input, expected) => {
    expect(cleanupSemantic(textDiff(input))).toEqual(textDiff(expected));
  });

  it('prefers the latest placement when neutral boundary scores tie', () => {
    const input = textDiff([
      [EQUAL, 'xa'],
      [INSERT, 'a'],
      [EQUAL, 'ab'],
    ]);

    expect(cleanupSemantic(input)).toEqual(
      textDiff([
        [EQUAL, 'xaa'],
        [INSERT, 'a'],
        [EQUAL, 'b'],
      ]),
    );
  });

  it('uses Thai word segmentation when selecting a semantic boundary', () => {
    const options = { locale: 'th' } as const;
    const input = textDiff(
      [
        [EQUAL, 'ฉันกิ'],
        [INSERT, 'จกรรมกิ'],
        [EQUAL, 'นข้าว'],
      ],
      options,
    );
    const output = cleanupSemantic(input, options);

    expect(output).toEqual(
      textDiff(
        [
          [EQUAL, 'ฉัน'],
          [INSERT, 'กิจกรรม'],
          [EQUAL, 'กินข้าว'],
        ],
        options,
      ),
    );
    expectCleanupResult(input, output, options);
  });

  it('rejects an invalid locale even when an isolated edit cannot shift', () => {
    const input = textDiff([
      [EQUAL, 'a'],
      [INSERT, 'b'],
      [EQUAL, 'c'],
    ]);

    expect(() => cleanupSemantic(input, { locale: 'not_a_locale' })).toThrow(RangeError);
  });

  it.each([
    [
      'forward',
      [
        [DELETE, 'abcxxx'],
        [INSERT, 'xxxdef'],
      ],
      [
        [DELETE, 'abc'],
        [EQUAL, 'xxx'],
        [INSERT, 'def'],
      ],
    ],
    [
      'reverse',
      [
        [DELETE, 'xxxabc'],
        [INSERT, 'defxxx'],
      ],
      [
        [INSERT, 'def'],
        [EQUAL, 'xxx'],
        [DELETE, 'abc'],
      ],
    ],
    [
      'equal-size tie (forward wins)',
      [
        [DELETE, 'abcxxx'],
        [INSERT, 'xxxabc'],
      ],
      [
        [DELETE, 'abc'],
        [EQUAL, 'xxx'],
        [INSERT, 'abc'],
      ],
    ],
    [
      'threshold relative to the shorter edit',
      [
        [DELETE, 'abcdefXYZ'],
        [INSERT, 'XYZq'],
      ],
      [
        [DELETE, 'abcdef'],
        [EQUAL, 'XYZ'],
        [INSERT, 'q'],
      ],
    ],
  ] as const)('extracts a substantial %s overlap', (_name, input, expected) => {
    expect(cleanupSemantic(textDiff(input))).toEqual(textDiff(expected));
  });

  it('extracts an overlap exactly at half of both edits', () => {
    expect(
      cleanupSemantic(
        textDiff([
          [DELETE, 'abcXYZ'],
          [INSERT, 'XYZdef'],
        ]),
      ),
    ).toEqual(
      textDiff([
        [DELETE, 'abc'],
        [EQUAL, 'XYZ'],
        [INSERT, 'def'],
      ]),
    );
  });

  it('leaves an overlap below half of both edits embedded in the edit block', () => {
    const input = textDiff([
      [DELETE, 'abcdXY'],
      [INSERT, 'XYefgh'],
    ]);

    expect(cleanupSemantic(input)).toEqual(input);
  });

  it.each([
    [
      [
        [DELETE, 'XYZabc'],
        [INSERT, 'abc'],
      ],
      [
        [DELETE, 'XYZ'],
        [EQUAL, 'abc'],
      ],
    ],
    [
      [
        [DELETE, 'abc'],
        [INSERT, 'XYZabc'],
      ],
      [
        [INSERT, 'XYZ'],
        [EQUAL, 'abc'],
      ],
    ],
  ] as const)('handles a full overlap without emitting empty entries', (input, expected) => {
    expect(cleanupSemantic(textDiff(input))).toEqual(textDiff(expected));
  });

  it('extracts multiple independent overlaps in one call', () => {
    expect(
      cleanupSemantic(
        textDiff([
          [DELETE, 'abcd1212'],
          [INSERT, '1212efghi'],
          [EQUAL, '----'],
          [DELETE, 'A3'],
          [INSERT, '3BC'],
        ]),
      ),
    ).toEqual(
      textDiff([
        [DELETE, 'abcd'],
        [EQUAL, '1212'],
        [INSERT, 'efghi'],
        [EQUAL, '----'],
        [DELETE, 'A'],
        [EQUAL, '3'],
        [INSERT, 'BC'],
      ]),
    );
  });

  it('preserves a valid diff when cleanup is applied repeatedly without assuming idempotence', () => {
    const input = textDiff([
      [DELETE, 'abcd1212'],
      [INSERT, '1212efghi'],
      [EQUAL, 'The c'],
      [INSERT, 'ow and the c'],
      [EQUAL, 'at.'],
    ]);
    const once = cleanupSemantic(input);
    const twice = cleanupSemantic(once);
    const threeTimes = cleanupSemantic(twice);

    expectCleanupResult(input, once);
    expectCleanupResult(input, twice);
    expectCleanupResult(input, threeTimes);
  });
});

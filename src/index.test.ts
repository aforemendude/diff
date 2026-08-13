import { describe, expect, expectTypeOf, it } from 'vitest';
import { cleanupEfficiency } from './cleanup/efficiency';
import { cleanupSemantic } from './cleanup/semantic';
import { diffGraphemes } from './diff/grapheme';
import { diffLines } from './diff/line';
import * as index from './index';
import type { LineEnding } from './index';
import { DELETE, EQUAL, INSERT } from './types';

describe('public entry point', () => {
  it('exposes the complete runtime API', () => {
    expect({ ...index }).toEqual({
      cleanupEfficiency,
      cleanupSemantic,
      diffGraphemes,
      diffLines,
      DELETE,
      EQUAL,
      INSERT,
    });
  });

  it('exposes the supported line endings as a type', () => {
    expectTypeOf<LineEnding>().toEqualTypeOf<'\r' | '\n' | '\r\n'>();
    expectTypeOf(diffLines).parameters.toEqualTypeOf<[before: string, after: string, lineEnding?: LineEnding]>();
  });
});

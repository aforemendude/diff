import { describe, expect, expectTypeOf, it } from 'vitest';
import { cleanupEfficiency } from './cleanup/efficiency';
import { cleanupSemantic } from './cleanup/semantic';
import { diffGraphemes } from './diff/grapheme';
import { diffLines } from './diff/line';
import * as index from './index';
import type {
  CleanupEfficiencyOptions,
  Diff,
  DiffOperation,
  GraphemeDiffOptions,
  LineDiffOptions,
  LineEnding,
} from './index';
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
    expectTypeOf<LineDiffOptions>().toEqualTypeOf<{
      readonly lineEnding?: LineEnding;
      readonly optimizeIdenticalInputs?: boolean;
    }>();
    expectTypeOf(diffLines).parameters.toEqualTypeOf<[before: string, after: string, options?: LineDiffOptions]>();
    expectTypeOf(diffGraphemes).parameters.toEqualTypeOf<
      [before: string, after: string, options?: GraphemeDiffOptions]
    >();
  });

  it('exposes diffs as operation and readonly token-array tuples', () => {
    expectTypeOf<Diff>().toEqualTypeOf<readonly [operation: DiffOperation, tokens: readonly string[]]>();
    expectTypeOf(diffLines).returns.toEqualTypeOf<readonly Diff[]>();
    expectTypeOf(diffGraphemes).returns.toEqualTypeOf<readonly Diff[]>();
  });

  it('only exposes efficiency options used by the cleanup algorithm', () => {
    expectTypeOf<CleanupEfficiencyOptions>().toEqualTypeOf<{ readonly editCost?: number }>();
  });
});

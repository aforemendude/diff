import { describe, expect, expectTypeOf, it } from 'vitest';
import { diffLines } from './line.js';
import * as lineEntry from './line.js';
import type { Diff, DiffOperation, LineDiffOptions, LineEnding } from './line.js';
import { DELETE, EQUAL, INSERT } from './types.js';

describe('line entry point', () => {
  it('exposes only the line diff runtime API', () => {
    expect({ ...lineEntry }).toEqual({ DELETE, EQUAL, INSERT, diffLines });
  });

  it('exposes the exact line types and function signature', () => {
    expectTypeOf<DiffOperation>().toEqualTypeOf<-1 | 0 | 1>();
    expectTypeOf<Diff>().toEqualTypeOf<readonly [operation: DiffOperation, tokens: readonly string[]]>();
    expectTypeOf<LineEnding>().toEqualTypeOf<'\r' | '\n' | '\r\n'>();
    expectTypeOf<LineDiffOptions>().toEqualTypeOf<{
      readonly lineEnding?: LineEnding;
      readonly optimizeTrivialCases?: boolean;
    }>();
    expectTypeOf(diffLines).parameters.toEqualTypeOf<[before: string, after: string, options?: LineDiffOptions]>();
    expectTypeOf(diffLines).returns.toEqualTypeOf<readonly Diff[]>();
  });
});

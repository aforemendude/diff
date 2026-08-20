import { describe, expect, expectTypeOf, it } from 'vitest';
import { diffGraphemes } from './grapheme.js';
import * as graphemeEntry from './grapheme.js';
import type { Diff, DiffOperation, GraphemeDiffOptions, SegmentOptions } from './grapheme.js';
import { DELETE, EQUAL, INSERT } from './types.js';

describe('grapheme entry point', () => {
  it('exposes only the grapheme diff runtime API', () => {
    expect({ ...graphemeEntry }).toEqual({ DELETE, EQUAL, INSERT, diffGraphemes });
  });

  it('exposes the exact grapheme types and function signature', () => {
    expectTypeOf<DiffOperation>().toEqualTypeOf<-1 | 0 | 1>();
    expectTypeOf<Diff>().toEqualTypeOf<readonly [operation: DiffOperation, tokens: readonly string[]]>();
    expectTypeOf<SegmentOptions>().toEqualTypeOf<{ readonly locale?: Intl.LocalesArgument }>();
    expectTypeOf<GraphemeDiffOptions>().toEqualTypeOf<{
      readonly locale?: Intl.LocalesArgument;
      readonly optimizeTrivialCases?: boolean;
    }>();
    expectTypeOf(diffGraphemes).parameters.toEqualTypeOf<
      [before: string, after: string, options?: GraphemeDiffOptions]
    >();
    expectTypeOf(diffGraphemes).returns.toEqualTypeOf<readonly Diff[]>();
  });
});

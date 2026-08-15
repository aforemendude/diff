import { describe, expect, expectTypeOf, it } from 'vitest';
import * as cleanupEntry from './cleanup.js';
import { cleanupEfficiency } from './cleanup/efficiency.js';
import { cleanupSemantic } from './cleanup/semantic.js';
import type { CleanupEfficiencyOptions, Diff as CleanupDiff, SegmentOptions } from './cleanup.js';
import { diffGraphemes } from './diff/grapheme.js';
import { diffLines } from './diff/line.js';
import * as graphemeEntry from './grapheme.js';
import type { Diff as GraphemeDiff, GraphemeDiffOptions } from './grapheme.js';
import * as lineEntry from './line.js';
import type { Diff as LineDiff, DiffOperation, LineDiffOptions, LineEnding } from './line.js';
import { DELETE, EQUAL, INSERT } from './types.js';

describe('public subpath entry points', () => {
  it('keeps line diffing in its own runtime entry', () => {
    expect({ ...lineEntry }).toEqual({ DELETE, EQUAL, INSERT, diffLines });
  });

  it('keeps grapheme diffing in its own runtime entry', () => {
    expect({ ...graphemeEntry }).toEqual({ DELETE, EQUAL, INSERT, diffGraphemes });
  });

  it('keeps cleanup in its own runtime entry', () => {
    expect({ ...cleanupEntry }).toEqual({ DELETE, EQUAL, INSERT, cleanupEfficiency, cleanupSemantic });
  });

  it('exposes the exact operation, diff, and line option types', () => {
    expectTypeOf<DiffOperation>().toEqualTypeOf<-1 | 0 | 1>();
    expectTypeOf<LineDiff>().toEqualTypeOf<readonly [operation: DiffOperation, tokens: readonly string[]]>();
    expectTypeOf<LineEnding>().toEqualTypeOf<'\r' | '\n' | '\r\n'>();
    expectTypeOf<LineDiffOptions>().toEqualTypeOf<{
      readonly lineEnding?: LineEnding;
      readonly optimizeTrivialCases?: boolean;
    }>();
    expectTypeOf(diffLines).parameters.toEqualTypeOf<[before: string, after: string, options?: LineDiffOptions]>();
    expectTypeOf(diffLines).returns.toEqualTypeOf<readonly LineDiff[]>();
  });

  it('exposes the exact grapheme and cleanup option types', () => {
    expectTypeOf<GraphemeDiff>().toEqualTypeOf<LineDiff>();
    expectTypeOf<CleanupDiff>().toEqualTypeOf<LineDiff>();
    expectTypeOf<GraphemeDiffOptions>().toEqualTypeOf<{
      readonly locale?: Intl.LocalesArgument;
      readonly optimizeTrivialCases?: boolean;
    }>();
    expectTypeOf<SegmentOptions>().toEqualTypeOf<{ readonly locale?: Intl.LocalesArgument }>();
    expectTypeOf<CleanupEfficiencyOptions>().toEqualTypeOf<{ readonly editCost?: number }>();
  });
});

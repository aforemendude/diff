import { describe, expect, expectTypeOf, it } from 'vitest';
import * as cleanupEntry from './cleanup.js';
import { cleanupEfficiency } from './cleanup/efficiency.js';
import { cleanupSemantic } from './cleanup/semantic.js';
import type { CleanupEfficiencyOptions, Diff, DiffOperation, SegmentOptions } from './cleanup.js';
import { DELETE, EQUAL, INSERT } from './types.js';

describe('cleanup entry point', () => {
  it('exposes only the cleanup runtime API', () => {
    expect({ ...cleanupEntry }).toEqual({ DELETE, EQUAL, INSERT, cleanupEfficiency, cleanupSemantic });
  });

  it('exposes the exact cleanup types and function signatures', () => {
    expectTypeOf<DiffOperation>().toEqualTypeOf<-1 | 0 | 1>();
    expectTypeOf<Diff>().toEqualTypeOf<readonly [operation: DiffOperation, tokens: readonly string[]]>();
    expectTypeOf<SegmentOptions>().toEqualTypeOf<{ readonly locale?: Intl.LocalesArgument }>();
    expectTypeOf<CleanupEfficiencyOptions>().toEqualTypeOf<{ readonly editCost?: number }>();
    expectTypeOf(cleanupSemantic).parameters.toEqualTypeOf<[diffs: readonly Diff[], options?: SegmentOptions]>();
    expectTypeOf(cleanupSemantic).returns.toEqualTypeOf<readonly Diff[]>();
    expectTypeOf(cleanupEfficiency).parameters.toEqualTypeOf<
      [diffs: readonly Diff[], options?: CleanupEfficiencyOptions]
    >();
    expectTypeOf(cleanupEfficiency).returns.toEqualTypeOf<readonly Diff[]>();
  });
});

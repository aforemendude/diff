import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  cleanupEfficiency,
  cleanupSemantic,
  DELETE,
  EQUAL,
  INSERT,
  type CleanupEfficiencyOptions,
  type Diff,
  type DiffOperation,
  type SegmentOptions,
} from '../../src/cleanup.js';
import * as cleanupApi from '../../src/cleanup.js';
import { diffGraphemes, type GraphemeDiffOptions } from '../../src/grapheme.js';
import * as graphemeApi from '../../src/grapheme.js';
import { diffLines, type LineDiffOptions, type LineEnding } from '../../src/line.js';
import * as lineApi from '../../src/line.js';

describe('public API', () => {
  it('exports exactly the documented runtime surface from each subpath', () => {
    expect(Object.keys(lineApi).sort()).toEqual(['DELETE', 'EQUAL', 'INSERT', 'diffLines'].sort());
    expect(Object.keys(graphemeApi).sort()).toEqual(['DELETE', 'EQUAL', 'INSERT', 'diffGraphemes'].sort());
    expect(Object.keys(cleanupApi).sort()).toEqual(
      ['DELETE', 'EQUAL', 'INSERT', 'cleanupEfficiency', 'cleanupSemantic'].sort(),
    );
  });

  it('exports the same exact operation constants and literal types from every subpath', () => {
    expect([DELETE, EQUAL, INSERT]).toEqual([-1, 0, 1]);
    expect(new Set([DELETE, EQUAL, INSERT])).toHaveLength(3);
    expect(lineApi).toMatchObject({ DELETE, EQUAL, INSERT });
    expect(graphemeApi).toMatchObject({ DELETE, EQUAL, INSERT });

    expectTypeOf(DELETE).toEqualTypeOf<-1>();
    expectTypeOf(EQUAL).toEqualTypeOf<0>();
    expectTypeOf(INSERT).toEqualTypeOf<1>();
    expectTypeOf<DiffOperation>().toEqualTypeOf<-1 | 0 | 1>();
  });

  it('exports the exact diff and option types', () => {
    expectTypeOf<Diff>().toEqualTypeOf<readonly [operation: DiffOperation, tokens: readonly string[]]>();
    expectTypeOf<LineEnding>().toEqualTypeOf<'\r' | '\n' | '\r\n'>();
    expectTypeOf<LineDiffOptions>().toEqualTypeOf<{
      readonly lineEnding?: LineEnding;
      readonly optimizeTrivialCases?: boolean;
    }>();
    expectTypeOf<GraphemeDiffOptions>().toEqualTypeOf<{
      readonly locale?: Intl.LocalesArgument;
      readonly optimizeTrivialCases?: boolean;
    }>();
    expectTypeOf<SegmentOptions>().toEqualTypeOf<{ readonly locale?: Intl.LocalesArgument }>();
    expectTypeOf<CleanupEfficiencyOptions>().toEqualTypeOf<{ readonly editCost?: number }>();
  });

  it('exports functions with the exact public call signatures', () => {
    expectTypeOf(diffLines).parameters.toEqualTypeOf<[before: string, after: string, options?: LineDiffOptions]>();
    expectTypeOf(diffLines).returns.toEqualTypeOf<readonly Diff[]>();

    expectTypeOf(diffGraphemes).parameters.toEqualTypeOf<
      [before: string, after: string, options?: GraphemeDiffOptions]
    >();
    expectTypeOf(diffGraphemes).returns.toEqualTypeOf<readonly Diff[]>();

    expectTypeOf(cleanupSemantic).parameters.toEqualTypeOf<[diffs: readonly Diff[], options?: SegmentOptions]>();
    expectTypeOf(cleanupSemantic).returns.toEqualTypeOf<readonly Diff[]>();

    expectTypeOf(cleanupEfficiency).parameters.toEqualTypeOf<
      [diffs: readonly Diff[], options?: CleanupEfficiencyOptions]
    >();
    expectTypeOf(cleanupEfficiency).returns.toEqualTypeOf<readonly Diff[]>();
  });
});

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DELETE,
  EQUAL,
  INSERT,
  cleanupEfficiency,
  cleanupSemantic,
  diffGraphemes,
  diffLines,
  type CleanupEfficiencyOptions,
  type Diff,
  type DiffOperation,
  type LineDiffOptions,
  type LineEnding,
  type SegmentOptions,
} from '../../src/index';
import * as publicApi from '../../src/index';

describe('public API', () => {
  it('exports exactly the documented runtime surface', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      ['DELETE', 'EQUAL', 'INSERT', 'cleanupEfficiency', 'cleanupSemantic', 'diffGraphemes', 'diffLines'].sort(),
    );

    expect(publicApi).toMatchObject({
      DELETE,
      EQUAL,
      INSERT,
      cleanupEfficiency,
      cleanupSemantic,
      diffGraphemes,
      diffLines,
    });
  });

  it('exports the exact operation constants and literal types', () => {
    expect([DELETE, EQUAL, INSERT]).toEqual([-1, 0, 1]);
    expect(new Set([DELETE, EQUAL, INSERT])).toHaveLength(3);

    expectTypeOf(DELETE).toEqualTypeOf<-1>();
    expectTypeOf(EQUAL).toEqualTypeOf<0>();
    expectTypeOf(INSERT).toEqualTypeOf<1>();
    expectTypeOf<DiffOperation>().toEqualTypeOf<-1 | 0 | 1>();
  });

  it('exports the exact diff and option types', () => {
    expectTypeOf<Diff>().toEqualTypeOf<readonly [operation: DiffOperation, tokens: readonly string[]]>();
    expectTypeOf<LineEnding>().toEqualTypeOf<'\r' | '\n' | '\r\n'>();
    expectTypeOf<LineDiffOptions>().toEqualTypeOf<{ readonly lineEnding?: LineEnding }>();
    expectTypeOf<SegmentOptions>().toEqualTypeOf<{ readonly locale?: Intl.LocalesArgument }>();
    expectTypeOf<CleanupEfficiencyOptions>().toEqualTypeOf<{ readonly editCost?: number }>();
  });

  it('exports functions with the exact public call signatures', () => {
    expectTypeOf(diffLines).parameters.toEqualTypeOf<[before: string, after: string, options?: LineDiffOptions]>();
    expectTypeOf(diffLines).returns.toEqualTypeOf<readonly Diff[]>();

    expectTypeOf(diffGraphemes).parameters.toEqualTypeOf<[before: string, after: string, options?: SegmentOptions]>();
    expectTypeOf(diffGraphemes).returns.toEqualTypeOf<readonly Diff[]>();

    expectTypeOf(cleanupSemantic).parameters.toEqualTypeOf<[diffs: readonly Diff[], options?: SegmentOptions]>();
    expectTypeOf(cleanupSemantic).returns.toEqualTypeOf<readonly Diff[]>();

    expectTypeOf(cleanupEfficiency).parameters.toEqualTypeOf<
      [diffs: readonly Diff[], options?: CleanupEfficiencyOptions]
    >();
    expectTypeOf(cleanupEfficiency).returns.toEqualTypeOf<readonly Diff[]>();
  });
});

# Simple performance optimizations

This document collects changes that are local, mechanically understandable, and low risk. Items are numbered for
reference rather than as a strict implementation order. Exploratory measurements are included where available, and each
item says which workload should prove or disprove it. Unless noted otherwise, local measurements were exploratory runs
on Node.js 24.18.0 rather than portable performance guarantees.

## 18. Bound cleanup's common-suffix scan

After factoring a common prefix, [`mergeEditBlocks`](../src/cleanup/common.ts#L135-L138) calculates a full common suffix
and then caps it so prefix and suffix cannot overlap. Pass that cap into a range-aware suffix helper instead. Identical
deletion and insertion blocks then stop immediately rather than comparing the entire block a second time only to discard
the suffix length.

This is an exact local change. Add cases where prefix and suffix together consume zero, part, and all of the shorter
edit.

## 19. Reuse one owned equality payload during elimination

The trivial-equality passes create two slices of the eliminated equality at
[`semantic.ts`](../src/cleanup/semantic.ts#L70-L71) and [`efficiency.ts`](../src/cleanup/efficiency.ts#L77-L78). At that
point cleanup already owns the equality's mutable token array.

Reuse that array for either the new deletion or insertion and copy it once for the other. The two output tuples still
have distinct arrays, and neither aliases public input. Retain the frozen-input ownership tests and add an assertion
that the two generated edit payloads are distinct from each other.

## 20. Skip impossible efficiency elimination at very low cost

After normalization, every equality has an integer token length of at least one. When `editCost <= 1`, the candidate
condition `equality.length < editCost` in [`efficiency.ts`](../src/cleanup/efficiency.ts#L46-L53) can never succeed.

Return the owned `cleanupMerge` result without running `eliminateTrivialEqualities`. This preserves validation of
finite, non-negative costs and all output ownership guarantees. Benchmark zero, fractional costs below one, exactly one,
and the first values above one.

## Measurement rules

- Compare at least ten fresh benchmark processes and report the median plus p25/p75 or median absolute deviation. The
  current Vitest settings specify three minimum iterations in one process and may collect many more samples within its
  time window; one process is too GC/JIT-correlated for small claims.
- Alternate baseline/candidate execution order, construct fixtures outside timed regions, and check Node 20, Node 22,
  the current supported Node release, and a representative browser engine for frontend changes.
- Pair direct-kernel benchmarks with public end-to-end benchmarks, and use geometric input sizes to compare scaling
  rather than only one throughput number.
- In fresh processes, record RSS, `heapUsed`, `external`, and `arrayBuffers` for allocation-heavy changes; ordinary heap
  figures can miss typed-array backing stores.
- Benchmark changes separately before combining them.
- Check reconstructed before/after token streams, normalized output shape, grapheme integrity, and fresh output
  ownership; do not require one particular shortest-edit alignment when multiple alignments are valid.
- Prove shortestness with the exhaustive LCS oracle for small inputs and analytic costs only for large fixtures whose
  optimum is certifiable, such as disjoint or unique-line sparse cases.

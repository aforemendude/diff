# Optimization: compact, demand-sized Myers frontiers

## Summary

[`bisect`](../src/algorithm/myers.ts#L140-L264) allocates and fills two `Float64Array` instances sized from the complete
trimmed input range before it knows the edit distance. Large inputs with a few edits therefore reserve and initialize
far more frontier slots than the search visits.

Store encoded 32-bit coordinates in frontiers that grow with the explored distance, and reuse their storage across the
sequential bisections in one `diffTokens` call. This reduces bytes, initialization, and garbage while leaving Myers'
search order and chosen overlap unchanged.

## Current behavior

For lengths `N` and `M`, the current code computes:

```text
maxDistance = ceil((N + M) / 2)
vectorLength = 2 * maxDistance + 1
```

It then allocates two eight-byte-per-entry arrays and fills both with `-1`. A 66,000-by-66,000 top-level range can
reserve roughly 2 MiB even if only a few dozen diagonals are explored. Recursive range tasks can allocate more frontiers
after the earlier ones become garbage.

## Proposed representation

Use `Uint32Array` with this encoding:

```text
stored 0        = unseen diagonal
stored x + 1    = furthest x coordinate
```

Fresh typed arrays are already zeroed, so a new frontier needs no explicit `fill(-1)`. Decoding produces the same `-1`
sentinel used by the current comparisons. Unsigned storage covers practical JavaScript array coordinates. If a
coordinate cannot be encoded as `x + 1`, fall back to the current `Float64Array` representation; throwing would narrow
the existing input contract and is not equivalent.

Start with capacity for a modest distance and grow geometrically when the next `distance` would exceed it. Because the
logical index is a signed diagonal, growth must recenter and copy the active interval:

```text
old index = oldCenter + diagonal
new index = newCenter + diagonal
```

Both forward and reverse arrays must move together. Geometric growth keeps the total number of copied slots linear in
the largest frontier reached.

## Reuse within one diff

`bisect` calls are sequential: once a split is returned, its frontier values are no longer needed. A per-`diffTokens`
workspace can therefore retain the largest allocated pair and lend it to the next range.

Reused slots must be reset. Two reasonable implementations should be benchmarked:

- clear only the active interval after each search; or
- record touched indices and reset those entries to zero.

The touched-index form helps sparse searches but adds a write and list push to the inner loop. A native typed-array fill
over the active interval may be faster despite clearing a few unused slots.

The KMP prefix table in [`findSubsequence`](../src/algorithm/myers.ts#L90-L134) can use a separate grow-only
`Uint32Array` in the same call-local workspace, eliminating another series of temporary allocations. Reset `prefix[0]`
and every used entry before reuse (or overwrite them before any read); the current fresh allocation implicitly supplies
the zero base case, and stale fallback links would corrupt KMP matching.

## Correctness constraints

- Frontier reads must decode zero to `-1` before comparisons.
- The initial forward and reverse seed is encoded coordinate zero, so its stored value is `1`.
- Overlap checks must test logical diagonal bounds before reading a physical slot.
- Growth must copy every diagonal reachable at the current parity, including the two neighbor slots read by the next
  iteration.
- Workspace state cannot be module-global because nested or concurrent calls must remain independent.
- The fallback for an unrepresentable coordinate must preserve correctness, for example by using the existing
  `Float64Array` representation.

The optimization should not alter prefix/suffix trimming, diagonal tie-breaking, overlap parity, or task order. Those
details determine which shortest script is selected when several are valid.

## Expected benefit

- `Float64Array` to `Uint32Array`: approximately half the frontier bytes.
- Zero sentinel: removes full-array `fill(-1)` on fresh buffers.
- Demand sizing: changes frontier storage for a sparse search from input-sized toward edit-distance-sized.
- Call-local reuse: reduces repeated allocation and garbage collection across split ranges.

Dense unrelated inputs still grow to the full frontier size and remain quadratic in time; the disjoint-token bailout is
the complementary optimization for that case.

## Validation and benchmarks

Run the exhaustive small-array LCS oracle after every representation change. Add focused tests around odd/even deltas,
frontier growth boundaries, empty sides, highly skewed ranges, multiple valid alignments, and the largest encoded value
that can be tested without excessive memory.

Measure these cases independently:

- 66,000 sparse-edited lines (large `N + M`, small `D`);
- 20,000 sparse-edited graphemes;
- many medium complex ranges, to expose allocation churn;
- 400/800/1,500 disjoint ranges, to ensure demand growth does not regress dense search;
- short-call throughput, where workspace setup can outweigh savings.

Use heap/external-memory measurements in addition to operations per second. Typed-array backing stores are not always
visible in ordinary JavaScript heap figures.

## Rollout

Implement this in three separately benchmarked steps: encoded 32-bit storage, demand growth, then call-local reuse. Keep
each step only if it improves its target workloads without a meaningful dense-input regression.

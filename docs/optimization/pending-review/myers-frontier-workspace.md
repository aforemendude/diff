# Optimization: compact, demand-sized Myers frontiers

## Summary

[`bisect`](../../../src/algorithm/myers.ts) allocates and fills two `Float64Array` instances sized from the complete
trimmed input range before it knows the edit distance. Large inputs with a few edits therefore reserve and initialize
far more frontier slots than the search visits.

Reject public input pairs whose combined UTF-16 length could exceed the compact representation, then store encoded
32-bit coordinates in frontiers that grow with the explored distance and reuse their storage across the sequential
bisections in one `diffTokens` call. This reduces bytes, initialization, and garbage while leaving Myers' search order
and chosen overlap unchanged.

## Current behavior

For lengths `N` and `M`, the current code computes:

```text
maxDistance = ceil((N + M) / 2)
vectorLength = 2 * maxDistance + 1
```

It then allocates two eight-byte-per-entry arrays and fills both with `-1`. A 66,000-by-66,000 top-level range can
reserve roughly 2 MiB even if only a few dozen diagonals are explored. Later range tasks on the explicit work stack can
allocate more frontiers after the earlier ones become garbage.

## Proposed representation

Use `Uint32Array` with this encoding:

```text
stored 0        = unseen diagonal
stored x + 1    = furthest x coordinate
```

Fresh typed arrays are already zeroed, so a new frontier needs no explicit `fill(-1)`. Decoding produces the same `-1`
sentinel used by the current comparisons. The encoding can represent `x` only through `2^32 - 2`. For `x = 2^32 - 1`,
`x + 1` is stored as zero and silently collides with the unseen sentinel.

### Overflow policy

Reject the input instead of adding a wider frontier fallback. Define the largest supported combined input length as
`2^32 - 2` UTF-16 code units. As the first executable step in both `diffLines` and `diffGraphemes`, throw a `RangeError`
when:

```text
MAX_COMBINED_INPUT_LENGTH = 0xffff_fffe
before.length > MAX_COMBINED_INPUT_LENGTH - after.length
```

Use the subtraction form rather than adding the lengths, so the check does not itself depend on a potentially
unrepresentable sum. Run it before `Intl.Segmenter` construction, trivial-case shortcuts, tokenization, or any
input-sized allocation. An oversized input therefore has the same deterministic failure even when a shortcut could have
avoided Myers or the grapheme options contain an invalid locale.

Line and grapheme token counts cannot exceed their source strings' UTF-16 lengths. The public check therefore proves
`N + M <= 2^32 - 2` before tokenization. It keeps every terminal `x` coordinate encodable as `x + 1`, bounds the
complete frontier length at `2^32 - 1`, and bounds its last physical index at `2^32 - 2`. This is intentionally a
worst-case check: a pair is rejected if one-code-unit tokens could overflow even when its actual tokenization would be
smaller.

This cutoff is beyond the strings supported by current major engines. JavaScriptCore's
[`JSString.h`](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/JSString.h) defines
`JSString::MaxLength` as `2^31 - 1`; two maximum-length JSC strings total exactly `2^32 - 2` and remain accepted. Other
common engine limits are lower. The
[ECMAScript String type](https://tc39.es/ecma262/2026/multipage/ecmascript-data-types-and-values.html#sec-ecmascript-language-types-string-type)
nevertheless permits up to `2^53 - 1` UTF-16 code units, so the explicit guard preserves correctness on an
implementation with a larger limit without carrying a fallback that is dead code on current engines.

The deliberate `RangeError` changes the nominal public input contract. Document the combined limit and failure in the
README when implementing the optimization. Keep `diffTokens` internal and perform the check once in each public diff
method rather than during tokenization or at every bisection.

Start with capacity for a modest distance and grow geometrically when the next `distance` would exceed it. Because the
logical index is a signed diagonal, growth must recenter and copy the active interval:

```text
old index = oldCenter + diagonal
new index = newCenter + diagonal
```

Both forward and reverse arrays must move together. Geometric growth keeps the total number of copied slots linear in
the largest frontier reached. Clamp a geometric growth step to the maximum capacity required for the admitted input so
rounding does not request a frontier longer than `2^32 - 1`.

## Reuse within one diff

`bisect` calls are sequential: once a split is returned, its frontier values are no longer needed. A per-`diffTokens`
workspace can therefore retain the largest allocated pair and lend it to the next range.

Reused slots must be reset. Two reasonable implementations should be benchmarked:

- clear only the active interval after each search; or
- record touched indices and reset those entries to zero.

The touched-index form helps sparse searches but adds a write and list push to the inner loop. A native typed-array fill
over the active interval may be faster despite clearing a few unused slots.

When [`findSubsequence`](../../../src/algorithm/myers.ts) reaches its KMP path, its prefix table can use a separate
grow-only `Uint32Array` in the same call-local workspace, eliminating another series of temporary allocations. Its
current one-token and short-length-gap paths do not allocate that table and should remain independent. Reset `prefix[0]`
and every used entry before reuse (or overwrite them before any read); the current fresh allocation implicitly supplies
the zero base case, and stale fallback links would corrupt KMP matching.

## Correctness constraints

- Frontier reads must decode zero to `-1` before comparisons.
- The initial forward and reverse seed is encoded coordinate zero, so its stored value is `1`.
- Overlap checks must test logical diagonal bounds before reading a physical slot.
- Growth must copy every diagonal reachable at the current parity, including the two neighbor slots read by the next
  iteration.
- Workspace state cannot be module-global because nested or concurrent calls must remain independent.
- No frontier write may encode an unrepresentable coordinate or depend on unsigned wraparound.
- Both public diff methods must reject a potentially unrepresentable input pair before any shortcut, segmentation,
  tokenization, or input-sized allocation.
- The core may rely on the public combined-length invariant; no wider frontier representation is retained.

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
frontier growth boundaries, empty sides, highly skewed ranges, and multiple valid alignments. Isolate the numeric input
limit predicate and coordinate encoding so tests can exercise the boundary without allocating multi-gigabyte strings or
arrays. At minimum, cover:

- accepted length pairs `(2^31 - 1, 2^31 - 1)` and `(2^32 - 2, 0)`;
- rejected length pairs `(2^32 - 2, 1)` and `(2^32 - 1, 0)`;
- the largest encoded coordinate, `x = 2^32 - 2`, and the first unrepresentable coordinate; and
- both public methods invoking the guard before their trivial-case and grapheme-segmentation paths.

Real-engine string limits are not an adequate overflow test.

Measure these cases independently:

- 66,000 sparse-edited lines (large `N + M`, small `D`);
- 20,000 sparse-edited graphemes;
- many medium complex ranges, to expose allocation churn;
- 400/800/1,500 disjoint ranges, to ensure demand growth does not regress dense search;
- short-call throughput, where workspace setup can outweigh savings.

Use heap/external-memory measurements in addition to operations per second. Typed-array backing stores are not always
visible in ordinary JavaScript heap figures.

## Rollout

Implement, document, and test the public size guard first. Then implement this in three separately benchmarked steps:
encoded 32-bit storage, demand growth, and call-local reuse. Keep each step only if it improves its target workloads
without a meaningful dense-input regression.

# Compact, demand-sized Myers frontiers: implemented

Status: implemented on 2026-08-16.

## Decision

Use call-local, demand-sized `Uint32Array` frontiers in [`bisect`](../../../src/algorithm/myers.ts), and reuse the
largest allocated pair across the sequential range tasks in one `diffTokens` call. The implementation also reuses a
grow-only KMP prefix table for [`findSubsequence`](../../../src/algorithm/myers.ts).

The compact representation requires public input pairs to contain at most `2^32 - 2` combined UTF-16 code units.
[`diffLines`](../../../src/diff/line.ts) and [`diffGraphemes`](../../../src/diff/grapheme.ts) enforce that limit before
trivial-case shortcuts, tokenization, or `Intl.Segmenter` construction. This is a deliberate public contract change and
is documented in the README.

The implementation passed the exactness suite and improved every targeted algorithm-scale benchmark. It is retained.

## Representation and overflow policy

The frontier stores encoded coordinates:

```text
stored 0        = unseen diagonal
stored x + 1    = furthest x coordinate
```

Reads decode zero to the previous `-1` sentinel before comparison. The initial coordinate-zero seeds therefore store
`1`. Fresh typed arrays need no sentinel fill, and each entry uses four bytes instead of eight.

The largest encodable coordinate is `2^32 - 2`. The public guard uses subtraction rather than adding potentially large
lengths:

```text
MAX_COMBINED_INPUT_LENGTH = 0xffff_fffe
before.length > MAX_COMBINED_INPUT_LENGTH - after.length
```

Line and grapheme token counts cannot exceed their source strings' UTF-16 lengths, so this check proves every coordinate
written by the internal Myers search is encodable. It also bounds a complete frontier length at `2^32 - 1` and its last
physical index at `2^32 - 2`. `diffTokens` remains internal and relies on calls from the guarded public methods.

The check is intentionally worst-case. It can reject a pair whose actual tokenization would fit if its combined source
length could overflow one-code-unit token coordinates. Current major engines impose lower per-string limits, but
ECMAScript permits longer strings, so relying on current engine limits would leave a silent unsigned-wraparound bug.

## Demand growth and reuse

[`myers-workspace.ts`](../../../src/algorithm/myers-workspace.ts) starts each frontier pair with capacity for distance
16, or the complete admitted distance when it is smaller. When a search exceeds that capacity, both arrays grow
geometrically, are recentered, and preserve logical diagonals under this mapping:

```text
old index = oldCenter + diagonal
new index = newCenter + diagonal
```

Growth is clamped to the complete frontier distance for the current range. The overlap checks validate a logical
diagonal before converting it to a physical index. Search order, parity, tie-breaking, prefix and suffix trimming, and
task order are unchanged.

One workspace belongs to each `diffTokens` call. A completed bisection clears only the reached interval with native
typed-array `fill`, then lends the same pair to the next range. Workspace state is never module-global. The KMP path
similarly retains its largest `Uint32Array`; it resets `prefix[0]`, and construction overwrites every other used entry
before any search reads it. One-token and short-length-gap subsequence paths still allocate no prefix table.

### Reset strategy

An alternative prototype recorded each newly touched logical diagonal in JavaScript arrays and cleared those slots one
by one. Against the retained active-interval fill, it was effectively flat on the 66,000-token sparse case but about 2%
slower on the stable 800-token disjoint, reversed-token, and repetitive sparse cases. The 400-token disjoint mean was
about 10% slower and noisier. The native interval fill was retained because its performance was more consistent and it
does not add an inner-loop branch and list push.

## Correctness validation

The implementation retains the existing exhaustive LCS oracle over every pair of binary token arrays through length six.
Additional tests cover:

- accepted numeric length pairs `(2^31 - 1, 2^31 - 1)` and `(2^32 - 2, 0)`;
- rejected pairs `(2^32 - 2, 1)` and `(2^32 - 1, 0)` without allocating large strings;
- both public methods rejecting before shortcuts, line tokenization, or grapheme segmentation;
- the largest coordinate encoding and the first unrepresentable coordinate;
- recentering both arrays at the first geometric growth boundary;
- even and odd deltas, disjoint and highly skewed ranges, and existing multiple-alignment cases;
- clearing and reusing one frontier pair across sequential sparse bisections; and
- growing, reusing, and resetting the KMP prefix table.

The complete unit, integration, build, and packed-package verification also passes.

## Benchmark method

The baseline commit and candidate were run in separate fresh Vitest processes on Node.js 24.18.0, npm 11.16.0, Vitest
4.1.10, Linux 7.0.0 on x86-64, and a four-core Intel N95. Fixture construction and correctness preflights were outside
timed regions. The command was:

```bash
npx vitest bench --run test/benchmark/public-api.bench.ts
```

Times below are arithmetic means from the paired run. Lower is better. The sparse 66,000-token baseline had visible
garbage-collection outliers, so its percentage is directional; the dense cases had tight distributions.

| Workload                                          | Baseline (ms) | Candidate (ms) | Change |
| ------------------------------------------------- | ------------: | -------------: | -----: |
| Direct 66,000-token sparse edits                  |       21.4470 |        17.1357 | -20.1% |
| Direct 20,000-token repetitive sparse edits       |        1.4511 |         0.7048 | -51.4% |
| Direct 400 disjoint tokens per side               |        4.9153 |         3.2659 | -33.6% |
| Direct 800 disjoint tokens per side               |       18.7811 |        12.3368 | -34.3% |
| Public 1,500 disjoint graphemes                   |       62.4184 |        40.4706 | -35.2% |
| Public 20,000 graphemes with sparse edits         |        6.2077 |         5.8679 |  -5.5% |
| Public 192 lines with 46 edits across eight hunks |        0.1214 |         0.0875 | -27.9% |
| Public 64 lines with one replaced line            |        0.0063 |         0.0061 |  -3.2% |
| Short mixed-Unicode text with three edits         |        0.0252 |         0.0243 |  -3.6% |

The final two rows exercise short-call overhead. They show no meaningful setup regression. Separate isolated runs of the
deterministic 1,000-call representative schedule measured the candidate at 1.212 seconds twice; baseline measurements on
the same host ranged from 1.519 to 1.566 seconds. The three-sample score can be sensitive to process tiering, so the
independently reported workload rows remain the primary diagnostics.

## Typed-array allocation diagnostic

A constructor-level diagnostic compared 66,000 unique tokens with five separated replacements. It counts requested
typed-array backing-store bytes during one `diffTokens` call; it excludes ordinary arrays, token storage, and result
storage.

| Variant   | Typed-array allocations                  | Total bytes |
| --------- | ---------------------------------------- | ----------: |
| Baseline  | Five `Float64Array` frontier pairs       |   5,280,048 |
| Candidate | One 33-entry `Uint32Array` frontier pair |         264 |

The baseline's first pair alone requested 2,111,952 bytes. The candidate needed only its initial pair because edit
distance stayed below the first growth boundary, and it reused that pair for later bisections. This deterministic count
captures typed-array backing stores that ordinary JavaScript heap measurements may omit.

## Result

The final implementation reduces sparse frontier storage from input-sized toward edit-distance-sized, removes fresh
sentinel fills, reuses storage across range tasks, and halves each retained frontier entry. Dense inputs still have
quadratic search time, but demand growth did not regress the tested dense cases; the compact loop improved them on this
runtime.

# Optimization: adaptive sparse-match LCS

## Summary

Myers is output-sensitive in edit distance, so it excels when two long sequences are mostly equal but approaches
quadratic time when the shortest edit script is large. Some high-distance inputs nevertheless contain few cross-sequence
matching pairs. An exact Hunt-Szymanski LCS path can solve those in roughly `O(N + M + r log L)`, where `r` is the
number of matching position pairs and `L` is the LCS length.

Select this engine only when relative work and memory estimates show a conservative advantage, and fall back to Myers
for repetitive or uncertain inputs. The result is still a shortest insertion/deletion script; this is not a
patience-diff heuristic.

## Motivating cases

- Fully disjoint inputs have `r = 0`; the disjoint-token bailout is the simplest special case.
- Two sequences containing the same unique tokens in reverse order have `r ~ N` and `L = 1`. Myers performs nearly
  quadratic work because edit distance is large, while the sparse-match algorithm is about `O(N log N)`.
- Large alphabets with a small fraction of shared tokens can have high edit distance but a manageable `r`.

Conversely, two sequences over a tiny repeated alphabet can have `r` near `N x M`. Myers must remain available there.

## Algorithm

After the existing common-prefix and common-suffix trimming, keep the current empty-side, interior-containment, and
one-token shortcuts ahead of any new engine. At the point that currently proceeds to `bisect`:

1. Build a map from each reflexive token in `after` to a bucket ID. Typed arrays hold each bucket's count and head plus
   a previous-occurrence link for every `after` position. Building left to right makes each linked occurrence chain
   descend by position.
2. Scan `before` and sum the bucket counts to obtain `r` without visiting all matching pairs.
3. In adaptive mode, compare the complete sparse predecessor-workspace estimate with the maximum Myers frontier peak for
   this range. If it exceeds the relative allowance, select Myers before allocating predecessor records.
4. For an admitted adaptive range, visit the matching positions in descending order and run a length-only
   longest-increasing-subsequence probe. This obtains the exact `L` needed for the final work and memory comparison.
5. If sparse remains preferable, repeat the scan while storing predecessor records, reconstruct one exact LCS as
   `(beforeIndex, afterIndex)` pairs, and emit deletion, insertion, and equality ranges through the shared append
   helper.
6. Append the already trimmed suffix. If adaptive mode selects Myers, retain that decision for the rest of the call so
   child bisections do not rebuild occurrence indexes.

Descending occurrence order is essential: it prevents two positions for the same `before` token from appearing in one
increasing subsequence update.

## Adaptive selection

The implementation has no absolute matching-pair cap or minimum range length. Estimates saturate at
`Number.MAX_SAFE_INTEGER`; saturation therefore favors Myers rather than allowing arithmetic overflow to select sparse.

For `U` distinct indexed tokens and `F = min(N, M, r)`, the adaptive sparse peak estimate is approximately:

```text
12M + 32U + 16r + 12F + 8L bytes
```

This includes the occurrence index, map-entry allowance, predecessor records, LIS frontier, frontier record IDs, and
reconstructed match chain. Before the length-only probe, the same calculation without the final `8L` chain is compared
with an optimistic Myers frontier estimate for the range. The estimate follows the implementation's geometric frontier
growth and includes both the old and new pairs retained during a modeled grow. Its deliberately low `h` can omit the
last layer for a positive even edit distance, understating both Myers work and a boundary grow so uncertainty favors
Myers. Sparse must remain within four times that estimate.

After the probe obtains exact `L`, let `D = N + M - 2L` and `h = floor((D - 1) / 2)`, clamped at zero. The conservative
work estimates are:

```text
adaptive sparse: 64 + M + 3N + r(2 ceil(log2(L + 1)) + 5)
Myers:           N + M + (h + 1)(h + 2)
```

The sparse estimate accounts for indexing, pair counting, the length-only probe, and the predecessor-recording pass. The
Myers expression estimates diagonal visits from its bidirectional search while omitting recursive follow-up work, which
intentionally understates Myers. Adaptive mode selects sparse only when its estimated work is at least eight times lower
and its peak workspace remains within the four-times allowance. Ties and uncertain cases select Myers.

The disjoint proof shares the occurrence index: `r === 0` produces a zero-length LCS and can emit the whole edit when
the relative selector admits the range. There is no separate set pass.

## Public selection

`diffLines` and `diffGraphemes` accept `algorithm: 'adaptive' | 'myers' | 'sparse'`, defaulting to `adaptive`. Forced
engines still retain the shared prefix/suffix, empty-side, containment, and one-token shortcuts. `myers` then always
bisects, while `sparse` always constructs the exact sparse LCS. Forced sparse mode deliberately does not fall back for a
repetitive range; the caller has explicitly selected its time and memory profile. Invalid selector values throw a
`RangeError` before tokenization or other optional shortcuts.

## Equality semantics

[`diffTokens`](../../../src/algorithm/myers.ts) compares tokens with strict `===`. JavaScript `Map` uses SameValueZero,
which would incorrectly treat `NaN` as matching itself. Exclude every non-reflexive token (`token !== token`) from both
the position map and lookups. Other primitive values and object identity agree with `===`; `0` and `-0` compare equal in
both systems.

## Emitting normalized output

Use the existing range-based append helper so adjacent operations merge and every public token array is owned. When a
chosen LCS contains consecutive matches, emit them as one equality range rather than one tuple per token.

Different LCS algorithms can select different valid LCSs. That is permitted here, but all results must satisfy:

- reconstruction of both token streams;
- no empty entries;
- no adjacent entries with the same operation;
- edit cost `N + M - 2L`;
- grapheme tokens remain indivisible because the core never splits a token.

## Why unique-anchor patience diff is not enough

Forcing tokens that are unique on both sides as anchors is attractive but not generally exact: crossing or poorly chosen
anchors can exclude a longer common subsequence and produce a nonminimal script. Hunt-Szymanski considers the complete
matching-pair relation within its accepted work budget, so its reconstructed LCS is exact.

## Risks

- Predecessor reconstruction and equal-run emission are more complex than the length-only LIS algorithm.
- An adaptive fallback still pays for the occurrence index, pair count, and sometimes the length-only probe. It does not
  allocate predecessor records until both relative selection checks pass.
- Token maps retain token references for the duration of the call; release the workspace before returning.
- The relative work and memory boundaries can cause performance cliffs. Benchmarks must include inputs around both
  crossover points.
- Exact tuple output will differ on ambiguous inputs; tests should focus on shortestness and reconstruction except where
  a documented cleanup example intentionally fixes presentation.

## Validation

Compare both engines against the existing exhaustive LCS oracle for every small array over duplicate-heavy alphabets.
Add randomized arrays containing strings, numbers, symbols, shared/distinct object references, `NaN`, and signed zero.
Run explicit reversed-unique, crossing-match, full-containment, empty-side, and odd/even edit-distance cases.

Benchmark geometric sizes through adaptive selection only for:

- reversed unique sequences;
- disjoint sequences;
- 1%, 5%, and 10% shared position pairs over large alphabets;
- duplicate-heavy alphabets that force fallback;
- mostly equal low-distance inputs, which should remain on Myers;
- ranges just below and above the relative memory and work crossovers.

Measure peak retained/external memory along with time.

## Benchmark evidence

The implemented benchmark invokes adaptive mode explicitly for every timed call and preflight. On 2026-08-21 with
Node.js 24.19.0, Vitest 4.1.10, Linux 7.0.0 on x86-64, and a four-core Intel N95:

- the existing 9,500-line disjoint public workload averaged 5.10 ms;
- the existing 11,000-grapheme disjoint public workload averaged 4.02 ms;
- the three-size lower-match memory-crossover schedule averaged 1.61 ms, while the adjacent higher-match schedule that
  conservatively selected Myers averaged 47.47 ms;
- the single-size work-crossover schedules averaged 0.19 ms on the Myers side and 0.04 ms on the sparse side; and
- the isolated adaptive-selection memory run increased RSS by 115.22 MiB, from 99.54 MiB to 214.76 MiB.

The crossover results make the intentional selection cliffs visible. The permanent geometric schedules also cover
reversed unique tokens, 1%, 5%, and 10% shared position pairs over unique alphabets, a duplicate-heavy rotation that
falls back to Myers, a unique low-distance rotation, and adjacent inputs around both the work and memory gates.
`npm run benchmark` continues to measure only the adaptive public default, and `npm run benchmark:adversarial` includes
these selector diagnostics without adding forced-engine scores.

## Rollout

The standalone disjoint bailout remains unnecessary because this engine's occurrence index subsumes it when `r === 0`.
The sparse engine is available explicitly and through conservative adaptive selection; Myers remains the exact fallback.
Timed and memory benchmarks exercise adaptive mode only. Forced modes are covered by differential exhaustive and
mixed-token property tests rather than separate benchmark scores.

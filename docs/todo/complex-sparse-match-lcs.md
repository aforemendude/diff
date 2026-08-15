# Complex optimization: adaptive sparse-match LCS

## Summary

Myers is output-sensitive in edit distance, so it excels when two long sequences are mostly equal but approaches
quadratic time when the shortest edit script is large. Some high-distance inputs nevertheless contain few cross-sequence
matching pairs. An exact Hunt–Szymanski LCS path can solve those in roughly `O(N + M + r log L)`, where `r` is the
number of matching position pairs and `L` is the LCS length.

Select this engine only while `r` remains below a work budget, and fall back to Myers for repetitive inputs. The result
is still a shortest insertion/deletion script; this is not a patience-diff heuristic.

## Motivating cases

- Fully disjoint inputs have `r = 0`; the disjoint-token bailout is the simplest special case.
- Two sequences containing the same unique tokens in reverse order have `r ≈ N` and `L = 1`. Myers performs nearly
  quadratic work because edit distance is large, while the sparse-match algorithm is about `O(N log N)`.
- Large alphabets with a small fraction of shared tokens can have high edit distance but a manageable `r`.

Conversely, two sequences over a tiny repeated alphabet can have `r` near `N × M`. Myers must remain available there.

## Algorithm

After the existing common-prefix and common-suffix trimming:

1. Build a map from each token in `after` to its ascending list of positions.
2. Scan `before`. For each token, visit its matching `after` positions in descending order.
3. Feed those positions into a longest-increasing-subsequence frontier, storing predecessor records needed to
   reconstruct the selected match chain.
4. Reconstruct one exact LCS as `(beforeIndex, afterIndex)` pairs.
5. Emit deletion and insertion ranges between consecutive matches and equality entries for the matches.
6. Append the already trimmed suffix.

Descending occurrence order is essential: it prevents two positions for the same `before` token from appearing in one
increasing subsequence update.

## Adaptive selection

Count `r` while looking up occurrences. Abort construction and call the existing Myers bisection when either:

- `r` exceeds an absolute memory/work cap; or
- `r log2(min(N, M) + 1)` exceeds a calibrated fraction of the estimated Myers work.

The first implementation should use a simple absolute cap and minimum range length. Add a smarter cost model only after
benchmarks show a selection problem. The cap must include predecessor-record memory, not only the position lists.

The disjoint proof can share the occurrence map: if scanning `before` yields `r === 0`, emit the whole edit immediately.
If this combined engine is adopted, do not also build a separate set first.

## Equality semantics

[`diffTokens`](../src/algorithm/myers.ts#L267-L273) compares tokens with strict `===`. JavaScript `Map` uses
SameValueZero, which would incorrectly treat `NaN` as matching itself. Exclude every non-reflexive token
(`token !== token`) from both the position map and lookups. Other primitive values and object identity agree with `===`;
`0` and `-0` compare equal in both systems.

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
anchors can exclude a longer common subsequence and produce a nonminimal script. Hunt–Szymanski considers the complete
matching-pair relation within its accepted work budget, so its reconstructed LCS is exact.

## Risks

- Predecessor reconstruction and equal-run emission are more complex than the length-only LIS algorithm.
- A late fallback can waste time and allocate many records before Myers starts. Count or cap matching pairs as early as
  possible.
- Token maps retain token references for the duration of the call; release the workspace before returning.
- The engine-selection threshold can cause performance cliffs. Benchmarks must include sizes immediately around it.
- Exact tuple output will differ on ambiguous inputs; tests should focus on shortestness and reconstruction except where
  a documented cleanup example intentionally fixes presentation.

## Validation

Compare both engines against the existing exhaustive LCS oracle for every small array over duplicate-heavy alphabets.
Add randomized arrays containing strings, numbers, symbols, shared/distinct object references, `NaN`, and signed zero.
Run explicit reversed-unique, crossing-match, full-containment, empty-side, and odd/even edit-distance cases.

Benchmark geometric sizes for:

- reversed unique sequences;
- disjoint sequences;
- 1%, 5%, and 10% shared position pairs over large alphabets;
- duplicate-heavy alphabets that force fallback;
- mostly equal low-distance inputs, which should remain on Myers;
- ranges just below and above the `r` cap.

Measure peak retained/external memory along with time.

## Rollout

Land this after the simpler disjoint bailout and compact-frontier work. Begin as an internal alternative selected only
for large ranges with a conservative pair cap. Keep the existing Myers implementation as the correctness fallback and
use differential property tests until the new path is mature.

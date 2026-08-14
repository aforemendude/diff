# Simple performance optimizations

This document collects changes that are local, mechanically understandable, and low risk. Items are numbered for
reference rather than as a strict implementation order. Exploratory measurements are included where available, and each
item says which workload should prove or disprove it. Unless noted otherwise, local measurements were exploratory runs
on Node.js 24.18.0 rather than portable performance guarantees.

## 2. Remove the redundant cleanup input copy

Both cleanup entry points call `cleanupMerge(prepare(diffs))`: see
[`cleanupSemantic`](../src/cleanup/semantic.ts#L276-L281) and
[`cleanupEfficiency`](../src/cleanup/efficiency.ts#L102-L111). `prepare` walks and copies every token, but
[`mergeEditBlocks`](../src/cleanup/common.ts#L101-L147), which is the first operation inside `cleanupMerge`, walks the
same input again and creates another fully owned normalized result.

Fuse `prepare`'s normalization into the first merge pass, then remove the separate call. The fused scanner must skip
empty entries **before** deciding whether an equality ends an edit block, coalesce adjacent operations, factor edit
blocks, and copy retained tokens into owned storage once.

Do not merely pass raw public input to the current `cleanupMerge`: an empty equality currently terminates
`mergeEditBlocks`' edit-run loop even though `append` later drops it. For example, deletion `a`, empty equality,
insertion `a` must normalize to equality `a`; treating the empty tuple as a block boundary misses that factoring.

Validate this against the frozen-input and separately-owned-output tests, then measure both existing cleanup benchmarks.
A focused local comparison measured about 0.86 ms with the redundant pass versus 0.33 ms without it for 1,200 one-token
groups; 100 groups containing 1,000-token edits improved from roughly 2.51 ms to 1.31 ms. Add the empty-equality example
above as a regression test for the fused implementation.

## 3. Avoid double-copying slices during cleanup merge

[`mergeEditBlocks`](../src/cleanup/common.ts#L135-L143) creates up to four temporary arrays with `slice`, then passes
each one to `append`, which copies it again when starting a result entry. The temporary arrays immediately become
garbage.

Add a small `appendRange(result, operation, source, start, end)` helper, like the range-based helper already used in
`diffTokens`. Copy each retained range directly into its destination exactly once. This is especially useful when a
cleanup call contains large deletion and insertion blocks.

Use allocation-sensitive benchmarks with large edit blocks in addition to the current many-small-block workloads.

## 4. Special-case a one-token subsequence search

[`findSubsequence`](../src/algorithm/myers.ts#L90-L134) allocates and initializes a KMP prefix table even when the
needle contains one token. This case is reachable before `diffTokens`' one-token fallback.

For `needleLength === 1`, scan the haystack directly and return the first equal token. This removes a typed-array
allocation and KMP bookkeeping from many tiny subproblems without changing which match is chosen.

Add tests for a present and absent one-token needle at both ends, and include a small-call throughput benchmark.

## 5. Avoid repeated regex classification at semantic cuts

[`boundaryScores`](../src/cleanup/semantic.ts#L107-L130) can test the same neighboring grapheme several times for line
break, whitespace, and punctuation. `isLineBreak` also runs a regular expression even though two `includes` checks for
`'\r'` and `'\n'` express the same predicate directly.

Replace the line-break regex with those checks and calculate each neighbor's three boolean properties at most once per
cut before applying the score rules. This keeps the scoring rules and tie-breaking identical while reducing
Unicode-regex calls in the semantic-cleanup hot loop.

Measure the generated word-boundary benchmark and retain the existing blank-line, line-break, sentence, word,
punctuation, Thai, and tie-placement tests.

## 6. Replace callback equality checks with a loop

[`equalTokens`](../src/cleanup/common.ts#L89-L90) uses `Array.prototype.every` with a new callback invocation for each
token. A length check followed by a plain indexed loop avoids callback overhead and can return at the first mismatch.

This is a small hot-loop cleanup. It should only be kept if the semantic benchmark shows a repeatable improvement.

## 7. Iterate grapheme segments without `Array.from`'s mapping callback

[`tokenizeGraphemesWithSegmenter`](../src/tokenize/graphemes.ts#L4-L5) builds its result with
`Array.from(iterable, mapper)`. A plain `for...of` loop that pushes `part.segment` avoids the mapping callback while
still consuming the exact same `Intl.Segmenter` result.

A local 20,000-token trial improved segmentation from about 3.04 ms to 2.53 ms. Retain all Unicode cluster tests and
benchmark both long strings and short-call throughput; this is an engine-sensitive constant-factor change.

## 8. Skip containment searches that cannot succeed

After [`diffTokens`](../src/algorithm/myers.ts#L313-L320) removes the common prefix and suffix, nonempty remaining
ranges have different first tokens and different last tokens. The complete shorter range can therefore occur inside the
longer one only when the longer range has room for at least one token on both sides. Skip KMP when the length difference
is less than two.

For a difference of exactly two, compare the one possible interior range directly. Combine this with the one-token scan
above. Validate equal-length replacements, gaps of one and two, repeated tokens, and large useful containment cases.

## 9. Reduce loads in the Myers diagonal loops

The forward and reverse recurrence in [`bisect`](../src/algorithm/myers.ts#L168-L260) calls `vectorValue` for both
neighbors and then loads the selected neighbor again. Load each neighbor into a local once. The recurrence neighbors are
in bounds; for cross-frontier overlap checks, test the calculated offset before reading it.

This removes helper calls and redundant typed-array reads from the densest loop. It is easy to understand but should be
kept only after direct core benchmarks show a repeatable benefit.

## 10. Delay suffix task allocation on terminal ranges

[`diffTokens`](../src/algorithm/myers.ts#L322-L328) creates an `EqualTask` for every trimmed suffix before knowing
whether the current range will split. Empty-side, containment, one-token, and failed-split branches are terminal but
still pay for the task object and another stack iteration.

Keep suffix coordinates in locals, append the suffix directly on terminal branches, and create an `EqualTask` only for a
valid recursive split. Verify operation coalescing at every terminal branch.

## 11. Compact semantic results without copying every token again

[`cleanupSemantic`](../src/cleanup/semantic.ts#L283-L285) finishes with `coalesce(extractOverlaps(working))`. The
working diff already owns its storage, but `coalesce` deep-copies every token array, including unaffected entries.

Add an internal owned-input compactor that filters empty entries and merges adjacent operations in place, reusing token
arrays that are not merged. Public output remains fresh because ownership was established earlier. `coalesce` alone took
about 1.15 ms on a local 8,000-group short-overlap workload, so this is worth measuring separately.

## 12. Strengthen benchmark correctness preflight

The public benchmark checks normalization and reconstruction at
[`public-api.bench.ts`](../test/benchmark/public-api.bench.ts#L76-L98), but those properties do not prove minimality: an
implementation that deletes everything and inserts everything would pass.

Record the known edit cost for fixtures where it is provable, such as the unique-line sparse workload, and assert it
during preflight. Do not treat the scripted edit count of the repetitive grapheme fixture as the optimum; repeated
tokens can create a cheaper alignment. Add direct `diffTokens` benchmarks for low-distance, containment, disjoint,
reversed-unique, and repetitive inputs so tokenization does not hide core changes. This does not speed production code,
but it prevents an invalid shortcut from appearing to be an optimization.

## 13. Fast-path one-sided public diffs

When exactly one input is empty, the public wrappers can tokenize only the nonempty string and return that owned token
array directly as one insertion or deletion. The current route through `diffTokens` slices the complete token array even
though no comparison is needed.

For graphemes, construct the segmenter first so invalid locales still throw. For lines, preserve the distinction between
empty text (`[]`) and one blank line (`['']`). Local large one-sided trials improved by roughly 3–12%; add explicit
one-sided throughput and ownership benchmarks.

## 14. Recognize one insignificant terminal line ending

The line API deliberately treats `"a"` and `"a\n"` as the same canonical token stream. When the only text difference is
one selected terminal delimiter, [`diffLines`](../src/diff/line.ts#L6-L8) can tokenize the shorter text once and return
an equality.

The safe condition is precise: the shorter text is nonempty, does not already end in the delimiter, and the longer text
is exactly `shorter + lineEnding`. The guards matter because `""` versus `"\n"` and `"a\n"` versus `"a\n\n"` represent
real blank-line changes. Check lengths plus `startsWith`/`endsWith` rather than allocating a concatenated copy merely to
test the condition. A local 66,000-line prototype improved from about 9.50 ms to 3.4 ms.

## 15. Skip semantic scoring when an isolated edit cannot shift

In [`cleanupSemanticLossless`](../src/cleanup/semantic.ts#L148-L178), let `c` be the common suffix length of the left
equality and edit. If `c === 0` and the edit's first token differs from the right equality's first token, the shift loop
cannot advance and the original placement must win. Skip region construction, word segmentation, scoring, and final
copies in that case.

Continue constructing the word segmenter at the public entry point so invalid locale behavior remains unchanged. The
generalized candidate-enumeration design is intentionally separate in
[`complex-semantic-boundary-scoring.md`](complex-semantic-boundary-scoring.md).

## 16. Reuse overlap KMP scratch storage

[`commonOverlapLength`](../src/cleanup/semantic.ts#L198-L231) slices a pattern and allocates a prefix table for each
direction of every deletion/insertion pair. Accept source ranges instead of slicing and lend both directions a grow-only
`Uint32Array` created once inside `extractOverlaps`.

Set `prefix[0] = 0`; overwrite entries `1..length - 1` while building the next table, and ignore the unused tail. This
preserves exact overlap choice without a full-buffer clear. On a synthetic workload of 1,000 pairs with 1,000-token
overlaps, eliminating pattern slices and sharing scratch storage reduced the overlap kernel from about 24.3 ms to 20.4
ms.

Because the user permits a different equivalent output, a further optional shortcut is to accept the forward overlap as
soon as it meets the extraction threshold, without computing the reverse direction. This can choose a shorter equality
than the current maximum-direction rule, so keep it behind a separate benchmarked change and validate reconstruction and
normalization rather than exact tuples.

## 17. Fast-path single-operation edit blocks

[`mergeEditBlocks`](../src/cleanup/common.ts#L116-L143) flattens every edit run into deletion and insertion
accumulators, slices the retained ranges, and copies them again through `append`. When the run contains only deletions
or only insertions, there is no common text to factor.

Detect that case while scanning the block and append each source chunk directly to the matching result operation. This
copies every token once and lets `append` coalesce adjacent chunks. Cover runs split across many input tuples, empty
entries, and frozen input.

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

# Simple performance optimizations

This document collects changes that are local, mechanically understandable, and low risk. Items are numbered for
reference rather than as a strict implementation order. Exploratory measurements are included where available, and each
item says which workload should prove or disprove it. Unless noted otherwise, local measurements were exploratory runs
on Node.js 24.18.0 rather than portable performance guarantees.

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

# Optimization: score only reachable semantic boundaries

## Summary

Semantic lossless cleanup currently builds several complete token arrays, segments their concatenated text, classifies
every cut in the region, and slices three result arrays for every isolated edit - even when the edit cannot move or only
a small number of placements are reachable.

Represent the region as spans over the existing three token arrays, enumerate reachable placements first, ask
`Intl.Segmenter` for word boundaries once, and score only the two cuts for each candidate placement. Materialize arrays
only when the winning placement differs from the current one.

This is separate from the simple no-shift guard: it changes the whole scoring kernel and its indexing representation.

## Current allocation and work

For an equality/edit/equality triple, [`cleanupSemanticLossless`](../../../src/cleanup/semantic.ts#L135-L196) currently
creates:

- `common` with `slice`;
- `baseLeft` with `slice`;
- the remainder of the edit with `slice`, then `baseEdit` with `concat`;
- `baseRight` with `concat`;
- `region` with another `concat`;
- a full `Uint8Array` score table;
- `bestLeft`, `bestEdit`, and `bestRight` with three final slices.

[`boundaryScores`](../../../src/cleanup/semantic.ts#L96-L133) then classifies every token cut in `region`, although the
shift loop considers only a contiguous sequence of equivalent edit placements.

The constructed `region` is logically the original `left + edit + right`; the rotations only change the two cut
positions. The initial first cut is `left.length - commonSuffixLength(left, edit)`, and the edit length is constant.

## Proposed kernel

### 1. Enumerate reachable shifts without building `region`

Create a small read-only span accessor that maps a logical region index to one of `left`, `edit`, or `right`. Start from
the current algorithm's maximally left-rotated position and compare the token at the first cut with the token after the
second cut. Each equality advances both cuts by one.

Record only candidate shift numbers, or score them as the word-boundary information becomes available. If there is no
alternative placement, return immediately without segmentation or token copies. The public function can still construct
the requested segmenter before this phase, preserving invalid-locale behavior.

### 2. Build UTF-16 offsets once

`Intl.Segmenter` reports UTF-16 string offsets, while cleanup operates in grapheme-token indices. Join the logical
region once for word segmentation and build prefix UTF-16 offsets only for the candidate cut positions. Because
candidates are monotonic, this can be done with one token scan and no map from every offset.

Collect word-like segment starts and ends into a set, as today. Alternatively, advance through the segment iterator and
candidate offsets together to avoid the set; benchmark both because the iterator is ordered.

### 3. Cache token classifications per call

The DMP score also depends on whether tokens around each cut contain a line break, consist of whitespace, or contain
Unicode punctuation/symbols. Cache those three flags by token string for the duration of one cleanup call. Repeated
spaces, newlines, and ASCII punctuation then pay the Unicode regular expressions once.

Use a bounded or call-local map so arbitrary input cannot create retained global state. A per-call map has at most the
number of distinct grapheme strings in that cleanup.

### 4. Score candidates and materialize only the winner

Evaluate exactly the same priority rules for the first and second cut of each reachable placement. Retain the `>=`
comparison so later positions win ties. If the winning shift equals the original placement, reuse all three owned token
arrays untouched.

If it differs, construct the new left/edit/right arrays directly from spans. An `appendSpanRange` helper can copy a
range that crosses at most three source arrays without first materializing `region`.

## Expected benefit

The exploratory measurements below were collected on Node.js 24.18.0 and are intended to motivate profiling.

The current generated boundary workload scales linearly at about 34 microseconds per edit on the local runtime: 250,
500, 1,000, 2,000, 4,000, and 8,000 edits took approximately 12.7, 20.8, 33.1, 68.0, 135.8, and 270.1 ms. This is not an
asymptotic bug, but it is the dominant semantic-cleanup constant factor.

An exploratory candidate-only scorer with UTF-16 cut tracking and token-classification caching reduced its isolated
kernel from about 60.1 ms to 27.0 ms at 2,000 edits and from 227.7 ms to 101.6 ms at 8,000 edits. Treat those figures as
motivation, not a promised end-to-end speedup.

## Correctness constraints

- The reachable-placement enumeration must start at the same maximally left-rotated edit as today.
- Boundary scores must use UTF-16 offsets returned by the same requested `Intl.Segmenter`.
- Blank-line, line-break, punctuation-followed-by-whitespace, word/whitespace, and punctuation rules retain their
  current priority and numeric values.
- Later placements must still win equal scores.
- A token may contain multiple UTF-16 code units and embedded line-break characters; offsets cannot be inferred from
  token count.
- No optimization may split a grapheme token.
- Empty left/right results must remove their tuple, and neighboring operations must remain normalized.

## Validation

Differentially compare exact output with the current implementation over generated equality/edit/equality triples. Bias
the corpus toward repeated tokens, combining graphemes, emoji, CR/LF/CRLF, whitespace graphemes, punctuation/symbols,
Thai text, and ties with several reachable placements.

Retain the existing blank-line, line-break, sentence, word, punctuation, Thai, latest-tie, frozen-input, and
repeated-call tests. Add cases where:

- no shift is possible;
- the initial common suffix is empty or consumes the edit;
- the best choice is initial, middle, and final;
- a candidate cut is a word-like segment start, end, both, or neither;
- UTF-16 length differs sharply from token count.

Benchmark no-shift, one-alternative, and many-alternative triples separately, plus the existing 2,000-edit and composed
prose workloads. Track allocated bytes if the runtime profiler exposes them.

## Rollout

Land the no-shift guard first. Then introduce the span accessor with exact differential tests, followed by
candidate-only offset/scoring logic, classification caching, and delayed materialization as separately benchmarked
steps.

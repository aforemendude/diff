# Semantic boundary scoring: implemented

Status: implemented on 2026-08-20.

## Decision

Use candidate-only boundary scoring in [`cleanupSemanticLossless`](../../../src/cleanup/semantic.ts). The implementation
preserves the exact semantic-cleanup result while avoiding complete rotated token regions, full cut-score tables, and
result-array copies when the original edit placement wins.

The public API, locale behavior, normalization, ownership, exactness, and browser requirements are unchanged.

## Previous cost

For every shiftable equality/edit/equality triple, the former implementation created:

- a common-suffix array and three maximally left-rotated token arrays;
- a complete `region` array for `left + edit + right`;
- a `Uint8Array` containing the score at every grapheme cut; and
- three sliced result arrays, even when the original placement ultimately won.

It also ran the Unicode whitespace and punctuation/symbol regular expressions repeatedly for equal token strings and
classified cuts that the edit could never reach.

## Implementation

### Reachable candidates over spans

The logical region is represented as three read-only spans over the existing left equality, edit, and right equality. A
small accessor maps a logical token index into those spans.

The maximally left-rotated edit starts at:

```text
left.length - commonSuffixLength(left, edit)
```

The second cut is one edit length later. Candidate shifts are contiguous, so the implementation records only the maximum
reachable shift while corresponding tokens at the two cuts remain equal. The existing cheap no-shift guard runs first,
and segmentation is skipped when no alternative placement is reachable.

The caller's original placement is the common-suffix length relative to the maximally left-rotated position.

### UTF-16 word-boundary offsets

The three spans are joined as text once for the requested `Intl.Segmenter`. Word-like segment starts and ends are stored
as UTF-16 offsets. The scorer tracks the two candidate-cut offsets monotonically with each crossed token's JavaScript
string length. It does not infer string offsets from grapheme-token indexes.

Only the two cuts for each reachable placement receive the Diff Match Patch quality score. The priority remains:

1. region edge;
2. blank line;
3. line break;
4. punctuation followed by whitespace;
5. word boundary or whitespace;
6. punctuation or symbol; and
7. neutral text.

The comparison remains `>=`, so a later placement still wins a tie.

### Call-local classification cache

A lazily created call-local `Map` caches three flags per distinct token string: contains CR or LF, consists entirely of
whitespace, and contains Unicode punctuation or symbols. The same cache serves every isolated edit within one cleanup
call and is discarded afterward. Its zero bitmask is treated as a cached value.

### Delayed materialization

When the winning shift is the original placement, the scorer leaves the already owned working tuples and token arrays
untouched. When the edit moves, a span-range helper copies the winning left, edit, and right ranges directly from the
three sources. Empty boundary equalities are removed, and final compaction retains normalized output.

## Correctness validation

The co-located semantic tests retain the existing blank-line, line-break, sentence, word, punctuation, Thai, latest-tie,
frozen-input, and repeated-call coverage. New focused cases cover:

- no reachable shift for insertions and deletions without invoking segmentation;
- initial, interior-original, middle, and final winning placements;
- a common suffix that consumes the edit;
- removal of an exhausted equality and normalization of newly adjacent edits;
- repeated-token classification caching across multiple triples and isolation between calls; and
- UTF-16 offsets for a multi-code-unit ZWJ grapheme.

A deterministic differential test preserves the former full-region scorer as an oracle and compares exact output for 640
isolated insertion and deletion triples. Its token pool includes repeated ASCII, whitespace, punctuation and symbols,
LF, CRLF, combining graphemes, ZWJ emoji, flags, and Thai graphemes. The full repository test suite and package
verification also exercise normalization, reconstruction, ownership, locale validation, and browser-safe builds.

## Measurement method

Baseline and candidate measurements used Node.js 24.19.0 with Vitest 4.1.10 on Linux x86-64 with a four-core Intel N95.
Fixture construction and correctness preflight were outside the timed region. The command was:

```bash
npx vitest bench --run test/benchmark/public-api.bench.ts --testNamePattern cleanupSemantic
```

The baseline was measured in one fresh process. The candidate was measured in three fresh processes. The 2,000-edit case
had a noisy within-process distribution, but the three candidate process means were 28.19, 28.17, and 28.12 ms. The
composed-prose means were 30.19, 30.08, and 30.12 ms. No browser runtime was available.

## Timing results

Lower is better. Candidate values are the mean of the three fresh-process means.

| Workload                               | Baseline | Candidate | Change |
| -------------------------------------- | -------: | --------: | -----: |
| 2,000 generated one-alternative edits  | 59.07 ms |  28.16 ms | -52.3% |
| Diff and clean 600 generated sentences | 38.00 ms |  30.13 ms | -20.7% |

The end-to-end result reproduces the exploratory proposal's expected magnitude for the isolated cleanup workload and
shows a smaller but material improvement when grapheme diffing is included. The benchmark suite now separates no-shift,
one-alternative, and many-alternative semantic triples so future changes can detect regressions in each path.

Allocation bytes were not recorded because the benchmark environment did not expose a stable allocation profiler.

## Result

The candidate-only scorer is retained. It removes work proportional to unreachable region cuts, avoids repeated token
classification, and skips result copies on an unchanged winning placement without adding a heuristic or changing which
exact normalized diff is selected.

Revisit the word-boundary `Set` only if ordered segment-iterator and candidate-offset traversal can demonstrate another
repeatable end-to-end benefit without complicating overlapping cut sequences or changing locale-dependent behavior.

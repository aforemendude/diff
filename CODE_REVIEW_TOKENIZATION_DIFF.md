# Code Review: Tokenization and Diff Adapters

## Scope and review basis

- Scope: `src/tokenize/graphemes.ts`, `src/tokenize/lines.ts`, `src/diff/grapheme.ts`, and `src/diff/line.ts`.
- Repository state: clean worktree at commit `1f58281` when the review began.
- Review basis: exact line-ending semantics, terminal delimiter handling, Unicode grapheme preservation, locale
  propagation, reconstruction of both token streams, option defaults, and per-call allocation costs.

## Findings

### TDIFF-1: Each grapheme diff constructs two equivalent segmenters

- Severity: Low
- References: `src/diff/grapheme.ts:6-7`; `src/tokenize/graphemes.ts:4-6`
- Problem: `diffGraphemes` calls `tokenizeGraphemes` once for each input, and each call constructs a new
  `Intl.Segmenter` with the same locale and granularity. A single segmenter can safely segment both inputs, so one ICU
  object construction per diff is redundant.
- Impact: Segmenter construction is a substantial portion of the cost for frequent small diffs. On Node.js v24.18.0,
  five 50,000-call benchmark samples took 1,448-1,494 ms with the current implementation and 992-1,006 ms with the same
  tokenization and diff algorithm sharing one segmenter per call (a 1.44-1.48x time ratio). This can reduce throughput
  in interactive or batch workloads dominated by short strings.
- Recommendation: Construct one `Intl.Segmenter` in `diffGraphemes` and use it for both inputs, or let
  `tokenizeGraphemes` accept an existing segmenter while retaining its current convenience path. Benchmark on supported
  Node.js and browser targets before considering a broader cross-call cache.

## Unresolved questions

None.

## Checks performed

- Checked 30,000 deterministic mixed-Unicode input pairs containing CR, LF, combining sequences, emoji, ZWJ families,
  and regional-indicator flags. Grapheme tokenization round-tripped every input, grapheme diffs reconstructed both
  strings, and line diffs reconstructed both token streams for CR, LF, and CRLF delimiters.
- Verified documented terminal-delimiter canonicalization for all three supported line endings in the same property
  check.
- Ran five comparative short-string benchmarks on Node.js v24.18.0 using the current source and an in-memory variant
  that differed only by sharing one segmenter within each diff call.

## Areas not covered

- Generated `dist/` output and third-party dependency source were excluded from review.
- Individual test cases, fixtures, assertions, and coverage adequacy were excluded by the requested review workflow.
- Browser-engine performance was not benchmarked; the duplicate construction is deterministic, but its cost varies by
  runtime.

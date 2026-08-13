# TDIFF-1: Each grapheme diff constructs two equivalent segmenters

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

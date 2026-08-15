# Optimization: numeric encoding for large line diffs

## Summary

For sufficiently large, differing line streams, assign each distinct line a numeric ID, run Myers on the ID arrays, and
translate the result back to strings. The mapping preserves every equality relation, so the result remains an exact
shortest line diff while comparisons in the core use compact numbers instead of strings.

Encoding has meaningful setup and memory costs and regresses small inputs, so it must be thresholded. The current equal,
empty-side, and terminal-delimiter source shortcuts remain opt-in through `optimizeTrivialCases`; an encoding gate must
preserve that option's behavior.

## Evidence

The prototype measurements below were collected on Node.js 24.18.0 and are directional rather than portable.

By default, [`diffLines`](../../../src/diff/line.ts) tokenizes both strings and passes the string arrays directly to
`diffTokens`. With `optimizeTrivialCases: true`, it instead tokenizes only the necessary source for equal, one-sided,
and single-terminal-delimiter cases. A local numeric-encoding prototype measured:

| Workload                   | Direct strings | Numeric IDs  |
| -------------------------- | -------------- | ------------ |
| 66,000 sparse-edited lines | 45.5 ms        | 34.6-36.5 ms |
| 20,000 sparse-edited lines | 15.3 ms        | 11.3 ms      |

Small inputs regressed about 1.5x, and 20-100-line sparse cases regressed roughly 2.2x. These figures predate the
current opt-in source shortcuts and later core constant-factor changes. The shortcuts do not apply to the sparse
workloads in the table, but the figures are still exploratory evidence rather than measurements of the current baseline
or portable thresholds.

## Proposed pipeline

1. When `optimizeTrivialCases` is enabled, retain the current exact-source, one-sided, and terminal-delimiter shortcuts
   before tokenizing both inputs.
2. Tokenize every remaining input with the current exact delimiter rules.
3. If the total token count is below a calibrated threshold, call `diffTokens` on strings as today.
4. For a large candidate, avoid encoding canonically equal token arrays. Whether a preliminary equality scan repays its
   cost on large differing inputs must be part of threshold benchmarking.
5. Otherwise, use one shared `Map<string, number>` and an ID-to-string table to encode both arrays.
6. Run `diffTokens<number>`.
7. Translate each output token ID to its original string, preserving operation order and tuple normalization.

Because identical strings receive identical IDs and different strings receive different IDs, the complete comparison
matrix is unchanged. Myers therefore sees the same edit graph and tie-breaking decisions. Translating the IDs should
reproduce the exact direct-string diff, not merely another shortest alignment.

## Representation choices

Use ordinary JavaScript numbers in arrays initially. Do not encode IDs into UTF-16 characters or a 16-bit typed array:
the library explicitly supports more than 65,535 unique lines, as the `diffLines` integration suite in
[`diff-lines.test.ts`](../../../test/integration/diff-lines.test.ts) verifies.

Typed numeric arrays may reduce memory but would require widening `diffTokens`' accepted sequence type and carefully
benchmarking slice/output behavior. That is a separate step.

The translation table should store the exact string object/value first encountered for an ID. Strings are immutable and
value equality is sufficient, so reconstruction remains exact.

## Threshold selection

Token count alone is the simplest stable gate. Benchmark thresholds across supported engines and select a conservative
value where the slowest supported environment benefits. Avoid a content-dependent sampling policy until needed; hashing
or inspecting line lengths can consume the saving it is trying to predict.

When `optimizeTrivialCases` is enabled, apply its current source fast paths before the threshold:

- exact equal source strings;
- one canonical terminal-delimiter difference;
- one empty side.

## Costs and risks

- Encoding allocates a map, two ID arrays, and a reverse table in addition to the line token arrays.
- Translating output copies tokens once more. Large equal runs can make this cost visible.
- JavaScript engines often intern or efficiently compare strings; the benefit varies with engine and line length.
- Repetitive files have few IDs but many map lookups. Unique files create a large map. Benchmark both.
- A threshold is an internal performance choice, not a documented semantic limit.
- If the core later gains its own token indexing, avoid encoding twice.

## Validation

Run the exhaustive line-diff shortest-cost oracle through both sides of the threshold. Add cases with empty-string line
tokens, CR/LF/CRLF content, more than 65,535 unique lines, duplicate lines, very long lines, and ambiguous repeated-line
alignments. Require reconstruction and minimal cost, and differentially compare exact output with the direct-string path
because the encoding preserves every core comparison.

Benchmark 500, 1,000, 5,000, 20,000, and 66,000 lines for:

- sparse unique-line edits;
- disjoint unique lines;
- short repeated lines;
- long repeated lines;
- equal large inputs with `optimizeTrivialCases` both disabled and enabled;
- source strings differing only by the optional final delimiter, with the opt-in shortcut both disabled and enabled;
- memory peaks and garbage collection.

## Rollout

Prototype this behind one private token-count threshold and benchmark supported Node releases plus representative
browser bundlers/runtimes. Keep the direct string path permanently for small inputs and as a simple fallback.

# Code Review: Cleanup Algorithms

## Scope and review basis

- Scope: `src/cleanup/common.ts`, `src/cleanup/efficiency.ts`, and `src/cleanup/semantic.ts`, including their contracts
  with `src/types.ts` and the public documentation in `README.md`.
- Repository state: clean worktree at commit `1f58281` when the review began.
- Review basis: preservation of before/after token streams, non-mutation and output ownership, edit-block normalization,
  equality elimination, semantic boundary scoring, overlap extraction, edit-cost handling, termination, and scaling with
  diff entry count.

## Findings

### CLEANUP-1: Overlap extraction has quadratic array-shifting cost

- Severity: Medium
- Reference: `src/cleanup/semantic.ts:235-265` (middle-array insertions at lines 252 and 258)
- Problem: `extractOverlaps` scans forward through `diffs` but inserts every extracted equality with `Array.splice` at
  the current pointer. Each qualifying insertion shifts the entire unvisited suffix. With many qualifying deletion /
  insertion pairs, the pass therefore performs quadratic element movement even though each overlap calculation itself is
  linear in the pair's token count.
- Impact: Large or adversarial valid diff arrays can block the Node.js event loop or a browser UI during cleanup. On
  Node.js v24.18.0, a normalized input repeating `DELETE ['a', 'b']`, `INSERT ['b', 'c']`, and a three-token equality
  took about 0.96 seconds for 96,000 input entries and 3.85 seconds for 192,000 entries. Doubling the input produced the
  expected roughly fourfold increase from repeated suffix shifts.
- Recommendation: Build the transformed diff into a separate output array in one forward pass, or collect insertions and
  apply them from the end. Preserve the current forward/reverse overlap choice and run the result through the existing
  coalescing path.

### CLEANUP-2: Semantic cleanup constructs one word segmenter per isolated edit

- Severity: Low
- References: `src/cleanup/semantic.ts:97-101`; `src/cleanup/semantic.ts:136-156`
- Problem: `cleanupSemanticLossless` calls `boundaryScores` for every isolated edit, and `boundaryScores` constructs a
  fresh `Intl.Segmenter` each time even though every call in one cleanup uses the same locale and word granularity.
- Impact: ICU object construction adds avoidable latency proportional to the number of edit regions. Instrumentation
  confirmed 1,000 constructions for 1,000 isolated edits. On Node.js v24.18.0, five runs over 10,000 isolated edits took
  184.0-208.8 ms currently versus 100.1-119.4 ms when the constructor was replaced in memory by one shared segmenter (a
  1.67-2.03x time ratio).
- Recommendation: Construct one word segmenter in `cleanupSemantic`, pass it through `cleanupSemanticLossless` to
  `boundaryScores`, and reuse it for all regions in that call.

## Unresolved questions

- Is `CleanupEfficiencyOptions.editCost` intended to accept every JavaScript `number`, or only finite non-negative
  values? `src/types.ts:23-25` and `README.md:177-178` do not define the domain, while `src/cleanup/efficiency.ts:105`
  compares the value directly. For example, `NaN` silently prevents equality elimination. This was not classified as a
  defect because the intended invalid-value policy is unclear.
- Is `cleanupSemantic` intended to be idempotent? It currently is not in all cases: overlap extraction can create an
  isolated edit/equality layout that a second call shifts or eliminates. The public contract does not promise
  idempotence, and retaining the Diff Match Patch-style phase order may be intentional, so this was not classified as a
  defect.

## Checks performed

- Checked 50,000 deterministic random Myers diffs through both cleanup functions. Every result reconstructed both
  inputs, contained no empty entries or adjacent identical operations, and left the input unchanged.
- Checked another 100,000 arbitrary valid diff arrays (not limited to Myers output) through both cleanup functions for
  before/after stream preservation, output normalization, and input immutability.
- Manually traced edit-block factoring, lossless shifts, forward/reverse overlap extraction, equality-stack rewinds, and
  token-array ownership.
- Instrumented word-segmenter construction count and ran focused scaling benchmarks for both findings on Node.js
  v24.18.0.

## Areas not covered

- Generated `dist/` output and third-party dependency source were excluded from review.
- Individual test cases, fixtures, assertions, and coverage adequacy were excluded by the requested review workflow.
- Semantic-quality choices are heuristic and locale-dependent; this review verified preservation and structural
  invariants but did not attempt a subjective corpus-wide ranking of edit readability.
- Browser-engine performance and non-default locale corpora were not benchmarked.

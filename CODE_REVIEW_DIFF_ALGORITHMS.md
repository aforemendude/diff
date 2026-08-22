# Code review: diff algorithms

## Scope and review basis

Reviewed production code in `src/algorithm/limits.ts`, `src/algorithm/myers-workspace.ts`, `src/algorithm/myers.ts`, and
`src/algorithm/sparse-match.ts`. Tests were inspected only to understand established contracts and were not reviewed as
test cases. Public callers in `src/line.ts` and `src/grapheme.ts`, the public algorithm and complexity contract in
`README.md`, and relevant finalized optimization notes were traced to verify input bounds, strict-equality behavior,
normalization, ownership, exactness, browser compatibility, and intended engine-selection semantics.

The worktree was clean at the required pre-review check. Other code-review reports created later in the shared session
were not part of this segment.

## Findings

### 1. The sparse occurrence index has avoidable direction-dependent linear cost

- **Severity:** Medium
- **Reference:** `createMatchIndex` and `tryAppendSparseMatchDiff` in `src/algorithm/sparse-match.ts`
- **Problem:** `tryAppendSparseMatchDiff` always passes the `after` range to `createMatchIndex`, and that helper
  allocates three `Uint32Array(afterLength)` tables plus one `Map` entry per distinct `after` token. It never considers
  indexing the shorter side. In addition, `bucketCounts` and `bucketHeads` are indexed only by compact bucket IDs but
  are still allocated at `afterLength`, so two of the three per-position tables waste
  `8 * (afterLength - distinctTokenCount)` bytes. These costs are paid by adaptive mode even when its later gate rejects
  sparse reconstruction.
- **Impact:** Time and peak memory depend heavily on which input happens to be `after`, even though the same
  matching-pair relation can be traversed with the shorter sequence indexed. In a focused Node.js 24.19.0 check using
  disjoint numeric ranges of 128 and 500,000 tokens, forced sparse took 105.4 ms and 96,968 KiB maximum RSS when the
  long range was `after`, versus 30.2 ms and 61,816 KiB when the inputs were reversed; both results contained the same
  two whole-range edit entries. Constructor instrumentation confirmed 6,000,512 requested `Uint32Array` bytes in the
  first orientation and 2,048 in the reverse orientation. Adaptive mode showed the same memory directionality and took
  92.5 ms versus 41.2 ms. Repetitive inputs compound the issue: with one million `after` tokens but two distinct values,
  the two bucket tables reserve about 8 MB for two useful slots. Large unbalanced or repetitive diffs can therefore
  incur avoidable latency, memory pressure, or allocation failure in both forced-sparse and default adaptive calls.
- **Recommendation:** Build the occurrence index from the shorter trimmed range and translate reconstructed matches and
  operations when that range is `before`. Size bucket metadata by the number of distinct indexed tokens, for example via
  a preliminary ID pass or geometrically grown compact tables; retain only the occurrence-link table at one entry per
  indexed position. The implementation now follows this recommendation and translates the selected LCS back to the
  original `before` and `after` coordinates.

No verified findings were identified in `limits.ts`, `myers-workspace.ts`, or the Myers core in `myers.ts`. This does
not imply that those components are defect-free.

## Resolved questions

- Sparse mode does not promise stable tuple placement when inputs are swapped, between algorithm choices, or across
  implementation versions. Every public algorithm choice promises a normalized shortest insertion/deletion script, but
  ambiguous inputs may select any such script. This permits the sparse occurrence index to use the shorter orientation.

## Resolution validation

The implementation adds direct translated-offset and allocation-shape regressions while retaining the exhaustive
shortest-script checks across all algorithms. Focused performance and memory results are recorded in
[Sparse shorter-side occurrence index](docs/optimization/final-results/sparse-shorter-side-index.md).

## Original review checks and areas not covered

- Focused algorithm tests:
  `npx vitest run src/algorithm/myers.test.ts src/algorithm/myers-workspace.test.ts src/algorithm/sparse-match.test.ts`
  (36 tests passed).
- Static check: `npx tsc --project tsconfig.test.json --noEmit` (passed).
- Independent randomized differential check: 100,000 input pairs up to 29 tokens, across `adaptive`, `myers`, and
  `sparse`; all results reconstructed both inputs, were normalized, and matched a dynamic-programming shortest-edit-cost
  oracle.
- Growth-scale randomized differential check: 20,000 input pairs up to 200 tokens, across all three engines; all edit
  costs matched the independent dynamic-programming oracle.
- Focused directionality measurement: separate Node.js processes diffed disjoint 128-token and 500,000-token ranges in
  both orientations under forced sparse and adaptive modes; elapsed time, maximum RSS, and typed-array constructor
  instrumentation are reported in finding 1.
- Near-limit allocations approaching the documented 4,294,967,294 combined-token bound were not attempted because they
  are infeasible in the available environment. The arithmetic and public guard were reviewed statically.
- No full build, full repository suite, package verification, or benchmark suite was run for this report-only segment.
- Generated `dist/` code and third-party source were out of scope.

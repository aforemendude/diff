# Code Review: Documentation and Benchmarks

## Scope and review basis

Reviewed the repository's documentation and benchmark infrastructure segment: benchmark/development/setup and licensing
claims in `README.md`; `CHANGELOG.md`; `THIRD_PARTY_NOTICES.md`; `LICENSE`; `LICENSES/Apache-2.0.txt`; `docs/**`;
`test/benchmark/**` as benchmark infrastructure and workload setup; `scripts/run-memory-benchmarks.mjs`; the
benchmark-related scripts in `package.json`; and `tsconfig.benchmark.json`. Generated `dist/**`, dependency source, the
README public API contract covered by another segment, and individual benchmark test cases/assertions were excluded.

The review compared documentation claims with the current manifests, source entry points, benchmark schedules, fixture
generators, preflight helpers, and runner behavior. Findings below were independently rechecked against the current
working tree.

## Findings

### 1. Weighted schedule allocation does not validate its 100% contract

- Severity: Low
- Location: `test/benchmark/helpers/distribution.ts:31-45`
- Problem: `allocateWeightedValues` calculates counts as percentages of `total` but never validates that weights are
  finite, non-negative, and sum to exactly 100. Its existing error only catches some under-allocation shapes. For
  example, a 10-item allocation with weights 50 and 40 silently returns 10 items by awarding the missing item as a
  rounding remainder, while weights 60 and 60 return 12 items even though `total` is 10. The current sole call uses
  30/40/20/10 and is valid, so current representative results are not affected.
- Impact: A future benchmark distribution typo can silently change the intended weights or schedule size. In the
  over-allocation case it can also change the amount of work per timed sample, undermining comparisons while the
  helper's name and `total` argument imply a fixed-size result.
- Recommendation: Validate `total` and every weight, require the weights to sum to 100 before allocation, and assert
  that the final allocation length equals `total`. Keep the existing largest-remainder allocation only after those
  invariants are established.

### 2. Final optimization note links to two deleted investigations

- Severity: Low
- Location: `docs/optimization/final-results/line-token-encoding.md:215-217`
- Problem: The interpretation section links to `adaptive-disjoint-bailout.md` and `sparse-match-lcs.md` as the documents
  that describe the current adaptive selector, but neither target exists in the repository. History confirms both files
  were deliberately removed as obsolete while this reference remained.
- Impact: Readers cannot follow the stated basis for the document's final conclusion, and the final-results directory
  presents stale navigation to superseded design material.
- Recommendation: Replace the deleted links with a maintained description of the current selector, or remove the links
  and identify the current source files/functions that provide the supporting implementation context. If the historical
  investigations remain important, restore them with an explicit superseded status rather than leaving dead links.

### 3. The Unreleased changelog omits the new public algorithm selector

- Severity: Low
- Location: `CHANGELOG.md:3-12`
- Problem: The Unreleased section records frontier storage, semantic cleanup, and the input limit, but not the public
  `DiffAlgorithm` export or the new `algorithm` option on `diffLines` and `diffGraphemes`. Those APIs were not present
  in the source represented by the 1.0.0 changelog entry; they were added later with adaptive, Myers, and sparse modes
  and a new adaptive default.
- Impact: Consumers reading the release history cannot discover that the next release adds a public type and a
  behavior-selecting option, or that adaptive engine selection is now the default. This is more consequential to upgrade
  planning than the internal changes already listed in the same section.
- Recommendation: Add an Unreleased `Added` entry for `DiffAlgorithm` and both `algorithm` options, including the
  accepted values, adaptive default, and exactness guarantee.

### 4. Rejected Myers optimization note refers to a helper that no longer exists

- Severity: Low
- Location: `docs/optimization/final-results/myers-diagonal-loop-loads.md:7-11`
- Problem: The present-tense decision says the current `bisect` implementation retains the original `vectorValue`-based
  recurrence, but `src/algorithm/myers.ts` no longer contains `vectorValue`. A later frontier-workspace refactor
  replaced the `Float64Array` representation and renamed the analogous decoder to `frontierValue`. The later historical
  prototype descriptions remain accurate for the implementation that was benchmarked.
- Impact: Maintainers following this final-result note into the current implementation cannot find the named helper and
  may incorrectly infer that the rejected implementation was restored unchanged despite the later storage refactor.
- Recommendation: Update only the present-tense decision to acknowledge the current `frontierValue`/`Uint32Array`
  storage while explaining that the rejected load-reduction recurrence structure remains rejected. Preserve the old
  helper name in the historical prototype and measurement descriptions.

## Unresolved questions

None.

## Checks and areas not covered

- Confirmed the worktree was clean before this review session; concurrent untracked files are review reports created by
  other segments in the same session.
- Inspected the current representative and adversarial workload construction, shared scheduling helpers, preflight
  infrastructure, benchmark entry points, memory runner, benchmark TypeScript configuration, and npm benchmark scripts.
- Reproduced the allocation behavior with focused Node.js calculations: total 10 with weights 50/40 produced 10 values,
  total 10 with weights 60/60 produced 12 values, and the current total 85 with weights 30/40/20/10 produced 85 values.
- Checked all repository-relative Markdown links in the scoped documents; only the two links reported above have missing
  targets. Repository history shows both targets were deleted in commit `7b5aff0` as obsolete documentation.
- `npm run benchmark:typecheck` passed on Node.js 24.19.0.
- The focused representative line benchmark passed with all fixture preflights and completed its documented 1,000-call,
  three-sample schedule.
- `node --expose-gc scripts/run-memory-benchmarks.mjs --worker test/benchmark/does-not-exist.bench.ts` made Vitest
  report its no-files failure and returned process exit status 1. The wrapper prints high-water figures before exiting,
  but the parent runner correctly observes and rejects the nonzero worker status.
- Compared the current public diff option/type declarations with the source captured by the 1.0.0 changelog baseline;
  `DiffAlgorithm` and both `algorithm` options are post-1.0 additions absent from the Unreleased notes.
- Compared both final optimization notes with their current linked source. The Myers recurrence still follows the
  rejected note's structural decision, but its helper was renamed to `frontierValue` during the later workspace
  refactor.
- Verified that the pinned `diff-match-patch-es` commit declares version 2.0.1 and Apache-2.0, and that the included
  `LICENSES/Apache-2.0.txt` is byte-for-byte identical to that upstream commit's license. The package manifest,
  lockfile, README licensing section, source attribution headers, and third-party notice consistently describe the
  combined MIT and Apache-2.0 distribution; no licensing-alignment finding was identified.
- The full benchmark and adversarial benchmark suites were not run. The representative line entry point and benchmark
  typecheck were used as focused infrastructure checks; the remaining schedules are intentionally time- and
  memory-heavy.
- Individual benchmark test cases, assertions, and fixture data were not reviewed, as required by the selected skill.

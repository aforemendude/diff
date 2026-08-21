# Code review: cleanup subsystem

## Scope and basis

Reviewed `src/cleanup.ts` and the production files under `src/cleanup/`. Production tests were excluded as review
targets; cleanup tests, integration properties, benchmarks, README contracts, package metadata, and third-party notices
were consulted only as supporting evidence. Generated output and third-party source were out of scope.

The review is organized around three milestones: the public validation and ownership contract; normalization and
worklist mechanics; and semantic/efficiency cleanup behavior. It checks exact projection preservation, normalized
output, fresh result ownership, input non-mutation, boundary handling, algorithmic resource use, comments/names, and
Diff Match Patch attribution alignment.

The worktree was clean before this report was created.

## Findings

One verified Low-severity finding was identified. No additional correctness, reliability, security, performance,
ownership, compatibility, or attribution findings were verified in the reviewed public-entry-point,
normalization/worklist, and semantic/efficiency milestones. This does not imply that the subsystem is defect-free.

### Low: Test-only cleanup utilities are emitted as production modules

- **Location:** `src/cleanup/common.ts:48-55`, `src/cleanup/common.ts:70-91`, and `src/cleanup/merge.ts:23-28`
- **Problem:** `commonPrefixLength`, `equalTokens`, and `coalesce` have no production callers, but they are exported
  from `common.ts`, which is loaded through the public cleanup graph. Separately, `cleanupMerge` is called only by tests
  and benchmark diagnostics; its module is not loaded through the public graph, but the normal build still emits and
  publishes it because it lives under `src/`.
- **Impact:** CommonJS and other non-tree-shaken cleanup consumers parse and initialize three unused function exports.
  The published package also contains avoidable JavaScript, declarations, and source maps for all four utilities, and
  maintainers must preserve production-looking APIs that exist only to exercise tests or diagnostics. `cleanupMerge`
  adds artifact and maintenance cost but no public-entry-point module-load cost.
- **Recommendation:** Move the three reference/helper functions into test support. Move the benchmark-only
  `cleanupMerge` wrapper into benchmark support (or have the diagnostic use an existing production primitive), then
  remove the unused production exports and module from the emitted source set.

## Unresolved questions

None.

## Checks and areas not covered

- Inspected the cleanup public exports and option handling against `README.md`, `package.json`, `src/types.ts`, and the
  repository instructions.
- Confirmed that the README explicitly treats malformed runtime diff/option shapes as unsupported, while requiring a
  finite, non-negative `editCost` and allowing `Intl.Segmenter` to reject invalid locales.
- Ran focused Vitest checks for the cleanup entry point, common helpers, edit-block merge, merge/worklist behavior,
  semantic cleanup, efficiency cleanup, generated cleanup properties, and ownership: 9 files and 83 tests passed.
- Ran an independent deterministic stress check over 50,000 arbitrary valid diffs. Both public cleanup methods preserved
  the before/after projections, returned normalized results, accepted frozen inputs, and returned no input aliases.
- Compared both current public cleanup results exactly with the implementation immediately before the worklist refactor
  over another 50,000 deterministic valid diffs, fractional edit costs, and English/Thai word segmentation; all results
  matched.
- Ran `npx tsc --project tsconfig.test.json --noEmit`; it passed.
- Traced every production cleanup file for private call sites, browser-only/runtime dependencies, ASCII compliance, and
  Diff Match Patch license headers; compared the headers with `THIRD_PARTY_NOTICES.md` and the bundled Apache-2.0 text.
- Individual test cases, fixture assertions, generated `dist/` output, upstream third-party source, and benchmark timing
  measurements were not reviewed.

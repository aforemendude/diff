# Code Review: Public API and Tokenization

## Reviewed scope and basis

This segment reviews `src/line.ts`, `src/grapheme.ts`, the production files under `src/tokenize/`, and `src/types.ts`.
It also checks their public behavior and API alignment with `package.json` and `README.md`. Generated output,
third-party source, and individual test cases, fixtures, logic, and assertions are outside scope. Tests and algorithm
call sites may be inspected only as contract evidence.

The review is based on static inspection of the selected production files, their direct algorithm call sites, package
exports, TypeScript build configuration, public documentation, and focused checks recorded below.

## Findings

No verified findings were identified in this segment. This statement records the review result; it does not imply that
the reviewed code is defect-free.

## Unresolved questions

- None.

## Checks and areas not covered

- Confirmed that the worktree was clean before this report was created with `git status --short`.
- Inspected the selected source files, `package.json`, the relevant public contract in `README.md`, and the TypeScript
  module/build configuration.
- Traced public result construction through `diffTokens`: nonempty ranges are copied with `slice`, adjacent operations
  append only into result-owned token arrays, and every public entry path creates fresh top-level arrays, tuples, and
  token arrays.
- `node_modules/.bin/tsc --project tsconfig.test.json` completed successfully.
- A focused Vitest run covering the line and grapheme entry points, both tokenizers, public API types, ownership, input
  limits, and line/grapheme integration completed successfully: 9 files and 135 tests passed.
- Confirmed statically that `package.json` exposes only `./cleanup`, `./grapheme`, and `./line`, declares no runtime
  dependencies, and maps both ESM and CommonJS consumers to feature-specific entry points.
- A focused search found no Node.js-only imports or globals in production TypeScript under `src/`. The selected entry
  points import only browser-compatible project modules, and `Intl.Segmenter` is constructed only by the grapheme entry
  point when it is called.
- No package build, packed-consumer verification, benchmark, or browser-bundler execution has been run.

# Changelog

## 1.0.0 - 2026-08-15

### Added

- Add the initial zero-runtime-dependency TypeScript package with feature-specific `./line`, `./grapheme`, and
  `./cleanup` entry points, native ESM and CommonJS builds, conditional declarations, source maps, and side-effect
  metadata for tree-shaking. The package intentionally has no aggregate root entry point.
- Add compact operation/token-array tuple APIs for exact line and Unicode-grapheme diffs and cleanup, with normalized,
  independently owned results that never mutate caller input.
- Add line-level diffing with a configurable CR, LF, or CRLF separator that defaults to LF, excludes line endings from
  tokens, and removes exactly one trailing empty segment.
- Add Unicode grapheme-safe diffing and word-aware semantic cleanup backed by `Intl.Segmenter`.
- Add immutable, grapheme-safe efficiency cleanup with configurable edit cost.
- Add opt-in `optimizeTrivialCases` fast paths for identical, one-sided, and insignificant-terminal-delimiter inputs.
- Document the TypeScript-first argument contract while validating that efficiency-cleanup edit costs are finite and
  non-negative.
- Add deterministic representative, scale, edge, and adversarial benchmarks with correctness preflight checks and a
  documented workload and interpretation policy.
- Add Apache-2.0 licensing and attribution for code derived from `diff-match-patch-es` and Google Diff Match Patch.

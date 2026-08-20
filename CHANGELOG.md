# Changelog

## Unreleased

### Changed

- Replace fixed, input-sized Myers frontiers with compact, demand-sized, call-local reusable storage, including reuse of
  the KMP prefix table used by subsequence matching.
- Score only reachable semantic-cleanup boundaries, cache repeated token classifications per call, and defer token-array
  materialization until an isolated edit actually moves.
- Limit each public line or grapheme diff input pair to 4,294,967,294 combined UTF-16 code units and throw a
  `RangeError` before shortcuts, tokenization, or grapheme-segmenter construction when the pair exceeds that limit.

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

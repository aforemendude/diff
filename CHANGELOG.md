# Changelog

## 1.1.0 - 2026-08-22

### Added

- Add `algorithm: 'adaptive' | 'myers' | 'sparse'` to both diff APIs and export the shared `DiffAlgorithm` type from
  both diff subpaths. The new default, adaptive mode, conservatively selects between exact Myers bisection and exact
  Hunt-Szymanski sparse-match LCS, while explicit modes force either engine after the shared exact shortcuts.
- Add deterministic representative and adversarial memory benchmark commands that isolate each public workflow in a
  fresh Node.js process and report operating-system-backed peak RSS.

### Changed

- Replace fixed, input-sized Myers frontiers with compact, demand-sized, call-local reusable storage, including reuse of
  the KMP prefix table used by subsequence matching.
- Build sparse occurrence indexes over the shorter remaining token range and size bucket metadata by distinct indexed
  tokens, removing direction-dependent workspace growth without guaranteeing a particular ambiguous tuple placement.
- Rework semantic and efficiency cleanup around a linked worklist, localized normalization, and shared edit-block
  merging. Semantic cleanup now scores only reachable boundaries, caches repeated token classifications per call, and
  defers token-array materialization until an isolated edit actually moves.
- Limit each public line or grapheme diff input pair to 4,294,967,294 combined UTF-16 code units and throw a
  `RangeError` before shortcuts, tokenization, or grapheme-segmenter construction when the pair exceeds that limit.
- Move line and grapheme diff orchestration into their package entry modules so public validation, defaults,
  trivial-case shortcuts, and segmenter construction remain at the API boundary.
- Replace the earlier benchmark harness with separate 1,000-call representative schedules and opt-in adversarial public
  workflows. Timed calls now use fully specified default options, including a pinned `en` locale for reproducibility,
  and fixture generation plus correctness preflight remain outside timed regions.
- Keep test-only cleanup normalization helpers out of published builds.

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

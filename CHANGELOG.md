# Changelog

## 0.1.0 - 2026-08-13

### Added

- Add the initial TypeScript package scaffold.
- Add compact operation/token-array tuple APIs for line and grapheme diffs and cleanup.
- Add line-level diffing with a configurable CR, LF, or CRLF separator that defaults to LF, excludes line endings from
  tokens, and removes exactly one trailing empty segment.
- Add Unicode grapheme-safe diffing and word-aware semantic cleanup backed by `Intl.Segmenter`.
- Add immutable, grapheme-safe efficiency cleanup with configurable edit cost.
- Document the TypeScript-first argument contract while validating that efficiency-cleanup edit costs are finite and
  non-negative.
- Add Apache-2.0 licensing and attribution for code derived from `diff-match-patch-es` and Google Diff Match Patch.

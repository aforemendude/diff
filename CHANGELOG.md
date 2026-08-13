# Changelog

## 0.1.0 - 2026-08-13

### Added

- Add the initial TypeScript package scaffold.
- Add compact tuple-based line, grapheme, and semantic text diff APIs.
- Add line-level diffing with a configurable CR, LF, or CRLF ending that defaults to LF and preserves final-ending
  differences.
- Add Unicode grapheme-safe diffing and word-aware semantic cleanup backed by `Intl.Segmenter`.
- Add immutable, grapheme-safe efficiency cleanup with configurable edit cost.
- Add Apache-2.0 licensing and attribution for code derived from `diff-match-patch-es` and Google Diff Match Patch.

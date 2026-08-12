# @aforemendude/diff

A project-specific, TypeScript/ESM partial fork of
[`diff-match-patch-es`](https://github.com/antfu/diff-match-patch-es). The intended behavior is documented in
[`docs/DIFF_ENGINE_FORK_REQUIREMENTS.md`](docs/DIFF_ENGINE_FORK_REQUIREMENTS.md).

## Baseline

The current source is a clean baseline from `diff-match-patch-es` 2.0.1, tag `v2.0.1`, commit
`4f35fb7fd57df68d69068cdee0780bb779f5497f`. The copied `src/diff.ts`, `src/options.ts`, and `src/types.ts` files are
unchanged from that release. The package entry point exposes the upstream diff and option APIs while intentionally
omitting the unused match and patch implementations.

The requirement-specific high-level API and safe whole-line sequence algorithm have not been implemented yet.

## Development

Use Node.js 22.12 or newer.

- `npm run format:check` checks formatting.
- `npm run typecheck` checks TypeScript source and tests.
- `npm run build` builds the ESM package and declarations.
- `npm test` compares the fork baseline with the pinned upstream development dependency.
- `npm run verify` runs the full validation suite.

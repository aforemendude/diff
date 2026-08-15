# Repository guidance

## Project overview

`@aforemendude/diff` is a zero-runtime-dependency TypeScript library for exact line and Unicode-grapheme diffs, with
optional semantic and efficiency cleanup. It targets Node.js 20+ and browsers that provide `Intl.Segmenter`.

The package deliberately exposes only three subpaths: `@aforemendude/diff/line`, `@aforemendude/diff/grapheme`, and
`@aforemendude/diff/cleanup`. Do not add a root entry point unless the public API is intentionally being redesigned.

## Repository map

- `src/algorithm/`: generic token-diff algorithms, including the Myers implementation.
- `src/tokenize/`: line and grapheme tokenization.
- `src/diff/`: public line- and grapheme-diff implementations.
- `src/cleanup/`: shared normalization plus semantic and efficiency cleanup.
- `src/{line,grapheme,cleanup}.ts`: package subpath entry points; keep their exports intentional and minimal.
- `src/**/*.test.ts`: focused unit tests next to implementation code.
- `test/integration/`: cross-module behavior, API, ownership, and generated-property tests.
- `test/benchmark/`: deterministic benchmark fixtures and performance/correctness preflight checks.
- `test/package-fixtures/`: ESM, CommonJS, and TypeScript consumer checks for the packed package.
- `docs/optimization/`: performance investigations organized into final results, work under consideration, and work
  pending review.
- `scripts/`: clean, package-generation, and packed-package verification scripts.

## Core contracts

Preserve these invariants unless the task explicitly changes the documented behavior:

- A diff contains only `DELETE (-1)`, `EQUAL (0)`, and `INSERT (1)` tuples.
- Results are normalized: omit empty token arrays and merge adjacent entries with the same operation.
- Projecting away insertions reconstructs the canonical token stream for `before`; projecting away deletions
  reconstructs the canonical token stream for `after`.
- Public calls never mutate arguments. Every result owns a fresh top-level array, tuples, and token arrays, including
  empty results and repeated calls.
- `diffGraphemes` uses complete `Intl.Segmenter` grapheme clusters and does not normalize Unicode.
- `diffLines` treats the configured `\r`, `\n`, or `\r\n` sequence as the exact delimiter. Its terminal-delimiter and
  blank-line behavior is part of the public contract; consult the README and line tests before changing it.
- Diff computation remains exact. Optimizations must not introduce deadlines or heuristic edit limits.
- The runtime remains usable in browsers and must not import Node.js-only APIs.

## Code conventions

- Follow the strict TypeScript settings in `tsconfig.json`; do not suppress type errors when a precise type is
  practical.
- Use `readonly` inputs and public types where mutation is not part of the contract.
- Use `.js` extensions in production TypeScript relative imports so emitted NodeNext modules resolve correctly.
- Prefer small named helpers and existing normalization/ownership utilities over duplicating diff manipulation logic.
- Keep the public exports in the three entry-point files synchronized with `package.json`, README documentation, and
  `test/integration/public-api.test.ts`.
- Preserve attribution and license headers on code derived from Diff Match Patch. Update `THIRD_PARTY_NOTICES.md` if new
  third-party code is introduced.
- Keep tracked text files ASCII-only. In TypeScript and JavaScript, assign each non-ASCII code point's hexadecimal
  escape to a descriptively named variable and compose multi-code-point strings from those variables. In Markdown,
  prefer an ASCII equivalent such as `-`, `x`, or `us` instead of a Unicode symbol or hexadecimal character reference.
- Let Prettier define formatting (`120` columns, single quotes, wrapped prose); avoid unrelated formatting churn.
- Do not edit or commit generated `dist/` output. Change `package-lock.json` only when dependencies actually change.

## Testing and verification

Add or update tests with behavioral changes. Use co-located unit tests for implementation details and integration tests
for public contracts. Include adversarial boundary cases where relevant: empty input, repeated tokens, line-ending
variants, combining marks, ZWJ emoji, flags, locale behavior, frozen inputs, and repeated calls.

Useful commands:

```bash
npm test                    # Type-check test sources and run the full test suite
npx vitest run path/to.test.ts
npm run format:check
npm run build               # Build CommonJS and ESM outputs
npm run test:package        # Verify the packed package and consumer fixtures
npm run verify              # Formatting, builds, tests, and package verification
npm run benchmark           # Type-check and run deterministic benchmarks
```

Run the narrowest relevant test while iterating, then run `npm run verify` before handing off changes that affect code,
exports, packaging, or documented behavior. A narrow Vitest invocation does not replace the TypeScript checks in
`npm test`.

For performance work, keep correctness validation in the benchmark preflight, compare deterministic workloads, and
report the command and conditions used. Do not trade away exactness, normalization, ownership, or browser compatibility
for a benchmark improvement.

## Documentation expectations

The README is the public behavior specification. Update it when changing exports, options, edge-case semantics, runtime
requirements, mutation guarantees, or examples. Record optimization notes in the appropriate `docs/optimization/` status
subfolder: finalized investigations in `final-results/`, active proposals in `under-consideration/`, and speculative
work awaiting review in `pending-review/`.

When documentation references code, identify it by file and function name only. Do not include line numbers or line
ranges, including Markdown link fragments, because they drift as the implementation changes.

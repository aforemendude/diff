# Code Review: Project Setup, Packaging, and Documentation

## Scope and review basis

- Scope: `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.mts`, `scripts/clean.mjs`, `.gitignore`,
  `.prettierrc.json`, `.vscode/settings.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `LICENSES/Apache-2.0.txt`, and
  `THIRD_PARTY_NOTICES.md`.
- Test-infrastructure scope: runner configuration, imports/dependencies, compilation inclusion, and setup only;
  individual test cases, fixtures, assertions, and coverage adequacy were excluded.
- Repository state: clean worktree at commit `1f58281` when the review began.
- Review basis: declared runtime/toolchain compatibility, dependency and lockfile consistency, scripts, build/publish
  boundaries, package entry points and file contents, clean behavior, documentation/API agreement, licensing, and
  existing tool availability.

## Findings

### SETUP-1: The build does not enforce the declared Node.js 20 runtime floor

- Severity: Low
- References: `package.json:20-22`; `tsconfig.json:25`; `README.md:6-10`; `README.md:214-216`
- Problem: The package promises Node.js 20 support, but TypeScript compiles with `target: "esnext"` and no explicit
  standard-library set tied to that runtime. The compiler therefore accepts and preserves future syntax and allows
  standard-library APIs from the compiler's latest bundled definitions, even when those features are unavailable in
  Node.js 20.
- Impact: A future contribution can pass the repository's build and tests on the required Node.js 22.12+ development
  runtime yet fail to parse or run for supported Node.js 20 consumers. The current production source was manually
  inspected and no such incompatibility was identified, so this is a release-guardrail weakness rather than a current
  runtime failure.
- Recommendation: Compile against an explicit ECMAScript target/lib compatible with the oldest supported Node.js 20
  release and add a release check that executes the built public API on Node.js 20. If newer syntax must be emitted,
  document and enforce the precise minimum Node version that supports it.

### SETUP-2: Production builds compile test sources and helpers into `dist`

- Severity: Low
- References: `tsconfig.json:27-28`; `package.json:29-33`; `package.json:53-62`
- Problem: The only TypeScript build includes all of `src`, so `npm run build` emits JavaScript and declaration files
  for every `*.test.ts` file and `src/test-support`. The npm `files` negation successfully keeps the current test-named
  artifacts out of the package, but it does not prevent their compilation or their presence in the build directory.
- Impact: Every local, CI, and release build performs unnecessary compilation and leaves `dist` containing production
  modules mixed with test-runner imports and test helpers. Consumers are protected by the current package filter, but
  local validation tools or alternate distribution workflows that operate directly on `dist` see a noisier and less
  clearly bounded production artifact.
- Recommendation: Add a production `tsconfig.build.json` that includes only runtime source (or explicitly excludes tests
  and `src/test-support`) and use it from `npm run build`. Keep the broader config for no-emit test type checking and
  retain the existing package filter as defense in depth.

## Unresolved questions

- Is CommonJS-only distribution intentional for browser bundlers and ESM consumers? `package.json:23-27` exposes one
  CommonJS default target and `package.json:65` declares `type: "commonjs"`, while `README.md:17-21` promises bundler
  use. This is valid and worked for the inspected CommonJS entry point, but the desired dual-package/interoperability
  policy is not documented.

## Checks performed

- `./node_modules/.bin/tsc --noEmit` passed.
- `npm test` passed: 10 files and 74 tests.
- `npm ls --depth=0` reported the four declared development dependencies at their locked versions with no missing or
  extraneous direct dependencies.
- `npm audit --json` reported zero known vulnerabilities across the installed lockfile tree at review time.
- `npm pack --dry-run --ignore-scripts --json` produced an intended 25-file, 17,085-byte package inventory without
  creating or publishing a tarball; no compiled test files were included.
- Required the built package root with Node.js v24.18.0 and verified the seven documented runtime exports.
- Loaded the current source and reproduced the README quick-start, LF terminal-delimiter, blank-line, and CRLF examples.
- Compared package metadata, changelog, requirements, public API documentation, attribution, and included license files.

## Areas not covered

- Generated `dist/` contents and third-party dependency source were excluded from code review; `dist` was inventoried
  only to verify build and packaging configuration.
- Individual test cases, fixtures, assertions, and coverage adequacy were excluded by the requested review workflow.
- Only Node.js v24.18.0 was installed in the review environment, so runtime execution was not repeated on Node.js 20 or
  22 or in browser bundlers.
- `npm run build` and the full `npm run verify` were not run because the clean script destructively replaces ignored
  `dist`; equivalent non-mutating type checking and focused configured checks were used instead.
- The `prepack` workflow was not run because it executes `npm install` and the review workflow prohibits dependency
  installation or repair.

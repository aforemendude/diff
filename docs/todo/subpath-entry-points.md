# Optimization: load only the requested API

Status: implemented on 2026-08-15 as subpath-only dual ESM/CommonJS builds.

## Summary

The package's former CommonJS root entry eagerly loaded line diffing, grapheme diffing, and both cleanup engines even
when an application used only one feature. The package now exposes supported feature subpaths and a genuine
tree-shakable ESM output alongside CommonJS. This improves cold start and browser bundle size rather than the running
time of an individual diff.

## Evidence

The exploratory measurements below used Node.js 24.18.0 and fresh local child processes.

The former `src/index.ts` re-exported every public function. With the former CommonJS compilation and root export in
[`package.json`](../../package.json), requiring the package evaluated the complete dependency graph.

A local compiled-output inspection measured about 38.0 KB across the root dependency set versus 13.4 KB for the direct
line-diff dependency set. Across three groups of 50 fresh Node processes, median root import time was about 7.32–7.55
ms, while importing the direct line module was about 4.87–4.89 ms. Process startup makes these noisy, but the roughly
2.5 ms difference warrants a supported-path experiment for CLI and serverless consumers.

## Subpath-only design

The root API was removed so every consumer selects an intentional dependency boundary:

```json
{
  "exports": {
    "./line": {
      "import": { "types": "./dist/esm/line.d.ts", "default": "./dist/esm/line.js" },
      "require": { "types": "./dist/cjs/line.d.ts", "default": "./dist/cjs/line.js" }
    },
    "./grapheme": {
      "import": { "types": "./dist/esm/grapheme.d.ts", "default": "./dist/esm/grapheme.js" },
      "require": { "types": "./dist/cjs/grapheme.d.ts", "default": "./dist/cjs/grapheme.js" }
    },
    "./cleanup": {
      "import": { "types": "./dist/esm/cleanup.d.ts", "default": "./dist/esm/cleanup.js" },
      "require": { "types": "./dist/cjs/cleanup.d.ts", "default": "./dist/cjs/cleanup.js" }
    }
  }
}
```

Create thin source entry files rather than exporting internal directory paths. That keeps implementation structure
private and makes each dependency boundary intentional. For example, the line entry should export `diffLines`, the
operation constants, and relevant types without importing grapheme or cleanup modules.

Subpaths give Node/CommonJS users smaller dependency graphs and bundlers smaller, clearer roots.

## ESM build

A separate ESM output lets compliant bundlers remove unused named exports from each subpath. Explicit `import` and
`require` conditions select distinct native formats, and `sideEffects: false` records that published modules have no
top-level side effects.

The build must solve:

- distinct output directories or extensions so Node can identify each format;
- declaration paths shared safely by both conditions;
- internal relative import extensions valid in emitted ESM;
- package `type`/extension interaction;
- source maps and licensing notices in both outputs;
- whether `sideEffects: false` is truthful for every published module.

This is packaging work, not a source-level micro-optimization, and should be evaluated against actual consumer bundles.

## Compatibility risks

- Removing the existing root condition breaks consumers that have not migrated to a feature subpath.
- Adding subpaths makes those entry-point names part of the public API.
- Dual packages can create duplicate module instances when consumers mix `require` and `import`; constants are
  primitive, but future stateful modules such as a segmenter cache make duplication observable in performance.
- TypeScript resolution differs across `node`, `node16`, `nodenext`, and bundler modes.
- A cleanup-only entry must still expose operation/type imports needed to construct diffs without pulling in diff
  engines.

## Validation

Build a small fixture matrix outside the source tree:

- Node 20, 22, and current Node using both `require` and `import`;
- TypeScript consumers under NodeNext and Bundler resolution;
- a representative browser bundler importing only `diffLines`, only `diffGraphemes`, and only `cleanupSemantic`;
- declaration-resolution tests for every subpath;
- package tarball tests, not imports of unpublished `dist` internals.

Measure fresh-process import time with enough independent processes to report a median and distribution. Measure parsed,
minified, and compressed bundle sizes and inspect module graphs to prove unused cleanup/grapheme code is absent. Do not
use the existing hot-call Vitest benchmark for cold imports because its module cache hides the cost.

## Implementation decision

Publish `./line`, `./grapheme`, and `./cleanup` only. Emit native ESM and CommonJS into format-specific directories,
retain declarations and source maps in both, preserve licensing comments, and test the packed tarball through ESM,
CommonJS, NodeNext, and Bundler consumers. The package root remains intentionally unexported.

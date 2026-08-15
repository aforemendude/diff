# Complex optimization: load only the requested API

## Summary

The package's CommonJS root entry eagerly loads line diffing, grapheme diffing, and both cleanup engines even when an
application uses only one feature. Add supported subpath entry points and, if the project is willing to support a dual
build, a genuine tree-shakable ESM output. This improves cold start and browser bundle size rather than the running time
of an individual diff.

## Evidence

The exploratory measurements below used Node.js 24.18.0 and fresh local child processes.

[`src/index.ts`](../src/index.ts#L1-L13) re-exports every public function. With the current CommonJS compilation and
root export in [`package.json`](../package.json), requiring the package evaluates the complete dependency graph.

A local compiled-output inspection measured about 38.0 KB across the root dependency set versus 13.4 KB for the direct
line-diff dependency set. Across three groups of 50 fresh Node processes, median root import time was about 7.32–7.55
ms, while importing the direct line module was about 4.87–4.89 ms. Process startup makes these noisy, but the roughly
2.5 ms difference warrants a supported-path experiment for CLI and serverless consumers.

## Additive subpath design

Keep the root API unchanged and add explicit public exports such as:

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./line": { "types": "./dist/line.d.ts", "default": "./dist/line.js" },
    "./grapheme": { "types": "./dist/grapheme.d.ts", "default": "./dist/grapheme.js" },
    "./cleanup": { "types": "./dist/cleanup.d.ts", "default": "./dist/cleanup.js" }
  }
}
```

Create thin source entry files rather than exporting internal directory paths. That keeps implementation structure
private and makes each dependency boundary intentional. For example, the line entry should export `diffLines`, the
operation constants, and relevant types without importing grapheme or cleanup modules.

Subpaths alone help Node/CommonJS users who opt in. They also give bundlers smaller, clearer roots.

## Optional ESM build

A separate ESM output lets compliant bundlers remove unused named exports from the root import, provided modules have no
top-level side effects. Add explicit `import` and `require` conditions only after producing and testing both formats; do
not point both conditions at CommonJS and call it tree-shakable.

The build must solve:

- distinct output directories or extensions so Node can identify each format;
- declaration paths shared safely by both conditions;
- internal relative import extensions valid in emitted ESM;
- package `type`/extension interaction;
- source maps and licensing notices in both outputs;
- whether `sideEffects: false` is truthful for every published module.

This is packaging work, not a source-level micro-optimization, and should be evaluated against actual consumer bundles.

## Compatibility risks

- Changing the existing root condition can break Node or bundlers even when tests import source files successfully.
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
- a representative browser bundler importing only `diffLines`, only `diffGraphemes`, and the root;
- declaration-resolution tests for every subpath;
- package tarball tests, not imports of unpublished `dist` internals.

Measure fresh-process import time with enough independent processes to report a median and distribution. Measure parsed,
minified, and compressed bundle sizes and inspect module graphs to prove unused cleanup/grapheme code is absent. Do not
use the existing hot-call Vitest benchmark for cold imports because its module cache hides the cost.

## Rollout

Add CommonJS subpaths first because they are additive and directly measurable. Consider dual ESM only if browser bundle
or ESM cold-start evidence justifies the maintenance cost. Document the subpaths without deprecating the root API.

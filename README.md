# Diff

A small, typed text diff library for Node.js and browsers. It provides line-level and Unicode grapheme-level diffs, plus
optional Diff Match Patch-style semantic and efficiency cleanup.

## Requirements

- Node.js 20 or newer when running on Node.js
- `Intl.Segmenter` in the target Node.js or browser runtime

## Installation

```bash
npm install @aforemendude/diff
```

## Browser usage

The library also works in browser applications when included through a bundler. It has no runtime dependencies and its
runtime code does not use Node.js-only APIs, so it can be imported from browser application code in the same way as in
the examples below. Target browsers must provide `Intl.Segmenter`.

## Quick start

```typescript
import { cleanupSemantic } from '@aforemendude/diff/cleanup';
import { DELETE, EQUAL, INSERT, diffGraphemes } from '@aforemendude/diff/grapheme';

const changes = cleanupSemantic(diffGraphemes('The cat sat.', 'The dog sat.'));
```

```text
[
  [EQUAL,  ['T', 'h', 'e', ' ']],
  [DELETE, ['c', 'a', 't']],
  [INSERT, ['d', 'o', 'g']],
  [EQUAL,  [' ', 's', 'a', 't', '.']],
]
```

Diffs use compact tuples. The first item is an operation and the second is the affected array of tokens:

```typescript
export const DELETE = -1;
export const EQUAL = 0;
export const INSERT = 1;

export type DiffOperation = -1 | 0 | 1;
export type Diff = readonly [operation: DiffOperation, tokens: readonly string[]];
```

Entries with an empty token array are omitted, and adjacent entries with the same operation are merged. An empty string
can still be a valid token - for example, it represents a blank line in a line diff.

## API

The package exposes feature-specific subpaths and deliberately has no root entry point. Importing one diff engine does
not load either cleanup implementation or the other diff engine:

| Subpath                       | Runtime exports                                                     |
| ----------------------------- | ------------------------------------------------------------------- |
| `@aforemendude/diff/line`     | `diffLines`, `DELETE`, `EQUAL`, `INSERT`                            |
| `@aforemendude/diff/grapheme` | `diffGraphemes`, `DELETE`, `EQUAL`, `INSERT`                        |
| `@aforemendude/diff/cleanup`  | `cleanupSemantic`, `cleanupEfficiency`, `DELETE`, `EQUAL`, `INSERT` |

Each subpath supports both ESM `import` and CommonJS `require`. ESM consumers receive native side-effect-free modules,
allowing bundlers to remove unused named exports. Each entry also exports the `Diff` and `DiffOperation` types;
feature-specific option types are exported from the subpath that uses them, and both diff subpaths export the shared
`DiffAlgorithm` type.

```typescript
export type DiffAlgorithm = 'adaptive' | 'myers' | 'sparse';
export type LineEnding = '\r' | '\n' | '\r\n';

export function diffLines(
  before: string,
  after: string,
  options?: {
    readonly algorithm?: DiffAlgorithm;
    readonly lineEnding?: LineEnding;
    readonly optimizeTrivialCases?: boolean;
  },
): readonly Diff[];

export function diffGraphemes(
  before: string,
  after: string,
  options?: {
    readonly algorithm?: DiffAlgorithm;
    readonly locale?: Intl.LocalesArgument;
    readonly optimizeTrivialCases?: boolean;
  },
): readonly Diff[];

export function cleanupSemantic(
  diffs: readonly Diff[],
  options?: { readonly locale?: Intl.LocalesArgument },
): readonly Diff[];

export function cleanupEfficiency(diffs: readonly Diff[], options?: { readonly editCost?: number }): readonly Diff[];
```

### Mutation and ownership guarantees

The public methods never mutate their arguments. This includes option objects and, for the cleanup methods, the input
diff array, its tuples, and their token arrays.

Every call returns a freshly allocated result. The top-level array, every tuple, and every token array are distinct from
the arguments, from arrays elsewhere in the same result, and from arrays returned by other calls. Consequently, even if
the TypeScript `readonly` types are bypassed, changing one returned array cannot change an input, another entry in that
result, or the result of another call.

### `diffLines(before, after, options?)`

Computes a line-level diff using one exact line-ending sequence as the separator throughout both inputs. The supported
line endings are `\r`, `\n`, and `\r\n`; the default is `\n`. Other newline characters remain part of the surrounding
line content.

Line tokens never contain the selected ending. Tokenization splits on the separator and removes exactly one trailing
empty segment. It does not remove every trailing empty segment, because preceding empty segments represent real blank
lines. With the default `\n`, tokenization is:

| Input     | Tokens      |
| --------- | ----------- |
| `''`      | `[]`        |
| `'a'`     | `['a']`     |
| `'a\n'`   | `['a']`     |
| `'a\n\n'` | `['a', '']` |
| `'\n'`    | `['']`      |

Consequently, adding one selected ending after a nonempty final line is insignificant, while an additional ending
represents a blank line:

```typescript
import { EQUAL, INSERT, diffLines } from '@aforemendude/diff/line';

diffLines('a', 'a\n');
diffLines('a\n', 'a\n\n');
```

The results are, respectively:

```text
[[EQUAL, ['a']]]

[
  [EQUAL, ['a']],
  [INSERT, ['']],
]
```

Pass the ending explicitly for CRLF or CR text. For example, `diffLines('a', 'a\r\n', { lineEnding: '\r\n' })` returns
`[[EQUAL, ['a']]]`.

Removing insertion entries reconstructs the first input's canonical line-token stream; removing deletion entries
reconstructs the second. The original separators cannot be reconstructed from a line diff because they are delimiters,
not tokens.

### `diffGraphemes(before, after, options?)`

Computes a raw grapheme-level diff using `Intl.Segmenter` with `granularity: 'grapheme'`. Every item in each token array
is one extended grapheme cluster. Combining sequences, emoji ZWJ sequences, flags, skin-tone sequences, and other
clusters are never split into partial edits.

```typescript
import { DELETE, INSERT, diffGraphemes } from '@aforemendude/diff/grapheme';

const thumbsUpSign = '\u{1F44D}';
const lightSkinTone = '\u{1F3FB}';
const mediumSkinTone = '\u{1F3FD}';
const before = thumbsUpSign + lightSkinTone;
const after = thumbsUpSign + mediumSkinTone;

diffGraphemes(before, after);
// [[DELETE, [before]], [INSERT, [after]]]
```

The library does not Unicode-normalize either input. Canonically equivalent but byte-distinct strings can therefore
remain different. Removing insertion entries and joining the remaining tokens reconstructs the first input; removing
deletion entries and joining reconstructs the second.

The optional `locale` is passed to `Intl.Segmenter`:

```typescript
import { diffGraphemes } from '@aforemendude/diff/grapheme';

diffGraphemes(before, after, { locale: 'th' });
```

Its type is `Intl.LocalesArgument`; when omitted, the runtime's default locale selection is used.

### Algorithm selection

Both diff functions accept `algorithm: 'adaptive' | 'myers' | 'sparse'`. The default is `adaptive`. All three settings
retain the shared common-prefix, common-suffix, empty-side, containment, and one-token shortcuts; the setting selects
the exact engine used for a remaining nontrivial token range.

- `adaptive` estimates the relative work and peak workspace of both engines. It selects sparse-match LCS only when the
  estimated work advantage is substantial and its estimated workspace remains within a conservative multiple of the
  Myers frontier; otherwise it uses Myers. Once adaptive mode prefers Myers, that choice is retained for the rest of the
  call so child ranges do not repeatedly build match indexes.
- `myers` always uses Myers bisection after the shared shortcuts.
- `sparse` always uses exact Hunt-Szymanski sparse-match LCS after the shared shortcuts. This can be much faster for
  disjoint inputs, reversed unique tokens, and other high-distance ranges with few matching position pairs, but it can
  require substantial time and memory for repetitive inputs.

All modes produce a normalized shortest insertion/deletion script. When more than one shortest script exists, the public
API does not guarantee which matching tokens or tuple placements an algorithm will select. Placements may differ between
algorithms or implementation versions, and cleanup results derived from different valid raw diffs can likewise differ.

### Trivial-case optimizations

Both diff functions offer opt-in shortcuts for workloads that frequently compare identical strings or inputs where one
side is empty. Set `optimizeTrivialCases` to `true` to detect those cases before tokenizing both strings. Identical text
is tokenized once and returned as one equality (or an empty diff for two empty strings). When exactly one input is
empty, only the nonempty text is tokenized and returned as one insertion or deletion. `diffLines` also tokenizes only
the shorter input when the strings differ solely by one insignificant selected terminal delimiter:

```typescript
diffLines(text, text, { optimizeTrivialCases: true });
diffLines('a', 'a\n', { optimizeTrivialCases: true });
diffGraphemes('', text, { locale: 'en', optimizeTrivialCases: true });
```

The option defaults to `false`, so the library does not add up-front whole-string checks to workloads where trivial
inputs may be uncommon. The terminal-delimiter shortcut requires a nonempty shorter string that does not already end in
the selected delimiter, and the longer string must be exactly that shorter string plus the delimiter. A nonempty
line-ending string still represents one blank-line token, so `diffLines('', '\n', { optimizeTrivialCases: true })`
returns an insertion of `['']`; likewise, `'a\n'` versus `'a\n\n'` remains a real blank-line edit. After enforcing the
combined input-size limit described below, `diffGraphemes` constructs the requested `Intl.Segmenter` before taking any
shortcut, so invalid locales continue to throw for admitted inputs.

### `cleanupSemantic(diffs, options?)`

Applies Diff Match Patch-style semantic cleanup to a grapheme-token diff and returns a new, normalized tuple array
without mutating the input. Each supplied token must be one complete grapheme cluster. Cleanup moves and combines whole
tokens only, so it never splits a token.

Word boundaries are detected with `Intl.Segmenter` using the optional `locale`:

```typescript
import { cleanupSemantic } from '@aforemendude/diff/cleanup';

const cleaned = cleanupSemantic(changes, { locale: 'ja' });
```

Word boundaries guide the cleanup rather than constrain it. The algorithm may keep a smaller, partial-word edit when
moving the edit to a whole-word boundary would be less useful.

Semantic cleanup is not guaranteed to be idempotent. Applying `cleanupSemantic` again to its output may produce further
changes, so callers should not rely on repeated calls returning the same diff.

To compute and clean up a grapheme-level diff, compose the two operations explicitly:

```typescript
import { cleanupSemantic } from '@aforemendude/diff/cleanup';
import { diffGraphemes } from '@aforemendude/diff/grapheme';

const options = { locale: ['zh-Hant', 'zh'] };
const changes = cleanupSemantic(diffGraphemes(before, after, options), options);
```

### `cleanupEfficiency(diffs, options?)`

Applies Diff Match Patch-style efficiency cleanup to a grapheme-token diff and returns a new, normalized tuple array
without mutating the input. Each supplied token must be one complete grapheme cluster. Short equalities are folded into
surrounding edits when retaining them would cost more than expanding those edits.

The optional `editCost` is the cost of starting a new edit, measured in tokens. It defaults to `4`; larger values
produce more aggressive cleanup. It must be a finite, non-negative number, otherwise `cleanupEfficiency` throws a
`RangeError`. Equalities exactly at a cost threshold are retained.

```typescript
import { cleanupEfficiency } from '@aforemendude/diff/cleanup';
import { diffGraphemes } from '@aforemendude/diff/grapheme';

const changes = cleanupEfficiency(diffGraphemes(before, after), { editCost: 5 });
```

## Runtime argument handling

The package assumes callers supply values that satisfy its exported TypeScript types. Apart from the supported
`algorithm`, combined string length, and finite, non-negative `editCost` checks described here, it does not validate
argument types, diff operation values, tuple or token-array shapes, supported line-ending values, or option shapes at
runtime. Passing out-of-contract values from JavaScript, `any`, or type assertions is unsupported and may produce
incorrect results or errors.

An unsupported `algorithm` value throws a `RangeError` after the combined input-size check but before tokenization,
trivial-case shortcuts, or `Intl.Segmenter` construction.

Underlying platform APIs can still reject values themselves. For example, `Intl.Segmenter` may throw for an invalid
locale.

## Input size and complexity

The combined length of `before` and `after` may not exceed 4,294,967,294 UTF-16 code units. `diffLines` and
`diffGraphemes` throw a `RangeError` above that limit before tokenization, trivial-case shortcuts, or `Intl.Segmenter`
construction. This worst-case bound keeps every token coordinate representable in the compact Myers frontier even when
each token is one UTF-16 code unit.

Within that bound, the implementation works directly with token sequences. It does not encode line identifiers into
UTF-16 characters, impose a fixed line-count ceiling, or stop at an internal timeout. In particular, there is no
40,000-line ceiling. Available memory and processing time are the practical limits; adversarial inputs can still be
expensive.

Myers mode has output-sensitive `O((N + M)D)` time for `N` and `M` input tokens and edit distance `D`, with quadratic
worst cases. Its bisection frontier uses `O(D)` space, bounded by `O(N + M)`. Let `S = min(N, M)`. Sparse mode has
`O(N + M + r log L)` time and `O(S + r + L)` workspace, where `r` is the number of strict-equality matching position
pairs and `L` is the LCS length. It is linear for disjoint ranges but can approach quadratic storage on repetitive
inputs.

Sparse mode builds its occurrence index over the shorter remaining token range. One compact link is retained per indexed
position, while bucket heads and counts are retained only per distinct indexed token. Adaptive mode builds the same
index and counts `r`. A relative memory estimate includes that index, the LIS frontier, and all predecessor records; it
is compared with the peak compact-frontier allocation implied by Myers' geometric growth. The deliberately optimistic
Myers estimate can omit its final search layer, so uncertain ranges favor Myers. Ranges admitted by the memory gate
receive a length-only LIS probe. Sparse is selected only when its full estimated workspace is at most four times the
Myers estimate and its estimated work is at least eight times lower. The estimates use saturating arithmetic and are
selection policy rather than a loss of exactness: both candidate engines still compute a shortest script without a
deadline or heuristic edit limit.

Tokenization is linear in input size, and cleanup adds passes over the produced diff. Tokens are line contents without
the selected line ending for `diffLines` and grapheme clusters for the grapheme APIs.

## Benchmark results

The benchmark suite has one focused entry point for each public workflow. `npm run benchmark` runs four representative
1,000-call schedules. `npm run benchmark:adversarial` runs four opt-in calibrated worst-case public-workflow schedules,
eleven short `diffLines` schedules around adaptive-selection boundaries, and direct `cleanupSemantic` and
`cleanupEfficiency` stress cases at several scales. Timed callbacks invoke only the public entry points. Every benchmark
and preflight passes a complete options object containing adaptive selection, LF line endings, disabled trivial-case
shortcuts, the pinned `en` locale, and an edit cost of 4. These are the documented defaults except for the locale pin,
which avoids host-default differences between benchmark environments. Forced algorithms and other non-default options
remain correctness-test inputs rather than benchmark scores. Fixture generation and correctness preflight are outside
the timed regions, and neither command enforces a machine-specific performance threshold. The calibration tables below
summarize the four primary public workflows; the additional public-API scale cases remain separate.

`npm run benchmark:memory` and `npm run benchmark:adversarial:memory` run the corresponding benchmark files one at a
time in fresh Node.js processes and report the baseline RSS, peak RSS, and peak increase for each workflow. The memory
runner uses Node.js's operating-system-backed maximum resident set size instead of a V8 heap snapshot, so the peak also
captures typed-array backing stores, strings, `Intl.Segmenter`, and other native or external allocations. The reported
increase still includes Vitest, fixture loading, inputs, outputs, and allocator behavior; use it to compare identical
workloads on the same Node.js and operating-system versions rather than as an exact count of retained algorithm objects.
Use the regular benchmark commands for timing comparisons.

The following calibration results were measured on 2026-08-22 with Node.js 24.19.0, npm 11.17.0, Vitest 4.1.10, Linux
7.0.0 on x86-64, and a four-core Intel N95. Times are arithmetic means per measured schedule; RME is Vitest's reported
relative margin of error.

| Workflow                              | Schedule                                    | Calls | Mean (ms) | RME       | Samples |
| ------------------------------------- | ------------------------------------------- | ----: | --------: | --------- | ------: |
| `diffLines`                           | Representative size/edit mix                | 1,000 |  1,035.77 | +/-1.75%  |       3 |
| `diffGraphemes`                       | Representative prose and mixed-Unicode mix  | 1,000 |  2,071.97 | +/-0.71%  |       3 |
| `diffGraphemes` + `cleanupSemantic`   | Scaled representative grapheme mix          | 1,000 |  2,055.05 | +/-2.81%  |       3 |
| `diffGraphemes` + `cleanupEfficiency` | Scaled representative grapheme mix          | 1,000 |  2,038.56 | +/-1.82%  |       3 |
| `diffLines`                           | 9,500 disjoint unique lines per side        |     1 |      2.82 | +/-17.12% |       3 |
| `diffGraphemes`                       | 11,000 disjoint graphemes per side          |     1 |      3.82 | +/-2.73%  |       3 |
| `diffGraphemes` + `cleanupSemantic`   | 4,250,000 equivalent semantic placements    |     1 |  1,916.40 | +/-7.28%  |       3 |
| `diffGraphemes` + `cleanupEfficiency` | 8,200 interleaved single-token replacements |     1 |  1,925.78 | +/-1.00%  |       3 |

The memory commands produced the following results in the same environment. Each row reports the process high-water mark
after the warmup and three measured iterations in its fresh benchmark process.

| Workflow                              | Schedule                                   | Baseline RSS (MiB) | Peak RSS (MiB) | Peak increase (MiB) |
| ------------------------------------- | ------------------------------------------ | -----------------: | -------------: | ------------------: |
| `diffLines`                           | Representative size/edit mix               |              99.09 |         374.64 |              275.55 |
| `diffGraphemes`                       | Representative prose and mixed-Unicode mix |              99.17 |         267.70 |              168.52 |
| `diffGraphemes` + `cleanupSemantic`   | Scaled representative grapheme mix         |              99.31 |         275.30 |              175.99 |
| `diffGraphemes` + `cleanupEfficiency` | Scaled representative grapheme mix         |              99.61 |         276.86 |              177.25 |
| `diffLines`                           | All public line-diff stress cases          |              99.14 |         216.53 |              117.39 |
| `diffGraphemes`                       | 11,000 disjoint graphemes per side         |              99.13 |         210.56 |              111.43 |
| `cleanupSemantic`                     | All public semantic-cleanup stress cases   |              99.38 |       1,142.76 |            1,043.38 |
| `cleanupEfficiency`                   | All public efficiency-cleanup stress cases |              99.26 |         380.93 |              281.67 |

The additional public `diffLines` schedules measured 1.57 ms for the lower-match side of their three-size
memory-crossover schedule and 47.39 ms for the adjacent higher-match side that conservatively selected Myers. The
single-size work-crossover schedules at 100 and 101 lines measured 0.22 ms on the Myers side and 0.05 ms on the sparse
side.

The four primary representative and cleanup stress fixtures target roughly two seconds per measured schedule on the
reference machine. The disjoint fixtures retain their historical sizes and are now intentionally much shorter under
sparse-match selection. All measurements remain machine-specific observations, not performance guarantees. See
[Expected input distribution and benchmark mapping](docs/expected-input-distribution.md) for the heuristic distribution,
fixture construction, correctness checks, and interpretation guidance.

## Licensing

Original project code is distributed under the [MIT license](LICENSE). Portions of the diff and cleanup implementation
are derived from `diff-match-patch-es` and Google Diff Match Patch and remain under the Apache License, Version 2.0. The
package therefore declares `MIT AND Apache-2.0`. See the [third-party notices](THIRD_PARTY_NOTICES.md) and the included
[Apache-2.0 license text](LICENSES/Apache-2.0.txt).

## Development

Development requires Node.js 22.12 or newer. The published library supports Node.js 20 or newer. `npm run test` runs the
unit and integration suites. After a build, `npm run test:package` packs and installs the tarball in a temporary
consumer to verify runtime and declaration resolution. Benchmarks use deterministic generated workloads and run
separately; they report measurements without enforcing machine-specific performance thresholds. The distribution
assumptions, workload groups, fixture mapping, and interpretation policy are documented in
[Expected input distribution and benchmark mapping](docs/expected-input-distribution.md).

```bash
npm run format:check
npm run build
npm run test
npm run test:package
npm run benchmark
npm run benchmark:adversarial
npm run benchmark:memory
npm run benchmark:adversarial:memory
npm run verify
```

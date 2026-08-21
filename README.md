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

// [
//   [EQUAL,  ['T', 'h', 'e', ' ']],
//   [DELETE, ['c', 'a', 't']],
//   [INSERT, ['d', 'o', 'g']],
//   [EQUAL,  [' ', 's', 'a', 't', '.']],
// ]
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
feature-specific option types are exported from the subpath that uses them.

```typescript
export type LineEnding = '\r' | '\n' | '\r\n';

export function diffLines(
  before: string,
  after: string,
  options?: {
    readonly lineEnding?: LineEnding;
    readonly optimizeTrivialCases?: boolean;
  },
): readonly Diff[];

export function diffGraphemes(
  before: string,
  after: string,
  options?: {
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
// [[EQUAL, ['a']]]

diffLines('a\n', 'a\n\n');
// [
//   [EQUAL, ['a']],
//   [INSERT, ['']],
// ]
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

The package assumes callers supply values that satisfy its exported TypeScript types. Apart from the combined string
length and finite, non-negative `editCost` checks described here, it does not validate argument types, diff operation
values, tuple or token-array shapes, supported line-ending values, or option shapes at runtime. Passing out-of-contract
values from JavaScript, `any`, or type assertions is unsupported and may produce incorrect results or errors.

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

The core retains the Myers/Diff Match Patch asymptotic profile. For `N` and `M` input tokens and edit distance `D`, its
output-sensitive time behavior is commonly expressed as `O((N + M)D)`, with quadratic worst cases. The bisection
frontier grows with the explored distance and uses `O(D)` space, bounded by `O(N + M)` in the worst case. Tokenization
is linear in input size, and cleanup adds passes over the produced diff. Tokens are line contents without the selected
line ending for `diffLines` and grapheme clusters for the grapheme APIs.

## Benchmark results

The benchmark suite has one focused entry point for each public workflow. `npm run benchmark` runs four representative
1,000-call schedules. `npm run benchmark:adversarial` runs four opt-in worst-case schedules whose timed callbacks make
one public call. Fixture generation and correctness preflight are outside the timed regions, and neither command
enforces a machine-specific performance threshold.

The following calibration results were measured on 2026-08-21 with Node.js 24.19.0, npm 11.17.0, Vitest 4.1.10, Linux
7.0.0 on x86-64, and a four-core Intel N95. Times are arithmetic means per measured schedule; RME is Vitest's reported
relative margin of error.

| Workflow                              | Schedule                                    | Calls | Mean (ms) | RME      | Samples |
| ------------------------------------- | ------------------------------------------- | ----: | --------: | -------- | ------: |
| `diffLines`                           | Representative size/edit mix                | 1,000 |  1,947.68 | +/-0.38% |       3 |
| `diffGraphemes`                       | Representative prose and mixed-Unicode mix  | 1,000 |  1,914.85 | +/-0.61% |       3 |
| `diffGraphemes` + `cleanupSemantic`   | Scaled representative grapheme mix          | 1,000 |  1,941.64 | +/-1.61% |       3 |
| `diffGraphemes` + `cleanupEfficiency` | Scaled representative grapheme mix          | 1,000 |  1,923.96 | +/-1.93% |       3 |
| `diffLines`                           | 9,500 disjoint unique lines per side        |     1 |  1,986.88 | +/-1.32% |       3 |
| `diffGraphemes`                       | 11,000 disjoint graphemes per side          |     1 |  2,015.53 | +/-0.03% |       3 |
| `diffGraphemes` + `cleanupSemantic`   | 4,250,000 equivalent semantic placements    |     1 |  1,890.85 | +/-4.91% |       3 |
| `diffGraphemes` + `cleanupEfficiency` | 8,200 interleaved single-token replacements |     1 |  1,966.43 | +/-6.08% |       3 |

The fixture sizes target roughly two seconds per measured schedule on the reference machine. All measurements remain
machine-specific observations, not performance guarantees. See
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
npm run verify
```

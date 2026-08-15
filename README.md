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
import { DELETE, EQUAL, INSERT, cleanupSemantic, diffGraphemes } from '@aforemendude/diff';

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
can still be a valid token—for example, it represents a blank line in a line diff.

## API

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
import { EQUAL, INSERT, diffLines } from '@aforemendude/diff';

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
import { DELETE, INSERT, diffGraphemes } from '@aforemendude/diff';

diffGraphemes('👍🏻', '👍🏽');
// [[DELETE, ['👍🏻']], [INSERT, ['👍🏽']]]
```

The library does not Unicode-normalize either input. Canonically equivalent but byte-distinct strings can therefore
remain different. Removing insertion entries and joining the remaining tokens reconstructs the first input; removing
deletion entries and joining reconstructs the second.

The optional `locale` is passed to `Intl.Segmenter`:

```typescript
import { diffGraphemes } from '@aforemendude/diff';

diffGraphemes(before, after, { locale: 'th' });
```

Its type is `Intl.LocalesArgument`; when omitted, the runtime's default locale selection is used.

### Trivial-case optimizations

Both diff functions offer opt-in shortcuts for workloads that frequently compare identical strings or inputs where one
side is empty. Set `optimizeTrivialCases` to `true` to detect those cases before tokenizing both strings. Identical text
is tokenized once and returned as one equality (or an empty diff for two empty strings). When exactly one input is
empty, only the nonempty text is tokenized and returned as one insertion or deletion:

```typescript
diffLines(text, text, { optimizeTrivialCases: true });
diffGraphemes('', text, { locale: 'en', optimizeTrivialCases: true });
```

The option defaults to `false`, so the library does not add an up-front whole-string equality check to workloads where
trivial inputs may be uncommon. The equality shortcut tests exact source-string equality; it does not apply to different
line strings that happen to produce the same canonical line tokens, such as `'a'` and `'a\n'`. A nonempty line-ending
string still represents one blank-line token, so `diffLines('', '\n', { optimizeTrivialCases: true })` returns an
insertion of `['']`. `diffGraphemes` constructs the requested `Intl.Segmenter` before taking any shortcut, so invalid
locales continue to throw.

### `cleanupSemantic(diffs, options?)`

Applies Diff Match Patch-style semantic cleanup to a grapheme-token diff and returns a new, normalized tuple array
without mutating the input. Each supplied token must be one complete grapheme cluster. Cleanup moves and combines whole
tokens only, so it never splits a token.

Word boundaries are detected with `Intl.Segmenter` using the optional `locale`:

```typescript
import { cleanupSemantic } from '@aforemendude/diff';

const cleaned = cleanupSemantic(changes, { locale: 'ja' });
```

Word boundaries guide the cleanup rather than constrain it. The algorithm may keep a smaller, partial-word edit when
moving the edit to a whole-word boundary would be less useful.

Semantic cleanup is not guaranteed to be idempotent. Applying `cleanupSemantic` again to its output may produce further
changes, so callers should not rely on repeated calls returning the same diff.

To compute and clean up a grapheme-level diff, compose the two operations explicitly:

```typescript
import { cleanupSemantic, diffGraphemes } from '@aforemendude/diff';

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
import { cleanupEfficiency, diffGraphemes } from '@aforemendude/diff';

const changes = cleanupEfficiency(diffGraphemes(before, after), { editCost: 5 });
```

## Runtime argument handling

The package assumes callers supply values that satisfy its exported TypeScript types. With the exception of the finite,
non-negative `editCost` check described above, it does not validate argument types, diff operation values, tuple or
token-array shapes, supported line-ending values, or option shapes at runtime. Passing out-of-contract values from
JavaScript, `any`, or type assertions is unsupported and may produce incorrect results or errors.

Underlying platform APIs can still reject values themselves. For example, `Intl.Segmenter` may throw for an invalid
locale.

## Input size and complexity

The implementation works directly with token sequences. It does not encode line identifiers into UTF-16 characters,
impose a fixed line-count or text-size cutoff, or stop at an internal timeout. In particular, there is no 40,000-line
ceiling. Available memory and processing time are the practical limits; adversarial inputs can still be expensive.

The core retains the Myers/Diff Match Patch asymptotic profile. For `N` and `M` input tokens and edit distance `D`, its
output-sensitive time behavior is commonly expressed as `O((N + M)D)`, with quadratic worst cases and linear auxiliary
space for the bisection frontier. Tokenization is linear in input size, and cleanup adds passes over the produced diff.
Tokens are line contents without the selected line ending for `diffLines` and grapheme clusters for the grapheme APIs.

## Licensing

Original project code is distributed under the [MIT license](LICENSE). Portions of the diff and cleanup implementation
are derived from `diff-match-patch-es` and Google Diff Match Patch and remain under the Apache License, Version 2.0. The
package therefore declares `MIT AND Apache-2.0`. See the [third-party notices](THIRD_PARTY_NOTICES.md) and the included
[Apache-2.0 license text](LICENSES/Apache-2.0.txt).

## Development

Development requires Node.js 22.12 or newer. The published library supports Node.js 20 or newer. `npm run test` runs the
unit and integration suites. Benchmarks use generated, fixed-seed workloads and run separately; they report measurements
without enforcing machine-specific performance thresholds.

```bash
npm run format:check
npm run build
npm run test
npm run benchmark
npm run verify
```

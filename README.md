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
//   [EQUAL,  'The '],
//   [DELETE, 'cat'],
//   [INSERT, 'dog'],
//   [EQUAL,  ' sat.'],
// ]
```

Diffs use compact tuples. The first item is an operation and the second is the affected text:

```typescript
export const DELETE = -1;
export const EQUAL = 0;
export const INSERT = 1;

export type DiffOperation = -1 | 0 | 1;
export type Diff = readonly [operation: DiffOperation, text: string];
```

Empty tuples are omitted and adjacent tuples with the same operation are merged. Removing all insertions reconstructs
the first input; removing all deletions reconstructs the second input.

## API

```typescript
export function diffLines(before: string, after: string): readonly Diff[];

export function diffGraphemes(
  before: string,
  after: string,
  options?: { readonly locale?: Intl.LocalesArgument },
): readonly Diff[];

export function cleanupSemantic(
  diffs: readonly Diff[],
  options?: { readonly locale?: Intl.LocalesArgument },
): readonly Diff[];

export function cleanupEfficiency(
  diffs: readonly Diff[],
  options?: {
    readonly editCost?: number;
    readonly locale?: Intl.LocalesArgument;
  },
): readonly Diff[];
```

### `diffLines(before, after)`

Computes a line-level diff. Line content is kept atomic, line endings are preserved without normalization, and a final
line ending is represented as its own change when necessary.

In particular, a missing final newline does not make the otherwise unchanged last line look replaced:

```typescript
import { EQUAL, INSERT, diffLines } from '@aforemendude/diff';

diffLines('a', 'a\n');
// [[EQUAL, 'a'], [INSERT, '\n']]
```

The same behavior applies in reverse when removing a final newline and to CRLF and CR line endings. Mixed line-ending
styles are retained exactly.

### `diffGraphemes(before, after, options?)`

Computes a raw grapheme-level diff using `Intl.Segmenter` with `granularity: 'grapheme'`. Combining sequences, emoji ZWJ
sequences, flags, skin-tone sequences, and other extended grapheme clusters are never split into partial edits.

```typescript
import { DELETE, INSERT, diffGraphemes } from '@aforemendude/diff';

diffGraphemes('👍🏻', '👍🏽');
// [[DELETE, '👍🏻'], [INSERT, '👍🏽']]
```

The library does not Unicode-normalize either input. Canonically equivalent but byte-distinct strings can therefore
remain different.

The optional `locale` is passed to `Intl.Segmenter`:

```typescript
diffGraphemes(before, after, { locale: 'th' });
```

Its type is `Intl.LocalesArgument`; when omitted, the runtime's default locale selection is used.

### `cleanupSemantic(diffs, options?)`

Applies Diff Match Patch-style semantic cleanup to a tuple diff and returns a new, normalized tuple array without
mutating the input. Cleanup uses grapheme clusters for every edit boundary, so it never introduces a split inside a
grapheme cluster.

Word boundaries are detected with `Intl.Segmenter` using the optional `locale`:

```typescript
const cleaned = cleanupSemantic(changes, { locale: 'ja' });
```

Word boundaries guide the cleanup rather than constrain it. The algorithm may keep a smaller, partial-word edit when
moving the edit to a whole-word boundary would be less useful.

To compute and clean up a grapheme-level diff, compose the two operations explicitly:

```typescript
const options = { locale: ['zh-Hant', 'zh'] };
const changes = cleanupSemantic(diffGraphemes(before, after, options), options);
```

### `cleanupEfficiency(diffs, options?)`

Applies Diff Match Patch-style efficiency cleanup for machine processing and returns a new, normalized tuple array
without mutating the input. Short equalities are folded into surrounding edits when retaining them would cost more than
expanding those edits.

The optional `editCost` is the cost of starting a new edit, measured in grapheme clusters. It defaults to `4`; larger
values produce more aggressive cleanup. Equalities exactly at a cost threshold are retained.

```typescript
import { cleanupEfficiency, diffGraphemes } from '@aforemendude/diff';

const changes = cleanupEfficiency(diffGraphemes(before, after), { editCost: 5 });
```

The optional `locale` is passed to `Intl.Segmenter` while enforcing grapheme-safe tuple boundaries.

## Input size and complexity

The implementation works directly with token sequences. It does not encode line identifiers into UTF-16 characters,
impose a fixed line-count or text-size cutoff, or stop at an internal timeout. In particular, there is no 40,000-line
ceiling. Available memory and processing time are the practical limits; adversarial inputs can still be expensive.

The core retains the Myers/Diff Match Patch asymptotic profile. For `N` and `M` input tokens and edit distance `D`, its
output-sensitive time behavior is commonly expressed as `O((N + M)D)`, with quadratic worst cases and linear auxiliary
space for the bisection frontier. Tokenization is linear in input size, and cleanup adds passes over the produced diff.
Tokens are lines/line endings for `diffLines` and grapheme clusters for the grapheme APIs.

## Licensing

Original project code is distributed under the [MIT license](LICENSE). Portions of the diff and cleanup implementation
are derived from `diff-match-patch-es` and Google Diff Match Patch and remain under the Apache License, Version 2.0. The
package therefore declares `MIT AND Apache-2.0`. See the [third-party notices](THIRD_PARTY_NOTICES.md) and the included
[Apache-2.0 license text](LICENSES/Apache-2.0.txt).

## Development

Development requires Node.js 22.12 or newer. The published library supports Node.js 20 or newer.

```bash
npm run format:check
npm run build
npm run test
npm run verify
```

# Diff engine fork requirements

This document is an implementation contract for replacing the current vendored Diff Match Patch runtime and the
project's diff utilities with one directly importable package. It describes behavior at repository commit `732e73c`.
The intended reader should be able to fork either Google's JavaScript
[diff-match-patch](https://github.com/google/diff-match-patch) or the TypeScript/ESM
[diff-match-patch-es](https://github.com/antfu/diff-match-patch-es), implement the requirements below, and then let the
worker call the fork without an application-owned diff wrapper.

The current processing path is:

```text
DiffWorkerClient
  -> worker message
  -> computeDiff (mode selection, JSON handling, result shaping)
      -> diffLines (unbounded whole-line sequence diff)
      -> diff_match_patch.diff_main (characters within paired changed lines)
      -> optional character cleanup
  -> ComputeDiffOutcome
```

The target path is:

```text
DiffWorkerClient
  -> worker message
  -> fork.computeDiff
  -> ComputeDiffOutcome
```

The browser worker and its cancellation/lifecycle code remain application concerns. JSON normalization, safe whole-line
diffing, character diffing, and display-result shaping belong in the fork if “no wrapper” is to be literal.

## 1. High-level diff features required

### Plain-text comparison

- Compare arbitrary browser strings locally and synchronously inside a Web Worker.
- Return an early `identical` outcome when the raw strings are exactly equal. Empty versus empty is identical.
- Produce a side-by-side, row-aligned result with one-based source line numbers.
- Classify real lines as `equal`, `delete`, `insert`, or `modify`.
- Use placeholder rows on the opposite side of an unpaired insertion/deletion. Placeholders use `lineNumber: -1`, empty
  content, and the operation type appropriate to that side.
- Pair adjacent deleted and inserted lines **positionally**, not by a similarity score. Each pair becomes `modify` and
  receives a character-level diff. Any surplus lines become unpaired insertions/deletions.
- Preserve deterministic Diff Match Patch/Myers alignment when repeated lines permit more than one shortest edit script.
- Support empty input, blank lines, LF text, CRLF text, and an unterminated final line. Only LF (`\n`) is a line boundary;
  a preceding CR (`\r`) remains part of the line content, matching Diff Match Patch.
- Treat a final line as the same logical line whether it is followed by EOF or by another line. This is why non-empty,
  unterminated input is temporarily given an LF before whole-line diffing.
- Report the presence of a trailing LF separately for both sides. A trailing-LF-only change must leave the content line
  equal and differ only in `originalTrailingNewline`/`modifiedTrailingNewline`.
- Handle more than 65,535 unique lines without coalescing a remaining suffix into one token.
- Treat every line as a safe map key, including `__proto__`, `constructor`, `toString`, and `hasOwnProperty`, even when
  `Object.prototype` is frozen.

### Character-level comparison

- Character detail is calculated only for a positionally paired delete/insert line, never for an unpaired line.
- Use standard Diff Match Patch tuples with operations `-1` (delete), `0` (equal), and `1` (insert).
- Split the tuple stream into side-specific character arrays:
  - equal text is included on both sides;
  - deleted text is included only on the original side;
  - inserted text is included only on the modified side.
- Support three cleanup modes:
  - `semantic`: call semantic cleanup;
  - `efficiency`: call efficiency cleanup after applying the caller's `editCost`;
  - `none`: retain the raw `diff_main` result.
- Always use an unlimited Diff Match Patch timeout (`Diff_Timeout = 0`). Cancellation is achieved by terminating the
  worker, not by an engine deadline.
- Default settings are semantic cleanup and edit cost `4`; callers may supply any non-negative edit cost.

The current character algorithm works in UTF-16 code units, as upstream does. This can split a surrogate pair and make
the changed portion of some emoji render at zero width. Grapheme- or code-point-safe boundaries would be a useful fork
improvement, but they are not part of current behavioral parity and need dedicated compatibility decisions/tests.

### JSON comparison

JSON mode is canonicalized-text comparison, **not** a JSON tree diff:

1. Parse the original with `JSON.parse`; if it fails, return a source-specific error immediately.
2. Parse the modified input only after the original succeeds; if it fails, return a modified-source error.
3. Recursively serialize both parsed values with two-space indentation.
4. Sort each non-array object's own enumerable string keys lexicographically. Preserve array element order.
5. Compare and diff those canonical strings with the same line/character pipeline as plain text.

This makes whitespace, indentation, and object-key order insignificant while keeping array order significant. All valid
JSON values are accepted, not only objects and arrays. The canonical form has no trailing LF.

Parsing can lose source information, so valid JSON is scanned before its original number spellings and duplicate keys
are discarded. Return warning counts for:

- `numeric-precision`: every number token which becomes non-finite, is an unsafe integer, or does not round-trip to the
  same canonical base-10 value through JavaScript `Number`;
- `duplicate-keys`: every decoded occurrence after the first of the same key within one object. Key reuse in another
  object is not a duplicate.

Warnings are attached to both `success` and `identical` outcomes. The stable order is original numeric precision,
modified numeric precision, original duplicate keys, then modified duplicate keys; zero-count entries are omitted. If
either source is invalid, return only its parse error, not warnings from the valid source.

### Result features consumed by the UI

The fork does not need to render anything, but its result must support:

- side-by-side line content and real source line numbers;
- row-level insertion/deletion/modification styling;
- character spans within modified rows;
- explicit trailing-newline status; and
- collapsing equal regions in the UI (currently three context lines around each changed row).

Collapsing sections is presentation logic and should remain outside the fork.

## 2. Diff Match Patch functions and data used

### Direct production API usage

| Original JavaScript API | How the project uses it | Needed in the fork |
| --- | --- | --- |
| `new diff_match_patch()` | Creates the character engine after equality/JSON checks | Not if using pure ESM functions; otherwise yes |
| `Diff_Timeout` | Set to `0` on every created engine | Preserve as fixed high-level behavior or a `diffTimeout: 0` option |
| `Diff_EditCost` | Set from `ComputeDiffOptions.editCost` | Required by efficiency cleanup |
| `diff_main(text1, text2)` | Character diff for each paired changed line, with upstream default `checklines = true` | Required |
| `diff_cleanupSemantic(diffs)` | Mutates character tuples in semantic mode | Required |
| `diff_cleanupEfficiency(diffs)` | Mutates character tuples in efficiency mode | Required |
| `DIFF_DELETE`, `DIFF_EQUAL`, `DIFF_INSERT` | Interprets both line and character operations | Required as constants or an equivalent typed operation union |
| `diff_match_patch.Diff` / tuple indexes `[0]`, `[1]` | Reads operation and payload | Required data contract; a plain tuple is sufficient |

`diff-match-patch-es` exposes the corresponding pure functions as `diff`/`diffMain`, `diffCleanupSemantic`, and
`diffCleanupEfficiency`, with options such as `diffTimeout` and `diffEditCost` passed as arguments. Its ESM structure is
a better direct starting point, but its current `diffLinesToChars` still uses a plain object and the 40,000/65,535 token
ceilings, so it still needs the line-sequence change described below.

### Historical/private line API usage

Before `lineDiffUtils.ts` was introduced, `computeDiff` directly called this private sequence:

```text
diff_linesToChars_(normalizedText1, normalizedText2)
diff_main(chars1, chars2, false)  // with Diff_Timeout = 0
diff_charsToLines_(diffs, lineArray)
```

The current `lineDiffUtils.ts` replaces that sequence. The application no longer calls the two private helpers. The
compatibility file `public/vendor_patch.js` still monkey-patches `diff_linesToChars_`, but only as a safeguard if future
code sends multiline strings through upstream `diff_main` line mode.

### Transitive Diff Match Patch implementation dependencies

Keeping exact upstream character behavior requires more than the three public functions explicitly called:

```text
diff_main
  -> diff_commonPrefix
  -> diff_commonSuffix
  -> diff_compute_
       -> diff_halfMatch_              (returns null because timeout is 0)
       -> diff_lineMode_                (possible when both line strings exceed 100 code units)
            -> diff_linesToChars_
            -> diff_charsToLines_
            -> diff_cleanupSemantic
            -> recursive diff_main
       -> diff_bisect_
            -> diff_bisectSplit_
                 -> recursive diff_main
  -> diff_cleanupMerge

diff_cleanupSemantic
  -> diff_cleanupMerge
  -> diff_cleanupSemanticLossless
       -> diff_commonSuffix
  -> diff_commonOverlap_

diff_cleanupEfficiency
  -> diff_cleanupMerge
```

Because the high-level contract always uses timeout zero, deadline bailout and half-match optimization are inactive.
They may be retained for upstream compatibility, but the specialized line-sequence path deliberately omits them.

### Declared but unused APIs

`src/diff_match_patch.d.ts` declares the complete upstream surface, but declarations are not evidence of use. This
project does **not** call:

- `diff_xIndex`, `diff_prettyHtml`, `diff_text1`, `diff_text2`, `diff_levenshtein`, `diff_toDelta`, or `diff_fromDelta`;
- `match_main` or any Bitap/match function; or
- any `patch_*` function or `patch_obj`.

Match and patch code can therefore be removed from a project-specific, tree-shakable fork. Retain it only if the fork is
intended to remain a general Diff Match Patch replacement.

## 3. Required modification to original Diff Match Patch

### Replace UTF-16 line-token strings with a real sequence diff

The essential algorithm change is not merely changing `lineHash = {}` to `Object.create(null)` or `Map`. Upstream
encodes each unique line as one UTF-16 code unit. It allocates at most 40,000 tokens while encoding the first input and
65,535 total, then converts the remaining suffix into one token. A safe key map fixes prototype-name collisions but not
that representational ceiling.

Implement whole-line diffing as follows:

1. Split after LF while keeping LF attached to each line. Empty text yields no token; an unterminated non-empty final
   line is one token.
2. Intern lines from both inputs through one shared `Map<string, number>` and store their numeric IDs in arrays.
3. Run the Diff Match Patch unlimited-timeout, `checklines = false` path over the numeric arrays.
4. Decode each numeric payload to an array of complete lines, not one concatenated string.
5. Return `{ operation, lines }` groups.

This removes both current failure classes:

- a `Map` makes inherited/prototype-sensitive names ordinary keys, even with a frozen `Object.prototype`;
- numeric arrays remove the 40,000/65,535 UTF-16 token ceiling. They remain subject only to practical JavaScript
  memory/array limits.

Do not use the NUL-prefix monkey patch from `public/vendor_patch.js` in the fork. It protects object keys but cannot fix
the token ceiling. Once the fork's own internal `diff_lineMode` is safe—or the project-facing character call is
guaranteed not to invoke it—the shim is unnecessary.

### Exact mapping of `lineDiffUtils.ts` to upstream

| Current function/operation | Upstream ancestor | Preserved behavior and deliberate differences |
| --- | --- | --- |
| `diffLines` + `splitLines` + `Map` encoder/decoder | `diff_linesToChars_` + `diff_charsToLines_` | LF-only boundaries and retained terminators; numeric ID arrays; safe keys; no blank ID-0 sentinel; grouped line arrays |
| `diffSequences` | `diff_main` | Equality fast path, common prefix/suffix stripping/restoration, compute, then merge cleanup |
| `computeDiff` (private sequence function) | `diff_compute_` | Empty-side fast paths, containment shortcut, one-item shortcut, then bisect |
| `bisect` | `diff_bisect_` | Same Myers forward/reverse frontier and tie-breaking; uses `Int32Array`; deadline check omitted |
| `bisectSplit` | `diff_bisectSplit_` | Recursively diffs left and right sequence slices |
| `cleanupMerge` | `diff_cleanupMerge` | Array-valued merge, common-prefix/suffix extraction, equality merging, edit shifting, and recursive normalization |
| `commonPrefix` / `commonSuffix` | `diff_commonPrefix` / `diff_commonSuffix` | Linear array comparison rather than substring binary search; same result |
| `indexOfSequence` | `String#indexOf` containment shortcut | KMP over numeric arrays, preserving the first complete match |
| `sequencesEqual`, `startsWithSequence`, `endsWithSequence` | String equality/substring helpers | Element-wise array equivalents |

The port intentionally omits half-match, nested line mode, and deadlines because the replaced call path had timeout
zero and passed `checklines = false`. It preserves the containment shortcut, Myers tie-breaking, recursive splits, and
merge normalization. It does **not** reproduce upstream's supported `diff_lineMode_`, which additionally performs a
semantic line cleanup and re-diffs replacement blocks character by character; the project's old custom private-helper
sequence did not do those steps either.

### Package/runtime modification for direct use

A fork of the original browser script must also expose ESM exports and TypeScript declarations. The current repository
has to concatenate the vendored script and compatibility patch in a Vite virtual module, then rewrite four top-level
`this[...]` assignments to `globalThis[...]` so they work in a module worker. A direct fork should instead export:

- the high-level comparison method and its result/options types;
- the three diff operation constants;
- the low-level character diff and cleanup functions if general reuse is desired; and
- `diffLines` for focused testing or reuse.

Starting from `diff-match-patch-es` already solves the ESM, TypeScript, global, and class-instance issues. Starting from
Google's JavaScript requires implementing those packaging changes as well as the line algorithm.

## 4. High-level methods the fork must provide

Only one application-facing method is strictly required. Additional methods are useful seams and may be exported or
kept internal.

### Required: `computeDiff`

For the smallest migration, export the same synchronous signature now used by the worker:

```ts
export function computeDiff(
  originalText: string,
  modifiedText: string,
  options: ComputeDiffOptions,
): ComputeDiffOutcome;

export interface ComputeDiffOptions {
  isJsonMode: boolean;
  diffCleanupMode: 'semantic' | 'efficiency' | 'none';
  editCost: number;
}
```

This method must own all of the following; otherwise an application wrapper is still required:

- JSON parse/canonicalization/warning behavior;
- exact-equality handling;
- trailing-LF capture and line-input normalization;
- unlimited whole-line diffing;
- line numbering and side-by-side row alignment;
- positional pairing of replacement lines;
- character diff and selected cleanup; and
- conversion to the display data model.

The current `engineFactory` fourth argument is only a unit-test seam and should not be part of the public fork API.

### Recommended: `diffLines`

```ts
export type DiffOperation = -1 | 0 | 1;

export interface LineSequenceDiff {
  operation: DiffOperation;
  lines: string[];
}

export function diffLines(text1: string, text2: string): LineSequenceDiff[];
```

This is the safe, no-token-ceiling replacement for manually composing `diff_linesToChars_`, `diff_main(..., false)`,
and `diff_charsToLines_`. Exporting it makes the modified algorithm independently testable, though `computeDiff` should
call it internally.

### Internal or optionally public JSON methods

These behaviors must live in the package; they need not expand the public API:

```ts
normalizeJson(text, source)
  -> { normalizedText, issueCounts } | source-specific error

stringifyWithSortedKeys(value)
  -> string | undefined

detectJsonIssues(validJsonSource)
  -> { numericPrecision: number, duplicateKeys: number }
```

The current sorted stringifier preserves native `JSON.stringify` semantics: two-space indentation, array order, `toJSON`
receiver, circular-reference errors, inherited-property exclusion, sparse/undefined array conversion to `null`, and
Proxy invariants for frozen objects. Since the high-level method passes values produced by `JSON.parse`, some of those
generic-object cases are defensive rather than user-JSON cases, but preserving them is safest when porting the helper.

### Internal character wrapper

A small internal method avoids duplicating option handling and side filtering:

```ts
diffChangedLine(originalLine, modifiedLine, { diffCleanupMode, editCost })
  -> { originalCharDiffs, modifiedCharDiffs }
```

It should run the raw character diff with timeout zero, apply exactly one selected cleanup (or none), and project equal
tuples to both sides while projecting delete/insert tuples to their respective side.

### Result and error contract

The fork should export these types, or structurally identical equivalents:

```ts
export interface DiffResult {
  originalLines: LineDiff[];
  modifiedLines: LineDiff[];
  originalTrailingNewline: boolean;
  modifiedTrailingNewline: boolean;
}

export interface LineDiff {
  lineNumber: number;
  type: 'equal' | 'delete' | 'insert' | 'modify';
  content: string;
  charDiffs?: CharDiff[];
}

export interface CharDiff {
  type: 'equal' | 'delete' | 'insert';
  text: string;
}

export interface JsonWarning {
  source: 'original' | 'modified';
  type: 'numeric-precision' | 'duplicate-keys';
  count: number;
}

export type ComputeDiffOutcome =
  | { status: 'success'; diffResult: DiffResult; warnings?: JsonWarning[] }
  | { status: 'identical'; warnings?: JsonWarning[] }
  | { status: 'error'; source: 'original' | 'modified'; message: string };
```

For every success, `originalLines.length` must equal `modifiedLines.length`. Real line numbers increment independently;
placeholder line numbers are `-1`. `charDiffs` is present only on `modify` rows. An empty character array is valid if a
mocked or unusual cleanup removes all tuples.

## Comparison algorithm in implementation order

The high-level method should implement the following order because the observable error/warning and allocation behavior
depends on it:

1. In JSON mode, parse/canonicalize original, then modified, and collect source-token issue counts.
2. If the two effective comparison strings are equal, return `identical`, adding warnings only when non-empty. Do not
   instantiate/run a diff engine.
3. Capture whether each effective string ends in LF.
4. Configure the character engine for timeout zero and the supplied edit cost.
5. For whole-line diff input only, leave empty strings unchanged and append LF to every non-empty string missing LF.
6. Run the numeric-array `diffLines` algorithm.
7. Decode line groups to independent original and modified streams. Remove only the attached final LF from each line
   token; a CR preceding it remains in `content`.
8. Walk both streams. Copy paired equal lines. Positionally pair a current delete/current insert; if their decoded
   content is unexpectedly equal, restore them to equal without a character diff. Otherwise produce `modify` rows and
   side-specific character arrays.
9. Pad every unpaired delete or insert with a placeholder on the other side.
10. Return `success` with aligned lines, trailing-LF flags, and any JSON warnings.

## Migration boundary

After a conforming fork is installed, the intended repository changes are:

- `src/workers/diffWorker.ts` imports `computeDiff` from the fork instead of `src/utils/diffUtils.ts`.
- `App.tsx`, worker protocol files, and UI components import the fork's result/options types (or local aliases re-export
  them without behavior).
- The worker client, message protocol, worker termination, warning-modal copy, and compare rendering stay in this app.
- The following implementation/runtime compatibility files become removable:
  - `src/utils/diffUtils.ts`;
  - `src/utils/lineDiffUtils.ts`;
  - `src/utils/jsonUtils.ts` if JSON support is included in the fork;
  - `src/diff_match_patch.d.ts`;
  - `public/diff_match_patch_uncompressed.js`;
  - `public/vendor_patch.js`; and
  - the `diffRuntimePlugin`, virtual module declaration, and global-assignment rewrite.

Do not move the Web Worker abstraction into the fork unless the fork intentionally wants a browser-only async API. The
diff operation itself is synchronous; this app's worker is what provides responsiveness and hard cancellation.

## Acceptance checklist

Port the focused tests from `src/utils/diffUtils.test.ts`, `src/utils/lineDiffUtils.test.ts`, and
`src/utils/jsonUtils.test.ts`, then run the app's worker and browser tests against the real fork. At minimum, cover:

- raw empty/equal inputs and normalized-equal JSON;
- source-specific JSON errors and warning counts/order;
- recursive key sorting, two-space formatting, and preserved array order;
- unsafe, rounded, overflowing, and underflowing JSON numbers;
- decoded duplicate keys in separate nested object scopes;
- one changed line with character projections under all three cleanup modes;
- `Diff_Timeout = 0` and caller-supplied edit cost behavior;
- appended lines, explicit blank lines, empty-versus-nonempty input, CRLF, and unterminated final lines;
- a trailing-LF-only change represented only in metadata;
- deterministic repeated-line alignment and the containment shortcut;
- frozen `Object.prototype` plus `__proto__`, `constructor`, `toString`, and `hasOwnProperty` lines;
- a changed line after 40,000 unique first-input lines and after 65,535 shared unique lines;
- equal-length aligned output and reconstruction of both effective input texts from the operations; and
- worker execution, termination, invalid worker responses, and the existing text/JSON Playwright flows.

The current unit tests inject a fake character engine in several cases. A fork should add real-engine integration tests
so tuple cleanup behavior and packaging/export mistakes are exercised without the old global runtime.

## Source map

- Application orchestration and result shaping: [`src/utils/diffUtils.ts`](../src/utils/diffUtils.ts)
- Modified line-sequence algorithm: [`src/utils/lineDiffUtils.ts`](../src/utils/lineDiffUtils.ts)
- JSON canonicalization and warning scanner: [`src/utils/jsonUtils.ts`](../src/utils/jsonUtils.ts)
- Result types: [`src/types/diff.ts`](../src/types/diff.ts)
- Vendored upstream JavaScript: [`public/diff_match_patch_uncompressed.js`](../public/diff_match_patch_uncompressed.js)
- Legacy line-key compatibility shim: [`public/vendor_patch.js`](../public/vendor_patch.js)
- Runtime packaging/global bridge: [`vite.config.ts`](../vite.config.ts)
- Worker boundary: [`src/workers/diffWorker.ts`](../src/workers/diffWorker.ts) and
  [`src/workers/diffWorkerClient.ts`](../src/workers/diffWorkerClient.ts)
- Rendering assumptions: [`src/components/CompareDisplay.tsx`](../src/components/CompareDisplay.tsx)
- Primary focused tests: [`src/utils/diffUtils.test.ts`](../src/utils/diffUtils.test.ts),
  [`src/utils/lineDiffUtils.test.ts`](../src/utils/lineDiffUtils.test.ts), and
  [`src/utils/jsonUtils.test.ts`](../src/utils/jsonUtils.test.ts)
- ESM candidate exports: [diff-match-patch-es `src/index.ts`](https://github.com/antfu/diff-match-patch-es/blob/main/src/index.ts)
- ESM candidate line encoder:
  [diff-match-patch-es `src/diff.ts`](https://github.com/antfu/diff-match-patch-es/blob/main/src/diff.ts)

# Sparse shorter-side occurrence index

## Decision

The sparse-match engine now builds its occurrence index over the shorter already-trimmed token range. Equal-length
ranges continue to index `after`, avoiding an orientation change when it cannot reduce the per-position table. Matches
found while indexing `before` are translated back to the original `before` and `after` coordinates before diff tuples
are emitted.

[`createMatchIndex`](../../../src/algorithm/sparse-match.ts) uses one `Uint32Array` entry per indexed position. Its
first pass stores a compact bucket ID in that array; after the number of distinct reflexive tokens is known, heads and
counts are allocated at exactly that distinct-token count and the position array is rewritten into occurrence links.
This changes index storage from three position-sized tables to one position-sized table plus two distinct-token-sized
tables.

The adaptive estimates use the same orientation and compact layout. If `S` is the shorter length, `G` is the longer
length, `U` is the number of distinct indexed tokens, `r` is the matching-pair count, `F` is the LIS frontier capacity,
and `L` is the LCS length, the estimated sparse workspace components are:

```text
4S + 40U + 16r + 12F + 8L bytes
```

Index construction makes two passes over `S`. Adaptive reconstruction makes three passes over `G` when matches exist:
one to count pairs, one for the length-only probe, and one to retain predecessors. A zero-pair range is known to have an
empty LCS, so it skips both later scans and emits the whole-range deletion and insertion directly after selection.

## Correctness and public contract

Swapping which side supplies occurrence buckets transposes the same complete strict-equality match relation. The
Hunt-Szymanski traversal still scans one axis in increasing order and visits indexed occurrences in decreasing order.
Its predecessor chain therefore identifies matches that increase in both original coordinates. If that LCS has length
`L`, emitting the gaps around it costs `N + M - 2L`, which is a shortest insertion/deletion script.

The public API deliberately makes no tuple-placement promise for ambiguous inputs. Every algorithm choice returns a
normalized shortest script, but the matching tokens and tuple positions chosen among equally short scripts may differ
between algorithms or implementation versions.

## Focused result

The original review measured disjoint numeric ranges of 128 and 500,000 tokens in fresh Node.js processes. The
post-change check used the same range construction on Node.js 24.19.0, Linux 7.0.0 on x86-64, and an Intel N95. It ran
`npm run build`, then three fresh sequential `node --input-type=module -e` processes per cell against
`dist/esm/algorithm/myers.js`; the table reports the median elapsed time. Input construction and module import were
outside the timer. A constructor proxy counted requested `Uint32Array` bytes. Every result was normalized, reconstructed
both inputs, and had the disjoint oracle's shortest edit cost of 500,128.

| Algorithm  | Range order      | Review time (ms) | New median (ms) | Review `Uint32Array` bytes | New bytes |
| ---------- | ---------------- | ---------------: | --------------: | -------------------------: | --------: |
| `sparse`   | 128 then 500,000 |            105.4 |           15.96 |                  6,000,512 |     2,048 |
| `sparse`   | 500,000 then 128 |             30.2 |           15.95 |                      2,048 |     2,048 |
| `adaptive` | 128 then 500,000 |             92.5 |           16.34 |                          - |     2,048 |
| `adaptive` | 500,000 then 128 |             41.2 |           16.12 |                          - |     2,048 |

For forced sparse mode, the review reported 96,968 KiB versus 61,816 KiB maximum RSS depending on direction. The new
three-process medians were 60,416 KiB and 60,412 KiB. Maximum RSS includes the runtime, module, inputs, and outputs, so
the typed-array request counts isolate the index-layout change more directly. These focused measurements demonstrate the
removed directionality; they are not machine-independent performance guarantees.

## Validation

[`sparse-match.test.ts`](../../../src/algorithm/sparse-match.test.ts) now directly exercises translated nonzero-offset
matches and instruments both unbalanced orientations. For a repetitive 128-token short side with two distinct values
against 4,096 disjoint tokens, both adaptive and forced sparse allocate one 128-entry occurrence table and two two-entry
bucket tables. The existing exhaustive duplicate-heavy and deterministic mixed-token cases continue to check
normalization, strict equality, reconstruction, and shortest edit cost across all algorithm choices.

A separate deterministic differential check generated 50,000 forced-sparse pairs up to 30 tokens per side from a
seven-token alphabet. Every result was normalized, reconstructed both inputs, and matched a dynamic-programming LCS
oracle's shortest edit cost.

The focused validation commands were:

```bash
npx vitest run src/algorithm/myers.test.ts src/algorithm/myers-workspace.test.ts src/algorithm/sparse-match.test.ts
npx tsc --project tsconfig.test.json --noEmit
npm run benchmark:typecheck
npx vitest bench --run --no-file-parallelism test/benchmark/diff-lines.adversarial.bench.ts
npm run verify
```

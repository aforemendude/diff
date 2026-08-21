# Cleanup worklists: implemented

Status: implemented on 2026-08-21.

## Decision

Use a call-local indexed worklist for structural cleanup rewrites. The implementation removes middle-array splices,
whole-list merge restarts, and node-by-node equality backtracking while preserving the exact output selected by the
former algorithms.

The representation stays lazy for the important no- and few-edit paths.
[`CleanupWorklist`](../../../src/cleanup/common.ts) initially owns the same dense normalized tuple array that cleanup
already needed. It allocates links only when a shift or equality elimination actually changes the structure. Calls with
no rewrite return that owned dense storage directly.

## Implementation

### Dense storage with lazy stable IDs

Each normalized tuple's initial array index is its stable node ID. A removed node becomes `undefined`, and IDs are never
reused during the call. Once a structural rewrite fires, one `Int32Array` stores interleaved previous and next IDs with
`-1` as the missing-node sentinel.

The first removal reserves exactly one link pair per initial node. The first insertion reserves twice the current node
count, which covers equality replacement chains without the object overhead of one linked node per tuple. Equality
candidate stacks retain integer IDs, so removed tuples and token arrays are not retained by stale references.

### Initial normalization

[`mergeEditBlocks`](../../../src/cleanup/common.ts) still drops empty entries, coalesces operations, canonicalizes mixed
edit runs as deletion then insertion, and factors non-overlapping common prefixes and suffixes. Mixed blocks now retain
small arrays of source-chunk references while comparing and materializing ranges. They do not first flatten every
deletion and insertion into large temporary token arrays.

Homogeneous blocks retain a direct chunk-copy path and allocate a chunk list only for their one operation. Each
surviving token is copied into owned output storage once during the initial normalization.

### Local merge shifts

[`CleanupWorklist.cleanupShifts`](../../../src/cleanup/common.ts) scans edit nodes from left to right and preserves the
former left-rule-before-right-rule choice. A shift updates two nodes, unlinks the consumed equality in constant
structural time, and normalizes only the maximal edit block joined by that shift.

Token rotation uses the exclusively owned arrays in place. The right rule moves the matching prefix to the end; the left
rule moves the matching suffix to the beginning and exchanges the rotated edit and grown equality payloads. The
implementation uses explicit loops for copied ranges so large token arrays do not encounter function argument limits.

After local factoring, scanning resumes at the first edit in the affected region. Factoring can only grow its bounding
equalities. Growing a candidate's neighboring equality cannot make a previously failing prefix or suffix comparison
succeed: a matching larger prefix or suffix implies that its former smaller part already matched. Nodes strictly to the
left therefore remain stable, and the local resume selects the same next rewrite as a whole-list restart.

### Equality elimination

[`eliminateSemanticEqualities`](../../../src/cleanup/semantic.ts) and
[`eliminateEfficiencyEqualities`](../../../src/cleanup/efficiency.ts) rewrite an equality node as a deletion and insert
one adjacent insertion with a distinct copy of the payload. They do not normalize while deciding which equalities to
remove.

Both passes aggregate the consecutive edit run on either side of each equality:

- semantic cleanup retains deletion and insertion token counts; and
- efficiency cleanup retains a two-bit mask of the edit kinds present.

Those measures are monotonic as an edit run is scanned. Testing at the end of a run therefore selects the same equality
as testing after every edit node. When an equality is removed, its two edit contributions and both surrounding runs are
combined on the candidate stack. An earlier candidate can then be reconsidered without traversing the growing edit run
again. This preserves the former backtracking decisions while removing their repeated node scans.

After all decisions, only blocks containing changed node IDs are normalized. The shared local merge-shift pass then runs
once, and the list is flattened to the public tuple array once.

## Correctness validation

The committed tests include:

- 6,000 deterministic generated diffs comparing local merge scheduling with the former whole-array restart engine;
- 4,000 deterministic generated normalized diffs comparing both equality worklists with test-local array-splice
  reference passes, before and after merge normalization;
- explicit cases for left-before-right ties, complete edit-block cancellation, local factoring that creates another
  shift candidate, and prefix/suffix factoring across differently split chunks; and
- the existing ownership, frozen-input, reconstruction, Unicode grapheme, locale, overlap, and semantic-placement tests.

During development, the compiled implementation was also compared with the pre-change revision over 200,000 seeded
arbitrary diffs. Inputs included empty entries, adjacent operations, repeated tokens, and nine efficiency edit costs.
Both public cleanup functions produced exact tuple-and-token output matches in every case.

## Measurement method

The baseline revision and worklist implementation were compiled separately and loaded into one Node.js process. Fixture
construction was outside timed regions. Each case received five warmup calls, followed by seven or nine samples; each
sample used a fixed iteration count appropriate to its duration. The table reports median milliseconds per call.

- Node.js 24.19.0.
- Linux x86-64 on an Intel N95.
- Cleanup-only inputs, with tokenization and Myers diff computation excluded.
- Lower is better. A negative change means the worklist was faster.

The repository now retains geometric cleanup-only cases in
[`cleanup-worklist.adversarial.bench.ts`](../../../test/benchmark/cleanup-worklist.adversarial.bench.ts). The existing
cases cover low-edit guardrails, stable and shiftable merge chains, equality elimination, and an alternating efficiency
backtracking cascade. The existing composed benchmarks remain useful end-to-end checks, but diff computation dominates
them and can hide cleanup scaling.

## Timing results

### Low- and few-edit guardrails

| Workload                              | Baseline | Worklist | Change |
| ------------------------------------- | -------: | -------: | -----: |
| One equality, 100,000 tokens          | 0.357 ms | 0.359 ms |  +0.3% |
| One replacement among 100,000 tokens  | 0.396 ms | 0.391 ms |  -1.4% |
| 1,600 stable merge groups, many edits | 0.457 ms | 0.464 ms |  +1.7% |

The dense-array fast path kept the requested no- and few-edit cases effectively flat. Even the many-edit stable chain
had only a small change in this run.

### Merge shifts

| Workload               |   Baseline | Worklist | Change |
| ---------------------- | ---------: | -------: | -----: |
| 1,600 shiftable groups | 747.356 ms | 1.785 ms | -99.8% |

The old whole-list restart made the chain quadratic. The local worklist completed the same exact rewrites about 419
times faster in this measurement.

### Equality elimination

| Groups | Efficiency baseline | Efficiency worklist | Semantic baseline | Semantic worklist |
| -----: | ------------------: | ------------------: | ----------------: | ----------------: |
|    250 |            0.381 ms |            0.511 ms |          5.819 ms |          0.484 ms |
|    500 |            0.906 ms |            0.899 ms |         25.460 ms |          1.032 ms |
|  1,000 |            3.003 ms |            1.844 ms |         88.876 ms |          1.413 ms |
|  2,000 |           11.633 ms |            4.828 ms |        393.350 ms |          3.214 ms |
|  4,000 |           52.314 ms |           14.536 ms |      3,042.975 ms |          8.214 ms |

The smallest efficiency stress case regressed by 0.130 ms, but the crossover occurred by 500 groups and the 4,000 group
case improved by 72.2%. Aggregated edit runs removed the semantic pass's repeated backtracking traversal; its 4,000
group case improved by 99.7%.

## Allocation behavior

The lazy representation allocates no link table when no structural rewrite fires. With `K` nodes:

- a first removal allocates `2 * K` 32-bit link cells, or `8 * K` bytes;
- a first insertion reserves `4 * K` cells, or `16 * K` bytes; and
- the 24,600-node efficiency chain therefore reserves 393,600 bytes of link storage.

Removed entry slots are set to `undefined`, releasing their tuple and token-array references. Nodes used by local block
normalization are rewritten in place when possible. Shift rotation does not allocate replacement token arrays, and
mixed-block chunk views avoid deletion/insertion accumulators proportional to total token count.

These byte counts cover the deterministic typed link table, not JavaScript array headers, tuples, token strings, or
engine-specific allocator overhead.

## Remaining limits

Structural array movement and repeated equality-run traversal are removed, but no strict near-linear bound is claimed
for every token workload. A repeatedly compared growing equality or repeated factoring of long token arrays can still
revisit token values. Cached hashes, longest-common-prefix data, or rope payloads would add complexity and are not
justified by the measured workloads.

The measurements cover one Node.js/V8 environment. No browser engine was available, so the benchmark results are not a
claim about Firefox, Safari, or other JavaScript engines. The implementation retains browser-compatible JavaScript and
does not import Node.js APIs.

# Optimization: local cleanup rewrites with a worklist

## Summary

The cleanup algorithms repeatedly insert/remove entries in the middle of JavaScript arrays, backtrack, and sometimes
rebuild the entire diff after one local shift. On rewrite-heavy inputs, those operations turn otherwise local cleanup
rules into quadratic work.

Represent the mutable phase as linked nodes (or an equivalent indexed worklist), apply each rewrite only to its local
neighbors, and flatten to the public tuple-array format once. This can serve `cleanupMerge` and both trivial-equality
passes while preserving the current rewrite rules.

## Evidence

The exploratory timings below were collected on Node.js 24.18.0 and are intended to show scaling, not portable latency.

The costly restart is explicit in [`cleanupMerge`](../../../src/cleanup/common.ts): it scans until the first shift, uses
`splice`, then calls `mergeEditBlocks` over the whole diff and restarts. A contract-valid shiftable-chain benchmark
repeated `[EQUAL, ['a']], [INSERT, ['x', 'a']], [EQUAL, ['c']]`, with `[DELETE, ['z']]` between groups. It observed:

| Shiftable groups | Time     |
| ---------------- | -------- |
| 100              | 15.8 ms  |
| 200              | 20.0 ms  |
| 400              | 60.8 ms  |
| 800              | 242.9 ms |
| 1,600            | 886.9 ms |

The roughly fourfold time increase over the larger doublings is characteristic of quadratic behavior.

The `eliminateTrivialEqualities` functions in [`semantic.ts`](../../../src/cleanup/semantic.ts) and
[`efficiency.ts`](../../../src/cleanup/efficiency.ts) also call `splice` and reset their scan to an earlier candidate.
Array splices shift every later tuple, and numeric indices saved on the equality stack become another source of
bookkeeping.

A second contract-valid stress pattern repeats deletion `d`, insertion `i`, equality `x`, deletion `r`, insertion `s`,
and equality `Q`, with one grapheme per token. At 250, 500, 1,000, 2,000, and 4,000 groups, semantic cleanup took about
10.8, 21.4, 68.8, 253, and 1,736 ms; efficiency cleanup took about 1.0, 1.5, 2.6, 9.1, and 36.8 ms. The difference
reflects their distinct backtracking rules, but both eventually expose array-shift costs.

## Proposed representation

Use call-local nodes:

```typescript
interface DiffNode {
  operation: DiffOperation;
  tokens: string[]; // A span/chunk payload is an optional later refinement.
  previous?: DiffNode;
  next?: DiffNode;
  queued: boolean;
  live: boolean;
}
```

The list owns its token arrays, satisfying the public no-alias guarantee. A small queue contains nodes whose local
neighborhood may now match a cleanup rule. Removing or inserting a node updates a constant number of links. Queue
entries for removed nodes are ignored through `live`; `queued` prevents unbounded duplicate queue entries.

## Phase 1: normalize and factor edit blocks

Build the list in one input pass:

- drop empty entries;
- coalesce adjacent entries with the same operation;
- gather each deletion/insertion run;
- factor its common prefix and suffix;
- emit only nonempty nodes.

This subsumes the current `prepare` pass and the first `mergeEditBlocks` pass. Aim to copy each input token into owned
storage once by accumulating chunks or source spans and materializing the factored nodes directly. If the first version
uses flat arrays, measure its extra copies rather than assuming the structural worklist removes them.

## Phase 2: process merge shifts locally

Queue every edit node with equality neighbors. For a queued node, apply the same two rules currently used by
`cleanupMerge`:

1. if the edit ends with the left equality, rotate that equality to the end and merge the two equality nodes;
2. otherwise, if the edit starts with the right equality, rotate it to the beginning and merge the equalities.

After a rewrite, coalesce and refactor only the maximal affected edit block and its immediate neighbors, then resume at
the leftmost changed predecessor. Nodes strictly to its left were already stable. Do not rescan unrelated blocks.

The current implementation always performs the left rule before the right rule and restarts from the beginning after a
shift. To preserve its exact chosen output, processing must remain stable from left to right and a newly affected
earlier node must run before later work. Prove the leftmost-changed-predecessor invariant with differential tests before
replacing the restart.

## Phase 3: eliminate trivial equalities

Replace the stacks of numeric array indices with stacks of equality-node references. When an equality is converted to a
deletion plus insertion:

- rewrite the equality node in place as the deletion;
- insert the new insertion node next to it in `O(1)`;
- discard stale candidate references by checking `live`;
- resume from the same predecessor node selected by today's algorithm.

The semantic pass keeps edit lengths around the candidate; the efficiency pass keeps four surrounding edit-kind flags.
Those state machines do not need to change. Only their cursor and candidate storage change.

Do not normalize locally between equality-elimination decisions: the current algorithms wait until the elimination pass
finishes, and early merging could change later decisions. After the whole pass, run the shared local merge normalizer,
starting with neighborhoods affected by replacements.

## Complexity

Let `K` be the number of diff entries and `T` the total number of tokens. Array middle edits and whole-list rebuilds can
currently make a chain of `R` rewrites cost `O(R(K + T))` plus token copies.

With linked nodes, structural rewrites are `O(1)` and unrelated tuples no longer move or get rescanned. The total bound
still depends on token work: rotations and merges copy tokens, while every eligibility check can compare an edit against
one of its neighboring equalities. A growing equality or repeatedly tested long prefix/suffix can therefore still be
visited many times.

Do not claim a strict near-linear bound until both token movement and repeated `startsWith`/`endsWith` comparisons are
amortized. A rope/token-span representation plus cached hashes or LCP data is a possible second step if profiling shows
those costs after structural splices are removed.

## Risks

- Rewrite order affects which valid normalized cleanup is selected. Preserve left-before-right rules and deterministic
  left-to-right scheduling unless an intentional output change is accepted.
- Node references retained by candidate stacks must not keep removed token arrays alive longer than the call.
- A linked object per tuple has overhead on small inputs. A parallel-array node pool (`operation[]`, `tokens[]`,
  `previous[]`, `next[]`) may be faster but is harder to read.
- Cleanup output must remain freshly owned even when no rule fires.
- The semantic cleanup is documented as non-idempotent; this optimization must not assume a fixed point beyond the phase
  that currently iterates to one.

## Validation

Keep all current exact cleanup examples, frozen-input ownership tests, generated reconstruction properties, repeated
semantic cleanup, and locale behavior. Add differential tests that run the old and new engines over thousands of small
generated diffs and compare exact output while the implementation is being developed.

Benchmark at geometric sizes:

- long chains where every merge shift fires;
- long chains where no shift fires;
- equality eliminations that repeatedly backtrack;
- large token arrays in a few nodes;
- many one-token nodes;
- the existing 1,200-group efficiency and 2,000-edit semantic workloads.

Record token copies or allocated bytes if possible, not only wall time.

## Rollout

Introduce the node-list helper behind `cleanupMerge` first and compare exact output with the current function. Once that
is stable, migrate the semantic and efficiency candidate stacks separately. This keeps regressions attributable and
allows each phase to be benchmarked on its own.

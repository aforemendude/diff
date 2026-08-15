# Optimization: adaptive disjoint-token bailout

## Review result

On hold. Completely disjoint inputs are expected to be too uncommon in representative workloads to justify the added
proof pass and tuning complexity at this time.

## Summary

Before running Myers bisection on a difficult range, prove whether the two ranges share any token. If they are disjoint,
the only shortest edit cost is to delete the entire old range and insert the entire new range, so the quadratic search
can be skipped.

This is high value but not a trivial unconditional `Set` conversion: the proof itself costs `O(N + M)`, most real diffs
do share tokens, and the generic core compares with `===` rather than the `Set` equality rule.

## Evidence

The exploratory measurements below were collected on Node.js 24.18.0 and should be treated as relative signals.

The existing unrelated-line benchmarks exercise [`diffTokens`](../../../src/algorithm/myers.ts) with no possible snake.
One baseline run on this workspace measured:

| Tokens per side | Mean time | Growth |
| --------------- | --------- | ------ |
| 400             | 4.97 ms   | -      |
| 800             | 18.85 ms  | 3.79x  |

Doubling the input produces nearly four times the work, which is the expected worst case. The 1,500-grapheme disjoint
case took 62.32 ms in the same run. A disjointness proof would make these cases linear.

## Proposed design

Add a helper over the already prefix/suffix-trimmed ranges:

```text
haveCommonToken(shortRange, longRange):
  build an exact-membership set from shortRange
  scan longRange
  return true at the first shared token
  return false if the scan finishes
```

When it returns false, emit one deletion and one insertion and stop processing that range. Run this before allocating
the large bisection frontiers, but only when an adaptive gate says the proof is likely to repay its cost.

A practical gate has two stages:

1. Put a small, evenly distributed sample from the shorter range in a set and scan the longer range. A hit means the
   full proof would fail, so proceed directly to Myers.
2. Only after the sample has no hit, build the complete set and perform the exact proof.

The sample can produce false suspicion but never a false bailout. Correctness depends only on the complete second stage.
Start with a fixed sample size such as 32 or 64 and tune it with mixed workloads rather than intuition.

## Equality detail

`diffTokens<T>` uses `===`. `Set` uses SameValueZero, whose only relevant difference is `NaN`: a set treats `NaN` as
equal to itself while `NaN === NaN` is false. Public line and grapheme tokens are strings, but the generic core is
tested with other token types.

Either:

- keep the optimization in a string-specialized path; or
- skip `NaN` values while building and probing the set so membership exactly matches `===`.

Object identity, strings, numbers other than `NaN`, symbols, `null`, and `undefined` already agree.

## Correctness argument

After common prefixes and suffixes have been removed, suppose the remaining ranges share no equal token. Their longest
common subsequence has length zero. The shortest insertion/deletion edit cost is therefore `beforeLength + afterLength`.
Emitting the whole deletion and insertion has exactly that cost and reconstructs both token streams. The operation order
is already an allowed implementation choice.

This preserves the repository's shortest-edit-script guarantee; it is not a heuristic diff.

## Costs and risks

- A full set can add substantial temporary memory on large ranges.
- A failed proof adds a linear pass before Myers. Sampling is intended to avoid that on ordinary sparse diffs.
- Running the proof independently in every child range can repeat work. Initially restrict it to the root trimmed range,
  or pass a per-call token index into child tasks.
- Repetitive alphabets make sampling return quickly and cheaply; unique sparse-edit files need benchmark coverage
  because the first sampled match may be far into the scan.

## Validation

Add the following benchmark families at 2x sizes and report both time and peak memory:

- fully disjoint unique lines and graphemes;
- sparse edits in mostly equal unique lines;
- one shared token near the start, middle, and end;
- small repetitive alphabets;
- highly unbalanced ranges;
- generic arrays containing objects and `NaN`.

For tests, retain exhaustive shortest-cost comparison with the LCS oracle, add disjoint inputs for every supported token
kind, and verify normalized reconstruction rather than a particular deletion/insertion alignment.

## Rollout

Implement the exact helper first with an explicit size threshold, benchmark it, then add sampling only if failed-proof
overhead is material. Keep the threshold and sample size private so they can change without becoming API commitments.

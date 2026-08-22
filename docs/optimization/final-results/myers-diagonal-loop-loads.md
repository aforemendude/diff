# Myers diagonal-loop load reduction: benchmarked and rejected

Status: do not reapply without new measurements. Reverted on 2026-08-14 because it did not produce a repeatable
performance benefit.

## Decision

Keep the repeated-read recurrence in `bisect` in [`myers.ts`](../../../src/algorithm/myers.ts) unless a current
benchmark demonstrates a benefit. The source-level load reduction did not translate into a repeatable runtime
improvement. The benchmarks establish no demonstrated benefit; they do not establish the compiler-level cause. One
plausible explanation is that V8 already optimized the small helper effectively while the rewritten control flow changed
optimization behavior, but confirming that explanation would require optimized-code or compiler-trace inspection.

The measured implementation used input-sized `Float64Array` frontiers and a `vectorValue` decoder. The current
implementation instead uses demand-sized, reusable `Uint32Array` frontiers and a `frontierValue` decoder, while
retaining the same repeated-read control-flow shape. The historical results therefore explain why the source rewrite was
reverted, but they do not measure the transformation against the current frontier representation.

## Prototypes

### Proposed load reduction

At the time of the experiment, the forward and reverse recurrences in `bisect` used `vectorValue` to compare the two
neighboring frontier entries and then called it again to read the selected entry. The proposed optimization was to load
each neighbor into a local once. The recurrence offsets were always in bounds, so these reads also did not need the
helper's out-of-bounds fallback.

Cross-frontier overlap checks were included in the change, but unlike recurrence reads their calculated offsets can be
out of bounds. Those checks tested the offset before reading the opposite frontier.

### Unconditional neighbor loads

The first implementation removed `vectorValue`, loaded both recurrence neighbors before the branch, and reused the
locals. Although this reduced the number of source-level typed-array reads in interior iterations, it added an unused
read on each boundary diagonal. On Node.js 24, that version was roughly 15-16% slower on dense disjoint workloads.

### Boundary-aware loads

The measured final version avoided the extra boundary reads:

- the lowest diagonal loaded only the next neighbor;
- the highest diagonal loaded only the previous neighbor;
- interior diagonals loaded both neighbors once; and
- overlap checks validated the opposite-frontier offset before loading it.

The implementation preserved exact output and passed the complete test suite, but its performance remained dependent on
the workload and V8 version.

## Measurement method

The baseline and candidate were compiled separately and compared with a temporary benchmark harness. Fixtures and
correctness preflights were outside the timed region. Each process warmed every workload for at least 75 ms and then ran
a fixed iteration count calibrated to approximately 250 ms. Baseline and candidate process order alternated.

- Node.js 24.18.0: 12 fresh processes per variant.
- Node.js 20.20.2 and 22.23.2: 10 fresh processes per variant.
- Host: Linux x86-64 on a four-core Intel N95.
- Direct `diffTokens` cases covered geometric disjoint sizes, reversed unique tokens, and sparse edits.
- Public `diffLines` cases paired dense and sparse core workloads with tokenization and output costs.
- Every process checked normalized output and reconstruction before timing.

No browser engine was available in the benchmark environment. Both the original measurements and the follow-up below
predate the current compact frontier workspace.

This investigation was finalized before the workload model and the former source-like representative fixtures were
added. The original measurements therefore did not cover the designated 64-, 96-, and 192-line workloads. A follow-up
review reconstructed the boundary-aware candidate and measured those fixtures separately.

## Timing results

### Follow-up representative workloads

The follow-up used Node.js 24.19.0 on Linux x86-64 with an AMD EPYC processor and eight fresh processes per variant.
Lower is better, and a positive change means the candidate was slower.

| Workload                        | Change |
| ------------------------------- | -----: |
| 64 LF lines, cost 2, 1 hunk     |  -2.5% |
| 96 LF lines, cost 14, 3 hunks   | +11.5% |
| 192 LF lines, cost 46, 8 hunks  |  -2.8% |
| 96 CRLF lines, cost 14, 3 hunks |  +0.3% |
| Public sparse, 8,192 lines      |  +1.1% |

The small mixed effects support rejection because they do not demonstrate a consistent benefit. On the follow-up host,
the public disjoint 512-line case was effectively flat rather than reproducing the Intel N95 regression below. That
difference further shows that the exact effect is host-dependent.

### Original Node.js 24 results

The following table shows the final boundary-aware version on Node.js 24.18.0. Times are median milliseconds with
`[p25-p75]`; lower is better. A positive change means the candidate was slower.

| Workload                    |              Baseline |             Candidate | Change |
| --------------------------- | --------------------: | --------------------: | -----: |
| Direct disjoint, 128 tokens | 0.228 `[0.228-0.229]` | 0.243 `[0.243-0.243]` |  +6.3% |
| Direct disjoint, 256 tokens | 0.891 `[0.886-0.893]` | 0.950 `[0.825-0.951]` |  +6.6% |
| Direct disjoint, 512 tokens | 3.447 `[3.326-3.452]` | 3.692 `[3.120-3.702]` |  +7.1% |
| Direct reversed, 512 tokens | 5.012 `[4.223-5.917]` | 4.404 `[4.381-4.753]` | -12.1% |
| Direct sparse, 8,192 tokens | 0.413 `[0.411-0.426]` | 0.441 `[0.439-0.443]` |  +6.7% |
| Public disjoint, 512 lines  | 3.519 `[3.517-3.522]` | 3.762 `[3.757-3.765]` |  +6.9% |
| Public sparse, 8,192 lines  | 1.855 `[1.837-1.868]` | 1.880 `[1.876-1.892]` |  +1.3% |

The direct 256-token, direct 512-token, and reversed-token results showed tiering or bimodal distributions. Their raw
median changes therefore should not be generalized. The public disjoint workload had a tight distribution and regressed
on every tested Node.js release, while the sparse public workload was effectively flat.

### Runtime consistency

Median changes across runtimes further demonstrate the inconsistency:

| Workload                    | Node.js 20.20.2 | Node.js 22.23.2 | Node.js 24.18.0 |
| --------------------------- | --------------: | --------------: | --------------: |
| Direct disjoint, 128 tokens |           +6.2% |           +7.2% |           +6.3% |
| Direct disjoint, 256 tokens |           +5.3% |           +6.8% |           +6.6% |
| Direct disjoint, 512 tokens |           -5.7% |           -6.7% |           +7.1% |
| Direct reversed, 512 tokens |           +1.3% |           +4.2% |          -12.1% |
| Direct sparse, 8,192 tokens |          -0.05% |           +5.9% |           +6.7% |
| Public disjoint, 512 lines  |           +5.6% |           +7.0% |           +6.9% |
| Public sparse, 8,192 lines  |           -0.4% |           -0.9% |           +1.3% |

## Interpretation

The source rewrite reduced explicit typed-array loads in interior iterations, but that source-level count was not a
reliable proxy for generated-code performance. Avoiding the boundary reads reduced the first prototype's dense-workload
regression, yet the final candidate still depended on workload, V8 version, and tiering behavior. In particular, its
tightly distributed public disjoint result regressed on every tested Node.js release, while isolated apparent wins came
from distributions that should not be generalized.

The measurements justify the conservative decision for the tested Node.js environments, but neither benchmark
establishes universal behavior in Firefox or WebKit.

## Reproducibility limit

The repository does not retain the temporary candidate implementations, benchmark harnesses, raw per-process
measurements, or exact former diagnostic fixture definitions used for the original investigation and follow-up. The
current production code and benchmark suites have also changed since those measurements. The reported values therefore
cannot be reproduced exactly from the working tree. Any revisit should preserve all of those artifacts with the
investigation before replacing or extending these results.

## Revisit criteria

Revisit this idea only by rebuilding the candidate against the current compact frontier workspace and demonstrating a
consistent end-to-end benefit across supported Node.js releases and representative browser engines.

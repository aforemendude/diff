# Attempted Myers diagonal-loop load reduction

Status: reverted on 2026-08-14 because it did not produce a repeatable performance benefit.

## Rationale

The forward and reverse recurrences in [`bisect`](../../src/algorithm/myers.ts) used `vectorValue` to compare the two
neighboring frontier entries and then called it again to read the selected entry. The proposed optimization was to load
each neighbor into a local once. The recurrence offsets are always in bounds, so these reads also did not need the
helper's out-of-bounds fallback.

Cross-frontier overlap checks were included in the change, but unlike recurrence reads their calculated offsets can be
out of bounds. Those checks tested the offset before reading the opposite frontier.

## Attempted implementation

The first implementation removed `vectorValue`, loaded both recurrence neighbors before the branch, and reused the
locals. Although this reduced the number of source-level typed-array reads in interior iterations, it added an unused
read on each boundary diagonal. On Node.js 24, that version was roughly 15-16% slower on dense disjoint workloads.

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

No browser engine was available in the benchmark environment.

## Results

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

## Decision

The source-level load reduction did not translate into a repeatable runtime improvement. The measurements suggest that
V8 already optimized the small helper effectively, while the rewritten control flow changed optimization behavior enough
to produce regressions and unstable results. The original implementation was restored. This idea should remain rejected
unless a future engine or a browser benchmark demonstrates a consistent benefit.

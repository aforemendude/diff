# Numeric encoding for line diffs: benchmarked and rejected

Status: do not implement. Benchmarked on 2026-08-15.

## Decision

Keep [`diffLines`](../../../src/diff/line.ts) on direct string tokens. Numeric IDs help dense, high-edit-distance
inputs, but they fail to improve the representative sparse and localized line workloads. They also introduce substantial
regressions in several scale and edge families.

The current [workload model](../../benchmark-input-distribution.md) does not establish frequencies for equal, one-sided,
repetitive, disjoint, reversed, or shifted inputs. Those cases remain useful scale, edge, and adversarial guardrails,
but they are not evidence about which line diffs are more common. Requiring no material regression across those families
is a project policy, not a frequency-weighted conclusion from the empirical distribution.

Token count and source character count cannot distinguish the workloads that benefit from those that regress. Sampling
did not reliably distinguish replacements from shifts, and an adaptive Myers-work counter added measurable overhead to
the cases that should remain direct.

The only current selection rule that satisfies the no-regression requirement is therefore to never encode. The earlier
proposal to add a token-count threshold should not proceed.

## Prototypes

The benchmark compared three end-to-end implementations. Every timed call included line tokenization and output
materialization.

- **Direct strings:** tokenize both sources and call [`diffTokens`](../../../src/algorithm/myers.ts), matching the
  current default implementation.
- **Full numeric IDs:** assign IDs with one shared `Map<string, number>`, diff ordinary number arrays, and decode the
  owned result arrays in place. In-place decoding gives encoding the favorable case by avoiding another set of output
  arrays and tuples.
- **Boundary-trimmed IDs:** scan the maximal common prefix and suffix after tokenization, return trivial equal or
  one-sided interiors directly, and encode only the remaining interior.

The ID map retained the first exact string value seen for each ID. All prototype results were differentially compared
with the direct result before timing. The equality relation and Myers tie-breaking were preserved exactly.

IDs were ordinary JavaScript numbers. A 16-bit representation remains invalid because the public behavior supports more
than 65,535 unique lines.

## Measurement method

The original measurements used Node.js 20.20.2, 22.23.2, and 24.18.0 on Linux x86-64 with a four-core Intel N95. For
each runtime and variant:

- eight fresh processes were measured and variant order alternated;
- deterministic fixture construction and correctness preflights were outside the timed region;
- every workload warmed for at least 75 ms;
- fixed iteration counts were calibrated to approximately 180 ms per measured workload; and
- reported times are median milliseconds with `[p25-p75]`.

The workloads covered unique and repetitive sparse edits, equal inputs, one-sided inputs, one isolated replacement,
small and large rotations, geometric replacement densities, disjoint lines, reversed unique lines, and 24- and
128-character lines. Additional disjoint cases used 512-character lines. No browser runtime was available, so the result
is not evidence for adopting a Node-only heuristic in the browser-compatible library.

The existing `optimizeTrivialCases` source shortcuts were not part of the encoding comparison. A real encoding pipeline
would run after those shortcuts, so enabling the option would continue to bypass encoding for equal, one-sided, and
single-terminal-delimiter inputs. The default path still needs to handle those inputs without a regression.

This investigation was finalized before the workload model and the representative fixtures in
[`public-api.bench.ts`](../../../test/benchmark/public-api.bench.ts) were added. The original measurements therefore did
not cover the designated 64-, 96-, and 192-line representative workloads. A follow-up review reconstructed the full-ID
and boundary-trimmed prototypes and measured those fixtures separately.

## Timing results

### Follow-up representative workloads

The follow-up used Node.js 24.19.0 on Linux x86-64 with an AMD EPYC processor and eight fresh processes per variant.
Only relative changes were supplied. A positive change means the prototype was slower than direct strings.

| Workload                        | Full IDs | Trimmed IDs |
| ------------------------------- | -------: | ----------: |
| 64 LF lines, cost 2, 1 hunk     |  +229.0% |      +10.5% |
| 96 LF lines, cost 14, 3 hunks   |   +53.7% |      +27.7% |
| 192 LF lines, cost 46, 8 hunks  |    +3.0% |       +1.2% |
| 96 CRLF lines, cost 14, 3 hunks |   +41.0% |      +25.3% |
| 1,000 LF lines, cost 14         |   +78.1% |      +53.3% |
| 1,000 LF lines, cost 46         |    +9.0% |      +12.3% |

The representative center either regressed or was effectively flat. A separate dense 1,000-line replacement stress case
made full encoding approximately 26.5% faster, but that edit density is outside the documented ordinary range. These
results reinforce the decision: input size alone cannot select the dense cases without also selecting sparse and
localized cases that do not benefit.

### Original Node.js 24 results

Lower is better. A positive change means the prototype was slower than direct strings.

| Workload                            |           Direct strings |                           Full IDs |                        Trimmed IDs |
| ----------------------------------- | -----------------------: | ---------------------------------: | ---------------------------------: |
| Sparse unique, 1,000 x 24           |    0.340 `[0.339-0.342]` |     0.421 `[0.412-0.449]` (+24.1%) |     0.400 `[0.396-0.404]` (+17.7%) |
| Sparse unique, 66,000 x 24          | 18.233 `[18.128-18.456]` |  32.557 `[32.262-32.740]` (+78.6%) |  30.227 `[29.993-30.388]` (+65.8%) |
| Sparse unique, 20,000 x 128         |    5.954 `[5.934-6.125]` | 15.247 `[15.097-15.731]` (+156.1%) | 15.041 `[14.375-15.173]` (+152.6%) |
| Repeated sparse, 20,000 x 24        |    6.353 `[6.213-6.383]` |     7.500 `[7.173-7.824]` (+18.0%) |     7.379 `[7.260-7.425]` (+16.2%) |
| Equal, 20,000 x 128                 |    2.209 `[2.203-2.257]` | 15.051 `[15.019-15.065]` (+581.2%) |      2.186 `[2.173-2.216]` (-1.0%) |
| One middle replacement, 66,000 x 24 |    6.715 `[6.648-6.801]` | 32.244 `[32.145-32.370]` (+380.2%) |      6.731 `[6.700-6.772]` (+0.2%) |
| Shift by 1, 5,000 x 24              |    0.931 `[0.927-0.941]` |    1.972 `[1.966-1.980]` (+111.9%) |    1.940 `[1.918-1.977]` (+108.4%) |
| Shift by 256, 5,000 x 24            |    4.024 `[4.009-4.063]` |     2.988 `[2.981-2.992]` (-25.7%) |     2.991 `[2.983-3.008]` (-25.7%) |
| 64 replacements, 1,000 x 24         |    0.897 `[0.893-0.926]` |     0.627 `[0.626-0.633]` (-30.1%) |     0.654 `[0.636-0.678]` (-27.0%) |
| 256 replacements, 1,000 x 24        |    7.208 `[7.170-7.944]` |     2.966 `[2.943-2.973]` (-58.9%) |     2.963 `[2.910-2.993]` (-58.9%) |
| Disjoint, 512 x 24                  | 10.149 `[10.135-10.185]` |     4.346 `[4.345-4.354]` (-57.2%) |     4.349 `[4.346-4.353]` (-57.2%) |
| Reversed, 512 x 24                  | 14.490 `[14.458-14.530]` |     4.328 `[4.324-4.343]` (-70.1%) |     4.321 `[4.318-4.329]` (-70.2%) |

Boundary trimming successfully protects equal inputs and mostly protects a single isolated replacement, but it does not
help sparse edits distributed through a file or a rotation with no aligned prefix or suffix. Those cases still regress
by 16-153% in the table.

### Runtime consistency

The following table reports the full-ID median change from direct strings. The conclusion is consistent across all three
Node.js releases.

| Workload                     | Node.js 20.20.2 | Node.js 22.23.2 | Node.js 24.18.0 |
| ---------------------------- | --------------: | --------------: | --------------: |
| Sparse unique, 1,000 x 24    |          +27.0% |          +22.4% |          +24.1% |
| Sparse unique, 66,000 x 24   |          +77.2% |          +73.1% |          +78.6% |
| Sparse unique, 20,000 x 128  |         +142.5% |         +143.6% |         +156.1% |
| Repeated sparse, 20,000 x 24 |          +21.1% |          +17.7% |          +18.0% |
| Shift by 1, 5,000 x 24       |         +110.4% |         +101.5% |         +111.9% |
| 64 replacements, 1,000 x 24  |          -31.7% |          -31.9% |          -30.1% |
| Disjoint, 512 x 24           |          -57.5% |          -59.5% |          -57.2% |
| Reversed, 512 x 24           |          -71.4% |          -70.1% |          -70.1% |

### Allocation pressure

Eight fresh Node.js 24 processes per case forced garbage collection immediately before one measured call. The table is
the median increase in V8 `heapUsed` from immediately before to immediately after the call, before another collection.
It includes the live result and temporary objects that had not yet been collected, so it is an allocation-pressure
indicator rather than an exact peak.

| Workload                   | Direct strings |  Full IDs | Trimmed IDs |
| -------------------------- | -------------: | --------: | ----------: |
| Sparse unique, 66,000 x 24 |      10.90 MiB | 22.69 MiB |   15.04 MiB |
| Equal, 20,000 x 128        |       1.72 MiB |  4.46 MiB |    1.72 MiB |
| One-sided, 66,000 x 24     |       3.05 MiB |  9.41 MiB |    3.05 MiB |
| Disjoint, 1,024 x 24       |       0.43 MiB |  0.44 MiB |    0.59 MiB |

Full encoding added about 11.8 MiB over direct strings on the large sparse case. Trimming reduced that addition to about
4.1 MiB but did not eliminate it. On the dense case, Myers frontier storage dominated and the encoding allocation was
small relative to the core.

## Heuristics evaluated

### Token and character counts

Total token count, total source character count, and their ratio are all constant-time reads after tokenization. They
are not predictive enough.

The 1,000-line sparse and 64-replacement workloads have effectively the same token and character counts. Full encoding
regressed the sparse workload by 22-27% but improved the replacement workload by 30-32%. Increasing the line length to
128 characters made sparse encoding 143-156% slower because every unique line had to be hashed; line length is a cost
signal for encoding, not evidence that encoding will pay back.

No threshold over these metrics can select one workload without selecting the other.

### Common-boundary trimming

The boundary-trimmed prototype reuses work Myers must otherwise do and avoids mapping large equal outer runs. It is
effective for canonical equality, one-sided inputs, and some isolated interior edits. It is ineffective when edits are
distributed or when a small insertion/deletion shifts the remaining lines.

A one-line rotation has shortest edit cost 2 but no aligned common prefix or suffix. Trimming therefore encoded almost
the whole input and made the call 101-112% slower across runtimes. Boundary size is not a safe proxy for edit distance.

### Fixed sampling

A screening prototype checked 16 fixed positions and, for mismatches, searched a bounded neighboring window for a
consistent shift. The metric has constant bounded work and correctly rejected simple small rotations.

It still had two problems:

- evenly spaced samples completely missed one structured 25% replacement fixture because the edit positions fell between
  probes; changing to deterministic pseudorandom positions fixed that fixture but not the general blind spot;
- the probes and bounded searches added roughly 1-11% to easy sub-millisecond and small-shift calls in screening.

Sampling can create false negatives that lose the dense-input gain and false positives that expose the large sparse or
shift regression. Increasing the sample count reduces neither risk to zero and consumes more of the saving.

### Adaptive Myers work

A second screening prototype counted frontier diagonals inside Myers. It began with strings and restarted on numeric IDs
only after the observed work exceeded:

```text
max(512, totalTokenCount, floor(totalSourceCharacters / 24))
```

It also refused to restart when that budget exceeded 20% of the maximum possible frontier work. The inputs to the budget
are constant-time metrics, and the counter used constant work once per Myers distance.

This was the most accurate selector: easy diffs usually finished directly, while dense replacements and disjoint inputs
switched. It still failed the no-regression requirement. Work accounting and the optional path added roughly 3-9% to
several easy long-line and small-shift calls. A late restart also repeated already completed Myers work; on the 256-line
rotation it recovered only about half of the full-encoding improvement in screening. More aggressive budgets switched
cases where encoding itself was slower.

Continuing the current frontier with a new comparison representation instead of restarting might reduce this cost, but
that is a substantially more invasive Myers design. It is not a cheap gate for this proposal and still needs a way to
pay for hashing before dense work is known.

## Interpretation

Direct Myers is already output-sensitive. Sparse line diffs make approximately linear progress through equal runs, so a
full `Map` pass and two ID arrays add work without removing enough string comparisons. Dense diffs revisit tokens across
many diagonals, so paying the linear encoding cost once makes the much larger comparison phase cheaper.

That distinction is edit structure, not input size. Computing it accurately in advance approaches the work the diff is
about to perform. Cheap approximations are vulnerable to shifts, repeated lines, structured edits, and adversarial probe
placement.

Dense disjoint inputs are better addressed by the exact proof in
[`adaptive-disjoint-bailout.md`](../under-consideration/adaptive-disjoint-bailout.md), which can skip Myers rather than
merely make its comparisons cheaper. Other high-distance unique-token inputs overlap with the selection problem in
[`sparse-match-lcs.md`](../pending-review/sparse-match-lcs.md). Numeric encoding should not be added as an independent
size-based layer while those more targeted approaches are unresolved.

## Reproducibility limit

The current repository contains the production baseline and the current benchmark fixture generators, but it does not
contain the temporary candidate implementations, benchmark harnesses, or raw per-process measurements used for the
original investigation or the follow-up. The reported values therefore cannot be reproduced exactly from the repository
alone. Any revisit should preserve those artifacts with the investigation before replacing or extending these results.

## Revisit criteria

Reconsider numeric line IDs only if all of the following become available:

- a near-zero-overhead signal from work the core already performs;
- a way to switch representations without restarting completed Myers work;
- end-to-end wins on sparse, repetitive, shifted, equal, one-sided, dense, and long-line workloads with no material
  regression on any family;
- acceptable peak memory and garbage-collection behavior; and
- consistent results on supported Node.js releases and representative browser engines.

Until then, preserve the current direct-string implementation and the existing opt-in source shortcuts.

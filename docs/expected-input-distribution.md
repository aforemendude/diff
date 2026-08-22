# Expected Input Distribution for a General-Purpose Diff Tool

For a general-purpose text diff tool, real-world workloads are likely to be **heavily skewed toward small inputs and
small edits**, with a long tail of large files and pathological diffs.

These percentages are best treated as **practical benchmark heuristics**, not as a universal empirical distribution
across every diff application.

## Overall Shape of the Workload

| Dimension                      | Typical distribution                        |
| ------------------------------ | ------------------------------------------- |
| Input size                     | Strongly right-skewed / roughly log-normal  |
| Difference size                | Usually much smaller than total input       |
| Number of edit regions         | Usually few, occasionally many              |
| Similarity                     | Usually high                                |
| Pathological/adversarial cases | Rare, but important to benchmark separately |

## Input Size Distribution

For a tool comparable to jsdiff or diff-match-patch, a reasonable representative mix is:

| Input size per side | Approx. share | Examples                                 |
| ------------------- | ------------: | ---------------------------------------- |
| <1 KB               |        25-35% | Messages, labels, small config fragments |
| 1-10 KB             |        30-35% | Source files, JSON, Markdown             |
| 10-100 KB           |        20-25% | Larger source files, documents, data     |
| 100 KB-1 MB         |         8-15% | Generated files, logs, large JSON        |
| >1 MB               |          1-5% | Large logs, dumps, documents             |

A representative benchmark should **not** give 1 KB, 10 KB, 100 KB, and 1 MB inputs equal weight if the goal is to
estimate normal user-visible performance. Doing so would substantially overweight large inputs.

## Difference Size Distribution

Define the approximate edit ratio as:

```text
edit ratio = amount changed / input size
```

A plausible workload mix is:

| Approx. changed portion |  Share |
| ----------------------- | -----: |
| 0% / identical          | 10-20% |
| <1%                     | 20-30% |
| 1-5%                    | 25-30% |
| 5-20%                   | 15-20% |
| 20-50%                  |  5-10% |
| >50%                    |  5-10% |

This implies that roughly **60-75% of ordinary diffs may involve less than about 10% of the input actually changing**.

This is especially representative of common use cases such as:

- Source-code edits
- Document revisions
- Patch generation
- Incremental synchronization
- Editor changes
- Version-control-like workloads

## Edit Fragmentation Matters

Edit percentage alone does not capture difficulty.

For example, these two cases both change 5 KB of a 100 KB document:

```text
100 KB document
v
5 KB changed in one contiguous location
```

versus:

```text
100 KB document
v
5 KB changed as 1,000 tiny edits scattered throughout
```

The second case may be dramatically harder for Myers-style algorithms and for semantic/cleanup passes.

A useful topology distribution is:

| Edit topology                | Approx. normal-workload share |
| ---------------------------- | ----------------------------: |
| Single localized edit        |                        25-35% |
| 2-10 localized edits         |                        35-45% |
| 10-100 edits                 |                        15-20% |
| Hundreds/thousands of edits  |                         5-10% |
| Near-random/unrelated inputs |                           <5% |

## Common Prefix and Suffix Bias

Real revisions often have large unchanged regions around the modified portion:

```text
AAAAAAAAAAAAAAAAAAAAAAAA
AAAA changed stuff AAAAA
AAAAAAAAAAAAAAAAAAAAAAAA
```

rather than consisting of two independently generated strings.

This matters because many diff implementations quickly strip common prefixes and suffixes, making real workloads much
cheaper than the nominal total input size suggests.

## Suggested Representative Benchmark Distribution

For a benchmark suite with roughly 1,000 representative cases:

### Input size

- **55% small:** 100 B-10 KB
- **30% medium:** 10-100 KB
- **12% large:** 100 KB-1 MB
- **3% very large:** 1-10 MB

Within each range, sample sizes **logarithmically rather than uniformly**.

### Change ratio within each size bucket

- ~15% identical
- ~30% less than 1% changed
- ~25% 1-5% changed
- ~15% 5-20% changed
- ~10% 20-50% changed
- ~5% mostly or completely different

Edit fragmentation should be varied independently from the edit ratio.

## Benchmark Mapping

### `diffLines`

The representative `diffLines` entry point in `test/benchmark/diff-lines.bench.ts` realizes the byte-size model with 100
deterministic ASCII fixtures and a 1,000-call schedule:

- 55 small, 30 medium, 12 large, and 3 very large fixtures;
- logarithmically spaced byte sizes within each input-size bucket;
- 15 identical, 30 less-than-1%, 25 1-5%, 15 5-20%, 10 20-50%, and 5 more-than-50% change-ratio fixtures, allocated
  across the size buckets as closely as the bucket counts allow; and
- independently shuffled fragmentation targets for the 85 changed fixtures: 26 single-edit, 34 six-edit, 17 40-edit, and
  8 100-edit fixtures.

The generator preserves exact input byte sizes and exact representative change ratios. It caps the requested edit-region
count only when the input or change budget cannot contain that many separated line edits. Every generated result passes
normalization, reconstruction, edit-region, and shortest-edit-cost preflight checks outside the timed region.

One measured sample runs ten differently ordered passes over the 100 fixtures. Its 1,000 calls therefore apply the
documented weights instead of giving a small case and a very large case equal influence.

### Grapheme workflows

The representative grapheme entry points use the same 55/30/12/3 fixture weights. Their base ranges are 20-80, 80-160,
160-320, and 320-600 generated prose sentences, sampled logarithmically. Of the 100 fixtures, 15 are identical and
roughly one quarter contain mixed Unicode grapheme clusters. Changed prose has deterministic local word replacements,
insertions, and sentence deletions. Each measured sample again makes ten shuffled passes for exactly 1,000 public calls.

The three workflows use the same distribution shape, with sentence counts scaled independently to keep a measured
schedule near two seconds on the reference machine:

- `diffGraphemes`: 0.92x the base sentence counts;
- `diffGraphemes` followed by `cleanupSemantic`: 0.78x; and
- `diffGraphemes` followed by `cleanupEfficiency`: 0.88x.

Independent scaling keeps each score long enough to measure while preserving a practical default-suite duration. The
four workflows remain separate scores; combining them into one scalar would require an assumption about how often
consumers call each API.

### Adversarial workflows

`npm run benchmark:adversarial` retains four separate calibrated one-call cases: disjoint unique lines, disjoint
graphemes, an insertion with millions of equivalent semantic placements, and thousands of replacements separated by
trivial one-grapheme equalities. It also runs direct public `cleanupSemantic` and `cleanupEfficiency` cases over long
shift chains, chained trivial equalities, low-edit inputs, and efficiency-cleanup backtracking cascades. Eleven public
`diffLines` schedules use geometric sizes for reversed unique, disjoint, 1%, 5%, and 10% shared-pair, duplicate-heavy
low-distance, and unique low-distance inputs, plus adjacent cases on either side of the relative memory and work
crossovers.

Every timed call and correctness preflight supplies all options explicitly while retaining their documented defaults:
`algorithm: 'adaptive'`, `lineEnding: '\n'`, `optimizeTrivialCases: false`, `locale: undefined`, and `editCost: 4` as
applicable. Forced algorithms and non-default options are tested for correctness but are not benchmarked as separate
scores.

The cleanup stress cases target roughly two seconds per measured schedule on the reference machine. The disjoint cases
retain their historically calibrated sizes but now complete in milliseconds under adaptive sparse-match selection. The
additional public diff and cleanup scale cases are intentionally shorter and remain outside `npm run benchmark`.

All representative and adversarial fixtures pass normalization, reconstruction, and any analytically known edit-cost or
edit-region checks before timing. Cleanup preflight also verifies projection preservation for every direct diff fixture
and confirms that each stress family exercises its intended rewrite pattern.

## Use Two Benchmark Categories

It is useful to keep two separate benchmark categories.

### Representative score

Weight heavily toward:

- Small and medium inputs
- Localized modifications
- High similarity
- Few edit regions
- Large common prefixes/suffixes

This score estimates the performance most users are likely to experience.

### Stress score

Deliberately emphasize:

- Large documents
- Highly fragmented edits
- Repeated text
- Low-similarity inputs
- Worst-case Myers inputs
- Enormous common prefixes/suffixes
- Line-mode or tokenization corner cases

This prevents an optimization that makes a rare 10 MB pathological case 2x faster, while making ordinary 5 KB diffs 10%
slower, from appearing to be an overall improvement.

## Most Important Representative Region

For a general-purpose diff library, the highest-weight region for judging optimizations should probably be
approximately:

> **1-100 KB inputs, 0-10% changed, 1-20 edit regions, with substantial common prefix/suffix.**

That region is a useful default when deciding whether an optimization is likely to improve real-world performance
overall.

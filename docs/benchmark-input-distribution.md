# Real-world diff inputs and benchmark policy

## Scope

There is no single input distribution for a "typical diff tool." A version-control system usually compares two versions
of one file, an editor may compare successive snapshots of one document, and an application may call `diffGraphemes` on
a short user-visible string. This package has no usage telemetry that could determine how those use cases are mixed.

The benchmark therefore uses a working model rather than claiming a universal probability distribution:

- The quantitatively anchored center is a per-file source or text comparison from version control and code review.
- Grapheme-level prose is a second workload family, but it is scenario-based because the available studies do not
  establish a representative mix of languages, scripts, combining sequences, and emoji for this package's consumers.
- Large, one-sided, equal, disjoint, reversed, and highly repetitive inputs remain explicit scale or edge cases. They
  are not assigned an invented real-world frequency.

This document records the evidence reviewed on 2026-08-15, the inferences made from it, and how it maps to the
benchmark. The cited measurements describe source files, commits, pull requests, or reviews rather than direct calls to
this library, so the mapping is necessarily approximate.

## Evidence

### Input length

The [DejaVu GitHub corpus study](https://doi.org/10.1145/3133908) analyzed more than 428 million Java, C++, Python, and
JavaScript files from 4.5 million non-fork projects. Its summary of distinct file hashes reports these physical-line
quartiles:

| Language   | 25th percentile | Median | 75th percentile |
| ---------- | --------------: | -----: | --------------: |
| Java       |              34 |     68 |             143 |
| C++        |              44 |     92 |             223 |
| Python     |              24 |     58 |             143 |
| JavaScript |              18 |     48 |             131 |

These figures are for source files in general, not specifically files selected for a diff. They nevertheless put the
center of a per-file line-diff workload in the tens to low hundreds of lines. The much larger means and maxima in the
same study show that file length has a substantial upper tail.

### Change size and concentration

Several independent datasets place most reviewed changes near the small end while retaining a long upper tail:

- A
  [Google study of about 9 million reviewed changes](https://research.google/pubs/modern-code-review-a-case-study-at-google/)
  found that more than 10% changed one source line and the median changed 24 lines. More than 35% modified one file and
  about 90% modified fewer than 10 files.
- A
  [cross-project and cross-company code-review study](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/rigby2013convergent.pdf)
  reports median changes of 11-32 lines for the studied open-source projects, 44 lines for Android and AMD, and 78 lines
  across 5 files for Chrome. The reported distributions put most changes at the small end, with larger changes in the
  tail.
- The [pullreqs dataset](https://azaidman.github.io/publications/gousiosMSR2014a.pdf) contains 336,502 pull requests
  from 865 active Python, Ruby, Java, and Scala projects. A pull request had a median of 10 changed source lines, 2
  touched files, and 1 touched source file. Its 95th percentiles were 846 changed source lines, 32 touched files, and 20
  touched source files. The dataset intentionally selected highly active projects and excludes JavaScript, so those
  values are useful tail anchors rather than a population-wide estimate.

Commit- and patch-level locality data also supports sparse, clustered edits:

- In [What's a Typical Commit?](https://www.cs.kent.edu/~jmaletic/papers/ICPC08.pdf), the 54,536-commit GCC sample had
  25th-percentile, median, and 75th-percentile values of 6, 14, and 46 changed lines and 2, 3, and 8 hunks. Across the
  nine studied open-source projects, about 75% of commits fell into the two smallest categories for file, line, and hunk
  counts.
- The narrower [Defects4J patch study](https://arxiv.org/abs/1801.06393) found a median of 4 changed lines, a 75th
  percentile of 9, and a 95th percentile of 22 across 395 Java bug fixes. Chunk counts were 2, 3, and 8 at the same
  percentiles, and almost 30% of patches contained additions only. This is evidence about bug fixes, not all edits, but
  it reinforces the small, localized center and the need to include insertion-only hunks.

Git can normalize configured text paths to LF in its index while using CRLF in a working tree, as documented by
[Git's `text` and `eol` attributes](https://git-scm.com/docs/gitattributes). This is not frequency evidence, but it
supports treating LF as the primary version-control path and retaining an explicit CRLF counterpart.

### Resulting expectation

For an ordinary modified-file call, the best-supported expectation is:

- tens to low hundreds of line tokens per side;
- one to a few localized edit regions, with a useful ordinary range extending to roughly eight hunks;
- edit cost much smaller than total input length, commonly from a single changed line through a few dozen inserted and
  deleted lines; and
- a long upper tail containing large files, broad mechanical edits, generated content, additions, deletions, and total
  rewrites.

The studies measure changed lines across commits, reviews, or pull requests, often over several files. The benchmark's
per-file 14- and 46-line cases are therefore deliberately conservative anchors, not claims that those exact values are
per-file medians or quartiles. No reviewed source provides defensible frequencies for equal comparisons, empty-sided
comparisons, completely disjoint files, reversed token streams, CR versus LF versus CRLF, or grapheme-script mixtures.

## Benchmark mapping

### Representative group

The first benchmark group is the one to consult for ordinary end-to-end performance. Its line workloads are
deterministic, source-like text with repeated blank lines and localized edits:

| Lines per original | Line ending | Inserted + deleted tokens | Hunks | Purpose                       |
| -----------------: | ----------- | ------------------------: | ----: | ----------------------------- |
|                 64 | LF          |                         2 |     1 | Small single-line replacement |
|                 96 | LF          |                        14 |     3 | Central change-size anchor    |
|                192 | LF          |                        46 |     8 | Upper ordinary anchor         |
|                 96 | CRLF        |                        14 |     3 | Line-ending counterpart       |

The 64-, 96-, and 192-line sizes cover the center and upper quartiles reported for the four source languages without
pretending that the languages or sizes occur equally often. The line edit costs and hunk counts use the commit evidence
as anchors. The 192-line fixture contains both an insertion-only and a deletion-only hunk in addition to replacements.

The representative grapheme group contains short and document-sized ASCII prose with local word edits, plus one short
mixed-Unicode case containing a combining sequence, emoji ZWJ sequences, and flags. ASCII prose is a useful baseline for
source, configuration, and English-language text, but it is not labeled as a worldwide text distribution. Complex
Unicode remains prominent enough to expose `Intl.Segmenter` costs and preserve the package's grapheme contract without
assigning arbitrary percentages to particular scripts or cluster types. The same prose inputs exercise the composed
`diffGraphemes` and `cleanupSemantic` path.

### Scale, edge, and adversarial groups

The existing larger families remain because a distribution's tail and worst cases still matter:

- 20,000-66,000-token sparse, equal, one-sided, LF, CRLF, containment, and repetitive inputs cover scale and allocation
  behavior.
- Completely disjoint and reversed inputs exercise high edit distance and quadratic worst-case behavior. They are
  adversarial tests, not proxies for normal edits.
- Large cleanup inputs isolate semantic shifting, overlap handling, compaction, edit-cost boundaries, and large edit
  blocks. They are component stress tests rather than a consumer workload mix.

Benchmark fixture creation and correctness preflight remain outside the timed regions. The preflight checks
normalization and both projections for every workload; line fixtures with analytically known shapes also check the
number of edit regions and shortest edit cost.

## Interpreting results

Vitest calibrates and reports every named case independently. The suite intentionally has no aggregate "typical diff"
score: averaging cases would imply unsupported frequency weights and could hide a regression behind an unrelated win.
Evaluate changes in this order:

1. Look for consistent effects across the representative line, prose, and composed-cleanup cases.
2. Check the scale cases for size-dependent regressions, excess allocation, or bad asymptotic behavior.
3. Treat disjoint, reversed, and cleanup-component results as targeted guardrails unless the change specifically
   optimizes those scenarios.

Refresh this model when direct package telemetry, a reproducible per-file diff corpus, or materially different consumer
use cases become available. In particular, do not silently turn a new optimization fixture into a claim about real-world
frequency; label it as representative, scale, edge, or adversarial and record the evidence for any new quantitative
anchor here.

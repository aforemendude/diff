# CLEANUP-1: Overlap extraction has quadratic array-shifting cost

- Severity: Medium
- Reference: `src/cleanup/semantic.ts:235-265` (middle-array insertions at lines 252 and 258)
- Problem: `extractOverlaps` scans forward through `diffs` but inserts every extracted equality with `Array.splice` at
  the current pointer. Each qualifying insertion shifts the entire unvisited suffix. With many qualifying deletion /
  insertion pairs, the pass therefore performs quadratic element movement even though each overlap calculation itself is
  linear in the pair's token count.
- Impact: Large or adversarial valid diff arrays can block the Node.js event loop or a browser UI during cleanup. On
  Node.js v24.18.0, a normalized input repeating `DELETE ['a', 'b']`, `INSERT ['b', 'c']`, and a three-token equality
  took about 0.96 seconds for 96,000 input entries and 3.85 seconds for 192,000 entries. Doubling the input produced the
  expected roughly fourfold increase from repeated suffix shifts.
- Recommendation: Build the transformed diff into a separate output array in one forward pass, or collect insertions and
  apply them from the end. Preserve the current forward/reverse overlap choice and run the result through the existing
  coalescing path.

# CLEANUP-2: Semantic cleanup constructs one word segmenter per isolated edit

- Severity: Low
- References: `src/cleanup/semantic.ts:97-101`; `src/cleanup/semantic.ts:136-156`
- Problem: `cleanupSemanticLossless` calls `boundaryScores` for every isolated edit, and `boundaryScores` constructs a
  fresh `Intl.Segmenter` each time even though every call in one cleanup uses the same locale and word granularity.
- Impact: ICU object construction adds avoidable latency proportional to the number of edit regions. Instrumentation
  confirmed 1,000 constructions for 1,000 isolated edits. On Node.js v24.18.0, five runs over 10,000 isolated edits took
  184.0-208.8 ms currently versus 100.1-119.4 ms when the constructor was replaced in memory by one shared segmenter (a
  1.67-2.03x time ratio).
- Recommendation: Construct one word segmenter in `cleanupSemantic`, pass it through `cleanupSemanticLossless` to
  `boundaryScores`, and reuse it for all regions in that call.

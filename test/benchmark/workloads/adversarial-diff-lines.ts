import { createUnrelatedLineWorkload } from '../fixtures/lines.js';
import type { CertifiedTextWorkload } from '../fixtures/types.js';

export const adversarialLineCount = 9_500;
export const adversarialLineWorkload = createUnrelatedLineWorkload(adversarialLineCount, 0x3141_5926);

export const adversarialSparseIndexShortLineCount = 128;
export const adversarialSparseIndexLongLineCount = 500_000;

const sparseIndexShortInput = Array.from(
  { length: adversarialSparseIndexShortLineCount },
  (_, index) => `repeat-${(index % 2).toString(36)}`,
).join('\n');
const sparseIndexLongInput = Array.from(
  { length: adversarialSparseIndexLongLineCount },
  (_, index) => `disjoint-${index.toString(36)}`,
).join('\n');
const sparseIndexShortestEditCost = adversarialSparseIndexShortLineCount + adversarialSparseIndexLongLineCount;

export const adversarialSparseIndexLineWorkloads = [
  {
    after: sparseIndexLongInput,
    before: sparseIndexShortInput,
    shortestEditCost: sparseIndexShortestEditCost,
  },
  {
    after: sparseIndexShortInput,
    before: sparseIndexLongInput,
    shortestEditCost: sparseIndexShortestEditCost,
  },
] as const satisfies readonly CertifiedTextWorkload[];

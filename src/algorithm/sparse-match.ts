import { DELETE, EQUAL, INSERT, type DiffAlgorithm, type DiffOperation } from '../types.js';
import { INITIAL_FRONTIER_DISTANCE } from './myers-workspace.js';

interface MatchIndex<T> {
  readonly bucketCounts: Uint32Array;
  readonly bucketHeads: Uint32Array;
  readonly bucketIds: Map<T, number>;
  readonly distinctTokenCount: number;
  readonly nextOccurrences: Uint32Array;
}

type AppendRange<T> = (operation: DiffOperation, source: readonly T[], start: number, end: number) => void;

const FLOAT64_BYTES = Float64Array.BYTES_PER_ELEMENT;
const MAP_ENTRY_ESTIMATED_BYTES = 32;
const SPARSE_FIXED_WORK = 64;
const SPARSE_MEMORY_MULTIPLE = 4;
const SPARSE_WORK_ADVANTAGE = 8;
const UINT32_BYTES = Uint32Array.BYTES_PER_ELEMENT;
const MAX_SAFE_ESTIMATE = Number.MAX_SAFE_INTEGER;

const addSaturated = (left: number, right: number): number =>
  left >= MAX_SAFE_ESTIMATE - right ? MAX_SAFE_ESTIMATE : left + right;

const multiplySaturated = (left: number, right: number): number =>
  left === 0 || right === 0 ? 0 : left >= MAX_SAFE_ESTIMATE / right ? MAX_SAFE_ESTIMATE : left * right;

const sumEstimates = (...values: readonly number[]): number => {
  let total = 0;
  for (const value of values) {
    total = addSaturated(total, value);
  }
  return total;
};

const hasSaturatedEstimate = (...values: readonly number[]): boolean =>
  values.some((value) => value === MAX_SAFE_ESTIMATE);

const createMatchIndex = <T>(indexed: readonly T[], indexedStart: number, indexedEnd: number): MatchIndex<T> => {
  const indexedLength = indexedEnd - indexedStart;
  const bucketIds = new Map<T, number>();
  // The first pass stores compact bucket IDs here; the second rewrites them into backward occurrence links.
  const nextOccurrences = new Uint32Array(indexedLength);
  let distinctTokenCount = 0;

  for (let indexedOffset = 0; indexedOffset < indexedLength; indexedOffset++) {
    const token = indexed[indexedStart + indexedOffset] as T;
    // Map uses SameValueZero, so non-reflexive values must be excluded to retain the core's strict-equality semantics.
    if (token !== token) {
      continue;
    }

    let encodedBucketId = bucketIds.get(token);
    if (encodedBucketId === undefined) {
      encodedBucketId = distinctTokenCount + 1;
      distinctTokenCount++;
      bucketIds.set(token, encodedBucketId);
    }

    nextOccurrences[indexedOffset] = encodedBucketId;
  }

  const bucketCounts = new Uint32Array(distinctTokenCount);
  const bucketHeads = new Uint32Array(distinctTokenCount);

  for (let indexedOffset = 0; indexedOffset < indexedLength; indexedOffset++) {
    const encodedBucketId = nextOccurrences[indexedOffset] as number;
    if (encodedBucketId === 0) {
      continue;
    }

    const bucketId = encodedBucketId - 1;
    nextOccurrences[indexedOffset] = bucketHeads[bucketId] as number;
    bucketHeads[bucketId] = indexedOffset + 1;
    bucketCounts[bucketId] = (bucketCounts[bucketId] as number) + 1;
  }

  return {
    bucketCounts,
    bucketHeads,
    bucketIds,
    distinctTokenCount,
    nextOccurrences,
  };
};

const countMatchPairs = <T>(
  scanned: readonly T[],
  scannedStart: number,
  scannedEnd: number,
  index: MatchIndex<T>,
): number => {
  let matchPairCount = 0;

  for (let scannedIndex = scannedStart; scannedIndex < scannedEnd; scannedIndex++) {
    const token = scanned[scannedIndex] as T;
    if (token !== token) {
      continue;
    }

    const encodedBucketId = index.bucketIds.get(token);
    if (encodedBucketId !== undefined) {
      matchPairCount = addSaturated(matchPairCount, index.bucketCounts[encodedBucketId - 1] as number);
    }
  }

  return matchPairCount;
};

const frontierPairBytes = (capacity: number): number => multiplySaturated(2 * (2 * capacity + 1), UINT32_BYTES);

const estimateMyersFrontierMemory = (combinedLength: number, editDistance: number): number => {
  const maximumDistance = Math.ceil(combinedLength / 2);
  if (maximumDistance <= INITIAL_FRONTIER_DISTANCE) {
    return frontierPairBytes(maximumDistance);
  }

  const requiredDistance = Math.max(0, Math.floor((editDistance - 1) / 2));
  let capacity = INITIAL_FRONTIER_DISTANCE;
  let peakMemory = frontierPairBytes(capacity);
  while (capacity < requiredDistance && capacity < maximumDistance) {
    const grownCapacity = Math.min(maximumDistance, capacity * 2);
    peakMemory = Math.max(peakMemory, addSaturated(frontierPairBytes(capacity), frontierPairBytes(grownCapacity)));
    capacity = grownCapacity;
  }
  return peakMemory;
};

const estimateMyers = (
  beforeLength: number,
  afterLength: number,
  lcsLength: number,
): { readonly memory: number; readonly work: number } => {
  const combinedLength = beforeLength + afterLength;
  const editDistance = combinedLength - 2 * lcsLength;
  // Omitting the possible final layer for a positive even distance deliberately understates Myers. Boundary uncertainty
  // therefore selects Myers.
  const searchDistance = Math.max(0, Math.floor((editDistance - 1) / 2));

  return {
    memory: estimateMyersFrontierMemory(combinedLength, editDistance),
    work: sumEstimates(combinedLength, multiplySaturated(searchDistance + 1, searchDistance + 2)),
  };
};

const estimateSparse = (
  beforeLength: number,
  afterLength: number,
  distinctTokenCount: number,
  matchPairCount: number,
  lcsLength: number,
): { readonly memory: number; readonly work: number } => {
  const indexedLength = Math.min(beforeLength, afterLength);
  const scannedLength = Math.max(beforeLength, afterLength);
  const scannedPassCount = matchPairCount === 0 ? 1 : 3;
  const frontierCapacity = Math.min(beforeLength, afterLength, matchPairCount);
  const binarySearchWork = lcsLength === 0 ? 0 : Math.ceil(Math.log2(lcsLength + 1));

  return {
    memory: sumEstimates(
      multiplySaturated(indexedLength, UINT32_BYTES),
      multiplySaturated(distinctTokenCount, MAP_ENTRY_ESTIMATED_BYTES + 2 * UINT32_BYTES),
      multiplySaturated(matchPairCount, 2 * UINT32_BYTES + FLOAT64_BYTES),
      multiplySaturated(frontierCapacity, UINT32_BYTES + FLOAT64_BYTES),
      multiplySaturated(lcsLength, FLOAT64_BYTES),
    ),
    work: sumEstimates(
      SPARSE_FIXED_WORK,
      multiplySaturated(2, indexedLength),
      multiplySaturated(scannedPassCount, scannedLength),
      multiplySaturated(matchPairCount, 2 * binarySearchWork + 5),
    ),
  };
};

const sparseHasConservativeAdvantage = (
  beforeLength: number,
  afterLength: number,
  distinctTokenCount: number,
  matchPairCount: number,
  lcsLength: number,
): boolean => {
  const myers = estimateMyers(beforeLength, afterLength, lcsLength);
  const sparse = estimateSparse(beforeLength, afterLength, distinctTokenCount, matchPairCount, lcsLength);
  const myersMemoryAllowance = multiplySaturated(myers.memory, SPARSE_MEMORY_MULTIPLE);
  const sparseWorkWithMargin = multiplySaturated(sparse.work, SPARSE_WORK_ADVANTAGE);

  if (
    hasSaturatedEstimate(
      myers.memory,
      myers.work,
      sparse.memory,
      sparse.work,
      myersMemoryAllowance,
      sparseWorkWithMargin,
    )
  ) {
    return false;
  }

  return sparse.memory <= myersMemoryAllowance && sparseWorkWithMargin <= myers.work;
};

const canConstructSparseWorkspace = (
  beforeLength: number,
  afterLength: number,
  distinctTokenCount: number,
  matchPairCount: number,
): boolean => {
  // Compare the full predecessor workspace with the largest frontier pair Myers can grow for this range. This bounds
  // the sparse probe by a relative memory estimate without imposing an input-independent pair cap.
  const sparseMemory = estimateSparse(beforeLength, afterLength, distinctTokenCount, matchPairCount, 0).memory;
  const myers = estimateMyers(beforeLength, afterLength, 0);
  const myersMemoryAllowance = multiplySaturated(myers.memory, SPARSE_MEMORY_MULTIPLE);

  if (hasSaturatedEstimate(sparseMemory, myers.memory, myersMemoryAllowance)) {
    return false;
  }

  return sparseMemory <= myersMemoryAllowance;
};

const lowerBound = (values: Uint32Array, end: number, target: number): number => {
  let start = 0;
  while (start < end) {
    const middle = start + Math.floor((end - start) / 2);
    if ((values[middle] as number) < target) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }
  return start;
};

const findLcsLength = <T>(
  scanned: readonly T[],
  scannedStart: number,
  scannedEnd: number,
  index: MatchIndex<T>,
  frontierIndexedOffsets: Uint32Array,
): number => {
  let lcsLength = 0;

  for (let scannedIndex = scannedStart; scannedIndex < scannedEnd; scannedIndex++) {
    const token = scanned[scannedIndex] as T;
    if (token !== token) {
      continue;
    }

    const encodedBucketId = index.bucketIds.get(token);
    if (encodedBucketId === undefined) {
      continue;
    }

    let encodedIndexedOffset = index.bucketHeads[encodedBucketId - 1] as number;
    while (encodedIndexedOffset !== 0) {
      const indexedOffset = encodedIndexedOffset - 1;
      const frontierIndex = lowerBound(frontierIndexedOffsets, lcsLength, indexedOffset);
      frontierIndexedOffsets[frontierIndex] = indexedOffset;
      if (frontierIndex === lcsLength) {
        lcsLength++;
      }
      encodedIndexedOffset = index.nextOccurrences[indexedOffset] as number;
    }
  }

  return lcsLength;
};

/**
 * Try the exact sparse-match LCS engine for one already-trimmed token range. Returns false only when adaptive selection
 * conservatively prefers Myers. The shorter range is indexed; equal lengths retain the original after-side
 * orientation.
 */
export const tryAppendSparseMatchDiff = <T>(
  before: readonly T[],
  beforeStart: number,
  beforeEnd: number,
  after: readonly T[],
  afterStart: number,
  afterEnd: number,
  algorithm: Exclude<DiffAlgorithm, 'myers'>,
  append: AppendRange<T>,
): boolean => {
  const beforeLength = beforeEnd - beforeStart;
  const afterLength = afterEnd - afterStart;
  const indexBefore = beforeLength < afterLength;
  const indexed = indexBefore ? before : after;
  const indexedStart = indexBefore ? beforeStart : afterStart;
  const indexedEnd = indexBefore ? beforeEnd : afterEnd;
  const scanned = indexBefore ? after : before;
  const scannedStart = indexBefore ? afterStart : beforeStart;
  const scannedEnd = indexBefore ? afterEnd : beforeEnd;
  const index = createMatchIndex(indexed, indexedStart, indexedEnd);
  const matchPairCount = countMatchPairs(scanned, scannedStart, scannedEnd, index);

  if (
    algorithm === 'adaptive' &&
    !canConstructSparseWorkspace(beforeLength, afterLength, index.distinctTokenCount, matchPairCount)
  ) {
    return false;
  }

  if (matchPairCount === 0) {
    if (
      algorithm === 'adaptive' &&
      !sparseHasConservativeAdvantage(beforeLength, afterLength, index.distinctTokenCount, matchPairCount, 0)
    ) {
      return false;
    }

    append(DELETE, before, beforeStart, beforeEnd);
    append(INSERT, after, afterStart, afterEnd);
    return true;
  }

  const frontierCapacity = Math.min(beforeLength, afterLength, matchPairCount);
  const frontierIndexedOffsets = new Uint32Array(frontierCapacity);
  let lcsLength = 0;

  if (algorithm === 'adaptive') {
    lcsLength = findLcsLength(scanned, scannedStart, scannedEnd, index, frontierIndexedOffsets);
    if (
      !sparseHasConservativeAdvantage(beforeLength, afterLength, index.distinctTokenCount, matchPairCount, lcsLength)
    ) {
      return false;
    }
  }

  const recordScannedOffsets = new Uint32Array(matchPairCount);
  const recordIndexedOffsets = new Uint32Array(matchPairCount);
  const recordPredecessors = new Float64Array(matchPairCount);
  const frontierRecordIds = new Float64Array(frontierCapacity);
  lcsLength = 0;
  let recordId = 0;

  const scannedLength = scannedEnd - scannedStart;
  for (let scannedOffset = 0; scannedOffset < scannedLength; scannedOffset++) {
    const token = scanned[scannedStart + scannedOffset] as T;
    if (token !== token) {
      continue;
    }

    const encodedBucketId = index.bucketIds.get(token);
    if (encodedBucketId === undefined) {
      continue;
    }

    let encodedIndexedOffset = index.bucketHeads[encodedBucketId - 1] as number;
    while (encodedIndexedOffset !== 0) {
      const indexedOffset = encodedIndexedOffset - 1;
      const frontierIndex = lowerBound(frontierIndexedOffsets, lcsLength, indexedOffset);
      recordScannedOffsets[recordId] = scannedOffset;
      recordIndexedOffsets[recordId] = indexedOffset;
      recordPredecessors[recordId] = frontierIndex === 0 ? 0 : (frontierRecordIds[frontierIndex - 1] as number);
      frontierIndexedOffsets[frontierIndex] = indexedOffset;
      frontierRecordIds[frontierIndex] = recordId + 1;
      if (frontierIndex === lcsLength) {
        lcsLength++;
      }

      recordId++;
      encodedIndexedOffset = index.nextOccurrences[indexedOffset] as number;
    }
  }

  const matchRecordIds = new Float64Array(lcsLength);
  let encodedRecordId = lcsLength === 0 ? 0 : (frontierRecordIds[lcsLength - 1] as number);
  for (let matchIndex = lcsLength; matchIndex > 0;) {
    const currentRecordId = encodedRecordId - 1;
    matchRecordIds[--matchIndex] = currentRecordId;
    encodedRecordId = recordPredecessors[currentRecordId] as number;
  }

  let beforeOffset = 0;
  let afterOffset = 0;
  for (const currentRecordId of matchRecordIds) {
    const scannedOffset = recordScannedOffsets[currentRecordId] as number;
    const indexedOffset = recordIndexedOffsets[currentRecordId] as number;
    const matchBeforeOffset = indexBefore ? indexedOffset : scannedOffset;
    const matchAfterOffset = indexBefore ? scannedOffset : indexedOffset;
    append(DELETE, before, beforeStart + beforeOffset, beforeStart + matchBeforeOffset);
    append(INSERT, after, afterStart + afterOffset, afterStart + matchAfterOffset);
    append(EQUAL, before, beforeStart + matchBeforeOffset, beforeStart + matchBeforeOffset + 1);
    beforeOffset = matchBeforeOffset + 1;
    afterOffset = matchAfterOffset + 1;
  }

  append(DELETE, before, beforeStart + beforeOffset, beforeEnd);
  append(INSERT, after, afterStart + afterOffset, afterEnd);
  return true;
};

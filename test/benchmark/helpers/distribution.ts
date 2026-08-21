export const shuffle = <Value>(values: readonly Value[], seed: number): Value[] => {
  const result = values.slice();
  let state = seed >>> 0;

  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    const value = result[index];
    const swapValue = result[swapIndex];
    if (value === undefined || swapValue === undefined) {
      throw new Error('Benchmark shuffle received a sparse array');
    }
    result[index] = swapValue;
    result[swapIndex] = value;
  }

  return result;
};

export const repeat = <Value>(value: Value, count: number): Value[] => Array.from({ length: count }, () => value);

interface WeightedValue<Value> {
  readonly value: Value;
  readonly weight: number;
}

export const allocateWeightedValues = <Value>(
  total: number,
  weightedValues: readonly WeightedValue<Value>[],
): Value[] => {
  const allocations = weightedValues.map(({ weight }, index) => {
    const exactCount = (total * weight) / 100;
    return { count: Math.floor(exactCount), index, remainder: exactCount % 1 };
  });
  const allocatedCount = allocations.reduce((sum, { count }) => sum + count, 0);
  const remainderOrder = allocations
    .slice()
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let index = 0; index < total - allocatedCount; index++) {
    const allocation = remainderOrder[index];
    if (allocation === undefined) {
      throw new Error('Benchmark weights do not sum to 100%');
    }
    allocation.count++;
  }

  return allocations.flatMap(({ count, index }) => {
    const weightedValue = weightedValues[index];
    if (weightedValue === undefined) {
      throw new Error('Benchmark weight allocation is incomplete');
    }
    return repeat(weightedValue.value, count);
  });
};

export const createRepeatedSchedule = <Value>(
  workloads: readonly Value[],
  repetitionCount: number,
  seed: number,
): Value[] => Array.from({ length: repetitionCount }, (_, repetition) => shuffle(workloads, seed + repetition)).flat();

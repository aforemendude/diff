export const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
};

export const words = ['amber', 'brisk', 'cedar', 'delta', 'ember', 'frost', 'grove', 'harbor'] as const;

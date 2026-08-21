import { beforeAll, bench, describe } from 'vitest';
import { diffLines } from '../../../src/line.js';
import { benchmarkOptions } from '../helpers/options.js';
import { validateLineWorkload } from '../helpers/preflight.js';
import { adversarialLineCount, adversarialLineWorkload } from '../workloads/adversarial-diff-lines.js';

export const registerAdversarialDiffLinesBenchmark = (): void => {
  beforeAll(() => validateLineWorkload(adversarialLineWorkload));

  describe('adversarial diffLines workload', () => {
    bench(
      `one call with ${adversarialLineCount.toLocaleString('en-US')} disjoint unique lines per side`,
      () => void diffLines(adversarialLineWorkload.before, adversarialLineWorkload.after),
      benchmarkOptions,
    );
  });
};

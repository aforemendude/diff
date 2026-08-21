import { beforeAll, bench, describe } from 'vitest';
import { diffGraphemes } from '../../../src/grapheme.js';
import { benchmarkOptions } from '../helpers/options.js';
import { validateGraphemeWorkload } from '../helpers/preflight.js';
import { adversarialGraphemeCount, adversarialGraphemeWorkload } from '../workloads/adversarial-diff-graphemes.js';

export const registerAdversarialDiffGraphemesBenchmark = (): void => {
  beforeAll(() => validateGraphemeWorkload(adversarialGraphemeWorkload));

  describe('adversarial diffGraphemes workload', () => {
    bench(
      `one call with ${adversarialGraphemeCount.toLocaleString('en-US')} disjoint graphemes per side`,
      () => void diffGraphemes(adversarialGraphemeWorkload.before, adversarialGraphemeWorkload.after, { locale: 'en' }),
      benchmarkOptions,
    );
  });
};

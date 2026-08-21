import * as unicodeFixtures from '../../../src/test-support/unicode.test.fixtures.js';
import { createRandom, words } from './random.js';
import type { CertifiedTextWorkload, TextWorkload } from './types.js';

const mixedUnicodeSubjects = [
  unicodeFixtures.WOMAN_TECHNOLOGIST,
  unicodeFixtures.WOMAN_SCIENTIST,
  unicodeFixtures.UNITED_NATIONS_FLAG,
  unicodeFixtures.UNITED_STATES_FLAG,
] as const;

export const createProseWorkload = (sentenceCount: number, seed: number, mixedUnicode = false): TextWorkload => {
  const random = createRandom(seed);
  const before: string[] = [];
  const after: string[] = [];

  for (let index = 0; index < sentenceCount; index++) {
    const adjective = words[random() % words.length] ?? 'amber';
    const noun = words[random() % words.length] ?? 'cedar';
    const label = index.toString(36);
    const subject =
      mixedUnicode && index % 5 === 0 ? (mixedUnicodeSubjects[index % mixedUnicodeSubjects.length] ?? 'fox') : 'fox';
    const sentence = `Section ${label}: the ${adjective} ${subject} crossed the ${noun} bridge.`;
    before.push(sentence);

    if (index % 23 === 0) {
      const replacement = words[random() % words.length] ?? 'frost';
      after.push(`Section ${label}: the ${replacement} ${subject} carefully crossed the ${noun} bridge.`);
    } else if (index % 41 !== 0) {
      after.push(sentence);
    }
  }

  return { before: before.join('\n'), after: after.join('\n') };
};

export const createDenseGraphemeWorkload = (clusterCount: number, seed: number): CertifiedTextWorkload => {
  const random = createRandom(seed);
  const beforeAlphabet = ['a', 'b', 'c', 'd', 'e'] as const;
  const afterAlphabet = ['v', 'w', 'x', 'y', 'z'] as const;
  const before = Array.from({ length: clusterCount }, () => beforeAlphabet[random() % beforeAlphabet.length]);
  const after = Array.from({ length: clusterCount }, () => afterAlphabet[random() % afterAlphabet.length]);
  return {
    before: before.join(''),
    after: after.join(''),
    shortestEditCost: before.length + after.length,
  };
};

/** Create one insertion with many equivalent semantic placements. */
export const createSemanticShiftWorkload = (repeatedClusterCount: number): CertifiedTextWorkload => {
  const prefix = 'Semantic benchmark start: ';
  const suffix = ' End.';
  const repeated = 'a'.repeat(repeatedClusterCount);
  return {
    before: `${prefix}${repeated}${suffix}`,
    after: `${prefix}${repeated}${repeated}${suffix}`,
    editHunkCount: 1,
    shortestEditCost: repeatedClusterCount,
  };
};

/** Create many one-token equalities surrounded by replacements. */
export const createEfficiencyChainWorkload = (groupCount: number): CertifiedTextWorkload => ({
  before: 'a='.repeat(groupCount),
  after: 'b='.repeat(groupCount),
  editHunkCount: groupCount,
  shortestEditCost: groupCount * 2,
});

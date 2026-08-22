import { createRandom, words } from './random.js';
import type { CertifiedTextWorkload, TextWorkload } from './types.js';

const ZERO_WIDTH_JOINER = '\u{200D}';
const REGIONAL_INDICATOR_SYMBOL_LETTER_N = '\u{1F1F3}';
const REGIONAL_INDICATOR_SYMBOL_LETTER_S = '\u{1F1F8}';
const REGIONAL_INDICATOR_SYMBOL_LETTER_U = '\u{1F1FA}';
const WOMAN = '\u{1F469}';
const PERSONAL_COMPUTER = '\u{1F4BB}';
const MICROSCOPE = '\u{1F52C}';
const WOMAN_TECHNOLOGIST = WOMAN + ZERO_WIDTH_JOINER + PERSONAL_COMPUTER;
const WOMAN_SCIENTIST = WOMAN + ZERO_WIDTH_JOINER + MICROSCOPE;
const UNITED_NATIONS_FLAG = REGIONAL_INDICATOR_SYMBOL_LETTER_U + REGIONAL_INDICATOR_SYMBOL_LETTER_N;
const UNITED_STATES_FLAG = REGIONAL_INDICATOR_SYMBOL_LETTER_U + REGIONAL_INDICATOR_SYMBOL_LETTER_S;

const mixedUnicodeSubjects = [WOMAN_TECHNOLOGIST, WOMAN_SCIENTIST, UNITED_NATIONS_FLAG, UNITED_STATES_FLAG] as const;

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

import { DELETE, EQUAL, INSERT, type Diff, type DiffOperation, type LineEnding } from '../../src/line.js';
import * as unicodeFixtures from '../../src/test-support/unicode.test.fixtures.js';

export interface TextWorkload {
  readonly before: string;
  readonly after: string;
  /** Proven number of separated edit regions, when analytically known. */
  readonly editHunkCount?: number;
  /** Proven minimum number of inserted and deleted tokens, when analytically known. */
  readonly shortestEditCost?: number;
}

interface CertifiedTextWorkload extends TextWorkload {
  readonly shortestEditCost: number;
}

export interface LineEdit {
  /** Zero-based position in the original line sequence. */
  readonly at: number;
  readonly deleteCount: number;
  readonly insertCount: number;
}

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
};

const words = ['amber', 'brisk', 'cedar', 'delta', 'ember', 'frost', 'grove', 'harbor'] as const;

const createSourceLines = (lineCount: number): string[] =>
  Array.from({ length: lineCount }, (_, index) => {
    const block = Math.floor(index / 8)
      .toString(36)
      .padStart(3, '0');

    switch (index % 8) {
      case 0:
        return `export function transform${block}(input: number): number {`;
      case 1:
        return `  const offset${block} = input + ${index};`;
      case 2:
        return `  if (offset${block} < 0) {`;
      case 3:
        return `    return -offset${block};`;
      case 4:
        return `  } // branch ${block}`;
      case 5:
        return `  return offset${block} * 2;`;
      case 6:
        return `} // transform${block}`;
      default:
        // Preserve repeated blank-line tokens without accidentally turning the
        // final token into an insignificant terminal line ending.
        return index === lineCount - 1 ? `// end transform${block}` : '';
    }
  });

export const createSourceLineWorkload = (
  lineCount: number,
  lineEnding: LineEnding,
  edits: readonly LineEdit[],
): CertifiedTextWorkload => {
  const before = createSourceLines(lineCount);
  const after = before.slice();
  let offset = 0;
  let shortestEditCost = 0;
  let previousEditEnd = 0;

  for (const [hunkIndex, edit] of edits.entries()) {
    const deletedLines = before.slice(edit.at, edit.at + edit.deleteCount);
    const selectsOnlyUniqueLines = deletedLines.every(
      (line) => line.length > 0 && before.indexOf(line) === before.lastIndexOf(line),
    );
    if (
      edit.at < previousEditEnd ||
      edit.at > before.length ||
      deletedLines.length !== edit.deleteCount ||
      !selectsOnlyUniqueLines
    ) {
      throw new Error('Source-line benchmark edits must be ordered and delete only in-range unique lines');
    }

    const insertions = Array.from(
      { length: edit.insertCount },
      (_, insertionIndex) => `// benchmark edit ${hunkIndex.toString(36)}-${insertionIndex.toString(36)}`,
    );
    after.splice(edit.at + offset, edit.deleteCount, ...insertions);
    offset += edit.insertCount - edit.deleteCount;
    shortestEditCost += edit.deleteCount + edit.insertCount;
    previousEditEnd = edit.at + edit.deleteCount;
  }

  // Deleted original lines and generated insertions are unique. All other
  // original lines remain in order, so they form a longest common subsequence.
  return {
    before: before.join(lineEnding),
    after: after.join(lineEnding),
    editHunkCount: edits.length,
    shortestEditCost,
  };
};

export const createLineWorkload = (lineCount: number, lineEnding: LineEnding, seed: number): CertifiedTextWorkload => {
  const random = createRandom(seed);
  const before: string[] = [];
  const after: string[] = [];
  let shortestEditCost = 0;

  for (let index = 0; index < lineCount; index++) {
    const value = random();
    const line = `${index.toString(36).padStart(5, '0')} ${words[value % words.length]} ${value.toString(16)}`;
    before.push(line);

    if (index > 0 && index % 13_007 === 0) {
      after.push(`inserted-${index.toString(36)}-${random().toString(16)}`);
      shortestEditCost++;
    }

    if (index > 0 && index % 17_003 === 0) {
      shortestEditCost++;
      continue;
    }

    if (index > 0 && index % 4_099 === 0) {
      after.push(`${index.toString(36).padStart(5, '0')} revised ${random().toString(16)}`);
      shortestEditCost += 2;
    } else {
      after.push(line);
    }
  }

  // Original lines have unique index prefixes, and generated edits cannot match
  // them, so the unchanged original lines form a longest common subsequence.
  return { before: before.join(lineEnding), after: after.join(lineEnding), shortestEditCost };
};

export const createUnrelatedLineWorkload = (lineCount: number, seed: number): CertifiedTextWorkload => {
  const random = createRandom(seed);
  const before = Array.from(
    { length: lineCount },
    (_, index) => `before-${index.toString(36)}-${random().toString(16)}`,
  );
  const after = Array.from({ length: lineCount }, (_, index) => `after-${index.toString(36)}-${random().toString(16)}`);
  return {
    before: before.join('\n'),
    after: after.join('\n'),
    shortestEditCost: before.length + after.length,
  };
};

const graphemes = [
  'a',
  'b',
  unicodeFixtures.E_WITH_COMBINING_ACUTE,
  unicodeFixtures.WOMAN_TECHNOLOGIST,
  unicodeFixtures.UNITED_NATIONS_FLAG,
  unicodeFixtures.THUMBS_UP_MEDIUM_SKIN_TONE,
  unicodeFixtures.DEVANAGARI_KSSA_WITH_ZWJ,
  unicodeFixtures.THAI_CHO_CHING_WITH_MAI_HAN_AKAT,
] as const;

export const createGraphemeWorkload = (clusterCount: number, seed: number): TextWorkload => {
  const random = createRandom(seed);
  const before: string[] = [];
  const after: string[] = [];

  for (let index = 0; index < clusterCount; index++) {
    const poolIndex = random() % graphemes.length;
    const cluster = graphemes[poolIndex] ?? 'a';
    before.push(cluster);

    if (index > 0 && index % 5_003 === 0) {
      after.push(unicodeFixtures.SPARKLES);
    }

    if (index > 0 && index % 7_001 === 0) {
      continue;
    }

    if (index > 0 && index % 2_503 === 0) {
      after.push(graphemes[(poolIndex + 1 + (random() % (graphemes.length - 1))) % graphemes.length] ?? 'b');
    } else {
      after.push(cluster);
    }
  }

  return { before: before.join(''), after: after.join('') };
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

export const createProseWorkload = (sentenceCount: number, seed: number): TextWorkload => {
  const random = createRandom(seed);
  const before: string[] = [];
  const after: string[] = [];

  for (let index = 0; index < sentenceCount; index++) {
    const adjective = words[random() % words.length] ?? 'amber';
    const noun = words[random() % words.length] ?? 'cedar';
    const label = index.toString(36);
    const sentence = `Section ${label}: the ${adjective} fox crossed the ${noun} bridge.`;
    before.push(sentence);

    if (index % 23 === 0) {
      const replacement = words[random() % words.length] ?? 'frost';
      after.push(`Section ${label}: the ${replacement} fox carefully crossed the ${noun} bridge.`);
    } else if (index % 41 !== 0) {
      after.push(sentence);
    }
  }

  return { before: before.join('\n'), after: after.join('\n') };
};

const asciiTokens = (text: string): readonly string[] => Array.from(text);

const appendDiff = (diffs: Diff[], operation: DiffOperation, text: string): void => {
  if (text.length > 0) {
    diffs.push([operation, asciiTokens(text)]);
  }
};

export const createSemanticDiff = (editCount: number, seed: number): readonly Diff[] => {
  const random = createRandom(seed);
  const diffs: Diff[] = [];
  appendDiff(diffs, EQUAL, 'Document start: The c');

  for (let index = 0; index < editCount; index++) {
    appendDiff(diffs, INSERT, 'ow and the c');
    const word = words[random() % words.length] ?? 'grove';
    appendDiff(diffs, EQUAL, `at met the ${word} fox. Paragraph ${index.toString(36)}: The c`);
  }

  return diffs;
};

export const createEfficiencyDiff = (groupCount: number, seed: number): readonly Diff[] => {
  const random = createRandom(seed);
  const diffs: Diff[] = [];

  for (let index = 0; index < groupCount; index++) {
    appendDiff(diffs, DELETE, `d${random() % 10}`);
    appendDiff(diffs, INSERT, `i${random() % 10}`);
    appendDiff(diffs, EQUAL, 'xy'.slice(0, 1 + (random() % 2)));
    appendDiff(diffs, DELETE, `r${random() % 10}`);
    appendDiff(diffs, INSERT, `s${random() % 10}`);
    appendDiff(diffs, EQUAL, ` stable-${index.toString(36)} `);
  }

  return diffs;
};

export const createLargeEditBlockDiff = (tokenCount: number): readonly Diff[] => {
  const boundaryLength = Math.floor(tokenCount / 4);
  const deletion: string[] = [];
  const insertion: string[] = [];

  for (let index = 0; index < tokenCount; index++) {
    const isBoundary = index < boundaryLength || index >= tokenCount - boundaryLength;
    deletion.push(`${isBoundary ? 'common' : 'deletion'}-${index.toString(36)}`);
    insertion.push(`${isBoundary ? 'common' : 'insertion'}-${index.toString(36)}`);
  }

  return [
    [DELETE, deletion],
    [INSERT, insertion],
  ];
};

export const createOverlapDiff = (groupCount: number, seed: number): readonly Diff[] => {
  const random = createRandom(seed);
  const diffs: Diff[] = [];

  for (let index = 0; index < groupCount; index++) {
    const overlap = `${String.fromCharCode(97 + (random() % 26))}${String.fromCharCode(97 + (random() % 26))}`;
    appendDiff(diffs, DELETE, `a${overlap}`);
    appendDiff(diffs, INSERT, `${overlap}z`);
    appendDiff(diffs, EQUAL, ` stable-${index.toString(36)} `);
  }

  return diffs;
};

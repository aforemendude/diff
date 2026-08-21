import { DELETE, EQUAL, INSERT, type Diff } from '../../../src/cleanup.js';
import { diffGraphemes } from '../../../src/grapheme.js';
import { diffLines, type LineEnding } from '../../../src/line.js';
import type { SizedLineWorkload, TextWorkload } from '../fixtures/types.js';

const projectTokens = (diffs: readonly Diff[], exclude: typeof DELETE | typeof INSERT): string[] =>
  diffs.flatMap(([operation, tokens]) => (operation === exclude ? [] : tokens));

const validateNormalized = (diffs: readonly Diff[], label: string): void => {
  for (let index = 0; index < diffs.length; index++) {
    const current = diffs[index];
    if (
      current === undefined ||
      ![DELETE, EQUAL, INSERT].includes(current[0]) ||
      current[1].length === 0 ||
      current[0] === diffs[index - 1]?.[0]
    ) {
      throw new Error(`${label} benchmark normalization preflight failed`);
    }
  }
};

const assertEqualTokens = (actual: readonly string[], expected: readonly string[], label: string): void => {
  if (actual.length !== expected.length || actual.some((token, index) => token !== expected[index])) {
    throw new Error(`${label} benchmark reconstruction preflight failed`);
  }
};

const validateKnownShortestEditCost = (workload: TextWorkload, result: readonly Diff[], label: string): void => {
  if (workload.shortestEditCost === undefined) {
    return;
  }

  const actual = result.reduce((cost, [operation, tokens]) => cost + (operation === EQUAL ? 0 : tokens.length), 0);
  if (actual !== workload.shortestEditCost) {
    throw new Error(
      `${label} benchmark shortest-edit preflight failed: expected ${workload.shortestEditCost}, received ${actual}`,
    );
  }
};

const validateKnownEditHunkCount = (workload: TextWorkload, result: readonly Diff[], label: string): void => {
  if (workload.editHunkCount === undefined) {
    return;
  }

  const actual = result.reduce(
    (count, [operation], index) =>
      operation !== EQUAL && (index === 0 || result[index - 1]?.[0] === EQUAL) ? count + 1 : count,
    0,
  );
  if (actual !== workload.editHunkCount) {
    throw new Error(
      `${label} benchmark edit-hunk preflight failed: expected ${workload.editHunkCount}, received ${actual}`,
    );
  }
};

const canonicalLines = (text: string, lineEnding: LineEnding): string[] => {
  const tokens = text.split(lineEnding);
  if (tokens.at(-1) === '') {
    tokens.pop();
  }
  return tokens;
};

export const validateLineWorkload = (workload: TextWorkload, lineEnding: LineEnding = '\n'): readonly Diff[] => {
  const result = diffLines(workload.before, workload.after, { lineEnding });
  validateNormalized(result, 'diffLines');
  assertEqualTokens(projectTokens(result, INSERT), canonicalLines(workload.before, lineEnding), 'diffLines before');
  assertEqualTokens(projectTokens(result, DELETE), canonicalLines(workload.after, lineEnding), 'diffLines after');
  validateKnownEditHunkCount(workload, result, 'diffLines');
  validateKnownShortestEditCost(workload, result, 'diffLines');
  return result;
};

export const validateRepresentativeLineWorkload = (
  workload: SizedLineWorkload,
  targetByteCount: number,
  changedPortion: number,
  requestedEditHunkCount: number,
  label: string,
): void => {
  if (workload.before.length !== targetByteCount || workload.after.length !== targetByteCount) {
    throw new Error(`${label} representative diffLines benchmark did not preserve its target byte size`);
  }

  let actualChangedCharacterCount = 0;
  for (let index = 0; index < workload.before.length; index++) {
    if (workload.before[index] !== workload.after[index]) {
      actualChangedCharacterCount++;
    }
  }

  const expectedChangedCharacterCount =
    changedPortion === 0 ? 0 : Math.max(1, Math.round(targetByteCount * changedPortion));
  if (
    workload.changedCharacterCount !== expectedChangedCharacterCount ||
    actualChangedCharacterCount !== expectedChangedCharacterCount
  ) {
    throw new Error(`${label} representative diffLines benchmark did not realize its target change ratio`);
  }
  if (workload.editHunkCount > requestedEditHunkCount) {
    throw new Error(`${label} representative diffLines benchmark exceeded its requested edit fragmentation`);
  }

  validateLineWorkload(workload);
};

export const validateGraphemeWorkload = (workload: TextWorkload): readonly Diff[] => {
  const result = diffGraphemes(workload.before, workload.after, { locale: 'en' });
  validateNormalized(result, 'diffGraphemes');
  if (
    projectTokens(result, INSERT).join('') !== workload.before ||
    projectTokens(result, DELETE).join('') !== workload.after
  ) {
    throw new Error('diffGraphemes benchmark reconstruction preflight failed');
  }
  validateKnownEditHunkCount(workload, result, 'diffGraphemes');
  validateKnownShortestEditCost(workload, result, 'diffGraphemes');
  return result;
};

export const validateCleanupResult = (input: readonly Diff[], result: readonly Diff[], label: string): void => {
  validateNormalized(result, label);
  assertEqualTokens(projectTokens(result, INSERT), projectTokens(input, INSERT), `${label} before`);
  assertEqualTokens(projectTokens(result, DELETE), projectTokens(input, DELETE), `${label} after`);
};

export const validateCleanupWorkload = (
  workload: TextWorkload,
  cleanup: (diffs: readonly Diff[]) => readonly Diff[],
  label: string,
): { readonly cleaned: readonly Diff[]; readonly raw: readonly Diff[] } => {
  const raw = validateGraphemeWorkload(workload);
  const cleaned = cleanup(raw);
  validateCleanupResult(raw, cleaned, label);
  return { cleaned, raw };
};

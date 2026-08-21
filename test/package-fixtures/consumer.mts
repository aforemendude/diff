import { cleanupSemantic, type Diff as CleanupDiff } from '@aforemendude/diff/cleanup';
import {
  diffGraphemes,
  type DiffAlgorithm as GraphemeDiffAlgorithm,
  type GraphemeDiffOptions,
} from '@aforemendude/diff/grapheme';
import { diffLines, type DiffAlgorithm, type LineDiffOptions } from '@aforemendude/diff/line';

const algorithm: DiffAlgorithm = 'adaptive';
const graphemeAlgorithm: GraphemeDiffAlgorithm = algorithm;
const lineOptions = { algorithm, lineEnding: '\n' } satisfies LineDiffOptions;
const graphemeOptions = { algorithm: graphemeAlgorithm, locale: 'en' } satisfies GraphemeDiffOptions;
const lineChanges: readonly CleanupDiff[] = diffLines('before', 'after', lineOptions);
const graphemeChanges: readonly CleanupDiff[] = diffGraphemes('before', 'after', graphemeOptions);
const cleaned: readonly CleanupDiff[] = cleanupSemantic(graphemeChanges, graphemeOptions);

void [lineChanges, cleaned];

// @ts-expect-error The package deliberately has no root entry point.
import * as rootApi from '@aforemendude/diff';
void rootApi;

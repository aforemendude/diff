import { cleanupSemantic, type Diff as CleanupDiff } from '@aforemendude/diff/cleanup';
import { diffGraphemes, type GraphemeDiffOptions } from '@aforemendude/diff/grapheme';
import { diffLines, type LineDiffOptions } from '@aforemendude/diff/line';

const lineOptions = { lineEnding: '\n' } satisfies LineDiffOptions;
const graphemeOptions = { locale: 'en' } satisfies GraphemeDiffOptions;
const lineChanges: readonly CleanupDiff[] = diffLines('before', 'after', lineOptions);
const graphemeChanges: readonly CleanupDiff[] = diffGraphemes('before', 'after', graphemeOptions);
const cleaned: readonly CleanupDiff[] = cleanupSemantic(graphemeChanges, graphemeOptions);

void [lineChanges, cleaned];

// @ts-expect-error The package deliberately has no root entry point.
import * as rootApi from '@aforemendude/diff';
void rootApi;

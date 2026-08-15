import { cleanupEfficiency, type Diff } from '@aforemendude/diff/cleanup';
import { diffGraphemes } from '@aforemendude/diff/grapheme';
import { diffLines } from '@aforemendude/diff/line';

const lineChanges: readonly Diff[] = diffLines('before', 'after');
const graphemeChanges: readonly Diff[] = diffGraphemes('before', 'after');
const cleaned: readonly Diff[] = cleanupEfficiency(graphemeChanges);

void [lineChanges, cleaned];

// @ts-expect-error The package deliberately has no root entry point.
import * as rootApi from '@aforemendude/diff';
void rootApi;

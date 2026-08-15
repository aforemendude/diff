import cleanupApi = require('@aforemendude/diff/cleanup');
import graphemeApi = require('@aforemendude/diff/grapheme');
import lineApi = require('@aforemendude/diff/line');

const lineOptions = { lineEnding: '\r\n' } satisfies lineApi.LineDiffOptions;
const graphemeOptions = { locale: 'en' } satisfies graphemeApi.GraphemeDiffOptions;
const lineChanges: readonly cleanupApi.Diff[] = lineApi.diffLines('before', 'after', lineOptions);
const graphemeChanges: readonly cleanupApi.Diff[] = graphemeApi.diffGraphemes('before', 'after', graphemeOptions);
const cleaned: readonly cleanupApi.Diff[] = cleanupApi.cleanupEfficiency(graphemeChanges);

void [lineChanges, cleaned];

// @ts-expect-error The package deliberately has no root entry point.
import rootApi = require('@aforemendude/diff');
void rootApi;

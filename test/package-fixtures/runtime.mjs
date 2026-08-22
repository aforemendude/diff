import assert from 'node:assert/strict';
import * as cleanupApi from '@aforemendude/diff/cleanup';
import * as graphemeApi from '@aforemendude/diff/grapheme';
import * as lineApi from '@aforemendude/diff/line';

assert.deepEqual(Object.keys(lineApi).sort(), ['DELETE', 'EQUAL', 'INSERT', 'diffLines'].sort());
assert.deepEqual(Object.keys(graphemeApi).sort(), ['DELETE', 'EQUAL', 'INSERT', 'diffGraphemes'].sort());
assert.deepEqual(
  Object.keys(cleanupApi).sort(),
  ['DELETE', 'EQUAL', 'INSERT', 'cleanupEfficiency', 'cleanupSemantic'].sort(),
);
assert.deepEqual(lineApi.diffLines('a', 'b'), [
  [lineApi.DELETE, ['a']],
  [lineApi.INSERT, ['b']],
]);
assert.deepEqual(lineApi.diffLines('a\nb\nc', 'x\na\ny\nb\nc\nz', { algorithm: 'sparse' }), [
  [lineApi.INSERT, ['x']],
  [lineApi.EQUAL, ['a']],
  [lineApi.INSERT, ['y']],
  [lineApi.EQUAL, ['b', 'c']],
  [lineApi.INSERT, ['z']],
]);
assert.match(import.meta.resolve('@aforemendude/diff/line'), /\/dist\/esm\/line\.js$/u);
await assert.rejects(import('@aforemendude/diff'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });

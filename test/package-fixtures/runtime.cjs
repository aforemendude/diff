'use strict';

const assert = require('node:assert/strict');
const { sep } = require('node:path');
const lineApi = require('@aforemendude/diff/line');

const lineGraph = Object.keys(require.cache).filter((path) => path.includes(`${sep}dist${sep}`));
assert.equal(
  lineGraph.some((path) => path.includes('grapheme')),
  false,
);
assert.equal(
  lineGraph.some((path) => path.includes(`${sep}cleanup${sep}`)),
  false,
);

const cleanupApi = require('@aforemendude/diff/cleanup');
const graphemeApi = require('@aforemendude/diff/grapheme');

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
assert.match(require.resolve('@aforemendude/diff/line'), /[\\/]dist[\\/]cjs[\\/]line\.js$/u);
assert.throws(() => require('@aforemendude/diff'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });

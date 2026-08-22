import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const fixtureDirectory = fileURLToPath(new URL('../test/package-fixtures', import.meta.url));
const typescriptBin = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'diff-package-'));
const consumerDirectory = join(temporaryDirectory, 'consumer');
const npmEnvironment = { ...process.env, npm_config_cache: join(temporaryDirectory, 'npm-cache') };
const packageMetadata = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'));

assert.equal(packageMetadata.license, 'MIT AND Apache-2.0');

try {
  const { stdout } = await execFileAsync(
    npmBin,
    ['pack', '--ignore-scripts', '--json', '--pack-destination', temporaryDirectory],
    { cwd: packageDirectory, env: npmEnvironment },
  );
  const packResult = JSON.parse(stdout);
  const filename = packResult[0]?.filename;
  if (typeof filename !== 'string') {
    throw new Error('npm pack did not report a tarball filename');
  }
  const packedFiles = new Set(packResult[0]?.files?.map(({ path }) => path));
  for (const format of ['cjs', 'esm']) {
    for (const entry of ['cleanup', 'grapheme', 'line']) {
      for (const extension of ['d.ts', 'js', 'js.map']) {
        assert(packedFiles.has(`dist/${format}/${entry}.${extension}`));
      }
    }
  }
  assert(packedFiles.has('dist/esm/package.json'));
  assert(packedFiles.has('LICENSE'));
  assert(packedFiles.has('LICENSES/Apache-2.0.txt'));
  assert(packedFiles.has('THIRD_PARTY_NOTICES.md'));
  assert.equal(
    [...packedFiles].some((path) => /(^|\/)index(?:\.d\.ts|\.js|\.js\.map)$/u.test(path)),
    false,
  );

  await cp(fixtureDirectory, consumerDirectory, { recursive: true });
  await execFileAsync(
    npmBin,
    ['install', '--ignore-scripts', '--no-package-lock', '--no-save', join(temporaryDirectory, filename)],
    { cwd: consumerDirectory, env: npmEnvironment },
  );

  for (const config of ['tsconfig.nodenext.json', 'tsconfig.bundler.json']) {
    await execFileAsync(process.execPath, [typescriptBin, '--project', join(consumerDirectory, config)], {
      cwd: consumerDirectory,
    });
  }

  for (const runtime of ['runtime.mjs', 'runtime.cjs']) {
    await execFileAsync(process.execPath, [join(consumerDirectory, runtime)], { cwd: consumerDirectory });
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

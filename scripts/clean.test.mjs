import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
let fixtureDirectory;

afterEach(async () => {
  if (fixtureDirectory !== undefined) {
    await rm(fixtureDirectory, { force: true, recursive: true });
    fixtureDirectory = undefined;
  }
});

describe('clean script', () => {
  it('recursively removes dist and succeeds when dist is already absent', async () => {
    fixtureDirectory = await mkdtemp(join(tmpdir(), 'diff-clean-'));
    const fixtureScripts = join(fixtureDirectory, 'scripts');
    const fixtureDist = join(fixtureDirectory, 'dist');
    const fixtureScript = join(fixtureScripts, 'clean.mjs');
    await mkdir(fixtureScripts);
    await mkdir(join(fixtureDist, 'nested'), { recursive: true });
    await writeFile(join(fixtureDist, 'nested', 'artifact.js'), 'generated');
    await copyFile(new URL('./clean.mjs', import.meta.url), fixtureScript);

    await expect(execFileAsync(process.execPath, [fixtureScript])).resolves.toMatchObject({ stderr: '', stdout: '' });
    await expect(stat(fixtureDist)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(execFileAsync(process.execPath, [fixtureScript])).resolves.toMatchObject({ stderr: '', stdout: '' });
  });
});

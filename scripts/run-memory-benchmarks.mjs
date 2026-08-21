import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const benchmarkGroups = {
  adversarial: [
    'test/benchmark/diff-lines.adversarial.bench.ts',
    'test/benchmark/diff-graphemes.adversarial.bench.ts',
    'test/benchmark/adaptive-selection.adversarial.bench.ts',
    'test/benchmark/semantic-cleanup.adversarial.bench.ts',
    'test/benchmark/efficiency-cleanup.adversarial.bench.ts',
    'test/benchmark/cleanup-worklist.adversarial.bench.ts',
  ],
  representative: [
    'test/benchmark/diff-lines.bench.ts',
    'test/benchmark/diff-graphemes.bench.ts',
    'test/benchmark/semantic-cleanup.bench.ts',
    'test/benchmark/efficiency-cleanup.bench.ts',
  ],
};

const workerFlag = '--worker';

const formatMebibytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

const runBenchmarkWorker = async (benchmarkFile) => {
  const { startVitest } = await import('vitest/node');

  globalThis.gc();
  const baselineRss = process.memoryUsage.rss();
  const vitest = await startVitest('benchmark', [benchmarkFile], {
    color: false,
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'threads',
    run: true,
    watch: false,
  });

  if (vitest === undefined) {
    throw new Error(`Vitest could not start ${benchmarkFile}`);
  }

  await vitest.close();

  const peakRss = process.resourceUsage().maxRSS * 1024;
  console.log(`\nMemory usage for ${benchmarkFile}`);
  console.log(`  Baseline RSS: ${formatMebibytes(baselineRss)}`);
  console.log(`  Peak RSS: ${formatMebibytes(peakRss)}`);
  console.log(`  Peak increase: ${formatMebibytes(Math.max(0, peakRss - baselineRss))}`);
};

const runIsolatedBenchmark = (benchmarkFile) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), workerFlag, benchmarkFile], {
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal === null ? `exit code ${String(code)}` : `signal ${signal}`;
      reject(new Error(`Memory benchmark ${benchmarkFile} failed with ${reason}`));
    });
  });

const runBenchmarkGroup = async (groupName) => {
  const benchmarkFiles = benchmarkGroups[groupName];
  if (benchmarkFiles === undefined) {
    throw new Error(`Unknown memory benchmark group: ${groupName}`);
  }

  for (const benchmarkFile of benchmarkFiles) {
    await runIsolatedBenchmark(benchmarkFile);
  }
};

try {
  if (process.argv[2] === workerFlag) {
    const benchmarkFile = process.argv[3];
    if (benchmarkFile === undefined) {
      throw new Error('A memory benchmark worker requires a benchmark file');
    }
    await runBenchmarkWorker(benchmarkFile);
  } else {
    const groupName = process.argv[2];
    if (groupName === undefined) {
      throw new Error('A memory benchmark group is required');
    }
    await runBenchmarkGroup(groupName);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

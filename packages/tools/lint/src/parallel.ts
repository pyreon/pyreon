import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { LintWorkerInput, LintWorkerOutput } from './lint-worker'
import { _resolveRun, lint } from './lint'
import type { ConfigDiagnostic, LintFileResult, LintOptions, LintResult } from './types'

/**
 * Parallel lint driver.
 *
 * Linting is embarrassingly parallel — a file's diagnostics depend only on that
 * file and the resolved config — yet the engine walked every file on one core.
 * On this machine that is one of fourteen.
 *
 * Deliberate properties:
 *
 *  - **The config is resolved once, on the main thread**, and shipped to
 *    workers as plain data. Workers cannot disagree about what is enabled, and
 *    none of them re-reads `.pyreonlintrc.json`.
 *  - **Results are re-sorted by file path** before returning. Workers finish in
 *    whatever order they finish; output that shifts run to run would make the
 *    linter useless in CI diffs.
 *  - **Config diagnostics are deduped**, because every worker validates the
 *    same rule options and would otherwise report a malformed option N times.
 *  - **Below a threshold it just runs sequentially.** Spawning a worker costs
 *    more than linting a handful of files, and a tool that is slower on small
 *    inputs to be faster on large ones is a bad trade for the common case.
 */

/**
 * Under this many files, the sequential path wins — worker startup and module
 * loading dominate. Chosen conservatively; the parallel path is an
 * optimization for whole-repo runs, not for `lint one-file.ts`.
 */
export const PARALLEL_FILE_THRESHOLD = 200

/** Workers to use for `fileCount` files. Never more than the work justifies. */
export function workerCountFor(fileCount: number, available = cpus().length): number {
  if (fileCount < PARALLEL_FILE_THRESHOLD) return 0
  // Leave a core for the main thread; give each worker a meaningful slice so a
  // 200-file run does not spawn 13 workers to do 15 files each.
  return Math.max(1, Math.min(available - 1, Math.floor(fileCount / 100)))
}

/** Split `items` into `n` contiguous, near-equal chunks. */
export function partition<T>(items: T[], n: number): T[][] {
  if (n <= 1) return [items]
  const out: T[][] = Array.from({ length: n }, () => [])
  const per = Math.ceil(items.length / n)
  for (let i = 0; i < items.length; i++) {
    const slot = Math.min(n - 1, Math.floor(i / per))
    ;(out[slot] as T[]).push(items[i] as T)
  }
  return out.filter((c) => c.length > 0)
}

function workerEntry(): string {
  // Resolve next to THIS module, carrying its own extension.
  //
  // The package is consumed two ways: workspace/dev resolves the `bun`
  // condition to `src/*.ts`, published installs resolve to `lib/*.js`.
  // Hardcoding `.js` works in one and silently fails in the other — the
  // same src-vs-lib split that makes stale `lib/` bugs so confusing.
  const url = import.meta.url
  const here = dirname(fileURLToPath(url))
  const ext = url.endsWith('.ts') ? '.ts' : '.js'
  return join(here, `lint-worker${ext}`)
}

/**
 * Lint with a worker pool, falling back to the sequential path when the input
 * is too small to be worth it or when workers are unavailable.
 *
 * Produces byte-identical results to {@link lint} — locked by a test that
 * diffs both over this repository.
 */
export async function lintAsync(options: LintOptions): Promise<LintResult> {
  const run = _resolveRun(options)
  const workers = workerCountFor(run.files.length)
  if (workers === 0) return lint(options)

  const chunks = partition(run.files, workers)
  const entry = workerEntry()

  let outputs: LintWorkerOutput[]
  try {
    outputs = await Promise.all(
      chunks.map(
        (files) =>
          new Promise<LintWorkerOutput>((resolve, reject) => {
            const input: LintWorkerInput = {
              files,
              config: run.config,
              fix: options.fix ?? false,
              quiet: options.quiet ?? false,
            }
            const w = new Worker(entry, { workerData: input })
            w.once('message', (m: LintWorkerOutput) => {
              resolve(m)
              void w.terminate()
            })
            w.once('error', reject)
            w.once('exit', (code) => {
              if (code !== 0) reject(new Error(`lint worker exited with code ${code}`))
            })
          }),
      ),
    )
  } catch {
    // A worker failed to start (no worker_threads, a bundling problem, a
    // sandbox that forbids threads). Correctness beats speed: fall back rather
    // than reporting a partial result as if it were complete.
    return lint(options)
  }

  const files: LintFileResult[] = outputs.flatMap((o) => o.files)
  files.sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0))

  const configDiagnostics: ConfigDiagnostic[] = []
  for (const o of outputs) {
    for (const d of o.configDiagnostics) {
      if (!configDiagnostics.some((x) => x.ruleId === d.ruleId && x.message === d.message)) {
        configDiagnostics.push(d)
      }
    }
  }

  const result: LintResult = {
    files,
    totalErrors: 0,
    totalWarnings: 0,
    totalInfos: 0,
    configDiagnostics,
  }
  for (const f of files) {
    for (const d of f.diagnostics) {
      if (d.severity === 'error') result.totalErrors++
      else if (d.severity === 'warn') result.totalWarnings++
      else if (d.severity === 'info') result.totalInfos++
    }
  }
  return result
}

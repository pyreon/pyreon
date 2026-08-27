import { existsSync } from 'node:fs'
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

/**
 * Absolute path to the worker entry.
 *
 * Resolved through the package's OWN export map (`@pyreon/lint/lint-worker`)
 * rather than relative to this module, because this module does not stay put:
 * the bundler folds `parallel.ts` into `lib/_chunks/`, so `import.meta.url`
 * points one directory below the worker and a relative guess resolves to
 * `lib/_chunks/lint-worker.js` — which does not exist. Combined with the
 * spawn-failure fallback that made the parallel path silently never run, in
 * dev AND in the published build, while every test still passed.
 *
 * The export map is the one thing that survives bundling, so it is what the
 * lookup keys on. Relative candidates remain only as a fallback for hosts
 * without `import.meta.resolve`.
 */
/**
 * Pure half of `_workerEntry`: given what the host offered, decide the path.
 *
 * Split out because the interesting cases — a host with no
 * `import.meta.resolve`, a resolver that throws, and the bundled layout where
 * the worker sits one directory UP — cannot be produced in-process by the
 * wiring that reads the real globals. That is the same reason
 * `matchesProcessEntry` exists in `@pyreon/mcp`: a fallback nobody can
 * exercise is a fallback nobody has verified, and this particular fallback is
 * the one that silently disabled the whole worker pool.
 */
export function resolveWorkerEntry(
  resolved: string | null,
  moduleUrl: string,
  exists: (p: string) => boolean,
): string {
  if (resolved) return fileURLToPath(resolved)

  const here = dirname(fileURLToPath(moduleUrl))
  const ext = moduleUrl.endsWith('.ts') ? '.ts' : '.js'
  const candidates = [
    join(here, `lint-worker${ext}`), // running from src/, or an unbundled lib/
    join(here, '..', `lint-worker${ext}`), // bundled into lib/_chunks/
  ]
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate
  }
  // Nothing found: return the primary candidate so a spawn fails with a path
  // in the message rather than silently doing nothing.
  return candidates[0]!
}

export function _workerEntry(): string {
  let resolved: string | null = null
  try {
    resolved = import.meta.resolve?.('@pyreon/lint/lint-worker') ?? null
  } catch {
    // Self-reference unavailable (older host, or an unusual layout) — the
    // relative candidates below cover it.
  }
  return resolveWorkerEntry(resolved, import.meta.url, existsSync)
}


/**
 * Lint with a worker pool, falling back to the sequential path when the input
 * is too small to be worth it or when workers are unavailable.
 *
 * Produces byte-identical results to {@link lint} — locked by a test that
 * diffs both over this repository.
 */
/**
 * Why a run is NOT parallel. Reported rather than inferred, because a
 * fallback that yields the correct answer is otherwise indistinguishable from
 * a working fast path — which is exactly how this driver shipped dead.
 */
export type SequentialReason =
  | 'below-threshold'
  | 'source-entry'
  | 'entry-missing'

export type RunPlan =
  | { kind: 'sequential'; reason: SequentialReason }
  | { kind: 'parallel'; workers: number; entry: string }

/**
 * Decide how a run will execute, BEFORE attempting anything.
 *
 * Deliberately not exception-driven. "We are loaded from source, so a worker
 * cannot resolve this entry" is a predictable property of the environment, not
 * an error: attempting a spawn that is known to fail and catching the result
 * turns a decision into an accident, and makes a genuine worker crash look
 * identical to it.
 */
export function planRun(fileCount: number, entry = _workerEntry()): RunPlan {
  if (workerCountFor(fileCount) === 0) return { kind: 'sequential', reason: 'below-threshold' }
  // A `.ts` entry is the workspace/dev layout. Node's ESM loader inside a
  // worker cannot resolve the entry's extensionless imports, so this would
  // fail every time — decide it here instead of discovering it by throwing.
  if (entry.endsWith('.ts')) return { kind: 'sequential', reason: 'source-entry' }
  if (!existsSync(entry)) return { kind: 'sequential', reason: 'entry-missing' }
  return { kind: 'parallel', workers: workerCountFor(fileCount), entry }
}

/**
 * Lint with a worker pool, or sequentially when {@link planRun} says the pool
 * is unavailable or not worth it.
 *
 * Produces byte-identical results either way — locked by a test that diffs
 * both over the same corpus.
 */
export async function lintAsync(options: LintOptions): Promise<LintResult> {
  const run = _resolveRun(options)
  const plan = planRun(run.files.length)
  if (plan.kind === 'sequential') return lint(options)

  const chunks = partition(run.files, plan.workers)

  /* v8 ignore start -- a worker's body is not instrumented in-process, so this
     block cannot be covered from within vitest. It is exercised end-to-end by
     the built-artifact specs in parallel.test.ts and by the real CLI. */
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
            const w = new Worker(plan.entry, { workerData: input })
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
  } catch (err) {
    // Reaching here means a worker that WAS expected to run did not. That is a
    // real failure — a rule throwing, an OOM, a corrupt build — not the
    // routine "no pool available" case, which `planRun` already handled.
    const message = err instanceof Error ? err.message : String(err)

    if (options.fix) {
      // Under `--fix` the workers that DID succeed have already written their
      // files. Re-running sequentially over a half-modified tree only produces
      // the right answer if every fixer is idempotent, which is an assumption
      // this code has no way to enforce. Surface it instead of guessing.
      throw new Error(
        `[Pyreon] A lint worker failed during --fix, after other workers may already have written files: ${message}\n` +
          `Re-run without --fix to see the diagnostics, then fix again once the failure is understood. ` +
          `Falling back silently here could double-apply a non-idempotent fix.`,
      )
    }

    // Read-only run: the sequential path yields the same answer, so recover —
    // but say so. A silent recovery is what let this driver ship dead.
    console.error(`[Pyreon] lint worker failed (${message}); falling back to a sequential run.`)
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
  /* v8 ignore stop */
}

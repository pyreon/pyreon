import { lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Vitest `globalSetup`: give each run its own temp directory and delete it
 * when the run ends.
 *
 * Tests across the repo create scratch directories with
 * `mkdtempSync(join(tmpdir(), …))`, and more than a hundred test files never
 * remove them. Each run left thousands of directories in the OS temp dir
 * (`lathe-pull-*`, `pyreon-bundle-budgets-*`, `pyreon-smoke-*`, …), and a run
 * killed by a timeout leaks even from code that does clean up in `finally`.
 * Fixing every call site would not stop the next test from doing the same, so
 * the run owns the directory instead.
 *
 * `os.tmpdir()` reads `TMPDIR` (POSIX) or `TEMP`/`TMP` (Windows) on every
 * call, and Vitest starts its workers after global setup, so every test and
 * every process a test spawns inherits the sandbox.
 *
 * A run that never reaches its teardown must not leak the directory either.
 * The pre-push hook kills vitest at its time cap, and so do Ctrl-C, timeouts
 * and editor reloads. Two mechanisms cover that:
 *
 * - SIGINT / SIGTERM / SIGHUP remove the directory, then re-raise the signal
 *   when nothing else handles it.
 * - SIGKILL cannot be caught, so every setup also sweeps the sandboxes of
 *   earlier runs in the same parent: a `pyreon-vitest-XXXXXX` directory whose
 *   recorded owner pid is no longer alive and that is older than
 *   {@link STALE_DEAD_OWNER_MS}, or one with no owner file that is older than
 *   {@link STALE_NO_OWNER_MS}. Only real directories (never symlinks) whose
 *   name is exactly the `mkdtemp` shape are candidates.
 *
 * Opt out with `PYREON_TEST_KEEP_TMP=1`, which keeps the directory for
 * inspection and prints its path.
 */
export default function setup(): () => void {
  return createSandbox(tmpdir())
}

/** The file inside each sandbox that names its owning process. */
export const OWNER_FILE = '.pyreon-vitest-owner.json'
/** A sandbox whose owner died is removed once it is this old. */
export const STALE_DEAD_OWNER_MS = 60 * 60 * 1000
/** A sandbox with no owner file (written before owner files existed) is removed once it is this old. */
export const STALE_NO_OWNER_MS = 24 * 60 * 60 * 1000

const SANDBOX_NAME = /^pyreon-vitest-[A-Za-z0-9]{6}$/
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

interface Owner {
  pid: number
  startedAt: number
}

/** Create a sandbox under `parent`, point the temp env vars at it, return its teardown. */
export function createSandbox(parent: string): () => void {
  sweepStaleSandboxes(parent)

  const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }
  const dir = mkdtempSync(join(parent, 'pyreon-vitest-'))
  const owner: Owner = { pid: process.pid, startedAt: Date.now() }
  writeFileSync(join(dir, OWNER_FILE), JSON.stringify(owner))
  process.env.TMPDIR = dir
  process.env.TEMP = dir
  process.env.TMP = dir

  const keep = (): boolean => process.env.PYREON_TEST_KEEP_TMP === '1'
  const onSignal = (signal: NodeJS.Signals): void => {
    removeListeners()
    if (!keep()) rmSync(dir, { recursive: true, force: true })
    // Our listener replaced the default action (terminate). Restore it when
    // nobody else handles the signal; otherwise the other listeners, which
    // ran in this same emit, own what happens next.
    if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
  }
  const removeListeners = (): void => {
    for (const signal of SIGNALS) process.off(signal, onSignal)
  }
  for (const signal of SIGNALS) process.on(signal, onSignal)

  return () => {
    removeListeners()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    if (keep()) {
      console.warn(`[pyreon] kept test temp dir: ${dir}`)
      return
    }
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Remove sandboxes in `parent` left behind by runs that were killed before
 * their teardown. Returns the paths it removed.
 */
export function sweepStaleSandboxes(parent: string, now: number = Date.now()): string[] {
  let names: string[]
  try {
    names = readdirSync(parent)
  } catch {
    return []
  }
  const removed: string[] = []
  for (const name of names) {
    if (!SANDBOX_NAME.test(name)) continue
    const path = join(parent, name)
    try {
      const stat = lstatSync(path)
      if (!stat.isDirectory()) continue
      const owner = readOwner(path)
      const stale = owner
        ? !isAlive(owner.pid) && now - owner.startedAt > STALE_DEAD_OWNER_MS
        : now - stat.mtimeMs > STALE_NO_OWNER_MS
      if (!stale) continue
      rmSync(path, { recursive: true, force: true })
      removed.push(path)
    } catch {
      // Another run removed it first, or it is not ours to read: leave it.
    }
  }

  return removed
}

function readOwner(dir: string): Owner | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, OWNER_FILE), 'utf8'))
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'pid' in parsed &&
      'startedAt' in parsed &&
      typeof parsed.pid === 'number' &&
      Number.isInteger(parsed.pid) &&
      typeof parsed.startedAt === 'number'
    ) {
      return { pid: parsed.pid, startedAt: parsed.startedAt }
    }
  } catch {
    // No owner file, or an unreadable one: the age rule decides.
  }

  return undefined
}

function isAlive(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

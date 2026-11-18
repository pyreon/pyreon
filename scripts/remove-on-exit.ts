/**
 * Remove a scratch path however the process ends.
 *
 * A `finally` block runs on a normal return and on a thrown error, but not
 * when the process is killed: Ctrl-C, a CI step timeout (SIGTERM) or a closed
 * terminal (SIGHUP) ends a script without unwinding its stack. A script that
 * created a 2 GB git worktree in the temp directory then leaves it there, still
 * registered in the repository's worktree list.
 *
 * `removeOnExit(path)` registers `path` for removal:
 *
 * - on normal exit, including `process.exit(n)` and an uncaught exception
 *   (both fire the `exit` event);
 * - on SIGINT, SIGTERM and SIGHUP. After cleaning up, the handler re-raises the
 *   signal so the process still dies from it (exit status 128 + n, which is
 *   what a CI runner or a shell expects). When another listener for the same
 *   signal exists, that listener owns the shutdown and nothing is re-raised;
 *   the `exit` event then covers anything left.
 *
 * It returns a function that removes the path immediately and unregisters it,
 * for the `finally` block. Removal is idempotent: a path is removed at most
 * once, and an already-missing path is not an error.
 *
 * With `{ gitWorktree: repoRoot }` the path is a linked worktree of `repoRoot`:
 * removal runs `git worktree remove --force` first and `git worktree prune`
 * after, so the repository does not keep a registration for a deleted
 * directory.
 *
 * Limits: a signal handler is JavaScript, so it runs only when the event loop
 * does. While the script is blocked in `spawnSync` / `execSync`, a signal sent
 * to the script alone is handled when that child returns (Ctrl-C reaches the
 * whole foreground process group, so the child ends and the handler runs at
 * once). The handlers stay installed for the life of the process, so a signal
 * handled late is never lost: it still cleans up and kills. SIGKILL cannot be
 * handled at all.
 *
 * Safety: only the exact paths passed in are removed. `rmSync` with
 * `recursive` unlinks symbolic links instead of following them, so nothing
 * outside a registered directory is touched. The path must be absolute and
 * must not be the file-system root, the home directory or the temp directory
 * itself.
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'

export interface RemoveOnExitOptions {
  /** The path is a linked git worktree of this repository root. */
  gitWorktree?: string
}

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
type Signal = (typeof SIGNALS)[number]

/** Paths still to remove, in registration order. */
const pending = new Map<string, RemoveOnExitOptions>()
let installed = false

function removeNow(path: string, options: RemoveOnExitOptions): void {
  const repo = options.gitWorktree
  if (repo !== undefined)
    {spawnSync('git', ['worktree', 'remove', '--force', path], { cwd: repo, stdio: 'ignore' })}
  try {
    rmSync(path, { recursive: true, force: true })
  } catch {
    // Best effort: a file held open (Windows, a macOS lock) must not turn
    // cleanup into a crash. The signal or exit continues regardless.
  }
  if (repo !== undefined) spawnSync('git', ['worktree', 'prune'], { cwd: repo, stdio: 'ignore' })
}

function removeAll(): void {
  for (const [path, options] of [...pending]) {
    pending.delete(path)
    removeNow(path, options)
  }
}

const handlers = new Map<Signal, () => void>(
  SIGNALS.map((signal) => [
    signal,
    () => {
      removeAll()
      process.off(signal, handlers.get(signal)!)
      // Re-raise only when nobody else handles this signal: with no listener
      // left, the default action terminates the process with its status.
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
    },
  ]),
)

/** Installed once, on first use, and never removed (see "Limits" above). */
function install(): void {
  if (installed) return
  installed = true
  process.on('exit', removeAll)
  for (const [signal, handler] of handlers) process.on(signal, handler)
}

function assertRemovable(path: string): void {
  const forbidden = new Set(['/', resolve(homedir()), resolve(tmpdir())])
  if (!isAbsolute(path) || forbidden.has(resolve(path)))
    {throw new Error(
      `[Pyreon] removeOnExit refuses ${JSON.stringify(path)}: pass an absolute path to a directory the script created (a mkdtemp directory or a path inside one).`,
    )}
}

/**
 * Register `path` for removal on exit, on an uncaught error and on
 * SIGINT/SIGTERM/SIGHUP. Returns a function that removes it now (idempotent).
 */
export function removeOnExit(path: string, options: RemoveOnExitOptions = {}): () => void {
  assertRemovable(path)
  const key = resolve(path)
  pending.set(key, options)
  install()
  return () => {
    const registered = pending.get(key)
    if (registered === undefined) return
    pending.delete(key)
    removeNow(key, registered)
  }
}

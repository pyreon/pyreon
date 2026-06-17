/**
 * Live Program Inlay Hints — runtime bridge.
 *
 * Writes the current `getFireSummaries()` snapshot to a JSON file that
 * the LSP server reads via the `PYREON_LPIH_CACHE` env var. This is the
 * file-cache bridge mechanism — chosen over IPC/WebSocket because:
 *
 *   1. LSP servers are stdio-only — they can't easily talk to a browser.
 *   2. Filesystem is a universal lowest-common-denominator transport.
 *   3. The runtime side writes (atomic rename); the LSP side reads.
 *   4. The LSP re-reads the file on every inlay-hint request, so live
 *      edits land immediately without coordination.
 *
 * Two consumer modes:
 *
 *   **Dev-server polled mode**: a dev-server hook calls
 *   `writeLpihCache(path)` on every signal write or at a regular interval
 *   (e.g. 250ms throttle). The LSP picks it up on next inlay-hint request.
 *
 *   **On-demand mode**: a test harness or devtools UI calls
 *   `writeLpihCache(path)` explicitly when it wants the LSP to see the
 *   current state.
 *
 * Atomic write semantics: writes to `<path>.tmp.<pid>.<seq>` then renames
 * to `<path>`. Readers (the LSP server) never see a half-written file.
 *
 * Zero-cost when devtools is inactive: `getFireSummaries()` returns []
 * unless `activateReactiveDevtools()` has been called. So calling
 * `writeLpihCache()` against an inactive registry writes an empty
 * `{ fires: [] }` — cheap, correct.
 */

import { getFireSummaries } from './reactive-devtools'

let _seq = 0

/**
 * Canonical filename for the LPIH cache file. Co-located with the
 * project — convention: `<cwd>/.pyreon-lpih.json`. The dot-prefix marks
 * it as a hidden / generated file by filesystem convention; the
 * extension makes its contents grep-able as JSON.
 *
 * @internal — exported for tests + symmetry with the LSP-side default.
 */
export const LPIH_DEFAULT_FILENAME = '.pyreon-lpih.json'

/**
 * Resolve the default LPIH cache path for the current process. The path
 * is **`<cwd>/.pyreon-lpih.json`** — co-located with the project so the
 * LSP can auto-discover it by walking up from any source file.
 *
 * Returns null in environments without `process.cwd()` (e.g. a fresh
 * web worker without polyfills) — callers should fall back to an
 * explicit path argument.
 *
 * @example
 * import { startLpihPolling, getDefaultLpihCachePath } from '@pyreon/reactivity/lpih'
 * console.log(getDefaultLpihCachePath()) // → '/Users/me/proj/.pyreon-lpih.json'
 * startLpihPolling() // writes to that path
 */
export function getDefaultLpihCachePath(): string | null {
  // Node-only dev bridge; `process` is always defined where this runs.
  /* v8 ignore next */
  if (typeof process === 'undefined') return null
  // Pyreon's reactivity package narrows `process` to `{ env: ... }`.
  // Cast through the runtime check so the call site typechecks under
  // browser-target tsconfig while still working in Node where cwd exists.
  const proc = process as unknown as { cwd?: () => string }
  if (typeof proc.cwd !== 'function') return null
  try {
    const cwd = proc.cwd()
    // Use forward-slash join; works on POSIX + Windows (Node accepts both).
    return `${cwd.replace(/[/\\]+$/, '')}/${LPIH_DEFAULT_FILENAME}`
  } catch {
    return null
  }
}

/**
 * Snapshot `getFireSummaries()` and write it to `path` atomically.
 * Returns the number of fires written.
 *
 * **Path resolution**: when `path` is omitted, defaults to
 * `<cwd>/.pyreon-lpih.json` (`getDefaultLpihCachePath()`). The LSP
 * auto-discovers this convention by walking up from any source file to
 * the nearest `package.json` — so projects that use the default need
 * zero env-var configuration.
 *
 * Errors (filesystem permission, EACCES, etc.) are caught and re-thrown
 * — the caller decides whether to swallow them. The runtime side wraps
 * this in a try/catch when called from hot paths.
 *
 * Throws if `path` is omitted AND no default can be resolved (e.g.
 * a web worker without `process.cwd()`).
 *
 * @example
 * import { activateReactiveDevtools } from '@pyreon/reactivity'
 * import { writeLpihCache } from '@pyreon/reactivity/lpih'
 *
 * activateReactiveDevtools()
 * await writeLpihCache() // → writes to <cwd>/.pyreon-lpih.json
 * // The LSP server auto-discovers this path; no env var needed.
 */
export async function writeLpihCache(path?: string): Promise<number> {
  const resolvedPath = path ?? getDefaultLpihCachePath()
  if (resolvedPath === null) {
    throw new Error(
      '[lpih] writeLpihCache: no path provided and no default could be resolved ' +
        '(process.cwd() unavailable). Pass an explicit path.',
    )
  }
  return await _writeToPath(resolvedPath)
}

async function _writeToPath(path: string): Promise<number> {
  const summaries = getFireSummaries()
  const payload = {
    fires: summaries.map((s) => ({
      file: s.loc.file,
      line: s.loc.line,
      count: s.count,
      kind: s.kind,
      lastFire: s.lastFire,
      rate1s: s.rate1s,
    })),
  }
  const pid =
    typeof process !== 'undefined' && 'pid' in process
      ? (process as { pid?: number }).pid ?? 0
      : 0
  const tmp = `${path}.tmp.${pid}.${++_seq}`
  const fs = await import('node:fs/promises')
  // Single try/catch covering BOTH writeFile AND rename. The previous
  // shape only guarded the rename — if `fs.writeFile` itself threw (disk
  // full, EIO, EACCES, transient FS error), the partial tmp file leaked
  // on disk with a unique PID+seq name. The same bug class lived in the
  // vite-plugin's `writeLpihCacheFile` (R1); both fixed in lockstep.
  try {
    await fs.writeFile(tmp, JSON.stringify(payload), 'utf8')
    await fs.rename(tmp, path)
  } catch (err) {
    // Rename / writeFile failed — clean up the tmp file so we don't leak
    // it on disk. Covers BOTH paths: writeFile-failed (tmp may not exist
    // → unlink ENOENT, swallowed) AND rename-failed (tmp exists). Common
    // rename causes: cross-device link (rare; same dir → same FS), target
    // is a directory, EACCES. The caller sees the original error; the
    // cleanup is best-effort and silent (unlink may also fail if the FS
    // is broken — re-throwing that would mask the real problem).
    try {
      await fs.unlink(tmp)
    } catch {
      /* swallow — original error is more useful */
    }
    throw err
  }
  return summaries.length
}

/**
 * Polling helper: call `writeLpihCache(path)` every `intervalMs`. Returns
 * a disposer that stops the timer.
 *
 * **Path resolution**: same as `writeLpihCache` — `path` defaults to
 * `<cwd>/.pyreon-lpih.json` when omitted. The LSP auto-discovers this
 * convention so projects need zero configuration.
 *
 * Useful for dev servers that want the LSP to see live updates. The
 * interval is throttled (not debounced); a fast-firing signal won't
 * generate one write per fire. 250-500ms is the recommended range.
 *
 * Throws synchronously if `path` is omitted AND no default can be
 * resolved — the caller catches this once at startup rather than
 * silently never writing.
 *
 * @example
 * import { activateReactiveDevtools } from '@pyreon/reactivity'
 * import { startLpihPolling } from '@pyreon/reactivity/lpih'
 *
 * if (import.meta.env.DEV) {
 *   activateReactiveDevtools()
 *   startLpihPolling() // writes to <cwd>/.pyreon-lpih.json every 250ms
 * }
 */
export function startLpihPolling(
  path?: string,
  intervalMs = 250,
): () => void {
  const resolvedPath = path ?? getDefaultLpihCachePath()
  if (resolvedPath === null) {
    throw new Error(
      '[lpih] startLpihPolling: no path provided and no default could be resolved ' +
        '(process.cwd() unavailable). Pass an explicit path.',
    )
  }
  return _startPollingAt(resolvedPath, intervalMs)
}

function _startPollingAt(path: string, intervalMs: number): () => void {
  let active = true
  let timer: ReturnType<typeof setTimeout> | null = null
  const tick = async (): Promise<void> => {
    if (!active) return
    try {
      // Skip the default-resolution check on every tick — path is already
      // resolved at startup.
      await _writeToPath(path)
    } catch {
      // Swallow — polling continues. The LSP degrades gracefully if the
      // file is missing or stale.
    }
    if (active) {
      timer = setTimeout(tick, intervalMs)
      // .unref() so a forgotten startLpihPolling() doesn't block process
      // exit. Node-only; the setTimeout return type in browsers is a
      // number with no .unref. Type-narrow defensively.
      if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        ;(timer as { unref(): void }).unref()
      }
    }
  }
  void tick()
  return () => {
    active = false
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
}

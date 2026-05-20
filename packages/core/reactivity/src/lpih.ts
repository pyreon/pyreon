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
 * Snapshot `getFireSummaries()` and write it to `path` atomically.
 * Returns the number of fires written.
 *
 * Errors (filesystem permission, EACCES, etc.) are caught and re-thrown
 * — the caller decides whether to swallow them. The runtime side wraps
 * this in a try/catch when called from hot paths.
 *
 * @example
 * import { activateReactiveDevtools, writeLpihCache } from '@pyreon/reactivity'
 *
 * activateReactiveDevtools()
 * // ... user code creates signals and triggers fires ...
 * await writeLpihCache('/tmp/pyreon-lpih.json')
 * // LSP server reads /tmp/pyreon-lpih.json on next inlayHint request
 */
export async function writeLpihCache(path: string): Promise<number> {
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
  await fs.writeFile(tmp, JSON.stringify(payload), 'utf8')
  try {
    await fs.rename(tmp, path)
  } catch (err) {
    // Rename failed — clean up the tmp file so we don't leak it on disk.
    // Common causes: cross-device link (rare; same dir → same FS), target
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
 * Useful for dev servers that want the LSP to see live updates. The
 * interval is throttled (not debounced); a fast-firing signal won't
 * generate one write per fire. 250-500ms is the recommended range.
 */
export function startLpihPolling(
  path: string,
  intervalMs = 250,
): () => void {
  let active = true
  let timer: ReturnType<typeof setTimeout> | null = null
  const tick = async (): Promise<void> => {
    if (!active) return
    try {
      await writeLpihCache(path)
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

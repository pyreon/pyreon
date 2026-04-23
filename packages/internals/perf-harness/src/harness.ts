import type { CounterName } from './counters'
import { _count, _disable, _enable, _isEnabled, _reset, _snapshot } from './counters'
import { type CounterDiff, diffSnapshots, formatDiff } from './diff'
import { mountOverlay, type OverlayHandle, type OverlayOptions } from './overlay'

/**
 * Public runtime harness API. Consumers use this to read counters, run
 * journeys, and render diffs. Framework packages do NOT import from this
 * module — they only call `_count()` from `./counters`, which is the
 * single-responsibility write path.
 */
export interface PerfHarness {
  enable: () => void
  disable: () => void
  isEnabled: () => boolean

  reset: () => void
  snapshot: () => Record<CounterName, number>
  diff: (before: Record<CounterName, number>, after: Record<CounterName, number>) => CounterDiff
  formatDiff: (diff: CounterDiff) => string

  /**
   * Run `fn` with counters isolated: enables, resets, captures `before`,
   * runs, captures `after`, restores previous state. Returns both snapshots
   * and the diff. Safe to nest — state is saved and restored.
   */
  record: <T>(
    label: string,
    fn: () => T | Promise<T>,
  ) => Promise<{
    label: string
    result: T
    before: Record<CounterName, number>
    after: Record<CounterName, number>
    diff: CounterDiff
  }>

  /**
   * Mount the in-page overlay. Ctrl+Shift+P toggles visibility. Only one
   * overlay per window — calling twice destroys and remounts.
   */
  overlay: (options?: OverlayOptions) => OverlayHandle
}

export const perfHarness: PerfHarness = {
  enable: _enable,
  disable: _disable,
  isEnabled: _isEnabled,
  reset: _reset,
  snapshot: _snapshot,
  diff: diffSnapshots,
  formatDiff,
  record: async (label, fn) => {
    const wasEnabled = _isEnabled()
    const preserved = _snapshot()
    _enable()
    _reset()
    const before = _snapshot()
    const result = await fn()
    const after = _snapshot()
    const diff = diffSnapshots(before, after)
    // Restore: put counters back to the preserved state, toggle enabled
    // back to what it was. We have to keep `enabled=true` while re-writing
    // preserved values, since `_count` is a no-op when disabled.
    _reset()
    _enable()
    for (const [k, v] of Object.entries(preserved)) {
      if (v !== 0) _count(k, v)
    }
    if (!wasEnabled) _disable()
    return { label, result, before, after, diff }
  },
  overlay: mountOverlay,
}

// ─── Window global ───────────────────────────────────────────────────────────

const WINDOW_KEY = '__pyreon_perf__'

interface PerfGlobal {
  [WINDOW_KEY]?: PerfHarness
}

/**
 * Attach the harness to `globalThis.__pyreon_perf__` so it can be poked at
 * from the browser devtools console. Returns the harness either way so
 * server-side / non-DOM consumers can still use it directly.
 *
 * Also enables counter writes, since the common case for calling `install()`
 * is "I want to start measuring."
 */
export function install(): PerfHarness {
  _enable()
  const g = globalThis as unknown as PerfGlobal
  g[WINDOW_KEY] = perfHarness
  return perfHarness
}

/** Remove the window global (does NOT disable writes). */
export function uninstall(): void {
  const g = globalThis as unknown as PerfGlobal
  delete g[WINDOW_KEY]
}

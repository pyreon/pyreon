/**
 * Perf counters — what the framework actually DID during an interaction.
 *
 * Framework packages emit named counters through `globalThis.__pyreon_count__`
 * (see COUNTERS.md): `styler.resolve`, `rocketstyle.cacheHit`, mount counts,
 * `runtime.mountFor.lisOps`, and so on. The convention is deliberately
 * import-free — nothing pays for it until a consumer installs a sink — which is
 * why this module installs its own rather than depending on
 * `@pyreon/perf-harness`.
 *
 * Why it belongs in a workbench: a timing number tells you something got
 * slower; a counter tells you WHAT happened. "This interaction resolved 22
 * styles and mounted 40 components" is a diagnosis, and it is the exact signal
 * the rocketstyle-collapse work moved (styler.resolve 22 → 0). A regression
 * there is invisible to wall-clock on a fast machine and obvious here.
 *
 * ── Chaining, and why it is not optional ──────────────────────────────────
 *
 * A sink is a single global slot, so installing one naively DESTROYS whichever
 * sink was already there — the perf-dashboard's, or a host app's. This one
 * captures the previous sink and forwards every count to it, and uninstall
 * restores it rather than deleting the slot. Install is refcounted and
 * idempotent (leak class D): two panels can install, and the original is only
 * restored when the last one leaves.
 */

type Sink = (name: string, n?: number) => void

interface CountSlot {
  __pyreon_count__?: Sink
}

const slot = globalThis as CountSlot

/** name → total count since the last reset. */
let counts = new Map<string, number>()

let refCount = 0
/** The sink that was installed before us — forwarded to, and restored on uninstall. */
let previous: Sink | undefined
let ours: Sink | undefined

/**
 * Start collecting. Idempotent + refcounted: a second call increments rather
 * than re-wrapping, so the chain cannot grow a duplicate link and the original
 * sink is restored exactly once.
 */
export function installCounterSink(): void {
  refCount += 1
  if (refCount > 1) return
  previous = slot.__pyreon_count__
  ours = (name: string, n = 1) => {
    counts.set(name, (counts.get(name) ?? 0) + n)
    // Forward, so installing this panel never silently blinds another consumer.
    previous?.(name, n)
  }
  slot.__pyreon_count__ = ours
}

/** Stop collecting. Restores the previous sink when the last holder leaves. */
export function uninstallCounterSink(): void {
  if (refCount === 0) return
  refCount -= 1
  if (refCount > 0) return
  // Only restore if we are still the installed sink — if something else
  // installed after us, clobbering it would be the very bug this guards.
  if (slot.__pyreon_count__ === ours) {
    if (previous) slot.__pyreon_count__ = previous
    else delete slot.__pyreon_count__
  }
  previous = undefined
  ours = undefined
}

/** Drop everything collected so far. */
export function resetCounters(): void {
  counts = new Map()
}

/** A point-in-time copy. */
export function snapshotCounters(): Record<string, number> {
  return Object.fromEntries(counts)
}

export interface CounterRow {
  name: string
  /** count during the measured window */
  delta: number
}

/**
 * Counters that CHANGED between two snapshots, largest first.
 *
 * Only the delta is shown. A cumulative total is dominated by app startup and
 * says nothing about the interaction you just performed, which is the question
 * the panel exists to answer.
 */
export function counterDelta(
  before: Record<string, number>,
  after: Record<string, number>,
): CounterRow[] {
  const rows: CounterRow[] = []
  for (const [name, value] of Object.entries(after)) {
    const delta = value - (before[name] ?? 0)
    if (delta !== 0) rows.push({ name, delta })
  }
  return rows.sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name))
}

/**
 * Counters emit only in development — every emit site is behind a
 * `NODE_ENV !== 'production'` gate so the whole mechanism tree-shakes out.
 * A production build therefore records nothing, and an empty result there means
 * "not measurable", not "the interaction was free".
 */
export function areCountersAvailable(): boolean {
  return process.env.NODE_ENV !== 'production'
}

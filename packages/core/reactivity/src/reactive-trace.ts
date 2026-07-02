/**
 * Reactive trace — a bounded, dev-only ring buffer of recent signal
 * writes. When a signal-based UI throws, the single most useful
 * debugging question is "what reactive state changed in the run-up to
 * the crash" — a point-in-time snapshot of every signal value can't
 * answer that (it shows the end state, not the causal sequence). The
 * ring buffer records the last N writes so an error report can attach
 * the sequence that led into the bad state.
 *
 * Design constraints:
 *
 *   - **Bounded memory.** Fixed-size circular buffer (`CAP` entries).
 *     Never grows. Old entries overwrite oldest-first.
 *   - **No value retention.** Stores a TRUNCATED STRING preview of
 *     prev / next, never the raw value. Holding raw references would
 *     retain large arrays / detached DOM / closures in the buffer and
 *     leak them for the buffer's lifetime. The preview is also what
 *     makes the trace safely serializable into an error report.
 *   - **Cheap.** No stack capture (that's the expensive part of the
 *     `onSignalUpdate` debug path — this is deliberately lighter so it
 *     can record every write in dev without a perf cost). One object
 *     literal + one array slot write per signal write.
 *   - **Zero production cost.** The single call site in `signal.ts`
 *     is inside the existing `process.env.NODE_ENV !== 'production'`
 *     gate, so the whole module tree-shakes out of prod bundles.
 */

export interface ReactiveTraceEntry {
  /** Signal `label` (set via `signal(v, { name })` or the vite plugin's dev auto-naming). `undefined` for anonymous signals. */
  name: string | undefined
  /** Bounded string preview of the value before the write. */
  prev: string
  /** Bounded string preview of the value after the write. */
  next: string
  /** `performance.now()` at write time (monotonic; survives clock changes). */
  timestamp: number
}

/**
 * Ring-buffer capacity. 50 entries is enough to see the causal chain
 * for a crash (the writes in the few ticks before the throw) without
 * the buffer itself becoming a memory concern — each entry is a small
 * object with two short strings.
 */
const CAP = 50

// Lazily allocated — apps that never write a signal in dev (rare) pay
// nothing until the first write. `_count` is the monotonic total write
// count; `_count % CAP` is the next slot. Reading reconstructs
// chronological order from the wrapped buffer.
let _buf: (ReactiveTraceEntry | undefined)[] | null = null
let _count = 0

/** Max characters of a value preview before truncation. Keeps the buffer + serialized report small. */
const PREVIEW_MAX = 80

/**
 * Safe, bounded stringification. Never throws (a getter or `toJSON`
 * that throws must not break the trace recorder), never returns more
 * than `PREVIEW_MAX` chars + an ellipsis marker.
 */
function preview(v: unknown): string {
  let s: string
  try {
    if (v === null) return 'null'
    if (v === undefined) return 'undefined'
    const t = typeof v
    if (t === 'string') s = JSON.stringify(v) as string
    else if (t === 'number' || t === 'boolean' || t === 'bigint') s = String(v)
    else if (t === 'function') s = `[Function ${(v as { name?: string }).name || 'anonymous'}]`
    else if (t === 'symbol') s = (v as symbol).toString()
    else if (Array.isArray(v)) s = `Array(${(v as unknown[]).length})`
    else {
      // Plain-ish object: show the constructor name + a shallow key
      // hint. Avoid full JSON.stringify — it can be huge or throw on
      // cycles / BigInt / getters.
      const ctor = (v as { constructor?: { name?: string } }).constructor?.name
      const keys = (() => {
        try {
          return Object.keys(v as object).slice(0, 4)
        } catch {
          return []
        }
      })()
      s = `${ctor && ctor !== 'Object' ? ctor + ' ' : ''}{${keys.join(', ')}${keys.length === 4 ? ', …' : ''}}`
    }
  } catch {
    s = '[unstringifiable]'
  }
  return s.length > PREVIEW_MAX ? s.slice(0, PREVIEW_MAX) + '…' : s
}

/**
 * Record one signal write. Called from `signal.ts` `_set`, already
 * inside the prod-gate, so this never runs in production builds.
 *
 * @internal
 */
export function _recordSignalWrite(name: string | undefined, prev: unknown, next: unknown): void {
  if (_buf === null) _buf = new Array(CAP)
  _buf[_count % CAP] = {
    name,
    prev: preview(prev),
    next: preview(next),
    timestamp:
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now(),
  }
  _count++
}

/**
 * Returns the recorded writes in chronological order (oldest → newest),
 * at most `CAP` entries. Empty array when nothing has been recorded.
 * The returned array is a fresh copy — safe to retain / serialize
 * without pinning the ring buffer.
 *
 * Consumed by `@pyreon/core`'s `reportError` to attach `reactiveTrace`
 * to the error context.
 */
export function getReactiveTrace(): ReactiveTraceEntry[] {
  // Prod early-return: `_recordSignalWrite` call sites are NODE_ENV-gated, so
  // the ring buffer never fills in a production build — always [].
  if (process.env.NODE_ENV === 'production') return []
  if (_buf === null || _count === 0) return []
  if (_count <= CAP) {
    // Buffer not yet wrapped — entries 0.._count-1 are in order.
    return _buf.slice(0, _count) as ReactiveTraceEntry[]
  }
  // Wrapped: oldest entry is at `_count % CAP`, walk forward CAP slots.
  const start = _count % CAP
  const out: ReactiveTraceEntry[] = []
  for (let i = 0; i < CAP; i++) {
    const e = _buf[(start + i) % CAP]
    if (e) out.push(e)
  }
  return out
}

/** Clears the buffer. For test isolation; not part of the app-facing API. */
export function clearReactiveTrace(): void {
  _buf = null
  _count = 0
}

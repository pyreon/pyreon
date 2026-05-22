/**
 * @pyreon/reactivity debug utilities.
 *
 * Development-only tools for tracing signal updates, inspecting reactive
 * graphs, and understanding why DOM nodes re-render.
 *
 * All utilities are tree-shakeable — they compile away in production builds
 * when unused.
 */

import { defineCrossModuleState } from './cross-module-state'
import type { Signal, SignalDebugInfo } from './signal'

// ─── Signal update tracing ───────────────────────────────────────────────────

interface SignalUpdateEvent {
  /** The signal that changed */
  signal: Signal<unknown>
  /** Signal name (from options or label) */
  name: string | undefined
  /** Previous value */
  prev: unknown
  /** New value */
  next: unknown
  /** Stack trace at the point of the .set() / .update() call */
  stack: string
  /** Timestamp */
  timestamp: number
}

type SignalUpdateListener = (event: SignalUpdateEvent) => void

interface DebugState {
  traceListeners: SignalUpdateListener[] | null
  whyActive: boolean
  whyLog: { name: string | undefined; prev: unknown; next: unknown }[]
}

// Cross-module-instance shared debug state — listeners registered against
// one `@pyreon/reactivity` instance must fire for signal writes resolved
// against any other instance.
const _state = defineCrossModuleState<DebugState>('pyreon-reactivity/debug-state', () => ({
  traceListeners: null,
  whyActive: false,
  whyLog: [],
}))

/**
 * Register a listener that fires on every signal write.
 * Returns a dispose function.
 *
 * @example
 * const dispose = onSignalUpdate(e => {
 *   console.log(`${e.name ?? 'anonymous'}: ${e.prev} → ${e.next}`)
 * })
 */
export function onSignalUpdate(listener: SignalUpdateListener): () => void {
  if (!_state.traceListeners) _state.traceListeners = []
  _state.traceListeners.push(listener)
  return () => {
    if (!_state.traceListeners) return
    _state.traceListeners = _state.traceListeners.filter((l) => l !== listener)
    if (_state.traceListeners.length === 0) _state.traceListeners = null
  }
}

/** @internal — called from signal.set() when tracing is active */
export function _notifyTraceListeners(sig: Signal<unknown>, prev: unknown, next: unknown): void {
  if (!_state.traceListeners) return
  const event: SignalUpdateEvent = {
    signal: sig,
    name: sig.label,
    prev,
    next,
    stack: new Error().stack ?? '',
    timestamp: performance.now(),
  }
  for (const l of _state.traceListeners) l(event)
}

/** Check if any trace listeners are active (fast path for signal.set) */
export function isTracing(): boolean {
  return _state.traceListeners !== null
}

// ─── why() — trace which signal caused a re-run ──────────────────────────────

/**
 * Trace the next signal update. Logs which signals fire and what changed.
 * Call before triggering a state change to see what updates and why.
 *
 * @example
 * why()
 * count.set(5)
 * // Console: [pyreon:why] "count": 3 → 5 (2 subscribers)
 */
export function why(): void {
  if (_state.whyActive) return
  _state.whyActive = true
  _state.whyLog = []

  const dispose = onSignalUpdate((e) => {
    const _subCount = (e.signal as unknown as { _s: Set<unknown> | null })._s?.size ?? 0
    const _name = e.name ? `"${e.name}"` : '(anonymous signal)'

    console.log(
      `[pyreon:why] ${_name}: ${JSON.stringify(e.prev)} → ${JSON.stringify(e.next)} (${_subCount} subscriber${_subCount === 1 ? '' : 's'})`,
    )
    _state.whyLog.push({ name: e.name, prev: e.prev, next: e.next })
  })

  // Auto-dispose after the current microtask (captures the synchronous batch)
  queueMicrotask(() => {
    dispose()
    if (_state.whyLog.length === 0) {
      console.log('[pyreon:why] No signal updates detected')
    }
    _state.whyActive = false
    _state.whyLog = []
  })
}

// ─── inspectSignal — rich console output ─────────────────────────────────────

/**
 * Print a signal's current state to the console in a readable format.
 *
 * @example
 * const count = signal(42, { name: "count" })
 * inspectSignal(count)
 * // Console:
 * // 🔍 Signal "count"
 * //   value: 42
 * //   subscribers: 3
 */
export function inspectSignal<T>(sig: Signal<T>): SignalDebugInfo<T> {
  const info = sig.debug()

  console.group(`🔍 Signal ${info.name ? `"${info.name}"` : '(anonymous)'}`)
  console.log('value:', info.value)
  console.log('subscribers:', info.subscriberCount)
  console.groupEnd()

  return info
}

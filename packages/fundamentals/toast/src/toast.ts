import type { VNodeChild } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import type { Toast, ToastOptions, ToastPromiseOptions, ToastType } from './types'

// ─── State ───────────────────────────────────────────────────────────────────

let _idCounter = 0
const DEFAULT_DURATION = 4000

/**
 * App-wide default auto-dismiss duration, settable via `<Toaster duration={…}>`.
 * The store is module-level (toasts can be created before the Toaster mounts),
 * so the Toaster writes this default on setup and `addToast` reads it for any
 * toast that doesn't specify its own `duration`. Falls back to DEFAULT_DURATION
 * when no Toaster has set it.
 */
let _defaultDuration = DEFAULT_DURATION

/** @internal Set the app-wide default duration. Called by `<Toaster duration>`. */
export function _setDefaultDuration(ms: number): void {
  _defaultDuration = ms
}

/**
 * Hard cap on the queue. Without this, runaway loops (e.g. a toast call from
 * inside an effect that re-fires on every store mutation, or a WebSocket
 * `onmessage` that surfaces every event as a toast) accumulate forever and
 * each `_toasts.set([..._toasts(), t])` write becomes O(N) — the queue's
 * memory + per-write spread cost grow unboundedly. Beyond ~20 visible toasts
 * the user can't read them anyway, so newest-wins (drop oldest) is the right
 * policy. 50 is generous headroom for legitimate burst patterns (form
 * validation surfacing many errors at once, batch import results).
 */
export const MAX_TOASTS = 50

/**
 * Module-level signal holding the active toast stack.
 * Consumed by the `Toaster` component.
 */
export const _toasts = signal<Toast[]>([])

/**
 * `id → Toast` lookup, derived once per `_toasts` change.
 *
 * Load-bearing for the Toaster's per-row reactivity. `<For by={id}>` rows mount
 * ONCE per key (W22 contract) — the `item` passed to the render callback is a
 * snapshot, so reading `toast.message`/`type`/`state` off it goes stale when an
 * update/promise-transition/entering→visible promotion REPLACES the toast
 * object under the same id. Each `ToastItem` instead reads its live fields via
 * `_toastMap().get(id)` inside reactive thunks, so a single update patches only
 * that toast's text node / className in place — 0 component re-renders. Same
 * pattern as `@pyreon/flow`'s `nodeMap` (O(N) rebuild once + O(1) per-row get,
 * never the O(N²) of a per-row `_toasts().find()`).
 */
export const _toastMap = computed(() => {
  const m = new Map<string, Toast>()
  for (const t of _toasts()) m.set(t.id, t)
  return m
})

// ─── Internal helpers ────────────────────────────────────────────────────────

function generateId(): string {
  return `pyreon-toast-${++_idCounter}`
}

function startTimer(t: Toast): void {
  if (t.duration <= 0) return
  t.timerStart = Date.now()
  t.remaining = t.duration
  t.timer = setTimeout(() => dismiss(t.id), t.duration)
}

function addToast(message: string | VNodeChild, options: ToastOptions = {}): string {
  const id = generateId()
  const t: Toast = {
    id,
    message,
    type: options.type ?? 'info',
    duration: options.duration ?? _defaultDuration,
    description: options.description,
    icon: options.icon,
    dismissible: options.dismissible ?? true,
    action: options.action,
    onDismiss: options.onDismiss,
    state: 'entering',
    timer: undefined,
    remaining: 0,
    timerStart: 0,
  }

  startTimer(t)

  // Append + cap at MAX_TOASTS, evicting oldest. Cancel the dropped entry's
  // timer + onDismiss so it doesn't fire after eviction (mirrors the dismiss
  // path's cleanup).
  const current = _toasts()
  if (current.length >= MAX_TOASTS) {
    const dropped = current[0]
    // `dropped` is always defined here — the array has >= MAX_TOASTS entries,
    // so index 0 exists; the guard is a defensive narrow for `current[0]`'s
    // `T | undefined` type.
    /* v8 ignore next */
    if (dropped) {
      if (dropped.timer !== undefined) clearTimeout(dropped.timer)
      dropped.onDismiss?.()
    }
    _toasts.set([...current.slice(1), t])
  } else {
    _toasts.set([...current, t])
  }

  return id
}

function dismiss(id?: string): void {
  const current = _toasts()

  if (id === undefined) {
    // Clear all
    for (const t of current) {
      if (t.timer !== undefined) clearTimeout(t.timer)
      t.onDismiss?.()
    }
    _toasts.set([])
    return
  }

  const match = current.find((item) => item.id === id)
  if (!match) return

  if (match.timer !== undefined) clearTimeout(match.timer)
  match.onDismiss?.()
  _toasts.set(current.filter((item) => item.id !== id))
}

function updateToast(
  id: string,
  updates: Partial<Pick<Toast, 'message' | 'type' | 'duration' | 'description'>>,
): void {
  const current = _toasts()
  const idx = current.findIndex((item) => item.id === id)
  if (idx === -1) return

  const t = current[idx] as Toast
  if (t.timer !== undefined) clearTimeout(t.timer)

  const updated: Toast = {
    ...t,
    message: updates.message ?? t.message,
    type: updates.type ?? t.type,
    duration: updates.duration ?? t.duration,
    description: updates.description ?? t.description,
    timer: undefined,
    remaining: 0,
    timerStart: 0,
  }

  const duration = updates.duration ?? t.duration
  updated.duration = duration
  startTimer(updated)

  const next = [...current]
  next[idx] = updated
  _toasts.set(next)
}

// ─── Pause / resume (for hover) ─────────────────────────────────────────────

export function _pauseAll(): void {
  for (const t of _toasts()) {
    if (t.timer !== undefined) {
      clearTimeout(t.timer)
      t.remaining = Math.max(0, t.remaining - (Date.now() - t.timerStart))
      t.timer = undefined
    }
  }
}

export function _resumeAll(): void {
  for (const t of _toasts()) {
    if (t.duration > 0 && t.timer === undefined && t.remaining > 0) {
      t.timerStart = Date.now()
      t.timer = setTimeout(() => dismiss(t.id), t.remaining)
    }
  }
}

// ─── Public imperative API ───────────────────────────────────────────────────

/**
 * Show a toast notification.
 *
 * @example
 * toast("Saved!")
 * toast("Error occurred", { type: "error", duration: 6000 })
 *
 * @returns The toast id — pass to `toast.dismiss(id)` to remove it.
 */
export function toast(message: string | VNodeChild, options?: ToastOptions): string {
  return addToast(message, options)
}

function shortcut(type: ToastType) {
  return (message: string | VNodeChild, options?: Omit<ToastOptions, 'type'>): string =>
    addToast(message, { ...options, type })
}

/** Show a success toast. */
toast.success = shortcut('success')

/** Show an error toast. */
toast.error = shortcut('error')

/** Show a warning toast. */
toast.warning = shortcut('warning')

/** Show an info toast. */
toast.info = shortcut('info')

/** Show a persistent loading toast. Returns id for later update/dismiss. */
toast.loading = (
  message: string | VNodeChild,
  options?: Omit<ToastOptions, 'type' | 'duration'>,
): string => addToast(message, { ...options, type: 'info', duration: 0 })

/** Update an existing toast (message, type, duration, description). */
toast.update = (
  id: string,
  updates: Partial<Pick<ToastOptions, 'type' | 'duration' | 'description'>> & {
    message?: string | VNodeChild
  },
): void => updateToast(id, updates)

/** Dismiss a specific toast by id, or all toasts if no id is given. */
toast.dismiss = dismiss

/**
 * Show a loading toast that updates on promise resolution or rejection.
 *
 * @example
 * toast.promise(saveTodo(), {
 *   loading: "Saving...",
 *   success: "Saved!",
 *   error: "Failed to save",
 * })
 */
toast.promise = function toastPromise<T>(
  promise: Promise<T>,
  opts: ToastPromiseOptions<T>,
): Promise<T> {
  const id = addToast(opts.loading, { type: 'info', duration: 0 })

  promise.then(
    (data) => {
      const msg = typeof opts.success === 'function' ? opts.success(data) : opts.success
      updateToast(id, { message: msg, type: 'success', duration: _defaultDuration })
    },
    (err: unknown) => {
      const msg = typeof opts.error === 'function' ? opts.error(err) : opts.error
      updateToast(id, { message: msg, type: 'error', duration: _defaultDuration })
    },
  )

  return promise
}

// ─── Test utilities ──────────────────────────────────────────────────────────

/** @internal Reset state for testing. */
export function _reset(): void {
  const current = _toasts()
  for (const t of current) {
    if (t.timer !== undefined) clearTimeout(t.timer)
  }
  _toasts.set([])
  _idCounter = 0
  _defaultDuration = DEFAULT_DURATION
}

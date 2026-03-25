import type { VNodeChild } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import type { Toast, ToastOptions, ToastPromiseOptions, ToastType } from "./types"

// ─── State ───────────────────────────────────────────────────────────────────

let _idCounter = 0
const DEFAULT_DURATION = 4000

/**
 * Module-level signal holding the active toast stack.
 * Consumed by the `Toaster` component.
 */
export const _toasts = signal<Toast[]>([])

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
    type: options.type ?? "info",
    duration: options.duration ?? DEFAULT_DURATION,
    dismissible: options.dismissible ?? true,
    action: options.action,
    onDismiss: options.onDismiss,
    state: "entering",
    timer: undefined,
    remaining: 0,
    timerStart: 0,
  }

  startTimer(t)
  _toasts.set([..._toasts(), t])

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
  updates: Partial<Pick<Toast, "message" | "type" | "duration">>,
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
  return (message: string | VNodeChild, options?: Omit<ToastOptions, "type">): string =>
    addToast(message, { ...options, type })
}

/** Show a success toast. */
toast.success = shortcut("success")

/** Show an error toast. */
toast.error = shortcut("error")

/** Show a warning toast. */
toast.warning = shortcut("warning")

/** Show an info toast. */
toast.info = shortcut("info")

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
  const id = addToast(opts.loading, { type: "info", duration: 0 })

  promise.then(
    (data) => {
      const msg = typeof opts.success === "function" ? opts.success(data) : opts.success
      updateToast(id, { message: msg, type: "success", duration: DEFAULT_DURATION })
    },
    (err: unknown) => {
      const msg = typeof opts.error === "function" ? opts.error(err) : opts.error
      updateToast(id, { message: msg, type: "error", duration: DEFAULT_DURATION })
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
}

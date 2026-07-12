import type { VNodeChild } from '@pyreon/core'

// ─── Public types ────────────────────────────────────────────────────────────

export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastOptions {
  /** Toast variant — controls styling. */
  type?: ToastType
  /** Auto-dismiss delay in ms. Default: the Toaster's `duration` (4000). Set 0 for persistent. */
  duration?: number
  /** Optional secondary line rendered under the message. */
  description?: string | VNodeChild
  /** Optional leading icon (any VNode — e.g. an SVG or `<Icon>`). */
  icon?: VNodeChild
  /** Whether the toast shows a dismiss button. Default: true. */
  dismissible?: boolean
  /** Optional action button. */
  action?: { label: string; onClick: () => void }
  /** Called when the toast is dismissed (manually or by timeout). */
  onDismiss?: () => void
}

export interface ToasterProps {
  /** Default position for all toasts. Default: "top-right". */
  position?: ToastPosition
  /** Maximum visible toasts. Default: 5. */
  max?: number
  /** Gap between toasts in px. Default: 8. */
  gap?: number
  /** Offset from viewport edge in px. Default: 16. */
  offset?: number
  /** Default auto-dismiss duration in ms for toasts that don't set their own. Default: 4000. Set 0 for persistent-by-default. */
  duration?: number
}

export interface ToastPromiseOptions<T> {
  loading: string | VNodeChild
  success: string | VNodeChild | ((data: T) => string | VNodeChild)
  error: string | VNodeChild | ((err: unknown) => string | VNodeChild)
}

// ─── Internal types ──────────────────────────────────────────────────────────

export type ToastState = 'entering' | 'visible' | 'exiting'

export interface Toast {
  id: string
  message: string | VNodeChild
  type: ToastType
  duration: number
  description: string | VNodeChild | undefined
  icon: VNodeChild | undefined
  dismissible: boolean
  action: { label: string; onClick: () => void } | undefined
  onDismiss: (() => void) | undefined
  state: ToastState
  timer: ReturnType<typeof setTimeout> | undefined
  /**
   * Leave-animation timer. A soft `dismiss` flips `state` to `'exiting'` (so the
   * CSS leave transition plays) and schedules the hard removal via this timer.
   * A hard `remove` (or `_reset`) clears it. `undefined` while the toast is
   * `entering`/`visible`.
   */
  leaveTimer: ReturnType<typeof setTimeout> | undefined
  /** Remaining ms when timer was paused (hover). */
  remaining: number
  /** Timestamp when current timer started. */
  timerStart: number
}

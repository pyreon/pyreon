import type { VNodeChild } from "@pyreon/core"

// ─── Public types ────────────────────────────────────────────────────────────

export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export type ToastType = "info" | "success" | "warning" | "error"

export interface ToastOptions {
  /** Toast variant — controls styling. */
  type?: ToastType
  /** Auto-dismiss delay in ms. Default: 4000. Set 0 for persistent. */
  duration?: number
  /** Screen position. Default: inherited from Toaster. */
  position?: ToastPosition
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
}

export interface ToastPromiseOptions<T> {
  loading: string | VNodeChild
  success: string | VNodeChild | ((data: T) => string | VNodeChild)
  error: string | VNodeChild | ((err: unknown) => string | VNodeChild)
}

// ─── Internal types ──────────────────────────────────────────────────────────

export type ToastState = "entering" | "visible" | "exiting"

export interface Toast {
  id: string
  message: string | VNodeChild
  type: ToastType
  duration: number
  dismissible: boolean
  action: { label: string; onClick: () => void } | undefined
  onDismiss: (() => void) | undefined
  state: ToastState
  timer: ReturnType<typeof setTimeout> | undefined
  /** Remaining ms when timer was paused (hover). */
  remaining: number
  /** Timestamp when current timer started. */
  timerStart: number
}

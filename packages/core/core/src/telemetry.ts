/**
 * Error telemetry — hook into Pyreon's error reporting for Sentry, Datadog, etc.
 *
 * @example
 * import { registerErrorHandler } from "@pyreon/core"
 * import * as Sentry from "@sentry/browser"
 *
 * registerErrorHandler(ctx => {
 *   Sentry.captureException(ctx.error, {
 *     extra: { component: ctx.component, phase: ctx.phase },
 *   })
 * })
 */

export interface ErrorContext {
  /** Component function name, or "Anonymous" */
  component: string
  /** Lifecycle phase where the error occurred */
  phase: "setup" | "render" | "mount" | "unmount" | "effect"
  /** The thrown value */
  error: unknown
  /** Unix timestamp (ms) */
  timestamp: number
  /** Component props at the time of the error */
  props?: Record<string, unknown>
}

export type ErrorHandler = (ctx: ErrorContext) => void

let _handlers: ErrorHandler[] = []

/**
 * Register a global error handler. Called whenever a component throws in any
 * lifecycle phase. Returns an unregister function.
 */
export function registerErrorHandler(handler: ErrorHandler): () => void {
  _handlers.push(handler)
  return () => {
    _handlers = _handlers.filter((h) => h !== handler)
  }
}

/**
 * Internal — called by the runtime whenever a component error is caught.
 * Existing console.error calls are preserved; this is additive.
 */
export function reportError(ctx: ErrorContext): void {
  for (const h of _handlers) {
    try {
      h(ctx)
    } catch {
      // handler errors must never propagate back into the framework
    }
  }
}

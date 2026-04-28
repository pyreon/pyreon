/**
 * Error telemetry — hook into Pyreon's error reporting for Sentry, Datadog, etc.
 *
 * Captures errors from ALL lifecycle phases including reactive effects.
 * `effect()` errors thrown by `@pyreon/reactivity` are bridged through a
 * globalThis sink (no upward import — reactivity doesn't depend on core).
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
  /** Component function name, "Anonymous", or "Effect" for reactive effects */
  component: string
  /** Lifecycle phase where the error occurred */
  phase: 'setup' | 'render' | 'mount' | 'unmount' | 'effect'
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
 * lifecycle phase, OR an effect throws in `@pyreon/reactivity`. Returns an
 * unregister function.
 *
 * Also installs a `globalThis.__pyreon_report_error__` bridge so the
 * reactivity package (which can't depend on core) can forward effect errors
 * into the same telemetry pipeline. Pre-fix the two surfaces were
 * disconnected — Sentry/Datadog wiring missed effect-thrown errors.
 */
export function registerErrorHandler(handler: ErrorHandler): () => void {
  _handlers.push(handler)
  _installReactivityBridge()
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

// ─── Reactivity bridge ──────────────────────────────────────────────────────
// Installs `globalThis.__pyreon_report_error__` so `@pyreon/reactivity`
// effect-error path can forward into reportError. Idempotent — multiple
// `registerErrorHandler` calls install once.

interface PyreonErrorBridge {
  __pyreon_report_error__?: (err: unknown, phase: 'effect') => void
}
const _bridgeHost = globalThis as PyreonErrorBridge

function _installReactivityBridge(): void {
  if (_bridgeHost.__pyreon_report_error__) return
  _bridgeHost.__pyreon_report_error__ = (err, phase) => {
    reportError({ component: 'Effect', phase, error: err, timestamp: Date.now() })
  }
}

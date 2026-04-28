/**
 * Hydration mismatch warnings + telemetry hook.
 *
 * Two complementary surfaces:
 *
 * 1. **Dev-mode console.warn** — enabled automatically when
 *    `NODE_ENV !== "production"` (and silent otherwise, matching React /
 *    Vue / Solid). Toggle manually with `enableHydrationWarnings()` /
 *    `disableHydrationWarnings()` if you need verbose production debugging.
 *
 * 2. **Telemetry callback** — register a handler with
 *    `onHydrationMismatch(handler)` to forward every mismatch into your
 *    error-tracking pipeline (Sentry, Datadog, etc.). Fires on EVERY
 *    mismatch, in development AND production, regardless of the warn
 *    toggle. Returns an unregister function.
 *
 * The dev warn and the telemetry callback are independent: a production
 * deployment can install Sentry forwarding via `onHydrationMismatch`
 * WITHOUT enabling the noisy console output.
 *
 * @example — dev console
 * import { enableHydrationWarnings } from "@pyreon/runtime-dom"
 * enableHydrationWarnings()
 *
 * @example — production telemetry
 * import { onHydrationMismatch } from "@pyreon/runtime-dom"
 * import * as Sentry from "@sentry/browser"
 *
 * onHydrationMismatch(ctx => {
 *   Sentry.captureMessage(`Hydration mismatch (${ctx.type})`, {
 *     extra: { expected: ctx.expected, actual: ctx.actual, path: ctx.path },
 *     level: 'warning',
 *   })
 * })
 */

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

let _enabled = __DEV__

export function enableHydrationWarnings(): void {
  _enabled = true
}

export function disableHydrationWarnings(): void {
  _enabled = false
}

// ─── Telemetry callback ─────────────────────────────────────────────────────

export type HydrationMismatchType = 'tag' | 'text' | 'missing'

export interface HydrationMismatchContext {
  /** Kind of mismatch */
  type: HydrationMismatchType
  /** What the VNode expected */
  expected: unknown
  /** What the DOM had */
  actual: unknown
  /** Human-readable path in the tree, e.g. "root > div > span" */
  path: string
  /** Unix timestamp (ms) */
  timestamp: number
}

export type HydrationMismatchHandler = (ctx: HydrationMismatchContext) => void

let _handlers: HydrationMismatchHandler[] = []

/**
 * Register a hydration mismatch handler. Called on every mismatch in BOTH
 * development and production, independent of the dev-mode warn toggle.
 *
 * Mirrors `@pyreon/core`'s `registerErrorHandler` pattern — multiple
 * handlers can be registered; each is called in registration order;
 * handler errors are swallowed so they don't propagate into the
 * framework. Returns an unregister function.
 */
export function onHydrationMismatch(handler: HydrationMismatchHandler): () => void {
  _handlers.push(handler)
  return () => {
    _handlers = _handlers.filter((h) => h !== handler)
  }
}

/**
 * Emit a hydration mismatch warning.
 * @param type  - Kind of mismatch
 * @param expected - What the VNode expected
 * @param actual   - What the DOM had
 * @param path     - Human-readable path in the tree, e.g. "root > div > span"
 */
export function warnHydrationMismatch(
  type: HydrationMismatchType,
  expected: unknown,
  actual: unknown,
  path: string,
): void {
  // Dev-mode console.warn — gated on _enabled (default __DEV__).
  if (_enabled) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] Hydration mismatch (${type}): expected ${String(expected)}, got ${String(actual)} at ${path}`,
    )
  }

  // Telemetry callbacks — fire in BOTH dev and prod, independent of the
  // warn toggle. This is the production observability hook (Sentry,
  // Datadog, etc.) that pre-fix was missing entirely.
  if (_handlers.length > 0) {
    const ctx: HydrationMismatchContext = {
      type,
      expected,
      actual,
      path,
      timestamp: Date.now(),
    }
    for (const h of _handlers) {
      try {
        h(ctx)
      } catch {
        // handler errors must never propagate back into the hydration
        // pipeline — a broken Sentry SDK shouldn't crash the app.
      }
    }
  }
}

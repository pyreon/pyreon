// Global handler for errors thrown inside effects, computeds and cleanups;
// defaults to console.error so failures are never silently swallowed. Two
// surfaces fire on every error: the `setErrorHandler` handler, and a globalThis
// bridge `__pyreon_report_error__` that `@pyreon/core` installs so effect
// errors reach the same telemetry pipeline as component errors. globalThis
// based to avoid an upward import. New consumers should prefer core's
// `registerErrorHandler`.
//
// Its own module so the graph engine (`graph.ts`, which evaluates computeds)
// and `effect.ts` can both report without importing each other.

interface PyreonErrorBridge {
  __pyreon_report_error__?: (err: unknown, phase: 'effect') => void
}

const _errorBridge = globalThis as PyreonErrorBridge

function _defaultErrorHandler(err: unknown): void {
  // Last-resort reporter — MUST fire in production too. Silently swallowing an
  // uncaught effect error is a serious bug; React/Vue/Solid all log in prod.
  // pyreon-lint-disable-next-line pyreon/dev-guard-warnings
  console.error('[pyreon] Unhandled effect error:', err)
}

const _eh: { u: ((err: unknown) => void) | undefined } = { u: undefined }

export const _errorHandler: (err: unknown) => void = (err) => {
  // 1. User-set or default direct handler.
  ;(_eh.u ?? _defaultErrorHandler)(err)
  // 2. Global telemetry bridge (installed by @pyreon/core's
  //    registerErrorHandler). Forwards effect errors into reportError so
  //    Sentry/Datadog wiring captures them alongside component errors.
  _errorBridge.__pyreon_report_error__?.(err, 'effect')
}

export function setErrorHandler(fn: (err: unknown) => void): void {
  _eh.u = fn
}

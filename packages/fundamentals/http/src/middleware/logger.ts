/**
 * Request logging.
 *
 * Gated on `process.env.NODE_ENV !== 'production'` by default — the
 * bundler-agnostic form the framework standardises on (`typeof process` is
 * dead in Vite browser bundles; `import.meta.env.DEV` is Vite-only). Never
 * assigned to a local `__DEV__` const: Bun.build does not fold through the
 * alias, so the strings would ship.
 */

import type { HttpMiddleware } from '../types'

export interface LoggerOptions {
  /** Emit the log line. Default `console.debug`. */
  log?: ((line: string, detail: Record<string, unknown>) => void) | undefined
  /** Log in production too. Default `false`. */
  production?: boolean | undefined
}

/** Build the logging middleware. */
export function logger(options: LoggerOptions = {}): HttpMiddleware {
  const emit =
    options.log ??
    ((line: string, detail: Record<string, unknown>): void => {
      // `no-console` allows only warn/error, on the reasoning that library
      // diagnostics are legitimate but a stray `console.log` is not. A
      // per-request trace is exactly such a diagnostic, and `debug` is the
      // correct level for it: `warn` would make every SUCCESSFUL request a
      // warning, which is both semantically wrong and unfilterable for
      // anyone watching for real warnings.
      // oxlint-disable-next-line no-console
      console.debug(line, detail)
    })

  return async function loggerMiddleware(request, next) {
    if (!options.production && process.env.NODE_ENV === 'production') return next()

    const started = Date.now()
    try {
      const response = await next()
      emit(`[Pyreon] http ${request.method} ${request.url} → ${response.status}`, {
        ms: Date.now() - started,
      })
      return response
    } catch (error) {
      emit(`[Pyreon] http ${request.method} ${request.url} → failed`, {
        ms: Date.now() - started,
        error,
      })
      throw error
    }
  }
}

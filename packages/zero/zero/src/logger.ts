/**
 * Request logging middleware.
 *
 * Logs HTTP requests with method, path, status, and duration.
 * Supports custom formatters and log levels.
 *
 * @example
 * ```ts
 * import { loggerMiddleware } from "@pyreon/zero"
 *
 * export default defineConfig({
 *   middleware: [loggerMiddleware()],
 * })
 * ```
 */
import type { Middleware, MiddlewareContext } from '@pyreon/server'

export interface LoggerConfig {
  /**
   * Log level — controls which requests are logged.
   * - "all": log every request
   * - "none": disable logging
   * Default: "all"
   */
  level?: 'all' | 'none'
  /**
   * Custom log formatter. Receives request details and returns
   * the string to log (or null to skip).
   */
  format?: (entry: LogEntry) => string | null
  /**
   * Skip logging for these path prefixes.
   * Default: ["/__", "/@", "/node_modules"]
   */
  skip?: string[]
  /**
   * Enable colorized output (ANSI codes).
   * Default: true in development, false in production.
   */
  colors?: boolean
}

export interface LogEntry {
  method: string
  path: string
  duration: number
  timestamp: Date
  userAgent?: string | undefined
  ip?: string | undefined
}

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

function methodColor(method: string, colors: boolean): string {
  if (!colors) return method.padEnd(7)
  const padded = method.padEnd(7)
  switch (method) {
    case 'GET': return `${COLORS.green}${padded}${COLORS.reset}`
    case 'POST': return `${COLORS.cyan}${padded}${COLORS.reset}`
    case 'PUT': return `${COLORS.yellow}${padded}${COLORS.reset}`
    case 'PATCH': return `${COLORS.yellow}${padded}${COLORS.reset}`
    case 'DELETE': return `${COLORS.red}${padded}${COLORS.reset}`
    default: return `${COLORS.magenta}${padded}${COLORS.reset}`
  }
}

function defaultFormat(entry: LogEntry, colors: boolean): string {
  const dur = entry.duration < 1
    ? '<1ms'
    : entry.duration < 1000
      ? `${Math.round(entry.duration)}ms`
      : `${(entry.duration / 1000).toFixed(2)}s`

  const dim = colors ? COLORS.dim : ''
  const reset = colors ? COLORS.reset : ''

  return `  ${methodColor(entry.method, colors)} ${entry.path} ${dim}${dur}${reset}`
}

/**
 * Request logging middleware.
 *
 * Logs incoming requests with method, path, and duration.
 * Runs in middleware phase — logs timing from middleware start to
 * microtask completion (approximate request duration).
 *
 * @example
 * ```ts
 * // Basic usage
 * loggerMiddleware()
 *
 * // Custom format
 * loggerMiddleware({
 *   format: (e) => `${e.method} ${e.path} (${e.duration}ms)`,
 * })
 * ```
 */
export function loggerMiddleware(config?: LoggerConfig): Middleware {
  const level = config?.level ?? 'all'
  if (level === 'none') return () => {}

  const skip = config?.skip ?? ['/__', '/@', '/node_modules']
  const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
  const colors = config?.colors ?? isDev

  return (ctx: MiddlewareContext) => {
    // Skip internal paths
    if (skip.some((p) => ctx.path.startsWith(p))) return

    const start = performance.now()

    const entry: LogEntry = {
      method: ctx.req.method ?? 'GET',
      path: ctx.path,
      duration: 0,
      timestamp: new Date(),
      userAgent: ctx.req.headers.get('user-agent') ?? undefined,
    }

    // Use queueMicrotask to log after the middleware chain completes
    queueMicrotask(() => {
      entry.duration = performance.now() - start

      if (config?.format) {
        const line = config.format(entry)
        if (line) {
          // oxlint-disable-next-line no-console
          console.log(line)
        }
      } else {
        // oxlint-disable-next-line no-console
        console.log(defaultFormat(entry, colors))
      }
    })
  }
}

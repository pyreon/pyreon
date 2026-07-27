/**
 * Retry middleware — OPT-IN by design.
 *
 * `ky` retries by default. Here that would compound: `@pyreon/query`
 * already retries 3× on its own, so a client-level default of 3 turns one
 * logical query into NINE requests, and nothing in devtools tells you why.
 * Making retry an explicit `use: [retry()]` keeps the composed behaviour
 * legible — you can always see the total in one place.
 *
 * Only possible as ordinary middleware because `next()` may be called more
 * than once (see `chain.ts`); an axios interceptor pair cannot re-enter the
 * chain, which is why axios users end up hanging `config.__isRetry` flags
 * off the request.
 */

import { isAbortError } from '../errors'
import type { HttpMethod, HttpMiddleware, HttpResponse } from '../types'

/** Methods that are safe to replay. POST is excluded — it is not idempotent. */
const IDEMPOTENT: readonly HttpMethod[] = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']

/** Statuses worth replaying: transient overload / gateway problems. */
const RETRYABLE: readonly number[] = [408, 413, 429, 500, 502, 503, 504]

export interface RetryOptions {
  /** Number of RETRIES after the initial attempt. Default 2. */
  limit?: number | undefined
  /** Methods eligible for retry. Default: idempotent methods only. */
  methods?: readonly HttpMethod[] | undefined
  /** Statuses eligible for retry. Default `[408, 413, 429, 500, 502, 503, 504]`. */
  statuses?: readonly number[] | undefined
  /** Retry transport failures (offline, DNS). Default `true`. */
  network?: boolean | undefined
  /** Delay before attempt `n` (1-based). Default: exponential + jitter. */
  backoff?: ((attempt: number) => number) | undefined
  /** Honour a `Retry-After` response header. Default `true`. */
  respectRetryAfter?: boolean | undefined
  /** Upper bound for any single wait, in ms. Default 30_000. */
  maxDelay?: number | undefined
}

/** Exponential backoff with full jitter — avoids a synchronised thundering herd. */
function defaultBackoff(attempt: number): number {
  const base = Math.min(1000 * 2 ** (attempt - 1), 20_000)
  return Math.round(base / 2 + Math.random() * (base / 2))
}

/** `Retry-After` is either delta-seconds or an HTTP date. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}

/**
 * Sleep that resolves early if the request is aborted.
 *
 * A plain `setTimeout` would keep a cancelled request "in flight" for the
 * whole backoff window; the listener and the timer are both released in
 * `finally` (leak classes D and I).
 */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    let onAbort: (() => void) | undefined
    const timer = setTimeout(() => {
      if (onAbort && signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal) {
      onAbort = () => {
        clearTimeout(timer)
        resolve()
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/** Build the retry middleware. */
export function retry(options: RetryOptions = {}): HttpMiddleware {
  const limit = options.limit ?? 2
  const methods = options.methods ?? IDEMPOTENT
  const statuses = options.statuses ?? RETRYABLE
  const network = options.network ?? true
  const backoff = options.backoff ?? defaultBackoff
  const respectRetryAfter = options.respectRetryAfter ?? true
  const maxDelay = options.maxDelay ?? 30_000

  return async function retryMiddleware(request, next) {
    if (limit <= 0 || !methods.includes(request.method)) return next()

    let attempt = 0
    for (;;) {
      let response: HttpResponse | undefined
      try {
        response = await next()
        if (!statuses.includes(response.status)) return response
      } catch (error) {
        // Cancellation is never a failure to retry — replaying it would
        // resurrect a request the caller already gave up on.
        if (isAbortError(error) || !network || attempt >= limit) throw error
        attempt += 1
        await sleep(Math.min(backoff(attempt), maxDelay), request.signal)
        if (request.signal?.aborted) throw error
        continue
      }

      if (attempt >= limit) return response

      attempt += 1
      const after = respectRetryAfter
        ? parseRetryAfter(response.headers.get('retry-after'))
        : undefined
      await sleep(Math.min(after ?? backoff(attempt), maxDelay), request.signal)
      if (request.signal?.aborted) return response
    }
  }
}

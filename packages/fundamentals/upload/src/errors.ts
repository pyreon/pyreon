import type { UploadError } from './types'

/** Statuses a retry can fix: the request timed out, the server is busy or failing. */
const RETRYABLE = new Set([408, 425, 429])

/** Build an `UploadError`. Transports reject with these so the queue knows whether to retry. */
export function uploadError(kind: UploadError['kind'], message: string, extra?: Partial<Omit<UploadError, 'kind' | 'message'>>): UploadError {
  const retryable = extra?.retryable ?? (kind === 'network' || kind === 'timeout')

  return { kind, message, ...extra, retryable }
}

export function isUploadError(x: unknown): x is UploadError {
  if (typeof x !== 'object' || x === null) return false
  const e = x as Record<string, unknown>

  return typeof e.kind === 'string' && typeof e.message === 'string' && typeof e.retryable === 'boolean' && ['rejected', 'network', 'server', 'aborted', 'timeout'].includes(e.kind)
}

/** Is this status worth another attempt? 408, 425, 429 and 5xx are; other 4xx (validation, auth, size) never are. */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE.has(status) || (status >= 500 && status <= 599)
}

/**
 * `Retry-After` as milliseconds: whole seconds (`"120"`) or an HTTP date (`"Wed, 21 Oct 2026 07:28:00 GMT"`). Anything else,
 * a negative number and a date in the past give `undefined` or 0 as the header means: wait that long, never a negative time.
 */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (value === null || value === undefined) return undefined
  const text = value.trim()

  if (/^\d+$/.test(text)) return Math.min(Number(text), 86_400) * 1000
  if (text === '' || /^[-+.\d]*$/.test(text)) return undefined
  const at = Date.parse(text)

  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}

/** The error for a failed HTTP response. Never retries a 4xx other than 408, 425 and 429; honours `Retry-After`. */
export function errorFromStatus(status: number, options?: { retryAfter?: string | null; body?: unknown; now?: number }): UploadError {
  const retryAfter = parseRetryAfter(options?.retryAfter, options?.now)
  const retryable = isRetryableStatus(status)

  return uploadError('server', `The server answered ${status}.`, {
    status,
    retryable,
    ...(retryable && retryAfter !== undefined ? { retryAfter } : {}),
    ...(options?.body === undefined ? {} : { body: options.body }),
  })
}

/** Any thrown value as an `UploadError`: an `AbortError` is `aborted`; an unknown error is not retried (a bug is not weather). */
export function toUploadError(error: unknown): UploadError {
  if (isUploadError(error)) return error
  if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError') return uploadError('aborted', 'The upload was cancelled.', { cause: error })
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'The upload failed.'
  const status = (error as { status?: unknown } | null)?.status

  if (typeof status === 'number' && status >= 100 && status <= 599) return errorFromStatus(status)

  return uploadError('network', message, { retryable: false, cause: error })
}

/** Delay before attempt `n + 1` (`attempt` counts the tries made so far, from 1): 500 ms doubling to a minute, with full jitter. */
export function defaultBackoff(attempt: number, random: () => number = Math.random): number {
  const cap = Math.min(60_000, 500 * 2 ** Math.max(0, attempt - 1))

  return Math.round(cap / 2 + (cap / 2) * random())
}

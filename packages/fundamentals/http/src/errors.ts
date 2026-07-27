/**
 * Typed error hierarchy.
 *
 * Every message is `[Pyreon]`-prefixed per the framework convention.
 * `RequestError` is the common base so `catch (e) { if (e instanceof
 * RequestError) … }` covers the whole family without listing members.
 *
 * The class that matters most is {@link AbortError}: it must stay
 * DISTINGUISHABLE from a real failure. The hand-rolled call sites this
 * package replaces all collapse cancellation into the error channel
 * (`@pyreon/feature`'s `catch (e)` even swallows JSON parse failures),
 * which makes "user navigated away" indistinguishable from "the API is
 * down" in every error reporter downstream.
 */

import type { HttpRequest, HttpResponse } from './types'

/** Base class for every error this package throws. */
export class RequestError extends Error {
  /** The request that failed. `undefined` if it failed before being built. */
  readonly request: HttpRequest | undefined

  constructor(message: string, request?: HttpRequest) {
    super(message)
    this.name = 'RequestError'
    this.request = request
  }
}

/**
 * A non-2xx response. Thrown by default (`throwHttpErrors: false` opts out).
 *
 * Throwing is the right default because `@pyreon/query` needs a REJECTED
 * promise to enter its error state — a non-throwing client makes every
 * `queryFn` a manual `if (!res.ok) throw`, which is precisely the
 * boilerplate repeated across the examples today.
 */
export class HttpError extends RequestError {
  readonly response: HttpResponse
  readonly status: number

  constructor(response: HttpResponse) {
    super(
      `[Pyreon] ${response.request.method} ${response.request.url} — HTTP ${response.status}`,
      response.request,
    )
    this.name = 'HttpError'
    this.response = response
    this.status = response.status
  }
}

/** A 4xx response. */
export class ClientError extends HttpError {
  constructor(response: HttpResponse) {
    super(response)
    this.name = 'ClientError'
  }
}

/** A 5xx response. */
export class ServerError extends HttpError {
  constructor(response: HttpResponse) {
    super(response)
    this.name = 'ServerError'
  }
}

/** Build the most specific `HttpError` subclass for a status. */
export function httpErrorFor(response: HttpResponse): HttpError {
  if (response.status >= 500) return new ServerError(response)
  if (response.status >= 400) return new ClientError(response)
  return new HttpError(response)
}

/** The request exceeded its `timeout`. */
export class TimeoutError extends RequestError {
  readonly timeout: number

  constructor(timeout: number, request?: HttpRequest) {
    super(
      `[Pyreon] ${request ? `${request.method} ${request.url} ` : ''}timed out after ${timeout}ms. ` +
        `Pass \`timeout\` to raise it, or \`timeout: false\` to disable.`,
      request,
    )
    this.name = 'TimeoutError'
    this.timeout = timeout
  }
}

/**
 * The caller (or a consumer such as `@pyreon/query`) cancelled.
 *
 * NEVER retry this, and never report it as a failure — it is the expected
 * outcome of navigating away mid-flight.
 */
export class AbortError extends RequestError {
  constructor(request?: HttpRequest) {
    super(`[Pyreon] ${request ? `${request.method} ${request.url} ` : ''}was aborted.`, request)
    this.name = 'AbortError'
  }
}

/** The transport failed before any response arrived (DNS, offline, CORS). */
export class NetworkError extends RequestError {
  override readonly cause: unknown

  constructor(cause: unknown, request?: HttpRequest) {
    super(
      `[Pyreon] ${request ? `${request.method} ${request.url} ` : ''}failed before a response was received: ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
      request,
    )
    this.name = 'NetworkError'
    this.cause = cause
  }
}

/** The body did not decode as the requested type (e.g. HTML where JSON was expected). */
export class ParseError extends RequestError {
  override readonly cause: unknown

  constructor(as: string, cause: unknown, request?: HttpRequest) {
    super(
      `[Pyreon] ${request ? `${request.method} ${request.url} — ` : ''}response body could not be read as ${as}: ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
      request,
    )
    this.name = 'ParseError'
    this.cause = cause
  }
}

/** The response body did not match the supplied schema / parse function. */
export class ResponseValidationError extends RequestError {
  override readonly cause: unknown
  /** The raw, unvalidated body — so a reporter can show what actually arrived. */
  readonly value: unknown

  constructor(cause: unknown, value: unknown, request?: HttpRequest) {
    super(
      `[Pyreon] ${request ? `${request.method} ${request.url} — ` : ''}response did not match the expected schema: ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
      request,
    )
    this.name = 'ResponseValidationError'
    this.cause = cause
    this.value = value
  }
}

/**
 * True when `value` is a DOM abort — either our own {@link AbortError} or
 * the platform's `DOMException { name: 'AbortError' }`, which is what
 * `fetch` rejects with. Both must be treated as cancellation.
 */
export function isAbortError(value: unknown): boolean {
  if (value instanceof AbortError) return true
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { name?: unknown }).name === 'AbortError'
  )
}

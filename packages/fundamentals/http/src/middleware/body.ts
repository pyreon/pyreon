/**
 * Shared helpers for middleware that DISCARD a response or REPLAY a request.
 *
 * @internal Not re-exported from `@pyreon/http/middleware`.
 */

import type { HttpRequest, HttpResponse } from '../types'

const noop = (): void => {}

/**
 * Release a response body nobody will read.
 *
 * A middleware that drops a response to replay the request (retry on 503,
 * refresh on 401) must cancel the body first: an unread body keeps its
 * connection checked out, and under Node's `undici` pool a burst of
 * retries against a failing upstream exhausts the pool until GC happens to
 * collect the abandoned streams. Best-effort by design — a cancel failure
 * (an already-locked or already-consumed stream) must never replace the
 * real outcome of the request.
 */
export async function discardBody(response: HttpResponse): Promise<void> {
  const body = response.raw.body
  if (!body || typeof body.cancel !== 'function' || body.locked) return
  await body.cancel().catch(noop)
}

/**
 * True when the request can be SENT AGAIN.
 *
 * Every `BodyInit` is replayable except a `ReadableStream`: the first send
 * consumes it, and a second `fetch` rejects with "body already used /
 * locked". Replaying such a request would turn a real response (a 503, a
 * 401) into an unrelated TypeError, so retry/refresh return the original
 * response instead.
 */
export function isReplayable(request: HttpRequest): boolean {
  return !(typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream)
}

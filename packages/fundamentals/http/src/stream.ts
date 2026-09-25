/**
 * `@pyreon/http/stream` — Server-Sent Events and NDJSON over ANY transport.
 *
 * ## Why not `EventSource`
 *
 * `EventSource` is GET-only, cannot send headers (so no `Authorization`),
 * cannot carry a request body, and cannot be pointed at a mock transport.
 * Every streaming API worth consuming — an LLM completion, a log tail behind
 * auth, a job-progress feed — hits at least one of those. So this module
 * parses the WIRE FORMAT from a plain `ReadableStream<Uint8Array>`, which
 * every transport can produce (`fetch`'s `res.body`, an endpoint declared
 * with `responseType: 'stream'`, a generated axios/ky client).
 *
 * The transport is a function, `connect(ctx)`, not a URL. That is what lets
 * one implementation reconnect with `Last-Event-ID`, cancel through an
 * `AbortSignal`, and still know nothing about which HTTP library is under it.
 *
 * ## Zero dependencies
 *
 * Like the rest of `@pyreon/http`. Event validation takes a plain parse
 * function; a generated client passes one built from its own schema
 * resolver.
 *
 * @example
 * ```ts
 * import { openEventStream } from '@pyreon/http/stream'
 *
 * const tail = api.endpoint('GET /logs/tail', { responseType: 'stream' })
 *
 * for await (const ev of openEventStream((ctx) => tail({ signal: ctx.signal, headers: ctx.headers }), {
 *   parse: (v) => LogLine.parse(v),
 * })) {
 *   console.log(ev.type, ev.data.message)
 * }
 * ```
 */

// ─── Wire decoding ───────────────────────────────────────────────────────────

/**
 * Split a byte stream into lines, exactly as the SSE grammar defines them:
 * `\r\n`, `\n` or a lone `\r` ends a line, and a chunk boundary may fall
 * ANYWHERE — between the `\r` and `\n` of one CRLF, inside a multi-byte
 * UTF-8 character, or mid-field. A trailing line without a terminator is
 * yielded at the end, flagged `final`, so each format decides what an
 * unterminated tail means (SSE discards it, NDJSON parses it).
 */
async function* readLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<{ line: string; final: boolean }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // A `\r` that ended the previous chunk: its line is already yielded, and a
  // `\n` opening the next chunk belongs to it rather than ending an empty line.
  let pendingCr = false
  let first = true
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      let text = decoder.decode(value, { stream: true })
      if (first && text.length > 0) {
        // A leading U+FEFF is a BOM, not content (both formats allow one).
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
        first = false
      }
      if (pendingCr && text.startsWith('\n')) text = text.slice(1)
      pendingCr = false
      buffer += text
      let start = 0
      for (let i = 0; i < buffer.length; i++) {
        const c = buffer.charCodeAt(i)
        if (c !== 10 && c !== 13) continue
        yield { line: buffer.slice(start, i), final: false }
        if (c === 13) {
          if (i + 1 === buffer.length) pendingCr = true
          else if (buffer.charCodeAt(i + 1) === 10) i++
        }
        start = i + 1
      }
      buffer = buffer.slice(start)
    }
    buffer += decoder.decode()
    if (buffer.length > 0) yield { line: buffer, final: true }
  } finally {
    // Cancelling (rather than only releasing) tells the transport the body
    // is abandoned, so a consumer that `break`s out of a live stream closes
    // the socket instead of leaving the server writing into nothing.
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** One dispatched Server-Sent Event, before its `data` is decoded. */
export interface SseMessage {
  /** The `event:` field, or `'message'` when the event did not name one. */
  type: string
  /** Every `data:` line of the event, joined with `\n`. */
  data: string
  /** The last event id seen on this stream (`''` until one arrives). */
  id: string
  /**
   * The reconnection time the server last set with `retry:`, in ms. Sticky
   * across events, as in `EventSource`: a `retry:` line on an event with no
   * `data` still takes effect.
   */
  retry: number | undefined
}

/**
 * Parse a `text/event-stream` body into messages, per the WHATWG grammar.
 *
 * Comments (`:keep-alive`) are skipped, a field without a colon is a field
 * with an empty value, one leading space after the colon is dropped, an `id`
 * containing NUL is ignored, `retry` is honoured only when it is all digits,
 * and an event with no `data` is not dispatched. An event still being built
 * when the stream ends is DISCARDED — the spec's rule, and the right one:
 * without its terminating blank line there is no way to know it was complete.
 *
 * @example
 * ```ts
 * for await (const msg of readEventStream(response.body)) {
 *   if (msg.type === 'done') break
 *   render(JSON.parse(msg.data))
 * }
 * ```
 */
export async function* readEventStream(
  stream: ReadableStream<Uint8Array>,
  initialLastEventId = '',
): AsyncGenerator<SseMessage> {
  let data: string[] = []
  let type = ''
  let id = initialLastEventId
  let retry: number | undefined
  for await (const { line, final } of readLines(stream)) {
    if (final) break
    if (line === '') {
      if (data.length > 0) {
        yield { type: type || 'message', data: data.join('\n'), id, retry }
      }
      data = []
      type = ''
      continue
    }
    if (line.charCodeAt(0) === 58 /* ':' */) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.charCodeAt(0) === 32 /* ' ' */) value = value.slice(1)
    switch (field) {
      case 'data':
        data.push(value)
        break
      case 'event':
        type = value
        break
      case 'id':
        if (!value.includes('\0')) id = value
        break
      case 'retry':
        if (/^\d+$/.test(value)) retry = Number(value)
        break
      default:
        // Unknown fields are ignored, per spec.
        break
    }
  }
}

/** A line of an NDJSON body that is not valid JSON. */
export class StreamParseError extends Error {
  /** 1-based line number within the stream. */
  readonly line: number
  /** The offending text. */
  readonly text: string
  override readonly cause: unknown

  constructor(line: number, text: string, cause: unknown) {
    super(
      `[Pyreon] http/stream: NDJSON line ${line} is not valid JSON (${
        cause instanceof Error ? cause.message : String(cause)
      }): ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`,
    )
    this.name = 'StreamParseError'
    this.line = line
    this.text = text
    this.cause = cause
  }
}

/**
 * Parse an NDJSON / JSON Lines body into values, one per line.
 *
 * Blank lines are skipped (servers pad heartbeats with them); a final line
 * with no trailing newline is still a value. A line that is not JSON throws
 * a {@link StreamParseError} naming its line number.
 *
 * @example
 * ```ts
 * for await (const row of readNdjson(response.body)) rows.push(row)
 * ```
 */
export async function* readNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  let n = 0
  for await (const { line } of readLines(stream)) {
    n++
    if (line.trim() === '') continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch (cause) {
      throw new StreamParseError(n, line, cause)
    }
    yield value
  }
}

// ─── Connections ─────────────────────────────────────────────────────────────

/** The item type of a stream — `StreamItem<ReturnType<typeof chatStream>>`. */
export type StreamItem<S> = S extends AsyncIterable<infer E> ? E : never

/**
 * Merge a call's own headers with the ones a stream needs (`accept`,
 * `last-event-id`), in any of the shapes an HTTP client accepts — a `Headers`,
 * an entry list, or a record whose `null` / `undefined` values mean "omit".
 * The stream's headers win: resuming with the right id is not optional.
 *
 * @example
 * ```ts
 * openEventStream((ctx) => ep({ ...args, signal: ctx.signal, headers: streamHeaders(args.headers, ctx.headers) }))
 * ```
 */
export function streamHeaders(
  base: HeadersInit | Readonly<Record<string, string | number | boolean | null | undefined>> | undefined,
  extra: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (base instanceof Headers) {
    base.forEach((v, k) => {
      out[k] = v
    })
  } else if (Array.isArray(base)) {
    for (const [k, v] of base) out[String(k).toLowerCase()] = String(v)
  } else if (base) {
    for (const [k, v] of Object.entries(base)) {
      if (v !== null && v !== undefined) out[k.toLowerCase()] = String(v)
    }
  }
  for (const [k, v] of Object.entries(extra)) out[k.toLowerCase()] = v
  return out
}

/** Lifecycle of a streaming connection. */
export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'

/** What `connect` receives on every (re)connection attempt. */
export interface StreamContext {
  /** Aborts when the consumer stops iterating or its own signal aborts. */
  signal: AbortSignal
  /**
   * Headers the stream needs: `accept`, and `last-event-id` when resuming an
   * SSE stream. Merge them into the request.
   */
  headers: Record<string, string>
  /** The last event id received, or `undefined` before any. */
  lastEventId: string | undefined
  /** 0 for the first connection, then 1, 2, … for reconnections. */
  attempt: number
}

/**
 * Open the response body. Resolve to `null`/`undefined` for "no body" (a 204),
 * which ends the stream; reject with an HTTP error to fail (or retry) it.
 */
export type StreamConnect = (
  ctx: StreamContext,
) => Promise<ReadableStream<Uint8Array> | null | undefined>

/** When and how an SSE stream reconnects. */
export interface ReconnectPolicy {
  /** Reconnection attempts before giving up; resets once an event arrives. Default 5. */
  attempts?: number | undefined
  /** First delay in ms; doubles per attempt. A server `retry:` replaces it. Default 1000. */
  delay?: number | undefined
  /** Ceiling for the doubled delay, in ms. Default 30000. */
  maxDelay?: number | undefined
  /**
   * Also reconnect when the server ENDS the stream cleanly — what
   * `EventSource` does. Off by default: for a request/response stream (an LLM
   * completion) a clean end means "done", and reconnecting would replay it.
   */
  onEnd?: boolean | undefined
  /**
   * Decide whether a failure is worth retrying. The default retries network
   * failures, 408, 429 and 5xx, and gives up on any other 4xx — a 401 does
   * not fix itself on the fifth try.
   */
  shouldRetry?: ((error: unknown) => boolean) | undefined
}

/** A decode/validate step applied to each event's payload. */
export type StreamParse<T> = (value: unknown) => T | Promise<T>

interface BaseOptions<T> {
  /**
   * Validate / transform each payload. A plain parse function (throw to
   * reject) — `Schema.parse`, or the generated client's `streamEvent(Schema)`.
   * Without it the payload is passed through as `unknown` JSON (or the raw
   * string, for an SSE stream read with `data: 'text'`).
   */
  parse?: StreamParse<T> | undefined
  /** Stop the stream from outside, in addition to `close()` and `break`. */
  signal?: AbortSignal | undefined
  /** Called on every status change — what `useStream` renders from. */
  onStatus?: ((status: StreamStatus) => void) | undefined
}

/** Options for {@link openEventStream}. */
export interface EventStreamOptions<T> extends BaseOptions<T> {
  /** `json` (default) parses each event's `data`; `text` passes it through as a string. */
  data?: 'json' | 'text' | undefined
  /** Only yield these event types. Default: every event. */
  events?: readonly string[] | undefined
  /** Resume from this id — sent as `Last-Event-ID` on the FIRST request too. */
  lastEventId?: string | undefined
  /** `false` disables reconnection. Default: a {@link ReconnectPolicy} with its defaults. */
  reconnect?: boolean | ReconnectPolicy | undefined
}

/** Options for {@link openNdjsonStream}. NDJSON has no resume id, so no reconnection. */
export type NdjsonStreamOptions<T> = BaseOptions<T>

/** A decoded Server-Sent Event. */
export interface SseEvent<T> {
  type: string
  data: T
  id: string
}

/** A live stream: async-iterable, closable, resumable. */
export interface EventStream<E> extends AsyncIterable<E> {
  /** Stop the stream and release the connection. Idempotent. */
  close(): void
  /** The last SSE event id received — persist it to resume later. */
  lastEventId(): string | undefined
}

/** A payload that failed its `parse` step. */
export class StreamEventError extends Error {
  /** The raw payload, before `parse`. */
  readonly value: unknown
  override readonly cause: unknown

  constructor(value: unknown, cause: unknown) {
    super(
      `[Pyreon] http/stream: a streamed event did not match its schema: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    )
    this.name = 'StreamEventError'
    this.value = value
    this.cause = cause
  }
}

/** The status of an error, whatever library produced it. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const e = error as { status?: unknown; response?: { status?: unknown } }
  if (typeof e.status === 'number') return e.status
  if (typeof e.response?.status === 'number') return e.response.status
  return undefined
}

/** Default {@link ReconnectPolicy.shouldRetry}. */
export function isRetryableStreamError(error: unknown): boolean {
  if (error instanceof StreamEventError || error instanceof StreamParseError) return false
  const status = statusOf(error)
  if (status === undefined) return true
  return status === 408 || status === 429 || status >= 500
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
  )
}

/** A delay that ends early (and cleanly) on abort — no orphaned timer. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  // Never called with an already-aborted signal: every caller checks first.
  return new Promise((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function decodePayload<T>(value: unknown, parse: StreamParse<T> | undefined): Promise<T> {
  if (!parse) return value as T
  try {
    return await parse(value)
  } catch (cause) {
    throw new StreamEventError(value, cause)
  }
}

interface ResolvedPolicy {
  attempts: number
  delay: number
  maxDelay: number
  onEnd: boolean
  shouldRetry: (error: unknown) => boolean
}

interface Driver<E> {
  format: 'sse' | 'ndjson'
  accept: string
  policy: ResolvedPolicy | null
  read(
    body: ReadableStream<Uint8Array>,
    state: { lastEventId: string | undefined; delay: number; received: boolean },
  ): AsyncGenerator<E>
}

function createStream<E>(
  connect: StreamConnect,
  options: BaseOptions<unknown> & { lastEventId?: string | undefined },
  driver: Driver<E>,
): EventStream<E> {
  const controller = new AbortController()
  const external = options.signal
  const onExternalAbort = (): void => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  const state = {
    lastEventId: options.lastEventId,
    delay: driver.policy?.delay ?? 0,
    received: false,
  }
  let started = false
  const emit = (s: StreamStatus): void => options.onStatus?.(s)

  async function* run(): AsyncGenerator<E> {
    let attempt = 0
    let failures = 0
    try {
      for (;;) {
        if (controller.signal.aborted) return
        emit(attempt === 0 ? 'connecting' : 'reconnecting')
        const headers: Record<string, string> = { accept: driver.accept }
        if (driver.format === 'sse' && state.lastEventId) headers['last-event-id'] = state.lastEventId
        state.received = false
        let error: unknown
        let ended = false
        try {
          const body = await connect({
            signal: controller.signal,
            headers,
            lastEventId: state.lastEventId,
            attempt,
          })
          if (!body) {
            ended = true
          } else {
            emit('open')
            for await (const event of driver.read(body, state)) {
              if (state.received) failures = 0
              yield event
            }
            ended = true
          }
        } catch (e) {
          if (controller.signal.aborted || isAbort(e)) return
          error = e
        }
        const policy = driver.policy
        if (ended && !(policy?.onEnd ?? false)) {
          emit('closed')
          return
        }
        if (error !== undefined) {
          if (!policy || !policy.shouldRetry(error) || failures >= policy.attempts) {
            emit('error')
            throw error
          }
          failures++
        }
        // A clean end with `onEnd` waits the base delay; a failure backs off.
        const wait = error === undefined ? state.delay : Math.min(state.delay * 2 ** (failures - 1), policy?.maxDelay ?? 0)
        attempt++
        await sleep(wait, controller.signal)
      }
    } finally {
      external?.removeEventListener('abort', onExternalAbort)
      if (!controller.signal.aborted) controller.abort()
    }
  }

  let iterator: AsyncGenerator<E> | undefined
  return {
    [Symbol.asyncIterator](): AsyncIterator<E> {
      if (started) {
        throw new Error(
          '[Pyreon] http/stream: a stream can be iterated once. Open a new one (call the stream function again) to read it again.',
        )
      }
      started = true
      iterator = run()
      return iterator
    },
    close(): void {
      controller.abort()
      if (iterator) void iterator.return(undefined)
      else emit('closed')
    },
    lastEventId: () => state.lastEventId,
  }
}

function resolvePolicy(reconnect: EventStreamOptions<unknown>['reconnect']): Driver<unknown>['policy'] {
  if (reconnect === false) return null
  const p: ReconnectPolicy = reconnect === true || reconnect === undefined ? {} : reconnect
  return {
    attempts: p.attempts ?? 5,
    delay: p.delay ?? 1000,
    maxDelay: p.maxDelay ?? 30_000,
    onEnd: p.onEnd ?? false,
    shouldRetry: p.shouldRetry ?? isRetryableStreamError,
  }
}

/**
 * Open a Server-Sent Events stream over any transport, with typed events and
 * `Last-Event-ID` reconnection.
 *
 * The returned object is an async iterable of {@link SseEvent}s. Breaking out
 * of the loop, calling `close()`, or aborting `options.signal` cancels the
 * request. A failed connection (network error, 408/429/5xx) is retried with
 * exponential backoff, resuming from the last event id; a server `retry:`
 * field sets the base delay, as in `EventSource`.
 *
 * @example
 * ```ts
 * const stream = openEventStream(
 *   (ctx) => fetch('/api/events', { headers: ctx.headers, signal: ctx.signal }).then((r) => r.body),
 *   { parse: (v) => Update.parse(v), events: ['update'] },
 * )
 * for await (const ev of stream) apply(ev.data)
 * ```
 */
export function openEventStream(
  connect: StreamConnect,
  options: EventStreamOptions<string> & { data: 'text'; parse?: undefined },
): EventStream<SseEvent<string>>
export function openEventStream<T = unknown>(
  connect: StreamConnect,
  options?: EventStreamOptions<T>,
): EventStream<SseEvent<T>>
export function openEventStream<T = unknown>(
  connect: StreamConnect,
  options: EventStreamOptions<T> = {},
): EventStream<SseEvent<T>> {
  const allowed = options.events ? new Set(options.events) : undefined
  const asText = options.data === 'text'
  const policy = resolvePolicy(options.reconnect)
  return createStream<SseEvent<T>>(connect, options, {
    format: 'sse',
    accept: 'text/event-stream',
    policy,
    async *read(body, state) {
      for await (const msg of readEventStream(body, state.lastEventId ?? '')) {
        state.lastEventId = msg.id === '' ? state.lastEventId : msg.id
        if (msg.retry !== undefined && policy) state.delay = msg.retry
        state.received = true
        if (allowed && !allowed.has(msg.type)) continue
        let value: unknown = msg.data
        if (!asText) {
          try {
            value = JSON.parse(msg.data)
          } catch (cause) {
            throw new StreamEventError(msg.data, cause)
          }
        }
        yield { type: msg.type, data: await decodePayload(value, options.parse), id: msg.id }
      }
    },
  })
}

/**
 * Open an NDJSON (JSON Lines) stream over any transport, one validated value
 * per line.
 *
 * NDJSON has no event ids, so a dropped connection cannot be resumed without
 * replaying — a failure ends the stream with the error rather than silently
 * re-requesting.
 *
 * @example
 * ```ts
 * const rows = openNdjsonStream((ctx) => exportRows({ signal: ctx.signal, headers: ctx.headers }), {
 *   parse: (v) => Row.parse(v),
 * })
 * for await (const row of rows) table.push(row)
 * ```
 */
export function openNdjsonStream<T = unknown>(
  connect: StreamConnect,
  options: NdjsonStreamOptions<T> = {},
): EventStream<T> {
  return createStream<T>(connect, options, {
    format: 'ndjson',
    accept: 'application/x-ndjson',
    policy: null,
    async *read(body, state) {
      for await (const value of readNdjson(body)) {
        state.received = true
        yield await decodePayload(value, options.parse)
      }
    },
  })
}

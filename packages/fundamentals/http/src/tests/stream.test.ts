/**
 * @vitest-environment node
 *
 * `@pyreon/http/stream` — SSE + NDJSON decoding and connection handling.
 *
 * The parser specs feed hand-cut chunks so every boundary the wire can
 * produce is exercised deterministically (inside a CRLF, inside a multi-byte
 * character, mid-field). The connection specs run over a REAL `node:http`
 * server with the platform `fetch` — reconnect, `Last-Event-ID`, backoff and
 * cancellation are socket behaviour, and a mock would only test itself.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import {
  isRetryableStreamError,
  openEventStream,
  openNdjsonStream,
  readEventStream,
  readNdjson,
  streamHeaders,
  StreamEventError,
  StreamParseError,
  type StreamStatus,
} from '../stream'

const enc = new TextEncoder()

/** A body delivered in exactly these chunks (strings or raw bytes). */
function body(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(typeof chunk === 'string' ? enc.encode(chunk) : chunk)
      c.close()
    },
  })
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of it) out.push(v)
  return out
}

describe('readEventStream — the WHATWG grammar', () => {
  it('joins multi-line data and names the event', async () => {
    const msgs = await collect(readEventStream(body('event: tick\ndata: a\ndata: b\n\n')))
    expect(msgs).toEqual([{ type: 'tick', data: 'a\nb', id: '', retry: undefined }])
  })

  it('defaults the type to message and skips comments', async () => {
    const msgs = await collect(readEventStream(body(': keep-alive\n\ndata: x\n\n')))
    expect(msgs.map((m) => [m.type, m.data])).toEqual([['message', 'x']])
  })

  it('handles a chunk boundary inside a CRLF', async () => {
    // `\r` ends one chunk, `\n` opens the next: ONE line terminator, not two.
    const msgs = await collect(readEventStream(body('data: one\r', '\n\r', '\ndata: two\r\n\r\n')))
    expect(msgs.map((m) => m.data)).toEqual(['one', 'two'])
  })

  it('a CRLF split across chunks between two data lines does not end the event', async () => {
    // Read as two terminators, the `\n` would be a blank line and dispatch `a`
    // alone — splitting one event in two.
    const msgs = await collect(readEventStream(body('data: a\r', '\ndata: b\r\n\r\n')))
    expect(msgs.map((m) => m.data)).toEqual(['a\nb'])
  })

  it('accepts a lone CR as a line terminator', async () => {
    const msgs = await collect(readEventStream(body('data: a\r\rdata: b\r\r')))
    expect(msgs.map((m) => m.data)).toEqual(['a', 'b'])
  })

  it('handles a chunk boundary inside a multi-byte character', async () => {
    const bytes = enc.encode('data: héllo €\n\n')
    const split = bytes.indexOf(0xa9) // the 2nd byte of é
    const msgs = await collect(readEventStream(body(bytes.slice(0, split), bytes.slice(split))))
    expect(msgs[0]?.data).toBe('héllo €')
  })

  it('handles a chunk boundary mid-field, one byte at a time', async () => {
    const text = 'id: 7\nevent: e\ndata: {"a":1}\n\n'
    const msgs = await collect(readEventStream(body(...text.split(''))))
    expect(msgs).toEqual([{ type: 'e', data: '{"a":1}', id: '7', retry: undefined }])
  })

  it('strips a leading BOM once', async () => {
    const msgs = await collect(readEventStream(body('﻿data: x\n\n')))
    expect(msgs[0]?.data).toBe('x')
  })

  it('keeps the id across events, ignores an id containing NUL, and resets on an empty id', async () => {
    const msgs = await collect(
      readEventStream(body('id: 1\ndata: a\n\ndata: b\n\nid: 2\0x\ndata: c\n\nid\ndata: d\n\n')),
    )
    expect(msgs.map((m) => m.id)).toEqual(['1', '1', '1', ''])
  })

  it('takes retry only when all digits, and it sticks across events', async () => {
    const msgs = await collect(readEventStream(body('retry: 1x\ndata: a\n\nretry: 250\n\ndata: b\n\n')))
    expect(msgs.map((m) => m.retry)).toEqual([undefined, 250])
  })

  it('treats a field without a colon as an empty value, and drops only one leading space', async () => {
    const msgs = await collect(readEventStream(body('data\ndata:  two spaces\nfoo: bar\n\n')))
    expect(msgs[0]?.data).toBe('\n two spaces')
  })

  it('does not dispatch an event with no data, and discards an unterminated trailing event', async () => {
    const msgs = await collect(readEventStream(body('event: x\n\ndata: done\n\ndata: partial')))
    expect(msgs.map((m) => m.data)).toEqual(['done'])
  })
})

describe('readNdjson', () => {
  it('parses values across arbitrary chunk splits, skips blank lines, keeps an unterminated last line', async () => {
    const values = await collect(readNdjson(body('{"a":', '1}\r\n\n  \n[2,', '3]\n"tail"')))
    expect(values).toEqual([{ a: 1 }, [2, 3], 'tail'])
  })

  it('names the line of a value that is not JSON', async () => {
    const err = await collect(readNdjson(body('1\n\n{oops}\n'))).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StreamParseError)
    expect((err as StreamParseError).line).toBe(3)
    expect((err as StreamParseError).message).toContain('[Pyreon]')
  })

  it('truncates a very long bad line in the message', async () => {
    const err = await collect(readNdjson(body(`${'x'.repeat(200)}\n`))).catch((e: unknown) => e)
    expect((err as Error).message).toContain('…')
  })
})

// ─── Real server ─────────────────────────────────────────────────────────────

let server: Server
let base: string
let hits: Record<string, number> = {}
let lastIds: (string | undefined)[] = []
let closedEarly = 0
let flushed: () => void = () => undefined

function sse(res: ServerResponse, status = 200): void {
  res.writeHead(status, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const route = new URL(req.url ?? '/', 'http://x').pathname
  const n = (hits[route] = (hits[route] ?? 0) + 1)
  switch (route) {
    case '/chunks': {
      // Written in pieces with real gaps, so the client sees partial chunks.
      sse(res)
      for (const piece of ['event: tok', 'en\ndata: {"t":', '"he"}\n', '\ndata: {"t":"llo"}\n\n', 'event: done\ndata: {}\n\n']) {
        res.write(piece)
        await new Promise((r) => setTimeout(r, 5))
      }
      res.end()
      return
    }
    case '/resume': {
      lastIds.push(req.headers['last-event-id'] as string | undefined)
      sse(res)
      if (n === 1) {
        res.write('retry: 10\nid: 1\ndata: {"n":1}\n\nid: 2\ndata: {"n":2}\n\n')
        // Drop the socket mid-stream: a network failure, not a clean end.
        setTimeout(() => res.destroy(), 10)
        return
      }
      res.end('id: 3\ndata: {"n":3}\n\n')
      return
    }
    case '/drops':
      sse(res)
      if (n < 3) {
        res.write(`retry: 1\nid: ${n}\ndata: {"n":${n}}\n\n`)
        setTimeout(() => res.destroy(), 10)
        return
      }
      res.end('id: 3\ndata: {"n":3}\n\n')
      return
    case '/unauthorized':
      res.writeHead(401).end()
      return
    case '/flaky':
      if (n <= 2) {
        res.writeHead(503).end()
        return
      }
      sse(res)
      res.end('data: {"ok":true}\n\n')
      return
    case '/down':
      res.writeHead(503).end()
      return
    case '/endless': {
      sse(res)
      res.write('data: {"i":0}\n\n')
      const timer = setInterval(() => res.write('data: {"i":1}\n\n'), 5)
      res.on('close', () => {
        clearInterval(timer)
        closedEarly++
        flushed()
      })
      return
    }
    case '/ends-then-resumes':
      lastIds.push(req.headers['last-event-id'] as string | undefined)
      sse(res)
      res.end(n === 1 ? 'retry: 5\nid: a\ndata: 1\n\n' : 'id: b\ndata: 2\n\n')
      return
    case '/ndjson':
      res.writeHead(200, { 'content-type': 'application/x-ndjson' })
      res.write('{"row":1}\n{"ro')
      await new Promise((r) => setTimeout(r, 5))
      res.end('w":2}\n')
      return
    case '/accept':
      res.writeHead(200, { 'content-type': 'application/x-ndjson' })
      res.end(`${JSON.stringify({ accept: req.headers.accept })}\n`)
      return
    case '/empty':
      res.writeHead(204).end()
      return
    default:
      res.writeHead(404).end()
  }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
})

beforeEach(() => {
  hits = {}
  lastIds = []
  closedEarly = 0
})

/** `connect` over the platform fetch — what a `fetch` client does. */
function via(path: string) {
  return async (ctx: { signal: AbortSignal; headers: Record<string, string> }) => {
    const res = await fetch(base + path, { headers: ctx.headers, signal: ctx.signal })
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
    return res.body
  }
}

describe('openEventStream over a real server', () => {
  it('decodes partial chunks into typed events, JSON-parsed and validated', async () => {
    const parse = (v: unknown) => v as { t?: string }
    const events = await collect(openEventStream(via('/chunks'), { parse }))
    expect(events.map((e) => [e.type, e.data])).toEqual([
      ['token', { t: 'he' }],
      ['message', { t: 'llo' }],
      ['done', {}],
    ])
  })

  it('filters event types and can keep data as text', async () => {
    const events = await collect(openEventStream(via('/chunks'), { events: ['done'], data: 'text' }))
    expect(events).toEqual([{ type: 'done', data: '{}', id: '' }])
  })

  it('reconnects after a dropped connection, resuming from Last-Event-ID with the server retry delay', async () => {
    const statuses: StreamStatus[] = []
    const stream = openEventStream<{ n: number }>(via('/resume'), { onStatus: (s) => statuses.push(s) })
    const events = await collect(stream)
    expect(events.map((e) => e.data.n)).toEqual([1, 2, 3])
    expect(lastIds).toEqual([undefined, '2'])
    expect(stream.lastEventId()).toBe('3')
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting', 'open', 'closed'])
  })

  it('sends Last-Event-ID on the first request when resuming from a stored id', async () => {
    await collect(openEventStream(via('/ends-then-resumes'), { lastEventId: 'x9', data: 'text' }))
    expect(lastIds).toEqual(['x9'])
  })

  it('resets the attempt budget once a reconnection delivers an event', async () => {
    // attempts: 1 allows ONE consecutive failure. Two drops separated by a
    // successful event are two separate failures, not an exhausted budget.
    const events = await collect(openEventStream<{ n: number }>(via('/drops'), { reconnect: { attempts: 1 } }))
    expect(events.map((e) => e.data.n)).toEqual([1, 2, 3])
  })

  it('does not retry a 401 — it fails once, with the error', async () => {
    const statuses: StreamStatus[] = []
    const err = await collect(
      openEventStream(via('/unauthorized'), { onStatus: (s) => statuses.push(s) }),
    ).catch((e: unknown) => e)
    expect((err as { status: number }).status).toBe(401)
    expect(hits['/unauthorized']).toBe(1)
    expect(statuses.at(-1)).toBe('error')
  })

  it('retries a 503 with backoff and recovers', async () => {
    const events = await collect(openEventStream(via('/flaky'), { reconnect: { delay: 1 } }))
    expect(events.map((e) => e.data)).toEqual([{ ok: true }])
    expect(hits['/flaky']).toBe(3)
  })

  it('gives up after the configured attempts', async () => {
    const err = await collect(openEventStream(via('/down'), { reconnect: { delay: 1, attempts: 2 } })).catch(
      (e: unknown) => e,
    )
    expect((err as { status: number }).status).toBe(503)
    expect(hits['/down']).toBe(3)
  })

  it('close() during a backoff wait ends the stream at once, not after the delay', async () => {
    const stream = openEventStream(via('/down'), { reconnect: { delay: 60_000 } })
    const started = Date.now()
    const done = collect(stream)
    while (hits['/down'] !== 1) await new Promise((r) => setTimeout(r, 2))
    await new Promise((r) => setTimeout(r, 10))
    stream.close()
    expect(await done).toEqual([])
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('does not reconnect at all with reconnect: false', async () => {
    await collect(openEventStream(via('/down'), { reconnect: false })).catch(() => undefined)
    expect(hits['/down']).toBe(1)
  })

  it('ends on a clean close by default, and resumes on one with onEnd', async () => {
    await collect(openEventStream(via('/ends-then-resumes'), { data: 'text' }))
    expect(hits['/ends-then-resumes']).toBe(1)

    hits = {}
    lastIds = []
    const got: string[] = []
    const stream = openEventStream(via('/ends-then-resumes'), { data: 'text', reconnect: { onEnd: true } })
    for await (const ev of stream) {
      got.push(ev.data)
      if (got.length === 2) break
    }
    expect(got).toEqual(['1', '2'])
    expect(lastIds).toEqual([undefined, 'a'])
  })

  it('breaking out of the loop closes the connection on the server', async () => {
    const closed = new Promise<void>((r) => {
      flushed = r
    })
    for await (const ev of openEventStream(via('/endless'))) {
      expect(ev.data).toEqual({ i: 0 })
      break
    }
    await closed
    expect(closedEarly).toBe(1)
  })

  it('close() and an external signal both stop a live stream', async () => {
    const closed = new Promise<void>((r) => {
      flushed = r
    })
    const stream = openEventStream(via('/endless'))
    const seen: unknown[] = []
    const done = (async () => {
      for await (const ev of stream) {
        seen.push(ev.data)
        stream.close()
      }
    })()
    await done
    await closed
    expect(seen.length).toBeGreaterThanOrEqual(1)

    const ac = new AbortController()
    ac.abort()
    expect(await collect(openEventStream(via('/endless'), { signal: ac.signal }))).toEqual([])
  })

  it('an external signal aborted mid-stream ends iteration without an error', async () => {
    const ac = new AbortController()
    const seen: unknown[] = []
    for await (const ev of openEventStream(via('/endless'), { signal: ac.signal })) {
      seen.push(ev)
      ac.abort()
    }
    expect(seen).toHaveLength(1)
  })

  it('a payload that fails parse throws StreamEventError and is not retried', async () => {
    const err = await collect(
      openEventStream(via('/chunks'), {
        parse: () => {
          throw new Error('bad shape')
        },
      }),
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StreamEventError)
    expect((err as Error).message).toMatch(/\[Pyreon\].*bad shape/)
    expect(hits['/chunks']).toBe(1)
  })

  it('data that is not JSON is a StreamEventError', async () => {
    const bad = await collect(
      openEventStream(async () => body('data: not json\n\n')),
    ).catch((e: unknown) => e)
    expect(bad).toBeInstanceOf(StreamEventError)
  })

  it('a 204 (no body) ends the stream', async () => {
    const statuses: StreamStatus[] = []
    const events = await collect(
      openEventStream(async () => (await fetch(`${base}/empty`)).body, { onStatus: (s) => statuses.push(s) }),
    )
    expect(events).toEqual([])
    expect(statuses).toEqual(['connecting', 'closed'])
  })

  it('is iterable once, and close() before iteration reports closed', () => {
    const statuses: StreamStatus[] = []
    const stream = openEventStream(via('/chunks'), { onStatus: (s) => statuses.push(s) })
    stream.close()
    expect(statuses).toEqual(['closed'])
    void stream[Symbol.asyncIterator]()
    expect(() => stream[Symbol.asyncIterator]()).toThrow(/iterated once/)
  })

  it('works over a @pyreon/http endpoint declared with responseType: stream', async () => {
    const api = createHttp({ baseUrl: base })
    const resume = api.endpoint('GET /resume', { responseType: 'stream' })
    const events = await collect(
      openEventStream<{ n: number }>((ctx) => resume({ signal: ctx.signal, headers: ctx.headers })),
    )
    expect(events.map((e) => e.data.n)).toEqual([1, 2, 3])
    expect(lastIds).toEqual([undefined, '2'])
  })

  it('does not retry a @pyreon/http ClientError', async () => {
    const api = createHttp({ baseUrl: base })
    const ep = api.endpoint('GET /unauthorized', { responseType: 'stream' })
    await collect(openEventStream((ctx) => ep({ signal: ctx.signal }))).catch(() => undefined)
    expect(hits['/unauthorized']).toBe(1)
  })
})

describe('openNdjsonStream over a real server', () => {
  it('yields one parsed value per line across partial chunks', async () => {
    const rows = await collect(openNdjsonStream<{ row: number }>(via('/ndjson')))
    expect(rows).toEqual([{ row: 1 }, { row: 2 }])
  })

  it('asks for NDJSON and validates each value', async () => {
    const rows = await collect(
      openNdjsonStream(via('/accept'), { parse: (v) => (v as { accept: string }).accept }),
    )
    expect(rows).toEqual(['application/x-ndjson'])
  })

  it('never reconnects — a failure ends the stream with the error', async () => {
    const err = await collect(openNdjsonStream(via('/down'))).catch((e: unknown) => e)
    expect((err as { status: number }).status).toBe(503)
    expect(hits['/down']).toBe(1)
  })
})

describe('streamHeaders', () => {
  it('merges every header shape, drops nullish values, and lets the stream win', () => {
    const extra = { accept: 'text/event-stream', 'last-event-id': '9' }
    expect(streamHeaders(new Headers({ 'X-A': '1', Accept: 'x' }), extra)).toEqual({
      'x-a': '1',
      accept: 'text/event-stream',
      'last-event-id': '9',
    })
    expect(streamHeaders([['X-B', '2']], extra)).toMatchObject({ 'x-b': '2' })
    expect(streamHeaders({ 'X-C': 3, 'X-D': null, 'X-E': undefined, 'X-F': true }, {})).toEqual({
      'x-c': '3',
      'x-f': 'true',
    })
    expect(streamHeaders(undefined, { Accept: 'a' })).toEqual({ accept: 'a' })
  })
})

describe('isRetryableStreamError', () => {
  it.each([
    [new Error('socket hang up'), true],
    [{ status: 408 }, true],
    [{ status: 429 }, true],
    [{ status: 502 }, true],
    [{ status: 404 }, false],
    [{ response: { status: 403 } }, false],
    [{ response: { status: 500 } }, true],
    [new StreamEventError('x', new Error('y')), false],
    [new StreamParseError(1, 'x', new Error('y')), false],
    ['a string', true],
  ] as const)('%o → %s', (error, expected) => {
    expect(isRetryableStreamError(error)).toBe(expected)
  })
})

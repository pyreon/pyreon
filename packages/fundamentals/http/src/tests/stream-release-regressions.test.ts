// @vitest-environment node
import {
  openEventStream,
  openNdjsonStream,
  readNdjson,
  type EventStream,
  type StreamStatus,
} from '../stream'

const enc = new TextEncoder()
const pending = Symbol('still pending on the next event-loop turn')
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function nextTurn<T>(promise: Promise<T>): Promise<T | typeof pending> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<typeof pending>((resolve) => {
        timer = setTimeout(() => resolve(pending), 0)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
function body(text: string) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(text))
      c.close()
    },
  })
}
async function collect<T>(stream: AsyncIterable<T>) {
  const values: T[] = []
  for await (const value of stream) values.push(value)
  return values
}

it.each(['sse', 'ndjson'] as const)(
  'close cancels a pending %s reader even when the transport ignores abort',
  async (format) => {
    const read = deferred<void>()
    let producer!: ReadableStreamDefaultController<Uint8Array>
    let cancelled = 0
    const source = new ReadableStream<Uint8Array>(
      {
        start(c) {
          producer = c
        },
        pull() {
          read.resolve()
        },
        cancel() {
          cancelled++
        },
      },
      { highWaterMark: 0 },
    )
    const statuses: StreamStatus[] = []
    const options = { onStatus: (s: StreamStatus) => statuses.push(s) }
    const stream: EventStream<unknown> =
      format === 'sse'
        ? openEventStream(async () => source, options)
        : openNdjsonStream(async () => source, options)
    const iterator = stream[Symbol.asyncIterator]()
    const next = iterator.next()
    await read.promise
    stream.close()
    stream.close()
    const result = await nextTurn(next)
    // Clean up even against the broken implementation, whose pending reader is
    // never cancelled. The verdict is captured before this producer-side close.
    if (!cancelled) producer.close()
    await next
    expect(result).not.toBe(pending)
    expect(result).toMatchObject({ done: true })
    expect(cancelled).toBe(1)
    expect(source.locked).toBe(false)
    expect(statuses.filter((s) => s === 'closed')).toHaveLength(1)
  },
)

it('closing before iteration releases the external abort listener', () => {
  const external = new AbortController()
  const add = vi.spyOn(external.signal, 'addEventListener')
  const remove = vi.spyOn(external.signal, 'removeEventListener')
  try {
    for (let i = 0; i < 3; i++) {
      const stream = openNdjsonStream(async () => null, { signal: external.signal })
      stream.close()
      stream.close()
    }
    expect(remove.mock.calls.map((args) => args.slice(0, 2))).toEqual(
      add.mock.calls.map((args) => args.slice(0, 2)),
    )
  } finally {
    vi.restoreAllMocks()
  }
})

it('close settles an ignored pending connect and cancels its late response body', async () => {
  const called = deferred<void>()
  const connection = deferred<ReadableStream<Uint8Array>>()
  let cancelled = 0
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled++
    },
  })
  const stream = openNdjsonStream(() => {
    called.resolve()
    return connection.promise
  })
  const next = stream[Symbol.asyncIterator]().next()
  await called.promise
  stream.close()
  const result = await nextTurn(next)
  connection.resolve(source)
  if (result === pending) await source.cancel()
  await next
  await vi.waitFor(() => expect(cancelled).toBe(1))
  expect(result).not.toBe(pending)
  expect(result).toMatchObject({ done: true })
})

it('close settles an asynchronous payload parser and never emits its late result', async () => {
  const called = deferred<void>()
  const parsed = deferred<number>()
  const stream = openNdjsonStream(async () => body('1\n'), {
    parse: () => {
      called.resolve()
      return parsed.promise
    },
  })
  const next = stream[Symbol.asyncIterator]().next()
  await called.promise
  stream.close()
  const result = await nextTurn(next)
  parsed.resolve(42)
  await next
  expect(result).not.toBe(pending)
  expect(result).toMatchObject({ done: true })
})

it('observes a late connection rejection after close', async () => {
  const called = deferred<void>()
  const connection = deferred<ReadableStream<Uint8Array>>()
  const stream = openNdjsonStream(() => {
    called.resolve()
    return connection.promise
  })
  const next = stream[Symbol.asyncIterator]().next()
  await called.promise
  stream.close()
  const result = await nextTurn(next)
  connection.reject(new Error('late transport rejection'))
  await next
  expect(result).toMatchObject({ done: true })
})

it('a pre-aborted external signal never opens a connection', async () => {
  const external = new AbortController()
  external.abort()
  const connect = vi.fn(async () => body('1\n'))
  const statuses: StreamStatus[] = []
  const stream = openNdjsonStream(connect, {
    signal: external.signal,
    onStatus: (s) => statuses.push(s),
  })
  await expect(collect(stream)).resolves.toEqual([])
  expect(connect).not.toHaveBeenCalled()
  expect(statuses).toEqual(['closed'])
})

it.each(['connecting', 'open'] as const)(
  'closing in the %s callback leaves no response body or events',
  async (at) => {
    let cancelled = 0
    let producer!: ReadableStreamDefaultController<Uint8Array>
    const source = new ReadableStream<Uint8Array>({
      start(c) {
        producer = c
      },
      cancel() {
        cancelled++
      },
    })
    const connect = vi.fn(async () => source)
    const stream = openNdjsonStream(connect, {
      onStatus: (s) => {
        if (s === at) stream.close()
      },
    })
    const done = collect(stream)
    const result = await nextTurn(done)
    if (result === pending) producer.close()
    await done
    expect(result).toEqual([])
    expect(connect).toHaveBeenCalledTimes(at === 'open' ? 1 : 0)
    expect(cancelled).toBe(at === 'open' ? 1 : 0)
    expect(source.locked).toBe(false)
  },
)

it('closing from a retry callback does not leave a backoff timer', async () => {
  vi.useFakeTimers()
  const stream = openEventStream(
    async () => {
      throw new Error('disconnect')
    },
    {
      reconnect: {
        delay: 60_000,
        shouldRetry: () => {
          stream.close()
          return true
        },
      },
    },
  )
  const done = collect(stream)
  try {
    const verdict = nextTurn(done)
    await vi.advanceTimersByTimeAsync(0)
    expect(await verdict).toEqual([])
  } finally {
    // Settle the broken implementation's timer before restoring the clock.
    await vi.advanceTimersByTimeAsync(60_000)
    await done
    vi.useRealTimers()
  }
})

it.each([
  ['explicit empty id', 'id: old\ndata: 1\n\nid:\ndata: 2\n\n', undefined],
  ['id-only control block', 'id: old\ndata: 1\n\nid: new\n\n', 'new'],
  ['unterminated id is discarded', 'id: old\ndata: 1\n\nid: new\n', 'old'],
] as const)('SSE reconnection uses the committed id for %s', async (_name, text, expected) => {
  const attempts: { id: string | undefined; header: string | undefined }[] = []
  const stop = Object.assign(new Error('terminal response'), { status: 401 })
  const stream = openEventStream(
    async (ctx) => {
      attempts.push({ id: ctx.lastEventId, header: ctx.headers['last-event-id'] })
      if (ctx.attempt !== 0) throw stop
      return body(text)
    },
    { reconnect: { onEnd: true, delay: 0 } },
  )
  await expect(collect(stream)).rejects.toBe(stop)
  expect(attempts).toEqual([
    { id: undefined, header: undefined },
    { id: expected, header: expected },
  ])
  expect(stream.lastEventId()).toBe(expected)
})

it('a no-body response is terminal with reconnect.onEnd enabled', async () => {
  let attempts = 0
  const stream = openEventStream(
    async () => {
      if (attempts++ !== 0) throw Object.assign(new Error('must not reconnect'), { status: 401 })
      return null
    },
    { reconnect: { onEnd: true, delay: 0 } },
  )
  await expect(collect(stream)).resolves.toEqual([])
  expect(attempts).toBe(1)
})

it('server retry-only control blocks update the reconnect delay', async () => {
  vi.useFakeTimers()
  const attempts: number[] = []
  const stream = openEventStream(
    async (ctx) => {
      attempts.push(ctx.attempt)
      return ctx.attempt === 0 ? body('retry: 200\n\n') : null
    },
    { reconnect: { onEnd: true, delay: 1000 } },
  )
  const result = collect(stream)
  try {
    await vi.advanceTimersByTimeAsync(199)
    expect(attempts).toEqual([0])
    await vi.advanceTimersByTimeAsync(1)
    expect(attempts).toEqual([0, 1])
  } finally {
    stream.close()
    await result
    vi.useRealTimers()
  }
})

it('filtered valid events reset the retry budget even without yielding to the consumer', async () => {
  let attempts = 0
  const stream = openEventStream(
    async () => {
      const current = attempts++
      if (current === 0 || current === 2) throw new Error('disconnect')
      return current === 1 ? body('event: ignored\ndata: 1\n\n') : null
    },
    { events: ['wanted'], reconnect: { attempts: 1, delay: 0, onEnd: true } },
  )
  await expect(collect(stream)).resolves.toEqual([])
  expect(attempts).toBe(4)
})

it('scans a large chunked NDJSON row in linear work', async () => {
  const text = JSON.stringify('x'.repeat(65_536)) + '\n'
  const bytes = enc.encode(text)
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 256) c.enqueue(bytes.slice(i, i + 256))
      c.close()
    },
  })
  const original = String.prototype.charCodeAt
  let visits = 0
  String.prototype.charCodeAt = function (index: number) {
    visits++
    return original.call(this, index)
  }
  let result: unknown[]
  try {
    result = await collect(readNdjson(source))
  } finally {
    String.prototype.charCodeAt = original
  }
  expect(result).toEqual(['x'.repeat(65_536)])
  expect(visits).toBeLessThanOrEqual(text.length * 2)
})

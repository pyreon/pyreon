import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import {
  QueryClientProvider,
  type StreamSourceContext,
  type UseStreamResult,
  useStream,
} from '../index'

// ─── A stream the test drives by hand ───────────────────────────────────────

interface Pushable<T> {
  iterable: AsyncIterable<T>
  push(value: T): void
  end(): void
  fail(error: unknown): void
  /** Resolves once the consumer has asked for the first value. */
  started: Promise<void>
  returned: () => boolean
}

function pushable<T>(signal_?: AbortSignal): Pushable<T> {
  const queue: T[] = []
  let waiting: ((r: IteratorResult<T>) => void) | null = null
  let rejecting: ((e: unknown) => void) | null = null
  let done = false
  let failure: unknown
  let returned = false
  let markStarted: () => void = () => undefined
  const started = new Promise<void>((r) => {
    markStarted = r
  })
  const settle = (): void => {
    if (!waiting) return
    if (failure !== undefined) {
      rejecting?.(failure)
    } else if (queue.length > 0) {
      waiting({ value: queue.shift() as T, done: false })
    } else if (done) {
      waiting({ value: undefined as never, done: true })
    } else return
    waiting = null
    rejecting = null
  }
  signal_?.addEventListener('abort', () => {
    failure = Object.assign(new Error('aborted'), { name: 'AbortError' })
    settle()
  })
  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<T>>((resolve, reject) => {
          markStarted()
          waiting = resolve
          rejecting = reject
          settle()
        }),
      return: () => {
        returned = true
        return Promise.resolve({ value: undefined as never, done: true })
      },
    }),
  }
  return {
    iterable,
    push: (v) => {
      queue.push(v)
      settle()
    },
    end: () => {
      done = true
      settle()
    },
    fail: (e) => {
      failure = e
      settle()
    },
    started,
    returned: () => returned,
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function withProvider(component: () => void): () => void {
  const client = new QueryClient()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    <QueryClientProvider client={client}>
      {() => {
        component()
        return null
      }}
    </QueryClientProvider>,
    el,
  )
  return () => {
    unmount()
    el.remove()
  }
}

describe('useStream', () => {
  it('surfaces events, latest and a connecting → open → closed lifecycle', async () => {
    const p = pushable<number>()
    let s!: UseStreamResult<number>
    const dispose = withProvider(() => {
      s = useStream(() => p.iterable)
    })
    expect(s.status()).toBe('connecting')
    await p.started
    p.push(1)
    p.push(2)
    await tick()
    expect(s.events()).toEqual([1, 2])
    expect(s.latest()).toBe(2)
    expect(s.status()).toBe('open')
    p.end()
    await tick()
    expect(s.status()).toBe('closed')
    dispose()
  })

  it('stays idle while the source is not ready, and starts when a tracked input arrives', async () => {
    const id = signal<string | undefined>(undefined)
    const opened: string[] = []
    let s!: UseStreamResult<string>
    const dispose = withProvider(() => {
      s = useStream(() => {
        const v = id()
        if (v === undefined) return undefined
        opened.push(v)
        return pushable<string>().iterable
      })
    })
    expect(s.status()).toBe('idle')
    id.set('a')
    expect(opened).toEqual(['a'])
    expect(s.status()).toBe('connecting')
    dispose()
  })

  it('an input change aborts the previous stream and ignores its late events', async () => {
    const room = signal('a')
    const streams: Record<string, Pushable<string>> = {}
    const signals: Record<string, AbortSignal> = {}
    let s!: UseStreamResult<string>
    const dispose = withProvider(() => {
      s = useStream((ctx) => {
        const r = room()
        signals[r] = ctx.signal
        streams[r] = pushable<string>()
        return streams[r].iterable
      })
    })
    await streams.a?.started
    streams.a?.push('a1')
    await tick()
    room.set('b')
    expect(signals.a?.aborted).toBe(true)
    expect(s.events()).toEqual([])
    streams.a?.push('a2') // the superseded stream — must not land
    streams.b?.push('b1')
    await tick()
    expect(s.events()).toEqual(['b1'])
    dispose()
  })

  it('a superseded stream ending or failing late changes nothing', async () => {
    const room = signal('a')
    const streams: Record<string, Pushable<string>> = {}
    let s!: UseStreamResult<string>
    const dispose = withProvider(() => {
      s = useStream(() => {
        const r = room()
        streams[r] = pushable<string>()
        return streams[r].iterable
      })
    })
    await streams.a?.started
    room.set('b')
    await streams.b?.started
    streams.b?.push('b1')
    await tick()
    streams.a?.push('late') // wakes the old loop: it must drop the event
    await tick()
    streams.a?.fail(new Error('late failure'))
    await tick()
    expect(s.status()).toBe('open')
    expect(s.error()).toBeUndefined()
    expect(s.events()).toEqual(['b1'])
    room.set('c')
    await streams.c?.started
    streams.b?.end() // superseded clean end: must not flip status to closed
    await tick()
    expect(s.status()).toBe('connecting')
    dispose()
  })

  it('reports an error that ends the stream', async () => {
    const p = pushable<number>()
    let s!: UseStreamResult<number>
    const dispose = withProvider(() => {
      s = useStream(() => p.iterable)
    })
    await p.started
    const boom = new Error('boom')
    p.fail(boom)
    await tick()
    expect(s.status()).toBe('error')
    expect(s.error()).toBe(boom)
    dispose()
  })

  it('unmount aborts the source signal', async () => {
    let ctx!: StreamSourceContext
    const dispose = withProvider(() => {
      useStream((c) => {
        ctx = c
        return pushable<number>(c.signal).iterable
      })
    })
    expect(ctx.signal.aborted).toBe(false)
    dispose()
    expect(ctx.signal.aborted).toBe(true)
  })

  it('abort() stops it, an input change does not revive it, restart() does and tracks again', async () => {
    const room = signal('a')
    const opened: string[] = []
    let s!: UseStreamResult<string>
    const dispose = withProvider(() => {
      s = useStream((ctx) => {
        opened.push(room())
        return pushable<string>(ctx.signal).iterable
      })
    })
    await tick()
    s.abort()
    await tick()
    expect(s.status()).toBe('closed')
    room.set('b')
    expect(opened).toEqual(['a'])
    s.restart()
    expect(opened).toEqual(['a', 'b'])
    room.set('c')
    expect(opened).toEqual(['a', 'b', 'c'])
    dispose()
  })

  it('keeps at most maxEvents events', async () => {
    const p = pushable<number>()
    let s!: UseStreamResult<number>
    const dispose = withProvider(() => {
      s = useStream(() => p.iterable, { maxEvents: 2 })
    })
    await p.started
    for (const n of [1, 2, 3, 4]) p.push(n)
    await tick()
    expect(s.events()).toEqual([3, 4])
    expect(s.latest()).toBe(4)
    dispose()
  })

  it('maxEvents: 0 keeps none but still tracks latest', async () => {
    const p = pushable<number>()
    let s!: UseStreamResult<number>
    const dispose = withProvider(() => {
      s = useStream(() => p.iterable, { maxEvents: 0 })
    })
    await p.started
    p.push(1)
    await tick()
    expect(s.events()).toEqual([])
    expect(s.latest()).toBe(1)
    dispose()
  })

  it('forwards finer states from ctx.onStatus, and onEvent gets the query client', async () => {
    const p = pushable<number>()
    let ctx!: StreamSourceContext
    const seen: [number, boolean][] = []
    let s!: UseStreamResult<number>
    const dispose = withProvider(() => {
      s = useStream(
        (c) => {
          ctx = c
          return p.iterable
        },
        { onEvent: (e, qc) => seen.push([e, qc instanceof QueryClient]) },
      )
    })
    ctx.onStatus('reconnecting')
    expect(s.status()).toBe('reconnecting')
    await p.started
    p.push(7)
    await tick()
    expect(seen).toEqual([[7, true]])
    dispose()
  })

  it('a disabled stream is idle, and enabling it starts it', async () => {
    const on = signal(false)
    let s!: UseStreamResult<number>
    const dispose = withProvider(() => {
      s = useStream(() => pushable<number>().iterable, { enabled: () => on() })
    })
    expect(s.status()).toBe('idle')
    on.set(true)
    expect(s.status()).toBe('connecting')
    dispose()
  })

  it('a static enabled: false never starts', () => {
    let s!: UseStreamResult<number>
    const dispose = withProvider(() => {
      s = useStream(() => pushable<number>().iterable, { enabled: false })
    })
    expect(s.status()).toBe('idle')
    dispose()
  })

  it('an abort that surfaces as a rejection reads as closed, not error', async () => {
    let s!: UseStreamResult<number>
    const dispose = withProvider(() => {
      s = useStream((ctx) => pushable<number>(ctx.signal).iterable)
    })
    await tick()
    s.abort()
    await tick()
    expect(s.status()).toBe('closed')
    expect(s.error()).toBeUndefined()
    dispose()
  })
})

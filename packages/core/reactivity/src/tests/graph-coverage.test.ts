/**
 * Behaviour of the link-graph core on the paths the rest of the suite does not
 * reach: runs that read nothing, writes made before a run re-reads a source,
 * self-disposal during a run, throws escaping the flush, the direct tier's
 * idempotence and suspension shapes, and the dev-gate false arms of `_bind`
 * and `trigger()` under `NODE_ENV=production`.
 *
 * Every spec asserts what a user can observe — values, run counts, which
 * callbacks fired — or the edges left behind (`./graph-internals`).
 */
import {
  _bind,
  batch,
  type Computed,
  computed,
  effect,
  effectScope,
  renderEffect,
  setErrorHandler,
  signal,
  type SubscriberHost,
} from '../index'
import {
  _frameReads,
  _replayReads,
  _resumeSoleSubscriber,
  _sampleReads,
  _suspendSoleSubscriber,
} from '../internal'
import { depCount, directCount, rawEdgeCount as edgeCount } from './graph-internals'

const errors: unknown[] = []

beforeEach(() => {
  errors.length = 0
  setErrorHandler((err) => errors.push(err))
})

afterEach(() => {
  // pyreon-lint-disable-next-line pyreon/dev-guard-warnings
  setErrorHandler((err) => console.error('[pyreon] Unhandled effect error:', err))
})

describe('dependency tracking', () => {
  test('a re-run that reads nothing drops every edge and is never scheduled again', () => {
    const s = signal(0)
    let read = true
    let runs = 0
    effect(() => {
      runs++
      if (read) s()
    })
    expect(edgeCount(s)).toBe(1)

    read = false
    s.set(1)
    expect(runs).toBe(2)
    expect(edgeCount(s)).toBe(0)

    s.set(2)
    expect(runs).toBe(2)
  })

  test('a write before the run re-reads that source does not re-queue the run', () => {
    const s = signal(0)
    const seen: number[] = []
    effect(() => {
      // Writes first, then reads: the run itself sees the new value, so the
      // write must not schedule another run.
      if (s.peek() === 1) s.set(10)
      seen.push(s())
    })
    expect(seen).toEqual([0])

    s.set(1)
    expect(seen).toEqual([0, 10])
    expect(edgeCount(s)).toBe(1)
  })
})

describe('computed', () => {
  test('disposed during its own evaluation with an equal value: keeps the previous value, drops its edges', () => {
    const s = signal(1)
    let c: Computed<{ n: number }> | undefined
    c = computed(
      () => {
        const v = s()
        if (v === 2) c?.dispose()
        return { n: v > 0 ? 1 : 0 }
      },
      { equals: (a, b) => a.n === b.n },
    )
    const first = c()
    expect(first).toEqual({ n: 1 })
    expect(edgeCount(s)).toBe(1)

    s.set(2)
    // The evaluation disposed the node and its result equalled the previous
    // one: the previous reference stays, nothing stays linked.
    expect(c()).toBe(first)
    expect(depCount(c)).toBe(0)
    expect(edgeCount(s)).toBe(0)

    s.set(3)
    expect(c()).toBe(first)
  })

  test('a stale computed that gains a direct updater inside a batch fires it when the batch closes', () => {
    const s = signal(1)
    const c = computed(() => s() * 2)
    expect(c()).toBe(2)
    // Nothing watches `c`: the write only marks it.
    s.set(2)

    const seen: number[] = []
    batch(() => {
      c.direct(() => seen.push(c._v))
      expect(c()).toBe(4)
      expect(seen).toEqual([])
    })
    expect(seen).toEqual([4])
  })

  test('an updater registered by another updater waits for the next change', () => {
    const s = signal(0)
    const c = computed(() => s() + 1)
    c()
    const calls: string[] = []
    let added = false
    c.direct(() => {
      calls.push('a')
      if (!added) {
        added = true
        c.direct(() => calls.push('late'))
      }
    })
    c.direct(() => calls.push('b'))

    s.set(1)
    expect(calls).toEqual(['a', 'b'])

    s.set(2)
    expect(calls).toEqual(['a', 'b', 'a', 'b', 'late'])
  })

  test('_v of a computed disposed before it ever evaluated evaluates once, untracked', () => {
    const s = signal(3)
    let evals = 0
    const c = computed(() => {
      evals++
      return s() * 2
    })
    c.dispose()

    expect(c._v).toBe(6)
    expect(c._v).toBe(6)
    expect(evals).toBe(1)
    expect(edgeCount(s)).toBe(0)
  })

  test('a disposed, never-evaluated computed whose evaluation throws reports it and reads undefined', () => {
    const boom = new Error('cold boom')
    let evals = 0
    const c = computed<number>(() => {
      evals++
      throw boom
    })
    c.dispose()

    expect(c()).toBeUndefined()
    expect(errors).toEqual([boom])
    // Evaluated once only: the read marked it as having a value.
    expect(c()).toBeUndefined()
    expect(evals).toBe(1)
  })
})

describe('render bindings', () => {
  test('a binding whose computed dependency came back unchanged does not re-run', () => {
    const s = signal(0)
    const parity = computed(() => s() % 2)
    let runs = 0
    renderEffect(() => {
      runs++
      parity()
    })
    expect(runs).toBe(1)

    s.set(2)
    expect(runs).toBe(1)

    s.set(3)
    expect(runs).toBe(2)
  })

  test('a renderEffect that disposes itself mid-run keeps none of the edges that run linked', () => {
    const s = signal(0)
    const t = signal(0)
    let stop: (() => void) | undefined
    let runs = 0
    stop = renderEffect(() => {
      runs++
      if (s() === 1) {
        stop?.()
        // Read AFTER disposal: the run's own cleanup must drop this edge too.
        t()
      }
    })
    expect(edgeCount(s)).toBe(1)

    s.set(1)
    expect(runs).toBe(2)
    expect(edgeCount(s)).toBe(0)
    expect(edgeCount(t)).toBe(0)

    s.set(2)
    t.set(1)
    expect(runs).toBe(2)
  })

  test('a static binding that throws before reading a computed leaves that computed reachable', () => {
    const t = signal(0)
    const a = signal(0)
    const c = computed(() => a() * 2)
    const seen: number[] = []
    let throwOnce = true
    _bind(() => {
      if (t() === 1 && throwOnce) {
        throwOnce = false
        throw new Error('bind boom')
      }
      seen.push(c())
    })
    expect(seen).toEqual([0])

    // The binding throws before it reads `c`, which this batch also marked.
    expect(() =>
      batch(() => {
        t.set(1)
        a.set(5)
      }),
    ).toThrow('bind boom')
    expect(seen).toEqual([0])

    // `c` was resolved after the throw, so a write below it reaches the
    // binding again.
    a.set(6)
    expect(seen).toEqual([0, 12])
  })

  test('a throw escaping the flush leaves a watcher disposed earlier in that flush disposed', () => {
    const s = signal(0)
    let stopW: () => void = () => {}
    const bindingRuns: number[] = []
    renderEffect(() => {
      const v = s()
      bindingRuns.push(v)
      if (v === 1) {
        stopW()
        throw new Error('flush boom')
      }
    })
    const wRuns: number[] = []
    const w = effect(() => {
      wRuns.push(s())
    })
    stopW = w.dispose
    expect(edgeCount(s)).toBe(2)

    // The binding (queued first) disposes `w` and throws; `w` is still in the
    // queue behind it and is dropped, not run.
    expect(() => s.set(1)).toThrow('flush boom')
    expect(wRuns).toEqual([0])
    expect(edgeCount(s)).toBe(1)

    // The graph is intact: the binding keeps reacting, `w` stays dead.
    s.set(2)
    expect(bindingRuns).toEqual([0, 1, 2])
    expect(wRuns).toEqual([0])
  })
})

describe('direct tier', () => {
  test('subscribing the same listener twice registers it once', () => {
    const s = signal(0)
    let calls = 0
    const listener = (): void => {
      calls++
    }
    const unsub = s.subscribe(listener)
    s.subscribe(listener)
    expect(directCount(s)).toBe(1)

    s.set(1)
    expect(calls).toBe(1)

    unsub()
    expect(directCount(s)).toBe(0)
    s.set(2)
    expect(calls).toBe(1)
  })

  test('resuming a suspended Set restores it when the newcomers have all left again', () => {
    const s = signal(0)
    const calls: string[] = []
    const other = (): void => {
      calls.push('other')
    }
    const listener = (): void => {
      calls.push('L')
    }
    const unsubOther = s.subscribe(other)
    s.subscribe(listener)
    unsubOther()
    // The tier is now a promoted Set holding only `listener`.
    const token = _suspendSoleSubscriber(s)
    expect(token).not.toBeNull()
    expect(directCount(s)).toBe(0)

    const unsubY = s.subscribe(() => calls.push('y'))
    const unsubZ = s.subscribe(() => calls.push('z'))
    unsubY()
    unsubZ()
    _resumeSoleSubscriber(s, token!, listener)
    expect(directCount(s)).toBe(1)

    s.set(1)
    expect(calls).toEqual(['L'])
  })

  test('resuming a suspended Set while newcomers remain keeps them and re-adds the listener', () => {
    const s = signal(0)
    const calls: string[] = []
    const listener = (): void => {
      calls.push('L')
    }
    const unsubOther = s.subscribe(() => calls.push('other'))
    s.subscribe(listener)
    unsubOther()
    const token = _suspendSoleSubscriber(s)

    s.subscribe(() => calls.push('y'))
    s.subscribe(() => calls.push('z'))
    _resumeSoleSubscriber(s, token!, listener)
    expect(directCount(s)).toBe(3)

    s.set(1)
    expect(calls).toEqual(['y', 'z', 'L'])
  })

  test('debug() counts a single subscribe() listener', () => {
    const s = signal(0)
    expect(s.debug().subscriberCount).toBe(0)
    s.subscribe(() => {})
    expect(s.debug().subscriberCount).toBe(1)
    effect(() => {
      s()
    })
    expect(s.debug().subscriberCount).toBe(2)
  })
})

describe('tracking frame helpers', () => {
  test('_frameReads in a frame that has read nothing yet is an empty list', () => {
    const s = signal(0)
    let before: unknown[] | null = null
    let after: unknown[] | null = null
    effect(() => {
      before = _frameReads()
      s()
      after = _frameReads()
    })
    expect(before).toEqual([])
    expect(after).toEqual([s])
  })

  test('_replayReads outside any frame links nothing', () => {
    const s = signal(0)
    const reads: SubscriberHost[] = []
    _sampleReads(() => s(), reads)
    expect(reads).toHaveLength(1)
    _replayReads(reads)
    expect(edgeCount(s)).toBe(0)
  })
})

describe('EffectScope', () => {
  test('stop() disposes a plain { dispose } entry', () => {
    const scope = effectScope()
    let disposed = 0
    scope.add({
      dispose: () => {
        disposed++
      },
    })
    scope.stop()
    expect(disposed).toBe(1)
    scope.stop()
    expect(disposed).toBe(1)
  })
})

describe('NODE_ENV=production', () => {
  let prevEnv: string | undefined

  beforeEach(() => {
    prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
  })

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prevEnv
  })

  test('_bind reacts and disposes without the dev instrumentation', () => {
    const s = signal(0)
    const seen: number[] = []
    const dispose = _bind(() => {
      seen.push(s())
    })
    expect(seen).toEqual([0])
    s.set(1)
    expect(seen).toEqual([0, 1])

    dispose()
    expect(edgeCount(s)).toBe(0)
    s.set(2)
    expect(seen).toEqual([0, 1])
  })

  test('trigger() re-runs subscribers without the dev fire record', () => {
    const s = signal({ n: 0 })
    let runs = 0
    effect(() => {
      runs++
      s()
    })
    s.peek().n = 1
    s.trigger()
    expect(runs).toBe(2)
  })
})

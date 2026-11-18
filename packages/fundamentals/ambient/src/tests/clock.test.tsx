import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { _resetClockState, _tickerStats, clockAttributes, clockScript, MAX_SHARED_TICKERS, now, provideClock, releaseClock, setClock, useNow } from '../clock'
import { _resetLocaleState, setTimeZone } from '../locale'

const T0 = Date.UTC(2026, 10, 18, 12, 0, 0, 400) // 12:00:00.400

function render(vnode: VNodeChild) {
  const root = document.createElement('div')

  document.body.appendChild(root)
  const unmount = mount(vnode as never, root)

  return {
    root,
    done() {
      unmount()
      root.remove()
    },
  }
}

const Reader = (props: { every?: 'second' | 'minute' | 'hour' | 'day' | number }) => {
  const n = useNow(props.every === undefined ? undefined : { every: props.every })

  return h('span', null, () => String(n()))
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 })
})

afterEach(() => {
  _resetClockState()
  _resetLocaleState()
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
})

describe('no timers at import, none without a reader', () => {
  it('importing started nothing, and useNow outside a scope returns the plain read', () => {
    expect(vi.getTimerCount()).toBe(0)
    const read = useNow({ every: 'second' })

    expect(read()).toBe(T0)
    vi.advanceTimersByTime(5000)
    expect(read()).toBe(T0 + 5000)
    expect(vi.getTimerCount()).toBe(0)
    expect(_tickerStats()).toEqual({ active: 0, timers: 0, shared: 0 })
  })
})

describe('alignment and drift', () => {
  it('a second reader updates on the next full second, not a second after mount', () => {
    const { root, done } = render(h(Reader, { every: 'second' }))

    expect(root.textContent).toBe(String(T0))
    vi.advanceTimersByTime(599)
    expect(root.textContent).toBe(String(T0))
    vi.advanceTimersByTime(1)
    expect(root.textContent).toBe(String(T0 + 600)) // 12:00:01.000
    vi.advanceTimersByTime(1000)
    expect(root.textContent).toBe(String(T0 + 1600))
    done()
  })

  it('a minute reader updates on the full minute', () => {
    const { root, done } = render(h(Reader, null))

    vi.advanceTimersByTime(59_599)
    expect(root.textContent).toBe(String(T0))
    vi.advanceTimersByTime(1)
    expect(root.textContent).toBe(String(Date.UTC(2026, 10, 18, 12, 1, 0, 0)))
    done()
  })

  it('each tick is scheduled from the clock: a late wake-up does not push every later tick back', () => {
    let t = T0
    const spy = vi.spyOn(globalThis, 'setTimeout')

    setClock(() => t)
    const { done } = render(h(Reader, { every: 'second' }))
    const first = spy.mock.calls.at(-1)![1]

    expect(first).toBe(600) // to 12:00:01.000
    t = T0 + 900 // the timer wakes 300 ms late
    vi.advanceTimersByTime(600)
    const second = spy.mock.calls.at(-1)![1]

    expect(second).toBe(700) // to 12:00:02.000 from 12:00:01.300, not a fresh 1000 after the late wake-up
    done()
    spy.mockRestore()
  })

  it('a timer that wakes a few milliseconds early waits out the remainder instead of publishing early', () => {
    let t = T0
    const seen: number[] = []

    setClock(() => t)
    const Probe = () => {
      const n = useNow({ every: 'second' })

      effect(() => {
        seen.push(n())
      })

      return h('i', null)
    }
    const { done } = render(h(Probe, null))

    t = T0 + 590 // 10 ms before the boundary when the timer fires at +600
    vi.advanceTimersByTime(600)
    expect(seen).toEqual([T0])
    t = T0 + 600
    vi.advanceTimersByTime(10)
    expect(seen).toEqual([T0, T0 + 600])
    done()
  })
})

describe('sharing and refcount', () => {
  it('a thousand readers of one granularity share ONE timer; unmounting them all stops it', () => {
    const readers = Array.from({ length: 1000 }, () => render(h(Reader, { every: 'second' })))

    expect(vi.getTimerCount()).toBe(1)
    expect(_tickerStats()).toEqual({ active: 1, timers: 1, shared: 1 })
    for (const r of readers.slice(0, 999)) r.done()
    expect(vi.getTimerCount()).toBe(1)
    readers[999]!.done()
    expect(vi.getTimerCount()).toBe(0)
    expect(_tickerStats()).toEqual({ active: 0, timers: 0, shared: 0 })
  })

  it('different granularities use different tickers, each released on its own', () => {
    const a = render(h(Reader, { every: 'second' }))
    const b = render(h(Reader, { every: 'minute' }))

    expect(vi.getTimerCount()).toBe(2)
    a.done()
    expect(vi.getTimerCount()).toBe(1)
    b.done()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('numeric intervals share per distinct value, and past the cap a reader gets a private ticker that is stopped with it', () => {
    const all = Array.from({ length: MAX_SHARED_TICKERS + 6 }, (_, i) => render(h(Reader, { every: 1000 + i })))

    expect(_tickerStats().shared).toBeLessThanOrEqual(MAX_SHARED_TICKERS)
    expect(_tickerStats().active).toBe(MAX_SHARED_TICKERS + 6)
    expect(vi.getTimerCount()).toBe(MAX_SHARED_TICKERS + 6)
    const same = render(h(Reader, { every: 1000 })) // an existing shared interval is reused

    expect(vi.getTimerCount()).toBe(MAX_SHARED_TICKERS + 6)
    same.done()
    for (const r of all) r.done()
    expect(vi.getTimerCount()).toBe(0)
    expect(_tickerStats()).toEqual({ active: 0, timers: 0, shared: 0 })
  })
})

describe('hidden documents', () => {
  const setHidden = (hidden: boolean): void => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('no timer runs while hidden; on becoming visible every reader is updated once and re-aimed', () => {
    const { root, done } = render(h(Reader, { every: 'second' }))

    setHidden(true)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(65_000) // 65 ticks would have fired
    expect(root.textContent).toBe(String(T0))
    setHidden(false)
    expect(root.textContent).toBe(String(T0 + 65_000)) // recomputed once, not replayed
    expect(vi.getTimerCount()).toBe(1)
    done()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a reader mounted while hidden starts no timer until the page is visible', () => {
    setHidden(true)
    const { done } = render(h(Reader, { every: 'second' }))

    expect(vi.getTimerCount()).toBe(0)
    setHidden(false)
    expect(vi.getTimerCount()).toBe(1)
    done()
  })

  it('the visibility listener is removed when the last reader is released', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const a = render(h(Reader, { every: 'second' }))
    const b = render(h(Reader, { every: 'minute' }))

    expect(add.mock.calls.filter((c) => c[0] === 'visibilitychange')).toHaveLength(1)
    a.done()
    b.done()
    expect(remove.mock.calls.filter((c) => c[0] === 'visibilitychange')).toHaveLength(1)
  })
})

describe('the day ticker follows the local midnight of the active zone', () => {
  it('Prague, 23-hour day: 23:30 on the 28th, midnight half an hour later, then the next one 23 hours after that', () => {
    vi.setSystemTime(Date.UTC(2026, 2, 28, 22, 30)) // 23:30 CET, the evening before the clocks go forward
    setTimeZone('Europe/Prague')
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const { done } = render(h(Reader, { every: 'day' }))

    expect(spy.mock.calls.at(-1)![1]).toBe(30 * 60_000)
    vi.advanceTimersByTime(30 * 60_000) // 00:00 CET on the 29th
    expect(spy.mock.calls.at(-1)![1]).toBe(23 * 3_600_000)
    vi.advanceTimersByTime(23 * 3_600_000)
    expect(new Date(Date.now()).toISOString()).toBe('2026-03-29T22:00:00.000Z') // 00:00 CEST on the 30th
    done()
    spy.mockRestore()
  })

  it('Prague, 25-hour day: the next midnight is 25 hours away', () => {
    vi.setSystemTime(Date.UTC(2026, 9, 24, 22, 0)) // 00:00 CEST on the 25th
    setTimeZone('Europe/Prague')
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const { done } = render(h(Reader, { every: 'day' }))

    expect(spy.mock.calls.at(-1)![1]).toBe(25 * 3_600_000)
    done()
    spy.mockRestore()
  })

  it('a different active zone moves the reader to that zone\'s ticker', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 18, 12, 0))
    setTimeZone('UTC')
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const { done } = render(h(Reader, { every: 'day' }))

    expect(spy.mock.calls.at(-1)![1]).toBe(12 * 3_600_000)
    setTimeZone('Asia/Tokyo') // 21:00 there: 3 hours to midnight
    expect(spy.mock.calls.at(-1)![1]).toBe(3 * 3_600_000)
    expect(_tickerStats()).toEqual({ active: 1, timers: 1, shared: 1 })
    done()
    expect(vi.getTimerCount()).toBe(0)
    spy.mockRestore()
  })

  it('the hour ticker aligns to the local hour in a 45-minute zone', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 18, 12, 0)) // 17:45 in Kathmandu
    setTimeZone('Asia/Kathmandu')
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const { done } = render(h(Reader, { every: 'hour' }))

    expect(spy.mock.calls.at(-1)![1]).toBe(15 * 60_000) // to 18:00 local
    done()
    spy.mockRestore()
  })
})

describe('dynamic granularity and an explicit zone', () => {
  it('a reactive every moves the reader between tickers and never holds two', () => {
    const every = signal<'second' | 'minute'>('second')
    const Dyn = () => {
      const n = useNow({ every: () => every() })

      return h('span', null, () => String(n()))
    }
    const { done } = render(h(Dyn, null))

    expect(_tickerStats()).toEqual({ active: 1, timers: 1, shared: 1 })
    every.set('minute')
    expect(_tickerStats()).toEqual({ active: 1, timers: 1, shared: 1 })
    expect(vi.getTimerCount()).toBe(1)
    done()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('an explicit zone beats the active zone for day alignment', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 18, 12, 0))
    setTimeZone('UTC')
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const Zoned = () => {
      useNow({ every: 'day', zone: 'Asia/Tokyo' })

      return h('i', null)
    }
    const { done } = render(h(Zoned, null))

    expect(spy.mock.calls.at(-1)![1]).toBe(3 * 3_600_000) // Tokyo midnight, not UTC midnight
    done()
    spy.mockRestore()
  })
})

describe('the pin and the provided clock', () => {
  it('setClock pins now() and the tickers, null restores, and a bad value throws', () => {
    setClock(() => 5)
    expect(now()).toBe(5)
    setClock(null)
    expect(now()).toBe(T0)
    expect(() => setClock(5 as never)).toThrow(/\[Pyreon\] setClock\(\)/)
    expect(() => provideClock(Number.NaN)).toThrow(/\[Pyreon\] provideClock\(\)/)
    expect(() => useNow({ every: 'week' as never })).toThrow(/\[Pyreon\] useNow\(\): every must be/)
    expect(() => useNow({ every: 0 })).toThrow(/at least 1/)
  })

  it('provideClock scopes a subtree; a provided accessor is tracked', () => {
    const Scoped = () => {
      provideClock(() => 42)

      return h('span', null, () => String(now()))
    }
    const { root, done } = render(h(Scoped, null))

    expect(root.textContent).toBe('42')
    done()
  })
})

describe('the server-to-client hand-over', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__PYREON_CLOCK__
    document.documentElement.removeAttribute('data-pyreon-clock')
  })

  it('the first client read returns the server instant, a macrotask later real time takes over, with one update', () => {
    const SERVER = T0 - 5 * 60_000
    const seen: number[] = []

    ;(globalThis as Record<string, unknown>).__PYREON_CLOCK__ = SERVER
    const Probe = () => {
      const n = useNow({ every: 'minute' })

      effect(() => {
        seen.push(n())
      })

      return h('i', null)
    }
    const { done } = render(h(Probe, null))

    expect(now()).toBe(SERVER)
    expect(seen).toEqual([SERVER])
    vi.advanceTimersByTime(0)
    expect(now()).toBe(T0)
    expect(seen).toEqual([SERVER, T0]) // exactly one update
    done()
  })

  it('the attribute form works too, and releaseClock can be called early', () => {
    document.documentElement.setAttribute('data-pyreon-clock', String(T0 - 1000))
    expect(now()).toBe(T0 - 1000)
    releaseClock()
    expect(now()).toBe(T0)
    releaseClock() // idempotent
    expect(now()).toBe(T0)
  })

  it('with nothing emitted, now() is plain time and nothing is scheduled', () => {
    expect(now()).toBe(T0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clockScript and clockAttributes', () => {
    expect(clockScript({ instant: 1234.9 })).toBe('<script>window.__PYREON_CLOCK__=1234</script>')
    expect(clockScript({ instant: 5, nonce: 'abc"><x' })).toBe('<script nonce="abcx">window.__PYREON_CLOCK__=5</script>')
    expect(clockAttributes(77)).toEqual({ 'data-pyreon-clock': '77' })
    expect(() => clockScript({ instant: Number.NaN })).toThrow(/\[Pyreon\] clockScript\(\)/)
    expect(() => clockAttributes(Number.POSITIVE_INFINITY)).toThrow(/\[Pyreon\] clockAttributes\(\)/)
  })
})

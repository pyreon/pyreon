// @vitest-environment happy-dom
import { setTimeZone } from '@pyreon/ambient'
import { resetClockState, resetLocaleState } from '@pyreon/ambient/testing'
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { isToday, now, setClock, today, useCountdown, useElapsed, useRelative, useToday } from '../index'
import type { RelativeDistance } from '../index'

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

const label = (d: RelativeDistance): string => `${d.value} ${d.unit}`

beforeEach(() => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 18, 12, 0, 0) })
})

afterEach(() => {
  resetClockState()
  resetLocaleState()
  vi.useRealTimers()
})

describe('the reactive entry reads the ambient clock and zone', () => {
  it('setClock pins now, today and the day helpers; the zone defaults to the active one', () => {
    setClock(() => Date.UTC(2031, 5, 18, 16, 0))
    expect(now()).toBe(Date.UTC(2031, 5, 18, 16, 0))
    expect(today('Asia/Tokyo')).toBe('2031-06-19')
    setTimeZone('Asia/Tokyo')
    expect(today()).toBe('2031-06-19')
    expect(isToday('2031-06-19')).toBe(true)
    expect(isToday('2031-06-18')).toBe(false)
  })
})

describe('useToday', () => {
  it('flips at local midnight of the zone, once, on the shared day ticker', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 18, 22, 30)) // 23:30 in Prague
    const Probe = () => {
      const t = useToday('Europe/Prague')

      return h('span', null, () => t())
    }
    const { root, done } = render(h(Probe, null))

    expect(root.textContent).toBe('2026-11-18')
    vi.advanceTimersByTime(29 * 60_000)
    expect(root.textContent).toBe('2026-11-18')
    vi.advanceTimersByTime(60_000)
    expect(root.textContent).toBe('2026-11-19')
    done()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('follows the active zone when none is given', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 18, 12, 0))
    setTimeZone('UTC')
    const Probe = () => {
      const t = useToday()

      return h('span', null, () => t())
    }
    const { root, done } = render(h(Probe, null))

    expect(root.textContent).toBe('2026-11-18')
    setTimeZone('Pacific/Kiritimati') // UTC+14: already the 19th
    expect(root.textContent).toBe('2026-11-19')
    done()
  })
})

describe('useCountdown and useElapsed', () => {
  it('counts down to an Instant, ticks every second, and is done at zero', () => {
    const target = Date.now() + 2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 5_000
    const Probe = () => {
      const c = useCountdown(target)

      return h('span', null, () => `${JSON.stringify(c.remaining())}|${c.totalMs()}|${c.done()}`)
    }
    const { root, done } = render(h(Probe, null))

    expect(root.textContent).toContain('"days":2,"hours":3,"minutes":4,"seconds":5')
    vi.advanceTimersByTime(1000)
    expect(root.textContent).toContain('"seconds":4')
    vi.advanceTimersByTime(target - Date.now())
    expect(root.textContent).toBe('{"days":0,"hours":0,"minutes":0,"seconds":0,"milliseconds":0}|0|true')
    done()
  })

  it('a wall-clock target is read in the zone, and a Date works', () => {
    const Probe = () => {
      const a = useCountdown('2026-11-18T14:00', { zone: 'UTC' })
      const b = useCountdown(new Date(Date.UTC(2026, 10, 18, 13, 0)), { zone: 'UTC' })

      return h('span', null, () => `${a.totalMs()}|${b.totalMs()}`)
    }
    const { root, done } = render(h(Probe, null))

    expect(root.textContent).toBe(`${2 * 3_600_000}|${3_600_000}`)
    done()
  })

  it('useElapsed is the stopwatch', () => {
    const Probe = () => {
      const e = useElapsed(Date.now() - 90_061_000)

      return h('span', null, () => JSON.stringify(e()))
    }
    const { root, done } = render(h(Probe, null))

    expect(root.textContent).toBe('{"days":1,"hours":1,"minutes":1,"seconds":1,"milliseconds":0}')
    vi.advanceTimersByTime(2000)
    expect(root.textContent).toContain('"seconds":3')
    done()
  })

  it('many countdowns share one timer', () => {
    const rows = Array.from({ length: 200 }, () => render(h(() => { const c = useCountdown(Date.now() + 99_999); return h('i', null, () => String(c.totalMs())) }, null)))

    expect(vi.getTimerCount()).toBe(1)
    for (const r of rows) r.done()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useRelative: adaptive cadence on shared tickers', () => {
  const Rel = (props: { at: number; log?: string[] }) => {
    const r = useRelative(props.at, { zone: 'UTC' })

    return h('span', null, () => {
      const text = label(r())

      props.log?.push(text)

      return text
    })
  }

  it('a fresh timestamp ticks per second, then per minute, then per hour, then per day', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const at = Date.now() - 30_000
    const { root, done } = render(h(Rel, { at }))

    expect(root.textContent).toBe('-30 second')
    expect(spy.mock.calls.at(-1)![1]).toBe(1000) // aligned to the next full second
    vi.advanceTimersByTime(40_000) // 70 s old: minutes now
    expect(root.textContent).toBe('-1 minute')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(3_600_000)
    expect(root.textContent).toMatch(/^-(1|2) (minute|hour)$/)
    vi.advanceTimersByTime(23 * 3_600_000)
    expect(root.textContent).toMatch(/day|hour/)
    done()
    spy.mockRestore()
  })

  it('an old timestamp never holds a per-second timer: its next timer is the next local midnight', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const { root, done } = render(h(Rel, { at: Date.UTC(2026, 10, 10, 8) }))

    expect(root.textContent).toBe('-1 week')
    expect(spy.mock.calls.at(-1)![1]).toBe(12 * 3_600_000) // 12:00 -> next UTC midnight
    done()
    spy.mockRestore()
  })

  it('200 labels of the same age share ONE ticker; of mixed ages, one per tier at most', () => {
    const same = Array.from({ length: 200 }, () => render(h(Rel, { at: Date.now() - 20_000 })))

    expect(vi.getTimerCount()).toBe(1)
    for (const r of same) r.done()
    const mixed = [10_000, 5 * 60_000, 3 * 3_600_000, 3 * 86_400_000].flatMap((age) => Array.from({ length: 50 }, () => render(h(Rel, { at: Date.now() - age }))))

    expect(vi.getTimerCount()).toBe(4)
    for (const r of mixed) r.done()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a future target reads as in N units, and yesterday is literally yesterday in the zone', () => {
    const { root, done } = render(h('div', null, h(Rel, { at: Date.now() + 5 * 60_000 }), h(Rel, { at: Date.UTC(2026, 10, 17, 11, 0) })))
    const texts = [...root.querySelectorAll('span')].map((s) => s.textContent)

    expect(texts).toEqual(['5 minute', '-1 day'])
    done()
  })

  it('outside a component it returns a plain accessor and starts nothing', () => {
    const r = useRelative(Date.now() - 60_000, { zone: 'UTC' })

    expect(label(r())).toBe('-1 minute')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bad targets throw a [Pyreon] error naming the hook', () => {
    expect(() => useRelative('nope' as never, { zone: 'UTC' })()).toThrow(/\[Pyreon\]/)
    expect(() => useCountdown(Number.NaN)).not.toThrow()
    expect(() => useCountdown(Number.NaN).totalMs()).toThrow(/\[Pyreon\] useCountdown/)
  })
})

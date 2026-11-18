/**
 * `useRelativeTime` and `<RelativeTime>`: the label updates at the moment its text would change (the target's own minute and
 * hour marks, local midnight), all labels share two timers, no timer runs on a server or without a reader, and a threshold
 * switches to an absolute date. Time is fake and pinned; the shared ticker machinery itself is tested in `@pyreon/ambient`.
 */
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { _resetClockState, _tickerStats } from '@pyreon/ambient/testing'
import { RelativeTime } from '../components'
import { formatRelativeTo, relativeFormatter, useRelativeTime } from '../index'
import { _resetLocaleState } from '../locale'
import { _resetWarnings } from '../warn'

const T0 = Date.UTC(2026, 10, 18, 12, 0, 0, 400) // 12:00:00.400 UTC
const SEC = 1000
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const en = { locale: 'en-US', timeZone: 'UTC' } as const

function render(vnode: VNodeChild) {
  const root = document.createElement('div')

  document.body.appendChild(root)
  const unmount = mount(vnode as never, root)

  return {
    root,
    text: () => root.textContent,
    done() {
      unmount()
      root.remove()
    },
  }
}

const Label = (props: { target: number | string | (() => number | string); options?: object }) => {
  const text = useRelativeTime(props.target as never, { ...en, ...props.options })

  return h('span', null, text)
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 })
  _resetWarnings()
})

afterEach(() => {
  _resetClockState()
  _resetLocaleState()
  vi.useRealTimers()
})

describe('useRelativeTime: the text at the moment it would change', () => {
  it('counts seconds, then minutes at the TARGET\'s own minute (not the next wall-clock minute)', () => {
    // 90.4 s old at T0: "1 minute ago", and it must read "2 minutes ago" when the target turns 120 s old, 29.6 s from now.
    const { text, done } = render(h(Label, { target: T0 - 90_400 }))

    expect(text()).toBe('1 minute ago')
    vi.advanceTimersByTime(29_599)
    expect(text()).toBe('1 minute ago')
    vi.advanceTimersByTime(1)
    expect(text()).toBe('2 minutes ago')
    // and again one minute later, on the target's phase
    vi.advanceTimersByTime(59_999)
    expect(text()).toBe('2 minutes ago')
    vi.advanceTimersByTime(1)
    expect(text()).toBe('3 minutes ago')
    done()
  })

  it('a label under a minute ticks each second and becomes "1 minute ago" exactly at 60 s', () => {
    const { text, done } = render(h(Label, { target: T0 - 40_000 }))

    expect(text()).toBe('40 seconds ago')
    vi.advanceTimersByTime(600) // the shared second ticker (aligned to the wall second): 40.6 s old
    expect(text()).toBe('40 seconds ago')
    vi.advanceTimersByTime(1_000) // 41.6 s
    expect(text()).toBe('41 seconds ago')
    vi.advanceTimersByTime(18_200) // the wall-second tick at 59.6 s old
    expect(text()).toBe('59 seconds ago')
    vi.advanceTimersByTime(199) // 59.999 s
    expect(text()).toBe('59 seconds ago')
    vi.advanceTimersByTime(1) // exactly 60 s old, not at the next wall second
    expect(text()).toBe('1 minute ago')
    done()
  })

  it('hours flip at the target\'s own hour, and a day later it counts calendar days', () => {
    const target = T0 - 2 * HOUR - 10 * MIN // 09:49:59.6
    const { text, done } = render(h(Label, { target }))

    expect(text()).toBe('2 hours ago')
    vi.advanceTimersByTime(50 * MIN - 1)
    expect(text()).toBe('2 hours ago')
    vi.advanceTimersByTime(1)
    expect(text()).toBe('3 hours ago')
    vi.advanceTimersByTime(21 * HOUR - 1) // 23 h 59 m 59.999 s old
    expect(text()).toBe('23 hours ago')
    vi.advanceTimersByTime(1) // exactly 24 h old: the calendar says yesterday
    expect(text()).toBe('yesterday')
    done()
  })

  it('days change at local midnight of the zone, not 24 hours after the target', () => {
    // The 16th at 13:00 UTC: at T0 (12:00 on the 18th, 47 h later) it is "2 days ago", and "3 days ago" from 00:00 on the 19th.
    const { text, done } = render(h(Label, { target: Date.UTC(2026, 10, 16, 13, 0, 0) }))

    expect(text()).toBe('2 days ago')
    vi.advanceTimersByTime(12 * HOUR - 401) // 23:59:59.999
    expect(text()).toBe('2 days ago')
    vi.advanceTimersByTime(1)
    expect(text()).toBe('3 days ago')
    done()
  })

  it('a future target: counts down, comes within a day, and changes when it passes', () => {
    const { text, done } = render(h(Label, { target: Date.UTC(2026, 10, 20, 17, 0, 0) }))

    expect(text()).toBe('in 2 days')
    vi.advanceTimersByTime(12 * HOUR - 401) // 23:59:59.999 on the 18th
    expect(text()).toBe('in 2 days')
    vi.advanceTimersByTime(1) // midnight: the 19th is today, the 20th is tomorrow
    expect(text()).toBe('tomorrow')
    vi.advanceTimersByTime(17 * HOUR - 1) // 16:59:59.999 on the 19th: 24 h and 1 ms before the target
    expect(text()).toBe('tomorrow')
    vi.advanceTimersByTime(1) // exactly 24 h before: still the calendar
    expect(text()).toBe('tomorrow')
    vi.advanceTimersByTime(1) // within 24 h: elapsed hours
    expect(text()).toBe('in 23 hours')
    done()

    const near = render(h(Label, { target: Date.now() + 90_000 }))

    expect(near.text()).toBe('in 1 minute')
    vi.advanceTimersByTime(30_001) // 59.999 s left
    expect(near.text()).toBe('in 59 seconds')
    vi.advanceTimersByTime(120_000) // 150 s after mount: the target is a minute old
    expect(near.text()).toBe('1 minute ago')
    near.done()
  })

  it('follows a signal target and the options', () => {
    const target = signal(T0 - 5 * MIN)
    const { text, done } = render(h(Label, { target: () => target() }))

    expect(text()).toBe('5 minutes ago')
    target.set(T0 - 2 * HOUR)
    expect(text()).toBe('2 hours ago')
    target.set(T0 - 3 * DAY)
    expect(text()).toBe('3 days ago')
    done()
  })

  it('nullish and invalid targets give the fallback and start no timer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = render(h(Label, { target: undefined as never, options: { fallback: '—' } }))
    const b = render(h(Label, { target: 'garbage', options: { fallback: '?' } }))

    expect(a.text()).toBe('—')
    expect(b.text()).toBe('?')
    expect(vi.getTimerCount()).toBe(0)
    a.done()
    b.done()
    warn.mockRestore()
  })

  it('numeric: always and style: short', () => {
    const { text, done } = render(h(Label, { target: T0 - DAY - HOUR, options: { numeric: 'always', style: 'short' } }))

    expect(text()).toBe('1 day ago')
    done()
  })

  it('follows the active locale and time zone', () => {
    const zone = signal('UTC')
    const Probe = () => h('span', null, useRelativeTime(Date.UTC(2026, 10, 16, 23, 0, 0), () => ({ locale: 'en-US', timeZone: zone() })))
    const { text, done } = render(h(Probe, null))

    expect(text()).toBe('2 days ago') // the 16th and the 18th in UTC
    zone.set('Asia/Tokyo') // the 17th at 08:00 and the 18th at 21:00 in Tokyo
    expect(text()).toBe('yesterday')
    done()
  })
})

describe('threshold: an absolute date after a distance', () => {
  const threshold = { after: { days: 7 }, as: 'medium' } as const

  it('relative before it, the date at and after it, in either direction', () => {
    const a = render(h(Label, { target: T0 - 6 * DAY, options: { threshold } }))
    const b = render(h(Label, { target: T0 - 7 * DAY, options: { threshold } }))
    const c = render(h(Label, { target: T0 + 9 * DAY, options: { threshold } }))

    expect(a.text()).toBe('6 days ago')
    expect(b.text()).toBe('Nov 11, 2026')
    expect(c.text()).toBe('Nov 27, 2026')
    a.done()
    b.done()
    c.done()
  })

  it('switches exactly when the target turns 7 days old, then starts no further timer', () => {
    const { text, done } = render(h(Label, { target: T0 - 7 * DAY + 5 * MIN, options: { threshold } }))

    expect(text()).toBe('last week')
    vi.advanceTimersByTime(5 * MIN - 1)
    expect(text()).toBe('last week')
    vi.advanceTimersByTime(1)
    expect(text()).toBe('Nov 11, 2026')
    vi.advanceTimersByTime(DAY)
    expect(vi.getTimerCount()).toBe(0) // an absolute date never changes again
    done()
  })

  it('a future target beyond the threshold turns relative when it comes within it', () => {
    const { text, done } = render(h(Label, { target: T0 + 7 * DAY + MIN, options: { threshold } }))

    expect(text()).toBe('Nov 25, 2026')
    vi.advanceTimersByTime(MIN)
    expect(text()).toBe('Nov 25, 2026') // exactly 7 days away is still the date
    vi.advanceTimersByTime(1)
    expect(text()).toBe('next week')
    done()
  })

  it('as takes Intl options, after takes milliseconds, and a bad threshold is a [Pyreon] error', () => {
    const a = render(h(Label, { target: T0 - 10 * DAY, options: { threshold: { after: 5 * DAY, as: { month: 'long', day: 'numeric' } } } }))

    expect(a.text()).toBe('November 8')
    a.done()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(h(Label, { target: T0, options: { threshold: { after: -1 } } })).done()
    expect(error.mock.calls.some((c) => /\[Pyreon\].*threshold must be/.test(String(c[0]) + String(c[1])))).toBe(true)
    error.mockRestore()
  })

  it('a calendar value stays on its own day', () => {
    const { text, done } = render(h(Label, { target: '2026-11-01', options: { threshold, timeZone: 'Pacific/Kiritimati' } }))

    expect(text()).toBe('Nov 1, 2026')
    done()
  })
})

describe('options', () => {
  it('only a style (or only a locale) keeps the numeric: auto default', () => {
    expect(formatRelativeTo('2026-11-16', '2026-11-17', { locale: 'en-US', style: 'short' })).toBe('yesterday')
    expect(relativeFormatter({ locale: 'en-US', base: '2026-11-17', style: 'narrow' })('2026-11-16')).toBe('yesterday')
    expect(formatRelativeTo('2026-11-16', '2026-11-17', { locale: 'en-US', numeric: 'always' })).toBe('1 day ago')
  })
})

describe('timers', () => {
  it('200 labels of every age share two timers (one for seconds, one for every other change)', () => {
    const ages = [5 * SEC, 40 * SEC, 2 * MIN, 17 * MIN, 59 * MIN, 3 * HOUR, 20 * HOUR]
    const roots = Array.from({ length: 200 }, (_, i) => render(h(Label, { target: T0 - (ages[i % ages.length] as number) - i * 13 })))

    expect(vi.getTimerCount()).toBeLessThanOrEqual(2)
    expect(_tickerStats().timers).toBeLessThanOrEqual(2)
    vi.advanceTimersByTime(10 * MIN)
    expect(vi.getTimerCount()).toBeLessThanOrEqual(2)
    for (const r of roots) r.done()
    expect(vi.getTimerCount()).toBe(0)
    expect(_tickerStats()).toEqual({ active: 0, timers: 0, shared: 0 })
  })

  it('the last reader to go away stops every timer', () => {
    const a = render(h(Label, { target: T0 - 30 * SEC }))
    const b = render(h(Label, { target: T0 - 5 * MIN }))

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    a.done()
    expect(vi.getTimerCount()).toBe(1)
    b.done()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('outside a component it is a plain reading: no timer, no subscription', () => {
    const read = useRelativeTime(T0 - 3 * MIN, en)

    expect(read()).toBe('3 minutes ago')
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(2 * MIN)
    expect(read()).toBe('5 minutes ago')
  })
})

describe('<RelativeTime>', () => {
  it('renders <time> with datetime, an exact title and the relative text; a title you pass wins', () => {
    const { root, done } = render(h(RelativeTime, { value: T0 - 3 * MIN, locale: 'en-US', timeZone: 'UTC' }))
    const el = root.querySelector('time') as HTMLTimeElement

    expect(el.textContent).toBe('3 minutes ago')
    expect(el.getAttribute('datetime')).toBe(new Date(T0 - 3 * MIN).toISOString())
    expect(el.getAttribute('title')).toMatch(/Wednesday, November 18, 2026/)
    expect(el.getAttribute('title')).toMatch(/11:57:00/)
    expect(el.getAttribute('title')).toMatch(/UTC/)
    expect(el.getAttribute('style')).toMatch(/unicode-bidi: isolate/)
    done()

    const own = render(h(RelativeTime, { value: T0 - MIN, locale: 'en-US', title: 'posted' }))

    expect(own.root.querySelector('time')?.getAttribute('title')).toBe('posted')
    own.done()
  })

  it('updates itself, follows a signal, and a calendar value keeps its string as datetime', () => {
    const value = signal<number | string>(T0 - 30 * SEC)
    const { root, done } = render(
      h(RelativeTime, {
        get value() {
          return value()
        },
        locale: 'en-US',
        timeZone: 'UTC',
      }),
    )
    const el = root.querySelector('time') as HTMLTimeElement

    vi.advanceTimersByTime(35 * SEC)
    expect(el.textContent).toBe('1 minute ago')
    value.set('2026-11-17')
    expect(el.textContent).toBe('yesterday')
    expect(el.getAttribute('datetime')).toBe('2026-11-17')
    done()
  })

  it('numeric, threshold, fallback, isolate and forwarded attributes', () => {
    const { root, done } = render(
      h('div', null, [
        h(RelativeTime, { value: T0 - DAY, numeric: 'always', locale: 'en-US', class: 'a', id: 'x' }),
        h(RelativeTime, { value: T0 - 20 * DAY, threshold: { after: { days: 7 } }, locale: 'en-US', timeZone: 'UTC', isolate: false }),
        h(RelativeTime, { value: undefined, fallback: 'never', locale: 'en-US' }),
      ]),
    )
    const [a, b, c] = Array.from(root.querySelectorAll('time')) as HTMLElement[]

    expect(a?.textContent).toBe('1 day ago')
    expect(a?.className).toBe('a')
    expect(a?.id).toBe('x')
    expect(b?.textContent).toBe('Oct 29, 2026')
    expect(b?.getAttribute('style')).toBeNull()
    expect(c?.textContent).toBe('never')
    expect(c?.hasAttribute('datetime')).toBe(false)
    done()
  })
})

// @vitest-environment happy-dom
import { setTimeZone } from '@pyreon/ambient'
import { _resetClockState, _resetLocaleState } from '@pyreon/ambient/testing'
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { useNextOccurrence, useOccursToday } from '../index'
import type { Recurrence } from '../index'

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

beforeEach(() => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 18, 12, 0, 0) })
})

afterEach(() => {
  _resetClockState()
  _resetLocaleState()
  vi.useRealTimers()
})

describe('the reactive entry reads the ambient zone and clock through @pyreon/time', () => {
  it('useOccursToday flips at local midnight of the rule\'s zone', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 18, 22, 30)) // 23:30 in Prague on a Wednesday
    const rule: Recurrence = { every: 'week', on: { weekdays: [4] }, start: '2026-11-05', timeZone: 'Europe/Prague' }
    const Probe = () => {
      const on = useOccursToday(rule)

      return h('span', null, () => String(on()))
    }
    const { root, done } = render(h(Probe, null))

    expect(root.textContent).toBe('false')
    vi.advanceTimersByTime(60 * 60_000) // 00:30 in Prague: Thursday
    expect(root.textContent).toBe('true')
    done()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('useNextOccurrence moves on at midnight, and follows the active zone when the rule has none', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 18, 12, 0))
    setTimeZone('Asia/Tokyo')
    const rule: Recurrence = { every: 'day', start: '2026-11-01', on: { weekdays: [1] } }
    const Probe = () => {
      const next = useNextOccurrence(rule)

      return h('span', null, () => String(next()))
    }
    const { root, done } = render(h(Probe, null))

    expect(root.textContent).toBe('2026-11-23')
    setTimeZone('America/Los_Angeles')
    expect(root.textContent).toBe('2026-11-23')
    vi.setSystemTime(Date.UTC(2026, 10, 23, 12, 0))
    vi.advanceTimersByTime(24 * 60 * 60_000)
    expect(root.textContent).toBe('2026-11-30')
    done()
  })

  it('an endless rule gives a date, a finished rule gives null', () => {
    const finished: Recurrence = { every: 'day', start: '2026-11-01', until: '2026-11-10' }
    const Probe = () => {
      const next = useNextOccurrence(finished)

      return h('span', null, () => String(next()))
    }
    const { root, done } = render(h(Probe, null))

    expect(root.textContent).toBe('null')
    done()
  })
})

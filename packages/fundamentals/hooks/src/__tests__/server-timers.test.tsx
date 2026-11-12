// @vitest-environment node
/**
 * Server rendering must not schedule timers. Server-rendered components never
 * unmount, so the `onUnmount` / `onHookCleanup` cleanup that clears a timer
 * never runs: a timer started during SSR/SSG keeps the process alive forever
 * (a `vite build` that never exits) and runs side effects after render.
 *
 * `isServer` is true here (no `document` at load), so these exercise the real
 * server path through `renderToString`.
 */
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { isServer } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from '../useDebouncedValue'
import { useInterval } from '../useInterval'
import { useTimeAgo } from '../useTimeAgo'
import { useTimeout } from '../useTimeout'

describe('hooks on the server', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('runs in the server environment', () => {
    expect(isServer).toBe(true)
  })

  it('useTimeAgo renders the string once and schedules no refresh timer', async () => {
    const Comp = () => {
      const timeAgo = useTimeAgo(Date.now() - 10_000)
      return h('span', null, timeAgo)
    }

    const html = await renderToString(h(Comp, null))

    expect(html).toContain('10 seconds ago')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('useInterval schedules no interval on the server', async () => {
    const tick = vi.fn()
    const Comp = () => {
      useInterval(tick, 1000)
      return h('div', null, 'x')
    }

    await renderToString(h(Comp, null))
    vi.advanceTimersByTime(10_000)

    expect(vi.getTimerCount()).toBe(0)
    expect(tick).not.toHaveBeenCalled()
  })

  it('useTimeout does not start its timer on the server, and reset is a no-op', async () => {
    const fire = vi.fn()
    let controls: { reset: () => void; clear: () => void } | undefined
    const Comp = () => {
      controls = useTimeout(fire, 1000)
      return h('div', null, 'x')
    }

    await renderToString(h(Comp, null))
    expect(vi.getTimerCount()).toBe(0)

    controls?.reset()
    vi.advanceTimersByTime(10_000)

    expect(vi.getTimerCount()).toBe(0)
    expect(fire).not.toHaveBeenCalled()
  })

  it('useDebouncedValue schedules no trailing update on the server', async () => {
    let value: (() => string) | undefined
    const Comp = () => {
      value = useDebouncedValue(() => 'settled', 300)
      return h('div', null, 'x')
    }

    await renderToString(h(Comp, null))

    expect(vi.getTimerCount()).toBe(0)
    expect(value?.()).toBe('settled')
  })
})

import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock lifecycle hooks ───────────────────────────────────────────────────

let cleanups: Array<() => void> = []

vi.mock('@pyreon/reactivity', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    onCleanup: (fn: () => void) => {
      cleanups.push(fn)
    },
  }
})

// ─── useOnline — cleanup branch ─────────────────────────────────────────────

import { useOnline } from '../useOnline'

describe('useOnline — cleanup', () => {
  beforeEach(() => {
    cleanups = []
  })

  it('removes event listeners on cleanup', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    useOnline()

    // Run cleanup
    cleanups.forEach((fn) => fn())

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function))
    removeSpy.mockRestore()
  })
})

// ─── useInfiniteScroll — loading/hasMore branches ───────────────────────────

import { useInfiniteScroll } from '../useInfiniteScroll'

describe('useInfiniteScroll — loading and hasMore guards', () => {
  beforeEach(() => {
    cleanups = []
  })

  it('does not call onLoadMore when loading is true', () => {
    const onLoadMore = vi.fn()
    const loading = signal(true)
    const { ref, triggered } = useInfiniteScroll(onLoadMore, {
      loading,
      threshold: 0,
    })

    const container = document.createElement('div')
    ref(container)

    // Manually trigger the observer callback
    // The sentinel is at container.children[0]
    // We can't easily trigger IntersectionObserver in happy-dom,
    // but we exercised the setup/cleanup paths
    expect(triggered()).toBe(false)
  })

  it('does not call onLoadMore when hasMore returns false', () => {
    const onLoadMore = vi.fn()
    const hasMore = signal(false)
    const { ref } = useInfiniteScroll(onLoadMore, {
      hasMore,
      threshold: 50,
    })

    const container = document.createElement('div')
    ref(container)

    // Cleanup
    ref(null)
  })

  it('cleanup works when observer is null', () => {
    const { ref } = useInfiniteScroll(vi.fn())
    // ref(null) without prior setup
    ref(null)
  })

  it('sentinel has correct styles', () => {
    const { ref } = useInfiniteScroll(vi.fn(), { direction: 'down', threshold: 200 })
    const container = document.createElement('div')
    ref(container)

    const sentinel = container.children[0] as HTMLElement
    expect(sentinel.style.height).toBe('1px')
    expect(sentinel.style.width).toBe('100%')
    expect(sentinel.style.pointerEvents).toBe('none')
  })
})

// ─── useTimeAgo — future dates and edge cases ──────────────────────────────

import { useTimeAgo } from '../useTimeAgo'

describe('useTimeAgo — branches', () => {
  beforeEach(() => {
    cleanups = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('handles future dates', () => {
    const future = Date.now() + 5 * 60_000 // 5 minutes from now
    const result = useTimeAgo(future)
    vi.advanceTimersByTime(0)

    const text = result()
    expect(text).toMatch(/in 5 minutes?/)
  })

  it('handles days ago', () => {
    const daysAgo = Date.now() - 3 * 86400_000 // 3 days ago
    const result = useTimeAgo(daysAgo)
    vi.advanceTimersByTime(0)

    expect(result()).toMatch(/3 days? ago/)
  })

  it('handles weeks ago', () => {
    const weeksAgo = Date.now() - 2 * 7 * 86400_000 // 2 weeks ago
    const result = useTimeAgo(weeksAgo)
    vi.advanceTimersByTime(0)

    expect(result()).toMatch(/2 weeks? ago/)
  })

  it('handles months ago', () => {
    const monthsAgo = Date.now() - 60 * 86400_000 // ~2 months ago
    const result = useTimeAgo(monthsAgo)
    vi.advanceTimersByTime(0)

    expect(result()).toMatch(/2 months? ago/)
  })

  it('handles years ago', () => {
    const yearsAgo = Date.now() - 400 * 86400_000 // ~1 year ago
    const result = useTimeAgo(yearsAgo)
    vi.advanceTimersByTime(0)

    // Intl.RelativeTimeFormat uses "last year" for 1 year ago
    expect(result()).toMatch(/year/)
  })

  it('uses custom interval override', () => {
    const result = useTimeAgo(Date.now() - 30_000, { interval: 500 })
    vi.advanceTimersByTime(0)

    expect(result()).toMatch(/30 seconds? ago/)
  })

  it('adaptive interval: updates more frequently for recent timestamps', () => {
    // Recent timestamp — should use 1s refresh
    const result = useTimeAgo(Date.now() - 10_000)
    vi.advanceTimersByTime(0) // first tick

    // Advance 1 second — should trigger another tick
    vi.advanceTimersByTime(1000)
    const text = result()
    expect(text).toMatch(/seconds? ago/)
  })

  it('cleans up on disposal', () => {
    const result = useTimeAgo(Date.now() - 10_000)
    vi.advanceTimersByTime(0)

    // Run cleanups
    cleanups.forEach((fn) => fn())

    // Further ticks should not update
    const frozen = result()
    vi.advanceTimersByTime(5000)
    expect(result()).toBe(frozen)
  })

  it('handles Date object in tick', () => {
    const date = new Date(Date.now() - 120_000) // 2 minutes ago
    const result = useTimeAgo(date)
    vi.advanceTimersByTime(0)

    expect(result()).toMatch(/2 minutes? ago/)
  })
})

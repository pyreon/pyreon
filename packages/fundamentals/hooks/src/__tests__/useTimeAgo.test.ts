import { describe, expect, it, vi } from 'vitest'
import { useTimeAgo } from '../useTimeAgo'

describe('useTimeAgo', () => {
  it('returns "just now" for recent timestamps', () => {
    const result = useTimeAgo(Date.now() - 2000) // 2 seconds ago
    expect(result()).toBe('just now')
  })

  it('returns seconds ago for timestamps 5-59 seconds old', () => {
    vi.useFakeTimers()
    const result = useTimeAgo(Date.now() - 10_000) // 10 seconds ago
    vi.advanceTimersByTime(0) // trigger first tick

    const text = result()
    expect(text).toMatch(/10 seconds? ago/)
    vi.useRealTimers()
  })

  it('returns minutes ago for timestamps 1-59 minutes old', () => {
    vi.useFakeTimers()
    const result = useTimeAgo(Date.now() - 5 * 60_000) // 5 minutes ago
    vi.advanceTimersByTime(0)

    const text = result()
    expect(text).toMatch(/5 minutes? ago/)
    vi.useRealTimers()
  })

  it('returns hours ago for timestamps 1-23 hours old', () => {
    vi.useFakeTimers()
    const result = useTimeAgo(Date.now() - 3 * 3600_000) // 3 hours ago
    vi.advanceTimersByTime(0)

    const text = result()
    expect(text).toMatch(/3 hours? ago/)
    vi.useRealTimers()
  })

  it('accepts Date objects', () => {
    const result = useTimeAgo(new Date(Date.now() - 1000))
    expect(result()).toBe('just now')
  })

  it('accepts reactive getter', () => {
    vi.useFakeTimers()
    const timestamp = Date.now() - 30_000
    const result = useTimeAgo(() => timestamp)
    vi.advanceTimersByTime(0)

    const text = result()
    expect(text).toMatch(/30 seconds? ago/)
    vi.useRealTimers()
  })

  it('uses custom formatter', () => {
    vi.useFakeTimers()
    const result = useTimeAgo(Date.now() - 60_000, {
      formatter: (value, unit, isPast) => `${isPast ? '-' : '+'}${value}${unit[0]}`,
    })
    vi.advanceTimersByTime(0)

    expect(result()).toBe('-1m')
    vi.useRealTimers()
  })
})

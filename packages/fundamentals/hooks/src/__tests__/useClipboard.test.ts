import { describe, expect, it, vi } from 'vitest'
import { useClipboard } from '../useClipboard'

function mockClipboard(writeText: (...args: unknown[]) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  })
}

describe('useClipboard', () => {
  it('initializes with copied=false and empty text', () => {
    const { copied, text } = useClipboard()
    expect(copied()).toBe(false)
    expect(text()).toBe('')
  })

  it('copies text successfully', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)

    const { copy, copied, text } = useClipboard()
    const result = await copy('hello')

    expect(result).toBe(true)
    expect(copied()).toBe(true)
    expect(text()).toBe('hello')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('resets copied state after timeout', async () => {
    vi.useFakeTimers()
    mockClipboard(vi.fn().mockResolvedValue(undefined))

    const { copy, copied } = useClipboard({ timeout: 500 })
    await copy('test')

    expect(copied()).toBe(true)

    vi.advanceTimersByTime(500)
    expect(copied()).toBe(false)

    vi.useRealTimers()
  })

  it('returns false when clipboard write fails', async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error('fail')))

    const { copy, copied } = useClipboard()
    const result = await copy('fail')

    expect(result).toBe(false)
    expect(copied()).toBe(false)
  })

  it('clears previous timer on consecutive copies', async () => {
    vi.useFakeTimers()
    mockClipboard(vi.fn().mockResolvedValue(undefined))

    const { copy, copied } = useClipboard({ timeout: 1000 })

    await copy('first')
    vi.advanceTimersByTime(500)
    expect(copied()).toBe(true)

    await copy('second')
    vi.advanceTimersByTime(500)
    // Should still be true — timer was reset
    expect(copied()).toBe(true)

    vi.advanceTimersByTime(500)
    expect(copied()).toBe(false)

    vi.useRealTimers()
  })
})

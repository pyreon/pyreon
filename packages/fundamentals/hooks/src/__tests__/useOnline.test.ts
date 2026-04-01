import { describe, expect, it } from 'vitest'
import { useOnline } from '../useOnline'

describe('useOnline', () => {
  it('returns a signal reflecting navigator.onLine', () => {
    const online = useOnline()
    // In happy-dom, navigator.onLine defaults to true
    expect(online()).toBe(true)
  })

  it('updates to false on offline event', () => {
    const online = useOnline()
    window.dispatchEvent(new Event('offline'))
    expect(online()).toBe(false)
  })

  it('updates to true on online event', () => {
    const online = useOnline()
    window.dispatchEvent(new Event('offline'))
    expect(online()).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(online()).toBe(true)
  })

  it('handles multiple offline/online cycles', () => {
    const online = useOnline()
    expect(online()).toBe(true)

    window.dispatchEvent(new Event('offline'))
    expect(online()).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(online()).toBe(true)

    window.dispatchEvent(new Event('offline'))
    expect(online()).toBe(false)
  })
})

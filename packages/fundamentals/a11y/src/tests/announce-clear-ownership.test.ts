/**
 * `clearAfter` removes only the text THIS announcement wrote. If something else
 * has written into the live region by the time the clear fires, that text is
 * left alone. Clearing it would silently drop a message a screen reader user
 * has not heard yet.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { announce, clearAnnouncements } from '../announce'

const region = () => document.querySelector<HTMLElement>('[data-pyreon-announcer="polite"]')

afterEach(() => {
  vi.useRealTimers()
  clearAnnouncements()
})

describe('announce clearAfter', () => {
  it('clears its own message, and leaves text another writer put there', () => {
    vi.useFakeTimers()
    announce('Saved', { clearAfter: 500 })
    vi.advanceTimersByTime(200)
    expect(region()!.textContent).toBe('Saved')
    vi.advanceTimersByTime(600)
    expect(region()!.textContent).toBe('')

    announce('Copied', { clearAfter: 500 })
    vi.advanceTimersByTime(200)
    region()!.textContent = 'Written elsewhere'
    vi.advanceTimersByTime(600)
    expect(region()!.textContent).toBe('Written elsewhere')
  })
})

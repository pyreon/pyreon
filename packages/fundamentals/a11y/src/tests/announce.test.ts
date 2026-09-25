import { afterEach, describe, expect, it } from 'vitest'
import { announce, clearAnnouncements } from '../announce'

// announce() writes ~100ms after the call (see ANNOUNCE_DELAY_MS).
const nextFrame = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 150))

function region(politeness: 'polite' | 'assertive') {
  return document.querySelector<HTMLElement>(`[data-pyreon-announcer="${politeness}"]`)
}

describe('announce', () => {
  afterEach(() => clearAnnouncements())

  it('lazily creates a polite live region and writes the message', async () => {
    expect(region('polite')).toBeNull()
    announce('Saved')
    const el = region('polite')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('aria-live')).toBe('polite')
    expect(el.getAttribute('aria-atomic')).toBe('true')
    expect(el.getAttribute('role')).toBe('status')
    // cleared first, written on the next frame
    expect(el.textContent).toBe('')
    await nextFrame()
    expect(el.textContent).toBe('Saved')
  })

  it('reuses the same region across calls', async () => {
    announce('one')
    const first = region('polite')
    await nextFrame()
    announce('two')
    expect(region('polite')).toBe(first)
    await nextFrame()
    expect(first!.textContent).toBe('two')
  })

  it('uses an assertive region with role=alert', () => {
    announce('Boom', { politeness: 'assertive' })
    const el = region('assertive')!
    expect(el.getAttribute('aria-live')).toBe('assertive')
    expect(el.getAttribute('role')).toBe('alert')
    // polite + assertive are independent regions (both exist up front, but
    // the assertive message never lands in the polite one)
    expect(region('polite')!.textContent).toBe('')
  })

  it('clears the message after clearAfter ms', async () => {
    announce('temp', { clearAfter: 60 })
    await nextFrame()
    const el = region('polite')!
    expect(el.textContent).toBe('temp')
    await new Promise((r) => setTimeout(r, 100))
    expect(el.textContent).toBe('')
  })

  it('a stale clearAfter timer does not clear a newer message', async () => {
    announce('old', { clearAfter: 200 })
    await nextFrame()
    expect(region('polite')!.textContent).toBe('old')
    // A newer announcement replaces the text BEFORE the old timer fires —
    // the stale timer sees textContent !== its message and must not clear.
    announce('new')
    await nextFrame()
    expect(region('polite')!.textContent).toBe('new')
    await new Promise((r) => setTimeout(r, 250))
    expect(region('polite')!.textContent).toBe('new')
  })

  it('re-announces an identical consecutive message (clear-then-set)', async () => {
    announce('same')
    await nextFrame()
    const el = region('polite')!
    expect(el.textContent).toBe('same')
    announce('same')
    // cleared synchronously so the screen reader registers a change
    expect(el.textContent).toBe('')
    await nextFrame()
    expect(el.textContent).toBe('same')
  })

  it('recreates the region if it was detached from the DOM', async () => {
    announce('first')
    region('polite')!.remove()
    announce('second')
    expect(region('polite')).not.toBeNull()
    await nextFrame()
    // 'first' was still queued (never written), so it is delivered with
    // 'second' rather than dropped.
    expect(region('polite')!.textContent).toBe('first second')
  })

  it('clearAnnouncements removes all regions', () => {
    announce('a')
    announce('b', { politeness: 'assertive' })
    expect(region('polite')).not.toBeNull()
    expect(region('assertive')).not.toBeNull()
    clearAnnouncements()
    expect(region('polite')).toBeNull()
    expect(region('assertive')).toBeNull()
  })
})

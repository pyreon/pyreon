/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium proof for <LiveRegion> — the ARIA wiring + real
 * getComputedStyle clipping + reactive content updates that happy-dom can
 * only approximate.
 */
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { signal } from '@pyreon/reactivity'
import { LiveRegion } from '../live-region'

describe('<LiveRegion> (real Chromium)', () => {
  it('renders a polite status region clipped out of view but in the a11y tree', async () => {
    const { container, unmount } = mountInBrowser(<LiveRegion>Ready</LiveRegion>)
    await flush()
    const el = container.querySelector('div')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('aria-live')).toBe('polite')
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-atomic')).toBe('true')
    expect(el.textContent).toBe('Ready')
    const cs = getComputedStyle(el)
    expect(cs.position).toBe('absolute')
    expect(cs.width).toBe('1px')
    expect(cs.height).toBe('1px')
    expect(cs.display).not.toBe('none') // stays in the a11y tree
    unmount()
  })

  it('visible region is laid out normally (no clipping)', async () => {
    const { container, unmount } = mountInBrowser(<LiveRegion visible>Saving…</LiveRegion>)
    await flush()
    const el = container.querySelector('div')!
    const cs = getComputedStyle(el)
    expect(cs.position).not.toBe('absolute')
    expect(el.textContent).toBe('Saving…')
    unmount()
  })

  it('reactive content change updates the live region in place', async () => {
    const status = signal('idle')
    const { container, unmount } = mountInBrowser(<LiveRegion>{() => status()}</LiveRegion>)
    await flush()
    const el = container.querySelector('div')!
    expect(el.textContent).toBe('idle')
    status.set('3 results')
    await flush()
    expect(el.textContent).toBe('3 results')
    // same element instance — patched in place, not remounted
    expect(container.querySelector('div')).toBe(el)
    unmount()
  })
})

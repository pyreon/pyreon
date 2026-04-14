import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Real-Chromium smoke for the #233 style-key-removal fix. happy-dom can
// pass because its CSSStyleDeclaration stub is forgiving — this suite
// asserts the fix holds up against a real engine's styles bag.

describe('reactive style — stale keys removed (real browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('drops a key that disappears from a reactive style object', async () => {
    const style = signal<Record<string, string>>({ color: 'rgb(255, 0, 0)', fontSize: '14px' })
    const { container, unmount } = mountInBrowser(
      h('div', { id: 's1', style: () => style() }, 'x'),
    )

    const el = container.querySelector<HTMLDivElement>('#s1')!
    expect(el.style.color).toBe('rgb(255, 0, 0)')
    expect(el.style.fontSize).toBe('14px')

    style.set({ color: 'rgb(255, 0, 0)' })
    await flush()

    expect(el.style.color).toBe('rgb(255, 0, 0)')
    // Chromium reports the removed longhand as an empty string on the
    // inline style. This is exactly what #233 intended and what happy-dom
    // only started reporting after the fix landed.
    expect(el.style.fontSize).toBe('')
    unmount()
  })

  it('clears every tracked key when style becomes null', async () => {
    const style = signal<Record<string, string> | null>({
      color: 'rgb(0, 0, 255)',
      padding: '10px',
    })
    const { container, unmount } = mountInBrowser(
      h('div', { id: 's2', style: () => style() }, 'x'),
    )
    const el = container.querySelector<HTMLDivElement>('#s2')!
    expect(el.style.color).toBe('rgb(0, 0, 255)')

    style.set(null)
    await flush()

    expect(el.style.color).toBe('')
    expect(el.style.padding).toBe('')
    unmount()
  })
})

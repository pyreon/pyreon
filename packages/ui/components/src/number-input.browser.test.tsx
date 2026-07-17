import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { NumberInput } from './index'

/**
 * NumberInput used to be a lie: its `.attrs({ tag:'input' })` omitted
 * `type:'number'`, so the `min`/`max`/`step` it went to the trouble of
 * DECLARING reached a TEXT input where the browser silently ignores them —
 * no stepping, no clamping, no keyboard, no ARIA. It now delegates to
 * NumberInputBase. These lock the WIRING (the primitive's own behaviour is
 * covered by numberinputbase-a11y.browser.test.tsx); per the #2372 lesson,
 * "delegates" != "works", so the class must land too.
 */
describe('NumberInput delegates to NumberInputBase', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  const render = (props: Record<string, unknown> = {}) => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(NumberInput as never, { min: 0, max: 10, step: 1, defaultValue: 5, ...props })),
    )
    cleanup = unmount
    return container.querySelector('[role="spinbutton"]') as HTMLInputElement
  }

  it('renders a real spinbutton with value ARIA (was an inert text input)', () => {
    const input = render()
    expect(input).toBeTruthy()
    expect(input.getAttribute('aria-valuenow')).toBe('5')
    expect(input.getAttribute('aria-valuemin')).toBe('0')
    expect(input.getAttribute('aria-valuemax')).toBe('10')
  })

  it('ArrowUp steps the value AND updates aria-valuenow (the transition)', () => {
    const input = render()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(input.getAttribute('aria-valuenow')).toBe('6')
  })

  it('clamps at max — min/max are no longer inert', () => {
    const input = render({ defaultValue: 10 })
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(input.getAttribute('aria-valuenow')).toBe('10')
  })

  it('reports through onChange (controlled-friendly)', () => {
    const seen = signal(-1)
    const input = render({ onChange: (v: number) => seen.set(v) })
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(seen()).toBe(4)
  })

  it('applies its rocketstyle class to the input ("delegates" != "works")', () => {
    const input = render()
    expect(input.getAttribute('data-rocketstyle')).toBe('NumberInput')
    expect(input.className).toBeTruthy()
  })
})

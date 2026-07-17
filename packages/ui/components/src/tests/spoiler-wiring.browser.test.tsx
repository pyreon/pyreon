import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import type { SpoilerState } from '@pyreon/ui-primitives'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import Spoiler, { SpoilerToggle } from '../components/Spoiler'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__

/**
 * Spoiler was a styled <div> with `overflow: hidden` and nothing else — it
 * clipped content and offered no way to reveal it. These specs lock the wiring
 * to `SpoilerBase`: the rocketstyle class must LAND on the primitive's root
 * (#2372 — "delegates" != "works"), and the delegated behaviour must be
 * reachable THROUGH the public component.
 */
function mountSpoiler(props: Record<string, unknown> = {}) {
  let st: SpoilerState | undefined
  const { container } = mountInBrowser(
    h(PyreonUI, { theme }, h(Spoiler as never, {
      maxHeight: 100,
      ...props,
      children: (s: SpoilerState) => {
        st = s
        return h('div', s.rootProps(), [
          h('div', s.clipProps(), h('div', { ...s.contentProps(), style: 'height: 400px;' }, 'content')),
          h(SpoilerToggle as never, s.toggleProps(), 'Show more'),
        ])
      },
    })),
  )
  return {
    container,
    state: () => st!,
    root: () => container.querySelector('[data-spoiler]') as HTMLElement,
    clip: () => container.querySelector('[data-spoiler] > div') as HTMLElement,
    toggle: () => container.querySelector('button') as HTMLButtonElement,
  }
}

describe('Spoiler — wired to SpoilerBase', () => {
  it('lands its rocketstyle class on the delegated root element', () => {
    const { root } = mountSpoiler()
    expect(root()).toBeTruthy()
    // The #2372 failure: the chain computes a class that reaches no element.
    expect(root().getAttribute('data-rocketstyle')).toBe('Spoiler')
    expect(root().className.trim()).not.toBe('')
  })

  it('styles the toggle', () => {
    const { toggle } = mountSpoiler()
    expect(toggle().getAttribute('data-rocketstyle')).toBe('SpoilerToggle')
    expect(toggle().className.trim()).not.toBe('')
  })

  it('delegates the toggle THROUGH the component (a state transition)', () => {
    const { toggle, state } = mountSpoiler()
    expect(state().expanded()).toBe(false)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    toggle().click()
    expect(state().expanded()).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
  })

  it.runIf(isBrowser)('does NOT clip the toggle away (the root must not be overflow:hidden)', () => {
    const { root, toggle } = mountSpoiler()
    // The theme used to carry `overflow: hidden`, which would clip the control
    // out of view along with the content — the clip belongs on clipProps.
    expect(getComputedStyle(root()).overflow).not.toBe('hidden')
    expect(toggle().getBoundingClientRect().height).toBeGreaterThan(0)
  })

  it.runIf(isBrowser)('clips the CONTENT to maxHeight', async () => {
    const { clip } = mountSpoiler()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
    expect(clip().style.maxHeight).toBe('100px')
    expect(getComputedStyle(clip()).overflow).toBe('hidden')
  })
})

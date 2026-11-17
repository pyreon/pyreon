// A two-element responsive array in a primitive's `style` — `padding: [8, 24]`
// — resolves per size class on the web exactly as the native lowerings do
// (`style-to-native.ts`): compact below 600 px, regular at 600 px and above,
// and it follows the window across the boundary. Before this, the web wrote
// the array into the DOM as the invalid CSS `8,24` and the browser dropped it,
// so the same source rendered with no padding on the web and 8/24 on devices.

import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Stack } from '../web/Stack'
import { _resetRegularWidth } from '../web/passthrough'

/** A controllable `(min-width: 600px)` query. */
function fakeWindowWidth(wide: boolean) {
  const listeners: ((e: { matches: boolean }) => void)[] = []
  const mq = {
    matches: wide,
    media: '(min-width: 600px)',
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: () => {},
  }
  const spy = vi.spyOn(window, 'matchMedia').mockImplementation(() => mq as unknown as MediaQueryList)

  return {
    spy,
    listeners,
    resize(next: boolean) {
      mq.matches = next
      for (const fn of listeners) fn({ matches: next })
    },
  }
}

function render(style: Record<string, unknown>): { el: HTMLElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const dispose = mount(h(Stack, { style: style as never }, 'x'), container)

  return {
    el: container.firstElementChild as HTMLElement,
    unmount: () => {
      dispose()
      container.remove()
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRegularWidth()
})

describe('responsive style pairs on the web', () => {
  it('a compact window takes the first entry', () => {
    fakeWindowWidth(false)
    const { el, unmount } = render({ padding: [8, 24] })
    expect(el.style.padding).toBe('8px')
    unmount()
  })

  it('a regular window takes the second entry', () => {
    fakeWindowWidth(true)
    const { el, unmount } = render({ padding: [8, 24], color: 'red' })
    expect(el.style.padding).toBe('24px')
    // A plain value beside the pair is untouched.
    expect(el.style.color).toBe('red')
    unmount()
  })

  it('follows the window across the 600px boundary with one shared listener', () => {
    const width = fakeWindowWidth(false)
    const a = render({ padding: [8, 24] })
    const b = render({ paddingTop: ['4px', '12px'] })
    expect(a.el.style.padding).toBe('8px')
    expect(b.el.style.paddingTop).toBe('4px')
    width.resize(true)
    expect(a.el.style.padding).toBe('24px')
    expect(b.el.style.paddingTop).toBe('12px')
    width.resize(false)
    expect(a.el.style.padding).toBe('8px')
    // Two elements, one media-query listener.
    expect(width.listeners).toHaveLength(1)
    a.unmount()
    b.unmount()
  })

  it('a longer array is dropped with a [Pyreon] warning, as on the native targets', () => {
    fakeWindowWidth(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { el, unmount } = render({ padding: [4, 8, 16] })
    expect(el.style.padding).toBe('')
    expect(warn.mock.calls.some(([m]) => String(m).startsWith('[Pyreon] style.padding is a 3-element responsive array'))).toBe(true)
    unmount()
  })

  it('a style without a pair stays a static object (no media query read)', () => {
    const width = fakeWindowWidth(true)
    const { el, unmount } = render({ padding: '10px' })
    expect(el.style.padding).toBe('10px')
    expect(width.spy).not.toHaveBeenCalled()
    unmount()
  })
})

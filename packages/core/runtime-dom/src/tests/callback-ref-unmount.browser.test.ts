import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Real-Chromium smoke for the #233 callback-ref null-on-unmount fix.
// happy-dom's element lifecycle isn't a fully faithful mirror of the
// browser's — this suite checks the invocation sequence against a real
// Chromium DOM removal path.

describe('callback ref null on unmount (real browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('invokes the callback with the element then null when unmounted', () => {
    const calls: Array<Element | null> = []
    const cb = (el: Element | null) => {
      calls.push(el)
    }

    const { unmount } = mountInBrowser(h('div', { id: 'r1', ref: cb }, 'x'))

    expect(calls.length).toBe(1)
    expect(calls[0]?.id).toBe('r1')

    unmount()

    expect(calls.length).toBe(2)
    expect(calls[1]).toBe(null)
  })

  it('invokes nested callback refs with null in child-then-parent order', () => {
    const outer: Array<Element | null> = []
    const inner: Array<Element | null> = []

    const { unmount } = mountInBrowser(
      h(
        'section',
        {
          id: 'ro',
          ref: (el: Element | null) => {
            outer.push(el)
          },
        },
        h('div', {
          id: 'ri',
          ref: (el: Element | null) => {
            inner.push(el)
          },
        }),
      ),
    )

    expect(outer[0]?.id).toBe('ro')
    expect(inner[0]?.id).toBe('ri')

    unmount()

    expect(outer.at(-1)).toBe(null)
    expect(inner.at(-1)).toBe(null)
  })
})

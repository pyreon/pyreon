// Regression locks for the 2026-09 @pyreon/virtual hardening pass. Each spec
// was written against the broken code first and bisect-verified (see the PR).
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVirtualizer, useWindowVirtualizer } from '../index'

afterEach(() => vi.restoreAllMocks())

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Wrapper = () => {
    result = fn()
    return null
  }
  const unmount = mount(<Wrapper />, el)
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

describe('a null scroll element', () => {
  it('warns in dev when getScrollElement() is still null after mount (zero rows, silently)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { unmount } = mountWith(() =>
      useVirtualizer(() => ({ count: 100, getScrollElement: () => null, estimateSize: () => 20 })),
    )
    expect(warn.mock.calls.some((c) => String(c[0]).includes('getScrollElement'))).toBe(true)
    unmount()
  })

  it('does not warn when the scroll element exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('div')
    const { unmount } = mountWith(() =>
      useVirtualizer(() => ({ count: 100, getScrollElement: () => el, estimateSize: () => 20 })),
    )
    expect(warn.mock.calls.some((c) => String(c[0]).includes('getScrollElement'))).toBe(false)
    unmount()
  })
})

describe('options', () => {
  for (const [name, use] of [
    ['useVirtualizer', useVirtualizer],
    ['useWindowVirtualizer', useWindowVirtualizer],
  ] as const) {
    it(`${name}: options() is read ONCE at setup, not three times`, () => {
      const el = document.createElement('div')
      const options = vi.fn(() => ({ count: 10, getScrollElement: () => el, estimateSize: () => 20 }))
      const { unmount } = mountWith(() => (use as typeof useVirtualizer)(options))
      expect(options).toHaveBeenCalledTimes(1)
      unmount()
    })

    it(`${name}: a key the options stop returning is dropped, not kept from the previous pass`, () => {
      const el = document.createElement('div')
      const keyed = signal(true)
      const getItemKey = (i: number) => `k${i}`
      const { result, unmount } = mountWith(() =>
        (use as typeof useVirtualizer)(() => ({
          count: 10,
          getScrollElement: () => el,
          estimateSize: () => 20,
          ...(keyed() ? { getItemKey } : {}),
        })),
      )
      expect(result.instance.options.getItemKey).toBe(getItemKey)
      keyed.set(false)
      expect(result.instance.options.getItemKey).not.toBe(getItemKey)
      expect(result.instance.options.getItemKey(3)).toBe(3) // TanStack's default
      unmount()
    })
  }
})

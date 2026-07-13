import { beforeEach, describe, expect, it, vi } from 'vitest'

let mountCallbacks: Array<() => unknown> = []
let unmountCallbacks: Array<() => void> = []

vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(fn)
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn)
  },
}))

import { useSizeClass } from '../useSizeClass'

const QUERY = '(min-width: 600px)'

describe('useSizeClass', () => {
  let changeListeners: Map<string, (e: MediaQueryListEvent) => void>

  const installMatchMedia = (matches: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches,
        media: query,
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') changeListeners.set(query, cb)
        }),
        removeEventListener: vi.fn(),
      })),
    })
  }

  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    changeListeners = new Map()
    installMatchMedia(false)
  })

  it('returns compact by default (narrow viewport)', () => {
    const sizeClass = useSizeClass()
    mountCallbacks.forEach((cb) => {
      cb()
    })
    expect(sizeClass()).toBe('compact')
  })

  it('returns regular when the width query matches (>= 600px)', () => {
    installMatchMedia(true)
    const sizeClass = useSizeClass()
    mountCallbacks.forEach((cb) => {
      cb()
    })
    expect(sizeClass()).toBe('regular')
  })

  it('updates compact -> regular when the viewport widens', () => {
    const sizeClass = useSizeClass()
    mountCallbacks.forEach((cb) => {
      cb()
    })
    expect(sizeClass()).toBe('compact')

    const listener = changeListeners.get(QUERY)
    listener?.({ matches: true } as MediaQueryListEvent)
    expect(sizeClass()).toBe('regular')
  })

  it('updates regular -> compact when the viewport narrows', () => {
    installMatchMedia(true)
    const sizeClass = useSizeClass()
    mountCallbacks.forEach((cb) => {
      cb()
    })
    expect(sizeClass()).toBe('regular')

    const listener = changeListeners.get(QUERY)
    listener?.({ matches: false } as MediaQueryListEvent)
    expect(sizeClass()).toBe('compact')
  })
})

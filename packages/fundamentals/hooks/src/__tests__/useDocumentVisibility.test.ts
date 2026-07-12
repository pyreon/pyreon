import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mountCallbacks: Array<() => unknown> = []
let unmountCallbacks: Array<() => void> = []

vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(() => {
      const ret = fn()
      if (typeof ret === 'function') unmountCallbacks.push(ret as () => void)
    })
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn)
  },
}))

import { useDocumentVisibility } from '../useDocumentVisibility'

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

describe('useDocumentVisibility', () => {
  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    setVisibility('visible')
  })

  afterEach(() => {
    setVisibility('visible')
  })

  it('reports the initial visibility state', () => {
    setVisibility('hidden')
    const visibility = useDocumentVisibility()
    expect(visibility()).toBe('hidden')
  })

  it('updates when visibilitychange fires', () => {
    const visibility = useDocumentVisibility()
    mountCallbacks.forEach((cb) => cb())

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(visibility()).toBe('hidden')

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(visibility()).toBe('visible')
  })

  it('removes the listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    useDocumentVisibility()
    mountCallbacks.forEach((cb) => cb())
    unmountCallbacks.forEach((cb) => cb())
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    removeSpy.mockRestore()
  })
})

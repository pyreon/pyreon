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

import { useWindowScroll } from '../useWindowScroll'

const setScroll = (x: number, y: number) => {
  Object.defineProperty(window, 'scrollX', { configurable: true, value: x })
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
}

describe('useWindowScroll', () => {
  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    setScroll(0, 0)
  })

  afterEach(() => {
    setScroll(0, 0)
  })

  it('reports the initial scroll offset', () => {
    setScroll(12, 34)
    const { position } = useWindowScroll()
    expect(position()).toEqual({ x: 12, y: 34 })
  })

  it('updates on scroll (passive listener) after mount', () => {
    const { position } = useWindowScroll()
    mountCallbacks.forEach((cb) => cb())

    setScroll(100, 250)
    window.dispatchEvent(new Event('scroll'))
    expect(position()).toEqual({ x: 100, y: 250 })
  })

  it('registers a passive scroll listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    useWindowScroll()
    mountCallbacks.forEach((cb) => cb())
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    addSpy.mockRestore()
  })

  it('removes the scroll listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    useWindowScroll()
    mountCallbacks.forEach((cb) => cb())
    unmountCallbacks.forEach((cb) => cb())
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('scrollTo forwards to window.scrollTo, defaulting omitted axes', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    setScroll(5, 7)
    const { scrollTo } = useWindowScroll()

    scrollTo({ y: 0, behavior: 'smooth' })
    expect(scrollToSpy).toHaveBeenCalledWith({ left: 5, top: 0, behavior: 'smooth' })

    scrollTo({ x: 40 })
    expect(scrollToSpy).toHaveBeenCalledWith({ left: 40, top: 7 })
    scrollToSpy.mockRestore()
  })
})

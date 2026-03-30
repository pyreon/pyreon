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

import { useIntersection } from '../useIntersection'

describe('useIntersection', () => {
  let intersectionCallback: ((entries: IntersectionObserverEntry[]) => void) | undefined
  let observeSpy: ReturnType<typeof vi.fn>
  let disconnectSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    intersectionCallback = undefined
    observeSpy = vi.fn()
    disconnectSpy = vi.fn()

    globalThis.IntersectionObserver = vi.fn(function (
      this: unknown,
      cb: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      intersectionCallback = cb as (entries: IntersectionObserverEntry[]) => void
      return {
        observe: observeSpy,
        unobserve: vi.fn(),
        disconnect: disconnectSpy,
        root: options?.root ?? null,
        rootMargin: options?.rootMargin ?? '0px',
        thresholds: Array.isArray(options?.threshold)
          ? options.threshold
          : [options?.threshold ?? 0],
        takeRecords: vi.fn(() => []),
      }
    }) as unknown as typeof IntersectionObserver
  })

  it('returns null initially', () => {
    const entry = useIntersection(() => null)
    expect(entry()).toBeNull()
  })

  it('observes the element on mount', () => {
    const el = document.createElement('div')
    useIntersection(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    expect(observeSpy).toHaveBeenCalledWith(el)
  })

  it('does not observe when element is null', () => {
    useIntersection(() => null)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    expect(observeSpy).not.toHaveBeenCalled()
  })

  it('updates entry when intersection changes', () => {
    const el = document.createElement('div')
    const entrySignal = useIntersection(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const mockEntry = {
      isIntersecting: true,
      intersectionRatio: 0.5,
      target: el,
      boundingClientRect: el.getBoundingClientRect(),
      intersectionRect: el.getBoundingClientRect(),
      rootBounds: null,
      time: Date.now(),
    } as unknown as IntersectionObserverEntry

    intersectionCallback?.([mockEntry])
    expect(entrySignal()).toBe(mockEntry)
    expect(entrySignal()?.isIntersecting).toBe(true)
  })

  it('passes options to IntersectionObserver', () => {
    const el = document.createElement('div')
    const options = { threshold: 0.5, rootMargin: '10px' }
    useIntersection(() => el, options)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    expect(IntersectionObserver).toHaveBeenCalledWith(expect.any(Function), options)
  })

  it('disconnects observer on unmount', () => {
    const el = document.createElement('div')
    useIntersection(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })
    unmountCallbacks.forEach((cb) => {
      cb()
    })

    expect(disconnectSpy).toHaveBeenCalled()
  })

  it('does not crash when callback has empty entries', () => {
    const el = document.createElement('div')
    const entrySignal = useIntersection(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    // Empty entries - e is undefined, so entry.set should not be called
    intersectionCallback?.([])
    expect(entrySignal()).toBeNull()
  })

  it('updates to latest entry on subsequent intersections', () => {
    const el = document.createElement('div')
    const entrySignal = useIntersection(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const entry1 = {
      isIntersecting: true,
      intersectionRatio: 0.3,
    } as unknown as IntersectionObserverEntry

    const entry2 = {
      isIntersecting: false,
      intersectionRatio: 0,
    } as unknown as IntersectionObserverEntry

    intersectionCallback?.([entry1])
    expect(entrySignal()).toBe(entry1)

    intersectionCallback?.([entry2])
    expect(entrySignal()).toBe(entry2)
  })
})

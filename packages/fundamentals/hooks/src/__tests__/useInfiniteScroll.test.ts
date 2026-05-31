import { describe, expect, it, vi } from 'vitest'
import { useInfiniteScroll } from '../useInfiniteScroll'

describe('useInfiniteScroll', () => {
  it('returns ref and triggered signal', () => {
    const { ref, triggered } = useInfiniteScroll(vi.fn())
    expect(typeof ref).toBe('function')
    expect(triggered()).toBe(false)
  })

  it('creates sentinel element when ref is called with element', () => {
    const { ref } = useInfiniteScroll(vi.fn())
    const container = document.createElement('div')
    ref(container)

    // Sentinel should be appended to container
    expect(container.children.length).toBe(1)
    const sentinel = container.children[0]!
    expect(sentinel.getAttribute('aria-hidden')).toBe('true')
  })

  it('removes sentinel when ref is called with null', () => {
    const { ref } = useInfiniteScroll(vi.fn())
    const container = document.createElement('div')
    ref(container)
    expect(container.children.length).toBe(1)

    ref(null)
    // Sentinel should be removed
    expect(container.children.length).toBe(0)
  })

  it('inserts sentinel at top when direction is up', () => {
    const { ref } = useInfiniteScroll(vi.fn(), { direction: 'up' })
    const container = document.createElement('div')
    const existing = document.createElement('div')
    existing.textContent = 'content'
    container.appendChild(existing)

    ref(container)
    // Sentinel should be first child
    expect(container.children[0]!.getAttribute('aria-hidden')).toBe('true')
    expect(container.children[1]).toBe(existing)
  })

  it('cleans up on re-ref', () => {
    const { ref } = useInfiniteScroll(vi.fn())
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    ref(container1)
    expect(container1.children.length).toBe(1)

    ref(container2)
    expect(container2.children.length).toBe(1)
  })

  it('handleIntersect fires onLoadMore + updates triggered when sentinel intersects', () => {
    let captured: ((entries: IntersectionObserverEntry[]) => void) | null = null
    const RealIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class MockIO {
      constructor(cb: (entries: IntersectionObserverEntry[]) => void) {
        captured = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver

    try {
      const onLoadMore = vi.fn()
      const { ref, triggered } = useInfiniteScroll(onLoadMore)
      ref(document.createElement('div'))
      expect(captured).not.toBeNull()

      captured!([{ isIntersecting: true } as IntersectionObserverEntry])
      expect(triggered()).toBe(true)
      expect(onLoadMore).toHaveBeenCalledTimes(1)

      captured!([{ isIntersecting: false } as IntersectionObserverEntry])
      expect(triggered()).toBe(false)
      expect(onLoadMore).toHaveBeenCalledTimes(1)

      // Empty entries → early return.
      captured!([])
      expect(onLoadMore).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.IntersectionObserver = RealIO
    }
  })

  it('skips onLoadMore when loading() is true or hasMore() is false', () => {
    let captured: ((entries: IntersectionObserverEntry[]) => void) | null = null
    const RealIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class MockIO {
      constructor(cb: (entries: IntersectionObserverEntry[]) => void) {
        captured = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver

    try {
      const onLoadMore = vi.fn()
      const { ref } = useInfiniteScroll(onLoadMore, { loading: () => true })
      ref(document.createElement('div'))
      captured!([{ isIntersecting: true } as IntersectionObserverEntry])
      expect(onLoadMore).not.toHaveBeenCalled()

      const onLoadMore2 = vi.fn()
      const { ref: ref2 } = useInfiniteScroll(onLoadMore2, { hasMore: () => false })
      ref2(document.createElement('div'))
      captured!([{ isIntersecting: true } as IntersectionObserverEntry])
      expect(onLoadMore2).not.toHaveBeenCalled()
    } finally {
      globalThis.IntersectionObserver = RealIO
    }
  })
})

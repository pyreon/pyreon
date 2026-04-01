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
})

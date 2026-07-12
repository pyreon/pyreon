// @vitest-environment node
/**
 * Server-arm coverage for hooks whose `isClient ? … : …` ternaries and
 * `if (isServer) return` guards only take their SSR branch when `document`
 * is absent at module load. happy-dom always supplies a DOM, so these arms
 * go uncovered there — this true-node env (no `document` at import) is the
 * real SSR shape, matching the sibling `ssr-branches.node.test.ts`.
 */
import { isClient, isServer } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { useDocumentVisibility } from '../useDocumentVisibility'
import { useFetch } from '../useFetch'
import { useIdle } from '../useIdle'
import { useInfiniteScroll } from '../useInfiniteScroll'
import useIsomorphicLayoutEffect from '../useIsomorphicLayoutEffect'
import { useWindowResize } from '../useWindowResize'
import { useWindowScroll } from '../useWindowScroll'

describe('SSR sanity — node env has no DOM at load', () => {
  it('isServer is true / isClient is false / no IntersectionObserver', () => {
    expect(isServer).toBe(true)
    expect(isClient).toBe(false)
    expect(typeof IntersectionObserver).toBe('undefined')
  })
})

describe('useWindowResize — SSR size fallback (isClient false arm)', () => {
  it('initializes width/height to 0 without touching window', () => {
    const size = useWindowResize()
    expect(size()).toEqual({ width: 0, height: 0 })
  })
})

describe('useIsomorphicLayoutEffect — module-load isClient false arm', () => {
  it('still resolves to a usable primitive (onMount) on the server', () => {
    expect(typeof useIsomorphicLayoutEffect).toBe('function')
  })
})

describe('useFetch — SSR early return (!isClient)', () => {
  it('does not invoke fetch during setup on the server', () => {
    const calls: string[] = []
    const realFetch = globalThis.fetch
    // Any fetch call would push; the !isClient guard must skip it entirely.
    globalThis.fetch = (() => {
      calls.push('called')
      return Promise.reject(new Error('should not be called'))
    }) as typeof fetch
    try {
      const r = useFetch<unknown>('/api/x')
      expect(calls).toEqual([])
      expect(r.isPending()).toBe(false)
      expect(r.data()).toBeUndefined()
      // refetch is also a no-op on the server
      r.refetch()
      expect(calls).toEqual([])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('useWindowScroll — SSR fallback (isClient false arm)', () => {
  it('initializes position to 0/0 without touching window', () => {
    const { position } = useWindowScroll()
    expect(position()).toEqual({ x: 0, y: 0 })
  })

  it('scrollTo is a no-op on the server (isClient guard)', () => {
    const { scrollTo } = useWindowScroll()
    expect(() => scrollTo({ x: 10, y: 10 })).not.toThrow()
  })
})

describe('useDocumentVisibility — SSR fallback (isClient false arm)', () => {
  it('returns "visible" without touching document', () => {
    const visibility = useDocumentVisibility()
    expect(visibility()).toBe('visible')
  })
})

describe('useIdle — SSR (listeners register in onMount, never on server)', () => {
  it('holds its initial state without touching document', () => {
    expect(useIdle(1000)()).toBe(false)
    expect(useIdle(1000, { initialState: true })()).toBe(true)
  })
})

describe('useInfiniteScroll — SSR/no-IntersectionObserver guard', () => {
  it('ref(el) returns early without creating a sentinel or observer', () => {
    const { ref, triggered } = useInfiniteScroll(() => {})
    // A truthy element reaches setup(), which hits the
    // `isServer || typeof IntersectionObserver === 'undefined'` return.
    // The element is never appended to (no document in node anyway), so a
    // bare object proves the guard fired before any DOM access.
    const fakeEl = {
      appendChild() {
        throw new Error('should not append — guard must return first')
      },
      insertBefore() {
        throw new Error('should not insertBefore — guard must return first')
      },
    } as unknown as HTMLElement
    expect(() => ref(fakeEl)).not.toThrow()
    expect(triggered()).toBe(false)
  })
})

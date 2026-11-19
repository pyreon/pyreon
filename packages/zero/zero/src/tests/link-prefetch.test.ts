/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveRouter } from '@pyreon/router'

// The route's JS chunk is warmed through the router's REAL lazy loader
// (`router.preloadComponents(path)`) — the Vite-resolved
// `import()` inside the matched route record — NOT a `<link rel="modulepreload">`
// whose href is the route path (an SSR HTML URL → strict-MIME "Failed to load
// module script" on every hovered link). Drive it through the active router.

const preloadComponents = vi.fn<(...args: unknown[]) => Promise<boolean>>().mockResolvedValue(true)
const fakeRouter = { preloadComponents } as unknown as Parameters<typeof setActiveRouter>[0]

describe('prefetchRoute — warms the chunk via router.preloadComponents, never modulepreload', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    preloadComponents.mockClear().mockResolvedValue(true)
    setActiveRouter(fakeRouter)
  })
  afterEach(() => {
    document.head.innerHTML = ''
    setActiveRouter(null)
  })

  it('calls router.preloadComponents(path) — code only, no loaders', async () => {
    const { prefetchRoute } = await import('../link')
    prefetchRoute('/threats/detections')
    expect(preloadComponents).toHaveBeenCalledTimes(1)
    expect(preloadComponents).toHaveBeenCalledWith('/threats/detections')
  })

  it('injects the document prefetch but NO modulepreload link', async () => {
    const { prefetchRoute } = await import('../link')
    prefetchRoute('/reports')
    expect(
      document.head.querySelector('link[rel="prefetch"][href="/reports"][as="document"]'),
    ).toBeTruthy()
    expect(document.head.querySelectorAll('link[rel="modulepreload"]').length).toBe(0)
  })

  it('deduplicates — a repeated href does not re-preload', async () => {
    const { prefetchRoute } = await import('../link')
    prefetchRoute('/dedup')
    prefetchRoute('/dedup')
    expect(preloadComponents).toHaveBeenCalledTimes(1)
  })

  it('swallows a rejected preload (best-effort — never surfaces to the user)', async () => {
    preloadComponents.mockRejectedValueOnce(new Error('chunk import failed'))
    const { prefetchRoute } = await import('../link')
    expect(() => prefetchRoute('/flaky')).not.toThrow()
    await Promise.resolve()
  })

  it('no active router → document prefetch only, no throw (null-router guard)', async () => {
    // Regression for the `?.catch` fix: with no router, `router?.preloadComponents(...)`
    // short-circuits to undefined; a bare `.catch` on it would throw. The
    // standalone helper must degrade to the document hint without erroring.
    setActiveRouter(null)
    const { prefetchRoute } = await import('../link')
    expect(() => prefetchRoute('/no-router')).not.toThrow()
    expect(
      document.head.querySelector('link[rel="prefetch"][href="/no-router"][as="document"]'),
    ).toBeTruthy()
    expect(preloadComponents).not.toHaveBeenCalled()
  })
})

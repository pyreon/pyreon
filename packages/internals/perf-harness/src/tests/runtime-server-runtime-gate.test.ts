/**
 * Runtime gate test for @pyreon/runtime-server counters.
 *
 * Why this exists: the treeshake test proves browser-package counters
 * fold to dead code via `import.meta.env.DEV = false`. That strategy
 * doesn't apply to runtime-server — it's a server package guarded on
 * `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`.
 * The `typeof process` half is a runtime check that esbuild can't fold to
 * a constant, so the counter strings stay in the bundle.
 *
 * For server code the contract is RUNTIME GATING: when
 * `NODE_ENV=production`, the `__DEV__` const evaluates to `false` and
 * the counter call is short-circuited at execution time. Zero runtime
 * cost, but the string literal remains in the bundle (few bytes).
 *
 * This test verifies the runtime contract: mutate NODE_ENV and assert
 * the counter is called when in dev, not called when in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'

describe('runtime-server counters — runtime gate contract', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    // Reset the counter sink
    delete (globalThis as { __pyreon_count__?: unknown }).__pyreon_count__
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    delete (globalThis as { __pyreon_count__?: unknown }).__pyreon_count__
    vi.resetModules()
  })

  it('fires counter when NODE_ENV is not production', async () => {
    process.env.NODE_ENV = 'development'
    const sink = vi.fn()
    ;(globalThis as { __pyreon_count__?: typeof sink }).__pyreon_count__ = sink

    // Fresh module reload so __DEV__ is evaluated with the new NODE_ENV
    vi.resetModules()
    const { renderToString } = await import('@pyreon/runtime-server')

    await renderToString(h('div', null, 'hello'))

    const names = sink.mock.calls.map((c) => c[0] as string)
    expect(names).toContain('runtime-server.render')
  })

  it('does NOT fire counter when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production'
    const sink = vi.fn()
    ;(globalThis as { __pyreon_count__?: typeof sink }).__pyreon_count__ = sink

    // Fresh module reload so __DEV__ is evaluated with the new NODE_ENV
    vi.resetModules()
    const { renderToString } = await import('@pyreon/runtime-server')

    await renderToString(h('div', null, 'hello'))

    const names = sink.mock.calls.map((c) => c[0] as string)
    // None of the runtime-server.* counters should have fired
    expect(names.filter((n) => n.startsWith('runtime-server.'))).toEqual([])
  })
})

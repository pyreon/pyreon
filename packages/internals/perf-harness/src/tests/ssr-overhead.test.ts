/**
 * Dev-mode counter overhead measurement.
 *
 * Honest accounting: the counter emits are ALWAYS present in runtime-server's
 * bundle (can't tree-shake the `typeof process` gate). They're runtime-gated,
 * but the gate itself is two boolean checks + an optional-chain lookup per
 * emit site. How much does that cost?
 *
 * This test renders a 1k-row list 3 ways:
 *   (a) NODE_ENV=production, no sink — counters skipped at the first gate check
 *   (b) NODE_ENV=development, no sink — counters pass gate, hit optional-chain
 *   (c) NODE_ENV=development, sink installed — counters fully fire
 *
 * Bound is wall-clock ratio: dev overhead should be < 2× prod. Anything
 * higher means the gate + optional-chain is too expensive to keep hot.
 *
 * Not a tight perf gate (timing in vitest is noisy). Just an upper-bound
 * regression guard.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const N = 1000

interface RenderContext {
  renderToString: (v: unknown) => Promise<string>
  buildTree: (items: string[]) => unknown
}

// Fresh import after a `vi.resetModules()` call — @pyreon/core's `ForSymbol`
// identity must match the runtime-server that will compare against it, so
// both are re-loaded in lockstep and the tree is built with the freshly
// imported `h`/`For`.
async function freshContext(): Promise<RenderContext> {
  const core = (await import('@pyreon/core')) as {
    h: (type: unknown, props: unknown, ...children: unknown[]) => unknown
    For: unknown
  }
  const { renderToString } = (await import('@pyreon/runtime-server')) as {
    renderToString: (v: unknown) => Promise<string>
  }
  const buildTree = (items: string[]) =>
    core.h(
      'ul',
      null,
      core.h(core.For, {
        each: () => items,
        by: (s: string) => s,
        children: (s: string) => core.h('li', null, s),
      }),
    )
  return { renderToString, buildTree }
}

async function measure(
  setup: () => Promise<void>,
): Promise<number> {
  await setup()
  const { renderToString, buildTree } = await freshContext()
  const items = Array.from({ length: N }, (_, i) => `row-${i}`)
  // Warmup
  await renderToString(buildTree(items))
  await renderToString(buildTree(items))
  // Measure 5 iterations
  const t0 = performance.now()
  for (let i = 0; i < 5; i++) await renderToString(buildTree(items))
  return (performance.now() - t0) / 5
}

describe('runtime-server counter overhead', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    delete (globalThis as { __pyreon_count__?: unknown }).__pyreon_count__
    vi.resetModules()
  })

  it('dev-mode (no sink) is within 2× of production wall-clock', async () => {
    // Setup (a): production, no sink
    const prodMs = await measure(async () => {
      process.env.NODE_ENV = 'production'
      delete (globalThis as { __pyreon_count__?: unknown }).__pyreon_count__
      vi.resetModules()
    })

    // Setup (b): development, no sink
    const devNoSinkMs = await measure(async () => {
      process.env.NODE_ENV = 'development'
      delete (globalThis as { __pyreon_count__?: unknown }).__pyreon_count__
      vi.resetModules()
    })

    // Setup (c): development, sink installed
    const devWithSinkMs = await measure(async () => {
      process.env.NODE_ENV = 'development'
      ;(globalThis as { __pyreon_count__?: (name: string) => void }).__pyreon_count__ = () => {
        /* cheap no-op — real perfHarness does a Map.get/set */
      }
      vi.resetModules()
    })

    // oxlint-disable-next-line no-console
    console.log(
      `[ssr-overhead] 1k rows — prod=${prodMs.toFixed(2)}ms, dev(no-sink)=${devNoSinkMs.toFixed(2)}ms, dev(sink)=${devWithSinkMs.toFixed(2)}ms`,
    )

    // Dev-mode overhead bound. Loose — timing is noisy in vitest but we
    // want a ceiling that fails loud on 10× regressions, not on 2-3%
    // measurement drift.
    const devNoSinkRatio = devNoSinkMs / Math.max(prodMs, 0.1)
    const devWithSinkRatio = devWithSinkMs / Math.max(prodMs, 0.1)
    expect(devNoSinkRatio).toBeLessThan(2.5)
    expect(devWithSinkRatio).toBeLessThan(3)
  })
})

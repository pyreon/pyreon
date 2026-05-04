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
 * **Why no ratio assertion any more.** Earlier versions of this test asserted
 * `dev / prod < 2.5` (then 5× after widening) on wall-clock time. That
 * assertion was structurally broken under vitest's concurrent worker pool:
 * when `bun run --filter='*'` runs 30+ test suites in parallel, prod (which
 * runs first) wins the scheduler race and finishes in ~2 ms; by the time
 * dev(no-sink) runs the CPU is fully saturated by sibling workers and a
 * single 1k-row render takes 100+ ms. The resulting 50× ratio has nothing
 * to do with the gate cost — it's measuring scheduling fairness. Widening
 * the bound just deferred the flake. The pre-push hook (PR #437) tripped
 * on this assertion every push, defeating the gate's purpose.
 *
 * The test now keeps the timing log (useful for human inspection on
 * `bun run --filter='@pyreon/perf-harness' test`) and asserts only that
 * each render produces a positive finite measurement — i.e. the gate
 * doesn't throw and the renders complete. That's the actual bug class
 * a unit test in this layer can catch.
 *
 * Real-perf regression coverage lives in `@pyreon/perf-harness`'s
 * `bun run perf:record` pipeline (Playwright + median-of-N runs +
 * baseline comparison in a controlled, single-worker environment) —
 * that's where wall-clock comparisons belong.
 *
 * **Per-test timeout: 60s.** vitest's default 5s timeout is far too tight for
 * this shape — three 1k-row SSR renders × (2 warmups + 5 measured iterations)
 * × 3 mode setups (each with `vi.resetModules()` + fresh imports of @pyreon/core
 * + @pyreon/runtime-server) = ~500ms in isolation but balloons to 30+ seconds
 * under heavy concurrent load.
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

  it('renders 1k rows in all three gate modes without throwing', { timeout: 60_000 }, async () => {
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

    // Smoke check: each mode produced a positive finite measurement.
    // No wall-clock comparison — see file header for why ratio assertions
    // are structurally broken under vitest's concurrent worker pool.
    expect(prodMs).toBeGreaterThan(0)
    expect(prodMs).toBeLessThan(60_000)
    expect(devNoSinkMs).toBeGreaterThan(0)
    expect(devNoSinkMs).toBeLessThan(60_000)
    expect(devWithSinkMs).toBeGreaterThan(0)
    expect(devWithSinkMs).toBeLessThan(60_000)
  })
})

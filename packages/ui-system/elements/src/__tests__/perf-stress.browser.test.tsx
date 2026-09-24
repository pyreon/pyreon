/**
 * Wall-clock stress benchmark for the Element + Wrapper + Styled stack.
 *
 * Runs in real Chromium. Goal: surface a measurable wall-clock delta that
 * synthetic counter probes (happy-dom + mountChild) miss. Specifically
 * targets the path where Pyreon's 9ms benchmark numbers come from — the
 * mount-pipeline + styler-resolve composition.
 *
 * Each test mounts N components, disposes, and reports median wall-clock
 * across 5 measured iterations after warmup.
 *
 * WALL-CLOCK IS REPORTED, NEVER GATED. This file runs inside `Test (browser)`,
 * a REQUIRED check on a GitHub-hosted runner that this repo's CI is documented
 * to saturate (CLAUDE.md: queue-dominated under parallel-session load). A
 * duration threshold there is not a measurement — it is a coin flip that blocks
 * every open PR when it lands tails. It did: 2026-09-10, `500 bare Element`
 * read 343/260/241ms against a 200ms literal on three consecutive attempts of
 * the same commit, reddening main and three PRs inside forty minutes, while the
 * same assertion had passed 4 of its previous 5 runs on main. A REAL
 * regression fails deterministically; 4-of-5 is contention.
 *
 * The spread INSIDE a single attempt settles it. One failing CI attempt logged
 * `runs=[343.3, 289.2, 392.9, 502.8, 153.2]` — five measurements of identical
 * work on one machine in one job, low to high a factor of 3.3. The docstring
 * above once promised "variance <= 15%"; the observed figure is ~230%. No
 * threshold is meaningful against a sample that noisy, so the median it feeds
 * is not a measurement of Element at all.
 *
 * What IS gated is the property a stress test can honestly hold on any machine:
 * the workload ran to completion (5 samples), and disposal leaves ZERO nodes
 * under the bench root. Machine-independent, and a real dispose contract —
 * neutering the disposer loop fails all five specs with `expected 1 to be +0`.
 *
 * Be precise about its REACH, though, because `mount()` opens with
 * `container.innerHTML = ''` (runtime-dom/src/index.ts): each of the N mounts
 * in a run WIPES the previous one, so the root holds at most one subtree at a
 * time and `leaked` is 1-or-0, never N. It therefore proves the LAST mount was
 * disposed, not that no intermediate mount leaked. That is a narrower claim
 * than the loop's shape suggests — and worth knowing for its own sake: these
 * cases time N sequential mount+wipe cycles, NOT the build-up of an N-element
 * tree. Only the final case ('single one-shot mount of a 500-Element tree')
 * measures a genuinely large tree. Widening either property would change what
 * the benchmark measures, so it is deliberately left to the perf lane.
 *
 * Real timing work belongs in the advisory lane — `@pyreon/perf-harness`, the
 * `perf.yml` workflow, and the process-isolated / CI95 discipline in the
 * `pyreon-benchmarks` skill. The numbers below stay in the log for whoever is
 * investigating; they simply no longer decide whether anyone can merge.
 */
import { h, type VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import Element from '../Element/component'

interface Bench {
  median: number
  min: number
  max: number
  runs: number[]
  /** Nodes still under the bench root after every disposer ran. Must be 0. */
  leaked: number
}

async function benchmark(N: number, mountFn: (root: Element, i: number) => () => void): Promise<Bench> {
  const { container, unmount: cleanup } = mountInBrowser(h('div', { id: 'bench-root' }))
  const root = container.querySelector('#bench-root')!

  // Warmup — primes the styler sheet cache + GC any dead objects from prior runs.
  for (let w = 0; w < 50; w++) {
    const dispose = mountFn(root, w)
    dispose()
  }
  await flush()

  const runs: number[] = []
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now()
    const disposers: Array<() => void> = []
    for (let i = 0; i < N; i++) disposers.push(mountFn(root, i))
    for (const d of disposers) d()
    runs.push(performance.now() - t0)
    await flush()
  }

  // Read BEFORE cleanup(): cleanup() unmounts the whole container, which would
  // make this trivially 0 and assert nothing.
  const leaked = root.childNodes.length
  cleanup()

  const sorted = [...runs].sort((a, b) => a - b)
  const median = sorted[2] as number
  const min = sorted[0] as number
  const max = sorted[4] as number
  return { median, min, max, runs, leaked }
}

/**
 * The only assertions this file makes, for the reason given in the header:
 * the workload completed, and mount+dispose left the DOM clean.
 */
function expectCleanRun(bench: Bench): void {
  expect(bench.runs).toHaveLength(5)
  expect(bench.leaked).toBe(0)
}

describe('Element + stack stress benchmark', () => {
  it('500 bare Element mounts (mount + dispose, batched)', async () => {
    const bench = await benchmark(500, (root, i) => mount(h(Element, null, `item-${i}`), root))
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 500 bare Element: median=${bench.median.toFixed(2)}ms, runs=[${bench.runs.map((r) => r.toFixed(1)).join(', ')}]`,
    )
    expectCleanRun(bench)
  })

  it('500 Element with css prop (exercises extendCss path)', async () => {
    const bench = await benchmark(500, (root, i) =>
      mount(
        h(Element, { css: { color: 'red', padding: 8 } as unknown as Record<string, unknown> }, `item-${i}`),
        root,
      ),
    )
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 500 Element + css: median=${bench.median.toFixed(2)}ms, runs=[${bench.runs.map((r) => r.toFixed(1)).join(', ')}]`,
    )
    expectCleanRun(bench)
  })

  it('depth-10 Element nesting × 50 mounts', async () => {
    const buildDepth = (n: number, label: string): VNodeChild => {
      if (n === 0) return label
      return h(Element, null, buildDepth(n - 1, label))
    }
    const bench = await benchmark(50, (root, i) =>
      mount(buildDepth(10, `leaf-${i}`) as unknown as Parameters<typeof mount>[0], root),
    )
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 50 depth-10: median=${bench.median.toFixed(2)}ms, runs=[${bench.runs.map((r) => r.toFixed(1)).join(', ')}]`,
    )
    expectCleanRun(bench)
  })

  // Larger workload — clearer signal-to-noise. Mount + dispose 5000 elements.
  it('5000 Element mounts — large workload, clearer wall-clock signal', async () => {
    const bench = await benchmark(5000, (root, i) => mount(h(Element, null, `item-${i}`), root))
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 5000 bare Element: median=${bench.median.toFixed(2)}ms, runs=[${bench.runs.map((r) => r.toFixed(1)).join(', ')}]`,
    )
    expectCleanRun(bench)
  })

  // One-shot single-tree mount: reflects real-app cold-mount cost.
  it('single one-shot mount of a 500-Element tree', async () => {
    const bench = await benchmark(1, (root) => {
      const tree = h(
        'div',
        null,
        ...Array.from({ length: 500 }, (_, i) => h(Element, null, `child-${i}`)),
      )
      return mount(tree, root)
    })
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 500-child tree mount: median=${bench.median.toFixed(2)}ms, runs=[${bench.runs.map((r) => r.toFixed(1)).join(', ')}]`,
    )
    expectCleanRun(bench)
  })
})

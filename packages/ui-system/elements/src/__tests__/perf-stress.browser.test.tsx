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
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE ASSERTIONS ARE RATIOS, NOT MILLISECONDS
 *
 * These budgets were absolute (`median < 500`), and the docstring above
 * assumed "variance ≤ 15% on stable runs". A shared GitHub runner is not
 * a stable run: measured 2026-09 on main, `depth-10 × 50` reported 875ms
 * against a 500ms budget while two siblings reported 503ms and 697ms —
 * 75%, 1% and 39% over, in one pass, from load alone. That reddened
 * `Test (browser)` on main and on every open PR that touched no browser
 * package at all.
 *
 * An absolute wall-clock bound in a CORRECTNESS gate cannot distinguish
 * "Element got slower" from "the runner was busy", and the escalation it
 * invites — raise the number until it stops firing — ends with a gate
 * that cannot fail. The repo has been here before with `ws-relay`
 * (8s → 15s → 20s → 30s across four PRs).
 *
 * So each workload now asserts its SCALING: the same work is measured at
 * N and at 2N in one pass, and the ratio between them must stay near 2.
 * Load scales both arms together, so the ratio is load-invariant — while
 * still catching precisely what a stress test is for, a mount path that
 * has become superlinear (an O(n²) walk, a cache that stopped hitting, a
 * stylesheet rebuilt per mount). The absolute medians are still logged,
 * because that is the number a human wants when investigating.
 *
 * A bare-`<div>` control was tried first and REJECTED with numbers: 500
 * div mounts measure 0.2–0.3ms, which is close enough to the timer floor
 * that the denominator swung 50% between two runs on an idle machine.
 * Dividing by a noisy near-zero reintroduces exactly the instability the
 * change is removing. Both arms of a scaling ratio do the same work, so
 * they sit in the same order of magnitude and the quotient is stable.
 *
 * The bound is deliberately loose (3× for a doubling). It exists to catch
 * a regression of KIND, not a few percent of drift — the latter is what
 * the perf-dashboard journeys and `bench-runner` are for, run on a quiet
 * machine, which a CI runner never is.
 * ─────────────────────────────────────────────────────────────────────
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
}

/**
 * Loose by design — a doubling of work costing under 3x is "not
 * superlinear", which is the property being gated. Anything tighter
 * starts measuring the runner instead of the code.
 */
const MAX_DOUBLING_RATIO = 3

/**
 * Measure one workload at N and at 2N in the same pass and assert the
 * cost scales roughly linearly.
 *
 * Both arms run the identical code over the identical stack, so machine
 * load, GC timing and CPU contention all divide out. What does NOT divide
 * out is an algorithmic change — that is the whole point.
 */
async function expectLinearScaling(
  label: string,
  N: number,
  mountFn: (root: Element, i: number) => () => void,
): Promise<void> {
  const single = await benchmark(N, mountFn)
  const double = await benchmark(N * 2, mountFn)
  // Guard the denominator: on a fast machine a small N can round near
  // zero, and dividing by that measures the clock rather than the code.
  const ratio = double.median / Math.max(single.median, 0.5)
  // oxlint-disable-next-line no-console
  console.log(
    `[stress] ${label}: ${N}=${single.median.toFixed(2)}ms, ${N * 2}=${double.median.toFixed(2)}ms, `
      + `scaling=${ratio.toFixed(2)}x (linear=2, max ${MAX_DOUBLING_RATIO}), `
      + `runs=[${single.runs.map((r) => r.toFixed(1)).join(', ')}]`,
  )
  expect(
    ratio,
    `${label}: doubling the work cost ${ratio.toFixed(2)}x (linear is 2x, bound `
      + `${MAX_DOUBLING_RATIO}x). Both arms ran in the same pass over the same `
      + 'stack, so a busy runner cannot produce this — a superlinear mount path can.',
  ).toBeLessThan(MAX_DOUBLING_RATIO)
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
  cleanup()

  const sorted = [...runs].sort((a, b) => a - b)
  const median = sorted[2] as number
  const min = sorted[0] as number
  const max = sorted[4] as number
  return { median, min, max, runs }
}

describe('Element + stack stress benchmark', () => {
  it('500 bare Element mounts (mount + dispose, batched)', async () => {
    await expectLinearScaling('bare Element', 500, (root, i) =>
      mount(h(Element, null, `item-${i}`), root))
  })

  it('500 Element with css prop (exercises extendCss path)', async () => {
    // The `css` prop is the arm where a lost style cache shows up as
    // superlinear cost — every mount rebuilding a sheet instead of
    // reusing an interned one.
    await expectLinearScaling('Element + css', 500, (root, i) =>
      mount(
        h(Element, { css: { color: 'red', padding: 8 } as unknown as Record<string, unknown> }, `item-${i}`),
        root,
      ))
  })

  it('depth-10 Element nesting × 50 mounts', async () => {
    const buildDepth = (n: number, label: string): VNodeChild => {
      if (n === 0) return label
      return h(Element, null, buildDepth(n - 1, label))
    }
    await expectLinearScaling('depth-10 nesting', 50, (root, i) =>
      mount(buildDepth(10, `leaf-${i}`) as unknown as Parameters<typeof mount>[0], root))
  })

  // Larger workload — clearer signal-to-noise. Mount + dispose 5000 elements.
  it('5000 Element mounts — large workload, clearer wall-clock signal', async () => {
    // The largest arm, where a superlinear path is most visible and
    // where the timer floor is furthest away.
    await expectLinearScaling('bare Element (large)', 5000, (root, i) =>
      mount(h(Element, null, `item-${i}`), root))
  })

  // One-shot single-tree mount: reflects real-app cold-mount cost.
  it('single one-shot mount of a 500-Element tree', async () => {
    // Scaling here is in the TREE, not the mount count: one mount of 500
    // children against one mount of 1000.
    const treeOf = (n: number) => (root: Element) =>
      mount(
        h('div', null, ...Array.from({ length: n }, (_, i) => h(Element, null, `child-${i}`))),
        root,
      )
    const single = await benchmark(1, treeOf(500))
    const double = await benchmark(1, treeOf(1000))
    const ratio = double.median / Math.max(single.median, 0.5)
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 500-child tree: 500=${single.median.toFixed(2)}ms, 1000=${double.median.toFixed(2)}ms, `
        + `scaling=${ratio.toFixed(2)}x (linear=2, max ${MAX_DOUBLING_RATIO})`,
    )
    expect(
      ratio,
      `500-child tree: doubling the children cost ${ratio.toFixed(2)}x (linear is 2x).`,
    ).toBeLessThan(MAX_DOUBLING_RATIO)
  })
})

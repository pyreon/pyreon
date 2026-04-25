/**
 * Wall-clock stress benchmark for the Element + Wrapper + Styled stack.
 *
 * Runs in real Chromium. Goal: surface a measurable wall-clock delta that
 * synthetic counter probes (happy-dom + mountChild) miss. Specifically
 * targets the path where Pyreon's 9ms benchmark numbers come from — the
 * mount-pipeline + styler-resolve composition.
 *
 * Each test mounts N components, disposes, and reports median wall-clock
 * across 5 measured iterations after warmup. Variance ≤ 15% on stable runs.
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
    const bench = await benchmark(500, (root, i) => mount(h(Element, null, `item-${i}`), root))
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 500 bare Element: median=${bench.median.toFixed(2)}ms, runs=[${bench.runs.map((r) => r.toFixed(1)).join(', ')}]`,
    )
    expect(bench.median).toBeLessThan(200)
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
    expect(bench.median).toBeLessThan(500)
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
    expect(bench.median).toBeLessThan(500)
  })

  // Larger workload — clearer signal-to-noise. Mount + dispose 5000 elements.
  it('5000 Element mounts — large workload, clearer wall-clock signal', async () => {
    const bench = await benchmark(5000, (root, i) => mount(h(Element, null, `item-${i}`), root))
    // oxlint-disable-next-line no-console
    console.log(
      `[stress] 5000 bare Element: median=${bench.median.toFixed(2)}ms, runs=[${bench.runs.map((r) => r.toFixed(1)).join(', ')}]`,
    )
    expect(bench.median).toBeLessThan(2000)
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
    expect(bench.median).toBeLessThan(1000)
  })
})

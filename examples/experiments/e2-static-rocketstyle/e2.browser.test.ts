/**
 * E2 measurement: baseline (real `<Button>` from `@pyreon/ui-components`)
 * vs collapsed (hand-written compile-output equivalent), real Chromium.
 *
 * Goal: prove or disprove the hypothesis that compile-time wrapper-collapse
 * for literal-prop rocketstyle call sites produces a 3-5× mountChild
 * reduction and a 50-70% wall-clock improvement.
 *
 * Methodology:
 *   1. Initialize PyreonUI / theme (so styler context is set up).
 *   2. Warmup-mount one baseline Button to:
 *      a. populate the styler sheet with the resolved CSS rules
 *      b. capture the resolved class string
 *   3. Bench the baseline: mount N=200 Buttons, dispose, repeat 5 times,
 *      take median wall-clock + counter snapshot.
 *   4. Bench the collapsed version: same N=200, same shape.
 *   5. Compare and assert against the GRADUATE/DEFER/KILL thresholds.
 */

import type { CleanupFn } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { install as installPerfHarness, perfHarness } from '@pyreon/perf-harness'
import { flush } from '@pyreon/test-utils/browser'
import { beforeAll, describe, expect, it } from 'vitest'

import { mountBaselineButton, setupPyreonProvider } from './baseline-Button'
import { makeCollapsedButton } from './collapsed-Button'

const N = 200
const RUNS = 5
const WARMUP_RUNS = 3

interface Bench {
  median: number
  min: number
  max: number
  runs: number[]
  countersDelta: Record<string, number>
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return (sorted[mid] ?? 0) as number
}

async function benchmark(
  label: string,
  setupFn: (root: Element) => (i: number) => CleanupFn,
): Promise<Bench> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const mountFn = setupFn(root)

  // Warmup
  for (let w = 0; w < WARMUP_RUNS; w++) {
    const ds = Array.from({ length: N }, (_, i) => mountFn(i))
    for (const d of ds) d()
  }
  await flush()

  perfHarness.reset()
  const before = perfHarness.snapshot()

  const runs: number[] = []
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now()
    const ds = Array.from({ length: N }, (_, i) => mountFn(i))
    for (const d of ds) d()
    runs.push(performance.now() - t0)
    await flush()
  }

  const after = perfHarness.snapshot()
  const countersDelta: Record<string, number> = {}
  const allKeys = new Set<string>([...Object.keys(before), ...Object.keys(after)])
  for (const k of allKeys) {
    countersDelta[k] = (after[k] ?? 0) - (before[k] ?? 0)
  }

  root.remove()
  // oxlint-disable-next-line no-console
  console.warn(
    `[e2:${label}] N=${N} × RUNS=${RUNS} median=${median(runs).toFixed(2)}ms ` +
      `runs=[${runs.map((r) => r.toFixed(1)).join(', ')}] ` +
      `counters=${JSON.stringify(countersDelta)}`,
  )
  return {
    median: median(runs),
    min: Math.min(...runs),
    max: Math.max(...runs),
    runs,
    countersDelta,
  }
}

describe('E2 — compile-time wrapper-collapse for rocketstyle', () => {
  let resolvedClass = ''

  beforeAll(async () => {
    installPerfHarness()
    perfHarness.enable()

    // Mount one Button to populate the styler sheet AND capture the
    // resolved class string. The collapsed version reuses both.
    const captureRoot = document.createElement('div')
    document.body.appendChild(captureRoot)
    const dispose = mountBaselineButton(captureRoot as unknown as Element, 0)
    await flush()
    const btn = captureRoot.querySelector('button')
    if (!btn) throw new Error('baseline mount produced no <button>')
    resolvedClass = btn.className
    if (!resolvedClass) throw new Error('baseline mount produced empty className')
    // oxlint-disable-next-line no-console
    console.warn(`[e2:setup] resolvedClass=${resolvedClass}`)
    dispose()
    captureRoot.remove()
    await flush()
  })


  it('baseline + collapsed produce the same <button class="...">', async () => {
    const baseRoot = document.createElement('div')
    document.body.appendChild(baseRoot)
    const baseDispose = mountBaselineButton(baseRoot as unknown as Element, 0)
    await flush()
    const baseBtn = baseRoot.querySelector('button')

    const colRoot = document.createElement('div')
    document.body.appendChild(colRoot)
    const native = makeCollapsedButton('label-0', resolvedClass)
    const colDispose = mount(native as unknown as Parameters<typeof mount>[0], colRoot)
    await flush()
    const colBtn = colRoot.querySelector('button')

    expect(baseBtn).not.toBeNull()
    expect(colBtn).not.toBeNull()
    expect(colBtn?.className).toBe(baseBtn?.className)
    // Both should be a button element with the same text.
    expect(colBtn?.tagName).toBe('BUTTON')
    expect(colBtn?.textContent).toBe('label-0')

    baseDispose()
    colDispose()
    baseRoot.remove()
    colRoot.remove()
  })

  it('benchmark: baseline vs collapsed (PyreonUI provider amortized)', async () => {
    // Baseline: set up PyreonUI ONCE outside the timed loop, then time
    // only the per-Button mount cost. This is the fair comparison: real
    // apps mount PyreonUI per app boot, not per component.
    const baseline = await benchmark('baseline', (root) => {
      const { mountInto } = setupPyreonProvider(root)
      return (i: number) => mountInto(i)
    })

    // Collapsed: no provider needed (the resolved class is baked in).
    const collapsed = await benchmark('collapsed', (root) => {
      return (i: number) => {
        const native = makeCollapsedButton(`label-${i}`, resolvedClass)
        return mount(native as unknown as Parameters<typeof mount>[0], root)
      }
    })

    const wallClockRatio = collapsed.median / baseline.median
    const baselineMountChild = baseline.countersDelta['runtime.mountChild'] ?? 0
    const collapsedMountChild = collapsed.countersDelta['runtime.mountChild'] ?? 0
    const baselineMountPerVisible = baselineMountChild / (N * RUNS)
    const collapsedMountPerVisible = collapsedMountChild / (N * RUNS)

    // oxlint-disable-next-line no-console
    console.warn(
      `[e2:result] baseline=${baseline.median.toFixed(2)}ms ` +
        `collapsed=${collapsed.median.toFixed(2)}ms ` +
        `ratio=${(wallClockRatio * 100).toFixed(1)}% ` +
        `mountChild/visible: baseline=${baselineMountPerVisible.toFixed(2)} collapsed=${collapsedMountPerVisible.toFixed(2)}`,
    )

    // Sanity: both versions did mount work.
    expect(baseline.median).toBeGreaterThan(0)
    expect(collapsed.median).toBeGreaterThan(0)
    expect(baselineMountChild).toBeGreaterThan(0)
    expect(collapsedMountChild).toBeGreaterThan(0)

    // Always assert the collapsed version is faster — the experiment
    // is FALSIFIED if it's slower or equal.
    expect(collapsed.median).toBeLessThan(baseline.median)
    expect(collapsedMountPerVisible).toBeLessThan(baselineMountPerVisible)
  })
})

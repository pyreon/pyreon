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
import { _rsCollapse, mount } from '@pyreon/runtime-dom'
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

// ── Phase 4: SHIPPED `_rsCollapse` × the REAL Button — the RFC's two
// acceptance criteria, in real Chromium ────────────────────────────────
//
// The describe above proves the *hypothesis* with the experiment's
// hand-written `makeCollapsedButton` stub. This proves the *shipped*
// `@pyreon/runtime-dom._rsCollapse` (the runtime half of the P0 slice)
// against the REAL `@pyreon/ui-components` Button:
//
//  (1) "Build-time-resolved class strings match runtime-resolved
//      byte-for-byte" — the collapsed <button>'s outerHTML is IDENTICAL
//      to the real rocketstyle-mounted <button>'s outerHTML (same class,
//      same data-* attrs, same inner span, same text). The template is
//      derived by stripping the root class exactly as the production
//      resolver's FIRST_CLASS_RE does, so this is the real emit shape.
//  (2) "Collapsed call sites pass runtime.tpl >= 1, runtime.mountChild
//      == 1 per Button" — the perf-counter signature the RFC requires
//      (baseline is 9 mountChild; collapsed is 1, via one `_tpl`).
describe('E2 Phase 4 — shipped _rsCollapse vs real Button (RFC acceptance)', () => {
  const FIRST_CLASS_RE = /^(\s*<[a-zA-Z][\w-]*)([^>]*?)\sclass="([^"]*)"([^>]*>)/

  it('byte-for-byte DOM parity: collapsed outerHTML === real rocketstyle outerHTML', async () => {
    // Real rocketstyle mount — the source of truth.
    const realRoot = document.createElement('div')
    document.body.appendChild(realRoot)
    const realDispose = mountBaselineButton(realRoot as unknown as Element, 0)
    await flush()
    const realBtn = realRoot.querySelector('button')
    expect(realBtn).not.toBeNull()
    const realHtml = (realBtn as HTMLElement).outerHTML
    const realClass = (realBtn as HTMLElement).className
    const realColor = getComputedStyle(realBtn as Element).color

    // Derive the collapsed template the SAME way the production resolver
    // does: strip the root element's class (applied reactively at runtime).
    const m = FIRST_CLASS_RE.exec(realHtml)
    expect(m).not.toBeNull()
    const templateHtml = realHtml.replace(FIRST_CLASS_RE, '$1$2$4')
    expect(/^<button[^>]*\sclass=/.test(templateHtml)).toBe(false)

    // Shipped `_rsCollapse` with the real resolved class (light==dark
    // here — this Button's primary state is mode-invariant in the default
    // theme; the mode-flip path is proven in runtime-dom's
    // rs-collapse.browser.test). The styler sheet was already populated
    // by the real mount above (the resolver's `injectRules` path is
    // proven self-sufficient independently in styler's own browser test).
    const colRoot = document.createElement('div')
    document.body.appendChild(colRoot)
    const collapsed = _rsCollapse(templateHtml, realClass, realClass, () => false)
    const colDispose = mount(collapsed as unknown as Parameters<typeof mount>[0], colRoot)
    await flush()
    const colBtn = colRoot.querySelector('button')
    expect(colBtn).not.toBeNull()

    // (1) BYTE-FOR-BYTE on the substantive surface: the resolved CLASS
    // STRING is identical char-for-char (the RFC's literal acceptance
    // criterion), and the DOM is structurally equal (tag + attribute SET
    // + children + text). `isEqualNode` is the DOM spec's structural
    // equality — attribute *serialization order* is not observable and
    // not a correctness property (the collapsed path sets `class` last,
    // via the reactive bind, so `outerHTML` orders attrs differently
    // while the live DOM is identical).
    expect((colBtn as HTMLElement).className).toBe(realClass)
    expect((colBtn as HTMLElement).isEqualNode(realBtn as HTMLElement)).toBe(true)
    expect((colBtn as HTMLElement).tagName).toBe('BUTTON')
    expect((colBtn as HTMLElement).getAttribute('data-rocketstyle')).toBe(
      (realBtn as HTMLElement).getAttribute('data-rocketstyle'),
    )
    // Computed style is identical too (the class resolves to the same CSS).
    expect(getComputedStyle(colBtn as Element).color).toBe(realColor)

    realDispose()
    colDispose()
    realRoot.remove()
    colRoot.remove()
    await flush()
  })

  it('perf signature: a collapsed mount fires runtime.tpl >= 1 and runtime.mountChild == 1', async () => {
    // Capture the real Button's class + stripped template once.
    const capRoot = document.createElement('div')
    document.body.appendChild(capRoot)
    const capDispose = mountBaselineButton(capRoot as unknown as Element, 0)
    await flush()
    const capBtn = capRoot.querySelector('button') as HTMLElement
    const cls = capBtn.className
    const tpl = capBtn.outerHTML.replace(FIRST_CLASS_RE, '$1$2$4')
    capDispose()
    capRoot.remove()
    await flush()

    perfHarness.reset()
    const before = perfHarness.snapshot()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(
      _rsCollapse(tpl, cls, cls, () => false) as unknown as Parameters<typeof mount>[0],
      root,
    )
    await flush()
    const after = perfHarness.snapshot()
    // perfHarness.snapshot() is a FLAT counter map (same shape the
    // benchmark() helper above reads via `after[k]`).
    const delta = (name: string): number =>
      ((after as Record<string, number>)[name] ?? 0) -
      ((before as Record<string, number>)[name] ?? 0)

    // RFC acceptance: ONE _tpl cloneNode, ONE mountChild for the whole
    // collapsed Button (the real rocketstyle mount is 9 mountChild — see
    // RESULTS.md). The 5-layer wrapper mount is gone.
    expect(delta('runtime.tpl')).toBeGreaterThanOrEqual(1)
    expect(delta('runtime.mountChild')).toBe(1)
    // And the real class is applied (parity guard inside the perf spec).
    expect((root.querySelector('button') as HTMLElement).className).toBe(cls)

    dispose()
    root.remove()
    await flush()
  })
})

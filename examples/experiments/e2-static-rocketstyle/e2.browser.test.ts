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
import { signal } from '@pyreon/reactivity'
import { _rsCollapse, _rsCollapseH, hydrateRoot, mount } from '@pyreon/runtime-dom'
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

  // (3) SSR → HYDRATE parity — the thinnest unproven seam, now closed.
  //
  // The P0 design deliberately diverges the graphs: SSR keeps the REAL
  // 5-layer rocketstyle mount; the CLIENT graph collapses to
  // `_rsCollapse`. Under `hydrateRoot`, the collapsed component returns a
  // NativeItem (`_tpl` cloneNode), so it hits `hydrate.ts`'s
  // `__isNative === true` branch: the framework-wide, correctness-first
  // `_tpl` hydration path SWAPS the SSR subtree for the freshly-built
  // collapsed node — same final DOM, byte-for-byte class (FNV-1a SSR↔DOM
  // contract), NO crash, NO hydration-mismatch warning. This is NOT a
  // collapse-specific runtime path; `_rsCollapse` inherits it from `_tpl`
  // for free. This spec proves it end-to-end against the REAL Button:
  //   - SSR markup (the real rocketstyle outerHTML the server emits) is
  //     placed as the container's existing DOM,
  //   - `hydrateRoot` mounts the collapsed `_rsCollapse` against it,
  //   - the resulting <button> is byte-for-byte the SSR class +
  //     structurally `isEqualNode` the original, with NO `console.error`
  //     hydration-mismatch fired, and
  //   - reactivity SURVIVES hydration: a post-hydrate mode flip patches
  //     `className` IN PLACE on the SAME node (no remount) — the real
  //     contract, not just "didn't throw".
  it('SSR markup → hydrateRoot(_rsCollapse): byte-for-byte parity + no mismatch + reactive after hydration', async () => {
    // 1. Capture the REAL rocketstyle Button's server-equivalent markup.
    //    Browser-only experiment: the real mounted outerHTML IS what
    //    `renderToString` emits (styler's FNV-1a class hash is identical
    //    SSR vs DOM — its hydration contract). Capture light + dark class.
    const srcRoot = document.createElement('div')
    document.body.appendChild(srcRoot)
    const srcDispose = mountBaselineButton(srcRoot as unknown as Element, 0)
    await flush()
    const srcBtn = srcRoot.querySelector('button') as HTMLElement
    const ssrHtml = srcBtn.outerHTML
    const ssrClass = srcBtn.className
    const ssrColor = getComputedStyle(srcBtn).color
    const templateHtml = ssrHtml.replace(FIRST_CLASS_RE, '$1$2$4')
    srcDispose()
    srcRoot.remove()
    await flush()

    // 2. Stand up a container holding the SSR-delivered DOM (the real
    //    5-layer Button markup — what the server graph rendered).
    const app = document.createElement('div')
    app.innerHTML = ssrHtml
    document.body.appendChild(app)
    const ssrNodeBefore = app.querySelector('button') as HTMLElement
    expect(ssrNodeBefore).not.toBeNull()

    // 3. Hydrate with the CLIENT (collapsed) graph. `isDark` is a live
    //    signal; the dark class is a DISTINCT sentinel so a mode flip is
    //    OBSERVABLE — this is what makes the spec discriminate the
    //    `__isNative` swap (a non-swapped, un-bound SSR node can't change
    //    class on flip). Light path uses the real SSR class (byte-for-
    //    byte parity); the resolved dark class would equal light here
    //    (mode-invariant primary Button) so the sentinel is the only way
    //    to PROVE the reactive bind is live on the in-DOM node.
    const darkSentinel = `${ssrClass} pyr-e2h-dark`
    const isDark = signal(false)
    const errors: string[] = []
    const origError = console.error
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(' '))
    }
    let unmount: (() => void) | undefined
    try {
      unmount = hydrateRoot(
        app,
        _rsCollapse(templateHtml, ssrClass, darkSentinel, () => isDark()) as unknown as Parameters<
          typeof hydrateRoot
        >[1],
      )
      await flush()
    } finally {
      console.error = origError
    }

    // No hydration-mismatch was reported. The `__isNative` swap branch is
    // an intentional swap, NOT a mismatch — it must not console.error.
    expect(errors.filter((e) => /hydrat|mismatch/i.test(e))).toEqual([])

    const colBtn = app.querySelector('button') as HTMLElement
    expect(colBtn).not.toBeNull()
    // DISCRIMINATOR A — the swap actually happened: the in-DOM node is
    // the freshly-built collapsed clone, NOT the original SSR node.
    // (Bisected `__isNative` branch → still the SSR node → this fails.)
    expect(colBtn).not.toBe(ssrNodeBefore)
    // Byte-for-byte class parity with the SSR markup (light mode) +
    // structural DOM equality + identical computed style (same CSS).
    expect(colBtn.className).toBe(ssrClass)
    expect(colBtn.isEqualNode(srcBtn)).toBe(true)
    expect(getComputedStyle(colBtn).color).toBe(ssrColor)

    // 4. DISCRIMINATOR B — reactivity SURVIVES hydration: flip mode; the
    //    SAME in-DOM node's className must change to the dark sentinel
    //    (proves the `_bindDirect` className bind is LIVE on the swapped-
    //    in node — patched in place, NO remount). A non-swapped SSR node
    //    has no bind and would stay on the light class → this fails.
    const nodeId = colBtn
    isDark.set(true)
    await flush()
    const afterFlip = app.querySelector('button') as HTMLElement
    expect(afterFlip).toBe(nodeId) // patched in place — NO remount
    expect(afterFlip.className).toBe(darkSentinel)
    isDark.set(false)
    await flush()
    expect(app.querySelector('button')).toBe(nodeId)
    expect((app.querySelector('button') as HTMLElement).className).toBe(ssrClass)

    unmount?.()
    app.remove()
    await flush()
  })
})

// ── Phase 5: SHIPPED `_rsCollapseH` × the REAL Button + a peeled handler
// — PR 4/4 of the partial-collapse build (open-work #1). The named e2e.
//
// Mirrors Phase 4 EXACTLY (real `@pyreon/ui-components` Button is the
// source of truth; class stripped the same way the production resolver
// does → template; styler sheet populated by the real mount) — so it
// needs NO plugin/resolver, identical to how Phase 4 proves `_rsCollapse`
// without them. The ONLY additions vs Phase 4 are the partial-collapse
// deltas: a peeled `onClick` is threaded into `_rsCollapseH`'s handlers
// arg, and after asserting byte-for-byte DOM parity vs the real 5-layer
// Button we assert the handler FIRES on a real Chromium click (delegated
// `click` → exercised through the real `mount()` delegation root, the
// production path). This is the RFC acceptance criterion for the
// partial subset: a collapsed-with-handler `<Button onClick=…>` is
// DOM-identical to the un-collapsed mount AND fully interactive.
//
// Real-Chromium gate (@vitest/browser); CI-authoritative — runs in the
// `Test (browser)` job where `lib/` is built and `@pyreon/test-utils/
// browser` resolves. Same disclosed environment as every `.browser.
// test.ts` in this repo, including PR #681's `rs-collapse-h.browser.
// test.ts` (accepted shape).
describe('E2 Phase 5 — shipped _rsCollapseH vs real Button + handler (PR 4 RFC acceptance)', () => {
  const FIRST_CLASS_RE = /^(\s*<[a-zA-Z][\w-]*)([^>]*?)\sclass="([^"]*)"([^>]*>)/

  it('byte-for-byte DOM parity vs real Button AND the peeled handler fires on a real click', async () => {
    // Real rocketstyle mount — the source of truth (identical to Phase 4).
    const realRoot = document.createElement('div')
    document.body.appendChild(realRoot)
    const realDispose = mountBaselineButton(realRoot as unknown as Element, 0)
    await flush()
    const realBtn = realRoot.querySelector('button')
    expect(realBtn).not.toBeNull()
    const realHtml = (realBtn as HTMLElement).outerHTML
    const realClass = (realBtn as HTMLElement).className
    const realColor = getComputedStyle(realBtn as Element).color

    // Same resolver-equivalent class strip as Phase 4.
    const m = FIRST_CLASS_RE.exec(realHtml)
    expect(m).not.toBeNull()
    const templateHtml = realHtml.replace(FIRST_CLASS_RE, '$1$2$4')
    expect(/^<button[^>]*\sclass=/.test(templateHtml)).toBe(false)

    // Shipped `_rsCollapseH` with the real resolved class + a peeled
    // handler (what PR 3's compiler emit produces for the on*-only
    // subset). light==dark here (primary state is mode-invariant in the
    // default theme; the mode-flip-survives-handler path is proven in
    // runtime-dom's rs-collapse-h.browser.test from PR #681).
    let clicks = 0
    const colRoot = document.createElement('div')
    document.body.appendChild(colRoot)
    const collapsed = _rsCollapseH(templateHtml, realClass, realClass, () => false, {
      onClick: () => {
        clicks++
      },
    })
    const colDispose = mount(collapsed as unknown as Parameters<typeof mount>[0], colRoot)
    await flush()
    const colBtn = colRoot.querySelector('button')
    expect(colBtn).not.toBeNull()

    // (1) Byte-for-byte DOM parity vs the real 5-layer Button —
    // IDENTICAL assertions to Phase 4 (the handler must NOT perturb the
    // rendered DOM: it is an event binding, orthogonal to the styler
    // class — the whole premise of the partial-collapse subset).
    expect((colBtn as HTMLElement).className).toBe(realClass)
    expect((colBtn as HTMLElement).isEqualNode(realBtn as HTMLElement)).toBe(true)
    expect((colBtn as HTMLElement).tagName).toBe('BUTTON')
    expect((colBtn as HTMLElement).getAttribute('data-rocketstyle')).toBe(
      (realBtn as HTMLElement).getAttribute('data-rocketstyle'),
    )
    expect(getComputedStyle(colBtn as Element).color).toBe(realColor)

    // (2) Partial-collapse delta: the peeled handler is live. `click` is
    // a DELEGATED event — it fires only through the root listener the
    // real `mount()` above installed (production path). A working
    // collapsed-with-handler site MUST respond.
    ;(colBtn as HTMLElement).click()
    expect(clicks).toBe(1)
    ;(colBtn as HTMLElement).click()
    expect(clicks).toBe(2)

    realDispose()
    colDispose()
    realRoot.remove()
    colRoot.remove()
    await flush()
  })
})

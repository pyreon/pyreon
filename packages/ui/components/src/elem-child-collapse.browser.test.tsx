import { h, type VNodeChild } from '@pyreon/core'
import { _rsCollapse, mount } from '@pyreon/runtime-dom'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { flush } from '@pyreon/test-utils/browser'
import { install as installPerfHarness, perfHarness } from '@pyreon/perf-harness'
import { signal } from '@pyreon/reactivity'
import { beforeAll, describe, expect, it } from 'vitest'
import { Button } from './index'

/**
 * Element-child collapse — real `@pyreon/ui-components` Button, real Chromium.
 *
 * This is the CI-gated proof (the `examples/experiments/e2-static-rocketstyle`
 * E2 file is a one-off, un-gated measurement). It exercises the REAL Button
 * wrapping a static ELEMENT child (`<span class="ico">…</span>`) — the shape
 * element-child collapse targets — and proves, against the actual component:
 *
 *  (B) **byte-for-byte DOM parity** — the collapsed `_rsCollapse(<baked
 *      subtree>)` clone is `isEqualNode` the real 5-layer mount (same class,
 *      same nested `<span class="ico">`, same computed style). Element-child
 *      collapse reuses `_rsCollapse` UNCHANGED — the only delta is the baked
 *      subtree inside the template.
 *  (C) **the perf win, measured** — the real element-child Button fires N
 *      `runtime.mountChild` (5 wrapper layers + the child element); the
 *      collapsed clone fires exactly ONE. Counter delta is deterministic
 *      (CI-robust); a wall-clock figure is logged + asserted faster (the
 *      collapsed clone is structurally one `cloneNode`).
 *
 * `light==dark` here: the primary state is mode-invariant in the default
 * theme, so the resolved class is the same per mode — the mode-flip-no-remount
 * path is proven separately in runtime-dom's rs-collapse.browser.test.
 */
const FIRST_CLASS_RE = /^(\s*<[a-zA-Z][\w-]*)([^>]*?)\sclass="([^"]*)"([^>]*>)/

/** Mount the real element-child Button standalone; return root + dispose. */
function mountRealElemButton(label: string): { root: HTMLElement; dispose: () => void } {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(
    h(
      PyreonUI,
      { theme, mode: 'light' as const },
      h(Button, { state: 'primary', size: 'large' }, h('span', { class: 'ico' }, label)),
    ) as unknown as VNodeChild,
    root,
  )
  return { root, dispose }
}

describe('@pyreon/ui-components — element-child collapse vs real Button (CI-gated)', () => {
  let templateHtml = ''
  let resolvedClass = ''

  beforeAll(async () => {
    installPerfHarness()
    perfHarness.enable()
    // Capture the real element-child Button's class-stripped template (what
    // the production resolver bakes) + its resolved class. Sanity-check the
    // baked subtree carries the real nested child element.
    const { root, dispose } = mountRealElemButton('Save')
    await flush()
    const btn = root.querySelector('button')
    if (!btn) throw new Error('real element-child Button produced no <button>')
    resolvedClass = btn.className
    if (!resolvedClass) throw new Error('real Button produced empty className')
    templateHtml = btn.outerHTML.replace(FIRST_CLASS_RE, '$1$2$4')
    // The baked subtree IS the real nested child element (not flattened).
    if (!/<span[^>]*class="ico"/.test(templateHtml) || !templateHtml.includes('Save')) {
      throw new Error(`baked template missing child subtree: ${templateHtml}`)
    }
    // root class stripped — sanity-check, consistent with the throws above
    // (assertions belong in `it`, not a setup hook, so guard with a throw)
    if (/^<button[^>]*\sclass=/.test(templateHtml)) {
      throw new Error(`root class not stripped from baked template: ${templateHtml}`)
    }
    dispose()
    root.remove()
    await flush()
  })

  it('byte-for-byte DOM parity: collapsed element-child === real Button-with-element-child', async () => {
    const { root: realRoot, dispose: realDispose } = mountRealElemButton('Save')
    await flush()
    const realBtn = realRoot.querySelector('button') as HTMLElement
    const realColor = getComputedStyle(realBtn).color

    const colRoot = document.createElement('div')
    document.body.appendChild(colRoot)
    const colDispose = mount(
      _rsCollapse(templateHtml, resolvedClass, resolvedClass, () => false) as unknown as Parameters<
        typeof mount
      >[0],
      colRoot,
    )
    await flush()
    const colBtn = colRoot.querySelector('button') as HTMLElement
    expect(colBtn).not.toBeNull()

    // The baked child element is present AS AN ELEMENT (not flattened text).
    const colSpan = colBtn.querySelector('span.ico')
    expect(colSpan?.textContent).toBe('Save')
    // Structural DOM equality vs the real 5-layer mount + class + computed style.
    expect(colBtn.className).toBe(resolvedClass)
    expect(colBtn.isEqualNode(realBtn)).toBe(true)
    expect(getComputedStyle(colBtn).color).toBe(realColor)

    realDispose()
    colDispose()
    realRoot.remove()
    colRoot.remove()
    await flush()
  })

  it('perf win MEASURED: real element-child Button fires N mountChild; collapsed fires exactly 1', async () => {
    // Baseline: amortize the PyreonUI provider (mount once), then count ONLY
    // the Button's mount — the fair per-component cost. The Button is added
    // INSIDE the provider's tree via a reactive slot, so it inherits the theme
    // through the owner chain. (Mounting it as a SEPARATE root would correctly
    // isolate it from the provider's context — owner-based context, like
    // React/Solid, does not leak across independent mount roots.)
    const provRoot = document.createElement('div')
    document.body.appendChild(provRoot)
    const showButton = signal(false)
    const provDispose = mount(
      h(
        PyreonUI,
        { theme, mode: 'light' as const },
        h('div', { id: 'host' }, () =>
          showButton()
            ? h(Button, { state: 'primary', size: 'large' }, h('span', { class: 'ico' }, 'Save'))
            : null,
        ),
      ) as unknown as VNodeChild,
      provRoot,
    )
    await flush()

    perfHarness.reset()
    const b0 = perfHarness.snapshot()
    showButton.set(true)
    await flush()
    const baselineMountChild =
      (perfHarness.snapshot()['runtime.mountChild'] ?? 0) - (b0['runtime.mountChild'] ?? 0)
    showButton.set(false)
    await flush()

    // Collapsed: ONE cloneNode, no provider needed (class baked in).
    const colRoot = document.createElement('div')
    document.body.appendChild(colRoot)
    perfHarness.reset()
    const c0 = perfHarness.snapshot()
    const colDispose = mount(
      _rsCollapse(templateHtml, resolvedClass, resolvedClass, () => false) as unknown as Parameters<
        typeof mount
      >[0],
      colRoot,
    )
    await flush()
    const collapsedMountChild =
      (perfHarness.snapshot()['runtime.mountChild'] ?? 0) - (c0['runtime.mountChild'] ?? 0)
    colDispose()

    // oxlint-disable-next-line no-console
    console.warn(
      `[elem-child perf] real element-child Button: ${baselineMountChild} mountChild → collapsed: ${collapsedMountChild} (${(baselineMountChild / collapsedMountChild).toFixed(1)}× fewer)`,
    )

    // The collapsed mount is ONE cloneNode for the whole subtree; the real
    // 5-layer-wrapper + child mount is many. This is the structural win.
    expect(collapsedMountChild).toBe(1)
    expect(baselineMountChild).toBeGreaterThan(collapsedMountChild)

    provDispose()
    provRoot.remove()
    colRoot.remove()
    await flush()
  })

  it('wall-clock: N collapsed element-child mounts are faster than N real mounts', async () => {
    const N = 150
    const RUNS = 5
    const median = (a: number[]): number => {
      const s = [...a].sort((x, y) => x - y)
      return s[Math.floor(s.length / 2)] ?? 0
    }

    // Baseline: provider amortized (mounted once), time only per-Button cost.
    const provRoot = document.createElement('div')
    document.body.appendChild(provRoot)
    const provDispose = mount(
      h(
        PyreonUI,
        { theme, mode: 'light' as const },
        h('div', { id: 'host' }),
      ) as unknown as VNodeChild,
      provRoot,
    )
    await flush()
    const host = provRoot.querySelector('#host') as HTMLElement
    const baseRuns: number[] = []
    for (let r = 0; r < RUNS; r++) {
      const t0 = performance.now()
      const ds = Array.from({ length: N }, () =>
        mount(
          h(
            Button,
            { state: 'primary', size: 'large' },
            h('span', { class: 'ico' }, 'Save'),
          ) as unknown as VNodeChild,
          host,
        ),
      )
      for (const d of ds) d()
      baseRuns.push(performance.now() - t0)
      await flush()
    }
    provDispose()
    provRoot.remove()

    // Collapsed: one cloneNode per mount, no provider.
    const colRoot = document.createElement('div')
    document.body.appendChild(colRoot)
    const colRuns: number[] = []
    for (let r = 0; r < RUNS; r++) {
      const t0 = performance.now()
      const ds = Array.from({ length: N }, () =>
        mount(
          _rsCollapse(
            templateHtml,
            resolvedClass,
            resolvedClass,
            () => false,
          ) as unknown as Parameters<typeof mount>[0],
          colRoot,
        ),
      )
      for (const d of ds) d()
      colRuns.push(performance.now() - t0)
      await flush()
    }
    colRoot.remove()

    const baseMed = median(baseRuns)
    const colMed = median(colRuns)
    // oxlint-disable-next-line no-console
    console.warn(
      `[elem-child perf] wall-clock N=${N}×${RUNS}: baseline=${baseMed.toFixed(2)}ms collapsed=${colMed.toFixed(2)}ms (${(baseMed / colMed).toFixed(1)}× faster)`,
    )
    // Direction only (CI-robust): the collapsed clone is structurally far
    // less work than the 5-layer-wrapper + child mount, so it is faster by a
    // wide margin. A specific ratio would flake under CI load.
    expect(colMed).toBeGreaterThan(0)
    expect(colMed).toBeLessThan(baseMed)
    await flush()
  })
})

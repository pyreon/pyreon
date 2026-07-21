/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { sheet } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { init, PyreonUI } from '@pyreon/ui-core'
// Register unistyle's real theme engine (themeToCssVars) — ui-core no longer
// pulls unistyle transitively (the cycle break), so CSS-variables mode needs it
// explicitly loaded.
import '@pyreon/unistyle'
import { afterEach, describe, expect, it } from 'vitest'
import rocketstyle from '../init'

// THE measured lock for cssVariables mode (real Chromium):
//
//   A dark/light flip is ONE attribute write — computed styles change while
//   (a) the component's className does NOT change,
//   (b) styler.resolve fires ZERO times,
//   (c) rocketstyle.getTheme (fresh theme resolutions) fires ZERO times.
//
// The flag-off control asserts the inverse (the classic path DOES re-resolve),
// so reverting the mode-free memo key / the skipped mode read / the var-pair
// factory fails exactly one of this pair — bisect-discriminating by design.

const Base: ComponentFn<{ id?: string; children?: VNodeChild; class?: string }> = (props) =>
  h('div', props, props.children)
;(Base as ComponentFn & { displayName?: string }).displayName = 'Base'

const countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

const theme = { rootSize: 16, breakpoints: { xs: 0 }, spacing: { small: 8 } }

const makeBox = (name: string) =>
  (rocketstyle()({ name, component: Base }) as any)
    .styles(
      (css: any) => css`
        background-color: ${({ $rocketstyle }: any) => $rocketstyle.bg};
      `,
    )
    .theme((_t: any, m: any) => ({ bg: m('rgb(10, 20, 30)', 'rgb(200, 100, 50)') }))

afterEach(() => {
  init({ cssVariables: false })
  delete countSink.__pyreon_count__
  document.documentElement.removeAttribute('data-theme')
  sheet.clearCache()
})

describe('rocketstyle under cssVariables — measured mode flip', () => {
  it('flip = attribute write only: styles change, ZERO className writes, ZERO resolve work', () => {
    init({ cssVariables: true })
    const mode = signal<'light' | 'dark'>('light')
    const Box = makeBox('VarBox')
    const { container, unmount } = mountInBrowser(
      h(PyreonUI as any, { theme, mode: () => mode() }, h(Box, { id: 'vb' })),
    )
    const el = container.querySelector<HTMLElement>('#vb')!
    expect(getComputedStyle(el).backgroundColor).toBe('rgb(10, 20, 30)')
    const classBefore = el.className

    // Arm the perf-counter sink AFTER mount — the flip itself must be free.
    const counts: Record<string, number> = {}
    countSink.__pyreon_count__ = (name) => {
      counts[name] = (counts[name] ?? 0) + 1
    }

    mode.set('dark')

    expect(getComputedStyle(el).backgroundColor).toBe('rgb(200, 100, 50)')
    expect(el.className).toBe(classBefore)
    expect(counts['styler.resolve'] ?? 0).toBe(0)
    expect(counts['rocketstyle.getTheme'] ?? 0).toBe(0)

    // ROOT provider drives the mode attribute on documentElement (:root) —
    // one attribute write, no wrapper, the cascade re-resolves the var pair.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(container.querySelector('[data-theme]')).toBeNull()
    unmount()
  })

  it('control (flag off): the classic flip re-resolves — the work the var mode removes', () => {
    const mode = signal<'light' | 'dark'>('light')
    const Box = makeBox('ClassicBox')
    const { container, unmount } = mountInBrowser(
      h(PyreonUI as any, { theme, mode: () => mode() }, h(Box, { id: 'cb' })),
    )
    const el = container.querySelector<HTMLElement>('#cb')!
    expect(getComputedStyle(el).backgroundColor).toBe('rgb(10, 20, 30)')

    const counts: Record<string, number> = {}
    countSink.__pyreon_count__ = (name) => {
      counts[name] = (counts[name] ?? 0) + 1
    }

    mode.set('dark')

    expect(getComputedStyle(el).backgroundColor).toBe('rgb(200, 100, 50)')
    const resolveWork =
      (counts['rocketstyle.getTheme'] ?? 0) + (counts['styler.resolve'] ?? 0)
    expect(resolveWork).toBeGreaterThan(0)
    unmount()
  })

  it('theme var leaves flow through rocketstyle .theme() into computed styles', () => {
    init({ cssVariables: true })
    const Pad = (rocketstyle()({ name: 'PadBox', component: Base }) as any)
      .styles(
        (css: any) => css`
          padding: ${({ $rocketstyle }: any) => $rocketstyle.pad};
        `,
      )
      .theme((t: any) => ({ pad: t.spacing.small }))
    const { container, unmount } = mountInBrowser(
      h(PyreonUI as any, { theme }, h(Pad, { id: 'pb' })),
    )
    const el = container.querySelector<HTMLElement>('#pb')!
    // t.spacing.small === 'var(--px-spacing-small)'; the cascade resolves the
    // emitted 0.5rem → 8px — proving emission units AND rocketstyle flow.
    expect(getComputedStyle(el).paddingTop).toBe('8px')
    unmount()
  })

  it('nested inversed provider scopes dark vars to its subtree (wrapper cascade)', () => {
    init({ cssVariables: true })
    const Box = makeBox('ScopedBox')
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI as any,
        { theme, mode: 'light' },
        h(Box, { id: 'outer' }),
        h(PyreonUI as any, { inversed: true }, h(Box, { id: 'inner' })),
      ),
    )
    const outer = container.querySelector<HTMLElement>('#outer')!
    const inner = container.querySelector<HTMLElement>('#inner')!
    // root → documentElement (light), nested inversed → wrapper (dark) scoping
    // only its subtree. outer resolves from :root (light), inner from the wrapper.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    const wrapper = container.querySelector('[data-theme="dark"]')
    expect(wrapper).not.toBeNull()
    expect(getComputedStyle(outer).backgroundColor).toBe('rgb(10, 20, 30)')
    expect(getComputedStyle(inner).backgroundColor).toBe('rgb(200, 100, 50)')
    unmount()
  })

  it('MEASURED: 100-component mode flip — vars mode does no resolution work (wall-clock logged)', () => {
    // Counter-level proof lives in the specs above; this measures wall-clock
    // for the marketing-honest number. Direction-only bound (CI-load
    // tolerant): the vars flip must not be slower than the classic flip
    // beyond noise, and must stay in single-digit-ms territory.
    const N = 100
    const flips = 10

    const run = (vars: boolean): number => {
      init({ cssVariables: vars })
      const mode = signal<'light' | 'dark'>('light')
      const Box = makeBox(vars ? 'PerfVarBox' : 'PerfClassicBox')
      const children = Array.from({ length: N }, (_, i) => h(Box, { id: `p${i}` }))
      const { container, unmount } = mountInBrowser(
        h(PyreonUI as any, { theme, mode: () => mode() }, ...children),
      )
      const el = container.querySelector<HTMLElement>('#p0')!
      expect(getComputedStyle(el).backgroundColor).toBe('rgb(10, 20, 30)')
      const t0 = performance.now()
      for (let i = 0; i < flips; i++) {
        mode.set(i % 2 === 0 ? 'dark' : 'light')
        // force style recalc each flip so the measurement includes it
        void getComputedStyle(el).backgroundColor
      }
      const ms = performance.now() - t0
      unmount()
      init({ cssVariables: false })
      sheet.clearCache()
      return ms
    }

    const classicMs = run(false)
    const varsMs = run(true)
    // oxlint-disable-next-line no-console
    console.warn(
      `[cssVariables perf] ${N} components × ${flips} mode flips — classic: ${classicMs.toFixed(1)}ms, vars: ${varsMs.toFixed(1)}ms (${(classicMs / Math.max(varsMs, 0.1)).toFixed(1)}× )`,
    )
    expect(varsMs).toBeLessThanOrEqual(classicMs * 1.5 + 5)
  })
})


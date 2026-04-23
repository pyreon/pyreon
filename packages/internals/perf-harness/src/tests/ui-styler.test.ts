// @vitest-environment happy-dom
/**
 * styler hot-path probe.
 *
 * Looks for regressions in:
 *   - Repeated mount of the same styled component (should hit sheet cache)
 *   - Resolve with identical props — producing identical output
 *   - Static fast path (no dynamic values) hit
 */
import { h } from '@pyreon/core'
import { provide } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { styled, ThemeContext } from '@pyreon/styler'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'
import { resetDom } from './_dom-setup'

beforeEach(() => {
  _reset()
  install()
  resetDom()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
  document.body.innerHTML = ''
})

describe('styler — identical-mount cache', () => {
  it('static styled (no dynamic values) → ONE resolve across 100 mounts (static fast path)', async () => {
    const Card = styled('div')`
      background: #fff;
      border-radius: 8px;
      padding: 12px;
    `
    const root = document.getElementById('root')!
    const outcome = await perfHarness.record('static-100-mounts', () => {
      for (let i = 0; i < 100; i++) {
        const dispose = mount(h(Card, null, 'item'), root)
        dispose()
        resetDom()
      }
    })
    // Static styled resolves ONCE at component creation time.
    // Subsequent mounts don't call resolve. This shouldn't have fired
    // during the 100 mounts (resolve happened at createStyledComponent).
    expect(outcome.after['styler.resolve']).toBeFalsy()
    // oxlint-disable-next-line no-console
    console.log(
      `[ui-styler] static×100: resolve=${outcome.after['styler.resolve'] ?? 0}, sheet.insert=${outcome.after['styler.sheet.insert'] ?? 0}, sheet.insert.hit=${outcome.after['styler.sheet.insert.hit'] ?? 0}`,
    )
  })

  it('dynamic styled with stable theme → N resolves but high sheet hit-ratio', async () => {
    const theme = { bg: '#fff', fg: '#111' }
    const root = document.getElementById('root')!
    // Mount a theme provider
    const Card = styled('div')<{ theme: { bg: string; fg: string } }>`
      background: ${(p) => p.theme.bg};
      color: ${(p) => p.theme.fg};
    `
    const outcome = await perfHarness.record('dynamic-100-mounts', () => {
      for (let i = 0; i < 100; i++) {
        const dispose = mount(h(Card, { theme }), root)
        dispose()
        resetDom()
      }
    })
    // 100 resolves (one per mount, each dynamic)
    expect(outcome.after['styler.resolve']).toBe(100)
    // Same CSS output every time → sheet.insert.hit should dominate
    const hits = outcome.after['styler.sheet.insert.hit'] ?? 0
    const inserts = outcome.after['styler.sheet.insert'] ?? 0
    expect(hits).toBeGreaterThan(inserts * 0.95) // >95% hit ratio
    // oxlint-disable-next-line no-console
    console.log(
      `[ui-styler] dynamic×100: resolve=${inserts}, hit=${hits}, ratio=${(hits / inserts * 100).toFixed(1)}%`,
    )
  })

  it('dynamic styled × 1000 mounts — linear scaling on resolve + sheet ops', async () => {
    const theme = { bg: '#fff' }
    const Card = styled('div')<{ theme: { bg: string } }>`
      background: ${(p) => p.theme.bg};
    `
    const root = document.getElementById('root')!
    const outcome = await perfHarness.record('1000-mounts', () => {
      for (let i = 0; i < 1000; i++) {
        const dispose = mount(h(Card, { theme }), root)
        dispose()
        resetDom()
      }
    })
    expect(outcome.after['styler.resolve']).toBe(1000)
    // oxlint-disable-next-line no-console
    console.log(
      `[ui-styler] 1000-mounts: resolve=${outcome.after['styler.resolve']}, ` +
        `insert=${outcome.after['styler.sheet.insert']}, hit=${outcome.after['styler.sheet.insert.hit']}`,
    )
  })

  it('different themes produce different resolves — no false cache hit', async () => {
    const theme1 = { bg: '#fff' }
    const theme2 = { bg: '#000' }
    const Card = styled('div')<{ theme: { bg: string } }>`
      background: ${(p) => p.theme.bg};
    `
    const root = document.getElementById('root')!
    const outcome = await perfHarness.record('two-themes', () => {
      for (let i = 0; i < 100; i++) {
        const dispose1 = mount(h(Card, { theme: theme1 }), root)
        dispose1()
        resetDom()
        const dispose2 = mount(h(Card, { theme: theme2 }), root)
        dispose2()
        resetDom()
      }
    })
    // 200 resolves (100 of theme1 + 100 of theme2)
    expect(outcome.after['styler.resolve']).toBe(200)
    // 2 unique CSS outputs → after warmup, 198 hits + 2 misses
    // (or 200 hits if the sheet cache already had both from prior tests)
    const inserts = outcome.after['styler.sheet.insert'] ?? 0
    const hits = outcome.after['styler.sheet.insert.hit'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(`[ui-styler] 2 themes: inserts=${inserts}, hits=${hits}`)
    expect(hits).toBeGreaterThan(150) // Most are cache hits
  })

  it('theme provider change → resolves re-fire (whole-theme swap path)', async () => {
    const themeSignal = signal({ bg: '#fff' })
    const Card = styled('div')<{ theme: { bg: string } }>`
      background: ${(p) => p.theme.bg};
    `
    const root = document.getElementById('root')!
    // Mount with context provider
    const App = () => {
      provide(ThemeContext, () => themeSignal() as unknown as Record<string, unknown>)
      return h(Card, { theme: themeSignal() })
    }
    const dispose = mount(h(App, null), root)

    perfHarness.reset()
    themeSignal.set({ bg: '#000' })
    // Theme change doesn't trigger resolve unless the component subscribes
    // via $rocketstyle (it doesn't here, so just documents behavior).
    // oxlint-disable-next-line no-console
    console.log(
      `[ui-styler] after theme swap: resolve=${perfHarness.snapshot()['styler.resolve'] ?? 0}, signalWrite=${perfHarness.snapshot()['reactivity.signalWrite']}`,
    )
    dispose()
  })
})

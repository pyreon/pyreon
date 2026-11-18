import { h } from '@pyreon/core'
import type { StyleOverride, StylesCallback } from '@pyreon/elements'
import { signal } from '@pyreon/reactivity'
import { hydrateRoot, onHydrationMismatch } from '@pyreon/runtime-dom'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  ESCAPE_CSS,
  GRID_STYLES,
  Grid,
  HOVER_STYLES,
  HoverSwatch,
  instanceCssTree,
  SSR_CSS,
  SSR_HTML,
  SWATCH_STYLES,
  Swatch,
} from './tests/instance-css-layer.fixture'

/**
 * #4354, real Chromium: a per-instance override beats the component's own
 * `.theme()` for the same property. The override is the typed `styles` prop
 * (same keys and value shapes as `.theme()`); it renders into
 * `@layer instance`, declared after `@layer rocketstyle` (the theme). The
 * `css={css`…`}` escape hatch lands in the same layer. Cascade layers need a
 * real engine (happy-dom has none), so the file is skipped when the happy-dom
 * suite picks it up.
 */
const IS_BROWSER_RUNNER = (globalThis as Record<string, unknown>).__vitest_browser__ === true

const style = (root: ParentNode, id: string): CSSStyleDeclaration =>
  getComputedStyle(root.querySelector<HTMLElement>(`#${id}`)!)

/** Props whose `styles` is a getter, the shape the compiler's `_rp()` gives a signal-driven prop. */
const withReactiveStyles = (base: Record<string, unknown>, read: () => StyleOverride): Record<string, unknown> =>
  Object.defineProperty({ ...base }, 'styles', { get: read, enumerable: true, configurable: true })

describe.skipIf(!IS_BROWSER_RUNNER)('typed instance styles beat the component theme (real Chromium)', () => {
  let cleanup: (() => void) | undefined
  beforeAll(async () => {
    // Above the issue's 768px breakpoint. (`vitest/browser` only loads in the
    // browser runner; the happy-dom suite skips this file.)
    const { page } = await import('vitest/browser')
    await page.viewport(1024, 768)
  })
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    document.body.innerHTML = ''
  })

  it("the issue's reproduction: three columns from md, over the theme's one", () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Grid as never, { id: 'grid', styles: GRID_STYLES }, h('span', {}, 'a'), h('span', {}, 'b'))),
    )
    cleanup = unmount
    expect(window.innerWidth).toBeGreaterThan(768)
    expect(style(container, 'grid').display).toBe('grid') // the theme still applies
    expect(style(container, 'grid').gridTemplateColumns.split(' ')).toHaveLength(3)
  })

  it('a plain property the theme sets, and a unit value resolved as in a theme', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Swatch as never, { id: 'swatch', styles: SWATCH_STYLES }, 'x')),
    )
    cleanup = unmount
    expect(style(container, 'swatch').color).toBe('rgb(200, 100, 50)')
    expect(style(container, 'swatch').paddingTop).toBe('16px') // 16 → 1rem
  })

  it('without an override the theme value applies (control)', () => {
    const { container, unmount } = mountInBrowser(h(PyreonUI, { theme }, h(Swatch as never, { id: 'swatch' }, 'x')))
    cleanup = unmount
    expect(style(container, 'swatch').color).toBe('rgb(10, 20, 30)')
  })

  it('a pseudo-state the theme sets (hover group → :hover)', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(HoverSwatch as never, { id: 'hover', styles: HOVER_STYLES }, 'hover me')),
    )
    cleanup = unmount
    const node = container.querySelector<HTMLElement>('#hover')!
    expect(getComputedStyle(node).color).toBe('rgb(10, 20, 30)')
    const { userEvent } = await import('vitest/browser')
    await userEvent.hover(node)
    expect(getComputedStyle(node).color).toBe('rgb(1, 150, 2)')
  })

  it('the css escape hatch (a css`…` result) also beats the theme', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Swatch as never, { id: 'escape', css: ESCAPE_CSS }, 'x')),
    )
    cleanup = unmount
    expect(style(container, 'escape').color).toBe('rgb(5, 6, 7)')
  })

  it('unlayered author CSS still beats the instance layer', () => {
    const author = document.createElement('style')
    author.textContent = '#swatch { color: rgb(0, 0, 255); }'
    document.head.appendChild(author)
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Swatch as never, { id: 'swatch', styles: SWATCH_STYLES }, 'x')),
    )
    cleanup = () => {
      unmount()
      author.remove()
    }
    expect(style(container, 'swatch').color).toBe('rgb(0, 0, 255)')
  })

  it('a signal-driven override updates the same element (no remount)', () => {
    const cols = signal(2)
    const props = withReactiveStyles({ id: 'grid' }, () => ({
      gridTemplateColumns: { md: `repeat(${cols()}, minmax(0, 1fr))` },
    }))
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Grid as never, props, h('span', {}, 'a'), h('span', {}, 'b'))),
    )
    cleanup = unmount
    const node = container.querySelector('#grid')
    expect(style(container, 'grid').gridTemplateColumns.split(' ')).toHaveLength(2)
    cols.set(4)
    expect(container.querySelector('#grid')).toBe(node)
    expect(style(container, 'grid').gridTemplateColumns.split(' ')).toHaveLength(4)
  })

  it('the (theme, mode) callback form follows the colour mode without a remount', () => {
    const mode = signal<'light' | 'dark'>('light')
    const byMode: StylesCallback = (_t, m) => ({ color: m('rgb(1, 1, 1)', 'rgb(2, 2, 2)') })
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme, mode }, h(Swatch as never, { id: 'swatch', styles: byMode }, 'x')),
    )
    cleanup = unmount
    const node = container.querySelector('#swatch')
    expect(style(container, 'swatch').color).toBe('rgb(1, 1, 1)')
    mode.set('dark')
    expect(container.querySelector('#swatch')).toBe(node)
    expect(style(container, 'swatch').color).toBe('rgb(2, 2, 2)')
  })

  it('SSR then hydrate: no mismatch, same classes, same computed style', () => {
    // The server output, as the styler and renderToString emit it (pinned and
    // verified against a real render by instance-css-layer-ssr.test.ts).
    const ssrStyle = document.createElement('style')
    ssrStyle.textContent = SSR_CSS
    document.head.appendChild(ssrStyle)
    const host = document.createElement('div')
    host.innerHTML = SSR_HTML
    document.body.appendChild(host)

    const read = () => ({
      cols: style(host, 'grid').gridTemplateColumns.split(' ').length,
      swatch: style(host, 'swatch').color,
      escape: style(host, 'escape').color,
      grid: host.querySelector('#grid')!.className,
    })
    const beforeHydrate = read()
    expect(beforeHydrate.cols).toBe(3) // the SSR CSS alone already applies the override
    expect(beforeHydrate.swatch).toBe('rgb(200, 100, 50)')
    expect(beforeHydrate.escape).toBe('rgb(5, 6, 7)')

    const serverGrid = host.querySelector('#grid')
    const mismatches: string[] = []
    const stop = onHydrationMismatch((ctx) => mismatches.push(`${ctx.type}: ${String(ctx.expected)} vs ${String(ctx.actual)}`))
    const dispose = hydrateRoot(host, instanceCssTree())
    cleanup = () => {
      stop()
      dispose()
      ssrStyle.remove()
    }

    expect(mismatches).toEqual([])
    expect(host.querySelector('#grid')).toBe(serverGrid) // adopted, not re-created
    expect(read()).toEqual(beforeHydrate)
  })
})

import { h } from '@pyreon/core'
import { hydrateRoot, onHydrationMismatch } from '@pyreon/runtime-dom'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  GRID_CSS,
  Grid,
  HOVER_CSS,
  HoverSwatch,
  instanceCssTree,
  SSR_CSS,
  SSR_HTML,
  SWATCH_CSS,
  Swatch,
} from './tests/instance-css-layer.fixture'

/**
 * #4354, real Chromium: a per-instance `css` prop beats the component's own
 * `.theme()` for the same property. The theme is emitted into
 * `@layer rocketstyle`; the instance `css` used to share the Element's
 * `@layer elements` rule, which `@layer elements, rocketstyle` puts BELOW the
 * theme, so it lost whatever its order. It now renders into `@layer instance`,
 * declared last. Cascade layers need a real engine (happy-dom has none), so the
 * file is skipped when the happy-dom suite picks it up.
 */
const IS_BROWSER_RUNNER = (globalThis as Record<string, unknown>).__vitest_browser__ === true

const style = (root: ParentNode, id: string): CSSStyleDeclaration =>
  getComputedStyle(root.querySelector<HTMLElement>(`#${id}`)!)

describe.skipIf(!IS_BROWSER_RUNNER)('instance css beats the component theme (real Chromium)', () => {
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

  it("the issue's reproduction: three columns from 768px, over the theme's one", () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Grid as never, { id: 'grid', css: GRID_CSS }, h('span', {}, 'a'), h('span', {}, 'b'))),
    )
    cleanup = unmount
    expect(window.innerWidth).toBeGreaterThan(768)
    const cols = style(container, 'grid').gridTemplateColumns.split(' ')
    expect(style(container, 'grid').display).toBe('grid') // the theme still applies
    expect(cols).toHaveLength(3)
  })

  it('a plain property the theme sets', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Swatch as never, { id: 'swatch', css: SWATCH_CSS }, 'x')),
    )
    cleanup = unmount
    expect(style(container, 'swatch').color).toBe('rgb(200, 100, 50)')
  })

  it('without an instance css the theme value applies (control)', () => {
    const { container, unmount } = mountInBrowser(h(PyreonUI, { theme }, h(Swatch as never, { id: 'swatch' }, 'x')))
    cleanup = unmount
    expect(style(container, 'swatch').color).toBe('rgb(10, 20, 30)')
  })

  it('a pseudo-class the theme sets (:hover)', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(HoverSwatch as never, { id: 'hover', css: HOVER_CSS }, 'hover me')),
    )
    cleanup = unmount
    const node = container.querySelector<HTMLElement>('#hover')!
    expect(getComputedStyle(node).color).toBe('rgb(10, 20, 30)')
    const { userEvent } = await import('vitest/browser')
    await userEvent.hover(node)
    expect(getComputedStyle(node).color).toBe('rgb(1, 150, 2)')
  })

  it('unlayered author CSS still beats the instance layer', () => {
    const author = document.createElement('style')
    author.textContent = '#swatch { color: rgb(0, 0, 255); }'
    document.head.appendChild(author)
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Swatch as never, { id: 'swatch', css: SWATCH_CSS }, 'x')),
    )
    cleanup = () => {
      unmount()
      author.remove()
    }
    expect(style(container, 'swatch').color).toBe('rgb(0, 0, 255)')
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
      grid: host.querySelector('#grid')!.className,
    })
    const beforeHydrate = read()
    expect(beforeHydrate.cols).toBe(3) // the SSR CSS alone already applies the override
    expect(beforeHydrate.swatch).toBe('rgb(200, 100, 50)')

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

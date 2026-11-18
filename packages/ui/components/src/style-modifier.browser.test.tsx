import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { hydrateRoot, onHydrationMismatch } from '@pyreon/runtime-dom'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  BareGrid,
  BoolGrid,
  CompactCard,
  ESCAPE_CSS,
  Grid,
  HoverSwatch,
  SSR_CSS,
  SSR_HTML,
  styleModifierTree,
  Swatch,
} from './tests/style-modifier.fixture'

/**
 * Real Chromium: a one-off look is a named modifier on the component
 * (rocketstyle's `.multiple()` dimension), merged over the theme, so it beats
 * the theme (#4354) without a style prop or a cascade layer of its own. The
 * `css={css`…`}` escape hatch still lands in `@layer instance`. Computed style
 * needs a real engine (happy-dom has no cascade or media queries), so the file
 * is skipped when the happy-dom suite picks it up.
 */
const IS_BROWSER_RUNNER = (globalThis as Record<string, unknown>).__vitest_browser__ === true

const style = (root: ParentNode, id: string): CSSStyleDeclaration =>
  getComputedStyle(root.querySelector<HTMLElement>(`#${id}`)!)

const columns = (root: ParentNode, id: string): number => style(root, id).gridTemplateColumns.split(' ').length

/** Props whose `key` is a getter, the shape the compiler's `_rp()` gives a signal-driven prop. */
const withGetter = (base: Record<string, unknown>, key: string, read: () => unknown): Record<string, unknown> =>
  Object.defineProperty({ ...base }, key, { get: read, enumerable: true, configurable: true })

const cells = () => [h('span', {}, 'a'), h('span', {}, 'b'), h('span', {}, 'c')]

describe.skipIf(!IS_BROWSER_RUNNER)('style modifiers (real Chromium)', () => {
  let cleanup: (() => void) | undefined
  const mount = (...children: unknown[]) => {
    const { container, unmount } = mountInBrowser(h(PyreonUI, { theme }, ...(children as never[])))
    cleanup = unmount
    return container
  }
  const viewport = async (width: number) => {
    const { page } = await import('vitest/browser')
    await page.viewport(width, 768)
  }

  beforeAll(() => viewport(1024))
  afterEach(async () => {
    cleanup?.()
    cleanup = undefined
    document.body.innerHTML = ''
    await viewport(1024)
  })

  it("the issue's grid: three columns from md, the theme's one below md", async () => {
    // A long unbreakable word: under the theme's `minmax(0, 1fr)` the one track
    // stays the grid's width; with the value lost (`none`, what a plain deep
    // merge left below md) the implicit `auto` track grows to the word.
    const wide = h('span', {}, 'x'.repeat(400))
    const container = mount(h(Grid, { id: 'grid', multiple: ['threeUp'] }, wide, ...cells()))
    const grid = container.querySelector<HTMLElement>('#grid')!
    expect(style(container, 'grid').display).toBe('grid') // the theme still applies
    expect(columns(container, 'grid')).toBe(3)
    await viewport(600)
    expect(columns(container, 'grid')).toBe(1)
    expect(Number.parseFloat(style(container, 'grid').gridTemplateColumns)).toBeLessThanOrEqual(grid.clientWidth)
  })

  it('without the modifier the theme value applies (control)', () => {
    const container = mount(h(Grid, { id: 'grid' }, ...cells()))
    expect(columns(container, 'grid')).toBe(1)
  })

  it('a mobile-first array and a single value', async () => {
    const container = mount(h(Grid, { id: 'grid', multiple: ['stepped', 'dense'] }, ...cells()))
    expect(style(container, 'grid').paddingTop).toBe('16px')
    expect(style(container, 'grid').rowGap).toBe('2px')
    await viewport(600)
    expect(style(container, 'grid').paddingTop).toBe('0px')
  })

  it('beats the theme, and the state, size and variant the same instance has', () => {
    const container = mount(
      h(Swatch, { id: 'on', state: 'primary', size: 'large', variant: 'loud', multiple: ['accent'] }, 'x'),
      h(Swatch, { id: 'off', state: 'primary', size: 'large', variant: 'loud' }, 'x'),
    )
    expect(style(container, 'on').color).toBe('rgb(200, 100, 50)')
    expect(style(container, 'on').paddingTop).toBe('16px')
    expect(style(container, 'off').color).toBe('rgb(8, 8, 8)') // the variant, below the modifier
    expect(style(container, 'off').paddingTop).toBe('8px')
  })

  it('a pseudo group (hover) the theme also sets', async () => {
    const container = mount(h(HoverSwatch, { id: 'hover', multiple: ['hot'] }, 'hover me'))
    const node = container.querySelector<HTMLElement>('#hover')!
    expect(getComputedStyle(node).color).toBe('rgb(10, 20, 30)')
    const { userEvent } = await import('vitest/browser')
    await userEvent.hover(node)
    expect(getComputedStyle(node).color).toBe('rgb(1, 150, 2)')
  })

  it('a shipped component (Card) extended downstream beats its theme and its variant', () => {
    const container = mount(h(CompactCard, { id: 'card', variant: 'filled', multiple: ['compact'] }, 'card'))
    expect(style(container, 'card').backgroundColor).toBe('rgb(250, 240, 230)')
    expect(style(container, 'card').paddingTop).toBe('4px')
  })

  it('a bare Element-based chain (default theme bridge)', async () => {
    const container = mount(h(BareGrid, { id: 'bare', multiple: ['threeUp'] }, h('span', {}, 'x'.repeat(400)), ...cells()))
    const grid = container.querySelector<HTMLElement>('#bare')!
    expect(columns(container, 'bare')).toBe(3)
    await viewport(600)
    expect(columns(container, 'bare')).toBe(1)
    expect(Number.parseFloat(style(container, 'bare').gridTemplateColumns)).toBeLessThanOrEqual(grid.clientWidth)
  })

  it('a signal-driven modifier list swaps the class on the same node', () => {
    const compact = signal(false)
    // `multiple={['threeUp', compact() && 'dense']}`: the falsy entry is skipped
    const props = withGetter({ id: 'grid' }, 'multiple', () => ['threeUp', compact() && 'dense'])
    const container = mount(h(Grid, props, ...cells()))
    const node = container.querySelector('#grid')
    expect(style(container, 'grid').rowGap).toBe('4px')
    compact.set(true)
    expect(container.querySelector('#grid')).toBe(node)
    expect(style(container, 'grid').rowGap).toBe('2px')
    expect(columns(container, 'grid')).toBe(3)
    compact.set(false)
    expect(container.querySelector('#grid')).toBe(node)
    expect(style(container, 'grid').rowGap).toBe('4px')
  })

  it('useBooleans: a signal-driven boolean modifier (dense={compact()}) swaps the class on the same node', () => {
    const compact = signal(false)
    const props = withGetter({ id: 'bool', threeUp: true }, 'dense', () => compact())
    const container = mount(h(BoolGrid, props, ...cells()))
    const node = container.querySelector('#bool')
    expect(style(container, 'bool').rowGap).toBe('4px') // dense={false} is off
    compact.set(true)
    expect(container.querySelector('#bool')).toBe(node)
    expect(style(container, 'bool').rowGap).toBe('2px')
    compact.set(false)
    expect(style(container, 'bool').rowGap).toBe('4px')
  })

  it('the css escape hatch (a css`…` result) still beats the theme', () => {
    const container = mount(h(Swatch as never, { id: 'escape', css: ESCAPE_CSS }, 'x'))
    expect(style(container, 'escape').color).toBe('rgb(5, 6, 7)')
  })

  it('SSR then hydrate: no mismatch, same classes, same computed style', () => {
    // The server output, as the styler and renderToString emit it (pinned and
    // verified against a real render by style-modifier-ssr.test.ts).
    const ssrStyle = document.createElement('style')
    ssrStyle.textContent = SSR_CSS
    document.head.appendChild(ssrStyle)
    const host = document.createElement('div')
    host.innerHTML = SSR_HTML
    document.body.appendChild(host)

    const read = () => ({
      cols: columns(host, 'grid'),
      gap: style(host, 'grid').rowGap,
      stepped: style(host, 'stepped').paddingTop,
      swatch: style(host, 'swatch').color,
      card: style(host, 'card').backgroundColor,
      bare: columns(host, 'bare'),
      bool: style(host, 'bool').rowGap,
      escape: style(host, 'escape').color,
      classes: [...host.querySelectorAll('[id]')].map((n) => n.className),
    })
    const beforeHydrate = read()
    expect(beforeHydrate.cols).toBe(3) // the SSR CSS alone already applies the modifiers
    expect(beforeHydrate.gap).toBe('2px')
    expect(beforeHydrate.swatch).toBe('rgb(200, 100, 50)')
    expect(beforeHydrate.escape).toBe('rgb(5, 6, 7)')

    const serverGrid = host.querySelector('#grid')
    const mismatches: string[] = []
    const stop = onHydrationMismatch((ctx) => mismatches.push(`${ctx.type}: ${String(ctx.expected)} vs ${String(ctx.actual)}`))
    const dispose = hydrateRoot(host, styleModifierTree())
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

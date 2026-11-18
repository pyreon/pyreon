import { h, type VNodeChild } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { expect } from 'vitest'

/**
 * The measurement `form-controls-contrast.browser.test.tsx` applies to the form
 * controls, shared by the per-group mode-contrast suites (#4340): mount a
 * component in `<PyreonUI mode>` over the page that mode implies (white / the
 * theme's `dark.base`), composite every computed colour up the ancestor chain
 * to that page, and require
 *
 *   - BOUNDARY ≥ 3:1 (WCAG 1.4.11) where a spec names one,
 *   - GRAPHIC ≥ 3:1 for a glyph drawn in `color`,
 *   - TEXT ≥ 4.5:1 (WCAG 1.4.3) against the surface behind it,
 *   - SURFACE that sits with the page: a component that paints its own surface
 *     must paint it on the mode's side (contrast with the page < 2:1), so a
 *     white card on the dark page fails even when its inherited text happens to
 *     be legible on it.
 *
 * Only meaningful in a real CSS engine: a suite skips unless {@link realCss}.
 *
 *   afterEach(unmountModeContrast)
 *   describe.skipIf(!realCss).each(MODES)('… in %s mode', (mode) => {
 *     for (const spec of SPECS) it(spec.name, () => checkModeContrast(mode, spec))
 *   })
 */

type RGBA = [number, number, number, number]
export type Mode = 'light' | 'dark'

export const MODES: readonly Mode[] = ['light', 'dark']

const PAGE: Record<Mode, string> = {
  light: 'rgb(255, 255, 255)',
  dark: theme.color.system.dark.base,
}

function parse(c: string): RGBA {
  if (c === 'transparent') return [0, 0, 0, 0]
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) throw new Error(`unparsed colour ${c}`)
  const p = m[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)

  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]
}

const over = (top: RGBA, bottom: RGBA): RGBA => {
  const a = top[3] + bottom[3] * (1 - top[3])
  if (a === 0) return [0, 0, 0, 0]
  const ch = (i: number) => (top[i]! * top[3] + bottom[i]! * bottom[3] * (1 - top[3])) / a

  return [ch(0), ch(1), ch(2), a]
}

const lum = ([r, g, b]: RGBA) => {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export const contrast = (a: RGBA, b: RGBA) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

/** The opaque colour behind `el`'s own box: its ancestors' backgrounds composited to the page. */
function behind(el: Element): RGBA {
  const chain: RGBA[] = []
  for (let p = el.parentElement; p; p = p.parentElement) {
    chain.push(parse(getComputedStyle(p).backgroundColor))
    if (p.hasAttribute('data-page')) break
  }

  return chain.reverse().reduce<RGBA>((acc, c) => over(c, acc), [0, 0, 0, 0])
}

/** `el`'s (or its pseudo's) surface over what is behind it. */
function surface(el: Element, pseudo?: string): RGBA {
  return over(parse(getComputedStyle(el, pseudo).backgroundColor), behind(el))
}

function boundaryContrast(el: Element, pseudo?: string): number {
  const cs = getComputedStyle(el, pseudo)
  const back = behind(el)
  const fill = contrast(surface(el, pseudo), back)
  const hasBorder = Number.parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none'
  const edge = hasBorder ? contrast(over(parse(cs.borderTopColor), back), back) : 0

  return Math.max(fill, edge)
}

function textContrast(el: Element, pseudo?: string): number {
  const bg = surface(el)
  return contrast(over(parse(getComputedStyle(el, pseudo).color), bg), bg)
}

type Pick = (root: Element) => Element | null

export interface Spec {
  name: string
  render: () => VNodeChild
  /** The element that shows the component's edge (border or fill vs what is behind it), ≥ 3:1. */
  boundary?: Pick
  boundaryPseudo?: string
  /** A glyph drawn in `color` that must be seen (≥ 3:1). */
  graphic?: Pick
  graphicPseudo?: string
  /** Elements whose text must be legible (≥ 4.5:1). */
  text?: Pick | Pick[]
  /** An element that paints its own surface, which must sit with the mode's page. */
  surface?: Pick
}

export const q =
  (sel: string): Pick =>
  (root) =>
    root.querySelector(sel)

export const firstChild: Pick = (root) => root.firstElementChild

let cleanup: (() => void) | undefined

function mountIn(mode: Mode, node: VNodeChild): Element {
  const { container, unmount } = mountInBrowser(
    h(
      PyreonUI as never,
      { theme, mode },
      h('div', { 'data-page': '', style: `background:${PAGE[mode]};padding:8px` }, node),
    ),
  )
  cleanup = unmount
  return container.querySelector('[data-page]')!
}

/** False in the package's happy-dom suite, which applies no styler rules to computed style. */
export const realCss = typeof (globalThis as { happyDOM?: unknown }).happyDOM === 'undefined'

/** Mounts `spec` in `mode` and measures it. */
export function checkModeContrast(mode: Mode, spec: Spec): void {
  const root = mountIn(mode, spec.render())
  if (spec.surface) {
    const el = spec.surface(root)
    expect(el, `${spec.name}: surface element`).not.toBeNull()
    expect(contrast(surface(el!), behind(el!)), `${spec.name} surface vs page`).toBeLessThan(2)
  }
  if (spec.boundary) {
    const el = spec.boundary(root)
    expect(el, `${spec.name}: boundary element`).not.toBeNull()
    expect(boundaryContrast(el!, spec.boundaryPseudo), `${spec.name} boundary`).toBeGreaterThanOrEqual(3)
  }
  if (spec.graphic) {
    const el = spec.graphic(root)
    expect(el, `${spec.name}: graphic element`).not.toBeNull()
    const back = surface(el!)
    const ink = over(parse(getComputedStyle(el!, spec.graphicPseudo).color), back)
    expect(contrast(ink, back), `${spec.name} graphic`).toBeGreaterThanOrEqual(3)
  }
  const texts = spec.text === undefined ? [] : [spec.text].flat()
  texts.forEach((pick, i) => {
    const el = pick(root)
    expect(el, `${spec.name}: text element #${i}`).not.toBeNull()
    expect(textContrast(el!), `${spec.name} text #${i}`).toBeGreaterThanOrEqual(4.5)
  })
}

/** Unmounts what the last check mounted; register with `afterEach`. */
export function unmountModeContrast(): void {
  cleanup?.()
  cleanup = undefined
  document.body.innerHTML = ''
}

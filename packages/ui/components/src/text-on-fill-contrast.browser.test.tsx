import { h, type VNodeChild } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { brandTheme, type Theme, theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  NavLink,
  PaginationItem,
  Step,
  Stepper,
  Tab,
  TabList,
  Tabs,
  Timeline,
  TimelineItem,
  Tooltip,
  TreeItem,
} from './index'

/**
 * Text on a coloured fill, and text in a colour on a tint, measured in real
 * Chromium for every component that draws either — in the default theme and
 * the brand theme, in light and dark mode.
 *
 * Colours are read with `getComputedStyle` and composited up the ancestor
 * chain to the page the mode implies (`light.base` / `dark.base`), so a
 * translucent tint is measured the way it is painted. Each pair must reach
 * WCAG AA, 4.5:1.
 *
 * Before the theme had `contrast` / `hover` / `textDark`, these components drew
 * white on the fill (3.68:1 on the default blue, 3.06:1 on the brand's ember,
 * 2.54:1 on the default green) and used the 70–80% opacity steps as text
 * (1.7–2.7:1 on their tints).
 *
 * The file also runs in the package's happy-dom suite, which has no CSS
 * engine; there it is skipped.
 */
const IS_BROWSER_RUNNER = (globalThis as Record<string, unknown>).__vitest_browser__ === true

type Rgba = [number, number, number, number]

const parse = (value: string): Rgba => {
  const m = /rgba?\(([^)]+)\)/.exec(value)
  if (!m) return [0, 0, 0, 0]
  const [r = 0, g = 0, b = 0, a = 1] = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
  return [r, g, b, a]
}

const over = (top: Rgba, bottom: Rgba): Rgba => [
  top[0] * top[3] + bottom[0] * (1 - top[3]),
  top[1] * top[3] + bottom[1] * (1 - top[3]),
  top[2] * top[3] + bottom[2] * (1 - top[3]),
  1,
]

const luminance = ([r, g, b]: Rgba) => {
  const c = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

/** The opaque colour painted behind `el`: its own and its ancestors' backgrounds, composited. */
const backdrop = (el: Element): Rgba => {
  const layers: Rgba[] = []
  for (let node: Element | null = el; node; node = node.parentElement) {
    const bg = parse(getComputedStyle(node).backgroundColor)
    if (bg[3] > 0) layers.push(bg)
    if (bg[3] === 1) break
  }
  let painted: Rgba = [255, 255, 255, 1]
  for (let i = layers.length - 1; i >= 0; i--) painted = over(layers[i]!, painted)
  return painted
}

const mix = (a: Rgba, b: Rgba, t: number): Rgba => [
  a[0] * t + b[0] * (1 - t),
  a[1] * t + b[1] * (1 - t),
  a[2] * t + b[2] * (1 - t),
  1,
]

/** Contrast of `el`'s text on what is painted behind it, including `el`'s own `opacity`. */
const ratioOf = (el: Element) => {
  const cs = getComputedStyle(el)
  const below = el.parentElement ? backdrop(el.parentElement) : ([255, 255, 255, 1] as Rgba)
  const ownBg = over(parse(cs.backgroundColor), below)
  const ownFg = over(parse(cs.color), ownBg)
  // Group opacity fades the element's whole painting (fill and text) into what is below.
  const opacity = Number(cs.opacity)
  const bg = mix(ownBg, below, opacity)
  const fg = mix(ownFg, below, opacity)
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

interface Case {
  name: string
  /** The vnode to mount; the measured element carries `data-measure`. */
  render: () => VNodeChild
  /** Modes the component follows. Tree's selected row is light-only (its rule is a CSS string; #4340). */
  modes?: ReadonlyArray<'light' | 'dark'>
}

const M = { 'data-measure': '' }
const any = (c: unknown) => c as never

const CASES: Case[] = [
  ...(['primary', 'danger', 'success'] as const).flatMap((state) => [
    { name: `Button state=${state}`, render: () => h(any(Button), { ...M, state }, 'Save') },
    { name: `Button state=${state} (hover)`, render: () => h(any(Button), { ...M, state, hover: true }, 'Save') },
  ]),
  ...(['outline', 'subtle', 'ghost', 'link'] as const).flatMap((variant) => [
    { name: `Button variant=${variant}`, render: () => h(any(Button), { ...M, state: 'primary', variant }, 'Save') },
    {
      name: `Button variant=${variant} (hover)`,
      render: () => h(any(Button), { ...M, state: 'primary', variant, hover: true }, 'Save'),
    },
  ]),
  ...(['primary', 'danger'] as const).flatMap((state) => [
    { name: `ActionIcon state=${state}`, render: () => h(any(ActionIcon), { ...M, state }, '+') },
    { name: `ActionIcon state=${state} (hover)`, render: () => h(any(ActionIcon), { ...M, state, hover: true }, '+') },
  ]),
  ...(['outline', 'subtle'] as const).map((variant) => ({
    name: `ActionIcon variant=${variant}`,
    render: () => h(any(ActionIcon), { ...M, state: 'primary', variant }, '+'),
  })),
  { name: 'PaginationItem state=active', render: () => h(any(PaginationItem), { ...M, state: 'active' }, '2') },
  {
    name: 'PaginationItem state=active (hover)',
    render: () => h(any(PaginationItem), { ...M, state: 'active', hover: true }, '2'),
  },
  ...(['line', 'pills'] as const).map((variant) => ({
    name: `Tab variant=${variant}, selected`,
    render: () =>
      h(any(Tabs), { defaultValue: 'a' }, [
        h(any(TabList), { 'aria-label': 'Sections' }, [
          h(any(Tab), { ...M, value: 'a', variant, active: true }, 'Overview'),
          h(any(Tab), { value: 'b', variant }, 'API'),
        ]),
      ]),
  })),
  ...(['active', 'completed'] as const).map((state) => ({
    name: `Step state=${state}`,
    render: () => h(any(Stepper), {}, [h(any(Step), { ...M, state }, 'Payment')]),
  })),
  ...(['info', 'success', 'warning', 'error'] as const).map((state) => ({
    name: `Alert state=${state}`,
    render: () => h(any(Alert), { ...M, state }, 'Your changes are live.'),
  })),
  { name: 'Alert variant=solid', render: () => h(any(Alert), { ...M, state: 'info', variant: 'solid' }, 'New version') },
  ...(['primary', 'success', 'error', 'warning'] as const).map((state) => ({
    name: `Badge state=${state}`,
    render: () => h(any(Badge), { ...M, state }, 'New'),
  })),
  ...(['outline', 'subtle'] as const).map((variant) => ({
    name: `Badge variant=${variant}`,
    render: () => h(any(Badge), { ...M, state: 'primary', variant }, 'New'),
  })),
  { name: 'Tooltip', render: () => h(any(Tooltip), { ...M }, 'Copied to clipboard') },
  { name: 'NavLink state=active', render: () => h(any(NavLink), { ...M, state: 'active' }, 'Settings') },
  {
    name: 'TreeItem state=selected',
    render: () => h(any(TreeItem), { ...M, state: 'selected' }, 'src'),
    modes: ['light'],
  },
]

const THEMES: ReadonlyArray<readonly [string, Theme]> = [
  ['default theme', theme],
  ['brand theme', brandTheme],
]

const mount = (t: Theme, mode: 'light' | 'dark', child: VNodeChild) => {
  const page = mode === 'light' ? t.color.system.light.base : t.color.system.dark.base
  return mountInBrowser(
    h(PyreonUI, { theme: t, mode }, h('div', { style: `background-color: ${page}; padding: 8px;` }, child)),
  )
}

describe.runIf(IS_BROWSER_RUNNER)('text on fills and tints reaches 4.5:1 (real Chromium)', () => {
  for (const [label, t] of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      describe(`${label}, ${mode} mode`, () => {
        for (const c of CASES) {
          if (c.modes && !c.modes.includes(mode)) continue
          it(c.name, () => {
            const { container, unmount } = mount(t, mode, c.render())
            const el = container.querySelector('[data-measure]')
            expect(el, `${c.name} rendered no [data-measure] element`).not.toBeNull()
            const ratio = ratioOf(el!)
            expect(ratio, `${c.name}: ${getComputedStyle(el!).color} on ${getComputedStyle(el!).backgroundColor}`).toBeGreaterThanOrEqual(4.5)
            unmount()
          })
        }
      })
    }
  }

  it('Timeline: the completed check reads success.contrast', () => {
    const { container, unmount } = mount(
      theme,
      'light',
      h(any(Timeline), {}, [h(any(TimelineItem), { state: 'completed', 'data-measure': '' }, 'Shipped')]),
    )
    const el = container.querySelector('[data-measure]')!
    const check = getComputedStyle(el, '::before')
    expect(check.content).toBe('"✓"')
    expect(check.color).toBe('rgb(15, 23, 42)')
    unmount()
  })

  it('a primary Button paints the theme tokens: ink on ember (brand), dark text on blue (default), in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const brand = mount(brandTheme, mode, h(any(Button), { state: 'primary', 'data-measure': '' }, 'Save'))
      const b = getComputedStyle(brand.container.querySelector('[data-measure]')!)
      expect(b.backgroundColor, `brand ${mode}`).toBe('rgb(255, 94, 26)')
      expect(b.color, `brand ${mode}`).toBe('rgb(10, 10, 14)')
      brand.unmount()

      const stock = mount(theme, mode, h(any(Button), { state: 'primary', 'data-measure': '' }, 'Save'))
      const s = getComputedStyle(stock.container.querySelector('[data-measure]')!)
      expect(s.backgroundColor, `default ${mode}`).toBe('rgb(59, 130, 246)')
      expect(s.color, `default ${mode}`).toBe('rgb(15, 23, 42)')
      stock.unmount()
    }
  })

  it('text in a tone follows the mode: ember text is #A8380A on the light page and #FF8A4C on the dark one', () => {
    const light = mount(brandTheme, 'light', h(any(Button), { state: 'primary', variant: 'ghost', 'data-measure': '' }, 'More'))
    expect(getComputedStyle(light.container.querySelector('[data-measure]')!).color).toBe('rgb(168, 56, 10)')
    light.unmount()
    const dark = mount(brandTheme, 'dark', h(any(Button), { state: 'primary', variant: 'ghost', 'data-measure': '' }, 'More'))
    expect(getComputedStyle(dark.container.querySelector('[data-measure]')!).color).toBe('rgb(255, 138, 76)')
    dark.unmount()
  })
})

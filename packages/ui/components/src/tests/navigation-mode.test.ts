import { h, type VNodeChild } from '@pyreon/core'
import { brandTheme, type Theme, theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Breadcrumb,
  BreadcrumbItem,
  NavLink,
  PaginationEllipsis,
  PaginationItem,
  Step,
  Stepper,
  Tab,
  TabList,
  Tabs,
  Timeline,
  TimelineItem,
} from '../index'
import { recordEmittedStyles, renderStyles } from './resolved-styles'

/**
 * Navigation and disclosure components follow the `<PyreonUI>` mode (#4340),
 * asserted on the CSS each emits, through the real `h()` under
 * `<PyreonUI theme mode>`.
 *
 * `navigation-mode-contrast.browser.test.tsx` measures the same components'
 * contrast in real Chromium; this is its node counterpart. Each text colour
 * must come from the mode-aware tones (`tones(t, m)` in `bases/tones.ts`):
 * slate text on the light page, light text on the dark page. The light-only
 * palette steps these components used before (`base[500]`, `base[700]`,
 * `dark[800]`) are asserted absent in dark mode, where they were illegible.
 */

recordEmittedStyles()

type Mode = 'light' | 'dark'

const THEMES: ReadonlyArray<readonly [string, Theme]> = [
  ['default theme', theme],
  ['brand theme', brandTheme],
]

const MODES: readonly Mode[] = ['light', 'dark']

const M = { 'data-measure': '' }

/** `tones(t, m).text`: primary text on the mode's page. */
const text = (t: Theme, mode: Mode) => (mode === 'light' ? t.color.system.dark[800] : t.color.system.light[900])
/** `tones(t, m).textMuted`: secondary text on the mode's page. */
const muted = (t: Theme, mode: Mode) => (mode === 'light' ? t.color.system.dark[700] : t.color.system.light[700])
/** The mode's page colour. */
const page = (t: Theme, mode: Mode) => (mode === 'light' ? t.color.system.light.base : t.color.system.dark.base)

const el = (component: unknown, props: Record<string, unknown> | null, children?: VNodeChild) =>
  h(component as never, props as never, children)

const tabs = (variant: 'line' | 'enclosed' | 'pills', measured: 'a' | 'b') =>
  el(Tabs, { defaultValue: 'a', variant }, [
    el(TabList, { 'aria-label': 'Sections' }, [
      el(Tab, { value: 'a', variant, ...(measured === 'a' ? M : {}) }, 'Overview'),
      el(Tab, { value: 'b', variant, ...(measured === 'b' ? M : {}) }, 'API'),
    ]),
  ])

for (const [themeLabel, t] of THEMES) {
  for (const mode of MODES) {
    describe(`${themeLabel}, ${mode} mode`, () => {
      const r = (node: VNodeChild) => renderStyles(node, t, mode)

      describe('Tab', () => {
        it('an unselected tab is muted text, full text on hover', () => {
          const s = r(tabs('line', 'b'))
          expect(s.base.color).toBe(muted(t, mode))
          expect(s.nested['&:hover']?.color).toBe(text(t, mode))
        })

        it('a selected enclosed tab is filled with the page colour, so it joins the panel', () => {
          const s = r(tabs('enclosed', 'a'))
          const selected = Object.entries(s.nested).find(([selector]) => selector.includes('aria-selected'))
          expect(selected, `no selected-tab block in ${Object.keys(s.nested).join(' | ')}`).toBeDefined()
          expect(selected?.[1]['background-color']).toBe(page(t, mode))
        })
      })

      describe('Accordion', () => {
        const accordion = (measured: 'trigger' | 'content') =>
          el(
            Accordion,
            { defaultValue: 'a' },
            el(AccordionItem, { value: 'a' }, [
              el(AccordionTrigger, measured === 'trigger' ? M : null, 'Shipping'),
              el(AccordionContent, measured === 'content' ? M : null, 'Ships in two days.'),
            ]),
          )

        it('the trigger is primary text', () => {
          expect(r(accordion('trigger')).base.color).toBe(text(t, mode))
        })

        it('the content is muted text', () => {
          expect(r(accordion('content')).base.color).toBe(muted(t, mode))
        })
      })

      it('NavLink is muted text', () => {
        expect(r(el(NavLink, M, 'Settings')).base.color).toBe(muted(t, mode))
      })

      it('BreadcrumbItem is muted text, full text on hover and when current', () => {
        const s = r(el(Breadcrumb, {}, [el(BreadcrumbItem, M, 'Home')]))
        expect(s.base.color).toBe(muted(t, mode))
        expect(s.nested['&:hover']?.color).toBe(text(t, mode))
        expect(s.nested['&:active']?.color).toBe(text(t, mode))
      })

      it('PaginationItem is primary text; PaginationEllipsis is muted', () => {
        expect(r(el(PaginationItem, M, '3')).base.color).toBe(text(t, mode))
        expect(r(el(PaginationEllipsis, M, '…')).base.color).toBe(muted(t, mode))
      })

      it('Step is muted text; state=default is primary text on its chip', () => {
        expect(r(el(Stepper, {}, el(Step, M, 'Shipping'))).base.color).toBe(muted(t, mode))
        expect(r(el(Stepper, {}, el(Step, { ...M, state: 'default' }, 'Shipping'))).base.color).toBe(text(t, mode))
      })

      describe('TimelineItem marker', () => {
        const marker = (state?: 'active' | 'completed') =>
          r(el(Timeline, {}, el(TimelineItem, { ...M, ...(state ? { state } : {}) }, 'Shipped'))).nested['&::before']

        it('no state: the neutral dot, ringed in the page colour', () => {
          const m = marker()
          expect(m?.background).toBe(t.color.system.base[300])
          expect(m?.border).toBe(`2px solid ${page(t, mode)}`)
          expect(m?.content).toBe("''")
        })

        it('state=active: the primary dot, ringed in the page colour', () => {
          const m = marker('active')
          expect(m?.background).toBe(t.color.system.primary.base)
          expect(m?.border).toBe(`2px solid ${page(t, mode)}`)
        })

        it('state=completed: the ✓ glyph on the success fill', () => {
          const m = marker('completed')
          expect(m?.content).toBe("'✓'")
          expect(m?.background).toBe(t.color.system.success.base)
          expect(m?.color).toBe(t.color.system.success.contrast)
        })
      })
    })
  }
}

describe('light and dark differ where the mode matters', () => {
  const both = (node: () => VNodeChild) => MODES.map((mode) => renderStyles(node(), theme, mode))

  it('text colours change with the mode and dark mode drops the light-only palette', () => {
    const [light, dark] = both(() => el(NavLink, M, 'Settings'))
    expect(light!.base.color).not.toBe(dark!.base.color)
    expect(dark!.base.color).not.toBe(theme.color.system.base[700])
  })

  it('the Timeline marker ring changes with the mode (a white ring showed on the dark page)', () => {
    const [light, dark] = both(() => el(Timeline, {}, el(TimelineItem, M, 'Shipped')))
    expect(light!.nested['&::before']?.border).not.toBe(dark!.nested['&::before']?.border)
    expect(dark!.nested['&::before']?.border).not.toContain(theme.color.system.light.base)
  })
})

describe('TimelineItem marker keys a consumer overrides', () => {
  it("a marker colour that is not a string draws no colour, not 'undefined' or '[object Object]'", () => {
    const Custom = (TimelineItem as unknown as { theme: (cb: () => Record<string, unknown>) => unknown }).theme(() => ({
      markerRing: { light: 'red' },
    }))
    const before = renderStyles(el(Timeline, {}, el(Custom, M, 'Shipped')), theme, 'light').nested['&::before']
    expect(before?.border).toBe('2px solid')
    expect(before?.background).toBe(theme.color.system.base[300])
  })
})

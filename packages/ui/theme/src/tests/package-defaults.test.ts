import type { ChartTheme } from '@pyreon/charts'
import { chartThemes, resolveChartTheme } from '@pyreon/charts/engine'
import { Document, Heading, Page, render } from '@pyreon/document'
import { type BackgroundProps, flowStyles } from '@pyreon/flow'
import type { ToasterProps } from '@pyreon/toast'
import { describe, expect, it } from 'vitest'
import { brandPackageDefaults } from '../package-defaults'

/**
 * Each brand package default is fed to the real package API it targets. The
 * type annotations are part of the test: a renamed option or a narrowed type
 * fails `tsc` here.
 */
describe('brandPackageDefaults', () => {
  it('charts: the palette and axis colour override the built-in theme per mode', () => {
    for (const mode of ['light', 'dark'] as const) {
      const override: Partial<ChartTheme> = brandPackageDefaults.charts[mode]
      const resolved = resolveChartTheme(chartThemes[mode], override)
      expect(resolved.palette).toEqual(brandPackageDefaults.charts[mode].palette)
      expect(resolved.axis).toBe(brandPackageDefaults.charts[mode].axis)
      // Everything else stays the built-in theme for that mode.
      expect(resolved.background).toBe(chartThemes[mode].background)
    }
    expect(brandPackageDefaults.charts.dark.palette).toHaveLength(6)
    expect(brandPackageDefaults.charts.light.palette).toHaveLength(6)
  })

  it('toast: the defaults are Toaster props', () => {
    const props: ToasterProps = { ...brandPackageDefaults.toast }
    expect(props.max).toBe(3)
  })

  it('flow: every custom property the style sets is one Flow defines for its colour modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const names = [...brandPackageDefaults.flow.style[mode].matchAll(/(--pyreon-flow-[a-z-]+):/g)].map((m) => m[1]!)
      expect(names.length).toBeGreaterThan(0)
      // Flow's dark-mode block declares every variable it reads.
      for (const name of names) expect(flowStyles, `${name} is not a Flow variable`).toContain(`${name}:`)
    }
    const background: BackgroundProps = { ...brandPackageDefaults.flow.background }
    expect(background).toEqual({ variant: 'dots', gap: 14 })
  })

  it('document: the HTML renderer paints the paper page and serif headings', async () => {
    const doc = Document({ children: Page({ children: Heading({ children: 'Q4 report' }) }) })
    const html = await render(doc, 'html', { styles: brandPackageDefaults.document.styles })
    expect(typeof html).toBe('string')
    const out = String(html)
    expect(out).toMatch(/background-color:\s*#FFFCF5/i)
    expect(out).toMatch(/color:\s*#14141C/i)
    expect(out).toContain('Georgia, serif')
  })
})

import { expect, test } from '@playwright/test'
import { waitForHydration } from '../hydration-barrier'

/**
 * The playground's rich-text editor painted its text dark on its dark box
 * (#4268): the demo gave `<RichText>` a `#1e1e1e` background but no text
 * colour, and `@pyreon/rich-text` deliberately inherits colour (like
 * ProseMirror), so the editor took the page's near-black text.
 *
 * Measures, in the running app, the editor's paragraph text against the
 * editor's own background: ≥ 4.5:1 (WCAG 1.4.3).
 */

type RGBA = [number, number, number, number]

test('rich-text editor text is legible on its background', async ({ page }) => {
  await page.goto('/rich-text')
  await waitForHydration(page)
  const paragraph = page.locator('.pyreon-rich-text p').first()
  await expect(paragraph).toBeVisible()

  const { text, background } = await paragraph.evaluate((el) => {
    let bg = 'rgba(0, 0, 0, 0)'
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor
      if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
        bg = c
        break
      }
    }
    return { text: getComputedStyle(el).color, background: bg }
  })

  const parse = (c: string): RGBA => {
    const p = c.match(/rgba?\(([^)]+)\)/)![1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]
  }
  const lum = ([r, g, b]: RGBA) => {
    const f = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const [hi, lo] = [lum(parse(text)), lum(parse(background))].sort((a, b) => b - a) as [number, number]
  const ratio = (hi + 0.05) / (lo + 0.05)
  expect(ratio, `text ${text} on ${background}`).toBeGreaterThanOrEqual(4.5)
})

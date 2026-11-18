import { expect, test } from '@playwright/test'
import { waitForHydration } from '../hydration-barrier'

/**
 * The playground sidebar rendered raw blue, underlined links on its navy
 * background (#4268): `style.css` styled `.sidebar button`, but the layout's
 * nav items are `RouterLink` anchors, so no rule reached them.
 *
 * Measures every sidebar link's text against the sidebar background, idle and
 * active: ≥ 4.5:1 (WCAG 1.4.3), and no default link underline.
 */

type RGBA = [number, number, number, number]

const parse = (c: string): RGBA => {
  const p = c.match(/rgba?\(([^)]+)\)/)![1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]
}
const lum = ([r, g, b]: RGBA): number => {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
/** Composite a translucent foreground over an opaque background. */
const over = ([r, g, b, a]: RGBA, [br, bg, bb]: RGBA): RGBA => [
  r * a + br * (1 - a),
  g * a + bg * (1 - a),
  b * a + bb * (1 - a),
  1,
]
const contrast = (a: RGBA, b: RGBA): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

test('sidebar links are styled and legible on the sidebar background', async ({ page }) => {
  await page.goto('/store')
  await waitForHydration(page)
  const links = page.locator('nav.sidebar a')
  await expect(links.first()).toBeVisible()
  // The links carry a colour transition; measure the settled colours, not a
  // frame of the fade-in from the stylesheet arriving.
  await page.waitForFunction(() => document.getAnimations().length === 0)

  const sidebarBg = parse(
    await page.locator('nav.sidebar').evaluate((el) => getComputedStyle(el).backgroundColor),
  )
  const styles = await links.evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el)
      return {
        text: el.textContent ?? '',
        color: cs.color,
        background: cs.backgroundColor,
        decoration: cs.textDecorationLine,
        active: el.classList.contains('active'),
      }
    }),
  )
  expect(styles.length).toBeGreaterThan(10)
  expect(styles.filter((s) => s.active).map((s) => s.text)).toEqual(['Store'])

  for (const s of styles) {
    const bg = over(parse(s.background), sidebarBg)
    const fg = over(parse(s.color), bg)
    expect(contrast(fg, bg), `${s.text}: ${s.color} on ${s.background}`).toBeGreaterThanOrEqual(4.5)
    expect(s.decoration, s.text).toBe('none')
  }
})

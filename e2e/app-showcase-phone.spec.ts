import { expect, test } from '@playwright/test'
import { sections } from '../examples/app-showcase/src/sections'

/**
 * Phone width (#4268): the shell's fixed 240px sidebar left a 390px phone
 * 150px for the page, and the sections' two-column layouts (220px / 380px side
 * columns) pushed the rest off screen. Every page must fit the viewport — no
 * horizontal page scroll. Wide content that is MEANT to scroll (a data table,
 * the flow canvas) does so inside its own container, which this does not count.
 */

test.use({ viewport: { width: 390, height: 844 } })

const paths = ['/', ...sections.filter((s) => s.available).map((s) => s.path)]

for (const path of paths) {
  test(`${path} fits a 390px viewport`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
  })

  // Font metrics differ per platform: CI's Linux fonts run wider than a Mac's,
  // and `/dashboard` and `/resume` overflowed there by 15-25px while passing
  // locally. Widening the text here makes that class fail on every machine.
  test(`${path} fits a 390px viewport with wider text`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.addStyleTag({
      content: '* { font-family: "Courier New", monospace !important; letter-spacing: 0.06em !important; }',
    })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(0)
  })
}

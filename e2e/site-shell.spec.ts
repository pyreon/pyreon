import { expect, type Page, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { waitForHydration } from './hydration-barrier'

/**
 * pyreon.dev marketing shell, against the production SSG build (served like
 * pyreon.dev by e2e-configs/docs.config.ts): the nav and its two menus, the
 * mobile sheet, the theme toggle (persisted, no flash), page width at the
 * five design widths, hydration adopting the server DOM, and the contrast of
 * every text node on the kit gallery in both themes.
 */
const WIDTHS = [320, 390, 768, 1024, 1440]
const ROUTES = ['/', '/products', '/products/form', '/products/reactivity', '/products/a11y', '/brand/kit', '/blog', '/showcase', '/open']

/** Records element nodes removed from #app during load: hydration that adopts the server DOM removes none. */
async function trackRemovals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __removed: number }
    w.__removed = 0
    new MutationObserver((list) => {
      for (const m of list) {
        if ((m.target as Element).closest?.('head')) continue
        for (const n of m.removedNodes) if (n.nodeType === 1) w.__removed++
      }
    }).observe(document, { childList: true, subtree: true })
  })
}

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && /hydrat|mismatch|\[Pyreon\]/i.test(m.text()))) errors.push(m.text())
  })
  return errors
}

test.describe('build output', () => {
  test('the new routes are prerendered', () => {
    const dist = resolve(__dirname, '../docs/dist')
    for (const p of ['products/index.html', 'products/form/index.html', 'products/reactivity/index.html', 'products/a11y/index.html', 'brand/kit/index.html', 'brand/glyphs.svg', '404.html']) {
      expect(existsSync(resolve(dist, p)), p).toBe(true)
    }
  })
})

test.describe('hydration', () => {
  // The new pages adopt the server DOM: no element is removed on hydration.
  for (const route of ['/products', '/products/form', '/brand/kit']) {
    test(`${route} hydrates in place with no errors`, async ({ page }) => {
      await trackRemovals(page)
      const errors = collectErrors(page)
      await page.goto(route)
      await waitForHydration(page)
      await page.waitForTimeout(300)
      expect(errors).toEqual([])
      expect(await page.evaluate(() => (window as unknown as { __removed: number }).__removed)).toBe(0)
    })
  }
  // Pages whose content predates the redesign: no errors. (The old landing
  // re-creates its last section on hydration and the blog index its header
  // while no post is published (#4353); both are tracked outside this spec.)
  for (const route of ['/', '/blog', '/showcase', '/open', '/discord', '/newsletter']) {
    test(`${route} hydrates with no errors`, async ({ page }) => {
      const errors = collectErrors(page)
      await page.goto(route)
      await waitForHydration(page)
      await page.waitForTimeout(300)
      expect(errors).toEqual([])
    })
  }
})

test.describe('no horizontal page scroll', () => {
  for (const width of WIDTHS) {
    test(`at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const route of ROUTES) {
        await page.goto(route)
        await waitForHydration(page)
        const r = await page.evaluate(() => {
          const cw = document.documentElement.clientWidth
          const main = document.querySelector('#site-main') ?? document.body
          // Content wider than the page, outside its own scroll container,
          // ignoring decorative absolutely-positioned glows.
          const offenders = [...main.querySelectorAll<HTMLElement>('*')].filter((e) => {
            const box = e.getBoundingClientRect()
            if (box.width === 0 || box.right <= cw + 1) return false
            for (let n: HTMLElement | null = e; n && n !== main; n = n.parentElement) {
              const cs = getComputedStyle(n)
              if (cs.position === 'absolute' || cs.position === 'fixed') return false
              if (n !== e && /auto|scroll|hidden|clip/.test(cs.overflowX) && n.getBoundingClientRect().right <= cw + 1) return false
            }
            return true
          })
          return { scroll: document.documentElement.scrollWidth - cw, offenders: offenders.slice(0, 3).map((e) => `${e.tagName}.${e.className}`) }
        })
        expect(r.scroll, `${route} scrollWidth`).toBeLessThanOrEqual(0)
        expect(r.offenders, `${route} content wider than the page`).toEqual([])
      }
    })
  }
})

test.describe('Products and Why menus (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('open by keyboard, links follow in tab order, Escape returns focus', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    const button = page.locator('[aria-controls=site-products-menu]')
    await button.focus()
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#site-products-menu')).toBeHidden()
    await page.keyboard.press('Enter')
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#site-products-menu')).toBeVisible()
    await expect(page.locator('#site-products-menu a[href^="/products/"]')).toHaveCount(40)
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toHaveAttribute('href', '/products/zero')
    await page.keyboard.press('Escape')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(button).toBeFocused()
  })

  test('one menu at a time; click outside closes', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await page.click('[aria-controls=site-products-menu]')
    await page.click('[aria-controls=site-why-menu]')
    await expect(page.locator('#site-products-menu')).toBeHidden()
    await expect(page.locator('#site-why-menu')).toBeVisible()
    await page.mouse.click(700, 700)
    await expect(page.locator('#site-why-menu')).toBeHidden()
  })

  test('a menu link navigates client-side and closes the menu', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await page.click('[aria-controls=site-products-menu]')
    await page.click('#site-products-menu a[href="/products/form"]')
    await expect(page).toHaveURL(/\/products\/form$/)
    await expect(page.locator('#site-products-menu')).toBeHidden()
    await expect(page.locator('h1')).toContainText('field')
  })
})

test.describe('mobile sheet', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('focus moves in, stays in the header, Escape returns it; the page behind is inert', async ({ page }) => {
    await page.goto('/products/form')
    await waitForHydration(page)
    await expect(page.locator('nav[aria-label=Primary]')).toBeHidden()
    const button = page.getByTestId('menu-button')
    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#site-sheet')).toBeVisible()
    await expect(page.locator('#site-sheet a').first()).toBeFocused()
    expect(await page.evaluate(() => (document.querySelector('#site-main') as HTMLElement).inert)).toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')
    await expect(page.locator('#site-sheet a[href^="/products/"]')).toHaveCount(40)
    for (let i = 0; i < 70; i++) await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('header'))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.locator('#site-sheet')).toBeHidden()
    await expect(button).toBeFocused()
    expect(await page.evaluate(() => (document.querySelector('#site-main') as HTMLElement).inert)).toBe(false)
  })

  test('the first link is reachable at the top of the sheet', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await page.getByTestId('menu-button').click()
    const first = page.locator('#site-sheet a').first()
    const box = await first.boundingBox()
    expect(box && box.y).toBeGreaterThan(60)
    expect(box && box.y).toBeLessThan(200)
  })
})

test.describe('theme', () => {
  test('follows the OS, the toggle persists, and the stored choice is applied before first paint', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' })
    const page = await ctx.newPage()
    await page.goto('/')
    await waitForHydration(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByTestId('theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await page.evaluate(() => localStorage.getItem('pyreon-theme'))).toBe('dark')
    // A fresh load: record the attribute at the first moment the body exists.
    await page.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        ;(window as unknown as { __first?: string | null }).__first ??= document.documentElement.getAttribute('data-theme')
      })
    })
    await page.goto('/products/form')
    expect(await page.evaluate(() => (window as unknown as { __first?: string }).__first)).toBe('dark')
    await waitForHydration(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#site-main')!.parentElement!).backgroundColor)
    expect(bg).toBe('rgb(10, 10, 14)')
    await ctx.close()
  })
})

test.describe('contrast on the kit gallery', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`every text node passes WCAG AA (${theme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await page.goto('/brand/kit')
      await waitForHydration(page)
      // Reveal everything (scroll-reveal sections start transparent).
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 40))
        }
      })
      await page.waitForTimeout(1200)
      const failures = await page.evaluate(() => {
        const parse = (c: string) => {
          const m = c.match(/rgba?\(([^)]+)\)/)
          if (!m) return null
          const [r, g, b, a = '1'] = m[1]!.split(/[ ,/]+/).filter(Boolean)
          return [Number(r), Number(g), Number(b), Number(a)] as const
        }
        const lum = ([r, g, b]: readonly number[]) => {
          const f = (v: number) => {
            const c = v / 255
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
        }
        // Effective background: walk up, compositing translucent fills; skip
        // elements whose text is painted with a gradient (background-clip:text).
        const bgOf = (el: Element): number[] | null => {
          const layers: (readonly number[])[] = []
          for (let n: Element | null = el; n; n = n.parentElement) {
            const cs = getComputedStyle(n)
            if (cs.backgroundImage !== 'none' && !/gradient\(/.test(cs.backgroundImage)) return null
            if (/gradient\(/.test(cs.backgroundImage) && cs.backgroundClip !== 'text') return null
            const c = parse(cs.backgroundColor)
            if (c && c[3] > 0) {
              layers.push(c)
              if (c[3] >= 1) break
            }
          }
          let out = [255, 255, 255]
          for (const l of layers.reverse()) out = out.map((v, i) => l[i]! * l[3]! + v * (1 - l[3]!))
          return out
        }
        const bad: string[] = []
        const walker = document.createTreeWalker(document.querySelector('#site-main')!, NodeFilter.SHOW_TEXT)
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const text = t.textContent?.trim()
          const el = t.parentElement
          if (!text || !el) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[aria-hidden=true]')) continue
          if (cs.backgroundClip === 'text' || el.closest('svg')) continue
          const box = el.getBoundingClientRect()
          if (box.width < 2 || box.height < 2) continue
          const fg = parse(cs.color)
          const bg = bgOf(el)
          if (!fg || !bg || fg[3] < 0.5) continue
          const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number]
          const ratio = (a + 0.05) / (b + 0.05)
          const size = Number.parseFloat(cs.fontSize)
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
          if (ratio < (large ? 3 : 4.5)) bad.push(`${ratio.toFixed(2)} "${text.slice(0, 30)}" ${cs.color} on rgb(${bg.map(Math.round)})`)
        }
        return bad
      })
      expect(failures).toEqual([])
      await ctx.close()
    })
  }
})

import { expect, type Page, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { waitForHydration } from './hydration-barrier'

/**
 * The app-building-blocks and visual-and-tools product pages (twenty), against
 * the production SSG build: prerendered with their share tags and hero visual,
 * hydration adopts the server DOM with no console errors, no horizontal page
 * scroll at the five design widths, the demo island hydrates when scrolled to
 * (and heavy packages load only then), and every text node in the hero and the
 * demo passes WCAG AA in both themes. Per-demo interaction (keyboard and
 * pointer) lives in site-products-b-*.spec.ts.
 */
const APP = ['feature', 'i18n', 'permissions', 'urlstate', 'hotkeys', 'rx', 'dnd', 'toast', 'table', 'virtual']
const TOOLS = ['charts', 'editor', 'flow', 'document', 'atlas', 'lathe', 'loom', 'tooling', 'ai', 'migrate']
const IDS = [...APP, ...TOOLS]
const WIDTHS = [320, 390, 768, 1024, 1440]
/** Chunks of a heavy package, matched in a script URL. */
const HEAVY: Record<string, RegExp> = {
  charts: /charts/i,
  flow: /flow/i,
  editor: /tiptap|prosemirror|codemirror|rich-text/i,
  document: /document|pdf/i,
  table: /table/i,
  virtual: /virtual/i,
}

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
    // trackRemovals' init script also runs in the document demo's sandboxed preview frame, which
    // blocks it (sandbox="" has no allow-scripts): that message is about this test's own script.
    if (/^Blocked script execution in 'about:(blank|srcdoc)'/.test(m.text())) return
    if (m.type() === 'error' || (m.type() === 'warning' && /hydrat|mismatch|\[Pyreon\]/i.test(m.text()))) errors.push(m.text())
  })
  return errors
}

test.describe('build output', () => {
  const dist = resolve(__dirname, '../docs/dist')
  for (const id of IDS) {
    test(`/products/${id} is prerendered with share tags, a hero visual and its demo`, () => {
      const file = resolve(dist, `products/${id}/index.html`)
      expect(existsSync(file)).toBe(true)
      const html = readFileSync(file, 'utf8')
      expect(html).toContain(`<link rel="canonical" href="https://pyreon.dev/products/${id}"`)
      expect(html).toMatch(new RegExp(`property="og:image" content="https://pyreon.dev/assets/og/products/${id}.png"`))
      expect(html).toContain('name="twitter:card" content="summary_large_image"')
      expect(html).toMatch(new RegExp(`/assets/products/${id}/hero[.-]`))
      expect(html).toMatch(/<pyreon-island[^>]*data-component="Demo/)
      expect(existsSync(resolve(dist, `assets/og/products/${id}.png`))).toBe(true)
    })
  }
  test('the sitemap lists every page', () => {
    const sitemap = readFileSync(resolve(dist, 'sitemap.xml'), 'utf8')
    for (const id of IDS) expect(sitemap).toContain(`https://pyreon.dev/products/${id}<`)
  })
})

test.describe('hydration and the demo island', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  for (const id of IDS) {
    test(`/products/${id}: adopts the server DOM, hydrates its demo on scroll, no errors`, async ({ page }) => {
      await trackRemovals(page)
      const errors = collectErrors(page)
      const scripts: string[] = []
      page.on('request', (r) => {
        if (r.resourceType() === 'script') scripts.push(r.url())
      })
      await page.goto(`/products/${id}`)
      await waitForHydration(page)
      await page.waitForTimeout(300)
      expect(await page.evaluate(() => (window as unknown as { __removed: number }).__removed)).toBe(0)
      const heavy = HEAVY[id]
      if (heavy) expect(scripts.filter((u) => heavy.test(u)), 'heavy package before the demo is near').toEqual([])
      const island = page.locator('#demo pyreon-island')
      await island.scrollIntoViewIfNeeded()
      await expect(island.locator('button, input, [tabindex="0"], select, iframe, canvas').first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      if (heavy) expect(scripts.some((u) => heavy.test(u)), 'heavy package loads with its demo').toBe(true)
      expect(errors).toEqual([])
    })
  }

  test('no other page requests a heavy package', async ({ page }) => {
    const scripts: string[] = []
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url())
    })
    for (const route of ['/', '/products', '/products/form', '/products/i18n', '/products/ai']) {
      await page.goto(route)
      await waitForHydration(page)
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 60))
        }
      })
      await page.waitForLoadState('networkidle')
    }
    const all = Object.values(HEAVY)
    expect(scripts.filter((u) => all.some((re) => re.test(u)))).toEqual([])
  })
})

test.describe('no horizontal page scroll', () => {
  for (const width of WIDTHS) {
    test(`at ${width}px`, async ({ page }) => {
      test.setTimeout(240_000)
      await page.setViewportSize({ width, height: 900 })
      for (const id of IDS) {
        await page.goto(`/products/${id}`)
        await waitForHydration(page)
        await page.locator('#demo').scrollIntoViewIfNeeded()
        await page.waitForTimeout(600)
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(over, `/products/${id} at ${width}px`).toBeLessThanOrEqual(0)
      }
    })
  }
})

test.describe('contrast in the hero and the demo', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`every text node passes WCAG AA (${theme})`, async ({ browser }) => {
      test.setTimeout(240_000)
      const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      const failures: string[] = []
      for (const id of IDS) {
        await page.goto(`/products/${id}`)
        await waitForHydration(page)
        await page.locator('#demo').scrollIntoViewIfNeeded()
        await page.waitForTimeout(1500)
        const bad = await page.evaluate(() => {
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
          const out: string[] = []
          const roots = [document.querySelector('#site-main section'), document.querySelector('#demo')].filter(Boolean) as Element[]
          for (const root of roots) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
            for (let t = walker.nextNode(); t; t = walker.nextNode()) {
              const text = t.textContent?.trim()
              const el = t.parentElement
              if (!text || !el) continue
              const cs = getComputedStyle(el)
              if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[aria-hidden=true]')) continue
              if (cs.backgroundClip === 'text' || el.closest('svg') || el.closest('[disabled], [aria-disabled=true]')) continue
              const box = el.getBoundingClientRect()
              if (box.width < 2 || box.height < 2) continue
              const fg = parse(cs.color)
              const bg = bgOf(el)
              if (!fg || !bg || fg[3] < 0.5) continue
              const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number]
              const ratio = (a + 0.05) / (b + 0.05)
              const size = Number.parseFloat(cs.fontSize)
              const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
              if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)} "${text.slice(0, 30)}" ${cs.color} on rgb(${bg.map(Math.round)})`)
            }
          }
          return out
        })
        for (const b of bad) failures.push(`${id}: ${b}`)
      }
      expect(failures).toEqual([])
      await ctx.close()
    })
  }
})

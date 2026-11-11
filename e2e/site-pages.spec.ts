import { expect, type Page, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { waitForHydration } from './hydration-barrier'

/**
 * pyreon.dev story, compare, migrate, benchmarks and project pages, against
 * the production SSG build (e2e-configs/docs.config.ts): every route the
 * sitemap promises for these families is prerendered; each page type
 * hydrates in place with no errors; no horizontal page scroll at the five
 * design widths; the switchers, filters and the live counter work by
 * keyboard; the charts package loads only where a live chart is drawn; and
 * every text node passes WCAG AA in both themes.
 */
const WIDTHS = [320, 390, 768, 1024, 1440]
/** One route per page type (plus the second project page, which has extra data). */
const PAGE_TYPES = ['/benchmarks', '/compare/react', '/why/components-run-once', '/migrate', '/migrate/react', '/status', '/releases', '/community', '/brand']
const FAMILY = /^\/(why|compare|migrate|benchmarks|status|releases|community|brand)(\/|$)/

interface SitemapPage {
  route: string
  template: string
}
const sitemap = JSON.parse(readFileSync(resolve(__dirname, '../docs/src/site/content/pages/_sitemap.json'), 'utf8')) as {
  sections: { pages: SitemapPage[] }[]
}
const familyRoutes = sitemap.sections.flatMap((s) => s.pages).filter((p) => FAMILY.test(p.route) && !p.route.includes('*') && !p.route.includes('<'))

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

async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 40))
    }
    window.scrollTo(0, 0)
  })
}

test.describe('build output', () => {
  test('every sitemap route of these families is prerendered', () => {
    const dist = resolve(__dirname, '../docs/dist')
    expect(familyRoutes.length).toBeGreaterThan(20)
    for (const p of familyRoutes) {
      const file = resolve(dist, `${p.route.slice(1)}/index.html`)
      expect(existsSync(file), `${p.route} (${p.template})`).toBe(true)
    }
  })

  test('the redirects forward and are not indexed', () => {
    const dist = resolve(__dirname, '../docs/dist')
    for (const [route, to] of [['why', '/why/components-run-once'], ['compare', '/compare/react']] as const) {
      const html = readFileSync(resolve(dist, `${route}/index.html`), 'utf8')
      expect(html).toContain(`url=${to}`)
      expect(html).toContain('noindex')
    }
    const sitemapXml = readFileSync(resolve(dist, 'sitemap.xml'), 'utf8')
    expect(sitemapXml).not.toContain('<loc>https://pyreon.dev/why</loc>')
    expect(sitemapXml).toContain('<loc>https://pyreon.dev/benchmarks</loc>')
  })

  test('each page sets its own title, canonical and share image', () => {
    const dist = resolve(__dirname, '../docs/dist')
    for (const route of ['/benchmarks', '/compare/vue', '/why/ai-ready', '/migrate/svelte', '/status']) {
      const html = readFileSync(resolve(dist, `${route.slice(1)}/index.html`), 'utf8')
      expect(html, route).toContain(`<link rel="canonical" href="https://pyreon.dev${route}"`)
      expect(html, route).toMatch(/<meta property="og:image" content="https:\/\/pyreon\.dev\/assets\/og\/[^"]+\.png"/)
      expect((html.match(/<h1[\s>]/g) ?? []).length, `${route} has one h1`).toBe(1)
    }
  })
})

test.describe('hydration', () => {
  for (const route of PAGE_TYPES) {
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
})

test.describe('no horizontal page scroll', () => {
  for (const width of WIDTHS) {
    test(`at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const route of PAGE_TYPES) {
        await page.goto(route)
        await waitForHydration(page)
        await scrollThrough(page)
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(scroll, `${route} at ${width}px`).toBeLessThanOrEqual(0)
      }
    })
  }
})

test.describe('/benchmarks', () => {
  test('the row board is a live chart, switched by keyboard', async ({ page }) => {
    const errors = collectErrors(page)
    const charts: string[] = []
    page.on('request', (r) => {
      if (/\/assets\/charts-[\w-]+\.js$/.test(r.url())) charts.push(r.url())
    })
    await page.goto('/benchmarks')
    await waitForHydration(page)
    // Without the live chart the static SVG fallback is what shows.
    await expect(page.locator('#rows-fallback')).toBeVisible()
    await page.locator('#rows').scrollIntoViewIfNeeded()
    const group = page.locator('#rows [role=group][aria-label=Operation]')
    await expect(group).toBeVisible()
    expect(charts.length).toBeGreaterThan(0)
    await expect(page.locator('#rows-fallback')).toBeHidden()
    await expect(page.locator('#rows canvas').first()).toBeVisible()
    const first = group.locator('button').first()
    await first.focus()
    await page.keyboard.press('Enter')
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('ArrowRight')
    const second = group.locator('button').nth(1)
    await expect(second).toHaveAttribute('aria-pressed', 'true')
    await expect(second).toBeFocused()
    await expect(page.locator('#rows [data-live-chart] p [aria-live=polite]')).toContainText(await second.innerText())
    expect(errors).toEqual([])
  })

  test('the reactivity engine switcher swaps the table', async ({ page }) => {
    await page.goto('/benchmarks')
    await waitForHydration(page)
    const group = page.locator('#reactivity [role=group]')
    const table = page.locator('#reactivity table caption')
    await expect(table).toContainText('V8')
    await group.locator('button').nth(1).click()
    await expect(table).toContainText('JavaScriptCore')
    await expect(group.locator('button').nth(1)).toHaveAttribute('aria-pressed', 'true')
  })

  test('the product filter narrows the cards', async ({ page }) => {
    await page.goto('/benchmarks')
    await waitForHydration(page)
    const cards = page.locator('#products ul li a')
    const all = await cards.count()
    expect(all).toBeGreaterThan(0)
    const losses = page.locator('#products [role=group] button', { hasText: 'has losses' })
    await losses.focus()
    await page.keyboard.press('Space')
    await expect(losses).toHaveAttribute('aria-pressed', 'true')
    const count = Number((await losses.innerText()).replace(/\D+/g, ''))
    await expect(cards).toHaveCount(count)
    for (const href of await cards.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toMatch(/^\/products\/[a-z-]+#benchmarks$/)
  })

  test('every chart keeps its table alternative', async ({ page }) => {
    await page.goto('/benchmarks')
    for (const id of ['rows', 'scaling', 'ssr', 'apps', 'bundle']) {
      await expect(page.locator(`#${id} details table`).first(), id).toBeAttached()
    }
  })
})

test.describe('the charts package loads only where a live chart is drawn', () => {
  for (const route of ['/compare/react', '/why/performance', '/migrate', '/releases']) {
    test(route, async ({ page }) => {
      const charts: string[] = []
      page.on('request', (r) => {
        if (/\/assets\/charts-[\w-]+\.js$/.test(r.url())) charts.push(r.url())
      })
      await page.goto(route)
      await waitForHydration(page)
      await scrollThrough(page)
      await page.waitForTimeout(400)
      expect(charts).toEqual([])
    })
  }
})

test.describe('/why/components-run-once', () => {
  test('the live counter runs its body once', async ({ page }) => {
    await page.goto('/why/components-run-once')
    await waitForHydration(page)
    const add = page.getByRole('button', { name: 'Add one' })
    const value = page.locator('[data-run-once-value]')
    await add.scrollIntoViewIfNeeded()
    await expect(value).toHaveText('0')
    // The island hydrates when it scrolls near; until then the button is inert server HTML.
    await expect(async () => {
      await add.click()
      await expect(value).not.toHaveText('0', { timeout: 250 })
    }).toPass({ timeout: 10_000 })
    const before = Number(await value.innerText())
    await add.focus()
    await page.keyboard.press('Enter')
    await expect(value).toHaveText(String(before + 1))
    const meter = (label: string) =>
      page
        .getByLabel('What a click does')
        .getByText(label, { exact: true })
        .evaluate((cell) => cell.parentElement?.lastElementChild?.textContent?.trim() ?? '')
    expect(await meter('Counter() body ran')).toBe('1')
    expect(Number(await meter('text-node writes'))).toBeGreaterThanOrEqual(before + 1)
    expect(await meter('elements created after mount')).toBe('0')
  })
})

test.describe('contrast', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`every text node passes WCAG AA (${theme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 900 } })
      await ctx.addInitScript((t) => {
        try {
          localStorage.setItem('pyreon-theme', t)
        } catch {}
      }, theme)
      const page = await ctx.newPage()
      const failures: string[] = []
      for (const route of PAGE_TYPES) {
        await page.goto(route)
        await waitForHydration(page)
        await scrollThrough(page)
        await page.waitForTimeout(1000)
        for (const f of await page.evaluate(auditContrast)) failures.push(`${route}: ${f}`)
      }
      expect(failures).toEqual([])
      await ctx.close()
    })
  }
})

/**
 * The same audit as the kit gallery's in site-shell.spec.ts: every visible
 * text node against its effective (composited) background. Text painted with
 * a gradient, inside an SVG (the asset set's own charts carry their own
 * audited palette) or on an image background is skipped.
 */
function auditContrast(): string[] {
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
  const bad: string[] = []
  const walker = document.createTreeWalker(document.querySelector('#site-main')!, NodeFilter.SHOW_TEXT)
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent?.trim()
    const el = t.parentElement
    if (!text || !el) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[aria-hidden=true],[hidden],details:not([open])')) continue
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
}

import { expect, type Locator, type Page, test } from '@playwright/test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { waitForNav } from './site-islands'

/**
 * pyreon.dev story, compare, migrate, benchmarks and project pages, against
 * the production SSG build (e2e-configs/docs.config.ts): every route the
 * sitemap promises for these families is prerendered; each page type
 * hydrates in place with no errors; no horizontal page scroll at the five
 * design widths; the switchers, filters and the live counter work by
 * keyboard and pointer; no control sits outside an island; the row board's
 * axis reads in ms with no label clipped; the charts package loads only
 * where a live chart is drawn; and every text node passes WCAG AA in both
 * themes.
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

/**
 * Counts SERVER-RENDERED elements removed after load: an island that throws
 * its server HTML away and mounts afresh shows up here. Elements a client
 * component creates and later replaces (a live chart's own nodes) do not.
 */
async function trackRemovals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __removed: number; __removedWhat: string[] }
    w.__removed = 0
    w.__removedWhat = []
    const server = new WeakSet<Node>()
    document.addEventListener('DOMContentLoaded', () => {
      for (const el of document.querySelectorAll('body *')) server.add(el)
    })
    new MutationObserver((list) => {
      for (const m of list) {
        if ((m.target as Element).closest?.('head')) continue
        for (const n of m.removedNodes) {
          if (n.nodeType !== 1 || !server.has(n)) continue
          w.__removed++
          w.__removedWhat.push(`${(n as Element).tagName} in ${(m.target as Element).closest?.('pyreon-island')?.getAttribute('data-component') ?? 'page'}`)
        }
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
      const og = html.match(/<meta property="og:image" content="https:\/\/pyreon\.dev(\/media\/og\/[^"]+\.png)"/)
      expect(og, route).not.toBeNull()
      expect(existsSync(resolve(dist, og![1]!.slice(1))), `${route}: ${og![1]}`).toBe(true)
      expect((html.match(/<h1[\s>]/g) ?? []).length, `${route} has one h1`).toBe(1)
    }
  })
})

/** Page types with an island rooted in KitScope (see the hydration test). */
const KIT_ISLAND_PAGES = new Set(['/benchmarks', '/why/components-run-once'])

test.describe('hydration', () => {
  // A marketing page is static HTML: only its islands hydrate. Scrolling
  // through wakes every `visible` island; each must adopt its server HTML.
  for (const route of PAGE_TYPES) {
    test(`${route}: every island adopts its server HTML, with no errors`, async ({ page }) => {
      // Islands rooted in KitScope mount afresh instead of adopting (pyreon/pyreon#4443); this flips when fixed.
      test.fail(KIT_ISLAND_PAGES.has(route), 'KitScope islands remount: pyreon/pyreon#4443')
      await trackRemovals(page)
      const errors = collectErrors(page)
      await page.goto(route)
      await waitForNav(page)
      await scrollThrough(page)
      await page.waitForTimeout(600)
      expect(errors).toEqual([])
      expect(await page.evaluate(() => (window as unknown as { __removedWhat: string[] }).__removedWhat)).toEqual([])
    })
  }
})

test.describe('no horizontal page scroll', () => {
  for (const width of WIDTHS) {
    test(`at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const route of PAGE_TYPES) {
        await page.goto(route)
        await waitForNav(page)
        await scrollThrough(page)
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(scroll, `${route} at ${width}px`).toBeLessThanOrEqual(0)
      }
    })
  }
})

/** The built HTML of a page, as the server sent it (what a reader without JavaScript gets). */
const builtHtml = (route: string) => readFileSync(resolve(__dirname, `../docs/dist/${route.slice(1)}/index.html`), 'utf8')

/** Products whose content file has benchmark rows: what "every product" must list. */
const productsWithBenchmarks = (() => {
  const dir = resolve(__dirname, '../docs/src/site/content/products')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .filter((f) => {
      const b = JSON.parse(readFileSync(resolve(dir, f), 'utf8')).benchmarks as { rows?: unknown[] } | null | undefined
      return !!b && Array.isArray(b.rows) && b.rows.length > 0
    })
    .map((f) => f.slice(0, -5))
    .sort()
})()

/**
 * Records every `fillText` on a canvas: the chart draws its tick labels there,
 * so this is how a spec reads them. Each entry carries the label's left and
 * right ink edges in canvas pixels (from the context's own font metrics and
 * transform) and the canvas width, so clipping is measurable.
 */
async function recordCanvasText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __texts: { text: string; left: number; right: number; width: number; canvas: Element }[] }
    w.__texts = []
    const fill = CanvasRenderingContext2D.prototype.fillText
    const clear = CanvasRenderingContext2D.prototype.clearRect
    // A frame starts with a clear: keep only the canvas's latest frame.
    CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, x: number, y: number, cw: number, ch: number) {
      w.__texts = w.__texts.filter((e) => e.canvas !== this.canvas)
      return clear.call(this, x, y, cw, ch)
    }
    CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, max?: number) {
      const m = this.measureText(text)
      const t = this.getTransform()
      // Ink extents around the anchor, in the context's own units, mapped through the transform.
      const l = x - m.actualBoundingBoxLeft
      const r = x + m.actualBoundingBoxRight
      const isRotated = Math.abs(t.b) > 1e-6 || Math.abs(t.c) > 1e-6
      if (!isRotated) w.__texts.push({ text, left: t.a * l + t.e, right: t.a * r + t.e, width: this.canvas.width, canvas: this.canvas })
      return max === undefined ? fill.call(this, text, x, y) : fill.call(this, text, x, y, max)
    }
  })
}

/** Clicks until an island has hydrated and the click took effect (a static page's island is inert server HTML until then). */
async function pressWhenLive(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded()
  await expect(async () => {
    await target.click()
    await expect(target).toHaveAttribute('aria-pressed', 'true', { timeout: 250 })
  }).toPass({ timeout: 10_000 })
}

test.describe('/benchmarks', () => {
  test('the headline leads with rigour, and every loss is still on the page', async ({ page }) => {
    await page.goto('/benchmarks')
    await expect(page.locator('h1')).toHaveText('Every result, on the table.')
    await expect(page).toHaveTitle('Benchmarks: every result, on the table · Pyreon')
    const content = JSON.parse(readFileSync(resolve(__dirname, '../docs/src/site/content/pages/benchmarks.json'), 'utf8')) as {
      losses: [string, string][]
      withdrawn: [string, string][]
    }
    const losses = (await page.locator('#losses').innerText()).replace(/\s+/g, ' ')
    for (const [title] of content.losses) expect(losses, title).toContain(title)
    const withdrawn = (await page.locator('#withdrawn').innerText()).replace(/\s+/g, ' ')
    for (const [claim] of content.withdrawn) expect(withdrawn, claim).toContain(claim)
  })

  test('the row board is a live chart, switched by keyboard and pointer', async ({ page }) => {
    const errors = collectErrors(page)
    const charts: string[] = []
    page.on('request', (r) => {
      if (/\/assets\/charts-[\w-]+\.js$/.test(r.url())) charts.push(r.url())
    })
    await page.goto('/benchmarks')
    await waitForNav(page)
    // Without the live chart the static SVG fallback is what shows.
    await expect(page.locator('#rows-fallback')).toBeVisible()
    await page.locator('#row-board').scrollIntoViewIfNeeded()
    const group = page.locator('#row-board [role=group][aria-label=Operation]')
    await expect(group).toBeVisible()
    expect(charts.length).toBeGreaterThan(0)
    await expect(page.locator('#rows-fallback')).toBeHidden()
    await expect(page.locator('#row-board canvas').first()).toBeVisible()
    const first = group.locator('button').first()
    await first.focus()
    await page.keyboard.press('Enter')
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('ArrowRight')
    const second = group.locator('button').nth(1)
    await expect(second).toHaveAttribute('aria-pressed', 'true')
    await expect(second).toBeFocused()
    await expect(page.locator('#row-board [data-live-chart] p [aria-live=polite]')).toContainText(await second.innerText())
    const third = group.locator('button').nth(2)
    await third.click()
    await expect(third).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#row-board [data-live-chart] p [aria-live=polite]')).toContainText(await third.innerText())
    expect(errors).toEqual([])
  })

  for (const width of [320, 1440]) {
    for (const theme of ['dark', 'light'] as const) {
      test(`the row board's axis reads in ms and no label is clipped (${width}px, ${theme})`, async ({ browser }) => {
        const ctx = await browser.newContext({ colorScheme: theme, viewport: { width, height: 900 } })
        const page = await ctx.newPage()
        await recordCanvasText(page)
        await page.goto('/benchmarks')
        await page.locator('#row-board').scrollIntoViewIfNeeded()
        await expect(page.locator('#row-board canvas').first()).toBeVisible()
        const group = page.locator('#row-board [role=group][aria-label=Operation]')
        // A sub-millisecond operation (partial update) and the widest axis (create 10,000 rows).
        for (const op of ['partial update', 'create 10,000 rows']) {
          await group.getByRole('button', { name: op, exact: true }).click()
          await page.waitForTimeout(600)
          const labels = await page.evaluate(() => {
            const w = window as unknown as { __texts: { text: string; left: number; right: number; width: number; canvas: Element }[] }
            const canvas = document.querySelector('#row-board canvas')
            const out = w.__texts.filter((t) => t.canvas === canvas)
            w.__texts = []
            return out.map(({ text, left, right, width }) => ({ text, left, right, width }))
          })
          const ticks = labels.filter((l) => /\d\s*(ms|µs)$/.test(l.text))
          expect(ticks.length, op).toBeGreaterThan(1)
          expect(ticks.map((t) => t.text)).toContain('0 ms')
          for (const t of ticks) {
            expect(t.text, `${op}: a millisecond axis`).toMatch(/ ms$/)
            expect(t.left, `${op}: "${t.text}" starts inside the canvas`).toBeGreaterThanOrEqual(0)
            expect(t.right, `${op}: "${t.text}" ends inside the canvas`).toBeLessThanOrEqual(t.width)
          }
        }
        await ctx.close()
      })
    }
  }

  test('the reactivity engine switcher: server HTML shows the first engine; pointer and keyboard switch it', async ({ page }) => {
    // Without JavaScript: the first engine's complete table, its chip pressed, inside an island.
    const html = builtHtml('/benchmarks')
    const section = html.slice(html.indexOf('id="reactivity"'), html.indexOf('id="every-product"'))
    expect(section).toContain('<pyreon-island')
    expect(section).toMatch(/<caption[^>]*>(?:<!--[^>]*-->)*V8 · Node 26: ns per op/)
    expect(section).toMatch(/aria-pressed="true"[^>]*>(?:<[^>]+>)*V8 · Node 26/)

    await page.goto('/benchmarks')
    await waitForNav(page)
    const group = page.locator('#reactivity [role=group]')
    const caption = page.locator('#reactivity table caption')
    await expect(caption).toContainText('V8')
    const jsc = group.locator('button').nth(1)
    await pressWhenLive(jsc)
    await expect(caption).toContainText('JavaScriptCore')
    const v8 = group.locator('button').first()
    await v8.focus()
    await page.keyboard.press('Enter')
    await expect(v8).toHaveAttribute('aria-pressed', 'true')
    await expect(caption).toContainText('V8')
    await page.keyboard.press('ArrowRight')
    await expect(jsc).toHaveAttribute('aria-pressed', 'true')
    await expect(jsc).toBeFocused()
    await expect(caption).toContainText('JavaScriptCore')
  })

  test('"every product": every product with benchmark data, filtered by pointer and keyboard', async ({ page }) => {
    // Without JavaScript: every card, "all" pressed, inside an island.
    const html = builtHtml('/benchmarks')
    const section = html.slice(html.indexOf('id="every-product"'), html.indexOf('id="losses"'))
    expect(section).toContain('<pyreon-island')
    const listed = [...section.matchAll(/data-product="([a-z0-9-]+)"/g)].map((m) => m[1]).sort()
    expect(listed).toEqual(productsWithBenchmarks)

    await page.goto('/benchmarks')
    await waitForNav(page)
    const cards = page.locator('#every-product ul li a')
    await expect(cards).toHaveCount(productsWithBenchmarks.length)
    const chip = (name: string) => page.locator('#every-product [role=group] button', { hasText: name })
    const countOf = async (name: string) => Number((await chip(name).innerText()).replace(/\D+/g, ''))
    // Pointer.
    await pressWhenLive(chip('has losses'))
    await expect(cards).toHaveCount(await countOf('has losses'))
    await expect(page.locator('#every-product p[aria-live=polite]')).toContainText(`${await countOf('has losses')} of ${productsWithBenchmarks.length} products`)
    // Keyboard: Home presses "all", ArrowRight moves to "has wins".
    await chip('has losses').focus()
    await page.keyboard.press('Home')
    await expect(chip('all')).toHaveAttribute('aria-pressed', 'true')
    await expect(cards).toHaveCount(productsWithBenchmarks.length)
    await page.keyboard.press('ArrowRight')
    await expect(chip('has wins')).toHaveAttribute('aria-pressed', 'true')
    await expect(chip('has wins')).toBeFocused()
    await expect(cards).toHaveCount(await countOf('has wins'))
    await chip('throughput only').focus()
    await page.keyboard.press('Space')
    await expect(cards).toHaveCount(await countOf('throughput only'))
    for (const href of await cards.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toMatch(/^\/products\/[a-z0-9-]+#benchmarks$/)
  })

  test('every chart keeps its table alternative', async ({ page }) => {
    await page.goto('/benchmarks')
    for (const id of ['row-board', 'scaling', 'ssr', 'apps', 'bundle']) {
      await expect(page.locator(`#${id} details table`).first(), id).toBeAttached()
    }
  })

  test('the anchors other pages link to exist', async ({ page }) => {
    await page.goto('/benchmarks')
    for (const id of ['row-board', 'every-product', 'losses', 'reproduce', 'ssr']) await expect(page.locator(`#${id}`), id).toHaveCount(1)
    const jumps = await page.locator('nav[aria-label="On this page"] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    for (const href of jumps) await expect(page.locator(href!), href!).toHaveCount(1)
  })
})

test.describe('no dead controls', () => {
  // A static page hydrates only its islands: a button outside one does nothing.
  for (const route of [...PAGE_TYPES, '/brand/kit']) {
    test(route, () => {
      const html = builtHtml(route)
      const main = html.slice(html.indexOf('id="site-main"'))
      const dead: string[] = []
      let depth = 0
      let details = 0
      for (const m of main.matchAll(/<(\/?)(pyreon-island|details|button|select|textarea)\b[^>]*>/g)) {
        const [tag, close, name] = m as unknown as [string, string, string]
        if (name === 'pyreon-island') depth += close ? -1 : 1
        else if (name === 'details') details += close ? -1 : 1
        else if (!close && depth === 0 && details === 0) dead.push(tag.slice(0, 80))
      }
      expect(dead).toEqual([])
    })
  }
})

test.describe('/brand/kit', () => {
  for (const mode of ['dark', 'light'] as const) {
    test(`the forced ${mode} panel's buttons work (pointer and keyboard)`, async ({ page }) => {
      await page.goto('/brand/kit')
      const panel = page.getByTestId(`kit-scope-${mode}`)
      const solid = panel.getByRole('button', { name: /^Solid · \d+$/ })
      await solid.scrollIntoViewIfNeeded()
      await expect(async () => {
        await solid.click()
        await expect(solid).not.toHaveText('Solid · 0', { timeout: 250 })
      }).toPass({ timeout: 10_000 })
      const ghost = panel.getByRole('button', { name: /^Ghost · \d+$/ })
      await ghost.focus()
      await page.keyboard.press('Enter')
      await expect(ghost).toHaveText('Ghost · 1')
      await expect(panel.locator('[data-theme]').first()).toHaveAttribute('data-theme', mode)
    })
  }
})

test.describe('the charts package loads only where a live chart is drawn', () => {
  for (const route of ['/compare/react', '/why/performance', '/migrate', '/releases']) {
    test(route, async ({ page }) => {
      const charts: string[] = []
      page.on('request', (r) => {
        if (/\/assets\/charts-[\w-]+\.js$/.test(r.url())) charts.push(r.url())
      })
      await page.goto(route)
      await waitForNav(page)
      await scrollThrough(page)
      await page.waitForTimeout(400)
      expect(charts).toEqual([])
    })
  }
})

test.describe('/why/components-run-once', () => {
  test('the live counter runs its body once', async ({ page }) => {
    await page.goto('/why/components-run-once')
    await waitForNav(page)
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
        await waitForNav(page)
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

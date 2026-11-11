import { expect, type Page, test } from '@playwright/test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { waitForDocs } from './docs-islands'

/**
 * The Docs v3 reading shell, against the production SSG build (run by the
 * `docs` project of e2e-configs/docs.config.ts, which matches this file):
 * one page of each type (docs home, product overview with its selling slots,
 * guide, API reference) at the five design widths in both themes, the reader
 * tools, the slots, that islands adopt the server DOM, the contrast of every
 * text node in the reading column and the rail, and the weight of each page
 * type (docs pages are static HTML with islands: no router app, no styling
 * runtime, and no marketing-only CSS).
 */
const WIDTHS = [320, 390, 768, 1024, 1440]
const PAGES = { home: '/docs', overview: '/docs/form', guide: '/docs/guides/forms', reference: '/docs/reference/form' } as const
const DIST = resolve(__dirname, '../docs/dist')

async function trackRemovals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __removed: string[] }
    w.__removed = []
    new MutationObserver((list) => {
      for (const m of list) {
        const target = m.target as Element
        if (target.closest?.('head')) continue
        for (const n of m.removedNodes) {
          // <Example> replaces its own loading placeholder by design.
          if (n.nodeType !== 1 || (n as Element).classList.contains('pyreon-example__loading')) continue
          // Inside a subtree already removed, or a live example's own client-rendered DOM.
          if (!target.isConnected || target.closest?.('.pyreon-example__surface')) continue
          // A product demo island remounts on hydration (pyreon/pyreon#4434, also on /products/*).
          const island = (target.closest?.('pyreon-island') as HTMLElement | null)?.dataset.component ?? ''
          if (/^Demo[A-Z]/.test(island)) continue
          w.__removed.push(`${island ? `[${island}] ` : ''}${target.className} > ${(n as Element).tagName}`)
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

test.describe('docs build output', () => {
  test('every docs page is prerendered, /docs/index is not, and the share cards are published', () => {
    const sidebar = JSON.parse(readFileSync(resolve(__dirname, '../docs/src/site/content/_docs-sidebar.json'), 'utf8')) as { items: { href: string; children?: { href: string }[] }[] }[]
    const hrefs = sidebar.flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]))
    for (const href of hrefs) expect(existsSync(resolve(DIST, `.${href}`, 'index.html')), href).toBe(true)
    expect(existsSync(resolve(DIST, 'docs/index/index.html'))).toBe(false)
    expect(existsSync(resolve(DIST, 'media/og/docs.png'))).toBe(true)
    const html = readFileSync(resolve(DIST, 'docs/form/index.html'), 'utf8')
    expect(html).toContain('<link rel="canonical" href="https://pyreon.dev/docs/form"')
    expect(html).toMatch(/property="og:image" content="https:\/\/pyreon\.dev\/media\/og\/docs\/form\.png"/)
  })
})

test.describe('docs page types', () => {
  for (const [kind, path] of Object.entries(PAGES)) {
    for (const theme of ['dark', 'light'] as const) {
      test(`${kind} (${path}) in ${theme}: renders, adopts the server DOM, no overflow at five widths`, async ({ page }) => {
        const errors = collectErrors(page)
        await trackRemovals(page)
        await page.emulateMedia({ colorScheme: theme })
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(path)
        await waitForDocs(page)
        await page.waitForLoadState('networkidle')
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        // One visible h1, the sidebar, the rail.
        expect(await page.locator('h1').evaluateAll((hs) => hs.filter((h) => (h as HTMLElement).offsetParent !== null).length)).toBe(1)
        await expect(page.locator('.dx-aside .dx-side__link[aria-current="page"]')).toHaveCount(1)
        await expect(page.locator('.dx-rail')).toBeVisible()
        // Islands adopt the server DOM: nothing the server rendered is removed.
        expect(await page.evaluate(() => (window as unknown as { __removed: string[] }).__removed)).toEqual([])
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 })
          await page.waitForTimeout(100)
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px`).toBe(0)
          await expect(page.locator('.dx-rail')).toBeVisible({ visible: width >= 1180 })
          await expect(page.locator('.dx-drawer-btn')).toBeVisible({ visible: width < 960 })
          await expect(page.locator('.dx-aside')).toBeVisible({ visible: width >= 960 })
        }
        expect(errors).toEqual([])
      })
    }
  }
})

test.describe('reader tools', () => {
  test('page actions: edit link, copy as Markdown, ask your AI', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: '# Forms & Validation\n' }))
    await page.goto(PAGES.guide)
    await waitForDocs(page)
    await expect(page.locator('.dx-actions a', { hasText: 'Edit this page' })).toHaveAttribute('href', 'https://github.com/pyreon/pyreon/edit/main/docs/src/content/docs/guides/forms.md')
    await page.locator('.dx-actions button', { hasText: 'Copy as Markdown' }).click()
    await expect(page.locator('.dx-actions__status')).toHaveText('Markdown copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('# Forms & Validation\n')

    const ask = page.locator('.dx-ask .dx-action')
    await ask.click()
    await expect(ask).toHaveAttribute('aria-expanded', 'true')
    const claude = page.locator('.dx-ask__item', { hasText: 'Open in Claude' })
    const prompt = decodeURIComponent(new URL((await claude.getAttribute('href'))!).searchParams.get('q')!)
    expect(prompt).toContain('https://pyreon.dev/llms.txt')
    expect(prompt).toContain('https://pyreon.dev/docs/guides/forms')
    await page.keyboard.press('Escape')
    await expect(ask).toHaveAttribute('aria-expanded', 'false')
    await expect(ask).toBeFocused()
  })

  test('code blocks copy, headings get anchors', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(PAGES.guide)
    await waitForDocs(page)
    const block = page.locator('.dx-prose .code-block').first()
    await block.locator('.code-block__copy').click()
    await expect(block.locator('.code-block__copy')).toHaveText('Copied')
    expect((await page.evaluate(() => navigator.clipboard.readText())).length).toBeGreaterThan(0)
    const h2 = page.locator('.dx-prose h2[id]').first()
    const id = await h2.getAttribute('id')
    await expect(h2.locator('a.dx-anchor')).toHaveAttribute('href', `#${id}`)
  })

  test('below 1180px the TOC moves under the title and closes after a pick', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    // Every page type: the title (or the overview's pitch) comes first, then the TOC.
    for (const path of [PAGES.reference, PAGES.overview, '/docs/reactivity-rules']) {
      await page.goto(path)
      const below = await page.evaluate(() => {
        const h1 = [...document.querySelectorAll('h1')].find((h) => (h as HTMLElement).offsetParent !== null)!
        const toc = document.querySelector('details.dx-toc-inline')!
        return toc.getBoundingClientRect().top - h1.getBoundingClientRect().bottom
      })
      expect(below, path).toBeGreaterThan(0)
    }
    await page.goto(PAGES.guide)
    await waitForDocs(page)
    const toc = page.locator('details.dx-toc-inline')
    await expect(toc).toBeVisible()
    await toc.locator('summary').click()
    const link = toc.locator('.dx-toc__link').nth(1)
    const href = (await link.getAttribute('href'))!
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    expect(await toc.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false)
  })
})

test.describe('selling slots', () => {
  test('the overview page shows pitch, live demo with tabs, benchmarks, coming from, inline sell and learn more', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(PAGES.overview)
    await waitForDocs(page)
    const pitch = page.locator('.dx-pitch')
    await expect(pitch.locator('h1')).toHaveText('Forms')
    await expect(pitch.locator('.dx-facts > div')).toHaveCount(3)
    // The pitch is the page's head: no generic title.
    await expect(page.locator('.dx-head')).toHaveCount(0)

    const preview = page.locator('#dx-demo-form-tab-preview')
    const code = page.locator('#dx-demo-form-tab-code')
    await expect(preview).toHaveAttribute('aria-selected', 'true')
    // The tabs are an island that wakes on interaction: hover wakes it, then the keyboard works.
    await preview.hover()
    await page.locator('.dx-demo__tabs[data-hydrated]').waitFor({ state: 'attached' })
    await preview.focus()
    await page.keyboard.press('ArrowRight')
    await expect(code).toHaveAttribute('aria-selected', 'true')
    await expect(code).toBeFocused()
    await expect(page.locator('#dx-demo-form-code')).toBeVisible()
    await expect(page.locator('#dx-demo-form-preview')).toBeHidden()
    await code.click()
    await preview.click()
    // The demo is the real @pyreon/form island.
    await expect(page.locator('#dx-demo-form-preview input[type="email"]')).toBeVisible()

    await expect(page.locator('.dx-bench__big')).toHaveText('4/4')
    await expect(page.locator('.dx-bench__row')).not.toHaveCount(0)
    await expect(page.locator('#coming-from')).toContainText('Coming from React Hook Form')
    await expect(page.locator('.dx-sell')).toHaveCount(1)
    await expect(page.locator('.dx-lm li')).toHaveCount(3)
    // The TOC lists the slots' sections.
    for (const id of ['try-it', 'product-benchmarks', 'coming-from', 'learn-more']) await expect(page.locator(`.dx-rail .dx-toc__link[href="#${id}"]`)).toHaveCount(1)
  })

  test('a guide page carries no product slot and no rail card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/docs/guides/testing')
    await waitForDocs(page)
    await expect(page.locator('.dx-pitch, .dx-demo, .dx-bench, .dx-sell, .dx-lm')).toHaveCount(0)
    await expect(page.locator('.dx-rcard')).toHaveCount(0)
  })
})

test.describe('docs contrast', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`every text node in the reading column and the rail passes AA (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width: 1440, height: 900 })
      const failures: string[] = []
      for (const path of Object.values(PAGES)) {
        await page.goto(path)
        await waitForDocs(page)
        failures.push(
          ...(await page.evaluate(() => {
            const parse = (c: string): [number, number, number, number] => {
              const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]
              // color-mix() resolves to `color(srgb r g b / a)` with 0–1 channels.
              const k = c.startsWith('color(srgb') ? 255 : 1
              return [(m[0] ?? 0) * k, (m[1] ?? 0) * k, (m[2] ?? 0) * k, m[3] ?? 1]
            }
            const lum = ([r, g, b]: number[]) => {
              const f = (v: number) => {
                const s = v / 255
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
              }
              return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
            }
            const bgOf = (el: Element | null): number[] => {
              const layers: number[][] = []
              for (let e = el; e; e = e.parentElement) {
                const cs = getComputedStyle(e)
                if (cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('radial')) return [-1]
                const c = parse(cs.backgroundColor)
                if (c[3] > 0) {
                  layers.push(c)
                  if (c[3] >= 1) break
                }
              }
              let out = [255, 255, 255]
              for (const l of layers.reverse()) out = out.map((v, i) => v * (1 - l[3]!) + l[i]! * l[3]!)
              return out
            }
            const bad: string[] = []
            const roots = document.querySelectorAll('.dx-article, .dx-rail')
            for (const root of roots) {
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                const el = n.parentElement
                if (!el || !n.textContent?.trim() || el.offsetParent === null) continue
                // Code is checked per token in the unit tests; the paper demo surface keeps its own colours.
                if (el.closest('.code-block, .dx-code, .shiki, [data-theme="light"] [data-theme="light"], .dx-demo__preview')) continue
                const cs = getComputedStyle(el)
                const bg = bgOf(el)
                if (bg[0] === -1 || cs.color.includes('transparent')) continue
                const fg = parse(cs.color)
                const mixed = fg.slice(0, 3).map((v, i) => v * fg[3]! + bg[i]! * (1 - fg[3]!))
                const [a, b] = [lum(mixed), lum(bg)].sort((x, y) => y - x) as [number, number]
                const ratio = (a + 0.05) / (b + 0.05)
                const size = Number.parseFloat(cs.fontSize)
                const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
                if (ratio < (large ? 3 : 4.5)) bad.push(`${location.pathname} ${el.tagName}.${el.className} "${n.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}`)
              }
            }
            return bad.slice(0, 10)
          })),
        )
      }
      expect(failures).toEqual([])
    })
  }
})

/** The overview pages: `_docs-index.json#overviewPages`, href → product id. */
const OVERVIEW_PAGES = Object.entries(
  (JSON.parse(readFileSync(resolve(__dirname, '../docs/src/site/content/_docs-index.json'), 'utf8')) as { overviewPages: Record<string, string> }).overviewPages,
)
const PRODUCT_FILES = resolve(__dirname, '../docs/src/site/content/products')

test.describe('selling slots on every overview page', () => {
  test('each overview page renders its pitch, and every slot its content file has data for', () => {
    expect(OVERVIEW_PAGES.length).toBeGreaterThanOrEqual(36)
    const missing: string[] = []
    for (const [href, id] of OVERVIEW_PAGES) {
      const html = readFileSync(resolve(DIST, `.${href}`, 'index.html'), 'utf8')
      const product = JSON.parse(readFileSync(resolve(PRODUCT_FILES, `${id}.json`), 'utf8')) as {
        benchmarks?: unknown | null
        comingFrom?: unknown[]
        related: unknown[]
      }
      const want: [string, boolean][] = [
        ['class="dx-pitch"', true],
        ['id="product-benchmarks"', product.benchmarks != null],
        ['id="coming-from"', (product.comingFrom?.length ?? 0) > 0],
        ['id="learn-more"', product.related.length > 0],
        ['class="dx-sell"', true],
      ]
      for (const [needle, expected] of want) if (html.includes(needle) !== expected) missing.push(`${href}: ${needle} ${expected ? 'missing' : 'unexpected'}`)
    }
    expect(missing).toEqual([])
  })
})

/** Same-origin JavaScript and CSS a page requests while it loads and settles (gzip -9 of the built files). */
async function weigh(page: Page, path: string): Promise<{ js: number; css: number; files: string[] }> {
  const urls = new Set<string>()
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') urls.add(u.pathname)
  })
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  let js = 0
  let css = 0
  for (const u of urls) {
    const file = resolve(DIST, `.${u}`)
    if (!existsSync(file) || statSync(file).isDirectory()) continue
    const size = gzipSync(readFileSync(file), { level: 9 }).length / 1024
    if (u.endsWith('.js')) js += size
    else if (u.endsWith('.css')) css += size
  }
  return { js, css, files: [...urls] }
}

/**
 * JavaScript a docs page loads before any live example or demo: the client
 * entry, island hydration, the site nav, the docs search box and the page's
 * enhance island. Measured 2026-11-11 on feat/site-int-c (docs pages static
 * with islands): 49.7–50.4 KB on the docs home, a guide and reference pages
 * (the router-app docs measured 141–182 KB). The budget is that plus ~2 KB.
 * A page with live examples adds the example island and each example file
 * (/docs/guides/forms: +6 KB before its examples load); a product overview
 * adds its demo.
 */
const DOCS_JS_BUDGET_KB = 52

test.describe('docs page weight', () => {
  test(`a docs page loads at most ${DOCS_JS_BUDGET_KB} KB of JavaScript, no router app, and only docs CSS`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const path of [PAGES.home, '/docs/guides/testing', PAGES.reference, '/docs/reference/core']) {
      const w = await weigh(page, path)
      console.log(`${path}: JS ${w.js.toFixed(1)} KB, CSS ${w.css.toFixed(1)} KB gzip, ${w.files.length} requests`)
      expect(w.js, path).toBeLessThanOrEqual(DOCS_JS_BUDGET_KB)
      // No route module, router or app client: the page never hydrates as a whole.
      expect(w.files.filter((f) => /\/assets\/(app-client|link|_\.\.\.slug_|layout)-/.test(f)), path).toEqual([])
      // Docs CSS, never the marketing-only sheets.
      expect(w.files.some((f) => /\/assets\/docs-v3-.*\.css$/.test(f)), path).toBe(true)
      expect(w.files.filter((f) => /\/assets\/(site-pages|blog)-.*\.css$/.test(f)), path).toEqual([])
    }
  })

  test('a marketing page loads no docs CSS', async ({ page }) => {
    for (const path of ['/', '/products/form']) {
      const w = await weigh(page, path)
      expect(w.files.filter((f) => /\/assets\/docs-v3-.*\.css$/.test(f)), path).toEqual([])
    }
  })

  test('an overview page loads its own demo and no other', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const w = await weigh(page, PAGES.overview)
    // Scroll the demo into view so its island hydrates.
    await page.locator('#try-it').scrollIntoViewIfNeeded()
    await page.locator('#dx-demo-form-preview input[type="email"]').waitFor()
    const demos = w.files.filter((f) => /\/assets\/Demo[A-Z]\w*-/.test(f)).map((f) => /Demo[A-Z]\w*/.exec(f)![0])
    expect([...new Set(demos)].filter((d) => d !== 'DemoForm')).toEqual([])
    const guide = await weigh(page, PAGES.guide)
    expect(guide.files.filter((f) => /\/assets\/Demo[A-Z]\w*-/.test(f))).toEqual([])
  })
})

test.describe('docs home', () => {
  test('the Counter sample fits its card or scrolls inside it, at every width', async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(PAGES.home)
      const fit = await page.evaluate(() => {
        const body = document.querySelector('.dx-why .dx-code__body') as HTMLElement
        const card = body.closest('.dx-code') as HTMLElement
        const cs = getComputedStyle(body)
        const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
        const line = [...body.querySelectorAll('.line, span')].find((s) => s.textContent?.includes('count.update')) as HTMLElement | undefined
        const r = line?.getBoundingClientRect()
        const c = card.getBoundingClientRect()
        return { scrolls, overflow: body.scrollWidth - body.clientWidth, inside: r ? r.right <= c.right + 0.5 || scrolls : false, cardInView: c.right <= document.documentElement.clientWidth }
      })
      expect(fit.cardInView, `${width}px`).toBe(true)
      // Either the code wraps (no overflow) or its own box scrolls.
      expect(fit.overflow <= 0 || fit.scrolls, `${width}px`).toBe(true)
      expect(fit.inside, `${width}px`).toBe(true)
    }
  })
})

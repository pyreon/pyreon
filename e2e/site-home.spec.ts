import { expect, test } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { waitForIsland, waitForNav } from './site-islands'

/**
 * pyreon.dev homepage and the static-page architecture, against the
 * production SSG build (e2e-configs/docs.config.ts serves it like pyreon.dev).
 *
 *   - build output: the routes, robots.txt, sitemap, icons, share images;
 *   - the JavaScript budget of a marketing page (the shell's islands only);
 *   - the homepage: head tags, one h1, the live counter, the copy buttons,
 *     the loop (theme and reduced motion), the 404.
 */
const DIST = resolve(__dirname, '../docs/dist')

/**
 * JavaScript a marketing page loads before any demo island: the client entry,
 * the static client (island hydration) and the shell's islands (the nav and
 * the copy button), each with its static import closure, gzip -9.
 *
 * Measured 2026-11-11 on feat/site-redesign-home: 43.4 KB (the foundation
 * shipped 129.3 KB on `/`). The budget is that plus ~2 KB headroom. Raise it
 * only with a measurement in the PR that does.
 *
 * Raised to 48.5 on feat/site-int-c: 47.0 KB measured. The docs became
 * static pages too, so the islands registry in the entry lists their islands
 * (search, drawer, actions, examples, …: loaders only), and the entry
 * imports the static client directly instead of through one more chunk. The
 * JavaScript `/` actually requests went down, 50.0 → 49.0 KB.
 */
const SHELL_JS_BUDGET_KB = 48.5

function htmlFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'assets' && !name.startsWith('.')) htmlFiles(full, out)
    } else if (name.endsWith('.html')) out.push(full)
  }
  return out
}

const STATIC_IMPORT = /(?:import|export)\s*(?:[^'"();]*?from\s*)?["']([^"']+\.js)["']/g

/** A chunk and its static import closure, as `assets/<file>` paths. */
function closure(start: string, seen = new Set<string>()): Set<string> {
  if (seen.has(start)) return seen
  seen.add(start)
  const code = readFileSync(join(DIST, start), 'utf8')
  for (const m of code.matchAll(STATIC_IMPORT)) {
    const spec = m[1] as string
    closure(spec.startsWith('/') ? spec.slice(1) : `assets/${spec.replace(/^\.\//, '')}`, seen)
  }
  return seen
}

const chunk = (prefix: string): string => {
  const hit = readdirSync(join(DIST, 'assets')).find((f) => f.startsWith(`${prefix}-`) && f.endsWith('.js'))
  if (!hit) throw new Error(`no ${prefix}-*.js chunk in dist/assets`)
  return `assets/${hit}`
}

test.describe('build output', () => {
  test('the homepage, the 404 and the discovery files exist', () => {
    for (const p of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest', 'brand/favicon.svg', 'brand/icon-512.png', 'media/og/home.png', 'media/og/default.png']) {
      expect(existsSync(join(DIST, p)), p).toBe(true)
    }
    expect(readFileSync(join(DIST, 'robots.txt'), 'utf8')).toContain('Sitemap: https://pyreon.dev/sitemap.xml')
  })

  test('the sitemap lists every content route that is in the build', () => {
    const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
    const content = JSON.parse(readFileSync(resolve(__dirname, '../docs/src/site/content/_sitemap.json'), 'utf8')) as {
      sections: { pages: { route: string }[] }[]
    }
    const routes = content.sections.flatMap((s) => s.pages.map((p) => p.route)).filter((r) => !r.includes('*') && !r.includes('<') && r !== '/404')
    const built = routes.filter((r) => existsSync(join(DIST, r === '/' ? 'index.html' : `${r.slice(1)}/index.html`)))
    expect(built.length).toBeGreaterThan(5)
    for (const r of built) {
      // Stable-link pages that forward are redirects, not pages to index.
      const html = readFileSync(join(DIST, r === '/' ? 'index.html' : `${r.slice(1)}/index.html`), 'utf8')
      if (html.includes('http-equiv="refresh"')) continue
      expect(sitemap, r).toContain(`<loc>https://pyreon.dev${r === '/' ? '' : r}</loc>`)
    }
  })

  test(`a marketing page loads at most ${SHELL_JS_BUDGET_KB} KB of JavaScript before any demo island`, () => {
    const pages = htmlFiles(DIST).filter((f) => readFileSync(f, 'utf8').includes('data-site-static'))
    expect(pages.length).toBeGreaterThan(5)
    const entry = /<script[^>]*type="module"[^>]*src="\/(assets\/[^"]+\.js)"/.exec(readFileSync(join(DIST, 'index.html'), 'utf8'))?.[1]
    expect(entry).toBeTruthy()
    const files = new Set<string>()
    // The static client (island hydration) is part of the entry's own graph.
    for (const start of [entry as string, chunk('SiteNav'), chunk('command')]) for (const f of closure(start)) files.add(f)
    const kb = [...files].reduce((sum, f) => sum + gzipSync(readFileSync(join(DIST, f)), { level: 9 }).length, 0) / 1024
    console.log(`shell JS: ${kb.toFixed(1)} KB gzip in ${files.size} files`)
    expect(kb).toBeLessThanOrEqual(SHELL_JS_BUDGET_KB)

    // No static page preloads anything outside the entry's own graph (the
    // route closure would download the kit and the router for nothing), and
    // none links the docs stylesheet or carries loader data.
    const entryGraph = closure(entry as string)
    for (const f of pages) {
      const html = readFileSync(f, 'utf8')
      const preloads = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="\/([^"]+)"/g)].map((m) => m[1])
      for (const p of preloads) expect(entryGraph.has(p as string), `${f}: preloads ${p}`).toBe(true)
      // Docs pages are static too (docs/src/docs-ui/islands.ts); only they link the docs stylesheet.
      if (!f.startsWith(join(DIST, 'docs'))) expect(html, f).not.toMatch(/href="\/assets\/docs-[^"]+\.css"/)
      // (A script, not the docs pages that write about it in code samples.)
      expect(html, f).not.toMatch(/<script\b[^>]*>\s*window\.__PYREON_LOADER_DATA__/)
    }
  })

  /**
   * JavaScript each page TYPE requests on load, without scrolling (gzip -9 of
   * every script the browser fetched, idle prefetches included), measured
   * 2026-11-11 on the integrated feat/site-redesign at 1440×900, plus ~2 KB.
   * The shell alone is 47.3 KB; a type above it says what it adds. Raise a
   * budget only with a measurement in the PR that does.
   */
  const SHELL = 49.5
  const PAGE_TYPE_BUDGETS_KB: Record<string, number> = {
    '/': 51.5, // the home: the counter and loop islands
    '/products': SHELL,
    '/products/form': 89, // a light demo, prefetched at idle (the styling runtime ~25 KB + @pyreon/form)
    '/products/charts': SHELL, // a heavy demo package loads only near the demo
    '/benchmarks': SHELL, // the live charts load only near them
    '/why/components-run-once': 83, // the run-once counter, prefetched at idle
    '/compare/react': SHELL,
    '/migrate': SHELL,
    '/migrate/react': SHELL,
    '/status': SHELL,
    '/releases': SHELL,
    '/community': SHELL,
    '/brand': SHELL,
    '/brand/kit': 84.5, // the gallery's live examples
    '/blog': SHELL,
    '/blog/components-run-once': 50.5, // a post: its copy-link and code-copy island
    '/blog/tags/signals': SHELL,
    '/showcase': SHELL,
    '/open': SHELL, // the download chart loads only near it
    '/discord': SHELL,
    '/newsletter': SHELL,
    '/404.html': SHELL,
    '/docs': 53,
    '/docs/form': 98, // an overview page with its product demo
    '/docs/reference/core': 52.5,
  }
  for (const [route, budget] of Object.entries(PAGE_TYPE_BUDGETS_KB)) {
    test(`${route} requests at most ${budget} KB of JavaScript on load`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const scripts: string[] = []
      page.on('request', (r) => {
        if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname)
      })
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1500)
      const kb = scripts.reduce((sum, u) => sum + gzipSync(readFileSync(join(DIST, u.slice(1))), { level: 9 }).length, 0) / 1024
      console.log(`${route}: ${kb.toFixed(1)} KB gzip in ${scripts.length} scripts`)
      expect(kb, `${route}: ${kb.toFixed(1)} KB`).toBeLessThanOrEqual(budget)
    })
  }

  test('docs pages are static pages too, and link the docs stylesheet', () => {
    const html = readFileSync(join(DIST, 'docs/index.html'), 'utf8')
    expect(html).toMatch(/\/assets\/docs-[^"]+\.css/)
    expect(html).toContain('data-site-static')
  })
})

test.describe('homepage', () => {
  test('head: title, description, canonical, share image, JSON-LD; one h1', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Pyreon: your component runs once')
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://pyreon.dev/')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://pyreon.dev/media/og/home.png')
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/site.webmanifest')
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
    const types = ld.flatMap((t) => [JSON.parse(t)].flat().map((x: { '@type': string }) => x['@type']))
    expect(types).toEqual(expect.arrayContaining(['WebSite', 'Organization']))
    await expect(page.locator('h1')).toHaveCount(1)
    // Heading levels never skip (h1 → h2 → h3).
    const levels = await page.locator('main h1, main h2, main h3, main h4').evaluateAll((els) => els.map((e) => Number(e.tagName[1])))
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!, `heading ${i}`).toBeLessThanOrEqual(1)
  })

  test('every section of _home.json renders, in order', async ({ page }) => {
    await page.goto('/')
    const content = JSON.parse(readFileSync(resolve(__dirname, '../docs/src/site/content/_home.json'), 'utf8')) as { sections: { id: string; title: string }[] }
    for (const s of content.sections) await expect(page.locator(`h1, h2`).filter({ hasText: s.title.split('.')[0]! }).first()).toBeAttached()
  })

  test('the counter is real: the component runs once, every click is one text node write', async ({ page }) => {
    await page.goto('/')
    const counter = page.locator('.s-counter')
    await counter.scrollIntoViewIfNeeded()
    await waitForIsland(page, '.s-counter')
    const value = (label: string) => counter.locator('.s-counter-metric', { hasText: label }).locator('b')
    await expect(value('component runs')).toHaveText('1')
    await expect(value('text node writes')).toHaveText('0')
    const plus = counter.getByRole('button', { name: 'Increment' })
    await plus.click()
    await plus.click()
    await plus.click()
    await expect(counter.locator('output')).toHaveText('3')
    await expect(value('text node writes')).toHaveText('3')
    await counter.getByRole('button', { name: 'Decrement' }).click()
    await expect(counter.locator('output')).toHaveText('2')
    await expect(value('text node writes')).toHaveText('4')
    await expect(value('component runs')).toHaveText('1')
  })

  test('copy buttons copy their command and say so', async ({ browser }) => {
    const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await ctx.newPage()
    await page.goto('/')
    await waitForNav(page)
    // By class: the accessible name changes on click, so a name locator would lose it.
    const copy = page.locator('#hero .s-copy')
    await expect(copy).toHaveAccessibleName('Copy npm create @pyreon/zero@latest')
    await page.locator('#hero .s-copy[data-hydrated]').waitFor({ state: 'attached' })
    await copy.click()
    await expect(copy).toHaveAccessibleName(/^Copied: /)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm create @pyreon/zero@latest')
    await ctx.close()
  })

  test('the loop plays the file for the theme, swaps it with the theme, and has a pause button', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto('/')
    await waitForNav(page)
    const video = page.locator('#hero video')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/three-targets-dark\.(webm|mp4)$/)
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
    await page.getByTestId('theme-toggle').click()
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/three-targets-light\.(webm|mp4)$/)
    const toggle = page.locator('#hero').getByRole('button', { name: 'Pause the video' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
    await ctx.close()
  })

  test('under reduced motion the loop does not start and the poster stays', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto('/')
    await waitForNav(page)
    await page.waitForTimeout(800)
    const video = page.locator('#hero video')
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
    await expect(page.locator('#hero figure picture img').filter({ visible: true })).toHaveCount(1)
    await expect(page.locator('#hero').getByRole('button', { name: 'Pause the video' })).toHaveAttribute('aria-pressed', 'true')
    await ctx.close()
  })

  test('on a phone the hero shows the trace and the platforms section carries the loop', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto('/')
    await expect(page.locator('#hero video')).toBeHidden()
    await expect(page.locator('#hero svg[role=img]').first()).toBeVisible()
    await expect(page.locator('#platforms figure')).toBeAttached()
    await ctx.close()
  })
})

test.describe('404', () => {
  test('an unknown URL gets the branded 404 with a way out', async ({ page }) => {
    const res = await page.goto('/no-such-page')
    expect(res?.status()).toBe(404)
    await expect(page.locator('h1')).toContainText('404')
    await expect(page.locator('h1')).toContainText('signal not found')
    await expect(page.locator('.s-nf-art svg[role=img]')).toBeVisible()
    await expect(page.locator('.s-nf-links a')).toHaveCount(4)
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/)
  })
})

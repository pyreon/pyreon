import { expect, test } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { waitForIsland, waitForNav } from './site-islands'

/**
 * pyreon.dev homepage and the static-page architecture, against the
 * production SSG build (e2e-configs/docs.config.ts serves it like pyreon.dev).
 *
 *   - build output: the routes, robots.txt, sitemap, icons, share images;
 *   - what a static page may preload and link (the shell's own graph only);
 *   - the homepage: head tags, one h1, the live counter, the copy buttons,
 *     the loop (theme and reduced motion), the 404.
 */
const DIST = resolve(__dirname, '../docs/dist')

/**
 * How MUCH JavaScript a page loads is not asserted here. Each page's bytes are
 * measured by `e2e/site-sizes.measure.ts` and judged by `check-site-budgets`
 * against `scripts/size-budgets/sites/docs.json`: a pull request on the bytes
 * it adds, the default branch against the ceiling. A byte constant in this
 * spec failed every open pull request once the default branch reached it.
 */

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

  test('a static page preloads only the entry graph, links no docs stylesheet and carries no loader data', () => {
    const pages = htmlFiles(DIST).filter((f) => readFileSync(f, 'utf8').includes('data-site-static'))
    expect(pages.length).toBeGreaterThan(5)
    const entry = /<script[^>]*type="module"[^>]*src="\/(assets\/[^"]+\.js)"/.exec(readFileSync(join(DIST, 'index.html'), 'utf8'))?.[1]
    expect(entry).toBeTruthy()

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
    // A title may carry a `{{@key}}` placeholder for a derived count (docs/src/site/derived.ts): any number matches it here.
    const heading = (title: string) => new RegExp(title.split('.')[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\\\{@\w+\\\}\\\}/g, '\\d+'))
    for (const s of content.sections) await expect(page.locator(`h1, h2`).filter({ hasText: heading(s.title) }).first()).toBeAttached()
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

  test('on a phone the hero lists the three targets as text and the platforms section carries the loop', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto('/')
    await expect(page.locator('#hero video')).toBeHidden()
    // The trace illustration's labels were 4-8px tall at this width: the hero
    // carries the same three targets as text, at a readable size.
    const targets = page.locator('#hero ul[aria-label="The three targets"]').filter({ visible: true }).locator('li')
    await expect(targets).toHaveCount(3)
    await expect(targets.first()).toBeVisible()
    for (const size of await targets.evaluateAll((lis) => lis.map((li) => Number.parseFloat(getComputedStyle(li).fontSize)))) expect(size).toBeGreaterThanOrEqual(12)
    await expect(page.locator('#platforms figure')).toBeAttached()
    await ctx.close()
  })
})

/**
 * The stat blocks (kit/stat.tsx: the proof band's cells and the stat cards)
 * and the badge (kit/badge.tsx), measured in a real browser on a phone.
 */
test.describe('stat blocks and badges', () => {
  type StatLayout = { label: string; inset: number; edges: { part: string; left: number }[]; html: string[]; drawn: string[]; artOverflow: number; svgTextOut: string[] }

  /** Every stat block on the page: the left edge of each part relative to its surface, and the leaf texts. */
  const statLayouts = (page: import('@playwright/test').Page) =>
    page.locator('[data-stat]').evaluateAll((heads): StatLayout[] =>
      heads.map((head) => {
        const surface = head.parentElement as HTMLElement
        const box = surface.getBoundingClientRect()
        const edges: { part: string; left: number }[] = []
        for (const child of Array.from(surface.children) as HTMLElement[]) {
          const r = child.getBoundingClientRect()
          if (r.width === 0) continue
          edges.push({ part: child.tagName.toLowerCase() + (child.textContent ?? '').trim().slice(0, 24), left: Math.round(r.left - box.left) })
          // A chart's own first text column (the "LOWER IS BETTER" eyebrow, the row labels) starts at x=0 of its drawing.
          const svg = child.querySelector('svg')
          const first = svg?.querySelector('text')
          if (first) edges.push({ part: `chart text "${(first.textContent ?? '').slice(0, 20)}"`, left: Math.round(first.getBoundingClientRect().left - box.left) })
        }
        const leafTexts = (sel: string) =>
          Array.from(surface.querySelectorAll(sel))
            .filter((e) => e.children.length === 0)
            .map((e) => (e.textContent ?? '').trim())
            .filter((t) => t.length > 0)
        const art = surface.querySelector<HTMLElement>('[data-art]')
        const svg = surface.querySelector('svg')
        const svgBox = svg?.getBoundingClientRect()
        const svgTextOut = svg && svgBox
          ? Array.from(svg.querySelectorAll('text')).filter((t) => t.getBoundingClientRect().right > svgBox.right + 0.5).map((t) => t.textContent ?? '')
          : []
        return {
          label: (head.textContent ?? '').trim().slice(0, 40),
          inset: Math.round(head.getBoundingClientRect().left - box.left),
          edges,
          html: leafTexts('span, h3, p'),
          drawn: leafTexts('svg text'),
          artOverflow: art ? art.scrollWidth - art.clientWidth : 0,
          svgTextOut,
        }
      }),
    )

  for (const width of [320, 375]) {
    test(`at ${width}px every part of a stat block shares the surface's one inset, and the chart fits`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } })
      const page = await ctx.newPage()
      await page.goto('/')
      const blocks = await statLayouts(page)
      expect(blocks.length, 'stat blocks on the homepage').toBeGreaterThanOrEqual(8)
      for (const b of blocks) {
        // One inset per surface: the numeral, the caption, the chart and the chart's own text
        // all start at it (a chart used to bleed into the padding: two left edges).
        for (const e of b.edges) expect(Math.abs(e.left - b.inset), `${b.label}: ${e.part} starts at ${e.left}px, the numeral at ${b.inset}px`).toBeLessThanOrEqual(1)
        // Scaled down on a phone: 16px, not the 22px tablet inset.
        expect(b.inset, `${b.label}: inset`).toBeLessThanOrEqual(17)
        expect(b.artOverflow, `${b.label}: the chart scrolls in its box`).toBeLessThanOrEqual(0)
        expect(b.svgTextOut, `${b.label}: chart labels past the drawing`).toEqual([])
      }
      await ctx.close()
    })
  }

  test('a stat block states its run condition once (the chart footnote carries it when there is a chart)', async ({ page }) => {
    await page.goto('/')
    for (const b of await statLayouts(page)) {
      // A printed line repeated as a line, or as the first `·` part of the chart's footnote.
      // (The chart redrawing the numbers is the point of the chart: an exact match in the drawing is fine.)
      for (const note of new Set(b.html)) {
        const repeats = [...b.html.filter((t) => t === note), ...[...b.html, ...b.drawn].filter((t) => t.startsWith(`${note} · `))]
        expect(repeats, `${b.label}: "${note}" printed ${repeats.length} times`).toHaveLength(1)
      }
    }
  })

  for (const path of ['/products/charts/', '/compare/react/', '/benchmarks/']) {
    test(`${path}: a gradient badge paints one gradient from its border box, at the weight of every other badge`, async ({ page }) => {
      await page.goto(path)
      const badges = await page.locator('span').evaluateAll((els) =>
        els
          .filter((e) => {
            const cs = getComputedStyle(e)
            return cs.borderRadius.startsWith('9999') && cs.borderTopStyle === 'solid' && e.children.length === 0 && (e.textContent ?? '').trim() !== ''
          })
          .map((e) => {
            const cs = getComputedStyle(e)
            return { text: e.textContent, gradient: cs.backgroundImage.includes('gradient'), origin: cs.backgroundOrigin, repeat: cs.backgroundRepeat, weight: cs.fontWeight, border: cs.borderTopWidth }
          }),
      )
      const filled = badges.filter((b) => b.gradient)
      expect(filled.length, 'gradient badges').toBeGreaterThan(0)
      for (const b of filled) {
        // With the padding-box origin the gradient tiles under the 1px transparent border: the
        // opposite stop shows at each rounded end and a seam runs along the padding edge.
        expect(b.origin, `"${b.text}" background-origin`).toBe('border-box')
        expect(b.repeat, `"${b.text}" background-repeat`).toBe('no-repeat')
      }
      // Semibold JetBrains Mono at 10.5px draws the "I" of WIN heavier than W and N.
      expect(new Set(badges.map((b) => b.weight)), 'badge weights').toEqual(new Set(['400']))
    })
  }
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

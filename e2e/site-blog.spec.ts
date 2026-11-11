import { expect, type Browser, type Page, test } from '@playwright/test'
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import blogCopy from '../docs/src/site/content/pages/channels/blog.json'
import { auditContrast } from './site-audit'
import { waitForIsland, waitForNav } from './site-islands'

/**
 * pyreon.dev/blog in the canvas's `Blog.html` / `Blog post.html` layout, on
 * two production builds (e2e-configs/docs.config.ts):
 *
 *   - docs/dist-scheduled, built on 12 Nov 2026, before the first post's
 *     date: no post is published. The index still has its hero, every post
 *     under "Up next" (not linked) and the subscribe strip; no post has a
 *     page, a feed item, a sitemap entry or its URL anywhere in the build.
 *     Served here on its own port by the same static server.
 *   - docs/dist (the served build, every post published): the featured post,
 *     the tag filter, and a post's rail (table of contents, copy link), bench
 *     block, pull quote and closing card.
 */
const ROOT = resolve(__dirname, '..')
const DIST = resolve(ROOT, 'docs/dist')
const SCHEDULED = resolve(ROOT, 'docs/dist-scheduled')
const POSTS_DIR = resolve(ROOT, 'docs/src/content/blog')
const SCHEDULED_PORT = 5192
const SCHEDULED_URL = `http://localhost:${SCHEDULED_PORT}`
const WIDTHS = [320, 390, 768, 1024, 1440]
const slugs = readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -3))

/** A post's title, description and date from its frontmatter (every post quotes its strings). */
function front(slug: string): { slug: string; title: string; description: string; date: string } {
  const src = readFileSync(join(POSTS_DIR, `${slug}.md`), 'utf8')
  const get = (key: string) => src.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1] ?? ''
  return { slug, title: JSON.parse(get('title')) as string, description: JSON.parse(get('description')) as string, date: get('date') }
}
/** Every post, soonest first: what "Up next" lists before the first date. */
const planned = slugs.map(front).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title, 'en')))
/** `16 November 2026`, as the site prints a day (en-GB, UTC). */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
/** The reading time a post shows once it is published (the served build has every post). */
const minutesOf = (slug: string) => readFileSync(join(DIST, `blog/${slug}/index.html`), 'utf8').match(/(\d+) min read/)?.[1]

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && /hydrat|mismatch|\[Pyreon\]/i.test(m.text()))) errors.push(m.text())
  })
  return errors
}

async function themed(browser: Browser, theme: 'dark' | 'light', width = 1440) {
  const ctx = await browser.newContext({ colorScheme: theme, viewport: { width, height: 900 } })
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('pyreon-theme', t)
    } catch {}
  }, theme)
  return ctx
}

/** Every text file of a build (HTML, JS, JSON, XML, txt). */
function textFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...textFiles(p))
    else if (/\.(html|js|mjs|json|xml|txt|css)$/.test(name)) out.push(p)
  }
  return out
}

async function noHorizontalScroll(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test.describe('a build before the first post (docs/dist-scheduled)', () => {
  let server: ChildProcess | undefined

  test.beforeAll(async () => {
    expect(existsSync(join(SCHEDULED, 'blog/index.html')), 'build docs/dist-scheduled first (e2e-configs/docs.config.ts)').toBe(true)
    server = spawn('bun', ['scripts/serve-ssg.ts', 'docs/dist-scheduled', String(SCHEDULED_PORT)], { cwd: ROOT, stdio: 'ignore' })
    await expect.poll(async () => fetch(`${SCHEDULED_URL}/blog`).then((r) => r.status).catch(() => 0), { timeout: 15_000 }).toBe(200)
  })

  test.afterAll(() => {
    server?.kill()
  })

  test('no post has a page, a feed item or a sitemap entry, and no post URL is anywhere in the build', async () => {
    const rss = readFileSync(join(SCHEDULED, 'blog/rss.xml'), 'utf8')
    expect(rss).not.toContain('<item>')
    const sitemap = readFileSync(join(SCHEDULED, 'sitemap.xml'), 'utf8')
    expect(sitemap).toContain('<loc>https://pyreon.dev/blog</loc>')
    for (const slug of slugs) {
      expect(existsSync(join(SCHEDULED, `blog/${slug}`)), slug).toBe(false)
      const res = await fetch(`${SCHEDULED_URL}/blog/${slug}`)
      expect(res.status, `/blog/${slug}`).toBe(404)
    }
    const urls = new RegExp(`/blog/(${slugs.join('|')})\\b`)
    for (const f of textFiles(SCHEDULED)) expect(readFileSync(f, 'utf8').match(urls)?.[0], f).toBeUndefined()
  })

  test('/blog shows the hero, every post under "Up next" (not linked) and the subscribe strip', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto(`${SCHEDULED_URL}/blog`)
    await waitForNav(page)
    await expect(page.locator('h1')).toHaveText(blogCopy.hero.title)
    const next = page.locator('[data-up-next]')
    await expect(next.getByRole('heading', { level: 2, name: blogCopy.upNext.title })).toBeVisible()
    const cards = next.locator('li')
    await expect(cards).toHaveCount(planned.length)
    for (const [i, p] of planned.entries()) {
      const card = cards.nth(i)
      await expect(card.getByRole('heading', { level: 3 })).toHaveText(p.title)
      await expect(card).toContainText(p.description)
      // The reading time is estimated from the source; it must match the post's own label once published.
      await expect(card).toContainText(`${minutesOf(p.slug)} min read`)
      // The chip reads with its spaces, as rendered (a flex chip once dropped the one before the date).
      const chip = card.locator('[data-planned] time').locator('..')
      expect(await chip.evaluate((el) => (el as HTMLElement).innerText.toLowerCase())).toBe(
        blogCopy.upNext.planned.replace('{date}', day(p.date)).toLowerCase(),
      )
      await expect(card.locator('time')).toHaveAttribute('datetime', p.date)
    }
    expect(await page.locator('#site-main a[href^="/blog/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')).filter((h) => !/\/rss\.xml$/.test(h ?? '')))).toEqual([])
    const strip = page.getByRole('complementary', { name: blogCopy.subscribe.title })
    await expect(strip.locator('a[href="/blog/rss.xml"]')).toBeVisible()
    await expect(strip.locator('a[href="https://github.com/pyreon/pyreon/releases"]')).toBeVisible()
    // Heading levels never skip.
    const levels = await page.locator('#site-main :is(h1, h2, h3, h4)').evaluateAll((els) => els.map((e) => Number(e.tagName[1])))
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!, `heading ${i}`).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })

  for (const width of WIDTHS) {
    test(`/blog has no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${SCHEDULED_URL}/blog`)
      expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0)
    })
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`/blog passes WCAG AA (${theme})`, async ({ browser }) => {
      const ctx = await themed(browser, theme)
      const page = await ctx.newPage()
      await page.goto(`${SCHEDULED_URL}/blog`)
      await page.waitForTimeout(500)
      expect(await page.evaluate(auditContrast)).toEqual([])
      await ctx.close()
    })
  }
})

test.describe('a build with every post published (docs/dist)', () => {
  const newest = (): string => {
    const rss = readFileSync(join(DIST, 'blog/rss.xml'), 'utf8')
    return rss.match(/<link>https:\/\/pyreon\.dev\/blog\/([a-z0-9-]+)<\/link>/)?.[1] ?? ''
  }

  test('/blog features the newest post with its cover, and plans nothing', async ({ page }) => {
    await page.goto('/blog')
    const featured = page.locator('#site-main a:has([data-featured])')
    await expect(featured).toHaveAttribute('href', `/blog/${newest()}`)
    await expect(featured.locator('h2')).toBeVisible()
    await expect(featured).toContainText(blogCopy.latest, { ignoreCase: true })
    await expect(featured.locator('picture img')).toHaveAttribute('src', `/blog/covers/${newest()}.png`)
    await expect(page.locator('[data-up-next]')).toHaveCount(0)
  })

  test('the tag filter: the most-used tags, the current one marked, a rarer tag shown on its own page', async ({ page }) => {
    await page.goto('/blog')
    const filter = page.getByRole('navigation', { name: blogCopy.tagsLabel })
    const chips = filter.getByRole('link')
    expect(await chips.count()).toBeLessThanOrEqual(9)
    await expect(chips.first()).toHaveAttribute('aria-current', 'page')
    const shown = await chips.evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    const rare = readdirSync(join(DIST, 'blog/tags')).find((t) => !shown.includes(`/blog/tags/${t}`))
    expect(rare, 'a tag outside the index filter').toBeDefined()
    await page.goto(`/blog/tags/${rare}`)
    await expect(page.getByRole('navigation', { name: blogCopy.tagsLabel }).locator(`a[href="/blog/tags/${rare}"]`)).toHaveAttribute('aria-current', 'page')
  })

  test.describe('a post', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] })
    const POST = '/blog/we-keep-retracting-our-benchmark-wins'

    test('the rail marks the section being read as the page scrolls, and copies the link', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(POST)
      await waitForIsland(page, '[data-blog-tools]')
      const toc = page.getByRole('navigation', { name: blogCopy.post.toc })
      const links = toc.locator('a')
      expect(await links.count()).toBeGreaterThan(4)
      const href = (await links.nth(4).getAttribute('href')) ?? ''
      await page.locator(`[id="${decodeURIComponent(href.slice(1))}"]`).evaluate((h) => window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 60))
      await expect(links.nth(4)).toHaveAttribute('aria-current', 'location')
      await expect(toc.locator('a[aria-current]')).toHaveCount(1)
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect(toc.locator('a[aria-current]')).toHaveCount(0)

      const copy = page.locator('[data-blog-tools]')
      await expect(copy).toBeVisible()
      await expect(page.locator('[data-copy-link]')).toBeHidden()
      // A button, not a link: the plain pill must not keep the browser's grey button fill.
      expect(await copy.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      await copy.click()
      await expect(copy).toHaveText(blogCopy.post.copied)
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://pyreon.dev${POST}`)
    })

    test('below 992px the rail is hidden and the end row copies the link', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 })
      await page.goto(POST)
      await waitForIsland(page, '[data-blog-tools]')
      await expect(page.getByRole('navigation', { name: blogCopy.post.toc })).toBeHidden()
      const copy = page.locator('[data-copy-link]')
      await copy.scrollIntoViewIfNeeded()
      await copy.click()
      await expect(copy).toHaveText(blogCopy.post.copied)
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://pyreon.dev${POST}`)
    })

    test('a bench block: one row per result, the number big in the ember gradient, a link to /benchmarks', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(POST)
      const bench = page.locator('[data-bench]').first()
      const rows = bench.locator('li')
      await expect(rows).toHaveCount(3)
      const number = rows.first().locator('strong').first()
      await expect(number).toHaveText('130 µs')
      const n = await number.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { size: Number.parseFloat(cs.fontSize), clip: cs.backgroundClip, image: cs.backgroundImage }
      })
      expect(n.size).toBeGreaterThanOrEqual(30)
      expect(n.clip).toBe('text')
      expect(n.image).toMatch(/linear-gradient/)
      // The text of every row starts at the same x (the number column has one width).
      const starts = await rows.evaluateAll((lis) =>
        lis.map((li) => {
          const r = document.createRange()
          const text = [...(li.querySelector('p') ?? li).childNodes].find((c) => c.nodeType === 3 && c.textContent!.trim()) as Text
          r.setStart(text, text.textContent!.search(/\S/))
          r.setEnd(text, text.textContent!.search(/\S/) + 1)
          return Math.round(r.getBoundingClientRect().left)
        }),
      )
      expect(new Set(starts).size).toBe(1)
      await expect(bench.locator('a[href="/benchmarks"]')).toHaveText(blogCopy.bench.more)
    })

    test('a bold one-line quote is a pull quote; a note in a quote stays at text size', async ({ page }) => {
      await page.goto('/blog/where-pyreon-is-not-the-fastest')
      const sizes = await page.locator('[data-blog-body] blockquote').evaluateAll((qs) =>
        qs.map((q) => ({ pull: q.querySelector(':scope > p:only-child > strong:only-child') !== null, size: Number.parseFloat(getComputedStyle(q).fontSize) })),
      )
      expect(sizes.some((s) => s.pull)).toBe(true)
      expect(sizes.some((s) => !s.pull)).toBe(true)
      for (const s of sizes) {
        if (s.pull) expect(s.size).toBeGreaterThanOrEqual(24)
        else expect(s.size).toBeLessThanOrEqual(18)
      }
    })

    test('the closing card, then the posts to read next', async ({ page }) => {
      await page.goto(POST)
      const cta = page.getByRole('complementary', { name: blogCopy.post.cta.title })
      await expect(cta.locator(`a[href="${blogCopy.post.cta.link.href}"]`)).toHaveText(blogCopy.post.cta.link.label)
      const more = page.getByRole('navigation', { name: blogCopy.post.more })
      const hrefs = await more.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
      expect(hrefs.length).toBeGreaterThan(0)
      for (const h of hrefs) expect(slugs).toContain(String(h).slice('/blog/'.length))
    })

    for (const theme of ['dark', 'light'] as const) {
      test(`the bench post passes WCAG AA (${theme})`, async ({ browser }) => {
        test.setTimeout(90_000)
        const ctx = await themed(browser, theme)
        const page = await ctx.newPage()
        await page.goto(POST)
        await page.waitForTimeout(500)
        expect(await page.evaluate(auditContrast)).toEqual([])
        await ctx.close()
      })
    }

    for (const width of WIDTHS) {
      test(`the bench post has no horizontal scroll at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(POST)
        expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0)
      })
    }
  })
})

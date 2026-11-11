import { expect, type Browser, type Page, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SITE_LINKS } from '../docs/src/site-links'
import { waitForIsland, waitForNav } from './site-islands'

/**
 * pyreon.dev blog, showcase, open stats and stable-link pages, against the
 * production SSG build (e2e-configs/docs.config.ts, built with
 * PYREON_CONTENT_NOW far in the future so every scheduled post, its tag pages
 * and the second index page exist): every page is prerendered with its own
 * head; the islands (nav, copy buttons, the post tools, the download chart)
 * hydrate with no errors and work by keyboard and pointer; no horizontal page
 * scroll at the five design widths; post bodies keep a readable measure and
 * the dark syntax theme; every text node passes WCAG AA in both themes.
 */
const WIDTHS = [320, 390, 768, 1024, 1440]
const DIST = resolve(__dirname, '../docs/dist')

/** Published posts of this build, newest first, read from its RSS feed. */
function postsOfBuild(): string[] {
  const rss = readFileSync(resolve(DIST, 'blog/rss.xml'), 'utf8')
  return [...rss.matchAll(/<link>https:\/\/pyreon\.dev\/blog\/([a-z0-9-]+)<\/link>/g)].map((m) => m[1] as string)
}

const posts = postsOfBuild()
const POST = '/blog/components-run-once'
const TAG = '/blog/tags/javascript'
const ROUTES = ['/blog', '/blog/page/2', POST, TAG, '/showcase', '/open', '/discord', '/newsletter']

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

async function themed(browser: Browser, theme: 'dark' | 'light', width = 1440) {
  const ctx = await browser.newContext({ colorScheme: theme, viewport: { width, height: 900 } })
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('pyreon-theme', t)
    } catch {}
  }, theme)
  return ctx
}

test.describe('build output', () => {
  test('the build has the scheduled posts (PYREON_CONTENT_NOW) and a second index page', () => {
    expect(posts.length, 'build the e2e site with PYREON_CONTENT_NOW set past the last post').toBeGreaterThan(10)
    expect(posts).toContain('components-run-once')
    for (const slug of posts) expect(existsSync(resolve(DIST, `blog/${slug}/index.html`)), slug).toBe(true)
    expect(existsSync(resolve(DIST, 'blog/page/2/index.html'))).toBe(true)
  })

  test('each page sets its own title, canonical and share image, and has one h1', () => {
    for (const route of ROUTES) {
      const html = readFileSync(resolve(DIST, `${route.slice(1)}/index.html`), 'utf8')
      const key = route.slice(1) as keyof typeof SITE_LINKS
      if (key in SITE_LINKS && SITE_LINKS[key] !== null) {
        expect(html).toContain(`http-equiv="refresh" content="0; url=${SITE_LINKS[key]}"`)
        continue
      }
      expect(html, route).toContain(`<link rel="canonical" href="https://pyreon.dev${route}"`)
      expect(html, route).toMatch(/<meta property="og:image" content="https:\/\/pyreon\.dev\/[^"]+\.png"/)
      expect(html, route).toMatch(/<title>[^<]+<\/title>/)
      expect((html.match(/<h1[\s>]/g) ?? []).length, `${route} has one h1`).toBe(1)
    }
  })

  test('the old marketing styles are gone: no page links the blog module stylesheet or the old classes', () => {
    for (const route of ROUTES) {
      const html = readFileSync(resolve(DIST, `${route.slice(1)}/index.html`), 'utf8')
      expect(html, route).not.toMatch(/class="[^"]*\b(site-page|site-button|pyreon-blog|open-tile|showcase-card)\b/)
    }
  })

  test('the sitemap lists every page, and leaves out a stable link once it redirects', () => {
    const sitemap = readFileSync(resolve(DIST, 'sitemap.xml'), 'utf8')
    for (const route of ['/blog', POST, TAG, '/showcase', '/open']) expect(sitemap, route).toContain(`<loc>https://pyreon.dev${route}</loc>`)
    for (const key of Object.keys(SITE_LINKS) as (keyof typeof SITE_LINKS)[]) {
      expect(sitemap.includes(`<loc>https://pyreon.dev/${key}</loc>`), key).toBe(SITE_LINKS[key] === null)
    }
  })
})

test.describe('pages render with no errors', () => {
  for (const route of ROUTES) {
    test(route, async ({ page }) => {
      const errors = collectErrors(page)
      await page.goto(route)
      await waitForNav(page)
      await expect(page.locator('h1')).toBeVisible()
      await scrollThrough(page)
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
        await scrollThrough(page)
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(scroll, `${route} at ${width}px`).toBeLessThanOrEqual(0)
      }
    })
  }
})

test.describe('/blog', () => {
  test('the newest post is featured and every post is linked once across the pages', async ({ page }) => {
    await page.goto('/blog')
    const featured = page.locator('#site-main a[href^="/blog/"]').filter({ has: page.locator('h2') }).first()
    await expect(featured).toHaveAttribute('href', `/blog/${posts[0]}`)
    const hrefs = new Set<string>()
    for (const route of ['/blog', '/blog/page/2']) {
      await page.goto(route)
      for (const h of await page.locator('#site-main ol a[href^="/blog/"], #site-main a:has(h2)[href^="/blog/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))) {
        if (!/\/(tags|page)\//.test(h)) hrefs.add(h)
      }
    }
    expect([...hrefs].sort()).toEqual(posts.map((s) => `/blog/${s}`).sort())
  })

  test('a tag chip opens its page by keyboard; the pager by pointer', async ({ page }) => {
    await page.goto('/blog')
    const tags = page.getByRole('navigation', { name: 'Browse posts by tag' })
    await expect(tags.getByRole('link', { name: 'all posts' })).toHaveAttribute('aria-current', 'page')
    const chip = tags.locator('a[href="/blog/tags/javascript"]')
    await chip.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/blog\/tags\/javascript$/)
    await expect(page.locator('h1')).toHaveText('Posts tagged #javascript')
    await expect(page.getByRole('navigation', { name: 'Browse posts by tag' }).locator('a[href="/blog/tags/javascript"]')).toHaveAttribute('aria-current', 'page')

    await page.goto('/blog')
    await page.getByRole('link', { name: 'Older posts →' }).click()
    await expect(page).toHaveURL(/\/blog\/page\/2$/)
    await expect(page.getByText('Page 2 of 2')).toBeVisible()
    await page.getByRole('link', { name: '← Newer posts' }).click()
    await expect(page).toHaveURL(/\/blog$/)
  })
})

test.describe('a blog post', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('the body keeps a readable measure and type size', async ({ page }) => {
    await page.goto(POST)
    const m = await page.evaluate(() => {
      const p = document.querySelector('[data-blog-body] > p') as HTMLElement
      const cs = getComputedStyle(p)
      const probe = document.createElement('span')
      probe.textContent = 'abcdefghijklmnopqrstuvwxyz'.repeat(4)
      probe.style.font = cs.font
      probe.style.position = 'absolute'
      document.body.append(probe)
      const charWidth = probe.getBoundingClientRect().width / 104
      probe.remove()
      return { size: Number.parseFloat(cs.fontSize), lineHeight: Number.parseFloat(cs.lineHeight) / Number.parseFloat(cs.fontSize), chars: p.getBoundingClientRect().width / charWidth }
    })
    expect(m.size).toBeGreaterThanOrEqual(17)
    expect(m.lineHeight).toBeGreaterThanOrEqual(1.6)
    expect(m.chars).toBeGreaterThan(55)
    expect(m.chars).toBeLessThanOrEqual(80)
  })

  test('code uses the dark syntax colours on the dark theme', async ({ browser }) => {
    const ctx = await themed(browser, 'dark')
    const page = await ctx.newPage()
    await page.goto(POST)
    const token = page.locator('.code-block pre .line span[style*="--shiki-dark"]').first()
    const { inline, dark, shown } = await token.evaluate((el) => ({
      inline: (el as HTMLElement).style.color,
      dark: (el as HTMLElement).style.getPropertyValue('--shiki-dark').trim(),
      shown: getComputedStyle(el).color,
    }))
    const hex = (rgb: string) => `#${(rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
    expect(hex(shown)).toBe(dark.toUpperCase())
    expect(hex(shown)).not.toBe(hex(inline))
    await ctx.close()
  })

  test('the table of contents jumps by pointer and marks the section being read', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(POST)
    await waitForIsland(page, '[data-blog-tools]')
    const toc = page.getByRole('navigation', { name: 'In this post' })
    const third = toc.locator('a').nth(2)
    const hash = (await third.getAttribute('href')) ?? ''
    await third.click()
    await expect(page).toHaveURL(new RegExp(`${hash}$`))
    await expect(third).toHaveAttribute('aria-current', 'location')
    await expect(toc.locator('a[aria-current]')).toHaveCount(1)
  })

  test('a code block copies by keyboard, the post link by pointer', async ({ page }) => {
    await page.goto(POST)
    await waitForIsland(page, '[data-blog-tools]')
    const block = page.locator('.code-block').first()
    const copy = block.locator('.code-block__copy')
    await copy.focus()
    await page.keyboard.press('Enter')
    await expect(copy).toHaveText('Copied')
    const code = (await block.locator('pre').textContent()) ?? ''
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code)

    const link = page.locator('[data-blog-tools]')
    await link.click()
    await expect(link).toHaveText('Copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://pyreon.dev${POST}`)
  })

  test('share links are plain intent URLs and the posts to read next exist', async ({ page }) => {
    await page.goto(POST)
    for (const host of ['x.com', 'bsky.app', 'linkedin.com', 'mastodon.social']) {
      await expect(page.locator(`a[href*="${host}"]`).first()).toHaveAttribute('href', new RegExp(encodeURIComponent(`https://pyreon.dev${POST}`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    const next = page.getByRole('heading', { name: 'Keep reading' })
    await expect(next).toBeVisible()
    for (const href of await page.locator('#site-main a:has(h3)[href^="/blog/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      expect(posts).toContain(String(href).slice('/blog/'.length))
    }
  })
})

test.describe('/showcase', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('the captures load and a command copies by keyboard', async ({ page }) => {
    await page.goto('/showcase')
    await scrollThrough(page)
    const shots = page.locator('#site-main figure img')
    expect(await shots.count()).toBeGreaterThanOrEqual(5)
    for (const img of await shots.all()) {
      await img.scrollIntoViewIfNeeded()
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      expect((await img.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(20)
    }
    const button = page.locator('#site-main .s-copy').first()
    await button.scrollIntoViewIfNeeded()
    await page.locator('#site-main .s-copy[data-hydrated]').first().waitFor({ state: 'attached' })
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(button).toHaveText('copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('git clone https://github.com/pyreon/pyreon.git')
  })

  test('every example links its source on GitHub', async ({ page }) => {
    await page.goto('/showcase')
    const sources = await page.locator('a[href^="https://github.com/pyreon/pyreon/tree/main/examples/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    for (const dir of ['app-showcase', 'hn-clone', 'collab-board', 'native-tasks-web', 'react-compat']) expect(sources).toContain(`https://github.com/pyreon/pyreon/tree/main/examples/${dir}`)
  })
})

test.describe('/open', () => {
  test('every tile shows a number or says it is unavailable, never a blank', async ({ page }) => {
    await page.goto('/open')
    const values = await page.locator('[data-open-value]').allTextContents()
    expect(values.length).toBeGreaterThanOrEqual(16)
    for (const v of values) expect(v.trim()).toMatch(/^([\d.,]+|unavailable right now)$/)
    await expect(page.locator('#site-main time').first()).toHaveText(/\d{4}, \d\d:\d\d UTC$/)
  })

  test('the download chart island draws, or the page says the history is missing', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/open')
    const figure = page.locator('#site-main figure')
    if ((await figure.count()) === 0) {
      await expect(page.getByText('The download history is unavailable in this build.')).toBeVisible()
      return
    }
    await figure.scrollIntoViewIfNeeded()
    await expect(figure.locator('canvas, svg').first()).toBeVisible()
    expect(errors).toEqual([])
  })
})

test.describe('/discord and /newsletter', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('/newsletter copies the feed address by pointer', async ({ page }) => {
    test.skip(SITE_LINKS.newsletter !== null, 'the newsletter is open: /newsletter redirects')
    await page.goto('/newsletter')
    const button = page.locator('#site-main .s-copy')
    await button.scrollIntoViewIfNeeded()
    await page.locator('#site-main .s-copy[data-hydrated]').waitFor({ state: 'attached' })
    await button.click()
    await expect(button).toHaveText('copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://pyreon.dev/blog/rss.xml')
  })

  test('/discord sends people to GitHub while the server is not open', async ({ page }) => {
    test.skip(SITE_LINKS.discord !== null, 'the Discord is open: /discord redirects')
    await page.goto('/discord')
    await expect(page.locator('#site-main a[href="https://github.com/pyreon/pyreon/issues/new/choose"]')).toBeVisible()
    await expect(page.locator('#site-main a[href="/community"]')).toBeVisible()
  })
})

test.describe('contrast', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`every text node passes WCAG AA (${theme})`, async ({ browser }) => {
      test.setTimeout(120_000)
      const ctx = await themed(browser, theme)
      const page = await ctx.newPage()
      const failures: string[] = []
      for (const route of ROUTES) {
        await page.goto(route)
        await scrollThrough(page)
        await page.waitForTimeout(800)
        for (const f of await page.evaluate(auditContrast)) failures.push(`${route}: ${f}`)
      }
      expect(failures).toEqual([])
      await ctx.close()
    })
  }
})

/**
 * The same audit as site-pages.spec.ts: every visible text node against its
 * effective (composited) background. Text painted with a gradient, inside an
 * SVG, or on an image background is skipped.
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

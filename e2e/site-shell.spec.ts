import { expect, type Page, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditLayout, SITE_WIDTHS, TOUCH_WIDTHS, trackShiftsScript } from './site-audit'
import { waitForIslands, waitForNav } from './site-islands'

/**
 * pyreon.dev marketing shell, against the production SSG build (served like
 * pyreon.dev by e2e-configs/docs.config.ts): the nav and its two menus, the
 * mobile sheet, the theme toggle (persisted, no flash), page width and
 * clipped text at the seven widths, tap targets on touch screens, anchors
 * landing below the nav, layout shift, equal card rows, hydration adopting
 * the server DOM, and the contrast of every text node on the kit gallery,
 * the homepage and the docs in both themes.
 */
const WIDTHS = SITE_WIDTHS
/** One page of every type the site has. */
const ROUTES = [
  '/',
  '/products',
  '/products/form',
  '/products/reactivity',
  '/products/a11y',
  '/why/one-codebase',
  '/compare/react',
  '/migrate/react',
  '/benchmarks',
  '/brand/kit',
  '/blog',
  '/blog/where-pyreon-is-not-the-fastest',
  '/showcase',
  '/open',
  '/docs',
  '/docs/router',
  '/404-check',
]

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
  // Static pages whose islands adopt the server DOM: no element is removed
  // while they hydrate (the page scrolled through, so every island ran).
  // Not here, covered by the no-errors list below: /open (the chart island
  // rewrites its server-rendered accessible table rows when it draws, a
  // @pyreon/charts behaviour) and /products/form, /brand/kit (an island that
  // renders rocketstyle components through KitScope re-creates its root
  // element on hydration; the content is identical, the cause is not yet
  // narrowed).
  for (const route of ['/', '/products', '/blog']) {
    test(`${route} islands hydrate in place with no errors`, async ({ page }) => {
      await trackRemovals(page)
      const errors = collectErrors(page)
      await page.goto(route)
      await waitForNav(page)
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 50))
        }
      })
      await page.waitForTimeout(500)
      expect(errors).toEqual([])
      expect(await page.evaluate(() => (window as unknown as { __removed: number }).__removed)).toBe(0)
    })
  }
  // Pages whose content predates the redesign: no errors. They are static
  // too, so the blog index no longer hydrates as a whole (#4353 cannot reach
  // it); the showcase gallery island re-creates its live-demo links, which is
  // why it is not in the zero-removals list above.
  for (const route of ['/blog', '/showcase', '/open', '/products/form', '/brand/kit']) {
    test(`${route} hydrates with no errors`, async ({ page }) => {
      const errors = collectErrors(page)
      await page.goto(route)
      await waitForNav(page)
      await page.waitForTimeout(300)
      expect(errors).toEqual([])
    })
  }
})

test.describe('no horizontal page scroll, no clipped text', () => {
  for (const width of WIDTHS) {
    test(`at ${width}px`, async ({ page }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height: 900 })
      for (const route of ROUTES) {
        await page.goto(route)
        await waitForNav(page)
        const r = await page.evaluate(auditLayout, false)
        expect(r.scroll, `${route} scrollWidth`).toBeLessThanOrEqual(0)
        expect(r.wide, `${route} content wider than the page`).toEqual([])
        expect(r.clipped, `${route} text cut off by its box`).toEqual([])
      }
    })
  }
})

test.describe('tap targets on touch screens', () => {
  // theme.ts `touch`: below 992px every control is at least 44px tall; a
  // link inside running text is exempt (WCAG 2.5.8).
  for (const width of TOUCH_WIDTHS) {
    test(`every control is at least 44px at ${width}px`, async ({ page }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height: 900 })
      for (const route of ROUTES) {
        await page.goto(route)
        await waitForNav(page)
        await waitForIslands(page)
        const r = await page.evaluate(auditLayout, true)
        expect(r.tap, `${route} controls under 44px`).toEqual([])
      }
    })
  }
})

test.describe('anchors land below the fixed nav', () => {
  for (const [route, target] of [
    ['/products/form#benchmarks', '#benchmarks'],
    ['/products/form#demo', '#demo'],
    ['/benchmarks#ssr', '#ssr'],
    ['/blog/where-pyreon-is-not-the-fastest#1-deep-trees-cost-us-the-most', '#1-deep-trees-cost-us-the-most'],
  ] as const) {
    test(route, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(route)
      await waitForNav(page)
      // getElementById: a heading id may start with a digit, which is not a valid CSS selector.
      await page.evaluate((id) => document.getElementById(id.slice(1))!.scrollIntoView(), target)
      const [top, navBottom] = await page.evaluate((id) => [document.getElementById(id.slice(1))!.getBoundingClientRect().top, document.querySelector('.s-bar')!.getBoundingClientRect().bottom], target)
      expect(top, `${target} lands under the nav`).toBeGreaterThanOrEqual(navBottom + 8)
    })
  }
})

test.describe('layout shift', () => {
  for (const width of [390, 1440]) {
    test(`every page type settles with CLS under 0.05 at ${width}px`, async ({ browser }) => {
      test.setTimeout(180_000)
      const ctx = await browser.newContext({ viewport: { width, height: 900 } })
      await ctx.addInitScript(trackShiftsScript)
      const page = await ctx.newPage()
      const shifts: string[] = []
      for (const route of ROUTES) {
        await page.goto(route)
        await waitForNav(page)
        await waitForIslands(page)
        await page.waitForTimeout(300)
        const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
        if (cls >= 0.05) shifts.push(`${route}: ${cls.toFixed(3)}`)
      }
      expect(shifts).toEqual([])
      await ctx.close()
    })
  }
})

test.describe('cards in a row share one height', () => {
  // A kit grid's items stretch to the row (the Element base's flex-start
  // alignment used to stop them), so a row of cards ends on one line.
  for (const [route, grid] of [
    ['/products/form', 'ol'],
    ['/products', 'ul'],
    ['/', 'ul'],
  ] as const) {
    for (const width of [768, 1440]) {
      test(`${route} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(route)
        await waitForNav(page)
        const ragged = await page.evaluate((tag) => {
          const out: string[] = []
          for (const g of document.querySelectorAll<HTMLElement>(`#site-main ${tag}`)) {
            if (getComputedStyle(g).display !== 'grid') continue
            const rows = new Map<number, number[]>()
            for (const li of g.children) {
              const card = li.firstElementChild ?? li
              const b = card.getBoundingClientRect()
              if (b.height < 60) continue
              const top = Math.round(li.getBoundingClientRect().top)
              rows.set(top, [...(rows.get(top) ?? []), Math.round(b.height)])
            }
            for (const [top, hs] of rows) if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 1) out.push(`row at ${top}: ${hs.join('/')}`)
          }
          return out
        }, grid)
        expect(ragged).toEqual([])
      })
    }
  }
})

test.describe('typography', () => {
  test('a status dot stays on the line of its label (a link that wraps flows like text)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/')
    await waitForNav(page)
    const gaps = await page.evaluate(() =>
      [...document.querySelectorAll('ul[aria-label=Status] li')].map((li) => {
        const dotEl = li.querySelector('[aria-hidden=true]')!
        const dot = dotEl.getBoundingClientRect()
        // The label is everything after the dot (text or a link; hydration markers are comments).
        const range = document.createRange()
        range.setStartAfter(dotEl)
        range.setEndAfter(li.lastChild!)
        const first = [...range.getClientRects()].find((r) => r.width > 0)!
        return Math.abs(dot.top + dot.height / 2 - (first.top + first.height / 2))
      }),
    )
    for (const g of gaps) expect(g).toBeLessThan(8)
  })

  test('inline code in content renders as code, never as backticks', async ({ page }) => {
    for (const route of ['/products/form', '/products/hotkeys', '/products/http', '/why/full-stack', '/releases', '/docs/core']) {
      await page.goto(route)
      await waitForNav(page)
      const raw = await page.evaluate(() => {
        const out: string[] = []
        const walker = document.createTreeWalker(document.querySelector('#site-main')!, NodeFilter.SHOW_TEXT)
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const host = t.parentElement
          if (!host || !t.textContent?.includes('`') || host.closest('pre, code, script, style, svg, [data-raw-output]')) continue
          // Terminal transcripts print the tool's own output verbatim.
          if (host.closest('figure') && getComputedStyle(host).fontFamily.includes('Mono')) continue
          out.push(t.textContent.trim().slice(0, 60))
        }
        return out
      })
      expect(raw, route).toEqual([])
    }
  })
})

test.describe('install commands', () => {
  // The page's main call to action: never cut to "npm create @pyreon/zero…".
  // It wraps inside its pill at a sensible break instead (CommandText).
  for (const width of [320, 360, 390]) {
    test(`every install command shows its whole text at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const route of ['/', '/products', '/products/zero', '/docs/zero', '/blog']) {
        await page.goto(route)
        await waitForNav(page)
        const cut = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('#site-main .s-cmd code, #site-footer .s-cmd code')]
            .filter((c) => c.getBoundingClientRect().width > 0)
            .filter((c) => {
              const cs = getComputedStyle(c)
              return c.scrollWidth > c.clientWidth + 1 || cs.textOverflow === 'ellipsis' || (cs.whiteSpace === 'nowrap' && /hidden|clip/.test(cs.overflowX))
            })
            .map((c) => c.textContent),
        )
        expect(cut, `${route}: commands cut at ${width}px`).toEqual([])
      }
    })
  }

  test('the copy button copies the whole command', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await ctx.newPage()
    await page.goto('/')
    await waitForNav(page)
    const button = page.locator('#site-main .s-cmd button').first()
    await button.locator('xpath=ancestor-or-self::*[@data-hydrated]').first().waitFor({ state: 'attached' })
    await button.click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm create @pyreon/zero@latest')
    await ctx.close()
  })
})

test.describe('product cards', () => {
  // Rows of equal-height cards: a card without a proof number must not sit
  // half empty beside one with a number (CardFoot pins the bottom).
  for (const route of ['/products', '/']) {
    for (const width of [768, 1024, 1440, 1920]) {
      test(`${route}: no card is more than about 40% empty at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(route)
        await waitForNav(page)
        const empty = await page.evaluate(() => {
          const out: string[] = []
          for (const li of document.querySelectorAll('#site-main ul > li')) {
            const card = li.querySelector(':scope > a')
            const inner = card?.firstElementChild
            if (!card || !inner) continue
            const box = inner.getBoundingClientRect()
            if (box.height < 100) continue
            const kids = [...inner.children].map((k) => k.getBoundingClientRect()).filter((b) => b.height > 0).sort((a, b) => a.top - b.top)
            let gap = box.bottom - kids[kids.length - 1]!.bottom - Number.parseFloat(getComputedStyle(inner).paddingBottom)
            for (let i = 1; i < kids.length; i++) gap = Math.max(gap, kids[i]!.top - kids[i - 1]!.bottom)
            if (gap / box.height > 0.42) out.push(`${card.getAttribute('href')}: ${(gap / box.height).toFixed(2)}`)
          }
          return out
        })
        expect(empty).toEqual([])
      })
    }
  }
})

test.describe('hero headings at 320px', () => {
  // Display headings step down one size on the smallest phones (theme.ts
  // display.*.phone), so a hero that ends in a long word keeps two words on
  // its last line. Not listed: /products/flow ("Drag one node. / Nothing
  // else / re-renders."), whose balanced three lines cannot put two words
  // last at any hero size.
  test('no hero heading ends on a single word', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 320, height: 800 })
    const orphans: string[] = []
    for (const route of [
      '/', '/products', '/products/form', '/products/reactivity', '/products/design', '/products/native', '/products/zero',
      '/products/tooling', '/products/atlas', '/products/charts', '/products/query', '/products/router', '/products/ai',
      '/products/content', '/why/one-codebase', '/why/components-run-once', '/why/full-stack', '/why/performance',
      '/why/ai-ready', '/compare/react', '/compare/vue', '/migrate', '/migrate/react', '/benchmarks', '/blog',
    ]) {
      await page.goto(route)
      await waitForNav(page)
      const last = await page.evaluate(() => {
        const h = document.querySelector('#site-main h1')!
        const tops: number[] = []
        const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT)
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          for (const m of t.textContent!.matchAll(/\S+/g)) {
            const r = document.createRange()
            r.setStart(t, m.index!)
            r.setEnd(t, m.index! + m[0].length)
            const rect = r.getClientRects()[0]
            if (rect) tops.push(Math.round(rect.top))
          }
        }
        const lastTop = tops[tops.length - 1]!
        return { lines: new Set(tops).size, onLast: tops.filter((t) => Math.abs(t - lastTop) < 4).length, text: h.textContent!.trim() }
      })
      if (last.lines > 1 && last.onLast === 1) orphans.push(`${route}: ${last.text}`)
    }
    expect(orphans).toEqual([])
  })
})

test.describe('Products and Why menus (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('open by keyboard, links follow in tab order, Escape returns focus', async ({ page }) => {
    await page.goto('/')
    await waitForNav(page)
    const button = page.locator('[aria-controls=site-products-menu]')
    await button.focus()
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#site-products-menu')).toBeHidden()
    await page.keyboard.press('Enter')
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#site-products-menu')).toBeVisible()
    await expect(page.locator('#site-products-menu a[href^="/products/"]')).toHaveCount(42)
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toHaveAttribute('href', '/products/zero')
    await page.keyboard.press('Escape')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(button).toBeFocused()
  })

  test('one menu at a time; click outside closes', async ({ page }) => {
    await page.goto('/')
    await waitForNav(page)
    await page.click('[aria-controls=site-products-menu]')
    await page.click('[aria-controls=site-why-menu]')
    await expect(page.locator('#site-products-menu')).toBeHidden()
    await expect(page.locator('#site-why-menu')).toBeVisible()
    await page.mouse.click(700, 700)
    await expect(page.locator('#site-why-menu')).toBeHidden()
  })

  test('a menu link navigates (a document load: the page is static)', async ({ page }) => {
    await page.goto('/')
    await waitForNav(page)
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
    await waitForNav(page)
    await expect(page.locator('nav[aria-label=Primary]')).toBeHidden()
    const button = page.getByTestId('menu-button')
    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#site-sheet')).toBeVisible()
    await expect(page.locator('#site-sheet a').first()).toBeFocused()
    expect(await page.evaluate(() => (document.querySelector('#site-main') as HTMLElement).inert)).toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')
    await expect(page.locator('#site-sheet a[href^="/products/"]')).toHaveCount(42)
    for (let i = 0; i < 70; i++) await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('header'))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.locator('#site-sheet')).toBeHidden()
    await expect(button).toBeFocused()
    expect(await page.evaluate(() => (document.querySelector('#site-main') as HTMLElement).inert)).toBe(false)
  })

  test('the first link is reachable at the top of the sheet', async ({ page }) => {
    await page.goto('/')
    await waitForNav(page)
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
    await waitForNav(page)
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
    await waitForNav(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#site-main')!.parentElement!).backgroundColor)
    expect(bg).toBe('rgb(10, 10, 14)')
    await ctx.close()
  })
})

test.describe('contrast on the kit gallery and the homepage', () => {
  for (const [route, theme] of [['/brand/kit', 'dark'], ['/brand/kit', 'light'], ['/', 'dark'], ['/', 'light'], ['/404-check', 'dark'], ['/404-check', 'light'], ['/docs', 'dark'], ['/docs', 'light'], ['/docs/router', 'dark'], ['/docs/router', 'light']] as const) {
    test(`every text node on ${route} passes WCAG AA (${theme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await page.goto(route)
      await waitForNav(page)
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

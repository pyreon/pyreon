import { expect, type Locator, type Page, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { waitForIslands } from './site-islands'

/**
 * pyreon.dev product pages for the core/platform and data/state groups,
 * against the production SSG build: every page is prerendered with its
 * share tags, hydrates in place with no errors, has no horizontal scroll at
 * the five design widths, passes contrast in both themes, and its live demo
 * works by pointer and by keyboard.
 */
const IDS = ['zero', 'content', 'native', 'primitives', 'design', 'kinetic', 'router', 'hooks', 'validation', 'auth', 'query', 'http', 'store', 'statetree', 'machine', 'sync', 'storage']
const WIDTHS = [320, 390, 768, 1024, 1440]

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

/** Scroll the demo in and wait for its island to hydrate (it hydrates when visible). */
async function openDemo(page: Page, id: string): Promise<Locator> {
  await page.goto(`/products/${id}`)
  await waitForIslands(page)
  const demo = page.locator('#demo')
  await demo.scrollIntoViewIfNeeded()
  await expect(demo.locator('pyreon-island')).toHaveCount(1)
  // An island's children are client-owned once its chunk ran: wait until a control responds.
  await page.waitForTimeout(800)
  return demo
}

test.describe('build output', () => {
  const dist = resolve(__dirname, '../docs/dist')
  for (const id of IDS) {
    test(`/products/${id} is prerendered with its share tags and hero visual`, () => {
      const file = resolve(dist, `products/${id}/index.html`)
      expect(existsSync(file)).toBe(true)
      const html = readFileSync(file, 'utf8')
      expect(html).toContain(`<link rel="canonical" href="https://pyreon.dev/products/${id}"`)
      expect(html).toContain(`content="https://pyreon.dev/media/og/products/${id}.png"`)
      expect(html).toContain('name="twitter:card" content="summary_large_image"')
      // The hero visual: an inline SVG with its own title, or the theme pictures / loop poster.
      expect(html).toMatch(/<figure[^>]*>[\s\S]*?(<svg[^>]*role="img"|<picture)/)
      expect(html).toContain('<pyreon-island')
    })
  }
})

test.describe('hydration', () => {
  for (const id of IDS) {
    test(`/products/${id} hydrates in place and its demo hydrates with no errors`, async ({ page }) => {
      await trackRemovals(page)
      const errors = collectErrors(page)
      await page.goto(`/products/${id}`)
      await waitForIslands(page)
      await page.waitForTimeout(300)
      expect(await page.evaluate(() => (window as unknown as { __removed: number }).__removed)).toBe(0)
      await page.locator('#demo').scrollIntoViewIfNeeded()
      await page.waitForTimeout(1500)
      expect(errors).toEqual([])
    })
  }
})

test.describe('no horizontal page scroll', () => {
  for (const width of WIDTHS) {
    test(`at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const id of IDS) {
        await page.goto(`/products/${id}`)
        await waitForIslands(page)
        await page.locator('#demo').scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
        const r = await page.evaluate(() => {
          const cw = document.documentElement.clientWidth
          const main = document.querySelector('#site-main') ?? document.body
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
        expect(r.scroll, `/products/${id} scrollWidth`).toBeLessThanOrEqual(0)
        expect(r.offenders, `/products/${id} content wider than the page`).toEqual([])
      }
    })
  }
})

test.describe('demos, by pointer and keyboard', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('zero: a route file shows its render mode', async ({ page }) => {
    const demo = await openDemo(page, 'zero')
    await demo.getByRole('button', { name: /blog\/\[slug\]\.tsx/ }).click()
    await expect(demo).toContainText('Cached, refreshed in the background')
    await demo.getByRole('button', { name: /account\.tsx/ }).focus()
    await page.keyboard.press('Enter')
    await expect(demo.getByRole('button', { name: /account\.tsx/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(demo).toContainText('Rendered per request')
    await expect(demo).toContainText('Nothing renders on a server here')
  })

  test('native: a primitive shows its three outputs; the stills load', async ({ page }) => {
    const demo = await openDemo(page, 'native')
    await demo.getByRole('button', { name: 'Toggle', exact: true }).click()
    await expect(demo).toContainText('Toggle("", isOn: $on)')
    await demo.getByRole('button', { name: 'For', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(demo).toContainText('LazyColumn')
    await expect(demo).toContainText('Simulated')
    const stills = demo.locator('figure img')
    await expect(stills).toHaveCount(6)
    for (const img of await stills.all()) if (await img.isVisible()) expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
  })

  test('primitives: the web column is the live component', async ({ page }) => {
    const demo = await openDemo(page, 'primitives')
    const sw = demo.getByRole('switch')
    await sw.click()
    await expect(demo).toContainText('on = false')
    await sw.focus()
    await page.keyboard.press('Space')
    await expect(demo).toContainText('on = true')
    await demo.getByRole('button', { name: 'Field', exact: true }).click()
    await demo.getByLabel('Add a todo').fill('milk')
    await expect(demo).toContainText('draft = "milk"')
  })

  test('design: the dimensions change the real component', async ({ page }) => {
    const demo = await openDemo(page, 'design')
    await demo.getByRole('button', { name: 'danger', exact: true }).click()
    await demo.getByRole('button', { name: 'lg', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(demo).toContainText('state="danger"')
    await expect(demo).toContainText('size="lg"')
    await demo.getByRole('button', { name: 'dark', exact: true }).click()
    await expect(demo.locator('[data-theme=dark]').first()).toBeAttached()
  })

  test('kinetic: a preset replays, Toggle flips show', async ({ page }) => {
    const demo = await openDemo(page, 'kinetic')
    await demo.getByRole('button', { name: 'scaleIn', exact: true }).click()
    await expect(demo).toContainText('.preset(scaleIn)')
    await demo.getByRole('button', { name: 'blurIn', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(demo).toContainText('.preset(blurIn)')
    await demo.getByRole('button', { name: 'Collapse the panel' }).click()
    await expect(demo).toContainText('open: false')
    await expect(demo.getByRole('button', { name: 'Expand the panel' })).toBeVisible()
  })

  test('router: links, loader, guard, Back runs the guard again', async ({ page }) => {
    const demo = await openDemo(page, 'router')
    const address = demo.getByLabel('Address')
    await demo.getByRole('button', { name: 'Ada' }).click()
    await expect(demo).toContainText('Ada Lovelace')
    await demo.getByRole('button', { name: 'Settings' }).click()
    await expect(address).toContainText('/login?returnTo=%2Fsettings')
    await demo.getByLabel('Signed in').check()
    await expect(address).toContainText('/settings')
    await demo.getByLabel('Signed in').uncheck()
    await expect(address).toHaveText('app.example.com/')
    await demo.getByRole('button', { name: 'Back' }).focus()
    await page.keyboard.press('Enter')
    await expect(address).toContainText('/login?returnTo=%2Fsettings')
    await expect(demo).toContainText("back() → 'committed'")
  })

  test('hooks: live values and useToggle', async ({ page, context }) => {
    const demo = await openDemo(page, 'hooks')
    const toggle = demo.getByRole('button', { name: /useToggle\(\)/ })
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await context.setOffline(true)
    await expect(demo).toContainText(/useOnline\(\)\s*false/)
    await context.setOffline(false)
    await expect(demo).toContainText(/useOnline\(\)\s*true/)
  })

  test('validation: the browser marks email-unique pending, the server decides', async ({ page }) => {
    const demo = await openDemo(page, 'validation')
    const checks = demo.getByRole('list', { name: 'Checks' })
    await expect(checks).toContainText('fail · taken')
    await demo.getByLabel('Same schema').fill('test@mailinator.com')
    await page.keyboard.press('Enter')
    await expect(checks).toContainText('fail · disposable')
    await demo.getByLabel('Same schema').fill('grace@example.org')
    await demo.getByRole('button', { name: 'Validate' }).click()
    await expect(checks).toContainText('pending')
    await expect(checks).not.toContainText('checking')
    await expect(demo).toContainText('the account can be created')
  })

  test('auth: an honest provider signs in; a replayed token is stopped', async ({ page }) => {
    const demo = await openDemo(page, 'auth')
    await demo.getByRole('button', { name: 'Sign in with the provider' }).click()
    await expect(demo).toContainText('Welcome back, Ada Lovelace', { timeout: 8000 })
    await demo.getByRole('button', { name: 'replayed token', exact: true }).focus()
    await page.keyboard.press('Enter')
    await demo.getByRole('button', { name: 'Sign in with the provider' }).focus()
    await page.keyboard.press('Enter')
    await expect(demo).toContainText('bad_nonce', { timeout: 8000 })
    await expect(demo).toContainText('next release')
  })

  test('query: identical data does not re-run the data reader', async ({ page }) => {
    const demo = await openDemo(page, 'query')
    const runs = demo.getByRole('list', { name: 'Reader runs' })
    await expect(runs).toContainText('Ada')
    const dataRow = runs.locator('li').nth(1)
    const before = await dataRow.locator('b').innerText()
    await demo.getByRole('button', { name: 'Refetch, same data' }).click()
    await expect(demo).toContainText('requests sent')
    await page.waitForTimeout(900)
    expect(await dataRow.locator('b').innerText()).toBe(before)
    await demo.getByRole('button', { name: /Next user/ }).focus()
    await page.keyboard.press('Enter')
    await expect(runs).toContainText('Grace')
  })

  test('http: retry recovers from one failure; a wrong shape is caught', async ({ page }) => {
    const demo = await openDemo(page, 'http')
    await demo.getByRole('button', { name: 'fails once', exact: true }).click()
    await demo.getByRole('button', { name: /getUser/ }).click()
    await expect(demo.getByLabel('Request log')).toContainText('503', { timeout: 8000 })
    await expect(demo.getByLabel('Request log')).toContainText('200', { timeout: 8000 })
    await demo.getByRole('button', { name: 'wrong shape', exact: true }).focus()
    await page.keyboard.press('Enter')
    await demo.getByRole('button', { name: /getUser/ }).focus()
    await page.keyboard.press('Enter')
    await expect(demo.getByLabel('Request log')).toContainText('ResponseValidationError', { timeout: 8000 })
  })

  test('store: actions reach onAction and subscribe; undo restores', async ({ page }) => {
    const demo = await openDemo(page, 'store')
    await demo.getByRole('button', { name: 'Add Keyboard' }).click()
    await expect(demo.getByLabel('onAction log')).toContainText('add')
    await expect(demo.getByLabel('subscribe log')).not.toContainText('Each change arrives here')
    await demo.getByRole('button', { name: 'undo' }).focus()
    await page.keyboard.press('Enter')
    await expect(demo.getByRole('button', { name: 'undo' })).toBeDisabled()
  })

  test('statetree: a toggle prints its patch; undo applies the snapshot', async ({ page }) => {
    const demo = await openDemo(page, 'statetree')
    const box = demo.getByRole('checkbox').first()
    const was = await box.isChecked()
    await box.click()
    await expect(demo.getByLabel('onPatch log')).toContainText('replace')
    await demo.getByRole('button', { name: 'undo' }).focus()
    await page.keyboard.press('Enter')
    expect(await box.isChecked()).toBe(was)
  })

  test('machine: only valid events are enabled', async ({ page }) => {
    const demo = await openDemo(page, 'machine')
    await expect(demo.getByRole('button', { name: "send('PAY')" })).toBeDisabled()
    await demo.getByRole('button', { name: "send('CHECKOUT')" }).click()
    await expect(demo.getByRole('button', { name: "send('PAY')" })).toBeEnabled()
    await demo.getByRole('button', { name: "send('PAY')" }).focus()
    await page.keyboard.press('Enter')
    await expect(demo.getByLabel('onTransition log')).toContainText('paying')
  })

  test('sync: edits made offline merge on reconnect', async ({ page }) => {
    const demo = await openDemo(page, 'sync')
    const phone = demo.getByLabel('Phone device')
    const laptop = demo.getByLabel('Laptop device')
    await phone.getByRole('button', { name: 'Go offline' }).click()
    await phone.getByPlaceholder('Add an item').fill('coffee')
    await page.keyboard.press('Enter')
    await laptop.getByPlaceholder('Add an item').fill('bread')
    await laptop.getByRole('button', { name: 'Add' }).click()
    await expect(laptop.getByLabel('Laptop list')).not.toContainText('coffee')
    await phone.getByRole('button', { name: 'Reconnect' }).focus()
    await page.keyboard.press('Enter')
    await expect(laptop.getByLabel('Laptop list')).toContainText('coffee')
    await expect(phone.getByLabel('Phone list')).toContainText('bread')
  })

  test('storage: values really land in localStorage and survive a reload', async ({ page }) => {
    const demo = await openDemo(page, 'storage')
    await demo.getByRole('button', { name: 'dark', exact: true }).click()
    await demo.getByPlaceholder('Type something, then reload').fill('hello')
    expect(await page.evaluate(() => localStorage.getItem('pyreon-demo-theme'))).toBe('"dark"')
    await page.reload()
    await waitForIslands(page)
    const again = page.locator('#demo')
    await again.scrollIntoViewIfNeeded()
    await expect(again.getByPlaceholder('Type something, then reload')).toHaveValue('hello')
    await again.getByRole('button', { name: 'theme.remove()' }).focus()
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => localStorage.getItem('pyreon-demo-theme'))).toBeNull()
  })

  test('content: a missing title prints the content plugin error', async ({ page }) => {
    const demo = await openDemo(page, 'content')
    const src = demo.locator('textarea')
    await src.fill((await src.inputValue()).replace('title: Install\n', ''))
    await expect(demo).toContainText('frontmatter does not match collection "docs" schema (1 issue)')
    await expect(demo).toContainText('title: Invalid input: expected string, received undefined')
    await expect(demo).toContainText('build failed')
  })
})

test.describe('contrast on the product pages', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`every text node passes WCAG AA (${theme})`, async ({ browser }) => {
      test.setTimeout(180_000)
      const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      const all: string[] = []
      for (const id of IDS) {
        await page.goto(`/products/${id}`)
        await waitForIslands(page)
        await page.locator('#demo').scrollIntoViewIfNeeded()
        await page.waitForTimeout(800)
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
            if (cs.backgroundClip === 'text' || el.closest('svg') || el.closest(':disabled')) continue
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
        all.push(...failures.map((f) => `${id}: ${f}`))
      }
      expect(all).toEqual([])
      await ctx.close()
    })
  }
})

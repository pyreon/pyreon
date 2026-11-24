import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { type BrowserContext, expect, type Page, test } from '@playwright/test'

/**
 * Offline and installable-app behaviour in REAL Chromium, against
 * `examples/fixtures/pwa-offline` (SSG, `zero({ pwa: { offlineFallback } })`,
 * a persisted query cache and an offline mutation).
 *
 * Every claim here is a browser behaviour no node test can observe: a service
 * worker intercepting a real navigation while the network is down, the Cache
 * API surviving a reload, `localStorage` persistence across a reload, a paused
 * mutation resuming on a page that LOADS online (so no offline -> online event
 * ever fires).
 *
 * The suite is serial and shares ONE browser context (the service worker, its
 * caches and `localStorage` must persist from test to test). The last test
 * rewrites the build's `dist/` to simulate a deployment; `afterAll` restores it.
 */
test.describe.configure({ mode: 'serial' })

const DIST = resolve(process.cwd(), 'examples/fixtures/pwa-offline/dist')
const BACKUP = `${DIST}.e2e-backup`

let context: BrowserContext
let page: Page
let items: string[] = []
const posts: string[] = []
/** While set, POSTs reach the "server" but never get a response (the request is in flight). */
let holdPosts = false
const heldPosts: string[] = []

async function open(path = '/'): Promise<void> {
  await page.goto(path)
  await expect(page.locator('#page')).toBeVisible()
}

/** Wait until the worker controls the page (first visit installs; the next load is controlled). */
async function controlled(): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

test.beforeAll(async ({ browser }) => {
  rmSync(BACKUP, { recursive: true, force: true })
  cpSync(DIST, BACKUP, { recursive: true })
  context = await browser.newContext()
  // A tiny in-memory backend; the fixture is a static build, there is no server API.
  await context.route('**/api/items', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const { name } = JSON.parse(req.postData() ?? '{}') as { name: string }
      if (holdPosts) {
        heldPosts.push(name)
        return
      }
      posts.push(name)
      items = [...items, name]
      await route.fulfill({ json: { name } })

      return
    }
    await route.fulfill({ json: items })
  })
  page = await context.newPage()
})

test.afterAll(async () => {
  await context?.close()
  if (existsSync(BACKUP)) {
    rmSync(DIST, { recursive: true, force: true })
    cpSync(BACKUP, DIST, { recursive: true })
    rmSync(BACKUP, { recursive: true, force: true })
  }
})

test('a precached page reloads offline; a never-visited prerendered page loads too', async () => {
  await open('/')
  await controlled()
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#version')).toHaveText('version-one')
  await expect(page.locator('#net')).toHaveText('offline')
  // Prerendered but never visited: served from the precache, offline.
  await open('/posts/hello')
  await expect(page.locator('#page')).toHaveText('Post page')
  await context.setOffline(false)
})

test('a route that was never prerendered gets the offlineFallback shell and the client router takes over', async () => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.setOffline(true)
  await page.goto('/posts/not-prerendered')
  // The shell HTML is the configured fallback page; the router then renders the
  // route matching the ADDRESS (`/posts/:slug`), not the shell page's route.
  await expect(page.locator('#page')).toHaveText('Post page')
  // An address no route matches renders the app's own not-found view, not a browser error page.
  await page.goto('/nowhere/at/all')
  await expect(page.locator('#page')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('ERR_INTERNET_DISCONNECTED')
  expect(errors).toEqual([])
  await context.setOffline(false)
})

test('a query read comes from the persisted cache after an offline reload', async () => {
  items = ['alpha']
  await open('/')
  await expect(page.locator('#items li')).toHaveText(['alpha'])
  // Persisted (throttleTime 0): wait for the write, then go offline and reload.
  await expect
    .poll(() => page.evaluate(() => (localStorage.getItem('REACT_QUERY_OFFLINE_CACHE') ?? '').includes('alpha')))
    .toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#page')).toBeVisible()
  await expect(page.locator('#items li')).toHaveText(['alpha'])
  await context.setOffline(false)
})

test('a mutation made offline is held, then sent when the page comes back online', async () => {
  posts.length = 0
  await open('/')
  await context.setOffline(true)
  await expect(page.locator('#net')).toHaveText('offline')
  await page.locator('#name').fill('milk')
  await page.locator('#add').click()
  await expect(page.locator('#mutation')).toHaveText('paused')
  expect(posts).toEqual([])
  await context.setOffline(false)
  await expect.poll(() => posts).toEqual(['milk'])
  await expect(page.locator('#items li')).toHaveText(['alpha', 'milk'])
})

test('a mutation made offline survives leaving the page and is sent by the next page that loads ONLINE', async () => {
  posts.length = 0
  await open('/')
  await context.setOffline(true)
  await page.locator('#name').fill('eggs')
  await page.locator('#add').click()
  await expect(page.locator('#mutation')).toHaveText('paused')
  await expect
    .poll(() => page.evaluate(() => (localStorage.getItem('REACT_QUERY_OFFLINE_CACHE') ?? '').includes('eggs')))
    .toBe(true)
  // Leave the tab while offline, reconnect with NO page of the app open, then
  // load fresh: no offline -> online event will ever reach the new page, so
  // only the restore step can resume the persisted mutation.
  await page.goto('about:blank')
  await context.setOffline(false)
  expect(posts).toEqual([])
  await open('/')
  await expect.poll(() => posts).toEqual(['eggs'])
})

/** The persisted cache's mutations, read from the context (no page of the app has to be open). */
async function persistedMutations(): Promise<Array<{ state: { variables: unknown; isPaused: boolean } }>> {
  const state = await context.storageState()
  const raw = state.origins.flatMap((o) => o.localStorage).find((e) => e.name === 'REACT_QUERY_OFFLINE_CACHE')
  if (!raw) return []

  return (JSON.parse(raw.value) as { clientState: { mutations: Array<{ state: { variables: unknown; isPaused: boolean } }> } })
    .clientState.mutations
}

test('mutations made offline survive CLOSING the tab and are sent by the next tab that loads online', async () => {
  posts.length = 0
  await open('/')
  await context.setOffline(true)
  for (const name of ['bread', 'butter']) {
    await page.locator('#name').fill(name)
    await page.locator('#add').click()
  }
  await expect(page.locator('#mutation')).toHaveText('paused')
  await expect.poll(async () => (await persistedMutations()).map((m) => m.state.variables)).toEqual(['bread', 'butter'])
  // A real tab close: beforeunload, pagehide and visibilitychange all fire on
  // the dying page, and Chromium lifts the offline emulation during teardown,
  // so the paused mutations resume and go in flight as the page dies.
  await page.close({ runBeforeUnload: true })
  expect((await persistedMutations()).map((m) => m.state.variables)).toEqual(['bread', 'butter'])
  await context.setOffline(false)
  expect(posts).toEqual([])
  page = await context.newPage()
  await open('/')
  await expect.poll(() => [...posts].sort()).toEqual(['bread', 'butter'])
  await expect.poll(async () => (await persistedMutations()).length).toBe(0)
})

test('a mutation in flight when the tab closes is sent again by the next tab (at-least-once)', async () => {
  posts.length = 0
  heldPosts.length = 0
  await open('/')
  holdPosts = true
  await page.locator('#name').fill('jam')
  await page.locator('#add').click()
  await expect.poll(() => heldPosts).toEqual(['jam'])
  await expect(page.locator('#mutation')).toHaveText('pending')
  // The request is in flight (not paused): it must still be persisted.
  await expect.poll(async () => (await persistedMutations()).map((m) => m.state.variables)).toEqual(['jam'])
  await page.close({ runBeforeUnload: true })
  expect((await persistedMutations()).map((m) => m.state.variables)).toEqual(['jam'])
  holdPosts = false
  page = await context.newPage()
  await open('/')
  await expect.poll(() => posts).toEqual(['jam'])
  await expect.poll(async () => (await persistedMutations()).length).toBe(0)
})

test('a second tab does not resend a LIVE tab\'s in-flight request, and takes it over once that tab closes', async () => {
  posts.length = 0
  heldPosts.length = 0
  await open('/')
  holdPosts = true
  await page.locator('#name').fill('tea')
  await page.locator('#add').click()
  await expect.poll(() => heldPosts).toEqual(['tea'])

  // Tab B loads while A is still waiting for the response. B must not send it
  // (TanStack would not persist it at all; a naive "persist every pending
  // mutation" sends it twice).
  const pageB = await context.newPage()
  await pageB.goto('/')
  await expect(pageB.locator('#page')).toBeVisible()
  await pageB.waitForTimeout(500)
  expect(heldPosts).toEqual(['tea'])
  expect(posts).toEqual([])
  expect((await persistedMutations()).map((m) => m.state.variables)).toEqual(['tea'])

  // A closes with the request still unanswered: B, the live tab, sends it, once.
  holdPosts = false
  await page.close({ runBeforeUnload: true })
  await expect.poll(() => posts).toEqual(['tea'])
  await pageB.waitForTimeout(500)
  expect(posts).toEqual(['tea'])
  await expect.poll(async () => (await persistedMutations()).length).toBe(0)
  page = pageB
})

test('a second tab sends nothing when the live tab\'s request succeeds', async () => {
  posts.length = 0
  await open('/')
  const pageB = await context.newPage()
  await pageB.goto('/')
  await expect(pageB.locator('#page')).toBeVisible()
  await page.locator('#name').fill('honey')
  await page.locator('#add').click()
  await expect.poll(() => posts).toEqual(['honey'])
  await expect.poll(async () => (await persistedMutations()).length).toBe(0)
  await page.close({ runBeforeUnload: true })
  await pageB.reload()
  await expect(pageB.locator('#page')).toBeVisible()
  await pageB.waitForTimeout(500)
  expect(posts).toEqual(['honey'])
  page = pageB
})

test('a page with the provider holds no Web Lock until it persists a mutation', async () => {
  // A held Web Lock keeps a page out of the back/forward cache, so a page takes
  // its locks with its first persisted mutation; the mutation's lock goes when
  // it settles, the page's owner lock at a pagehide that finds it owning none.
  // (The restore itself cannot be observed here: Playwright's Chromium does not
  // restore even a page without the provider from the back/forward cache.)
  const held = () => page.evaluate(async () => (await navigator.locks.query()).held?.length ?? 0)
  posts.length = 0
  heldPosts.length = 0
  await open('/')
  await page.waitForTimeout(300)
  expect(await held()).toBe(0)
  holdPosts = true
  await page.locator('#name').fill('biscuits')
  await page.locator('#add').click()
  await expect.poll(() => heldPosts).toEqual(['biscuits'])
  await expect.poll(held).toBe(2) // the mutation's lock and this page's owner lock
  holdPosts = false
  await page.reload() // the in-flight request dies with the page; the reload takes it over and sends it
  await expect.poll(() => posts).toEqual(['biscuits'])
  await expect.poll(held).toBe(1) // settled: only the reloaded page's owner lock is left
})

test('useInstallPrompt reflects a beforeinstallprompt event', async () => {
  await open('/')
  await expect(page.locator('#install')).toHaveText('not-installable')
  await page.evaluate(() => {
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    window.dispatchEvent(e)
  })
  await expect(page.locator('#install')).toHaveText('installable')
  await expect(page.locator('#installed')).toHaveText('browser-tab')
})

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

test('an update waits, shows the banner, and apply() reloads into the new version', async () => {
  await open('/')
  await controlled()
  await expect(page.locator('#version')).toHaveText('version-one')
  await expect(page.locator('#reload')).toHaveCount(0)

  // "Deploy" version two: new bytes in the shipped files + a new worker version.
  for (const f of walk(DIST)) {
    if (!/\.(html|js)$/.test(f)) continue
    const src = readFileSync(f, 'utf-8')
    if (src.includes('version-one')) writeFileSync(f, src.replaceAll('version-one', 'version-two'))
  }
  const swPath = join(DIST, 'sw.js')
  writeFileSync(swPath, readFileSync(swPath, 'utf-8').replace(/"version":"[0-9a-f]+"/, '"version":"deployed2"'))

  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update()
  })
  // The new worker is waiting; the running page keeps its version.
  await expect(page.locator('#reload')).toBeVisible()
  await expect(page.locator('#version')).toHaveText('version-one')

  await page.locator('#reload').click()
  await expect(page.locator('#version')).toHaveText('version-two')
  // Old version's precache is gone; only the new one remains.
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.includes('-precache-'))))
    .toEqual(['pyreon-precache-deployed2'])
})

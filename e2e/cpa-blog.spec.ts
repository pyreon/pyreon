import { expect, test } from '@playwright/test'

/**
 * Real-Chromium runtime gate for the `blog` template scaffolded by
 * create-pyreon-app. Boots the pre-scaffolded `examples/cpa-pw-blog`
 * fixture and exercises:
 *
 *   1. SSR landing renders the post-list (the import.meta.glob loader
 *      ran and produced posts at build time)
 *   2. Click into a post → detail page hydrates with the post body
 *   3. /rss.xml endpoint serves valid RSS XML
 *   4. No console errors on the navigation flow
 *
 * The blog template's `import.meta.glob`-driven post discovery is the
 * piece most likely to silently break under framework changes (Vite
 * version bumps, plugin tweaks). Nothing in the build smoke catches a
 * "blog renders empty post-list" regression.
 */

test.describe('cpa-blog — runtime', () => {
  test('SSR landing renders Blog header + post list', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/')
    // `.first()` for the framework's known dev-SSR layout double-mount
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('Blog')

    // 3 sample posts ship in the template — at least one should render
    const posts = page.locator('.post-list li')
    await expect(posts.first()).toBeVisible()

    expect(consoleErrors).toEqual([])
  })

  test('click into post → detail page renders with title + body', async ({ page }) => {
    await page.goto('/')

    // Grab the first post's title link, then navigate
    const firstPostLink = page.locator('.post-list li .post-title a').first()
    const postTitle = await firstPostLink.textContent()
    expect(postTitle).toBeTruthy()
    await firstPostLink.click()

    // URL should be /blog/<slug>
    await expect(page).toHaveURL(/\/blog\/[\w-]+$/)

    // The detail page should render the same title as an h1 (.first() for double-mount)
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(postTitle!.trim())

    // And it should have post body content (article > p, etc.)
    await expect(page.locator('article').first()).not.toBeEmpty()
  })

  test('/api/rss serves valid RSS XML', async ({ request }) => {
    // Locks in the dev-server API-route dispatcher fix. Pre-fix, the
    // virtual `apiRoutes` module was generated but no Vite middleware
    // consumed it — every API request 404'd. Fix wires `createApiMiddleware`
    // into `configureServer` ahead of the SSR + 404 middlewares.
    const response = await request.get('/api/rss')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type'] ?? '').toContain('application/rss+xml')
    const body = await response.text()
    expect(body).toContain('<rss version="2.0">')
  })

  test('/api/echo/:path* — catch-all + streaming response', async ({ request }) => {
    // Two-pronged regression canary for the dev API dispatcher (paired with
    // `examples/cpa-pw-blog/src/routes/api/echo/[...path].ts`):
    //
    //   1. Catch-all matching: a `[...path].ts` route compiles to URL pattern
    //      `:path*`. The dispatcher's pre-check must accept multi-segment
    //      paths the pattern legitimately captures. Pre-fix the inline
    //      matcher demanded equal segment counts and silently rejected
    //      catch-alls > 1 deep — `/api/echo/a/b/c` 404'd in dev only.
    //   2. Streaming response: the handler emits chunks across ticks. The
    //      dispatcher pipes the Web ReadableStream to the Node response
    //      instead of buffering — required for SSE, large downloads, and
    //      any handler that returns a streamed `Response`.
    const response = await request.get('/api/echo/foo/bar/baz')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type'] ?? '').toContain('text/plain')
    const body = await response.text()
    expect(body).toContain('segments: foo/bar/baz')
    expect(body).toContain('chunk-2')
    expect(body).toContain('chunk-3')
  })
})

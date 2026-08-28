// ─── Repro: browser back/forward (popstate/hashchange) bypasses the
// navigation pipeline ─────────────────────────────────────────────────────────
//
// Pre-fix, `_popstateHandler` / `_hashchangeHandler` did a bare
// `currentPath.set(getCurrentLocation())` — so browser back/forward:
//   1. never re-ran loaders (and `commitNavigation` PRUNES loader data for
//      routes navigated away from) → `useLoaderData()` returned `undefined`
//      after pressing Back to a loader-bearing route;
//   2. never ran guards / blockers / middleware — `useBlocker` documented
//      "called before each navigation" but the Back button sailed through;
//   3. never fired `afterEach` → the a11y route announcer stayed SILENT on
//      Back/Forward;
//   4. never saved/restored scroll positions;
//   5. never updated `document.title` from route meta.
//
// The fix routes popstate/hashchange through the same `navigate()` pipeline
// with `historySync` semantics (URL already changed by the browser — commit
// must not push a new entry; a cancelled navigation restores the URL).
import { describe, expect, it, vi } from 'vitest'
import { createRouter } from '../router'
import type { RouteRecord } from '../types'

const Noop = () => null

function flush(ms = 0): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Simulate the browser's Back button in history mode: rewrite the URL and
 * dispatch `popstate` (what a real browser does — it changes the location
 * FIRST, then fires the event). */
function simulateBack(path: string): void {
  window.history.replaceState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

describe('popstate routes through the navigation pipeline', () => {
  it('re-runs loaders on browser back so loader data is present (bug 1)', async () => {
    let loaderRuns = 0
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      {
        path: '/posts',
        component: Noop,
        loader: async () => {
          loaderRuns++
          return { posts: ['a', 'b'] }
        },
        // gcTime 0 disables the loader cache so a re-run is observable AND
        // the only way data can be present is the pipeline actually running.
        gcTime: 0,
      },
      { path: '/about', component: Noop },
    ]
    window.history.replaceState(null, '', '/')
    const router = createRouter({ routes, mode: 'history' })

    await router.push('/posts')
    expect(loaderRuns).toBe(1)
    const postsRecord = routes[1]!
    expect((router as never as { _loaderData: Map<RouteRecord, unknown> })._loaderData.get(postsRecord)).toEqual({ posts: ['a', 'b'] })

    await router.push('/about')
    // commitNavigation prunes non-SWR loader data for routes navigated away from
    expect((router as never as { _loaderData: Map<RouteRecord, unknown> })._loaderData.has(postsRecord)).toBe(false)

    // Browser Back to /posts
    simulateBack('/posts')
    await flush(20)

    expect(router.currentRoute().path).toBe('/posts')
    // THE BUG: pre-fix loaderRuns stayed 1 and _loaderData had no entry —
    // useLoaderData() rendered undefined (or the errorComponent) on Back.
    expect(loaderRuns).toBe(2)
    expect((router as never as { _loaderData: Map<RouteRecord, unknown> })._loaderData.get(postsRecord)).toEqual({ posts: ['a', 'b'] })
    router.destroy()
  })

  it('fires afterEach (route announcer path) on browser back (bug 3)', async () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      { path: '/about', component: Noop },
    ]
    window.history.replaceState(null, '', '/')
    const router = createRouter({ routes, mode: 'history' })
    await router.push('/about')

    const after = vi.fn()
    router.afterEach(after)

    simulateBack('/')
    await flush(20)
    expect(router.currentRoute().path).toBe('/')
    expect(after).toHaveBeenCalledTimes(1)
    router.destroy()
  })

  it('runs beforeEach guards on browser back; a cancelling guard restores the URL (bug 2)', async () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      { path: '/locked', component: Noop },
      { path: '/open', component: Noop },
    ]
    window.history.replaceState(null, '', '/open')
    const router = createRouter({ routes, mode: 'history' })

    const guard = vi.fn(() => false as const)
    router.beforeEach(guard)

    simulateBack('/')
    await flush(20)
    expect(guard).toHaveBeenCalledTimes(1)
    // Navigation cancelled — route must NOT change...
    expect(router.currentRoute().path).toBe('/open')
    // ...and the browser URL must be restored to the current route.
    expect(window.location.pathname).toBe('/open')
    router.destroy()
  })

  it('blockers block browser back and the URL is restored (bug 2b)', async () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      { path: '/form', component: Noop },
    ]
    window.history.replaceState(null, '', '/form')
    const router = createRouter({ routes, mode: 'history' })
    ;(router as never as { _blockers: Set<() => boolean> })._blockers.add(() => true)

    simulateBack('/')
    await flush(20)
    expect(router.currentRoute().path).toBe('/form')
    expect(window.location.pathname).toBe('/form')
    router.destroy()
  })

  it('updates document.title from route meta on browser back (bug 5)', async () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Noop, meta: { title: 'Home' } },
      { path: '/about', component: Noop, meta: { title: 'About' } },
    ]
    window.history.replaceState(null, '', '/')
    const router = createRouter({ routes, mode: 'history' })
    await router.push('/about')
    expect(document.title).toBe('About')

    simulateBack('/')
    await flush(20)
    expect(document.title).toBe('Home')
    router.destroy()
  })

  it('hash mode: hashchange (back button) re-runs loaders too', async () => {
    let loaderRuns = 0
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      {
        path: '/posts',
        component: Noop,
        loader: async () => {
          loaderRuns++
          return 'data'
        },
        gcTime: 0,
      },
      { path: '/about', component: Noop },
    ]
    window.history.replaceState(null, '', '/')
    window.location.hash = ''
    const router = createRouter({ routes, mode: 'hash' })
    await router.push('/posts')
    expect(loaderRuns).toBe(1)
    await router.push('/about')

    // Simulate hash-mode Back: rewrite hash + dispatch hashchange
    window.history.replaceState(null, '', '#/posts')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await flush(20)

    expect(router.currentRoute().path).toBe('/posts')
    expect(loaderRuns).toBe(2)
    router.destroy()
  })

  it('does not double-navigate when the URL change originated from router.push (hash mode echo)', async () => {
    // router.push in hash mode sets location.hash, which fires a hashchange
    // echo — the handler must not run a SECOND full pipeline for it.
    let loaderRuns = 0
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      {
        path: '/posts',
        component: Noop,
        loader: async () => {
          loaderRuns++
          return 'data'
        },
        gcTime: 0,
      },
    ]
    window.history.replaceState(null, '', '/')
    window.location.hash = ''
    const router = createRouter({ routes, mode: 'hash' })
    await router.push('/posts')
    await flush(20) // let any hashchange echo settle
    expect(loaderRuns).toBe(1)
    router.destroy()
  })
  // ─── The double-Back URL clobber ────────────────────────────────────────
  //
  // A BROWSER-initiated traversal has already moved the URL — the browser owns
  // it. Pre-fix `commitNavigation` still ran `syncBrowserUrl(path, replace)`
  // for it, which is redundant in the happy path and WRONG once a newer
  // traversal has moved the history: the write lands on whatever entry is
  // current NOW, stamping the older navigation's URL onto it.
  //
  // Observed as a rapid double-Back losing an entry (real Chromium,
  // e2e/fundamentals/new-demos.spec.ts:79) — but that e2e only reproduces
  // under load, because it needs Back #2 to fire while Back #1's async
  // navigate is still in flight. These specs lock the MECHANISM instead, which
  // is deterministic: does a browser-initiated commit write the URL at all?
  it('does NOT write the URL for a browser-initiated traversal (the browser owns it)', async () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      { path: '/a', component: Noop },
      { path: '/b', component: Noop },
    ]
    window.history.replaceState(null, '', '/')
    const router = createRouter({ routes, mode: 'history' })
    await router.push('/a')

    // Move the URL the way a browser does, THEN start spying — so the spy sees
    // only what the router itself writes in response to the event.
    window.history.replaceState(null, '', '/b')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const pushSpy = vi.spyOn(window.history, 'pushState')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flush(20)

    expect(router.currentRoute().path).toBe('/b') // the pipeline DID run
    expect(replaceSpy).not.toHaveBeenCalled() // …but wrote nothing
    expect(pushSpy).not.toHaveBeenCalled()

    replaceSpy.mockRestore()
    pushSpy.mockRestore()
    router.destroy()
  })

  it('still writes the URL for an APP-initiated replace (the guard is not over-broad)', async () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      { path: '/a', component: Noop },
    ]
    window.history.replaceState(null, '', '/')
    const router = createRouter({ routes, mode: 'history' })

    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    await router.replace('/a')

    expect(replaceSpy).toHaveBeenCalled() // the app asked, so the router writes
    replaceSpy.mockRestore()
    router.destroy()
  })

})

describe('rapid double-Back — the same-path echo-guard residual', () => {
  it('a second rapid Back landing on the ORIGINAL path is not dropped', async () => {
    // url-state-style external writer: raw pushState entries the router never
    // sees (no __pyreonIdx stamps). Back #1 targets ?x=2 and is still IN
    // FLIGHT (loader delay) when Back #2 lands on the original path — which
    // equals the not-yet-updated `currentPath`, so the echo guard compared
    // against WHERE THE APP WAS and dropped the traversal. #2885 stopped the
    // URL clobber; this locks the other half: the router's own state must
    // still follow the browser to the final entry.
    const routes: RouteRecord[] = [
      {
        path: '/a',
        component: Noop,
        loader: async () => {
          await flush(15)
          return {}
        },
        gcTime: 0,
      },
    ]
    window.history.replaceState(null, '', '/a')
    const router = createRouter({ routes, mode: 'history' })
    await flush(30) // settle initial work

    window.history.pushState(null, '', '/a?x=2')
    window.history.pushState(null, '', '/a?x=3')

    simulateBack('/a?x=2') // Back #1 — navigate in flight (loader ~15ms)
    await flush(0)
    simulateBack('/a') // Back #2 — rapid; equals the stale currentPath
    await flush(80)

    // The router must agree with the browser URL (no ?x anywhere).
    expect(window.location.search).toBe('')
    expect(router.currentRoute().query).toEqual({})
    router.destroy()
  })
})

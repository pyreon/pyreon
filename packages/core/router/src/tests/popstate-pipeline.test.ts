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
})

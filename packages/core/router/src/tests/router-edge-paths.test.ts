/**
 * Edge paths whose failure is silent.
 *
 * Five small branches, each guarding something a user or developer would
 * otherwise lose without an error:
 *
 *   * the a11y live region going stale — route announcements stop for screen
 *     readers and nothing else changes;
 *   * a blocked open-redirect landing on `/` with no explanation, so the
 *     developer sees "my redirect does nothing";
 *   * `getRedirectInfo` on an ordinary error, which must not claim a redirect;
 *   * `currentOrigin()` with no `location` (SSR), where a throw would take
 *     down the render;
 *   * the circular-loader message at the ROOT path, where the interpolation
 *     has nothing to name.
 */
import { announceRouteChange } from '../announcer'
import { classifyRedirectTarget, getRedirectInfo, redirect } from '../redirect'
import { stringifyLoaderData } from '../loader'

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('route announcer — the live region must survive a wiped DOM', () => {
  test('recreates its region when the previous one was detached', () => {
    // A live region only works while it is IN the document. Anything that
    // replaces `document.body` — a full re-render, a test harness reset, a
    // host framework taking over the page — detaches it, and a cached
    // reference then announces into nothing: screen-reader users stop hearing
    // route changes, with no error anywhere.
    announceRouteChange('First page')
    const first = document.querySelector('[aria-live]')
    expect(first, 'a region is created on first use').not.toBeNull()

    document.body.innerHTML = '' // detach it
    expect(first!.isConnected).toBe(false)

    announceRouteChange('Second page')
    const second = document.querySelector('[aria-live]')
    expect(second, 'a detached region must be replaced, not reused').not.toBeNull()
    expect(second!.isConnected).toBe(true)
  })

  test('reuses the region while it is still connected', () => {
    // The other arm: recreating every time would pile up regions, and some
    // screen readers announce a newly-inserted live region differently from
    // an updated one.
    announceRouteChange('A')
    const before = document.querySelectorAll('[aria-live]').length
    announceRouteChange('B')
    expect(document.querySelectorAll('[aria-live]').length, 'no duplicate regions').toBe(before)
  })
})

describe('redirect target blocking — a rewritten redirect must say so', () => {
  test('an authority-delimiter target is blocked AND warns with actionable guidance', () => {
    // `//evil.test` is read by the URL parser as a HOST, so an unguarded
    // redirect leaves the site. It is blocked — but a silent block presents as
    // "my redirect does nothing", which is the wrong thing to debug.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = classifyRedirectTarget('//evil.test/steal')
    expect(result, 'the target must not survive as an external redirect').not.toMatchObject({
      kind: 'external',
    })
    expect(warn, 'a blocked redirect must be reported').toHaveBeenCalled()
    const msg = String(warn.mock.calls[0]?.[0] ?? '')
    expect(msg, 'the warning names the offending target').toContain('evil.test')
    expect(msg, 'and tells the developer what to write instead').toMatch(/root-relative|https:/)
  })

  test('an explicit non-http scheme is blocked too', () => {
    // The second `blocked()` call site: only http/https are navigable.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    classifyRedirectTarget('javascript:alert(1)')
    expect(warn).toHaveBeenCalled()
  })

  test('an ordinary root-relative target is NOT blocked and warns nothing', () => {
    // The control. Without it the two specs above pass against an
    // implementation that blocks everything.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(classifyRedirectTarget('/dashboard')).toMatchObject({ kind: 'internal' })
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('getRedirectInfo — only a real redirect counts as one', () => {
  test('returns null for an ordinary Error', () => {
    // A loader that genuinely failed must reach the error boundary, not be
    // mistaken for a redirect and silently navigate away from the failure.
    expect(getRedirectInfo(new Error('db is down'))).toBeNull()
  })

  test('returns null for non-Error values', () => {
    for (const v of [null, undefined, 'a string', 42, {}]) {
      expect(getRedirectInfo(v)).toBeNull()
    }
  })

  test('returns the info for a real redirect', () => {
    let caught: unknown
    try {
      redirect('/login', 302)
    } catch (e) {
      caught = e
    }
    expect(getRedirectInfo(caught)).toMatchObject({ url: '/login', status: 302 })
  })
})

describe('link classification without a location (SSR)', () => {
  test('classifying an absolute URL does not throw when `location` is absent', () => {
    // `currentOrigin()` returns '' rather than reading a missing global. A
    // throw here would take down the whole server render for one link.
    vi.stubGlobal('location', undefined)
    expect(() => classifyRedirectTarget('https://example.test/x')).not.toThrow()
  })
})

describe('loader serialization — the circular-reference message at the ROOT', () => {
  // The message interpolates the KEY PATH inside the returned data, so the
  // developer knows where in their object the cycle is rather than only that
  // one exists. Three shapes, three different things to name.
  test('names <root> when the cycle is the root slot referring to itself', () => {
    // The root route's slot is the empty key, so a self-reference there leaves
    // the path empty and the fallback is what stops the error reading `at ""`.
    const o: Record<string, unknown> = {}
    o[''] = o
    expect(() => stringifyLoaderData(o)).toThrow(/<root>/)
  })

  test('names the key path when the cycle is nested under a route', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => stringifyLoaderData({ '/users': cyclic })).toThrow(/\/users\.self/)
  })

  test('names an ARRAY position with index notation', () => {
    // A cycle through an array is the common Prisma/Mongo shape (a row whose
    // relation array contains the row). `[0]` points at the element.
    const arr: unknown[] = []
    arr.push(arr)
    expect(() => stringifyLoaderData({ '': arr } as never)).toThrow(/\[0\]/)
  })
})

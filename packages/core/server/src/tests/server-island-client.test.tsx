// @vitest-environment happy-dom
/**
 * The CLIENT half of server islands — the marker's self-activation, the
 * fragment fetch, and every way that fetch can fail.
 *
 * `server-island.test.ts` runs under `node`, where `isClient` is false, so
 * the marker's `ref` branch never exists and `activateServerIslandElement`
 * is never called. That left the whole client mechanism unmeasured: the
 * ref, the idempotency stamp, the URL construction, the swap, and all
 * three failure paths.
 *
 * What makes these worth asserting rather than counting:
 *
 *   * **Two activation paths share one element.** A marker self-activates
 *     via its ref, and `activateServerIslands` also scans the document for
 *     markers. Both call the same function, so the `data-pyreon-si` stamp
 *     is the only thing standing between one fragment fetch and two — and
 *     a doubled fetch on a personalized endpoint is a doubled backend hit
 *     per island per page.
 *   * **The failure mode is the product.** A server island exists so the
 *     page around it stays cacheable; when the fragment fails, the page
 *     must keep the structural fallback rather than lose the region. A
 *     throw here would take down a route that is otherwise entirely fine.
 *   * **`el.isConnected` guards a swap into a torn-down tree.** Navigating
 *     away mid-fetch is ordinary, and the fetch is deliberately NOT
 *     aborted — the guard is the whole teardown story.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activateServerIslands } from '../client'
import { _resetServerIslands, activateServerIslandElement, serverIsland } from '../server-island'

const Badge: ComponentFn = () => h('span', null, 'live')

/** A fetch stub that records its calls and resolves on demand. */
function stubFetch(impl: (url: string) => Promise<Response> | Response): string[] {
  const urls: string[] = []
  vi.stubGlobal('fetch', (url: string) => {
    urls.push(url)
    return Promise.resolve(impl(url))
  })
  return urls
}

const ok = (html: string): Response => ({ ok: true, status: 200, text: async () => html }) as Response
const httpError = (status: number): Response =>
  ({ ok: false, status, text: async () => '' }) as Response

/** Let the fetch promise chain settle. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0))

let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  _resetServerIslands()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** Build a marker the way the server would have serialized it. */
function serverMarkup(attrs: Record<string, string>, fallback = '<span>fallback</span>'): HTMLElement {
  const el = document.createElement('pyreon-server-island')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.innerHTML = fallback
  container.appendChild(el)
  return el
}

describe('a mounted marker activates itself', () => {
  it('fetches its fragment on mount and swaps it in over the fallback', async () => {
    // The control for everything below: without this the failure specs
    // would pass against a marker that never activates at all.
    const urls = stubFetch(() => ok('<span class="live">Cart: 3</span>'))
    const Island = serverIsland(async () => Badge, {
      name: 'CartBadge',
      fallback: h('span', { class: 'ph' }, 'Cart'),
    })

    mount(h(Island, { count: 3 } as never), container)
    const el = container.querySelector('pyreon-server-island')!
    expect(el.innerHTML, 'the fallback renders first, for no-JS and pre-swap').toContain('Cart')

    await settle()
    expect(urls, 'the ref must have activated it').toHaveLength(1)
    expect(urls[0]).toContain('/_pyreon/fragment/CartBadge')
    expect(el.innerHTML, 'the fragment replaces the fallback').toBe('<span class="live">Cart: 3</span>')
    expect(el.getAttribute('data-pyreon-si'), 'and it is stamped').toBe('1')
  })

  it('encodes the props into the query string, escaped', async () => {
    // The props ride in a URL. A value carrying `&` or `#` would truncate
    // or split the query and the fragment would render with the WRONG
    // props — a personalization bug that looks like a server bug.
    const urls = stubFetch(() => ok('<b>x</b>'))
    const Island = serverIsland(async () => Badge, { name: 'Hostile' })
    mount(h(Island, { q: 'a&b#c=d' } as never), container)
    await settle()

    expect(urls[0]).toContain('?props=')
    const encoded = urls[0]!.split('?props=')[1]!
    expect(encoded, 'no raw & may reach the query').not.toContain('&')
    expect(encoded, 'no raw # either').not.toContain('#')
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual({ q: 'a&b#c=d' })
  })

  it('omits the query entirely when there are no props', async () => {
    const urls = stubFetch(() => ok('<b>x</b>'))
    const Island = serverIsland(async () => Badge, { name: 'Bare' })
    mount(h(Island, {} as never), container)
    await settle()
    expect(urls[0]).toBe('/_pyreon/fragment/Bare')
  })

  it('dispatches a bubbling event so a page can react to the swap', async () => {
    // The only signal a host has that a hole filled in — used for
    // re-measuring layout or re-running an enhancement pass.
    stubFetch(() => ok('<b>done</b>'))
    const seen: string[] = []
    document.addEventListener('pyreon:server-island', (e) => {
      seen.push((e as CustomEvent<{ name: string }>).detail.name)
    })
    const Island = serverIsland(async () => Badge, { name: 'Evented' })
    mount(h(Island, {} as never), container)
    await settle()
    expect(seen, 'the event must reach the document, not stop at the marker').toEqual(['Evented'])
  })
})

describe('activation is idempotent across BOTH paths', () => {
  it('a self-activated marker is skipped by the document scan', async () => {
    // The load-bearing one. Both paths exist and both run in a hybrid app;
    // the stamp is all that stops every personalized fragment being
    // fetched twice — a doubled hit on the endpoint that exists precisely
    // because it is expensive per request.
    const urls = stubFetch(() => ok('<b>once</b>'))
    const Island = serverIsland(async () => Badge, { name: 'Twice' })
    mount(h(Island, {} as never), container)
    await settle()
    expect(urls).toHaveLength(1)

    activateServerIslands()
    await settle()
    expect(urls, 'the scan must not re-fetch an already-activated marker').toHaveLength(1)
  })

  it('calling the activator twice on the same element fetches once', async () => {
    // Note this is the spec that actually pins the stamp CHECK. The scan
    // spec above survives its removal, because the scan's selector carries
    // its own `:not([data-pyreon-si])` filter — two independent guards,
    // and only the direct/ref path depends on the one inside the function.
    // (Bisect-verified: removing the check fails only this spec.)
    const urls = stubFetch(() => ok('<b>once</b>'))
    const el = serverMarkup({ 'data-name': 'Solo' })
    activateServerIslandElement(el)
    activateServerIslandElement(el)
    await settle()
    expect(urls).toHaveLength(1)
  })

  it('the scan activates a SERVER-rendered marker that never mounted', async () => {
    // The static / no-full-hydrate host: markers arrive in the HTML with
    // no client component behind them, so the scan is the only path.
    const urls = stubFetch(() => ok('<b>scanned</b>'))
    const el = serverMarkup({ 'data-name': 'Static', 'data-props': '{"a":1}' })
    activateServerIslands()
    await settle()
    expect(urls[0]).toBe(`/_pyreon/fragment/Static?props=${encodeURIComponent('{"a":1}')}`)
    expect(el.innerHTML).toBe('<b>scanned</b>')
  })

  it('a base path prefixes the endpoint', async () => {
    // Sub-path deploys. Without the prefix the fetch 404s on every island.
    const urls = stubFetch(() => ok('<b>x</b>'))
    serverMarkup({ 'data-name': 'Prefixed' })
    activateServerIslands('/app')
    await settle()
    expect(urls[0]).toBe('/app/_pyreon/fragment/Prefixed')
  })

  it('a marker with NO name is stamped and never fetched', async () => {
    // Malformed markup must not produce a request to
    // `/_pyreon/fragment/null`, which the allowlist would reject anyway.
    const urls = stubFetch(() => ok('<b>x</b>'))
    const el = serverMarkup({})
    el.setAttribute('data-name', '')
    activateServerIslandElement(el)
    await settle()
    expect(urls, 'an empty name must not reach the endpoint').toHaveLength(0)
  })
})

describe('a failed fragment degrades to the fallback, never a broken page', () => {
  it('an HTTP error leaves the fallback and flags the marker', async () => {
    // The designed failure mode: the region keeps its structural shape.
    // Losing it would be worse than never having deferred it.
    stubFetch(() => httpError(500))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = serverMarkup({ 'data-name': 'Down' }, '<span class="ph">Cart</span>')
    activateServerIslandElement(el)
    await settle()

    expect(el.innerHTML, 'the fallback must survive').toBe('<span class="ph">Cart</span>')
    expect(el.getAttribute('data-island-error')).toBe('fragment-failed')
  })

  it('a REJECTED fetch is caught too — offline, DNS, CORS', async () => {
    // A rejection takes a different path from a non-ok response, and an
    // uncaught one here is an unhandled rejection at page level.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = serverMarkup({ 'data-name': 'Offline' })
    expect(() => activateServerIslandElement(el)).not.toThrow()
    await settle()
    expect(el.getAttribute('data-island-error')).toBe('fragment-failed')
    expect(el.innerHTML).toBe('<span>fallback</span>')
  })

  it('a body that fails to read is caught as well', async () => {
    // `res.text()` can reject on a truncated response even when the
    // status said 200 — the await sits inside the same then().
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.reject(new Error('truncated')) }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = serverMarkup({ 'data-name': 'Truncated' })
    activateServerIslandElement(el)
    await settle()
    expect(el.getAttribute('data-island-error')).toBe('fragment-failed')
  })

  it('an island removed MID-FLIGHT is not swapped into', async () => {
    // Navigating away while the fragment is in flight. The fetch is
    // deliberately not aborted, so this guard is the entire teardown
    // story — without it the swap writes into a detached subtree and the
    // event dispatches from a node no longer in the document.
    let resolveBody!: (v: string) => void
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => new Promise<string>((r) => (resolveBody = r)),
      }),
    )
    const seen: string[] = []
    document.addEventListener('pyreon:server-island', () => seen.push('fired'))

    const el = serverMarkup({ 'data-name': 'Gone' }, '<span>ph</span>')
    activateServerIslandElement(el)
    // One turn so the response resolves and `res.text()` is entered — the
    // body is now genuinely in flight, which is the state being tested.
    await settle()
    el.remove()
    resolveBody('<b>too late</b>')
    await settle()

    expect(el.isConnected).toBe(false)
    expect(el.innerHTML, 'a detached marker must not be written to').toBe('<span>ph</span>')
    expect(seen, 'and must not dispatch from outside the document').toEqual([])
  })
})

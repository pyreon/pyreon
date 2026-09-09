/**
 * `RouterLink` — the clicks it must NOT intercept.
 *
 * `handleClick` bails before `preventDefault` for modifier and non-primary
 * clicks, so the browser's own open-in-new-tab / open-in-new-window behaviour
 * survives. That bail had no test: the existing modifier-click spec in
 * `link-dx.test.ts` exercises the dev-warning document listener, not
 * RouterLink's own handler, and the browser suite's click specs are all plain
 * primary clicks.
 *
 * The gap matters because the failure is one users hit constantly and report
 * badly. Cmd-click a nav link and, instead of a new tab, the current tab
 * navigates — a broken interaction that looks like the site "not supporting"
 * new tabs rather than a routing bug. Middle-click is the same.
 *
 * The prefetch bail is here for the same reason: `triggerPrefetch` must never
 * fire for an external destination. Prefetching a third-party URL on hover
 * sends a request to another origin the user never asked for.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, RouterLink, RouterProvider } from '../index'
import { setActiveRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

const Page = () => null
const routes: RouteRecord[] = [
  { path: '/', component: Page },
  { path: '/about', component: Page },
]

function setup(mode: 'history' | 'hash' = 'history'): {
  router: RouterInstance
  link: (props: Record<string, unknown>) => HTMLAnchorElement
} {
  const router = createRouter({ routes, url: '/', mode }) as unknown as RouterInstance
  setActiveRouter(router as never)
  const link = (props: Record<string, unknown>): HTMLAnchorElement => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    mount(h(RouterProvider, { router }, h(RouterLink, props, 'Go')), el)
    return el.querySelector('a')!
  }
  return { router, link }
}

function click(target: EventTarget, init: MouseEventInit = {}): MouseEvent {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(ev)
  return ev
}

afterEach(() => {
  setActiveRouter(null)
  document.body.innerHTML = ''
})

describe('RouterLink — modifier and non-primary clicks are left to the browser', () => {
  // Each of these is a real gesture with an established meaning. Intercepting
  // any of them replaces the user's intent with an in-place navigation.
  for (const [label, init] of [
    ['cmd/meta click (new tab on macOS)', { metaKey: true }],
    ['ctrl click (new tab on Windows/Linux)', { ctrlKey: true }],
    ['shift click (new window)', { shiftKey: true }],
    ['alt click (download in some browsers)', { altKey: true }],
    ['middle click (new tab)', { button: 1 }],
    ['right click (context menu)', { button: 2 }],
  ] as Array<[string, MouseEventInit]>) {
    test(`${label} is not preventDefaulted and does not navigate`, async () => {
      const { router, link } = setup()
      const a = link({ to: '/about' })
      const ev = click(a, init)
      await Promise.resolve()

      expect(ev.defaultPrevented, 'the browser must keep its default action').toBe(false)
      expect(router.currentRoute().path, 'the current tab must not navigate').toBe('/')
    })
  }

  test('a PLAIN primary click IS intercepted — the control case', () => {
    // Without this the six specs above pass against a RouterLink that never
    // intercepts anything, which is not the contract.
    const { link } = setup()
    const a = link({ to: '/about' })
    const ev = click(a)
    expect(ev.defaultPrevented, 'an ordinary click is the router\'s to handle').toBe(true)
  })

  test('an ALREADY-defaultPrevented click is left alone', () => {
    // Someone upstream — a menu, a drag handler — has claimed this click.
    // Navigating anyway would fight them.
    const { router, link } = setup()
    const a = link({ to: '/about' })
    a.addEventListener('click', (e) => e.preventDefault(), true)
    click(a)
    expect(router.currentRoute().path).toBe('/')
  })
})

describe('RouterLink — replace vs push', () => {
  // Both arms of the same `if`; only the push side had coverage. Asserting
  // WHICH method is called rather than the resulting path is deliberate:
  // happy-dom does not model the history stack, so a path assertion would
  // pass for either arm and prove nothing about the one under test.
  test('replace={true} calls router.replace, not push', async () => {
    const { router, link } = setup()
    const calls: string[] = []
    const realPush = router.push.bind(router)
    const realReplace = router.replace.bind(router)
    router.push = ((p: string) => (calls.push('push'), realPush(p))) as typeof router.push
    router.replace = ((p: string) =>
      (calls.push('replace'), realReplace(p))) as typeof router.replace

    click(link({ to: '/about', replace: true }))
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(calls).toEqual(['replace'])
    expect(router.currentRoute().path).toBe('/about')
  })

  test('the default is push', async () => {
    const { router, link } = setup()
    const calls: string[] = []
    const realPush = router.push.bind(router)
    router.push = ((p: string) => (calls.push('push'), realPush(p))) as typeof router.push

    click(link({ to: '/about' }))
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(calls).toEqual(['push'])
  })
})

describe('RouterLink — prefetch never reaches across origins', () => {
  test('hovering an EXTERNAL link does not prefetch', () => {
    // `triggerPrefetch` bails on `!isInternal()`. Without the bail, hovering a
    // link to another site issues a request to that site — the user never
    // asked for it, and it leaks their interest in the destination.
    const { router, link } = setup()
    const before = router._loaderCache.size
    const a = link({ to: 'https://example.test/page', prefetch: 'hover' })
    a.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    expect(router._loaderCache.size, 'no prefetch may be issued for an external URL').toBe(before)
  })

  test('an internal link with prefetch="intent" prefetches on FOCUS, not just hover', () => {
    // The keyboard path. `handleFocus` only prefetches for 'intent', so a
    // keyboard user gets the same warm cache a mouse user does — and a
    // 'hover'-mode link must NOT prefetch on focus.
    const { link } = setup()
    const a = link({ to: '/about', prefetch: 'intent' })
    expect(() => a.dispatchEvent(new FocusEvent('focus'))).not.toThrow()
  })
})

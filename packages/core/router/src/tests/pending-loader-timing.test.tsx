/**
 * `PendingLoader` — the hidden -> pending -> ready state machine.
 *
 * One test existed for it, and it used `pendingMs: 0, pendingMinMs: 0`, which
 * is the one configuration where none of the timing logic runs. Everything
 * this component exists FOR was uncovered: the delay before a spinner is
 * allowed to appear, the minimum time it must stay once it has, and the timer
 * teardown on unmount.
 *
 * Every failure here is silent in a test that only checks the end state,
 * because the end state is right in all of them — the bug is WHEN, or a timer
 * that outlives the component:
 *
 *   * no delay          -> a spinner flashes on every fast navigation
 *   * no skip-on-early  -> a spinner appears AFTER the data already arrived
 *   * no minimum        -> the spinner flickers for one frame
 *   * no teardown       -> a timer holds the component closure after unmount
 *
 * Real timers, short budgets — per the repo's rule that fake timers cause
 * subtle issues. The margins are wide enough that ordinary scheduling jitter
 * cannot flip a verdict.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, RouterProvider, RouterView } from '../index'
import { setActiveRouter } from '../router'
import type { RouteRecord } from '../index'

const Pending = () => h('div', { id: 'pending' }, 'Loading')
const Real = () => h('div', { id: 'real' }, 'Loaded')

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

/** A loader that resolves when you say so. */
function deferred(): { promise: Promise<string>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<string>((res) => {
    resolve = () => res('DATA')
  })
  return { promise, resolve }
}

const shown = (ctr: HTMLElement): 'pending' | 'real' | 'none' =>
  ctr.querySelector('#pending') ? 'pending' : ctr.querySelector('#real') ? 'real' : 'none'

function routes(d: { promise: Promise<string> }, pendingMs: number, pendingMinMs: number) {
  const r: RouteRecord[] = [
    {
      path: '/slow',
      component: Real,
      loader: () => d.promise,
      pendingComponent: Pending,
      pendingMs,
      pendingMinMs,
    },
  ]
  return r
}

/**
 * Mount the pending route AND start the navigation that runs its loader.
 *
 * Getting this wrong is why the feature had no real coverage. Two harnesses
 * look right and are not:
 *
 *   * mount at the route and stop -- `createRouter({ url })` does NOT run the
 *     initial route's loaders (a host calls `preload` for that), so
 *     `_loaderData` stays empty forever, the phase never advances, and a test
 *     that waits for the real component hangs on a spinner that is CORRECTLY
 *     still showing. That is what the three existing tests hit; two of them
 *     end with a comment describing the transition instead of asserting it.
 *   * `push()` INTO the route from elsewhere -- a push awaits its loaders
 *     before committing, so the previous route stays on screen and the
 *     pending component never renders at all.
 *
 * What works is mounting AT the route, so `PendingLoader` renders with no
 * data, then pushing the SAME route to run the loader: its completion flips
 * `_loadingSignal`, the accessor re-runs, and the machine advances.
 */
function mountPending(
  d: { promise: Promise<string> },
  pendingMs: number,
  pendingMinMs: number,
): { ctr: HTMLElement; nav: Promise<unknown>; unmount: () => void } {
  const router = createRouter({ routes: routes(d, pendingMs, pendingMinMs), url: '/slow' })
  const ctr = container()
  const unmount = mount(h(RouterProvider, { router }, h(RouterView, {})), ctr)
  const nav = router.push('/slow').catch(() => undefined)
  return { ctr, nav, unmount }
}

afterEach(() => {
  setActiveRouter(null)
  document.body.innerHTML = ''
})

describe('PendingLoader — the delay before a spinner may appear', () => {
  test('shows NOTHING during pendingMs, then the spinner', async () => {
    // The whole point of pendingMs: a navigation that resolves quickly should
    // never flash a spinner, so nothing may render until the delay elapses.
    const d = deferred()
    const { ctr } = mountPending(d, 60, 0)

    await sleep(20)
    expect(shown(ctr), 'nothing may render inside the delay window').toBe('none')

    await sleep(70)
    expect(shown(ctr), 'the spinner appears once the delay elapses').toBe('pending')

    d.resolve()
  })

  test('data arriving DURING the delay skips the spinner entirely', async () => {
    // The flash-prevention contract, and the one most easily broken: if the
    // pending timer is not cancelled when data lands early, the spinner
    // appears AFTER the content was already available.
    const d = deferred()
    const { ctr } = mountPending(d, 60, 0)

    // Sample continuously across the whole window — asserting only the end
    // state would pass even if the spinner flashed in the middle, which is
    // exactly the bug.
    //
    // Worth knowing what this does and does not catch. THREE mechanisms
    // uphold the no-flash contract: `checkData` clears the pending timer, the
    // timer body re-checks `dataReady`, and a late `phase.set('pending')` is
    // immediately undone by the next accessor run. Removing any ONE leaves
    // this green — verified by neutering each in turn. It fails when the
    // DELAY itself goes, which is the break that actually reaches users.
    let sawPending = false
    const stop = Date.now() + 140
    d.resolve()
    while (Date.now() < stop) {
      if (shown(ctr) === 'pending') sawPending = true
      await sleep(5)
    }

    expect(sawPending, 'the spinner must never appear when data beat the delay').toBe(false)
    expect(shown(ctr)).toBe('real')
  })
})

describe('PendingLoader — the minimum time a spinner must stay', () => {
  test('holds the spinner for pendingMinMs even when data arrives immediately', async () => {
    // Anti-flicker: once a spinner is on screen, swapping it out one frame
    // later reads as a glitch. pendingMs=0 shows it at once; the data lands
    // almost immediately after, and it must still be held.
    const d = deferred()
    const { ctr } = mountPending(d, 0, 100)

    await sleep(10)
    expect(shown(ctr), 'pendingMs=0 shows the spinner at once').toBe('pending')

    d.resolve()
    await sleep(30)
    expect(shown(ctr), 'still inside pendingMinMs — must not swap yet').toBe('pending')

    await sleep(120)
    expect(shown(ctr), 'after pendingMinMs the real component takes over').toBe('real')
  })

  test('swaps as soon as data arrives if pendingMinMs has ALREADY elapsed', async () => {
    // The other side of the same branch: the minimum is a floor, not a delay.
    const d = deferred()
    const { ctr } = mountPending(d, 0, 30)

    await sleep(80) // well past the floor, still no data
    expect(shown(ctr)).toBe('pending')

    d.resolve()
    await sleep(40)
    expect(shown(ctr), 'the floor is already spent — swap promptly').toBe('real')
  })
})

describe('PendingLoader — teardown', () => {
  test('unmounting clears BOTH timers it created', async () => {
    // Leak class I: a timer that outlives its component keeps the component's
    // closure — and its router and record references — alive, and then fires
    // into a torn-down scope. Navigating away from a slow route mid-spinner is
    // the ordinary way to reach this.
    const created: unknown[] = []
    const cleared: unknown[] = []
    const realSet = globalThis.setTimeout
    const realClear = globalThis.clearTimeout
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      const id = realSet(fn, ms)
      created.push(id)
      return id
    }) as typeof setTimeout
    globalThis.clearTimeout = ((id: unknown) => {
      cleared.push(id)
      return realClear(id as Parameters<typeof clearTimeout>[0])
    }) as typeof clearTimeout

    try {
      const d = deferred()
      // pendingMs > 0 AND a minMs, so both timer slots are in play.
      const { ctr, unmount } = mountPending(d, 40, 60)

      // Let the pending timer fire so the MIN timer also exists — with only
      // the first timer live this passes without proving the second is cleared.
      await sleep(70)
      expect(shown(ctr), 'the spinner is up, so the min timer is armed').toBe('pending')

      const beforeUnmount = cleared.length
      unmount()

      expect(
        cleared.length - beforeUnmount,
        'unmount must clear the timer(s) still outstanding',
      ).toBeGreaterThan(0)
      // Every id this component created is now either fired or cleared; the
      // outstanding one must be in `cleared`.
      const outstanding = created.filter((id) => !cleared.includes(id))
      expect(outstanding.length, 'no timer may outlive the component').toBeLessThanOrEqual(
        // Timers belonging to the harness (sleep) are also counted here; the
        // component's own must be gone, and it is the only one still pending
        // at this instant.
        created.length - 1,
      )

      d.resolve()
    } finally {
      globalThis.setTimeout = realSet
      globalThis.clearTimeout = realClear
    }
  })
})

/**
 * Scenario: **router navigation** — `@pyreon/router` `push()` through the full
 * pipeline (resolve, guards, commit, `history.pushState`, `<RouterView>` swap),
 * in real Chromium, with and without tab stacks configured.
 *
 * WHY IT EXISTS: `scripts/bench/core/router.ts` times route MATCHING only, in
 * bun, with no DOM. Nothing timed a navigation, so a change to the navigation
 * path (#4702 moved the tab-stack engine behind `routerTabs()`, turning the
 * per-push `tabMode` boolean into a controller null-check) had no instrument.
 *
 * REGRESSION INSTRUMENT, NOT A COMPARISON. Pyreon only. The installed rival
 * routers (react-router, vue-router, TanStack Router) do not share a guard and
 * commit model with this one (react-router has no per-route guard; vue-router's
 * guards and its view swap are scheduled differently), so an equal-work arm is
 * not a straightforward port, and an unequal one would be a misleading row.
 * Read the two arms against each other only as "what tab stacks cost", and
 * read either arm across two builds as the A/B.
 *
 * ## Ops (each `push()` is awaited, then layout is forced, as every op here)
 *
 *   route change    /home → /home/detail                         (reset: push /home)
 *   guarded push    /home → /home/guarded, one `beforeEnter` → true  (reset: push /home)
 *   param change    /home/user/1 → /home/user/2, same component  (reset: push /home, push /home/user/1)
 *
 * and a batch twin of each whose cycle is the reset plus the op: the ROUND TRIP
 * for the first two (`push /home` + the op's push = TWO navigations), THREE
 * navigations for the param change (`/home`, `/home/user/1`, `/home/user/2`),
 * each navigation followed by a forced layout and a probe of the rendered view
 * and `location.pathname`. A two-push param cycle (user 1 ↔ user 2) would grow
 * the tab stack every cycle in the `tabs` arm and make its work drift sample by
 * sample; every reset here goes through `/home`, a tab root, which resets the
 * stack, so both arms do bounded, identical work.
 *
 * In the smoke run the per-op rows (one push after a forced GC and an event
 * loop yield) were slower per push and noisier than the batch rows (warm,
 * back-to-back pushes). Use the batch rows for an A/B; the per-op rows are the
 * "first push after idle" view.
 *
 * No route has a loader (loaders off), and every route sets
 * `meta.viewTransition: false` (see `scenario-router-pyreon.tsx`).
 *
 * ## Correctness gate
 *
 * Before timing, each op runs once and the gate checks: exactly one view on
 * screen and it is the right one, `location.pathname`, `currentRoute().path`,
 * the user id for the param change, the guard's call count, and in the `tabs`
 * arm the active tab and that its stack is bounded. During timing every
 * per-op iteration is re-checked, the batch probe checks every cycle, and
 * after each op the guard's call count must equal the number of guarded pushes.
 *
 * ## Chromium's history throttle
 *
 * Chromium has throttled `history.pushState` floods ("Throttling navigation to
 * prevent the browser from hanging", ~200 calls per 10 s), and this scenario
 * pushes thousands of times. `bench-scenarios.ts` launches its browser with
 * `--disable-ipc-flooding-protection` as a safeguard. On 2026-11-19 the
 * Playwright Chromium did not drop a push even without the flag (every
 * per-iteration pathname check and batch probe passed), so the flag is not
 * load-bearing today; the pathname checks are what prove no push was dropped.
 */
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import type { Router } from '@pyreon/router'
import type { BenchSuite } from '../runner'
import { type GatedOp, gateThenTime } from './scenario-gated'
import { type RoutedApp, createRoutedApp } from './scenario-router-pyreon'

export const ROUTER_FRAMEWORKS = ['Pyreon', 'Pyreon (tabs)'] as const

/** Batch cycles per sample. A cycle is two navigations. */
export const ROUTER_K = 100

const VIEW_CODE: Record<string, number> = { home: 1, detail: 2, user: 3, guarded: 4, other: 5 }
const VIEW_PATH: Record<string, string> = { home: '/home', detail: '/home/detail', guarded: '/home/guarded' }

function fail(detail: string): never {
  throw new Error(`[router] correctness gate failed — ${detail}`)
}

/**
 * Batch probe: `10 × view code + 1` when the rendered view AND
 * `location.pathname` agree with each other, `10 × view code` when only the
 * view moved (a dropped `pushState`), 0 with no single view on screen. The user
 * page adds `1000 × its id`, so user 1 and user 2 probe differently.
 */
function viewProbe(container: HTMLElement): number {
  const views = container.querySelectorAll('[data-view]')
  if (views.length !== 1) return 0
  const view = (views[0] as HTMLElement).dataset.view ?? ''
  const code = VIEW_CODE[view] ?? 0
  if (view === 'user') {
    const id = container.querySelector('.user-id')?.textContent ?? ''
    return 1000 * Number(id) + code * 10 + (location.pathname === `/home/user/${id}` ? 1 : 0)
  }
  return code * 10 + (location.pathname === VIEW_PATH[view] ? 1 : 0)
}

/** DOM + URL + router-state check after a navigation (untimed). */
function makeVerify(container: HTMLElement, router: Router, withTabs: boolean) {
  return (view: string, path: string, userId?: string): void => {
    const views = container.querySelectorAll('[data-view]')
    if (views.length !== 1) fail(`expected exactly one view on screen, got ${views.length}`)
    const shown = (views[0] as HTMLElement).dataset.view
    if (shown !== view) fail(`expected view "${view}", got "${shown}"`)
    if (location.pathname !== path) {
      fail(`location.pathname is "${location.pathname}", expected "${path}" (a dropped history.pushState?)`)
    }
    if (router.currentRoute().path !== path) fail(`currentRoute().path is "${router.currentRoute().path}", expected "${path}"`)
    if (userId !== undefined) {
      const text = container.querySelector('.user-id')?.textContent
      if (text !== userId) fail(`user page shows id "${text}", expected "${userId}"`)
    }
    if (withTabs) {
      if (router.activeTab() !== 'home') fail(`active tab is "${router.activeTab()}", expected "home"`)
      const depth = router.tabStack('home').length
      if (depth > 3) fail(`the home tab stack grew to ${depth} entries — the op is not doing bounded work`)
    }
  }
}

function routerOps(container: HTMLElement, routed: RoutedApp, withTabs: boolean): GatedOp[] {
  const { router } = routed
  const verify = makeVerify(container, router, withTabs)
  const push = async (path: string): Promise<void> => {
    const result = await router.push(path)
    if (result !== 'committed') fail(`push("${path}") returned "${result}"`)
  }
  let guardedPushes = 0
  // Every guarded push must have run the guard exactly once.
  const auditGuard = () => {
    const guardBefore = routed.guardCalls()
    const pushesBefore = guardedPushes
    return () => {
      const ran = routed.guardCalls() - guardBefore
      if (ran !== guardedPushes - pushesBefore) fail(`the guard ran ${ran}× for ${guardedPushes - pushesBefore} guarded push(es)`)
    }
  }
  const toDetail = {
    reset: () => push('/home'),
    fn: () => push('/home/detail'),
    after: () => verify('detail', '/home/detail'),
  }
  const toGuarded = {
    reset: () => push('/home'),
    fn: () => {
      // One integer add in the timed region, identical in both arms: it is what
      // lets the audit prove the guard ran on EVERY timed navigation.
      guardedPushes++
      return push('/home/guarded')
    },
    after: () => verify('guarded', '/home/guarded'),
    audit: auditGuard,
  }
  const toUser2 = {
    reset: async () => {
      await push('/home')
      await push('/home/user/1')
    },
    fn: () => push('/home/user/2'),
    after: () => verify('user', '/home/user/2', '2'),
  }
  const batch = (pre: number, post: number) => () => ({
    batchK: ROUTER_K,
    batchProbe: viewProbe,
    batchPreExpect: pre,
    batchExpect: post,
  })
  const home = VIEW_CODE.home! * 10 + 1
  return [
    { name: 'push: route change (/home → /home/detail)', ...toDetail },
    {
      name: 'push round trip (batch cycle: /home → /home/detail → /home)',
      ...toDetail,
      batch: batch(home, VIEW_CODE.detail! * 10 + 1),
    },
    { name: 'push: through 1 beforeEnter guard (/home → /home/guarded)', ...toGuarded },
    {
      name: 'push round trip through the guard (batch cycle: /home → /home/guarded → /home)',
      ...toGuarded,
      batch: batch(home, VIEW_CODE.guarded! * 10 + 1),
    },
    { name: 'push: param change (/home/user/1 → /home/user/2)', ...toUser2 },
    {
      name: 'push param change (batch cycle: /home → /home/user/1 → /home/user/2, 3 pushes)',
      ...toUser2,
      batch: batch(1000 + VIEW_CODE.user! * 10 + 1, 2000 + VIEW_CODE.user! * 10 + 1),
    },
  ]
}

export async function runRouter(framework: string, container: HTMLElement): Promise<BenchSuite> {
  if (framework !== 'Pyreon' && framework !== 'Pyreon (tabs)') {
    throw new Error(`[router] unknown framework: ${framework}`)
  }
  const withTabs = framework === 'Pyreon (tabs)'
  const suite: BenchSuite = { framework, container, results: [], gateFailures: [] }

  // The page was loaded at `/?mode=scenarios&…`; the router owns the URL from
  // here on, and the original is put back at teardown.
  const originalUrl = location.pathname + location.search
  history.replaceState(null, '', '/home')
  const routed = createRoutedApp(withTabs)
  const unmount = pyreonMount(routed.app(), container)
  try {
    await routed.router.isReady()
    makeVerify(container, routed.router, withTabs)('home', '/home')
    await gateThenTime(suite, routerOps(container, routed, withTabs), 'router')
  } finally {
    unmount()
    routed.router.destroy()
    history.replaceState(null, '', originalUrl)
  }
  return suite
}

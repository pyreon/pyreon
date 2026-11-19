/**
 * The routed app of the `router` scenario (`scenario-router.ts`), as idiomatic
 * source compiled by the real Pyreon compiler.
 *
 * Five small pages under one `<RouterView>`. Each page renders a root element
 * carrying `data-view`, which the scenario's gates and batch probes read. No
 * route has a loader, middleware or lazy component: the scenario times the
 * navigation pipeline and the view swap, not data fetching.
 *
 * Every route sets `meta: { viewTransition: false }`. With View Transitions on
 * (the router's default where the browser supports them), `push()` resolves
 * only after the browser's next rendering opportunity, so a timed push would be
 * frame-bound and measure the animation frame, not the router.
 */
import type { VNodeChild } from '@pyreon/core'
import * as routerModule from '@pyreon/router'
import { createRouter, RouterProvider, RouterView, useRoute } from '@pyreon/router'
import type { RouteRecord, Router } from '@pyreon/router'

function HomePage() {
  return (
    <section class="view" data-view="home">
      <h1>Home</h1>
      <p>Start page</p>
    </section>
  )
}

function DetailPage() {
  return (
    <section class="view" data-view="detail">
      <h1>Detail</h1>
      <p>Detail page</p>
    </section>
  )
}

function UserPage() {
  const route = useRoute()
  return (
    <section class="view" data-view="user">
      <h1>User</h1>
      <p class="user-id">{route().params.id}</p>
    </section>
  )
}

function GuardedPage() {
  return (
    <section class="view" data-view="guarded">
      <h1>Guarded</h1>
      <p>Behind a guard</p>
    </section>
  )
}

function OtherPage() {
  return (
    <section class="view" data-view="other">
      <h1>Other</h1>
      <p>Second tab root</p>
    </section>
  )
}

/** Tab roots, used only by the `tabs` arm. Every timed path is under `/home`. */
export const ROUTER_TABS = [
  { name: 'home', root: '/home' },
  { name: 'other', root: '/other' },
]

/**
 * `createRouter({ tabs })` takes a bare array on `main` (2026-11-19) and a
 * `routerTabs([...])` value after #4702. Resolving the wrapper by name lets ONE
 * scenario source build on both sides of that change, which is what an A/B of
 * #4702 needs. `Reflect.get` rather than `routerModule.routerTabs`: the static
 * form makes every build on `main` warn that the import is always undefined.
 * Once #4702 has merged, replace this with a direct `routerTabs(ROUTER_TABS)`.
 */
function tabsOption(): unknown {
  const wrap: unknown = Reflect.get(routerModule, 'routerTabs')
  return typeof wrap === 'function' ? (wrap as (t: typeof ROUTER_TABS) => unknown)(ROUTER_TABS) : ROUTER_TABS
}

export interface RoutedApp {
  router: Router
  /** Calls of the `/home/guarded` `beforeEnter` guard (the gate reads it). */
  guardCalls: () => number
  app: () => VNodeChild
}

export function createRoutedApp(withTabs: boolean): RoutedApp {
  let guardCalls = 0
  const meta = { viewTransition: false }
  const routes: RouteRecord[] = [
    { path: '/', redirect: '/home', component: HomePage, meta },
    { path: '/home', component: HomePage, meta },
    { path: '/home/detail', component: DetailPage, meta },
    { path: '/home/user/:id', component: UserPage, meta },
    {
      path: '/home/guarded',
      component: GuardedPage,
      meta,
      beforeEnter: () => {
        guardCalls++
        return true
      },
    },
    { path: '/other', component: OtherPage, meta },
  ]
  const router = createRouter({
    routes,
    mode: 'history',
    ...(withTabs ? ({ tabs: tabsOption() } as object) : {}),
  })
  return {
    router,
    guardCalls: () => guardCalls,
    app: () => (
      <RouterProvider router={router}>
        <RouterView />
      </RouterProvider>
    ),
  }
}

/**
 * A route with an `errorComponent` must still provide its loader data.
 *
 * `renderRouteContent` has two branches that both decide whether to wrap the
 * component in a `LoaderDataProvider`, and they are gated on one shared
 * predicate for a reason recorded in the source: pre-fix BOTH checked only
 * `record.loader`, so a route whose data comes from a `serverLoader` rendered
 * WITHOUT the provider and `useLoaderData()` returned the context default —
 * even though `router._loaderData` was populated and the hydration blob
 * carried the value.
 *
 * The comment also names which branch was missed first, and why it matters
 * most: "the errorComponent branch is the one EVERY zero route takes —
 * fs-router attaches a default errorComponent". So the dominant production
 * shape went through the arm that was wrong, and the symptom is a page that
 * renders with empty data rather than an error anyone can see.
 *
 * Nothing tested the combination. These pin all three data sources against the
 * errorComponent branch, so the two gates cannot drift apart again.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, RouterProvider, RouterView, useLoaderData } from '../index'
import { setActiveRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

const ErrorPage = () => h('div', { id: 'err' }, 'Error')

/** Renders whatever `useLoaderData()` gives it, so an empty read is visible. */
const ShowsData = () => {
  const data = useLoaderData<string>()
  return h('div', { id: 'data' }, data === undefined ? 'NO-DATA' : String(data))
}

function render(route: RouteRecord, url = '/x'): { text: string; router: RouterInstance } {
  const router = createRouter({ routes: [route], url }) as unknown as RouterInstance
  setActiveRouter(router as never)
  // The data is already resolved — this is about whether the PROVIDER is
  // installed, not about loading.
  router._loaderData.set(route, 'LOADED')
  const ctr = document.createElement('div')
  document.body.appendChild(ctr)
  mount(h(RouterProvider, { router }, h(RouterView, {})), ctr)
  return { text: ctr.textContent ?? '', router }
}

afterEach(() => {
  setActiveRouter(null)
  document.body.innerHTML = ''
})

describe('errorComponent + loader data', () => {
  test('an isomorphic loader route wrapped in an errorComponent still sees its data', () => {
    const { text } = render({
      path: '/x',
      component: ShowsData,
      loader: async () => 'LOADED',
      errorComponent: ErrorPage,
    })
    expect(text, 'useLoaderData must resolve inside the error boundary').toContain('LOADED')
  })

  test('a SERVER-loader route sees its data too (the shape that was broken)', () => {
    // `serverLoader` is the fn on the server graph. Pre-fix the gate checked
    // only `record.loader`, so this route rendered with no provider.
    const { text } = render({
      path: '/x',
      component: ShowsData,
      serverLoader: async () => 'LOADED',
      errorComponent: ErrorPage,
    })
    expect(text).toContain('LOADED')
  })

  test('the CLIENT marker `hasServerLoader` counts as carrying data', () => {
    // On the client only the marker survives — the function does not ship. A
    // gate reading `serverLoader` alone misses every hydrated server-loader
    // route, which is the majority of a zero app.
    const { text } = render({
      path: '/x',
      component: ShowsData,
      hasServerLoader: true,
      errorComponent: ErrorPage,
    })
    expect(text).toContain('LOADED')
  })

  test('a route with NO loader renders plainly, without a provider', () => {
    // The negative arm. Without it, "wrap everything" passes all three specs
    // above while installing a provider on routes that have no data — which
    // would shadow an ancestor's data with `undefined`.
    const { text } = render({ path: '/x', component: ShowsData, errorComponent: ErrorPage })
    expect(text, 'a data-less route must not claim to have data').toContain('NO-DATA')
  })

  test('the same predicate governs the NO-errorComponent branch', () => {
    // Two branches, one predicate — that is why they were unified. If they
    // drift, one of these two specs starts failing while the other passes.
    const { text } = render({
      path: '/x',
      component: ShowsData,
      hasServerLoader: true,
    })
    expect(text).toContain('LOADED')
  })

  test('and a data-less route without an errorComponent renders plainly too', () => {
    const { text } = render({ path: '/x', component: ShowsData })
    expect(text).toContain('NO-DATA')
  })
})

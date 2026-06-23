import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, type RouteRecord, RouterProvider } from '@pyreon/router'
import { clearAnnouncements } from '../announce'
import { RouteAnnouncer, type RouteAnnouncerOptions } from '../router'

const nextFrame = (): Promise<void> =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

function region(politeness: 'polite' | 'assertive' = 'polite'): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-pyreon-announcer="${politeness}"]`)
}

const noop = (): null => null
const routes: RouteRecord[] = [
  { path: '/', component: noop, meta: { title: 'Home' } },
  { path: '/about', component: noop, meta: { title: 'About' } },
  { path: '/raw', component: noop }, // no meta.title → path fallback
]

function mountAnnouncer(
  url: string,
  props: RouteAnnouncerOptions = {},
): { router: ReturnType<typeof createRouter>; dispose: () => void } {
  const router = createRouter({ routes, url })
  const dispose = mount(
    (
      <RouterProvider router={router}>
        <RouteAnnouncer {...props} />
      </RouterProvider>
    ),
    document.createElement('div'),
  )
  return { router, dispose }
}

let active: (() => void) | null = null

afterEach(() => {
  active?.()
  active = null
  clearAnnouncements()
})

describe('RouteAnnouncer / useRouteAnnouncer', () => {
  it('announces the destination route meta.title on navigation', async () => {
    const { router, dispose } = mountAnnouncer('/')
    active = dispose
    await router.push('/about')
    await nextFrame()
    expect(region()!.textContent).toBe('About')
  })

  it('falls back to "Navigated to <path>" when the route has no meta.title', async () => {
    const { router, dispose } = mountAnnouncer('/')
    active = dispose
    await router.push('/raw')
    await nextFrame()
    expect(region()!.textContent).toBe('Navigated to /raw')
  })

  it('uses a custom format callback', async () => {
    const { router, dispose } = mountAnnouncer('/', { format: (to) => `On ${to.meta.title}` })
    active = dispose
    await router.push('/about')
    await nextFrame()
    expect(region()!.textContent).toBe('On About')
  })

  it('skips the announcement when format returns null', async () => {
    const { router, dispose } = mountAnnouncer('/', { format: () => null })
    active = dispose
    await router.push('/about')
    await nextFrame()
    expect(region()).toBeNull() // no announce → no region was ever created
  })

  it('does NOT announce the initial route by default', async () => {
    const { dispose } = mountAnnouncer('/')
    active = dispose
    await nextFrame()
    expect(region()).toBeNull() // no navigation has happened yet
  })

  it('announces the initial route when announceInitial is set', async () => {
    const { dispose } = mountAnnouncer('/about', { announceInitial: true })
    active = dispose
    await nextFrame()
    expect(region()!.textContent).toBe('About')
  })

  it('respects the politeness option (assertive region)', async () => {
    const { router, dispose } = mountAnnouncer('/', { politeness: 'assertive' })
    active = dispose
    await router.push('/about')
    await nextFrame()
    expect(region('assertive')!.textContent).toBe('About')
    expect(region('polite')).toBeNull()
  })

  it('removes the afterEach hook on unmount (nothing announced after dispose)', async () => {
    const { router, dispose } = mountAnnouncer('/')
    dispose() // unmount → onMount cleanup removes the afterEach hook
    await router.push('/about')
    await nextFrame()
    expect(region()).toBeNull() // hook gone → no announcement
  })
})

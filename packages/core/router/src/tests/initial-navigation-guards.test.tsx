import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { RouterProvider, RouterView } from '../index'
import { createRouter } from '../router'
import type { NavigationGuard, RouteRecord } from '../types'

// The INITIAL navigation — the first URL a router resolves — goes through the
// gating half of the pipeline (route `redirect`, middleware, `beforeEnter`,
// global guards). Before this, a deep link to a guarded route rendered with no
// guard ever running: `createRouter({ url })` / a client's first location was
// committed directly, so `beforeEach: [to => to.path !== '/admin' || isAdmin()]`
// blocked `push('/admin')` and let `https://app/admin` straight in.

const Home = () => h('p', { id: 'home' }, 'home')
const Admin = () => h('p', { id: 'admin' }, 'secret')
const Login = () => h('p', { id: 'login' }, 'login')

function routes(adminGuard?: NavigationGuard): RouteRecord[] {
  return [
    { path: '/', component: Home },
    { path: '/login', component: Login },
    { path: '/admin', component: Admin, ...(adminGuard ? { beforeEnter: adminGuard } : {}) },
    { path: '/old', redirect: '/login', component: Home },
  ]
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('initial navigation runs the guard pipeline (client)', () => {
  it('a beforeEach OPTION guard cancels a deep link: the guarded page never renders', async () => {
    const router = createRouter({ routes: routes(), url: '/admin', beforeEach: [(to) => to.path !== '/admin'] })
    const el = document.createElement('div')
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    expect(el.querySelector('#admin')).toBeNull()
    await router.isReady()
    await tick()
    expect(el.querySelector('#admin')).toBeNull()
  })

  it('a guard registered with router.beforeEach() after createRouter runs too', async () => {
    let ran = 0
    const router = createRouter({ routes: routes(), url: '/admin' })
    router.beforeEach((to) => {
      ran++
      return to.path === '/admin' ? '/login' : true
    })
    await router.isReady()
    expect(ran).toBeGreaterThan(0)
    expect(router.currentRoute().path).toBe('/login')
  })

  it('a beforeEnter redirect REPLACES the deep link and renders the target', async () => {
    const router = createRouter({ routes: routes(() => '/login'), url: '/admin', mode: 'history' })
    const el = document.createElement('div')
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    expect(el.querySelector('#admin')).toBeNull()
    await router.isReady()
    await tick()
    expect(router.currentRoute().path).toBe('/login')
    expect(el.querySelector('#login')).not.toBeNull()
    expect(el.querySelector('#admin')).toBeNull()
  })

  it('an async guard holds the view empty until it approves, then renders', async () => {
    let approve!: (v: boolean) => void
    const pending = new Promise<boolean>((r) => {
      approve = r
    })
    const router = createRouter({ routes: routes(() => pending), url: '/admin' })
    const el = document.createElement('div')
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    await tick()
    expect(el.querySelector('#admin')).toBeNull()
    approve(true)
    await router.isReady()
    await tick()
    expect(el.querySelector('#admin')).not.toBeNull()
  })

  it('guards see from = a START route with no matched records', async () => {
    let fromMatched = -1
    const router = createRouter({
      routes: routes(),
      url: '/admin',
      beforeEach: [
        (_to, from) => {
          fromMatched = from.matched.length
          return true
        },
      ],
    })
    await router.isReady()
    expect(fromMatched).toBe(0)
  })

  it('a route-level redirect applies to a deep link', async () => {
    const router = createRouter({ routes: routes(), url: '/old' })
    await router.isReady()
    expect(router.currentRoute().path).toBe('/login')
  })

  it('a guarded route is not preloaded: its loader never runs', async () => {
    let loaderRan = false
    const router = createRouter({
      url: '/admin',
      routes: [
        { path: '/', component: Home },
        { path: '/admin', component: Admin, beforeEnter: () => false, loader: async () => {
          loaderRan = true
          return 1
        } },
      ],
    })
    await router.preload('/admin')
    expect(loaderRan).toBe(false)
  })

  it('an app with no guards renders on the FIRST pass (nothing deferred)', () => {
    const router = createRouter({ routes: routes(), url: '/admin' })
    const el = document.createElement('div')
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    expect(el.querySelector('#admin')).not.toBeNull()
  })
})

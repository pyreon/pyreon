import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { RouterView } from '@pyreon/router'
import { createHandler } from '../handler'

// A deep link to a guarded route must be gated on the SERVER too: the handler
// preloads the initial route, which runs its `beforeEnter` / `beforeEach`, so a
// guard redirect is an HTTP redirect and a cancelled route never reaches the HTML.
const App: ComponentFn = () => h(RouterView, null)
const Home: ComponentFn = () => h('h1', null, 'home')
const Secret: ComponentFn = () => h('h1', null, 'TOP-SECRET')

for (const mode of ['string', 'stream'] as const) {
  describe(`initial-navigation guards in createHandler (${mode})`, () => {
    test('a beforeEnter redirect answers with a redirect, before any render', async () => {
      const handler = createHandler({
        App,
        mode,
        routes: [
          { path: '/', component: Home },
          { path: '/login', component: Home },
          { path: '/admin', component: Secret, beforeEnter: () => '/login' },
        ],
      })
      const res = await handler(new Request('http://localhost/admin'))
      expect(res.status).toBe(307)
      expect(res.headers.get('Location')).toBe('/login')
    })

    test('a cancelling beforeEnter keeps the guarded content and its loader out of the response', async () => {
      let loaderRan = false
      const handler = createHandler({
        App,
        mode,
        routes: [
          { path: '/', component: Home },
          {
            path: '/admin',
            component: Secret,
            beforeEnter: () => false,
            loader: async () => {
              loaderRan = true
              return 1
            },
          },
        ],
      })
      const res = await handler(new Request('http://localhost/admin'))
      expect(await res.text()).not.toContain('TOP-SECRET')
      expect(loaderRan).toBe(false)
    })
  })
}

import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { RouterLink, RouterView } from '@pyreon/router'
import { createHandler } from '../handler'

// A subpath deploy (`base: '/app/'`): the handler built its per-request router
// WITHOUT the base, so `/app/about` resolved no route and every page 404'd in
// production while `/about` rendered.
describe('createHandler — base', () => {
  const About: ComponentFn = () => h('h1', { id: 'about' }, 'About')
  const Home: ComponentFn = () => h('div', null, h(RouterLink, { to: '/about' }, 'go'))
  const routes = [
    { path: '/', component: Home },
    { path: '/about', component: About },
  ]
  const App: ComponentFn = () => h(RouterView, null)

  for (const mode of ['string', 'stream'] as const) {
    test(`${mode}: a base-prefixed path renders its route`, async () => {
      const handler = createHandler({ App, routes, base: '/app/', mode })
      const res = await handler(new Request('http://localhost/app/about?x=1'))
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('id="about"')
    })
  }

  test('the base root renders "/" and links carry the base', async () => {
    const handler = createHandler({ App, routes, base: '/app' })
    const res = await handler(new Request('http://localhost/app/'))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('href="/app/about"')
  })

  test('without base, behaviour is unchanged', async () => {
    const handler = createHandler({ App, routes })
    const res = await handler(new Request('http://localhost/about'))
    expect(await res.text()).toContain('id="about"')
  })
})

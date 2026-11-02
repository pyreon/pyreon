import { createRouter } from '../router'
import type { AfterEachHook, NavigationGuard } from '../types'

// `beforeEach` / `afterEach` as createRouter OPTIONS. The native targets lower exactly this form, so a shared source
// that declares its guards with the routes must behave the same on the web — before these options existed the web
// router ignored them and the guarded route rendered.
const Page = () => null
const routes = [
  { path: '/', component: Page },
  { path: '/open', component: Page },
  { path: '/guarded', component: Page },
]

describe('createRouter beforeEach / afterEach options', () => {
  it('a beforeEach option guard blocks its path and allows the rest', async () => {
    const router = createRouter({ routes, url: '/', beforeEach: [(to) => to.path !== '/guarded'] })
    expect(await router.push('/guarded')).toBe('cancelled')
    expect(router.currentRoute().path).toBe('/')
    expect(await router.push('/open')).toBe('committed')
    expect(router.currentRoute().path).toBe('/open')
  })

  it('option guards run before guards registered with router.beforeEach()', async () => {
    const order: string[] = []
    const fromOption: NavigationGuard = () => {
      order.push('option')
      return true
    }
    const router = createRouter({ routes, url: '/', beforeEach: [fromOption] })
    router.beforeEach(() => {
      order.push('registered')
      return true
    })
    await router.push('/open')
    expect(order).toEqual(['option', 'registered'])
  })

  it('an afterEach option hook runs after a committed navigation, not a cancelled one', async () => {
    const seen: string[] = []
    const hook: AfterEachHook = (to) => {
      seen.push(to.path)
    }
    const router = createRouter({
      routes,
      url: '/',
      beforeEach: [(to) => to.path !== '/guarded'],
      afterEach: [hook],
    })
    await router.push('/guarded')
    await router.push('/open')
    expect(seen).toEqual(['/open'])
  })

  it('does not mutate the options arrays when guards are registered later', async () => {
    const beforeEach: NavigationGuard[] = [() => true]
    const router = createRouter({ routes, url: '/', beforeEach })
    router.beforeEach(() => true)
    expect(beforeEach).toHaveLength(1)
  })
})

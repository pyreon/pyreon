// A route table the native compiler cannot read must never cost the router its dispatch SILENTLY.
//
// `parseRouteArray` returns null for the whole table when one route is unreadable (the compiler never emits a partial
// one), and the router then emits bare: a `RouterView` that renders only the home page, on both targets, with ZERO
// warnings. The common trigger was a shared constant — `{ path: ADMIN_PATH, component: Admin }` — which is as static as
// an inline literal and is the ordinary way to name a path a guard or a `navigate()` call also uses. Found when the
// router demo gained exactly that route and its emit SHRANK by 1KB instead of growing.
//
// Now: a module string const resolves for `path` and `redirect`, and every remaining bail names the route and why.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const app = (routes: string, pre = ''): string => `import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { Text } from '@pyreon/primitives'
const ADMIN_PATH = '/admin'
const HOME = '/'
${pre}
function HomePage() { return <Text>home</Text> }
function AdminPage() { return <Text>admin</Text> }
export function App() {
  const router = createRouter({ routes: [${routes}] })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`

const CONST_PATH = app(`{ path: '/', component: HomePage }, { path: ADMIN_PATH, component: AdminPage }`)

describe('route table — static paths', () => {
  it('a module-const path dispatches on Swift', () => {
    const r = transform(CONST_PATH, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonRouter.matchPath(path, "/admin") != nil')
    expect(r.code).toContain('AdminPage()')
  })

  it('a module-const path dispatches on Kotlin', () => {
    const r = transform(CONST_PATH, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonRouter.matchPath(currentPath, "/admin") != null -> AdminPage()')
  })

  it('a module-const redirect target resolves', () => {
    const src = app(`{ path: HOME, component: HomePage }, { path: '/old', redirect: ADMIN_PATH }, { path: ADMIN_PATH, component: AdminPage }`)
    const r = transform(src, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"/admin"')
    expect(r.code).toContain('PyreonRouter.matchPath(path, "/old")')
  })

  const BAILS: Record<string, [string, RegExp]> = {
    'a path that is not known at compile time': [
      app(`{ path: '/', component: HomePage }, { path: makePath(), component: AdminPage }`, 'function makePath() { return "/x" }'),
      /`path` \(`makePath\(\)`\) is not a string known at compile time/,
    ],
    'a route with no path': [app(`{ path: '/', component: HomePage }, { component: AdminPage }`), /route has no `path`/],
    'a route with nothing to render': [app(`{ path: '/', component: HomePage }, { path: '/x' }`), /route "\/x" has no `component`/],
    'a route that is not an object literal': [
      app(`{ path: '/', component: HomePage }, adminRoute`, "const adminRoute = { path: '/admin', component: AdminPage }"),
      /route is not an object literal \(Identifier\)/,
    ],
  }

  for (const [name, [src, warning]] of Object.entries(BAILS)) {
    for (const target of ['swift', 'kotlin'] as const) {
      it(`${name} warns by name instead of silently dropping the table (${target})`, () => {
        const r = transform(src, { target })
        expect(r.warnings.join('\n')).toMatch(warning)
        expect(r.warnings.join('\n')).toMatch(/NO routes on iOS\/Android/)
      })
    }
  }

  it.skipIf(!isSwiftcAvailable())('the const-path router typechecks against the Swift stubs', () => {
    const v = validateSwiftWithStubs(transform(CONST_PATH, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the const-path router compiles with kotlinc', () => {
    const v = validateKotlin(transform(CONST_PATH, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  }, 120_000)
})

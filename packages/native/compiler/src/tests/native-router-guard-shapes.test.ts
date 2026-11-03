// Global router guards on native: inline arrows lower, the web route shape maps, and the gates compile them.
//
// - An inline guard (`beforeEach: [(to) => to.path !== '/admin']`) — the most common way to write one — was dropped with
//   a warning, leaving the navigation ungated on iOS/Android. It is now a synthesized file-level helper, referenced by
//   name like a named guard.
// - A web guard is `(to, from) => boolean` over route OBJECTS; the native routers call it with the target PATH. `to.path`
//   now reads the path and an unused `from` is dropped, for named and inline guards alike.
// - The validation stubs lacked `beforeEachGuards` / `afterEachHooks`, so no guard emit had ever compiled in the gates —
//   the existing tests asserted strings only.
// What cannot lower is warned by name and dropped whole: a capture of a component local, `to.params` / `to.query`, a
// read of `from`, a redirect result, an async guard.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const app = (opts: string, { pre = '', local = '' } = {}): string => `import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { Text } from '@pyreon/primitives'
const BLOCKED = '/admin'
function track(p: string) {}
${pre}
function HomePage() { return <Text>home</Text> }
export function App() {
  ${local}
  const router = createRouter({ routes: [{ path: '/', component: HomePage }, { path: '/admin', component: HomePage }], ${opts} })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`

const LOWERS: Record<string, string> = {
  'a named guard over the native path': app('beforeEach: [authGuard]', { pre: "function authGuard(p) { return p !== '/admin' }" }),
  'a named guard in the web shape (to, from) => to.path': app('beforeEach: [authGuard]', {
    pre: "function authGuard(to, from) { return to.path !== '/admin' }",
  }),
  'an inline guard reading to.path and a module const': app('beforeEach: [(to) => to.path !== BLOCKED]'),
  'an inline guard with an unused from': app("beforeEach: [(to, from) => to.path !== '/admin']"),
  'an inline block-body guard': app('beforeEach: [(to) => { if (to.path === BLOCKED) { return false } return true }]'),
  'an inline afterEach hook': app('afterEach: [(to) => { track(to.path) }]'),
}

const WARNS: Record<string, [string, RegExp]> = {
  'a capture of a component local': [app('beforeEach: [(to) => to.path !== secret]', { local: "const secret = '/x'" }), /reads `secret`/],
  'a read of to.params': [app("beforeEach: [(to) => to.params.id !== '1']"), /reads `to\.params`/],
  'a read of from': [app('beforeEach: [(to, from) => from.path !== to.path]'), /reads `from`/],
  'a redirect result': [app("beforeEach: [(to) => to.path === BLOCKED ? '/login' : true]"), /other than true \/ false/],
  'an async guard': [app('beforeEach: [async (to) => true]'), /async guard/],
}

describe('global router guards on native', () => {
  for (const [label, src] of Object.entries(LOWERS)) {
    describe(label, () => {
      it('lowers with no warning, wired to the router', () => {
        for (const target of ['swift', 'kotlin'] as const) {
          const r = transform(src, { target })
          expect(r.warnings, target).toEqual([])
          expect(r.code, target).toMatch(target === 'swift' ? /r\.(beforeEachGuards|afterEachHooks)\.append\(/ : /(beforeEachGuards|afterEachHooks)\.add\(::/)
        }
      })

      it('takes the target path as a String', () => {
        expect(transform(src, { target: 'swift' }).code).toMatch(/func \w+\(_ \w+: String\)/)
        expect(transform(src, { target: 'kotlin' }).code).toMatch(/fun \w+\(\w+: String\)/)
      })

      it.runIf(isSwiftcAvailable())('Swift emit typechecks', () => {
        const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
        expect(v.ok, v.error).toBe(true)
      })

      it.runIf(isKotlincAvailable())('Kotlin emit typechecks', () => {
        const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
        expect(v.ok, v.error).toBe(true)
      })
    })
  }

  for (const [label, [src, why]] of Object.entries(WARNS)) {
    it(`${label}: warns by name, drops the guard, and leaves nothing uncompilable`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(src, { target })
        expect(r.warnings.join('\n'), target).toMatch(why)
        expect(r.warnings.join('\n'), target).toContain('NOT gated on iOS/Android')
        expect(r.code, target).not.toMatch(/beforeEachGuards|__pyreonGuard/)
      }
    })
  }
})

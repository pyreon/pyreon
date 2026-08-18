// Round-2 follow-up — global `beforeEach` / `afterEach` guards on
// `createRouter({ ... })`.
//
// Runtime additions in PyreonRouter (Swift + Kotlin) carry the guard
// chain — beforeEach runs before push/replace (any false → block);
// afterEach runs after the path commit (fan-out, side effects only).
//
// Compiler emit:
//   Swift  → `@State private var router: PyreonRouter = {
//              let r = PyreonRouter()
//              r.beforeEachGuards.append(authGuard)
//              r.afterEachHooks.append(logHook)
//              return r
//            }()`
//   Kotlin → `val router = remember { PyreonRouter().apply {
//              beforeEachGuards.add(::authGuard)
//              afterEachHooks.add(::logHook)
//            } }`
//
// Conservative parse: only IDENTIFIER REFS captured. Inline arrow
// bodies (`beforeEach: [(p) => isAuthed()]`) are NOT lowered (closure-
// emit + capture machinery is a follow-up) but now WARN by name rather
// than dropping silently — a vanished guard would leave the route
// ungated on native, a security foot-gun.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function src(routerCall: string): string {
  return `
function authGuard(p) { return true }
function logHook(p) {}
function HomePage() { return <Text>home</Text> }
function App() {
  const router = ${routerCall}
  return <RouterProvider router={router}><HomePage/></RouterProvider>
}
`
}

describe('Round-2 follow-up — global beforeEach / afterEach guards on createRouter', () => {
  describe('Swift', () => {
    it('emits closure-init that appends each beforeEach guard', () => {
      const out = transform(
        src(`createRouter({ routes: [{ path: '/', component: HomePage }], beforeEach: [authGuard] })`),
        { target: 'swift' },
      ).code
      expect(out).toContain('@State private var router: PyreonRouter = {')
      expect(out).toContain('let r = PyreonRouter()')
      expect(out).toContain('r.beforeEachGuards.append(authGuard)')
      expect(out).toContain('return r')
      expect(out).toContain('}()')
    })

    it('emits closure-init that appends each afterEach hook', () => {
      const out = transform(
        src(`createRouter({ routes: [{ path: '/', component: HomePage }], afterEach: [logHook] })`),
        { target: 'swift' },
      ).code
      expect(out).toContain('r.afterEachHooks.append(logHook)')
    })

    it('handles BOTH beforeEach AND afterEach in one config', () => {
      const out = transform(
        src(`createRouter({ routes: [{ path: '/', component: HomePage }], beforeEach: [authGuard], afterEach: [logHook] })`),
        { target: 'swift' },
      ).code
      expect(out).toContain('r.beforeEachGuards.append(authGuard)')
      expect(out).toContain('r.afterEachHooks.append(logHook)')
    })

    it('multiple guards in the same array each get their own append', () => {
      const out = transform(
        `
        function g1(p) { return true }
        function g2(p) { return true }
        function HomePage() { return <Text>x</Text> }
        function App() {
          const router = createRouter({ routes: [{ path: '/', component: HomePage }], beforeEach: [g1, g2] })
          return <RouterProvider router={router}><HomePage/></RouterProvider>
        }
        `,
        { target: 'swift' },
      ).code
      expect(out).toContain('r.beforeEachGuards.append(g1)')
      expect(out).toContain('r.beforeEachGuards.append(g2)')
    })

    it('falls back to bare init when NO guards configured (back-compat)', () => {
      const out = transform(
        src(`createRouter({ routes: [{ path: '/', component: HomePage }] })`),
        { target: 'swift' },
      ).code
      expect(out).toContain('@State private var router = PyreonRouter()')
      // NO closure-init shape.
      expect(out).not.toContain('beforeEachGuards.append')
      expect(out).not.toContain('afterEachHooks.append')
    })
  })

  describe('Kotlin', () => {
    it('emits apply{} block adding each beforeEach guard via :: member ref', () => {
      const out = transform(
        src(`createRouter({ routes: [{ path: '/', component: HomePage }], beforeEach: [authGuard] })`),
        { target: 'kotlin' },
      ).code
      expect(out).toContain('val router = remember { PyreonRouter().apply {')
      expect(out).toContain('beforeEachGuards.add(::authGuard)')
    })

    it('emits apply{} block adding each afterEach hook', () => {
      const out = transform(
        src(`createRouter({ routes: [{ path: '/', component: HomePage }], afterEach: [logHook] })`),
        { target: 'kotlin' },
      ).code
      expect(out).toContain('afterEachHooks.add(::logHook)')
    })

    it('falls back to bare remember{} when NO guards configured', () => {
      const out = transform(
        src(`createRouter({ routes: [{ path: '/', component: HomePage }] })`),
        { target: 'kotlin' },
      ).code
      expect(out).toContain('val router = remember { PyreonRouter() }')
      expect(out).not.toContain('beforeEachGuards.add')
      expect(out).not.toContain('afterEachHooks.add')
    })
  })

  describe('parser — conservative shape', () => {
    it('inline arrow bodies in beforeEach are NOT lowered but WARN by name (not a silent drop)', () => {
      const res = transform(
        `
        function HomePage() { return <Text>x</Text> }
        function App() {
          const router = createRouter({ routes: [{ path: '/', component: HomePage }], beforeEach: [(p) => true] })
          return <RouterProvider router={router}><HomePage/></RouterProvider>
        }
        `,
        { target: 'swift' },
      )
      // Emit still drops it (closure-emit is a follow-up) → bare init.
      expect(res.code).toContain('@State private var router = PyreonRouter()')
      expect(res.code).not.toContain('beforeEachGuards.append')
      // …but it is no longer SILENT: a named warning points at the fix. A
      // dropped inline guard would leave the route ungated on native — a
      // security foot-gun — so the failure mode must be visible.
      const warn = res.warnings.find((w) => w.includes('router `beforeEach`'))
      expect(warn, 'expected a named warning for the dropped inline guard').toBeTruthy()
      expect(warn).toContain('inline function')
      expect(warn).toContain('NOT gated')
    })

    it('a NAMED-function beforeEach guard lowers with no warning (control)', () => {
      const res = transform(
        `
        function authGuard(p) { return true }
        function HomePage() { return <Text>x</Text> }
        function App() {
          const router = createRouter({ routes: [{ path: '/', component: HomePage }], beforeEach: [authGuard] })
          return <RouterProvider router={router}><HomePage/></RouterProvider>
        }
        `,
        { target: 'swift' },
      )
      expect(res.code).toContain('beforeEachGuards.append(authGuard)')
      expect(res.warnings.some((w) => w.includes('router `beforeEach`'))).toBe(false)
    })

    it('non-array beforeEach value is silently dropped', () => {
      const out = transform(
        `
        function authGuard(p) { return true }
        function HomePage() { return <Text>x</Text> }
        function App() {
          const router = createRouter({ routes: [{ path: '/', component: HomePage }], beforeEach: authGuard })
          return <RouterProvider router={router}><HomePage/></RouterProvider>
        }
        `,
        { target: 'swift' },
      ).code
      // Singular form not supported — array required.
      expect(out).toContain('@State private var router = PyreonRouter()')
      expect(out).not.toContain('beforeEachGuards.append')
    })
  })
})

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
// bodies (`beforeEach: [(p) => isAuthed()]`) are silently dropped
// — they'd need closure-emit + capture machinery not in this PR.

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
    it('inline arrow bodies in beforeEach are silently dropped (closure-emit out of scope)', () => {
      const out = transform(
        `
        function HomePage() { return <Text>x</Text> }
        function App() {
          const router = createRouter({ routes: [{ path: '/', component: HomePage }], beforeEach: [(p) => true] })
          return <RouterProvider router={router}><HomePage/></RouterProvider>
        }
        `,
        { target: 'swift' },
      ).code
      // No guards captured → falls back to bare init.
      expect(out).toContain('@State private var router = PyreonRouter()')
      expect(out).not.toContain('beforeEachGuards.append')
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

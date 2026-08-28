import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/**
 * A STATIC route branch must resolve through the router's own `matchPath`,
 * exactly as a dynamic one does — never through a hand-rolled comparison of
 * the current path against the route pattern.
 *
 * This is a CLASS lock, not a shape lock, and the distinction is the whole
 * point of the file.
 *
 * The emit used to compare the raw current path (`path == "/toolkit"`). That
 * broke the moment anything appended to the path: `setQueryParam` made it
 * `/toolkit?filter=done`, no branch matched, and the screen rendered NOTHING
 * — caught by the device gates on both platforms, not by any unit test.
 *
 * The obvious repair was to strip the query before comparing. That fixes the
 * reported shape and leaves the class open, which a differential probe against
 * the real runtime showed directly — comparing a stripped path still disagrees
 * with `matchPath` on:
 *
 *     /toolkit/     trailing slash   matchPath matches, equality does not
 *     //toolkit     empty segment    matchPath matches, equality does not
 *
 * Every one of those is a normalization rule `matchPath` already implements and
 * a comparison has to re-implement — and would have to keep re-implementing for
 * any rule added later. So the fix is to stop having two matchers: static and
 * dynamic branches both call `matchPath`, and the rules live in ONE place.
 *
 * The rules themselves are locked runtime-side, on both targets:
 *   - Swift:  PyreonRouterTests.swift, "Leading / trailing slashes are tolerated"
 *   - Kotlin: PyreonRouterTest.kt, "matchPath tolerates leading/trailing slashes"
 *
 * What those cannot see is whether the EMIT actually calls the thing they lock.
 * That is this file's job.
 */
const APP = `
  export function Home() { return <Stack><Text>home</Text></Stack> }
  export function Toolkit() { return <Stack><Text>toolkit</Text></Stack> }
  export function User() { return <Stack><Text>user</Text></Stack> }
  export function App() {
    const router = createRouter({ routes: [
      { path: '/', component: Home },
      { path: '/toolkit', component: Toolkit },
      { path: '/users/:id', component: User },
    ] })
    return <RouterProvider router={router}><RouterView /></RouterProvider>
  }
`

describe('a static route resolves through the router matcher, not a comparison', () => {
  for (const [target, cur, nullLit] of [
    ['swift', 'path', 'nil'],
    ['kotlin', 'currentPath', 'null'],
  ] as const) {
    describe(target, () => {
      const out = transform(APP, { target }).code

      it('the static route calls matchPath', () => {
        expect(out).toContain(`PyreonRouter.matchPath(${cur}, "/toolkit") != ${nullLit}`)
      })

      it('the dynamic route calls the SAME matcher — one matcher, not two', () => {
        expect(out).toContain(`PyreonRouter.matchPath(${cur}, "/users/:id")`)
      })

      /**
       * The load-bearing one. Both repaired forms of the old bug still SATISFY
       * the two assertions above while reintroducing the class, so this asserts
       * the absence of a second matcher rather than the presence of the right
       * one.
       */
      it('no route is dispatched by comparing the path against the pattern', () => {
        for (const route of ['/', '/toolkit', '/users/:id']) {
          // The raw form the device gates caught.
          expect(out).not.toContain(`${cur} == ${JSON.stringify(route)}`)
          // The strip-then-compare form, which fixes the query and keeps the
          // trailing-slash and empty-segment halves of the same class.
          expect(out).not.toContain(`splitPathAndQuery(${cur})`)
        }
      })
    })
  }
})

// Phase 3 — per-route data loader auto-emit.
//
//   { path: '/', component: Home, loader: () => buildStats() }
//   ↓ (wraps the route's render in a runtime PyreonRouteLoader host whose
//      .task / LaunchedEffect fires the loader once → router.setLoaderData)
//   Swift:  PyreonRouteLoader(path: path, load: { … }) { Home() }
//   Kotlin: PyreonRouteLoader(path = currentPath, load = { … }) { Home() }
//
// The loader-data KEY is the runtime active path (`path` in the Swift
// navigationDestination closure / `currentPath` in the Kotlin dispatch)
// so it matches the already-shipped `useLoaderData<T>()` read
// (`router.loaderData[router.currentPath]`) for BOTH literal and `:param`
// routes. The home route (Swift NavigationStack initial body) keys by the
// literal home path, which equals `currentPath` at launch.
//
// v1 scope (mirrors `beforeEnter`): only a ZERO-PARAM, EXPRESSION-body
// arrow is captured. A `(ctx) => …` loader and a block-body loader WARN
// and emit the route with NO loader (the component still renders).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const SRC = `import { Stack, Text } from '@pyreon/primitives'
function Home() { return (<Stack><Text>home</Text></Stack>) }
function About() { return (<Stack><Text>about</Text></Stack>) }
function User() { return (<Stack><Text>user</Text></Stack>) }
function App() {
  const router = createRouter({ routes: [
    { path: '/', component: Home, loader: () => 1 },
    { path: '/about', component: About },
    { path: '/users/:id', component: User, loader: () => 2 },
  ] })
  return (<RouterProvider router={router}><RouterView /></RouterProvider>)
}`

describe('Phase 3 — per-route loader auto-emit', () => {
  it('Swift: home route wraps in PyreonRouteLoader keyed by the literal home path', () => {
    const out = transform(SRC, { target: 'swift' }).code
    // NavigationStack initial body (the home `/` route) — keyed by "/".
    expect(out).toContain('PyreonRouteLoader(path: "/", load: { 1 }) { Home() }')
  })

  it('Swift: pushed routes key the loader by the runtime `path` var (literal + param)', () => {
    const out = transform(SRC, { target: 'swift' }).code
    // Inside `.navigationDestination(for:) { path in … }` both the literal
    // `/` and the `:param` route key on the runtime `path` (== currentPath).
    expect(out).toContain('PyreonRouteLoader(path: path, load: { 1 }) { Home() }')
    expect(out).toContain('PyreonRouteLoader(path: path, load: { 2 }) { User() }')
  })

  it('Kotlin: routes wrap in PyreonRouteLoader keyed by currentPath', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('PyreonRouteLoader(path = currentPath, load = { 1 }) { Home() }')
    expect(out).toContain('PyreonRouteLoader(path = currentPath, load = { 2 }) { User() }')
  })

  it('a route WITHOUT a loader is NOT wrapped (zero-cost — no behavior change)', () => {
    const sw = transform(SRC, { target: 'swift' }).code
    const kt = transform(SRC, { target: 'kotlin' }).code
    // `/about` has no loader → bare `About()`, never inside a PyreonRouteLoader.
    expect(sw).toContain('About()')
    expect(sw).not.toContain('load: { 0 }') // sanity: no stray empty loader
    // The About render must not be wrapped — no PyreonRouteLoader precedes it.
    expect(sw).not.toMatch(/PyreonRouteLoader\([^)]*\)\s*\{\s*About\(\)/)
    expect(kt).not.toMatch(/PyreonRouteLoader\([^)]*\)\s*\{\s*About\(\)/)
  })

  it('v1 conservative bail: a param-using loader (`(ctx) => …`) WARNS and emits NO loader', () => {
    const src = SRC.replace('loader: () => 2', 'loader: (ctx) => ctx')
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('takes a parameter') && w.includes('/users/:id'))).toBe(
      true,
    )
    // The route still renders its component, just without a loader wrap.
    expect(r.code).not.toContain('load: { ctx }')
  })

  it('v1 conservative bail: a block-body loader WARNS and emits NO loader', () => {
    const src = SRC.replace('loader: () => 1', 'loader: () => { return 1 }')
    const r = transform(src, { target: 'kotlin' })
    expect(r.warnings.some((w) => w.includes('block-body arrow') && w.includes('"/"'))).toBe(true)
    // Home renders bare (no PyreonRouteLoader for "/").
    expect(r.code).not.toContain('PyreonRouteLoader(path = currentPath, load = { 1 })')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC, { target: 'swift' }).code
    const r = validateSwift(out)
    if (!r.ok) throw new Error(`swiftc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('emitted Kotlin compiles on real kotlinc', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    const r = validateKotlin(out)
    if (!r.ok) throw new Error(`kotlinc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })
})

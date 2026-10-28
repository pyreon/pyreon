// Siblings of `<RouterView />` inside a routes-bearing `<RouterProvider>`.
//
// On the web, RouterView marks the routed slot and everything around it (a
// header, a nav bar, a `<Toaster />`) persists across navigation. The Kotlin
// emit replaced the provider's WHOLE content with the route dispatch once the
// route table resolved, so every sibling vanished with no warning — an app's
// `<Toaster />` beside its RouterView never rendered on Android, and every
// `toast()` call compiled and showed nothing.
//
// Now the content emits as written and the RouterView itself becomes the
// dispatch, wherever it sits.
//
// iOS had the same class in a different form: every child sat inside the
// NavigationStack's ROOT, so a sibling was covered as soon as any screen was
// pushed. Now the RouterView alone becomes the NavigationStack, the siblings
// render around it, and the router is provided to the whole tree.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
import { Toaster } from '@pyreon/toast'
function Home() { return <Text>home</Text> }
function About() { return <Text>about</Text> }
export function App() {
  const router = createRouter({ routes: [{ path: '/', component: Home }, { path: '/about', component: About }] })
  return (
    <RouterProvider router={router}>
      <Text data-testid="header">Header</Text>
      <RouterView />
      <Toaster />
    </RouterProvider>
  )
}
`

const NESTED = `
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
function Home() { return <Text>home</Text> }
export function App() {
  const router = createRouter({ routes: [{ path: '/', component: Home }] })
  return (
    <RouterProvider router={router}>
      <Stack>
        <Text data-testid="header">Header</Text>
        <RouterView />
      </Stack>
    </RouterProvider>
  )
}
`

const BARE = `
import { createRouter, RouterProvider } from '@pyreon/router'
import { Text } from '@pyreon/primitives'
function Home() { return <Text>home</Text> }
export function App() {
  const router = createRouter({ routes: [{ path: '/', component: Home }] })
  return <RouterProvider router={router}><Text>unused</Text></RouterProvider>
}
`

const body = (code: string): string => code.slice(code.indexOf('fun App('))

describe('Kotlin <RouterProvider>: siblings of <RouterView /> persist', () => {
  it('keeps a sibling before and after the routed slot, in source order', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    const app = body(r.code)
    const header = app.indexOf('text = "Header"')
    const dispatch = app.indexOf('val currentPath = router.currentPath')
    const toaster = app.indexOf('PyreonToaster()')
    expect(header, 'header sibling emitted').toBeGreaterThan(-1)
    expect(dispatch, 'route dispatch emitted').toBeGreaterThan(-1)
    expect(toaster, 'toaster sibling emitted').toBeGreaterThan(-1)
    expect(header).toBeLessThan(dispatch)
    expect(dispatch).toBeLessThan(toaster)
    // The slot is the dispatch, not a bare runtime RouterView with no routes.
    expect(app).not.toContain('RouterView()')
  })

  it('a RouterView nested in a layout container becomes the dispatch in place', () => {
    const app = body(transform(NESTED, { target: 'kotlin' }).code)
    expect(app).toContain('text = "Header"')
    expect(app).toContain('val currentPath = router.currentPath')
    expect(app).not.toContain('RouterView()')
  })

  it('without a RouterView the dispatch is still the whole content (unchanged shape)', () => {
    const app = body(transform(BARE, { target: 'kotlin' }).code)
    expect(app).toContain('val currentPath = router.currentPath')
    expect(app).not.toContain('"unused"')
  })

  it.runIf(isKotlincAvailable())('the sibling-bearing emit typechecks against the stubs', () => {
    for (const src of [SRC, NESTED]) {
      const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })
})

const LONE = `
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { Text } from '@pyreon/primitives'
function Home() { return <Text>home</Text> }
export function App() {
  const router = createRouter({ routes: [{ path: '/', component: Home }] })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}
`

const swiftBody = (code: string): string => code.slice(code.indexOf('struct App: View'))

describe('Swift <RouterProvider>: siblings of <RouterView /> sit OUTSIDE the navigation stack', () => {
  it('siblings render around the stack, in order, with the router provided to all of them', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    const app = swiftBody(r.code)
    const header = app.indexOf('Text("Header")')
    const stack = app.indexOf('RouterProvider(router: router) {')
    const destinations = app.indexOf('.navigationDestination(for: String.self)')
    const stackEnd = app.indexOf('PyreonToaster()')
    expect(header, 'header emitted').toBeGreaterThan(-1)
    expect(stack, 'navigation stack emitted').toBeGreaterThan(-1)
    // Header BEFORE the stack opens = outside it; the toaster after it closes.
    expect(header).toBeLessThan(stack)
    expect(destinations).toBeGreaterThan(stack)
    expect(stackEnd).toBeGreaterThan(destinations)
    expect(app).toContain('.environment(\\.pyreonRouter, router)')
  })

  it('a lone RouterView keeps the original shape', () => {
    const app = swiftBody(transform(LONE, { target: 'swift' }).code)
    expect(app).toContain('RouterProvider(router: router) {')
    expect(app).not.toContain('.environment(\\.pyreonRouter')
  })

  it.runIf(isSwiftcAvailable())('the sibling-bearing emit typechecks against the stubs', () => {
    for (const src of [SRC, NESTED, LONE]) {
      const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })
})

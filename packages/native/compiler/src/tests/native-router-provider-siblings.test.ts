// Siblings of `<RouterView />` inside a routes-bearing `<RouterProvider>` on
// Kotlin.
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

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin } from './first-party-plugins'
import { isKotlincAvailable } from '../validate'

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

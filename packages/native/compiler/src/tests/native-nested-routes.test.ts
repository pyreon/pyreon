// Phase 3 (nested routes) Slice 2 — the dispatch emit. Own test file (not
// canonical-primitives.test.ts) to avoid append-conflicts with in-flight
// router/emit PRs that also extend that file.
//
// A layout route (`{ path, component, children: [...] }`) compiles to:
//   - the layout component emitted with a content slot (Swift: a generic
//     `struct X<Content: View>` + `@ViewBuilder var content`; Kotlin: a
//     `content: @Composable () -> Unit` param), its `<RouterView />` → the
//     content slot;
//   - a FULL-PATH dispatch where each child renders `Layout { Child() }` and
//     the layout's own index path renders `Layout { <empty> }`.
// Flat (non-nested) route tables keep the original dispatch — verified here.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const NESTED = `
  export function AppLayout() { return <Stack><Text>Nav</Text><RouterView /></Stack> }
  export function Dashboard() { return <Text>Dash</Text> }
  export function Settings() { return <Text>Settings</Text> }
  export function App() {
    const router = createRouter({ routes: [
      { path: '/app', component: AppLayout, children: [
        { path: 'dashboard', component: Dashboard },
        { path: 'settings', component: Settings },
      ] },
    ] })
    return <RouterProvider router={router}><RouterView /></RouterProvider>
  }
`

describe('Phase 3 — nested-routes emit (Swift)', () => {
  const out = transform(NESTED, { target: 'swift' }).code

  it('layout component becomes a generic struct with a @ViewBuilder content slot', () => {
    expect(out).toContain('struct AppLayout<Content: View>: View {')
    expect(out).toContain('@ViewBuilder var content: () -> Content')
  })

  it("layout's <RouterView /> renders the content() child slot", () => {
    expect(out).toContain('content()')
  })

  it('child paths render the leaf wrapped in the layout', () => {
    expect(out).toContain('path == "/app/dashboard" {')
    expect(out).toContain('AppLayout { Dashboard() }')
    expect(out).toContain('path == "/app/settings" {')
    expect(out).toContain('AppLayout { Settings() }')
  })

  it("layout's own index path renders the layout with an empty slot", () => {
    expect(out).toContain('path == "/app" {')
    expect(out).toContain('AppLayout { EmptyView() }')
  })
})

describe('Phase 3 — nested-routes emit (Kotlin)', () => {
  const out = transform(NESTED, { target: 'kotlin' }).code

  it('layout @Composable gains a content lambda param + renders content()', () => {
    expect(out).toContain('fun AppLayout(content: @Composable () -> Unit) {')
    expect(out).toContain('content()')
  })

  it('child paths render the leaf wrapped in the layout lambda', () => {
    expect(out).toContain('currentPath == "/app/dashboard" -> AppLayout { Dashboard() }')
    expect(out).toContain('currentPath == "/app/settings" -> AppLayout { Settings() }')
  })

  it("layout's own index path renders the layout with an empty lambda", () => {
    expect(out).toContain('currentPath == "/app" -> AppLayout {}')
  })
})

describe('Phase 3 — 3-level nesting accumulates the wrap chain', () => {
  const SRC = `
    export function AppLayout() { return <Stack><RouterView /></Stack> }
    export function TeamLayout() { return <Stack><RouterView /></Stack> }
    export function Members() { return <Text>Members</Text> }
    export function App() {
      const router = createRouter({ routes: [
        { path: '/app', component: AppLayout, children: [
          { path: 'team', component: TeamLayout, children: [
            { path: 'members', component: Members },
          ] },
        ] },
      ] })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
    }
  `

  it('Swift: nests outermost-first', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('path == "/app/team/members" {')
    expect(out).toContain('AppLayout { TeamLayout { Members() } }')
    // /app/team index → AppLayout wraps TeamLayout-with-empty-slot.
    expect(out).toContain('AppLayout { TeamLayout { EmptyView() } }')
  })

  it('Kotlin: nests outermost-first', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('currentPath == "/app/team/members" -> AppLayout { TeamLayout { Members() } }')
    expect(out).toContain('currentPath == "/app/team" -> AppLayout { TeamLayout {} }')
  })
})

describe('Phase 3 — flat (non-nested) routes keep the original dispatch (zero regression)', () => {
  const FLAT = `
    export function Home() { return <Text>Home</Text> }
    export function About() { return <Text>About</Text> }
    export function App() {
      const router = createRouter({ routes: [
        { path: '/', component: Home },
        { path: '/about', component: About },
      ] })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
    }
  `

  it('Swift: no content slot, no wrap — plain Home()/About()', () => {
    const out = transform(FLAT, { target: 'swift' }).code
    expect(out).not.toContain('<Content: View>')
    expect(out).not.toContain('@ViewBuilder var content')
    expect(out).toContain('path == "/about" {')
    expect(out).toContain('About()')
    expect(out).not.toContain('About { ')
  })

  it('Kotlin: no content param — plain Home()/About()', () => {
    const out = transform(FLAT, { target: 'kotlin' }).code
    expect(out).not.toContain('content: @Composable () -> Unit')
    expect(out).toContain('currentPath == "/about" -> About()')
  })
})

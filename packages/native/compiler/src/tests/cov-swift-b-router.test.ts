// Branch-coverage matrices for the Swift router dispatch — `<RouterProvider>`,
// the flat and nested `.navigationDestination` builders, the guard wrap, and
// the wildcard fallback.
//
// Every one of these arms decides what a launch or a deep link RENDERS, so
// each spec pairs the shape that produces a branch with the shape that must
// produce the OTHER one: a wildcard present vs absent (a real component vs the
// "no route for" placeholder), a guard present vs absent, a redirect that
// resolves vs one that is skipped.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const sw = (src: string) => transform(src, { target: 'swift' })

describe('<RouterProvider> — the router-attr arms', () => {
  it('NO router attr falls through to the generic emit', () => {
    const { code } = sw(`
      export function App() {
        return <RouterProvider><RouterView /></RouterProvider>
      }
    `)
    expect(code).not.toContain('.navigationDestination(')
  })

  it('a NON-IDENTIFIER router expression skips the routes lookup', () => {
    // `routerAttr.value.kind === 'identifier'` is false, so `_routerRoutes`
    // is never consulted and no dispatch is built.
    const { code } = sw(`
      export function Home() { return <Text>H</Text> }
      export function App() {
        const cfg = { r: createRouter({ routes: [{ path: '/', component: Home }] }) }
        return <RouterProvider router={cfg.r}><RouterView /></RouterProvider>
      }
    `)
    expect(code).not.toContain('.navigationDestination(')
  })

  it('an identifier naming a router WITH routes builds the dispatch', () => {
    const { code } = sw(`
      export function Home() { return <Text>H</Text> }
      export function App() {
        const router = createRouter({ routes: [{ path: '/', component: Home }] })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
    `)
    expect(code).toContain('.navigationDestination(for: String.self)')
  })
})

describe('flat dispatch — literal, pattern, redirect and wildcard branches', () => {
  const TABLE = (routes: string, extra = '') => `
    export function Home() { return <Text>H</Text> }
    export function About() { return <Text>A</Text> }
    export function NotFound() { return <Text>404</Text> }
    ${extra}
    export function App() {
      const router = createRouter({ routes: [${routes}] })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
    }
  `

  it('the FIRST emitted branch is `if`, later ones `else if`', () => {
    const { code } = sw(
      TABLE(`{ path: '/', component: Home }, { path: '/about', component: About }`),
    )
    expect(code).toContain('if PyreonRouter.matchPath(path, "/") != nil {')
    expect(code).toContain('else if PyreonRouter.matchPath(path, "/about") != nil {')
  })

  it('NO wildcard → the "no route for" placeholder; a wildcard → its component', () => {
    const none = sw(TABLE(`{ path: '/', component: Home }`)).code
    expect(none).toContain('Pyreon Router: no route for')

    const wild = sw(
      TABLE(`{ path: '/', component: Home }, { path: '*', component: NotFound }`),
    ).code
    expect(wild).toContain('NotFound()')
    expect(wild).not.toContain('Pyreon Router: no route for')
  })

  it('a LITERAL→LITERAL redirect renders the target component directly', () => {
    const { code } = sw(
      TABLE(`{ path: '/old', redirect: '/about' }, { path: '/about', component: About }`),
    )
    expect(code).toContain('PyreonRouter.matchPath(path, "/old") != nil {')
    expect(code).toContain('About()')
  })

  it('a redirect whose SOURCE carries a param is SKIPPED (no branch at all)', () => {
    const { code } = sw(
      TABLE(`{ path: '/u/:id', redirect: '/about' }, { path: '/about', component: About }`),
    )
    expect(code).not.toContain('matchPath(path, "/u/:id")')
  })

  it('a DANGLING redirect (no such target) is skipped', () => {
    const { code } = sw(
      TABLE(`{ path: '/old', redirect: '/nowhere' }, { path: '/', component: Home }`),
    )
    expect(code).not.toContain('matchPath(path, "/old")')
  })

  it('a wildcard-ONLY table emits the fallback with no `if` branch', () => {
    const { code } = sw(TABLE(`{ path: '*', component: NotFound }`))
    expect(code).toContain('NotFound()')
    expect(code).not.toContain('matchPath(path, "*")')
  })
})

describe('param-bearing routes — the three invocation shapes', () => {
  it('a component with a TYPED params prop constructs the synthesized struct', () => {
    const { code } = sw(`
      export function User(props: { params: { id: string } }) { return <Text>{props.params.id}</Text> }
      export function App() {
        const router = createRouter({ routes: [{ path: '/u/:id', component: User }] })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
    `)
    expect(code).toContain('if let params = PyreonRouter.matchPath(path, "/u/:id") {')
    expect(code).toMatch(/User\(params: \w+\(id: params\["id"\] \?\? ""\)\)/)
  })

  it('a NUMBER param field coerces through Int(...) ?? 0; a BOOLEAN compares == "true"', () => {
    const { code } = sw(`
      export function P(props: { params: { n: number; b: boolean } }) { return <Text>x</Text> }
      export function App() {
        const router = createRouter({ routes: [{ path: '/p/:n/:b', component: P }] })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
    `)
    expect(code).toContain('Int(params["n"] ?? "") ?? 0')
    expect(code).toContain('(params["b"] ?? "") == "true"')
  })

  it('a component with NO params prop is invoked bare, and the branch skips the dict binding', () => {
    const { code } = sw(`
      export function User() { return <Text>u</Text> }
      export function App() {
        const router = createRouter({ routes: [{ path: '/u/:id', component: User }] })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
    `)
    expect(code).toContain('PyreonRouter.matchPath(path, "/u/:id") != nil {')
    expect(code).toContain('User()')
    expect(code).not.toContain('User(params:')
  })
})

describe('nested dispatch — layout chains, guards, wildcard deny-fallback', () => {
  const NESTED = (guard: string, wildcard: string) => `
    export function Layout() { return <Stack><RouterView /></Stack> }
    export function Dash() { return <Text>D</Text> }
    export function Deny() { return <Text>no</Text> }
    export function App() {
      const ok = signal<boolean>(true)
      const router = createRouter({ routes: [
        { path: '/app', component: Layout, children: [
          { path: 'dash', component: Dash${guard} },
        ] },
        ${wildcard}
      ] })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
    }
  `

  it('NO guard emits the render line bare; a guard wraps it in if/else', () => {
    const bare = sw(NESTED('', '')).code
    expect(bare).toContain('Layout { Dash() }')
    expect(bare).not.toMatch(/if ok \{/)

    const guarded = sw(NESTED(', beforeEnter: () => ok()', '')).code
    expect(guarded).toContain('Layout { Dash() }')
    expect(guarded).toMatch(/if ok \{/)
  })

  it('the guard DENY fallback is the wildcard component when one exists, else the text placeholder', () => {
    const noWild = sw(NESTED(', beforeEnter: () => ok()', '')).code
    expect(noWild).toContain('Pyreon Router: access denied to')

    const wild = sw(NESTED(', beforeEnter: () => ok()', `{ path: '*', component: Deny },`)).code
    expect(wild).toContain('Deny()')
    expect(wild).not.toContain('Pyreon Router: access denied to')
  })

  it('a param-bearing NESTED leaf is NOT flattened — the tree bails and only the layout index dispatches', () => {
    // `flattenRouteTree` deliberately bails on a nested param (the emit's own
    // comment: "flatten bails nested params"), so the leaf never reaches the
    // dispatch. Pinned so a later change to that rule is visible here.
    const { code } = sw(`
      export function Layout() { return <Stack><RouterView /></Stack> }
      export function Item(props: { params: { id: string } }) { return <Text>x</Text> }
      export function App() {
        const router = createRouter({ routes: [
          { path: '/app', component: Layout, children: [{ path: 'item/:id', component: Item }] },
        ] })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
    `)
    expect(code).not.toContain('/app/item/:id')
    expect(code).toContain('PyreonRouter.matchPath(path, "/app") != nil {')
  })
})

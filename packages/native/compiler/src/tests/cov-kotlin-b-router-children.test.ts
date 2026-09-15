// Kotlin emit — the nested-route dispatcher, provider tags, `{...spread}`
// expansion, and the non-view child fallbacks.
//
// The nested dispatcher is where a route table's SHAPE decides the emit:
// a layout wraps, a pattern route binds `params`, a `beforeEnter` becomes an
// `if/else` against the deny fallback, and a `*` route supplies both the deny
// fallback AND the `else` branch. Each of those is a separate arm, and the
// wrong one silently renders the wrong screen — there is no toolchain error to
// catch it, so the emit string IS the contract.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kotlin = (src: string) => transform(src, { target: 'kotlin' })
/** The `when { … }` dispatch block, one trimmed line per entry. */
const dispatch = (src: string) => {
  const ls = kotlin(src).code.split('\n')
  const start = ls.findIndex((l) => l.trim() === 'when {')
  const indent = ls[start]!.length - ls[start]!.trimStart().length
  const end = ls.findIndex((l, i) => i > start && l === `${' '.repeat(indent)}}`)
  return ls.slice(start, end + 1).map((l) => l.trim())
}

const ROUTES = `import { Stack, Text } from '@pyreon/primitives'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
export function Shell() { return <Stack><Text>Nav</Text><RouterView /></Stack> }
export function Item(props: { params: { id: string } }) { return <Text>{props.params.id}</Text> }
export function Admin() { return <Text>admin</Text> }
export function Missing() { return <Text>404</Text> }
export function App() {
  const isAdmin = true
  const router = createRouter({ routes: [
    { path: '/shell', component: Shell, children: [
      { path: 'admin', component: Admin, beforeEnter: () => isAdmin },
    ] },
    { path: '/item/:id', component: Item },
    { path: '/old/:id', redirect: '/item/:id' },
    { path: '*', component: Missing },
  ] })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`

describe('the nested route dispatcher on Kotlin', () => {
  it('a beforeEnter becomes an if/else whose deny branch is the WILDCARD route, not a hardcoded string', () => {
    expect(dispatch(ROUTES)).toContain(
      'PyreonRouter.matchPath(currentPath, "/shell/admin") != null -> if (isAdmin) Shell { Admin() } else Missing()',
    )
  })

  it('a PATTERN route binds params once and passes the typed param struct', () => {
    const d = dispatch(ROUTES)
    expect(d).toContain('PyreonRouter.matchPath(currentPath, "/item/:id") != null -> {')
    expect(d).toContain('val params = PyreonRouter.matchPath(currentPath, "/item/:id") ?: emptyMap()')
    expect(d).toContain('Item(params = ItemParam(id = params["id"] ?: ""))')
  })

  it('a wildcard route also supplies the `else` branch', () => {
    expect(dispatch(ROUTES)).toContain('else -> Missing()')
  })

  it('a redirect whose SOURCE or TARGET is a pattern is skipped — v1 aliases literal paths only', () => {
    // `/old/:id` → `/item/:id` cannot be rewritten at compile time (the param
    // has to be carried), so no branch is emitted for it at all.
    expect(dispatch(ROUTES).join('\n')).not.toContain('/old/:id')
  })

  it('a LAYOUT route whose own path is a pattern renders the layout with no params binding', () => {
    // `isLeafLayout` wins over the params invocation: a layout takes a content
    // lambda, not a params struct, so binding `params` here would be dead.
    const d = dispatch(ROUTES.replace(`path: '/shell'`, `path: '/shell/:tab'`))
    expect(d).toContain('PyreonRouter.matchPath(currentPath, "/shell/:tab") != null -> {')
    expect(d).toContain('Shell {}')
    expect(d.join('\n')).not.toContain('val params = PyreonRouter.matchPath(currentPath, "/shell/:tab")')
  })
})

describe('provider tags on Kotlin', () => {
  const PROV = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Link, PermissionsProvider, QueryClientProvider, RouterProvider } from '@pyreon/primitives'
export function App() {
  const dyn = signal({ read: true })
  return (<Stack>
    <Link to="/x" />
    <PermissionsProvider permissions={dyn()}><Text>a</Text></PermissionsProvider>
    <PermissionsProvider permissions={{ 'posts.*': true, 'posts.secret': false }}><Text>b</Text></PermissionsProvider>
    <PermissionsProvider permissions={{ 'p.*': true, 'p.a': false, 'p.b': false }}><Text>c</Text></PermissionsProvider>
    <QueryClientProvider client={dyn()} />
    <RouterProvider><Text>d</Text></RouterProvider>
    <RouterProvider router={dyn()} />
  </Stack>)
}`

  it('a childless <Link> still emits a tappable Box rather than an empty lambda body', () => {
    expect(kotlin(PROV).code).toContain('Box(modifier = Modifier.clickable { navigate() }) { }')
  })

  it('a NON-LITERAL permissions map is refused by name and falls through to generic emit', () => {
    expect(kotlin(PROV).warnings).toContain(
      '<PermissionsProvider permissions={…}>: the permissions map is not a literal object of boolean values, so the grants cannot be baked into the native emit — the provider injects NOTHING and every check below it denies. Use a literal map, or seed at the call site with usePermissions(["posts.*"]).',
    )
    expect(kotlin(PROV).code).toContain('PermissionsProvider(permissions = dyn) {')
  })

  it('a false-under-wildcard key is named — singular and plural read correctly', () => {
    const ws = kotlin(PROV).warnings.filter((w) => w.includes('set to false under a wildcard grant'))
    expect(ws.some((w) => w.includes('"posts.secret" is set to false'))).toBe(true)
    expect(ws.some((w) => w.includes('"p.a", "p.b" are set to false'))).toBe(true)
    // Only the GRANTED keys reach the container — the native one is grant-only.
    expect(kotlin(PROV).code).toContain('PyreonPermissions(setOf("posts.*"))')
  })

  it('a childless transparent provider emits nothing, and a RouterProvider without `router` falls through', () => {
    const code = kotlin(PROV).code
    // QueryClientProvider is transparent on native and has no children here,
    // so it contributes no composable at all.
    expect(code).not.toContain('QueryClientProvider')
    expect(code).toContain('RouterProvider {')
    expect(code).toContain('RouterProvider(dyn) { }')
  })
})

describe('`{...spread}` expansion into named args on Kotlin', () => {
  const SPREAD = `import { Stack, Text } from '@pyreon/primitives'
function Row(props: { label: string; n: number }) { return <Text>{props.label}</Text> }
function Other(props: { a: string }) { return <Text>{props.a}</Text> }
export function App() {
  const base = { label: 'x', n: 1 }
  return (<Stack>
    <Row {...base} />
    <Row {...{ label: 'lit', n: 2 }} />
    <Row {...base} n={9} />
    <Other {...[1, 2]} />
  </Stack>)
}`

  it('a known binding expands through the TARGET\'s prop list; an object literal expands its own fields', () => {
    const code = kotlin(SPREAD).code
    expect(code).toContain('Row(label = base.label, n = base.n)')
    expect(code).toContain('Row(label = "lit", n = 2)')
  })

  it('an EXPLICIT attribute wins over the spread rather than being emitted twice', () => {
    // A duplicate named argument is a Kotlin compile error, so the explicit
    // name has to suppress the spread's copy.
    expect(kotlin(SPREAD).code).toContain('Row(label = base.label, n = 9)')
  })

  it('a spread the emitter cannot expand is named, not silently dropped', () => {
    expect(kotlin(SPREAD).warnings).toContain(
      "<Other {...}> spread could not be expanded — the target's props are unknown (or the source isn't an object literal / known binding). Pass props explicitly.",
    )
    expect(kotlin(SPREAD).code).toContain('Other()')
  })
})

describe('non-view children on Kotlin', () => {
  const CHILDREN = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const rows = signal([{ id: 1 }])
  const n = signal(2)
  return (<Stack>
    <Button onPress={() => n.set(1)} />
    {\`total \${n()}\`}
    {rows().map((r) => <Text>{r.id}</Text>)}
    {rows().map((r) => <Text>{r.id}</Text>)}
  </Stack>)
}`

  it('a template child is spliced into the Text argument, not wrapped in a redundant interpolation', () => {
    expect(kotlin(CHILDREN).code).toContain('Text(text = "total ${n}")')
  })

  it('the stringified-JSX-child complaint is emitted ONCE even for two identical offenders', () => {
    const ws = kotlin(CHILDREN).warnings.filter((w) => w.startsWith('A JSX-producing expression used as a child'))
    expect(ws).toHaveLength(1)
  })

  it('a <Button> with no children still gets the empty label Compose requires', () => {
    expect(kotlin(CHILDREN).code).toContain('Text("")')
  })
})

describe('the rx lowering tolerates a missing argument rather than throwing', () => {
  it('an arity-short call emits an empty slot — the source is a TS type error, and PMTC is not a type checker', () => {
    // `reduce` and `filter` both REQUIRE the argument PMTC leaves blank here,
    // so this shape never reaches a real build; the arm exists so the emitter
    // reports through the normal path instead of throwing mid-emit.
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { reduce, filter } from '@pyreon/rx'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const xs = signal([1, 2, 3])
  const total = reduce(xs, (a: number, b: number) => a + b)
  const evens = filter(xs)
  return (<Stack><Text>{total()}</Text><Text>{evens().length}</Text></Stack>)
}`)
    expect(r.code).toContain('xs.fold(, { a, b -> a + b })')
    expect(r.code).toContain('xs.filter()')
  })
})

describe('route-table and spread shapes with no cover elsewhere', () => {
  it('a table with NO wildcard falls back to the diagnostic text, not to nothing', () => {
    // The `else` branch is what renders when the path matches no route; with
    // no `*` route there is no component to put there, so the emit has to say
    // WHICH path failed — the string is the only thing a device user sees.
    const d = dispatch(`import { Stack, Text } from '@pyreon/primitives'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
export function Shell() { return <Stack><Text>Nav</Text><RouterView /></Stack> }
export function Admin() { return <Text>admin</Text> }
export function App() {
  const router = createRouter({ routes: [
    { path: '/shell', component: Shell, children: [{ path: 'admin', component: Admin }] },
  ] })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`)
    expect(d).toContain('else -> Text(text = "Pyreon Router: no route for ${currentPath}")')
  })

  it('a route component reached through a NAMESPACE object still receives the raw params map', () => {
    // A member expression cannot be looked up in the per-component params
    // table, so the typed struct is not available — the untyped map is passed
    // rather than the route being silently dropped.
    const d = dispatch(`import { Stack, Text } from '@pyreon/primitives'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
export function Shell() { return <Stack><Text>Nav</Text><RouterView /></Stack> }
export function Item(props: { params: { id: string } }) { return <Text>{props.params.id}</Text> }
const pages = { Item }
export function App() {
  const router = createRouter({ routes: [
    { path: '/shell', component: Shell, children: [{ path: 'a', component: Shell }] },
    { path: '/item/:id', component: pages.Item },
  ] })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`)
    expect(d).toContain('pages.Item(params = params)')
  })

  it('a spread whose SOURCE itself carries a spread, and a spread on a non-user component, are both named', () => {
    const r = kotlin(`import { Stack, Text } from '@pyreon/primitives'
function Row(props: { label: string; n: number }) { return <Text>{props.label}</Text> }
export function App() {
  const base = { label: 'x', n: 1 }
  const extra = { n: 2 }
  return (<Stack>
    <Row {...{ ...extra, label: 'y' }} />
    <Text {...base} />
  </Stack>)
}`)
    // A nested spread means the emitter cannot enumerate the fields, so it
    // declines rather than emitting a partial argument list.
    expect(r.warnings).toContain(
      "<Row {...}> spread could not be expanded — the target's props are unknown (or the source isn't an object literal / known binding). Pass props explicitly.",
    )
    // A canonical primitive is not a user composable — there is no prop list
    // to expand INTO, so the whole spread is dropped and said so.
    expect(r.warnings.some((w) => w.startsWith('<Text {...}> spread is not lowered to native'))).toBe(true)
    expect(r.code).toContain('Row()')
  })
})

describe('router positive twins', () => {
  it('a redirect between two LITERAL paths becomes a compile-time alias', () => {
    // The pattern-bearing redirect above is skipped; this one is exactly the
    // shape v1 does support, so it must still emit its branch.
    const d = dispatch(`import { Stack, Text } from '@pyreon/primitives'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
export function Shell() { return <Stack><Text>Nav</Text><RouterView /></Stack> }
export function Home() { return <Text>home</Text> }
export function App() {
  const router = createRouter({ routes: [
    { path: '/shell', component: Shell, children: [{ path: 'a', component: Home }] },
    { path: '/home', component: Home },
    { path: '/old', redirect: '/home' },
  ] })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`)
    expect(d.join('\n')).toContain('"/home"')
  })

  it('a transparent provider WITH children still renders them', () => {
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, QueryClientProvider } from '@pyreon/primitives'
export function App() {
  const c = signal(1)
  return (<Stack><QueryClientProvider client={c()}><Text>inner</Text></QueryClientProvider></Stack>)
}`)
    expect(r.code).toContain('Text(text = "inner")')
    expect(r.code).not.toContain('QueryClientProvider(')
  })
})

describe('the FLAT route dispatcher (no nesting anywhere in the table)', () => {
  const FLAT = `import { Stack, Text } from '@pyreon/primitives'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
export function Home() { return <Text>home</Text> }
export function App() {
  const router = createRouter({ routes: [
    { path: '/home', component: Home },
    { path: '/old', redirect: '/home' },
    { path: '/gone/:id', redirect: '/home' },
  ] })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`

  it('a literal→literal redirect becomes an alias branch; a PATTERN source is skipped', () => {
    const d = dispatch(FLAT)
    expect(d).toContain('PyreonRouter.matchPath(currentPath, "/old") != null -> Home()')
    // `/gone/:id` carries a param the alias cannot rewrite at compile time, so
    // it emits no branch — the `else` handles it as a no-match.
    expect(d.join('\n')).not.toContain('/gone/:id')
    expect(d).toContain('else -> Text(text = "Pyreon Router: no route for ${currentPath}")')
  })
})

// Typed route params + view-child Text-wrap + signal-initial inference —
// the three emit contracts from the device-CI unblock arc (2026-06-10).
//
// All three were exposed by the FIRST real xcodebuild/gradle runs of the
// example apps (the stub validate loops use `swiftc -parse`, which is
// parse-only — none of these are parse errors except the single-field
// labeled tuple):
//
//   1. TYPED ROUTE PARAMS — `props: { params: { id: string } }` emitted
//      `let params: (id: String)` (a Swift PARSE error — single-element
//      labeled tuples are illegal) and BOTH dispatchers passed the raw
//      matchPath dict where the typed value was expected (a typecheck
//      error on each target). Fix: Swift synthesizes a named struct
//      (mirroring Kotlin's data-class synthesis) and both dispatchers
//      construct the typed value from the dict.
//
//   2. VIEW-CHILD TEXT-WRAP — `<Button>{cond ? 'a' : 'b'}</Button>` put
//      a bare String expression in the ViewBuilder (swiftc type error;
//      on Kotlin it COMPILES and silently renders nothing). Fix: value
//      expressions wrap in Text interpolation; JSX-producing ternary /
//      logical children stay raw.
//
//   3. SIGNAL-INITIAL INFERENCE — un-annotated `signal('')` emitted
//      `@State private var x: Any = ""` (Any breaks $x bindings,
//      .count, arithmetic). Fix: infer from the initial literal when NO
//      generic is written; explicit `signal<any>(...)` keeps `unknown`
//      (type-mapper contract, locked by type-mapper.test.ts).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function tx(source: string, target: 'swift' | 'kotlin'): string {
  return transform(source, { target }).code
}

// In-file route component WITH a typed params prop — the router-demo /
// tasks-showcase shape.
const TYPED_PARAMS_APP = `
  import { Stack, Text } from '@pyreon/primitives'
  import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
  function HomePage() {
    return <Stack><Text>Home</Text></Stack>
  }
  function UserPage(props: { params: { id: string } }) {
    return <Stack><Text>User {props.params.id}</Text></Stack>
  }
  export function App() {
    const router = createRouter({
      routes: [
        { path: '/', component: HomePage },
        { path: '/users/:id', component: UserPage },
      ],
    })
    return <RouterProvider router={router}><RouterView /></RouterProvider>
  }
`

describe('typed route params — Swift', () => {
  it('synthesizes a named struct for the anonymous params prop type', () => {
    const out = tx(TYPED_PARAMS_APP, 'swift')
    expect(out).toContain('struct UserPageParam: Codable {')
    expect(out).toContain('var id: String')
    expect(out).toContain('let params: UserPageParam')
    // The old emit was an ILLEGAL single-element labeled tuple.
    expect(out).not.toMatch(/let params: \(id: String\)/)
  })

  it('dispatcher constructs the typed struct from the matchPath dict', () => {
    const out = tx(TYPED_PARAMS_APP, 'swift')
    expect(out).toContain(
      'UserPage(params: UserPageParam(id: params["id"] ?? ""))',
    )
    // The old raw-dict pass must be gone.
    expect(out).not.toContain('UserPage(params: params)')
  })

  it('coerces number + boolean param fields from the string dict', () => {
    const out = tx(
      `
      import { Stack, Text } from '@pyreon/primitives'
      import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
      function ItemPage(props: { params: { count: number; active: boolean } }) {
        return <Stack><Text>Item</Text></Stack>
      }
      export function App() {
        const router = createRouter({
          routes: [{ path: '/items/:count/:active', component: ItemPage }],
        })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
      `,
      'swift',
    )
    expect(out).toContain('Int(params["count"] ?? "") ?? 0')
    expect(out).toContain('(params["active"] ?? "") == "true"')
  })

  it('component with NO params prop is called with no arguments (no dict binding)', () => {
    const out = tx(
      `
      import { Stack, Text } from '@pyreon/primitives'
      import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
      function AboutPage() {
        return <Stack><Text>About</Text></Stack>
      }
      export function App() {
        const router = createRouter({
          routes: [{ path: '/about/:section', component: AboutPage }],
        })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
      `,
      'swift',
    )
    // Passing `params:` to a struct without that property is a swiftc
    // error — the branch matches without binding the dict.
    expect(out).toContain('PyreonRouter.matchPath(path, "/about/:section") != nil {')
    expect(out).toContain('AboutPage()')
    expect(out).not.toContain('AboutPage(params:')
  })

  it('reuses a DECLARED struct when the params shape structurally matches', () => {
    const out = tx(
      `
      import { Stack, Text } from '@pyreon/primitives'
      import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
      type RouteParams = { id: string }
      function UserPage(props: { params: { id: string } }) {
        return <Stack><Text>User</Text></Stack>
      }
      export function App() {
        const router = createRouter({
          routes: [{ path: '/users/:id', component: UserPage }],
        })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
      `,
      'swift',
    )
    // Structural match wins — the prop type AND the dispatcher
    // construction agree on the user's own declared struct.
    expect(out).toContain('let params: RouteParams')
    expect(out).toContain('UserPage(params: RouteParams(id: params["id"] ?? ""))')
    expect(out).not.toContain('UserPageParam')
  })

  it('component NOT visible in-file keeps the legacy raw-dict pass (conservative)', () => {
    const out = tx(
      `
      import { Stack, Text } from '@pyreon/primitives'
      import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
      declare const ExternalPage: any
      export function App() {
        const router = createRouter({
          routes: [{ path: '/x/:id', component: ExternalPage }],
        })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
      `,
      'swift',
    )
    expect(out).toContain('ExternalPage(params: params)')
  })

  it('general prop synthesis: anonymous object-array prop becomes a named struct array', () => {
    const out = tx(
      `
      import { Stack, Text } from '@pyreon/primitives'
      import { For } from '@pyreon/core'
      function ItemList(props: { items: { id: number; label: string }[] }) {
        return (
          <Stack>
            <For each={props.items} by={(i) => i.id}>
              {(i) => <Text>{i.label}</Text>}
            </For>
          </Stack>
        )
      }
      export function App() {
        return <Stack><Text>app</Text></Stack>
      }
      `,
      'swift',
    )
    // ForEach(items, id: \\.id) requires a NOMINAL type — key paths
    // can't reference tuple elements, so the old tuple-array emit
    // failed typecheck on every keyed list.
    expect(out).toContain('struct ItemListItem: Codable {')
    expect(out).toContain('let items: [ItemListItem]')
    expect(out).not.toContain('[(id: Int, label: String)]')
  })
})

describe('typed route params — Kotlin (mirror)', () => {
  it('dispatcher constructs the synthesized data class from the matchPath map', () => {
    const out = tx(TYPED_PARAMS_APP, 'kotlin')
    expect(out).toContain('data class UserPageParam(val id: String)')
    expect(out).toContain('fun UserPage(params: UserPageParam)')
    expect(out).toContain(
      'UserPage(params = UserPageParam(id = params["id"] ?: ""))',
    )
    // The old raw-Map pass (a kotlinc type error) must be gone.
    expect(out).not.toContain('UserPage(params = params)')
  })

  it('coerces number + boolean param fields from the string map', () => {
    const out = tx(
      `
      import { Stack, Text } from '@pyreon/primitives'
      import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
      function ItemPage(props: { params: { count: number; active: boolean } }) {
        return <Stack><Text>Item</Text></Stack>
      }
      export function App() {
        const router = createRouter({
          routes: [{ path: '/items/:count/:active', component: ItemPage }],
        })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
      `,
      'kotlin',
    )
    expect(out).toContain('(params["count"] ?: "").toIntOrNull() ?: 0')
    expect(out).toContain('(params["active"] ?: "") == "true"')
  })

  it('component with NO params prop is called with no arguments and no map binding', () => {
    const out = tx(
      `
      import { Stack, Text } from '@pyreon/primitives'
      import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
      function AboutPage() {
        return <Stack><Text>About</Text></Stack>
      }
      export function App() {
        const router = createRouter({
          routes: [{ path: '/about/:section', component: AboutPage }],
        })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
      `,
      'kotlin',
    )
    expect(out).toContain('AboutPage()')
    expect(out).not.toContain('AboutPage(params')
    expect(out).not.toContain('val params =')
  })

  it('component NOT visible in-file keeps the legacy raw-map pass (conservative)', () => {
    const out = tx(
      `
      import { Stack, Text } from '@pyreon/primitives'
      import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
      declare const ExternalPage: any
      export function App() {
        const router = createRouter({
          routes: [{ path: '/x/:id', component: ExternalPage }],
        })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
      `,
      'kotlin',
    )
    expect(out).toContain('ExternalPage(params = params)')
  })
})

describe('view-child Text-wrap', () => {
  const TERNARY_BUTTON = `
    import { signal } from '@pyreon/reactivity'
    import { Stack, Button, Text } from '@pyreon/primitives'
    export function App() {
      const done = signal<boolean>(false)
      return (
        <Stack>
          <Button onPress={() => done.set(!done())}>
            {done() ? 'done' : 'todo'}
          </Button>
        </Stack>
      )
    }
  `

  it('Swift: value-ternary Button child wraps in Text interpolation', () => {
    const out = tx(TERNARY_BUTTON, 'swift')
    // Bare `done ? "done" : "todo"` in a ViewBuilder is a swiftc type
    // error (String does not conform to View).
    expect(out).toContain('Text("\\(done ? "done" : "todo")")')
  })

  it('Kotlin: value-ternary Button child wraps in Text interpolation', () => {
    const out = tx(TERNARY_BUTTON, 'kotlin')
    // WORSE than Swift here: a bare String expression statement in a
    // Composable lambda COMPILES and silently renders nothing.
    expect(out).toContain('Text(text = "${if (done) "done" else "todo"}")')
  })

  it('Swift: JSX-producing ternary child stays a raw view emit', () => {
    const out = tx(
      `
      import { signal } from '@pyreon/reactivity'
      import { Stack, Text } from '@pyreon/primitives'
      export function App() {
        const flag = signal<boolean>(false)
        return <Stack>{flag() ? <Text>A</Text> : <Text>B</Text>}</Stack>
      }
      `,
      'swift',
    )
    expect(out).toContain('flag ? Text("A") : Text("B")')
    expect(out).not.toContain('Text("\\(flag ? Text(')
  })

  it('Kotlin: JSX-producing ternary child stays a raw view emit', () => {
    const out = tx(
      `
      import { signal } from '@pyreon/reactivity'
      import { Stack, Text } from '@pyreon/primitives'
      export function App() {
        const flag = signal<boolean>(false)
        return <Stack>{flag() ? <Text>A</Text> : <Text>B</Text>}</Stack>
      }
      `,
      'kotlin',
    )
    expect(out).toContain('if (flag) Text(text = "A") else Text(text = "B")')
    expect(out).not.toContain('Text(text = "${if (flag) Text(')
  })
})

describe('signal-initial inference (no generic)', () => {
  it('Swift: signal(literal) infers String / Int / Bool instead of Any', () => {
    const out = tx(
      `
      import { signal } from '@pyreon/reactivity'
      import { Stack, Text } from '@pyreon/primitives'
      export function App() {
        const name = signal('')
        const count = signal(0)
        const ready = signal(false)
        return <Stack><Text>{name()}</Text></Stack>
      }
      `,
      'swift',
    )
    expect(out).toContain('@State private var name: String = ""')
    expect(out).toContain('@State private var count: Int = 0')
    expect(out).toContain('@State private var ready: Bool = false')
    expect(out).not.toContain(': Any =')
  })

  it('Swift: un-annotated useStorage infers from the default value', () => {
    const out = tx(
      `
      import { useStorage } from '@pyreon/storage'
      import { Stack, Text } from '@pyreon/primitives'
      export function App() {
        const theme = useStorage('app:theme', 'light')
        return <Stack><Text>{theme()}</Text></Stack>
      }
      `,
      'swift',
    )
    // @AppStorage requires a concrete native type — Any can't compile.
    expect(out).toMatch(/@(?:PyreonAppStorage|AppStorage)\("app:theme"\)[^\n]*: String/)
  })
})

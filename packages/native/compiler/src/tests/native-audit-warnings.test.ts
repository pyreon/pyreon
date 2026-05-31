// Round-3 audit follow-up — diagnostic warnings for four
// silently-broken PMTC source shapes the deep audit caught:
//
//   1. `function Comp(props) { … }` — untyped props parameter; member
//      rewrites for `props.X` silently fail because the parser has no
//      annotation to enumerate fields from.
//   2. `<For>{(i) => { const x = signal(0); … }}` — hooks declared
//      inside For/Show render callbacks are silently dropped (the arrow
//      body parser only extracts the first expression/return statement).
//   3. `const { copy, copied } = useClipboard()` — destructure form
//      not supported; produces zero decl and orphans every downstream
//      reference.
//   4. `beforeEnter: () => { /* block body */ }` — only expression-body
//      arrows are extracted; block-body guards silently emit unguarded
//      routes.
//
// All four are diagnostic-only (`result.warnings`). Emit shapes
// UNCHANGED. Same pattern as the required-prop / silent-drop warnings
// (#1094 / #1099) — fail loud at parse time instead of letting the
// shape silently break on the device.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Round-3 audit — diagnostic warnings for silently-broken shapes', () => {
  describe('untyped `props` parameter', () => {
    it('warns naming the component + the parameter when `function Comp(props) {…}` has no annotation', () => {
      const result = transform(
        `export function Greeting(props) { return <Text>{props.title}</Text> }`,
        { target: 'swift' },
      )
      expect(
        result.warnings.some(
          (w) =>
            w.includes('Greeting') &&
            w.includes('props') &&
            w.includes('untyped'),
        ),
      ).toBe(true)
    })

    it('does NOT warn when props IS type-annotated (baseline)', () => {
      const result = transform(
        `export function Greeting(props: { title: string }) { return <Text>{props.title}</Text> }`,
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('untyped')),
      ).toBe(false)
    })

    it('does NOT warn for a component with no parameters at all (baseline)', () => {
      const result = transform(
        `export function Header() { return <Text>Hello</Text> }`,
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('untyped')),
      ).toBe(false)
    })

    it('fires on Kotlin target too (target-independent, parser-level)', () => {
      const result = transform(
        `export function Greeting(props) { return <Text>{props.title}</Text> }`,
        { target: 'kotlin' },
      )
      expect(
        result.warnings.some(
          (w) => w.includes('Greeting') && w.includes('untyped'),
        ),
      ).toBe(true)
    })
  })

  describe('hooks declared inside <For>/<Show> render callbacks', () => {
    it('warns when `signal()` is declared inside a <For> render arrow block', () => {
      const result = transform(
        `
        export function App() {
          const items = signal<string[]>(['a', 'b'])
          return (
            <For each={items()}>{(i) => {
              const x = signal(0)
              return <Text>{i}</Text>
            }}</For>
          )
        }
        `,
        { target: 'swift' },
      )
      expect(
        result.warnings.some(
          (w) =>
            w.includes('<For>') &&
            w.includes('signal') &&
            w.includes('render callback'),
        ),
      ).toBe(true)
    })

    it('warns when `computed()` is declared inside a <Show> render arrow block', () => {
      const result = transform(
        `
        export function App() {
          const visible = signal(true)
          return (
            <Show when={visible}>{() => {
              const x = computed(() => 1)
              return <Text>Hi</Text>
            }}</Show>
          )
        }
        `,
        { target: 'swift' },
      )
      expect(
        result.warnings.some(
          (w) =>
            w.includes('<Show>') &&
            w.includes('computed') &&
            w.includes('render callback'),
        ),
      ).toBe(true)
    })

    it('warns for `useStorage` inside a For arrow block', () => {
      const result = transform(
        `
        export function App() {
          const items = signal<string[]>(['a'])
          return (
            <For each={items()}>{(i) => {
              const cached = useStorage<string>('k', '')
              return <Text>{i}</Text>
            }}</For>
          )
        }
        `,
        { target: 'swift' },
      )
      expect(
        result.warnings.some(
          (w) => w.includes('<For>') && w.includes('useStorage'),
        ),
      ).toBe(true)
    })

    it('does NOT warn when the For arrow body has NO hook declarations (baseline)', () => {
      const result = transform(
        `
        export function App() {
          const items = signal<string[]>(['a', 'b'])
          return (
            <For each={items()}>{(i) => <Text>{i}</Text>}</For>
          )
        }
        `,
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('render callback')),
      ).toBe(false)
    })

    it('does NOT warn when the hook is declared at component-body scope (the correct shape — baseline)', () => {
      const result = transform(
        `
        export function App() {
          const items = signal<string[]>(['a', 'b'])
          const counter = signal(0)
          return (
            <For each={items()}>{(i) => <Text>{i}</Text>}</For>
          )
        }
        `,
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('render callback')),
      ).toBe(false)
    })
  })

  describe('useClipboard() destructure form', () => {
    it('warns naming the destructure shape + suggesting the single-binding fix', () => {
      const result = transform(
        `
        export function App() {
          const { copy, copied } = useClipboard()
          return <Text>{copied()}</Text>
        }
        `,
        { target: 'swift' },
      )
      expect(
        result.warnings.some(
          (w) =>
            w.includes('useClipboard') &&
            w.includes('destructure') &&
            w.includes('single-binding'),
        ),
      ).toBe(true)
    })

    it('does NOT warn for the supported single-binding shape (baseline)', () => {
      const result = transform(
        `
        export function App() {
          const cb = useClipboard()
          return <Text>{cb.copied()}</Text>
        }
        `,
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('useClipboard')),
      ).toBe(false)
    })

    it('fires on Kotlin target too (target-independent)', () => {
      const result = transform(
        `
        export function App() {
          const { copy, copied } = useClipboard()
          return <Text>{copied()}</Text>
        }
        `,
        { target: 'kotlin' },
      )
      expect(
        result.warnings.some(
          (w) => w.includes('useClipboard') && w.includes('destructure'),
        ),
      ).toBe(true)
    })
  })

  describe('per-route `beforeEnter` with block-body arrow', () => {
    // Routes are extracted from `createRouter({ routes: [...] })`,
    // matching the parser's actual entry point (Phase C5). The JSX
    // shape `<Router routes={[...]}/>` is not the recognised config
    // form on native.
    const ROUTER_HARNESS = (routes: string) => `
      declare const HomePage: any
      declare const AdminPage: any
      export function App() {
        const isAuthed = signal(false)
        const router = createRouter({
          routes: ${routes},
        })
        return <RouterView />
      }
    `

    it('warns when `beforeEnter: () => { … }` is a block-body arrow on a route', () => {
      const result = transform(
        ROUTER_HARNESS(`[
          { path: '/', component: HomePage },
          { path: '/admin', component: AdminPage, beforeEnter: () => { return isAuthed() } },
        ]`),
        { target: 'swift' },
      )
      expect(
        result.warnings.some(
          (w) =>
            w.includes('beforeEnter') &&
            w.includes('block-body') &&
            w.includes('UNGUARDED'),
        ),
      ).toBe(true)
    })

    it('names the route path in the warning when path is captured first', () => {
      const result = transform(
        ROUTER_HARNESS(`[
          { path: '/', component: HomePage },
          { path: '/admin', component: AdminPage, beforeEnter: () => { return isAuthed() } },
        ]`),
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('"/admin"')),
      ).toBe(true)
    })

    it('does NOT warn when `beforeEnter` is an expression-body arrow (the supported shape — baseline)', () => {
      const result = transform(
        ROUTER_HARNESS(`[
          { path: '/', component: HomePage },
          { path: '/admin', component: AdminPage, beforeEnter: () => isAuthed() },
        ]`),
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('beforeEnter')),
      ).toBe(false)
    })

    it('does NOT warn for routes with NO beforeEnter (baseline)', () => {
      const result = transform(
        ROUTER_HARNESS(`[
          { path: '/', component: HomePage },
        ]`),
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('beforeEnter')),
      ).toBe(false)
    })

    it('fires on Kotlin target too (target-independent)', () => {
      const result = transform(
        ROUTER_HARNESS(`[
          { path: '/', component: HomePage },
          { path: '/admin', component: AdminPage, beforeEnter: () => { return isAuthed() } },
        ]`),
        { target: 'kotlin' },
      )
      expect(
        result.warnings.some(
          (w) => w.includes('beforeEnter') && w.includes('block-body'),
        ),
      ).toBe(true)
    })
  })

  describe('emit shape is UNCHANGED — warnings are diagnostic-only', () => {
    it('untyped-props component still emits (no parser bail)', () => {
      const result = transform(
        `export function Greeting(props) { return <Text>Hi</Text> }`,
        { target: 'swift' },
      )
      // The emit still produces something (greeting view); the warning
      // is purely additive on result.warnings.
      expect(result.code.length).toBeGreaterThan(0)
    })

    it('useClipboard destructure still emits (no parser bail)', () => {
      const result = transform(
        `
        export function App() {
          const { copy, copied } = useClipboard()
          return <Text>Hi</Text>
        }
        `,
        { target: 'swift' },
      )
      expect(result.code.length).toBeGreaterThan(0)
    })

    it('beforeEnter block-body still emits the route (unguarded — same pre-fix shape)', () => {
      const result = transform(
        `
        declare const HomePage: any
        declare const AdminPage: any
        export function App() {
          const isAuthed = signal(false)
          const router = createRouter({
            routes: [
              { path: '/', component: HomePage },
              { path: '/admin', component: AdminPage, beforeEnter: () => { return isAuthed() } },
            ],
          })
          return <RouterProvider router={router}><RouterView /></RouterProvider>
        }
        `,
        { target: 'swift' },
      )
      // Route still emits — just without the guard, exactly the pre-fix
      // unguarded shape. The warning surfaces the silent omission.
      expect(result.code).toContain('AdminPage')
    })
  })
})

import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import coreManifest from '../manifest'

describe('gen-docs — core snapshot', () => {
  it('renders @pyreon/core to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(coreManifest)).toMatchInlineSnapshot(`"- @pyreon/core — VNode, h(), Fragment, lifecycle, context, JSX runtime, Suspense, ErrorBoundary, lazy(), Dynamic, cx(), splitProps, mergeProps, createUniqueId. Pyreon components are plain functions that execute a single time. Reactivity comes from reading signals inside reactive scopes (JSX expression thunks, \`effect()\`, \`computed()\`), not from re-running the component function. \`if (!cond()) return null\` at the top level runs once and is static — use \`return (() => { if (!cond()) return null; return <div /> })\` for reactive conditional rendering."`)
  })

  it('renders @pyreon/core to its expected llms-full.txt section — full body snapshot', () => {
    expect(renderLlmsFullSection(coreManifest)).toMatchInlineSnapshot(`
      "## @pyreon/core — Complete API

      Component model and lifecycle for Pyreon. Provides the VNode type system, \`h()\` hyperscript function, JSX automatic runtime (\`@pyreon/core/jsx-runtime\`), lifecycle hooks (\`onMount\`, \`onUnmount\`), two-tier context system (\`createContext\` for static values, \`createReactiveContext\` for signal-backed values), control-flow components (\`Show\`, \`Switch\`/\`Match\`, \`For\`, \`Suspense\`, \`ErrorBoundary\`), code-splitting via \`lazy()\`, dynamic rendering via \`Dynamic\`, and props utilities (\`splitProps\`, \`mergeProps\`, \`cx\`, \`createUniqueId\`). Components are plain functions (\`ComponentFn<P> = (props: P) => VNodeChild\`) that run ONCE — reactivity comes from reading signals inside reactive scopes, not from re-running the component.

      \`\`\`typescript
      import { h, Fragment, onMount, onUnmount, provide, createContext, createReactiveContext, useContext, Show, Switch, Match, For, Suspense, ErrorBoundary, lazy, Dynamic, cx, splitProps, mergeProps, createUniqueId } from "@pyreon/core"
      import { signal, computed } from "@pyreon/reactivity"

      // Context — static (destructure-safe) vs reactive (must call to read)
      const ThemeCtx = createContext<"light" | "dark">("light")
      const ModeCtx = createReactiveContext<"light" | "dark">("light")

      const App = (props: { children: any }) => {
        const mode = signal<"light" | "dark">("dark")
        provide(ThemeCtx, "dark")                    // static — safe to destructure
        provide(ModeCtx, () => mode())               // reactive — consumer must call

        return <>{props.children}</>
      }

      // Lifecycle
      const Timer = () => {
        const count = signal(0)
        onMount(() => {
          const id = setInterval(() => count.update(n => n + 1), 1000)
          return () => clearInterval(id)  // cleanup runs on unmount
        })
        return <div>{count()}</div>
      }

      // Control flow — reactive conditional rendering
      const Page = (props: { items: { id: number; name: string }[]; loggedIn: () => boolean }) => (
        <div>
          <Show when={props.loggedIn()} fallback={<p>Please log in</p>}>
            <For each={props.items} by={item => item.id}>
              {item => <li>{item.name}</li>}
            </For>
          </Show>
        </div>
      )

      // Props utilities — preserve reactivity
      const Button = (props: { class?: string; size?: string; onClick: () => void; children: any }) => {
        const [local, rest] = splitProps(props, ["class", "size"])
        const merged = mergeProps({ size: "md" }, local)
        const id = createUniqueId()
        return <button id={id} {...rest} class={cx(["btn", \`btn-\${merged.size}\`, local.class])} />
      }

      // Code splitting
      const HeavyPage = lazy(() => import("./HeavyPage"))
      const LazyApp = () => (
        <Suspense fallback={<div>Loading...</div>}>
          <HeavyPage />
        </Suspense>
      )

      // Async data boundary — pending / error / empty / data from any AsyncLike source
      import type { AsyncLike, Directive } from "@pyreon/core"
      declare const todos: AsyncLike<{ id: number; title: string }[]>
      const TodoList = () => (
        <Async of={todos} empty="No todos yet." error={(e) => <p>{String(e)}</p>}>
          {(rows) => <ul>{rows.map(r => <li>{r.title}</li>)}</ul>}
        </Async>
      )

      // Directive composer — compose element behaviours into one ref
      const clickOutside = (cb: () => void): Directive => (el) => {
        const h2 = (e: Event) => { if (!el.contains(e.target as Node)) cb() }
        document.addEventListener("mousedown", h2)
        return () => document.removeEventListener("mousedown", h2)
      }
      const Popover = (props: { close: () => void }) => (
        <div ref={use(clickOutside(props.close))} />
      )

      // elementRef — one value that is both the ref AND the () => T | null accessor
      const Card = () => {
        const cardEl = elementRef<HTMLDivElement>()
        onMount(() => cardEl()?.focus())
        return <div ref={cardEl} tabIndex={0} />
      }
      \`\`\`

      > **Components run once**: Pyreon components are plain functions that execute a single time. Reactivity comes from reading signals inside reactive scopes (JSX expression thunks, \`effect()\`, \`computed()\`), not from re-running the component function. \`if (!cond()) return null\` at the top level runs once and is static — use \`return (() => { if (!cond()) return null; return <div /> })\` for reactive conditional rendering.
      >
      > **Destructuring props kills reactivity**: \`const { name } = props\` captures the value at setup time — it becomes static. Use \`props.name\` inside reactive scopes, or \`splitProps(props, ["name"])\` for rest patterns. The compiler handles \`const x = props.y; return <div>{x}</div>\` by inlining \`props.y\` back at the use site, but only for \`const\` (not \`let\`/\`var\`).
      >
      > **Two context types**: \`createContext<T>\` returns \`T\` from \`useContext()\` — safe to destructure. \`createReactiveContext<T>\` returns \`() => T\` — must call to read. Using the wrong one is a common source of stale-value bugs (static context for dynamic values) or unnecessary ceremony (reactive context for constants).
      >
      > **For uses by, not key**: The \`<For>\` component uses the \`by\` prop for its key function because JSX extracts \`key\` as a special VNode reconciliation prop. Writing \`<For each={items()} key={fn}>\` silently passes the key to the VNode system instead of the list reconciler.
      >
      > **JSX uses standard HTML attributes**: Use \`class\` not \`className\`, \`for\` not \`htmlFor\`, \`onInput\` not \`onChange\` for per-keystroke updates. Pyreon maps to native DOM events, not the React synthetic event system.
      "
    `)
  })

  it('renders @pyreon/core to MCP api-reference entries — one per api[] item', () => {
    const record = renderApiReferenceEntries(coreManifest)
    expect(Object.keys(record).length).toBe(35)
    expect(Object.keys(record)).toContain('core/h')
    expect(Object.keys(record)).toContain('core/removeUndefinedProps')
    // Async + use — the data-boundary component and the directive composer.
    expect(Object.keys(record)).toContain('core/Async')
    expect(Object.keys(record)).toContain('core/use')
    // elementRef — one value that is both a ref and the () => T | null
    // accessor element-consuming hooks take.
    expect(Object.keys(record)).toContain('core/elementRef')
    // Compat-mode native marker — added so framework JSX components opt out
    // of `@pyreon/{react,preact,vue,solid}-compat` wrapping.
    expect(Object.keys(record)).toContain('core/nativeCompat')
    expect(Object.keys(record)).toContain('core/isNativeCompat')
    expect(Object.keys(record)).toContain('core/NATIVE_COMPAT_MARKER')
    // Spot-check the flagship API — h() is the hyperscript function
    const h = record['core/h']!
    expect(h.notes).toContain('JSX')
    expect(h.mistakes?.split('\n').length).toBeGreaterThan(2)
  })
})

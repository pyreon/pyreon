import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import runtimeDomManifest from '../manifest'

describe('gen-docs — runtime-dom snapshot', () => {
  it('renders @pyreon/runtime-dom to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(runtimeDomManifest)).toMatchInlineSnapshot(`"- @pyreon/runtime-dom — DOM renderer, mount, hydrateRoot, Transition, TransitionGroup, KeepAlive, SVG/MathML namespace, custom elements. SVG and MathML elements ALWAYS use \`setAttribute()\` for prop forwarding, never property assignment. Many SVG properties (\`markerWidth\`, \`refX\`, etc.) are read-only \`SVGAnimatedLength\` getters — \`el[key] = value\` crashes. Detected by \`el.namespaceURI !== "http://www.w3.org/1999/xhtml"\`."`)
  })

  it('renders @pyreon/runtime-dom to its expected llms-full.txt section — full body snapshot', () => {
    expect(renderLlmsFullSection(runtimeDomManifest)).toMatchInlineSnapshot(`
      "## @pyreon/runtime-dom — DOM Renderer

      Surgical signal-to-DOM renderer with zero virtual DOM overhead. The compiler emits \`_tpl()\` (cloneNode-based template instantiation) + \`_bind()\` (per-node reactive bindings) calls that mount directly to the DOM without VNode diffing. Reactive text uses \`TextNode.data\` assignment (not \`.textContent\`) for minimal DOM mutation. Supports SVG/MathML namespace auto-detection (67 tags), custom elements (props as properties), CSS transitions via \`<Transition>\` / \`<TransitionGroup>\`, and component caching via \`<KeepAlive>\`. Dev-mode warnings use \`import.meta.env.DEV\` (not \`typeof process\`) so they tree-shake to zero bytes in production Vite builds.

      \`\`\`typescript
      import { mount, hydrateRoot, Transition, TransitionGroup, KeepAlive } from "@pyreon/runtime-dom"
      import { signal } from "@pyreon/reactivity"
      import { Show, For } from "@pyreon/core"

      // Mount — clears container, returns unmount function
      const unmount = mount(<App />, document.getElementById("app")!)

      // Hydrate SSR-rendered HTML (preserves existing DOM)
      hydrateRoot(<App />, document.getElementById("app")!)

      // Transition — CSS-based enter/leave animations
      const visible = signal(true)
      const FadeExample = () => (
        <Transition name="fade" mode="out-in">
          <Show when={visible()}>
            <div>Content</div>
          </Show>
        </Transition>
      )
      // CSS: .fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
      //      .fade-enter-from, .fade-leave-to { opacity: 0 }

      // TransitionGroup — animate list items entering/leaving
      const items = signal([1, 2, 3])
      const ListExample = () => (
        <TransitionGroup name="list">
          <For each={items()} by={i => i}>
            {item => <div>{item}</div>}
          </For>
        </TransitionGroup>
      )

      // KeepAlive — cache component state across mount/unmount cycles
      const tab = signal<"a" | "b">("a")
      const TabExample = () => (
        <KeepAlive>
          <Show when={tab() === "a"}><ExpensiveA /></Show>
          <Show when={tab() === "b"}><ExpensiveB /></Show>
        </KeepAlive>
      )
      \`\`\`

      > **SVG/MathML uses setAttribute only**: SVG and MathML elements ALWAYS use \`setAttribute()\` for prop forwarding, never property assignment. Many SVG properties (\`markerWidth\`, \`refX\`, etc.) are read-only \`SVGAnimatedLength\` getters — \`el[key] = value\` crashes. Detected by \`el.namespaceURI !== "http://www.w3.org/1999/xhtml"\`.
      >
      > **Custom elements use property assignment**: Elements with a hyphen in their tag name (custom elements) get props set as JS properties, not HTML attributes. This matches the web components spec — attributes are strings, properties can be any type.
      >
      > **Transition 5s safety timeout**: If \`transitionend\` or \`animationend\` never fires (missing CSS, display:none, zero-duration), the transition completes automatically after 5 seconds to prevent stuck UI.
      >
      > **Dev warnings use import.meta.env.DEV**: All dev-mode warnings (\`mount()\` null container, duplicate keys, raw signal children) use \`import.meta.env.DEV\` — NOT \`typeof process\`. Vite/Rolldown literal-replaces it at build time; production bundles contain zero warning bytes. Tests run in vitest which sets DEV=true automatically.
      >
      > **Event delegation**: \`setupDelegation(container)\` is called by \`mount()\` — common events are delegated to the container root for performance. Direct event binding (non-delegated) is used for events that do not bubble (focus, blur, scroll, etc.).
      "
    `)
  })

  it('renders @pyreon/runtime-dom to MCP api-reference entries — one per api[] item', () => {
    const record = renderApiReferenceEntries(runtimeDomManifest)
    expect(Object.keys(record).length).toBe(9)
    expect(Object.keys(record)).toContain('runtime-dom/mount')
    // Spot-check the flagship API — mount is the primary entry point
    const mount = record['runtime-dom/mount']!
    expect(mount.notes).toContain('container')
    expect(mount.mistakes?.split('\n').length).toBeGreaterThan(2)
  })
})

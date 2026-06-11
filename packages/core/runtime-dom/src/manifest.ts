import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/runtime-dom',
  title: 'DOM Renderer',
  tagline:
    'DOM renderer, mount, hydrateRoot, Transition, TransitionGroup, KeepAlive, SVG/MathML namespace, custom elements',
  description:
    'Surgical signal-to-DOM renderer with zero virtual DOM overhead. The compiler emits `_tpl()` (cloneNode-based template instantiation) + `_bind()` (per-node reactive bindings) calls that mount directly to the DOM without VNode diffing. Reactive text uses `TextNode.data` assignment (not `.textContent`) for minimal DOM mutation. Supports SVG/MathML namespace auto-detection (67 tags), custom elements (props as properties), CSS transitions via `<Transition>` / `<TransitionGroup>`, and component caching via `<KeepAlive>`. Dev-mode warnings use the bundler-agnostic bare `process.env.NODE_ENV` production gate (auto-replaced by every modern bundler) so they tree-shake to zero bytes in production Vite builds.',
  category: 'browser',
  longExample: `import { mount, hydrateRoot, Transition, TransitionGroup, KeepAlive } from "@pyreon/runtime-dom"
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
)`,
  features: [
    'mount() — mount VNode tree into container, returns unmount function',
    'hydrateRoot() — hydrate SSR-rendered HTML, preserving existing DOM',
    'Transition — CSS-based enter/leave animations with mode support',
    'TransitionGroup — animate list item additions and removals',
    'KeepAlive — cache and restore component state across mount/unmount cycles',
    '_tpl() + _bind() — compiler-driven template instantiation with zero VNode overhead',
    'SVG/MathML — 67 tags auto-detected, correct namespace URI, setAttribute-only',
    'Custom elements — props set as properties on hyphenated tag names',
    'Event delegation — synthetic event system for performance',
    'Dev-mode warnings — container validation, output validation, duplicate keys',
  ],
  api: [
    {
      name: 'mount',
      kind: 'function',
      signature: 'mount(root: VNodeChild, container: Element): () => void',
      summary:
        'Mount a VNode tree into a container element. Clears the container first, sets up event delegation, then mounts the given child. Returns an `unmount` function that removes everything and disposes all effects. In dev mode, throws if `container` is null/undefined with an actionable error message.',
      example: `import { mount } from "@pyreon/runtime-dom"

const dispose = mount(<App />, document.getElementById("app")!)

// To unmount:
dispose()`,
      mistakes: [
        '`createRoot(container).render(<App />)` — Pyreon uses a single function call: `mount(<App />, container)`',
        '`mount(<App />, document.getElementById("app"))` without `!` — getElementById returns `Element | null`. The runtime throws in dev if null, but TypeScript needs the assertion',
        '`mount(<App />, document.body)` — mounting directly to body is discouraged; use a dedicated container element',
        'Forgetting to call the returned unmount function — leaks event listeners and effects. Store and call it on cleanup',
      ],
      seeAlso: ['hydrateRoot', 'render'],
    },
    {
      name: 'render',
      kind: 'function',
      signature: 'render(root: VNodeChild, container: Element): () => void',
      summary:
        'Alias for `mount`. Provided for API familiarity — both names point to the same function.',
      example: `import { render } from "@pyreon/runtime-dom"
render(<App />, document.getElementById("app")!)`,
      seeAlso: ['mount'],
    },
    {
      name: 'hydrateRoot',
      kind: 'function',
      signature: 'hydrateRoot(root: VNodeChild, container: Element): () => void',
      summary:
        'Hydrate server-rendered HTML. Walks the existing DOM and attaches reactive bindings without recreating elements. Expects the DOM to match the VNode tree structure — mismatches emit dev-mode warnings. Returns an unmount function.',
      example: `import { hydrateRoot } from "@pyreon/runtime-dom"

// Hydrate SSR-rendered HTML:
hydrateRoot(<App />, document.getElementById("app")!)`,
      seeAlso: ['mount', '@pyreon/runtime-server'],
    },
    {
      name: 'Transition',
      kind: 'component',
      signature: '<Transition name={name} mode={mode} onEnter={fn} onLeave={fn}>{children}</Transition>',
      summary:
        'CSS-based enter/leave animation wrapper. Applies `{name}-enter-from`, `{name}-enter-active`, `{name}-enter-to` classes on enter and the corresponding `-leave-*` classes on leave. `mode` controls sequencing: `"out-in"` waits for leave to complete before entering, `"in-out"` enters first. Has a 5-second safety timeout — if `transitionend`/`animationend` never fires, the transition completes automatically.',
      example: `<Transition name="fade" mode="out-in">
  <Show when={visible()}>
    <div>Content</div>
  </Show>
</Transition>

/* CSS:
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
*/`,
      mistakes: [
        'Missing CSS classes — `<Transition name="fade">` does nothing without `.fade-enter-active` / `.fade-leave-active` CSS',
        'Wrapping multiple root elements — Transition expects a single child (or null). Multiple children cause undefined behavior',
        'Using `mode="in-out"` when you want sequential — `"out-in"` is almost always what you want (old leaves, then new enters)',
      ],
      seeAlso: ['TransitionGroup', '@pyreon/kinetic'],
    },
    {
      name: 'TransitionGroup',
      kind: 'component',
      signature: '<TransitionGroup name={name} tag={tag}>{children}</TransitionGroup>',
      summary:
        'Animate list item additions and removals with CSS transitions. Each item gets enter/leave classes on mount/unmount. The `tag` prop controls the wrapper element (defaults to a fragment). Works with `<For>` for reactive lists. Also applies `-move` classes for FLIP-animated reordering.',
      example: `<TransitionGroup name="list" tag="ul">
  <For each={items()} by={i => i.id}>
    {item => <li>{item.name}</li>}
  </For>
</TransitionGroup>

/* CSS:
.list-enter-active, .list-leave-active { transition: all 0.3s }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(10px) }
.list-move { transition: transform 0.3s }
*/`,
      seeAlso: ['Transition', 'For'],
    },
    {
      name: 'KeepAlive',
      kind: 'component',
      signature: '<KeepAlive include={pattern} exclude={pattern} max={number}>{children}</KeepAlive>',
      summary:
        'Cache component instances across mount/unmount cycles so their state (signals, scroll position, form inputs) is preserved when they are toggled out and back in. `include`/`exclude` filter by component name. `max` limits cache size (LRU eviction). Useful for tab panels and multi-step forms.',
      example: `const tab = signal<"a" | "b">("a")

<KeepAlive>
  <Show when={tab() === "a"}><ExpensiveFormA /></Show>
  <Show when={tab() === "b"}><ExpensiveFormB /></Show>
</KeepAlive>`,
      seeAlso: ['Transition', 'Show'],
    },
    {
      name: '_tpl',
      kind: 'function',
      signature: '_tpl(html: string, bind: (root: Element) => (() => void) | undefined): NativeItem',
      summary:
        'Compiler-internal: instantiate a cached template and run its bindings. The html string is parsed into a `<template>` ONCE per distinct string (module-level cache); every call `cloneNode(true)`s the content and invokes `bind(root)` — which wires reactive bindings and returns the cleanup. Returns a `NativeItem` (`{ __isNative, el, cleanup }`) that `mountChild`/`hydrateRoot` consume directly. Sole-dynamic-text children arrive with a BAKED `" "` placeholder text node in the html (grabbed via `.firstChild` — no createTextNode/appendChild per instantiation). Not intended for direct use — the JSX compiler emits `_tpl()` calls automatically.',
      example: `// Compiler output for <div class="box">{text()}</div>:
_tpl("<div class=\\"box\\"> </div>", (__root) => {
  const __t0 = __root.firstChild
  const __d0 = _bindText(text, __t0)
  return () => { __d0() }
})`,
      seeAlso: ['_bindText', '_bindDirect'],
    },
    {
      name: '_bindText',
      kind: 'function',
      signature: '_bindText(source: Signal-like, node: Text, caller?: () => unknown): () => void',
      summary:
        'Compiler-internal: bind a SIGNAL (anything carrying `._v` + `.direct`) to a text node via `TextNode.data` assignment, returning a dispose function. The fast path BYPASSES the effect system entirely — it subscribes via the signal\'s `.direct()` single-subscriber slot (no Set, no deps array, no tracking-stack push); `renderEffect` is only the fallback for bare callables. Writes the initial value synchronously at bind time (which is why the baked `" "` template placeholder never renders). Each text node gets its own independent binding for fine-grained reactivity.',
      example: `// Compiler output for <div>{count()}</div>:
_tpl("<div> </div>", (__root) => {
  const __t0 = __root.firstChild
  const __d0 = _bindText(count, __t0) // the SIGNAL, not a thunk
  return () => { __d0() }
})`,
      seeAlso: ['_tpl', '_bindDirect'],
    },
    {
      name: 'sanitizeHtml',
      kind: 'function',
      signature: 'sanitizeHtml(html: string): string',
      summary:
        'Sanitize an HTML string using the registered sanitizer (set via `setSanitizer()`). Falls back to the identity function if no sanitizer is registered. Used by the runtime when setting `innerHTML` on elements.',
      example: `import { setSanitizer, sanitizeHtml } from "@pyreon/runtime-dom"
setSanitizer(DOMPurify.sanitize)
const clean = sanitizeHtml(userInput)`,
      seeAlso: ['setSanitizer'],
    },
    {
      name: '__PYREON_DEVTOOLS__',
      kind: 'constant',
      signature:
        'window.__PYREON_DEVTOOLS__: { version; getComponentTree(); getAllComponents(); highlight(id); onComponentMount(cb); onComponentUnmount(cb); enableOverlay(); disableOverlay(); reactive: PyreonReactiveDevtools }',
      summary:
        'Browser devtools hook, installed automatically on the first `mount()` (no-op on the server). Exposes the component tree + an element-picker overlay (also `Ctrl+Shift+P`) for the `@pyreon/devtools` Chrome extension, plus a `$p` console helper. The `reactive` namespace bridges `@pyreon/reactivity`’s opt-in graph: `reactive.activate()` / `deactivate()` start/stop tracking, `reactive.getGraph()` returns the live signal/computed/effect nodes + dependency edges, `reactive.getFires()` the bounded fire timeline — powering the extension’s Signals / Graph / Effects / Profiler / Console tabs. **Dev-only and tree-shaken from production builds**; `reactive` is zero-cost until `activate()` is called by an attached panel.',
      example: `// In the browser console (after the app has mounted):
$p.tree()                              // root component entries
window.__PYREON_DEVTOOLS__.reactive.activate()
window.__PYREON_DEVTOOLS__.reactive.getGraph()  // { nodes, edges }`,
      mistakes: [
        'Reading it before the first `mount()` — it is installed by mount; it is `undefined` until then (and always `undefined` on the server / in production builds)',
        'Expecting `reactive.getGraph()` to return data without calling `reactive.activate()` first — tracking is opt-in (zero-cost until a panel attaches)',
        'Depending on it in app code — it is a dev-tooling hook, tree-shaken in production; never branch runtime behavior on its presence',
      ],
      seeAlso: ['mount'],
    },
  ],
  gotchas: [
    {
      label: 'SVG/MathML uses setAttribute only',
      note: 'SVG and MathML elements ALWAYS use `setAttribute()` for prop forwarding, never property assignment. Many SVG properties (`markerWidth`, `refX`, etc.) are read-only `SVGAnimatedLength` getters — `el[key] = value` crashes. Detected by `el.namespaceURI !== "http://www.w3.org/1999/xhtml"`.',
    },
    {
      label: 'Custom elements use property assignment',
      note: 'Elements with a hyphen in their tag name (custom elements) get props set as JS properties, not HTML attributes. This matches the web components spec — attributes are strings, properties can be any type.',
    },
    {
      label: 'Transition 5s safety timeout',
      note: 'If `transitionend` or `animationend` never fires (missing CSS, display:none, zero-duration), the transition completes automatically after 5 seconds to prevent stuck UI.',
    },
    {
      label: 'Dev warnings use import.meta.env.DEV',
      note: 'All dev-mode warnings (`mount()` null container, duplicate keys, raw signal children) use `import.meta.env.DEV` — NOT `typeof process`. Vite/Rolldown literal-replaces it at build time; production bundles contain zero warning bytes. Tests run in vitest which sets DEV=true automatically.',
    },
    {
      label: 'Event delegation',
      note: '`setupDelegation(container)` is called by `mount()` — common events are delegated to the container root for performance. Direct event binding (non-delegated) is used for events that do not bubble (focus, blur, scroll, etc.).',
    },
  ],
})

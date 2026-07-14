---
title: "DOM Renderer — API Reference"
description: "DOM renderer, mount, hydrateRoot, Transition, TransitionGroup, KeepAlive, SVG/MathML namespace, custom elements"
---

# @pyreon/runtime-dom — API Reference

> **Generated** from `runtime-dom`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [runtime-dom](/docs/runtime-dom).

Surgical signal-to-DOM renderer with zero virtual DOM overhead. The compiler emits `_tpl()` (cloneNode-based template instantiation) + `_bind()` (per-node reactive bindings) calls that mount directly to the DOM without VNode diffing. Reactive text uses `TextNode.data` assignment (not `.textContent`) for minimal DOM mutation. Supports SVG/MathML namespace auto-detection (67 tags), custom elements (props as properties), CSS transitions via `<Transition>` / `<TransitionGroup>`, and component caching via `<KeepAlive>`. Dev-mode warnings use the bundler-agnostic bare `process.env.NODE_ENV` production gate (auto-replaced by every modern bundler) so they tree-shake to zero bytes in production Vite builds.

## Features

- mount() — mount VNode tree into container, returns unmount function
- hydrateRoot() — hydrate SSR-rendered HTML, preserving existing DOM
- Transition — CSS-based enter/leave animations driven by a `show` accessor
- TransitionGroup — animate list item additions and removals
- KeepAlive — cache and restore component state across mount/unmount cycles
- _tpl() + _bind() — compiler-driven template instantiation with zero VNode overhead
- SVG/MathML — 67 tags auto-detected, correct namespace URI, setAttribute-only
- Custom elements — props set as properties on hyphenated tag names
- Event delegation — synthetic event system for performance
- Dev-mode warnings — container validation, output validation, duplicate keys, text-binding coercion ("[object Object]" / function-source), reactive-prop-call setup diagnosis

## Complete example

A full, end-to-end usage of the package:

```tsx
import { mount, hydrateRoot, Transition, TransitionGroup, KeepAlive } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"
import { Show } from "@pyreon/core"

// Mount — clears container, returns unmount function
const unmount = mount(<App />, document.getElementById("app")!)

// Hydrate SSR-rendered HTML (preserves existing DOM) — container FIRST
hydrateRoot(document.getElementById("app")!, <App />)

// Transition — CSS-based enter/leave, visibility driven by the required show accessor
const visible = signal(true)
const FadeExample = () => (
  <Transition name="fade" show={() => visible()}>
    <div>Content</div>
  </Transition>
)
// CSS: .fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
//      .fade-enter-from, .fade-leave-to { opacity: 0 }

// TransitionGroup — drives the list itself via items / keyFn / render (not <For> children)
const items = signal([1, 2, 3])
const ListExample = () => (
  <TransitionGroup
    name="list"
    items={() => items()}
    keyFn={(i) => i}
    render={(i) => <div>{i}</div>}
  />
)

// KeepAlive — cache component state across mount/unmount cycles
const tab = signal<"a" | "b">("a")
const TabExample = () => (
  <KeepAlive>
    <Show when={tab() === "a"}><ExpensiveA /></Show>
    <Show when={tab() === "b"}><ExpensiveB /></Show>
  </KeepAlive>
)
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`mount`](#mount) | function | Mount a VNode tree into a container element. |
| [`render`](#render) | function | Alias for `mount`. |
| [`hydrateRoot`](#hydrateroot) | function | Hydrate server-rendered HTML. |
| [`Transition`](#transition) | component | CSS-based enter/leave animation wrapper. |
| [`TransitionGroup`](#transitiongroup) | component | Animate list item additions and removals with CSS transitions. |
| [`KeepAlive`](#keepalive) | component | Mount children ONCE and keep them alive when hidden — when `active()` returns false the children are CSS-hidden (`displa |
| [`_tpl`](#tpl) | function | Compiler-internal: instantiate a cached template and run its bindings. |
| [`_bindText`](#bindtext) | function | Compiler-internal: bind a SIGNAL (anything carrying `._v` + `.direct`) to a text node via `TextNode.data` assignment, re |
| [`sanitizeHtml`](#sanitizehtml) | function | Sanitize an HTML string for `innerHTML`. |
| [`__PYREON_DEVTOOLS__`](#pyreon-devtools) | constant | Browser devtools hook, installed automatically on the first `mount()` (no-op on the server). |

## API

### mount `function`

```ts
mount(root: VNodeChild, container: Element): () => void
```

Mount a VNode tree into a container element. Clears the container first, sets up event delegation, then mounts the given child. Returns an `unmount` function that removes everything and disposes all effects. In dev mode, throws if `container` is null/undefined with an actionable error message.

**Example**

```tsx
import { mount } from "@pyreon/runtime-dom"

const dispose = mount(<App />, document.getElementById("app")!)

// To unmount:
dispose()
```

**Common mistakes**

- `createRoot(container).render(<App />)` — Pyreon uses a single function call: `mount(<App />, container)`
- `mount(<App />, document.getElementById("app"))` without `!` — getElementById returns `Element | null`. The runtime throws in dev if null, but TypeScript needs the assertion
- `mount(<App />, document.body)` — mounting directly to body is discouraged; use a dedicated container element
- Forgetting to call the returned unmount function — leaks event listeners and effects. Store and call it on cleanup

**See also:** `hydrateRoot` · `render`

---

### render `function`

```ts
render(root: VNodeChild, container: Element): () => void
```

Alias for `mount`. Provided for API familiarity — both names point to the same function.

**Example**

```tsx
import { render } from "@pyreon/runtime-dom"
render(<App />, document.getElementById("app")!)
```

**Common mistakes**

- `render` is an EXACT alias for `mount` (same function reference) — its foot-guns are `mount`'s (null container throws; props are reactive-vs-static per the compiler; call the returned function to unmount + dispose effects). Do NOT expect any `render`-specific behavior

**See also:** `mount`

---

### hydrateRoot `function`

```ts
hydrateRoot(container: Element, root: VNodeChild): () => void
```

Hydrate server-rendered HTML. Walks the existing DOM and attaches reactive bindings without recreating elements. Expects the DOM to match the VNode tree structure — mismatches emit dev-mode warnings. Returns an unmount function. NOTE the argument order is `(container, root)` — the CONTAINER comes first, which is the REVERSE of `mount(root, container)`.

**Example**

```tsx
import { hydrateRoot } from "@pyreon/runtime-dom"

// Hydrate SSR-rendered HTML — container FIRST, then the app:
hydrateRoot(document.getElementById("app")!, <App />)
```

**Common mistakes**

- Passing arguments in `mount` order — `hydrateRoot(container, root)` takes the container FIRST (opposite of `mount(root, container)`)

**See also:** `mount` · `@pyreon/runtime-server`

---

### Transition `component`

```ts
<Transition name={name} show={() => boolean} appear={boolean} onAfterEnter={fn} onAfterLeave={fn}>{children}</Transition>
```

CSS-based enter/leave animation wrapper. Visibility is driven by the REQUIRED `show: () => boolean` accessor — the child animates in when it flips true and out when it flips false (do NOT wrap the child in a `<Show>`; `show` is the toggle). Applies `{name}-enter-from`/`-enter-active`/`-enter-to` classes on enter and the corresponding `-leave-*` classes on leave. `appear` runs the enter transition on initial mount. Has a 5-second safety timeout — if `transitionend`/`animationend` never fires, the transition completes automatically. `onAfterEnter`/`onAfterLeave` fire when each phase settles.

**Example**

```tsx
const visible = signal(true)

<Transition name="fade" show={() => visible()}>
  <div>Content</div>
</Transition>

/* CSS:
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
*/
```

**Common mistakes**

- Omitting `show` — it is REQUIRED (`() => boolean`); Transition drives visibility itself, so a plain child with no `show` will not animate
- Wrapping the child in a `<Show>` — `show` already toggles visibility; a nested `<Show>` double-gates it
- Missing CSS classes — `<Transition name="fade">` does nothing without `.fade-enter-active` / `.fade-leave-active` CSS
- Passing a `mode` prop — Transition has no `mode`; for sequenced list moves use TransitionGroup

**See also:** `TransitionGroup` · `@pyreon/kinetic`

---

### TransitionGroup `component`

```ts
<TransitionGroup items={() => T[]} keyFn={(item, i) => key} render={(item, i) => VNode} name={name} tag={tag} />
```

Animate list item additions and removals with CSS transitions. Unlike `<Transition>`, it does NOT take `<For>` children — it drives the list itself via three required props: `items` (a reactive accessor), `keyFn` (a stable key extractor), and `render` (returns ONE DOM-element VNode per item, whose `type` must be a string tag like `"li"` so a ref can be injected). Each item gets enter/leave classes on mount/unmount; `-move` classes FLIP-animate reordering. `tag` sets the wrapper element (default `"div"`).

**Example**

```tsx
const items = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }])

<TransitionGroup
  name="list"
  tag="ul"
  items={() => items()}
  keyFn={(item) => item.id}
  render={(item) => <li>{item.name}</li>}
/>

/* CSS:
.list-enter-active, .list-leave-active { transition: all 0.3s }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(10px) }
.list-move { transition: transform 0.3s }
*/
```

**Common mistakes**

- Passing a `<For>` as children — TransitionGroup owns iteration via `items`/`keyFn`/`render`, it is not a `<For>` wrapper
- A `render` that returns a component or fragment — it must return a single DOM-element VNode (string `type`) so the group can inject a ref

**See also:** `Transition` · `For`

---

### KeepAlive `component`

```ts
<KeepAlive active={() => boolean}>{children}</KeepAlive>
```

Mount children ONCE and keep them alive when hidden — when `active()` returns false the children are CSS-hidden (`display: none`) but stay mounted, so their signals, effects, scroll position, and form inputs are PRESERVED. This is the opposite of conditional rendering (`<Show>`/ternary), which destroys and recreates component state on every toggle. `active` defaults to `true` (always visible). Use one KeepAlive per slot you want cached (e.g. one per route or tab).

**Example**

```tsx
// One KeepAlive per route — each keeps its own subtree mounted + hidden.
<KeepAlive active={() => route() === "/a"}><RouteA /></KeepAlive>
<KeepAlive active={() => route() === "/b"}><RouteB /></KeepAlive>
```

**Common mistakes**

- `active` is an ACCESSOR — write `active={() => cond()}`, not `active={cond}`; a bare non-signal expression is captured once and never re-hides (the compiler auto-calls a KNOWN signal, but an arbitrary expression needs the thunk)
- KeepAlive CSS-HIDES when inactive, it does NOT unmount — the hidden component's effects, timers, subscriptions, and signals keep RUNNING (memory + side-effect cost); use it ONLY for expensive-to-recreate state, not as a default wrapper
- It is the OPPOSITE of `<Show>`/ternary — those DESTROY + recreate state on toggle; reach for KeepAlive precisely when you need state PRESERVED across hide/show (form drafts, scroll, heavy trees)
- Each KeepAlive slot keeps its OWN children mounted — wrapping N routes in N KeepAlives keeps ALL N subtrees mounted + their effects live simultaneously, not just the active one
- There is NO `include`/`exclude`/`max`/name-based cache or LRU eviction (that is Vue's KeepAlive) — visibility is driven solely by the `active` accessor

**See also:** `Transition` · `Show`

---

### _tpl `function`

```ts
_tpl(html: string, bind: (root: Element) => (() => void) | undefined): NativeItem
```

Compiler-internal: instantiate a cached template and run its bindings. The html string is parsed into a `<template>` ONCE per distinct string (module-level cache); every call `cloneNode(true)`s the content and invokes `bind(root)` — which wires reactive bindings and returns the cleanup. Returns a `NativeItem` (`{ __isNative, el, cleanup }`) that `mountChild`/`hydrateRoot` consume directly. Sole-dynamic-text children arrive with a BAKED `" "` placeholder text node in the html (grabbed via `.firstChild` — no createTextNode/appendChild per instantiation). Not intended for direct use — the JSX compiler emits `_tpl()` calls automatically.

**Example**

```tsx
// Compiler output for <div class="box">{text()}</div>:
_tpl("<div class=\"box\"> </div>", (__root) => {
  const __t0 = __root.firstChild as Text
  const __d0 = _bindText(text, __t0)
  return () => { __d0() }
})
```

**Common mistakes**

- COMPILER-EMITTED — never hand-write `_tpl()`; the html string + the bind walks (`.firstChild`/`.nextSibling` captures) are generated to match the JSX exactly, and a hand-written mismatch corrupts the ref walks
- The html is parsed + cached per DISTINCT string (module-level) then `cloneNode(true)`d — a dynamically-built html string defeats the cache (a `<template>` parse per unique string)
- Bindings run against the CLONE after ALL node references are captured (the two-phase ref-hoist) — this is what keeps a dynamic slot before static siblings from corrupting their walks; the capture-before-mutate ordering is load-bearing, not cosmetic

**See also:** `_bindText` · `_bindDirect`

---

### _bindText `function`

```ts
_bindText(source: Signal-like, node: Text, caller?: () => unknown): () => void
```

Compiler-internal: bind a SIGNAL (anything carrying `._v` + `.direct`) to a text node via `TextNode.data` assignment, returning a dispose function. The fast path BYPASSES the effect system entirely — it subscribes via the signal's `.direct()` single-subscriber slot (no Set, no deps array, no tracking-stack push); `renderEffect` is only the fallback for bare callables. Writes the initial value synchronously at bind time (which is why the baked `" "` template placeholder never renders). Each text node gets its own independent binding for fine-grained reactivity.

**Example**

```tsx
// Compiler output for <div>{count()}</div>:
_tpl("<div> </div>", (__root) => {
  const __t0 = __root.firstChild as Text
  const __d0 = _bindText(count, __t0) // the SIGNAL, not a thunk
  return () => { __d0() }
})
```

**Common mistakes**

- COMPILER-EMITTED — don't hand-write `_bindText`; write JSX `{signal()}` and let the compiler emit it (it emits only for a bare signal IDENTIFIER)
- The `source` MUST expose `._v` (read DIRECTLY for the initial value, not via a call) — a custom signal-wrapper that forwards `.direct`/`.peek` but NOT `_v` binds `''` and never updates (the `storage-signal-v-forwarding` bug class); build wrappers with `wrapSignal(base, { set })`, which forwards `_v` by construction
- It cannot bind a detached method (`obj.method` loses `this`) — the compiler emits it only for a simple signal identifier
- A signal whose VALUE later becomes a VNode / VNode[] UPGRADES the binding to a subtree mount at the text node's position (the polymorphic upgrade); plain string/number values stay on the `.data` fast path

**See also:** `_tpl` · `_bindDirect`

---

### sanitizeHtml `function`

```ts
sanitizeHtml(html: string): string
```

Sanitize an HTML string for `innerHTML`. If a custom sanitizer was registered via `setSanitizer()` (e.g. DOMPurify) it is used; OTHERWISE a built-in tag-allowlist fallback runs (the browser Sanitizer API on Chrome 105+, else a DOMParser-based allowlist that strips unsafe elements + attributes) — it is NOT an identity passthrough. DOM-only: the runtime calls it when applying `dangerouslySetInnerHTML` / `innerHTML`, never during SSR.

**Example**

```tsx
import { setSanitizer, sanitizeHtml } from "@pyreon/runtime-dom"
setSanitizer(DOMPurify.sanitize)
const clean = sanitizeHtml(userInput)
```

**Common mistakes**

- WITHOUT `setSanitizer` it is NOT a passthrough — a built-in tag-allowlist sanitizer strips unsafe elements/attributes; but that allowlist is CONSERVATIVE, so legitimate-but-uncommon markup may be stripped — register a policy via `setSanitizer(DOMPurify.sanitize)` if you need specific tags
- `setSanitizer(fn)` is GLOBAL and replaces the built-in fallback for EVERY `innerHTML`/`dangerouslySetInnerHTML` in the app — a weaker custom sanitizer reduces safety everywhere
- It is DOM-only (uses the Sanitizer API / DOMParser) — never call it during SSR; the runtime only invokes it on the client innerHTML path
- `setSanitizer(null)` RESTORES the built-in allowlist fallback — it does NOT disable sanitization

**See also:** `setSanitizer`

---

### __PYREON_DEVTOOLS__ `constant`

```ts
window.__PYREON_DEVTOOLS__: { version; getComponentTree(); getAllComponents(); highlight(id); onComponentMount(cb); onComponentUnmount(cb); enableOverlay(); disableOverlay(); reactive: PyreonReactiveDevtools }
```

Browser devtools hook, installed automatically on the first `mount()` (no-op on the server). Exposes the component tree + an element-picker overlay (also `Ctrl+Shift+P`) for the `@pyreon/devtools` Chrome extension, plus a `$p` console helper. The `reactive` namespace bridges `@pyreon/reactivity`’s opt-in graph: `reactive.activate()` / `deactivate()` start/stop tracking, `reactive.getGraph()` returns the live signal/computed/effect nodes + dependency edges, `reactive.getFires()` the bounded fire timeline — powering the extension’s Signals / Graph / Effects / Profiler / Console tabs. **Dev-only and tree-shaken from production builds**; `reactive` is zero-cost until `activate()` is called by an attached panel.

**Example**

```tsx
// In the browser console (after the app has mounted):
$p.tree()                              // root component entries
window.__PYREON_DEVTOOLS__.reactive.activate()
window.__PYREON_DEVTOOLS__.reactive.getGraph()  // { nodes, edges }
```

**Common mistakes**

- Reading it before the first `mount()` — it is installed by mount; it is `undefined` until then (and always `undefined` on the server / in production builds)
- Expecting `reactive.getGraph()` to return data without calling `reactive.activate()` first — tracking is opt-in (zero-cost until a panel attaches)
- Depending on it in app code — it is a dev-tooling hook, tree-shaken in production; never branch runtime behavior on its presence

**See also:** `mount`

---

## Package-level notes

> **SVG/MathML uses setAttribute only:** SVG and MathML elements ALWAYS use `setAttribute()` for prop forwarding, never property assignment. Many SVG properties (`markerWidth`, `refX`, etc.) are read-only `SVGAnimatedLength` getters — `el[key] = value` crashes. Detected by `el.namespaceURI !== "http://www.w3.org/1999/xhtml"`.

> **Custom elements use property assignment:** Elements with a hyphen in their tag name (custom elements) get props set as JS properties, not HTML attributes. This matches the web components spec — attributes are strings, properties can be any type.

> **Transition 5s safety timeout:** If `transitionend` or `animationend` never fires (missing CSS, display&#58;none, zero-duration), the transition completes automatically after 5 seconds to prevent stuck UI.

> **Dev warnings use bare process.env.NODE_ENV:** All dev-mode diagnostics — the `mount()` null-container error, invalid component-output warning, duplicate `<For>` keys, the text-binding coercion warnings (a VNode or raw function String()-coerced by `_bindText` → the "[object Object]" / function-source silent-render shapes), and the setup-throw diagnosis for a compiler-wrapped reactive prop called as a function — are gated on the bundler-agnostic bare `process.env.NODE_ENV !== "production"` (NOT `typeof process`, NOT `import.meta.env.DEV`). Every modern bundler literal-replaces it at consumer build time; production bundles contain zero warning bytes.

> **Event delegation:** `setupDelegation(container)` is called by `mount()` — common events are delegated to the container root for performance. Direct event binding (non-delegated) is used for events that do not bubble (focus, blur, scroll, etc.).

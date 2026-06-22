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
- Transition — CSS-based enter/leave animations with mode support
- TransitionGroup — animate list item additions and removals
- KeepAlive — cache and restore component state across mount/unmount cycles
- _tpl() + _bind() — compiler-driven template instantiation with zero VNode overhead
- SVG/MathML — 67 tags auto-detected, correct namespace URI, setAttribute-only
- Custom elements — props set as properties on hyphenated tag names
- Event delegation — synthetic event system for performance
- Dev-mode warnings — container validation, output validation, duplicate keys

## Complete example

A full, end-to-end usage of the package:

```tsx
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
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`mount`](#mount) | function | Mount a VNode tree into a container element. |
| [`render`](#render) | function | Alias for `mount`. |
| [`hydrateRoot`](#hydrateroot) | function | Hydrate server-rendered HTML. |
| [`Transition`](#transition) | component | CSS-based enter/leave animation wrapper. |
| [`TransitionGroup`](#transitiongroup) | component | Animate list item additions and removals with CSS transitions. |
| [`KeepAlive`](#keepalive) | component | Cache component instances across mount/unmount cycles so their state (signals, scroll position, form inputs) is preserve |
| [`_tpl`](#tpl) | function | Compiler-internal: instantiate a cached template and run its bindings. |
| [`_bindText`](#bindtext) | function | Compiler-internal: bind a SIGNAL (anything carrying `._v` + `.direct`) to a text node via `TextNode.data` assignment, re |
| [`sanitizeHtml`](#sanitizehtml) | function | Sanitize an HTML string using the registered sanitizer (set via `setSanitizer()`). |
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

**See also:** `mount`

---

### hydrateRoot `function`

```ts
hydrateRoot(root: VNodeChild, container: Element): () => void
```

Hydrate server-rendered HTML. Walks the existing DOM and attaches reactive bindings without recreating elements. Expects the DOM to match the VNode tree structure — mismatches emit dev-mode warnings. Returns an unmount function.

**Example**

```tsx
import { hydrateRoot } from "@pyreon/runtime-dom"

// Hydrate SSR-rendered HTML:
hydrateRoot(<App />, document.getElementById("app")!)
```

**See also:** `mount` · `@pyreon/runtime-server`

---

### Transition `component`

```ts
<Transition name={name} mode={mode} onEnter={fn} onLeave={fn}>{children}</Transition>
```

CSS-based enter/leave animation wrapper. Applies `{name}-enter-from`, `{name}-enter-active`, `{name}-enter-to` classes on enter and the corresponding `-leave-*` classes on leave. `mode` controls sequencing: `"out-in"` waits for leave to complete before entering, `"in-out"` enters first. Has a 5-second safety timeout — if `transitionend`/`animationend` never fires, the transition completes automatically.

**Example**

```tsx
<Transition name="fade" mode="out-in">
  <Show when={visible()}>
    <div>Content</div>
  </Show>
</Transition>

/* CSS:
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
*/
```

**Common mistakes**

- Missing CSS classes — `<Transition name="fade">` does nothing without `.fade-enter-active` / `.fade-leave-active` CSS
- Wrapping multiple root elements — Transition expects a single child (or null). Multiple children cause undefined behavior
- Using `mode="in-out"` when you want sequential — `"out-in"` is almost always what you want (old leaves, then new enters)

**See also:** `TransitionGroup` · `@pyreon/kinetic`

---

### TransitionGroup `component`

```ts
<TransitionGroup name={name} tag={tag}>{children}</TransitionGroup>
```

Animate list item additions and removals with CSS transitions. Each item gets enter/leave classes on mount/unmount. The `tag` prop controls the wrapper element (defaults to a fragment). Works with `<For>` for reactive lists. Also applies `-move` classes for FLIP-animated reordering.

**Example**

```tsx
<TransitionGroup name="list" tag="ul">
  <For each={items()} by={i => i.id}>
    {item => <li>{item.name}</li>}
  </For>
</TransitionGroup>

/* CSS:
.list-enter-active, .list-leave-active { transition: all 0.3s }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(10px) }
.list-move { transition: transform 0.3s }
*/
```

**See also:** `Transition` · `For`

---

### KeepAlive `component`

```ts
<KeepAlive include={pattern} exclude={pattern} max={number}>{children}</KeepAlive>
```

Cache component instances across mount/unmount cycles so their state (signals, scroll position, form inputs) is preserved when they are toggled out and back in. `include`/`exclude` filter by component name. `max` limits cache size (LRU eviction). Useful for tab panels and multi-step forms.

**Example**

```tsx
const tab = signal<"a" | "b">("a")

<KeepAlive>
  <Show when={tab() === "a"}><ExpensiveFormA /></Show>
  <Show when={tab() === "b"}><ExpensiveFormB /></Show>
</KeepAlive>
```

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
  const __t0 = __root.firstChild
  const __d0 = _bindText(text, __t0)
  return () => { __d0() }
})
```

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
  const __t0 = __root.firstChild
  const __d0 = _bindText(count, __t0) // the SIGNAL, not a thunk
  return () => { __d0() }
})
```

**See also:** `_tpl` · `_bindDirect`

---

### sanitizeHtml `function`

```ts
sanitizeHtml(html: string): string
```

Sanitize an HTML string using the registered sanitizer (set via `setSanitizer()`). Falls back to the identity function if no sanitizer is registered. Used by the runtime when setting `innerHTML` on elements.

**Example**

```tsx
import { setSanitizer, sanitizeHtml } from "@pyreon/runtime-dom"
setSanitizer(DOMPurify.sanitize)
const clean = sanitizeHtml(userInput)
```

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

> **Dev warnings use import.meta.env.DEV:** All dev-mode warnings (`mount()` null container, duplicate keys, raw signal children) use `import.meta.env.DEV` — NOT `typeof process`. Vite/Rolldown literal-replaces it at build time; production bundles contain zero warning bytes. Tests run in vitest which sets DEV=true automatically.

> **Event delegation:** `setupDelegation(container)` is called by `mount()` — common events are delegated to the container root for performance. Direct event binding (non-delegated) is used for events that do not bubble (focus, blur, scroll, etc.).

---
title: "@pyreon/runtime-dom"
description: Surgical signal-to-DOM renderer with no virtual DOM diffing, hydration, transitions, and template cloning.
---

`@pyreon/runtime-dom` is Pyreon's browser renderer. It mounts VNode trees directly to the DOM using surgical signal-driven updates -- no virtual DOM diffing. It supports hydration, CSS transitions, template cloning, and keep-alive caching.

<PackageBadge name="@pyreon/runtime-dom" href="/docs/runtime-dom" />

## Installation

::: code-group
```bash [npm]
npm install @pyreon/runtime-dom
```
```bash [bun]
bun add @pyreon/runtime-dom
```
```bash [pnpm]
pnpm add @pyreon/runtime-dom
```
```bash [yarn]
yarn add @pyreon/runtime-dom
```
:::

## Core Concepts

Pyreon's runtime-dom takes a fundamentally different approach from virtual-DOM frameworks like React or Vue. Instead of diffing a virtual tree on every update, Pyreon creates DOM nodes once and uses fine-grained reactive effects to update only the specific text nodes, attributes, or properties that depend on changed signals. This means:

- **No re-renders**: Components run their setup function exactly once. There is no "render cycle."
- **Surgical updates**: When a signal changes, only the specific DOM operation tied to that signal executes.
- **Zero overhead for static content**: Static elements have no ongoing runtime cost after initial mount.

## Mounting

### mount

Mount a VNode tree into a container element. Clears the container first, then mounts the given child. Returns an `unmount` function that removes everything and disposes all effects.

```tsx
import { mount } from "@pyreon/runtime-dom"

const unmount = mount(
  <App />,
  document.getElementById("app")!
)

// Later: unmount and clean up everything
unmount()
```

The `mount` function performs three steps internally:

1. Installs DevTools integration (if available).
2. Clears the container via `innerHTML = ""`.
3. Calls `mountChild` to recursively mount the VNode tree.

The returned `unmount` function is safe to call multiple times -- subsequent calls are no-ops after the first.

### render

An alias for `mount`. Use whichever name you prefer:

```tsx
import { render } from "@pyreon/runtime-dom"

const unmount = render(<App />, document.getElementById("app")!)
```

### mount with JSX

If you are using the Pyreon JSX transform, mounting looks like this:

```tsx
import { mount } from "@pyreon/runtime-dom"

function App() {
  return () => <h1>Hello Pyreon</h1>
}

const unmount = mount(<App />, document.getElementById("app")!)
```

### Mounting Lifecycle

When `mount` is called, the following lifecycle occurs:

1. **Container cleared** -- All existing DOM children are removed.
2. **VNode tree walked** -- `mountChild` recursively processes each node.
3. **Components initialized** -- Each component function is called once. An `EffectScope` is created for the component so all signals and effects are tracked. If a component throws during setup or render, the error is logged via `console.error` instead of being silently swallowed.
4. **DOM elements created** -- `document.createElement` for element VNodes (or `cloneNode` for template-optimized elements).
5. **Props applied** -- Event listeners registered, reactive effects created for dynamic attributes.
6. **Children mounted** -- Recursive depth-first mount of child VNodes.
7. **Refs populated** -- `ref.current` is set after the element is inserted into the DOM.
8. **onMount hooks fired** -- Cleanup functions returned from `onMount` callbacks are tracked.
9. **DevTools registration** -- Component entries registered for the Pyreon DevTools panel.

### How mountChild Works

The `mountChild` function is the core dispatcher. It handles all VNode types:

| Input | Behavior |
|-------|----------|
| `() => VNodeChild` | Reactive: re-mounts whenever the accessor changes |
| `null`, `undefined`, `false` | Nothing rendered |
| `string`, `number` | Static text node |
| VNode with string type | DOM element created with `createElement` |
| VNode with function type | Component: function called once, output mounted |
| VNode with Fragment symbol | Transparent wrapper: children mounted directly |
| VNode with ForSymbol | Efficient keyed list reconciliation |
| VNode with PortalSymbol | Children mounted into the portal target |
| NativeItem | Pre-built template clone inserted directly |

#### Reactive Text Fast Path

When a reactive accessor returns a primitive (string, number, boolean), Pyreon uses a text-node fast path: it creates a single `Text` node and updates `.data` in-place via a `renderEffect`. This saves a comment marker node and reduces DOM operations from 3 to 1 per update compared to the generic `mountReactive` path.

```tsx
function Counter() {
  const count = signal(0)
  return () => <p>Count: {() => count()}</p>
  // The reactive binding {() => count()} uses the text fast path.
  // Only text.data is updated -- no DOM node replacement.
}
```

#### Keyed Array Detection

When a reactive accessor returns an array where every VNode carries a `key`, Pyreon automatically uses its keyed list reconciler. This reconciler uses a Longest Increasing Subsequence (LIS) algorithm to minimize DOM moves:

```tsx
function KeyedList() {
  const items = signal([
    { id: 1, text: "Alpha" },
    { id: 2, text: "Beta" },
    { id: 3, text: "Gamma" },
  ])

  return () => (
    <ul>
      {() => items().map(item =>
        <li key={item.id}>{item.text}</li>
      )}
    </ul>
  )
}
```

#### Element Depth Optimization

Pyreon tracks element nesting depth during mount. When a child is nested inside a parent element, its cleanup function can skip DOM removal (since removing the parent handles that). This avoids allocating a `removeChild` closure for every nested element, significantly reducing memory overhead in large trees.

### Unmounting

The cleanup function returned by `mount` performs:

1. **Effect disposal** -- All `renderEffect` and `effect` instances created during mount are stopped.
2. **onUnmount hooks** -- Component `onUnmount` callbacks are fired in reverse mount order.
3. **onMount cleanup** -- Return values from `onMount` callbacks are called.
4. **DOM removal** -- All mounted DOM nodes are removed from the container.
5. **Ref cleanup** -- `ref.current` is set back to `null`.
6. **DevTools unregistration** -- Component entries removed from the DevTools panel.

```ts
const unmount = mount(<App />, document.getElementById("app")!)

// Perform a full teardown
unmount()
// The container is now empty, all effects are stopped,
// all event listeners are removed.
```

## Hydration

### hydrateRoot

Hydrate a server-rendered container with a Pyreon VNode tree. Reuses existing DOM elements for static structure, attaches event listeners and reactive effects without re-rendering. Falls back to fresh mount for dynamic content.

```tsx
import { hydrateRoot } from "@pyreon/runtime-dom"

const unmount = hydrateRoot(
  document.getElementById("app")!,
  <App />
)
```

#### How Hydration Works

The hydration strategy is "walk-and-claim" -- it walks the VNode tree in parallel with the live DOM and:

- **Static elements** are matched by tag position, with props (events + reactive effects) attached.
- **Static text** is reused as-is.
- **Reactive text** is reused with a reactive effect attached to `.data`.
- **Components** are called, and their output is matched against the DOM subtree.
- **For lists** use SSR hydration markers (`<!--pyreon-for-->`) for boundary detection.
- **Fragments** are transparent -- children matched directly against DOM nodes.
- **Portals** always remount into their target container.

#### DOM Cursor Helpers

During hydration, the walker skips comment nodes and whitespace-only text nodes to find "real" DOM nodes. This ensures that formatting whitespace in server-rendered HTML does not cause mismatches.

#### Hydration with JSX

```tsx
import { hydrateRoot } from "@pyreon/runtime-dom"

// Server-rendered HTML is already in #app
const unmount = hydrateRoot(
  document.getElementById("app")!,
  <App />
)
```

#### SSR + Hydration Full Example

```tsx
// --- server.ts ---
import { renderToString } from "@pyreon/server"

const html = await renderToString(<App />)
const page = `
  <!DOCTYPE html>
  <html>
    <body>
      <div id="app">${html}</div>
      <script src="/client.js"></script>
    </body>
  </html>
`

// --- client.ts ---
import { hydrateRoot } from "@pyreon/runtime-dom"

hydrateRoot(document.getElementById("app")!, <App />)
```

#### Hydration Mismatch Handling

When the server-rendered DOM does not match the client VNode tree, Pyreon falls back to a fresh `mountChild` call for the mismatched subtree. This means hydration is self-healing -- it always produces a correct result, though with a performance cost for the mismatched portion.

Common causes of hydration mismatches:

- **Date/time rendering** that differs between server and client.
- **Browser-specific APIs** (e.g., `window.innerWidth`) used during render.
- **Random values** or UUIDs generated during render.
- **Conditional rendering** based on client-only state.

### Hydration Debug

Enable or disable hydration mismatch warnings:

```ts
import {
  enableHydrationWarnings,
  disableHydrationWarnings
} from "@pyreon/runtime-dom"

enableHydrationWarnings()  // log warnings when DOM doesn't match VNode
disableHydrationWarnings() // silence warnings (production)
```

Warnings are enabled automatically in development (`NODE_ENV !== "production"`). Each warning includes:

- **Mismatch type**: `tag`, `text`, or `missing`
- **Expected value**: What the VNode tree expected
- **Actual value**: What the DOM contained
- **Path**: Human-readable location in the tree, e.g. `root > div > span`

Example warning output:

```
[pyreon] Hydration mismatch (tag) at <root > div > span>: expected "h1", got "h2"
```

#### Debugging Hydration Issues

```tsx
import { enableHydrationWarnings } from "@pyreon/runtime-dom"

// Enable during development
if (import.meta.env.DEV) {
  enableHydrationWarnings()
}

// Now hydrate -- mismatches will be logged to console
hydrateRoot(document.getElementById("app")!, <App />)
```

## Template Cloning

Template cloning is Pyreon's optimization for repetitive DOM structures. Instead of creating elements one by one with `createElement` + `setAttribute`, it parses HTML once into a `<template>` element and clones it via `cloneNode(true)` -- approximately 5-10x faster.

### createTemplate

Creates a row/item factory backed by HTML template cloning. The HTML string is parsed exactly once via `<template>.innerHTML`. Each call to the returned factory clones the root element via `cloneNode(true)`.

```ts
import { createTemplate } from "@pyreon/runtime-dom"

interface Row {
  id: number
  label: Cell<string>
}

const rowFactory = createTemplate<Row>(
  "<tr><td></td><td></td></tr>",
  (el, row) => {
    const td1 = el.firstChild as HTMLElement
    const td2 = td1.nextSibling as HTMLElement
    td1.textContent = String(row.id)
    const text = document.createTextNode(row.label.peek())
    td2.appendChild(text)
    const unsub = row.label.subscribe(() => {
      text.data = row.label.peek()
    })
    return unsub // cleanup function
  }
)

// Usage: rowFactory(row) returns a NativeItem for direct DOM insertion
```

#### createTemplate API

```ts
function createTemplate<T>(
  html: string,
  bind: (el: HTMLElement, item: T) => (() => void) | null
): (item: T) => NativeItem
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `html` | `string` | HTML string for the template. Parsed once. |
| `bind` | `(el, item) => cleanup \| null` | Wiring function. Receives the cloned element and the item data. Should set up text content, event listeners, and reactive effects. Return a cleanup function or null. |

**Returns:** A factory function `(item: T) => NativeItem` that clones the template and wires it up.

#### NativeItem

The `NativeItem` type is a lightweight container for pre-built DOM elements:

```ts
interface NativeItem {
  __isNative: true
  el: HTMLElement
  cleanup: (() => void) | null
}
```

When `mountChild` encounters a `NativeItem`, it inserts the element directly without VNode processing -- zero allocation overhead.

#### Real-World Example: High-Performance Table

```ts
import { createTemplate } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

interface Product {
  id: number
  name: signal<string>
  price: signal<number>
  inStock: signal<boolean>
}

const productRow = createTemplate<Product>(
  `<tr class="product-row">
    <td class="id"></td>
    <td class="name"></td>
    <td class="price"></td>
    <td class="stock"><span></span></td>
  </tr>`,
  (el, product) => {
    const cells = el.children
    const idCell = cells[0] as HTMLElement
    const nameCell = cells[1] as HTMLElement
    const priceCell = cells[2] as HTMLElement
    const stockSpan = cells[3]?.querySelector("span") as HTMLElement

    // Static binding
    idCell.textContent = String(product.id)

    // Reactive bindings
    const nameText = document.createTextNode(product.name.peek())
    nameCell.appendChild(nameText)

    const priceText = document.createTextNode("")
    priceCell.appendChild(priceText)

    const cleanups = [
      product.name.subscribe(() => {
        nameText.data = product.name.peek()
      }),
      product.price.subscribe(() => {
        priceText.data = `$${product.price.peek().toFixed(2)}`
      }),
      product.inStock.subscribe(() => {
        stockSpan.textContent = product.inStock.peek() ? "In Stock" : "Out of Stock"
        stockSpan.className = product.inStock.peek() ? "badge-green" : "badge-red"
      }),
    ]

    return () => cleanups.forEach(fn => fn())
  }
)
```

### _tpl (Compiler Internal)

The compiler-emitted template instantiation function. Parses the HTML once (cached globally), clones for each call, and runs the bind function to wire up dynamic parts. You do not call this directly -- the compiler generates `_tpl` calls automatically.

```ts
// Compiler output example:
_tpl('<div class="box"><span></span></div>', (__root) => {
  const __e0 = __root.children[0]
  const __d0 = _bind(() => { __e0.textContent = text() })
  return () => { __d0() }
})
```

#### How the Compiler Uses _tpl

When the Pyreon compiler detects a static JSX element tree, it emits `_tpl(html, bindFn)` instead of nested `h()` calls. Benefits:

- `cloneNode(true)` is approximately 5-10x faster than sequential `createElement` + `setAttribute`.
- Zero VNode / props-object / children-array allocations per instance.
- Static attributes are baked into the HTML string (no runtime prop application).

**Before optimization (h calls):**
```tsx
<div class="box"><span>{text()}</span></div>
```

**After optimization (_tpl):**
```ts
_tpl('<div class="box"><span></span></div>', (__root) => {
  const __e0 = __root.children[0] as HTMLElement
  const __d0 = renderEffect(() => { __e0.textContent = text() })
  return () => { __d0() }
})
```

#### Template Cache

`_tpl` uses a global `Map<string, HTMLTemplateElement>` cache. The same HTML string always reuses the same parsed template, so even components that appear thousands of times (e.g., list items) only parse the HTML once.

## Props

### applyProp / applyProps

Apply props to a DOM element. Handles event listeners, reactive values, static attributes, classes, styles, and innerHTML sanitization.

```ts
import { applyProp, applyProps } from "@pyreon/runtime-dom"

// Apply all props at once
const cleanup = applyProps(el, {
  class: () => active() ? "on" : "off",
  onClick: handleClick,
  disabled: () => loading(),
})

// Apply a single prop
const cleanup = applyProp(el, "class", () => theme())
```

#### applyProps API

```ts
function applyProps(el: Element, props: Props): (() => void) | null
```

Iterates all props (except `key` and `ref`) and calls `applyProp` for each. Returns a single chained cleanup function, or `null` if no props need teardown. Uses `for-in` instead of `Object.keys()` to avoid allocating a keys array.

#### applyProp API

```ts
function applyProp(
  el: Element,
  key: string,
  value: unknown
): (() => void) | null
```

Returns a cleanup function if the prop creates a subscription (event listener or reactive effect), or `null` for static props.

### Prop Handling Rules

#### Event Listeners

Props matching `onXxx` (e.g., `onClick`, `onInput`, `onMouseEnter`) are registered via `addEventListener`. The handler is automatically wrapped in `batch()` so multiple signal writes from one handler coalesce into a single DOM update.

```tsx
function Counter() {
  const count = signal(0)
  const name = signal("")

  return () => (
    <div>
      {/* batch() wraps the handler -- both signal writes
          produce only one DOM update */}
      <button onClick={() => {
        count.update(c => c + 1)
        name.set(`Count ${count.peek()}`)
      }}>
        Increment
      </button>
      <p>{() => name()}</p>
    </div>
  )
}
```

The event name is derived by lowercasing the third character and taking the rest: `onClick` becomes `click`, `onMouseEnter` becomes `mouseenter`.

#### Typed Event Targets

Event handlers receive a `TargetedEvent<E>` where `currentTarget` is typed to the element. No more manual casts:

```tsx
// currentTarget is typed as HTMLInputElement -- no cast needed
<input onInput={(e) => name.set(e.currentTarget.value)} />

// currentTarget is typed as HTMLSelectElement
<select onChange={(e) => choice.set(e.currentTarget.value)}>
  <option value="a">A</option>
  <option value="b">B</option>
</select>
```

The `TargetedEvent` type is exported from `@pyreon/core` for use in explicit type annotations.

#### Supported Events

In addition to standard DOM events (`onClick`, `onInput`, `onChange`, `onKeyDown`, etc.), Pyreon supports:

- `onBeforeInput` -- fires before the input value changes, with access to `inputType` and `data`
- `onInvalid` -- fires when a form element fails constraint validation
- `onResize` -- fires when the element is resized (useful with `ResizeObserver`-backed elements)
- `onToggle` -- fires when a `<details>` element is opened or closed

#### Reactive Props

Any non-event function prop is treated as reactive. A `renderEffect` re-evaluates it whenever its signal dependencies change:

```tsx
<div
  class={() => isActive() ? "active" : "inactive"}
  style={() => ({ color: theme() === "dark" ? "white" : "black" })}
  aria-label={() => `Item ${index()}`}
  data-count={() => String(count())}
  disabled={() => isLoading()}
/>
```

Each reactive prop creates one lightweight `renderEffect`. When the signal changes, only that specific DOM operation runs -- no diffing, no reconciliation.

#### Classes

The `class` prop accepts strings, arrays, objects, or nested combinations. Under the hood, values are resolved using `cx()` (exported from `@pyreon/core`). Both static and reactive values are supported:

```tsx
// Static string
<div class="card shadow" />

// Reactive string
<div class={() => `card ${selected() ? "selected" : ""}`} />

// Array of classes (falsy values are filtered out)
<div class={["card", isActive() && "active", size() && "large"]} />

// Object syntax (keys with truthy values are included)
<div class={{ card: true, active: isActive(), disabled: isDisabled() }} />

// Nested mix of strings, arrays, and objects
<div class={["base", { active: isActive() }, size() && "lg"]} />

// Using className (alias)
<div className="container" />
```

You can also use `cx()` directly for composing class names outside of JSX:

```ts
import { cx } from "@pyreon/core"

const className = cx("btn", props.variant && `btn-${props.variant}`, { disabled: props.disabled })
```

#### Styles

The `style` prop accepts a string or an object:

```tsx
// String style
<div style="color: red; font-size: 14px" />

// Object style
<div style={{ color: "red", fontSize: "14px" }} />

// Reactive object style
<div style={() => ({
  color: theme() === "dark" ? "white" : "black",
  backgroundColor: theme() === "dark" ? "#1a1a1a" : "#fff",
  transform: `translateX(${offset()}px)`,
})} />
```

Object styles use `Object.assign(el.style, value)`, so only the specified properties are updated.

**Auto-px for numeric values:** When a style property expects a length and you pass a number, Pyreon automatically appends `px`. This applies to properties like `width`, `height`, `padding`, `margin`, `fontSize`, `borderRadius`, `top`, `left`, etc. Properties that are unitless (like `opacity`, `zIndex`, `flex`, `lineHeight`) are left as-is.

```tsx
// Numbers are auto-converted to px for length properties
<div style={{ width: 200, height: 100, padding: 16, opacity: 0.5 }} />
// Equivalent to: style="width: 200px; height: 100px; padding: 16px; opacity: 0.5"
```

#### Data Attributes

Data attributes work like any other attribute:

```tsx
<div
  data-testid="user-card"
  data-user-id={() => String(userId())}
  data-active={() => String(isActive())}
/>
```

#### ARIA Attributes

ARIA attributes are set as standard attributes:

```tsx
<button
  aria-label={() => isOpen() ? "Close menu" : "Open menu"}
  aria-expanded={() => String(isOpen())}
  aria-controls="nav-menu"
  role="button"
/>
```

#### Boolean Attributes

Boolean values toggle attribute presence: `true` adds the attribute (empty string), `false` removes it:

```tsx
<input
  disabled={() => isSubmitting()}
  readonly={() => !canEdit()}
  checked={() => isSelected()}
  required
/>
```

#### DOM Properties

When a key exists as a property on the element (e.g., `value`, `checked`, `selected`), Pyreon sets the DOM property directly instead of using `setAttribute`. This ensures correct behavior for form elements:

```tsx
<input
  value={() => inputValue()}
  type="text"
/>

<select>
  <option selected={() => choice() === "a"} value="a">A</option>
  <option selected={() => choice() === "b"} value="b">B</option>
</select>
```

#### URL Attribute Security

Pyreon blocks `javascript:` and `data:` URIs in URL-bearing attributes (`href`, `src`, `action`, `formaction`, `poster`, `cite`, `data`). In development mode, a warning is logged:

```tsx
// This will be blocked:
<a href="javascript:alert('xss')">Click me</a>
// [pyreon] Blocked unsafe href value: "javascript:alert('xss')"

// These are safe:
<a href="https://example.com">Safe link</a>
<a href="/relative/path">Relative link</a>
<img src="https://example.com/image.png" />
```

### innerHTML and dangerouslySetInnerHTML

#### innerHTML (Sanitized)

The `innerHTML` prop is automatically sanitized:

```tsx
// Automatically sanitized -- safe
<div innerHTML={userContent} />
```

#### dangerouslySetInnerHTML (Raw)

For trusted HTML content, use `dangerouslySetInnerHTML` with an `__html` property. In development mode, a warning is logged:

```tsx
// Raw HTML -- you own sanitization
<div dangerouslySetInnerHTML={{ __html: trustedHtml }} />
```

### HTML Sanitization

#### sanitizeHtml

The `sanitizeHtml` function sanitizes HTML strings using a three-tier strategy:

1. **Custom sanitizer** (if set via `setSanitizer`) -- highest priority.
2. **Browser Sanitizer API** (Chrome 105+) -- native, fast.
3. **Built-in fallback** -- DOM-based allowlist sanitizer.
4. **SSR/no-DOM fallback** -- strips all tags as last resort.

```ts
import { sanitizeHtml } from "@pyreon/runtime-dom"

const safe = sanitizeHtml("<script>alert('xss')</script><p>Safe</p>")
// "<p>Safe</p>"

const safe2 = sanitizeHtml('<img onerror="hack()" src="x">')
// '<img src="x">'

const safe3 = sanitizeHtml('<a href="javascript:alert(1)">Link</a>')
// '<a>Link</a>'
```

#### Built-in Fallback Sanitizer

The built-in fallback sanitizer:

- Parses HTML via `DOMParser` into a temporary document.
- Walks the node tree recursively.
- **Allows** only safe HTML tags (block + inline elements, no scripts/embeds/forms).
- **Strips** event handler attributes (`onclick`, `onerror`, etc.).
- **Blocks** `javascript:` and `data:` URLs in `href`, `src`, `action`, and similar attributes.
- Replaces unsafe elements with their text content.

Safe tags include: `a`, `abbr`, `address`, `article`, `aside`, `b`, `blockquote`, `br`, `code`, `dd`, `del`, `details`, `div`, `dl`, `dt`, `em`, `figcaption`, `figure`, `footer`, `h1`-`h6`, `header`, `hr`, `i`, `ins`, `kbd`, `li`, `main`, `mark`, `nav`, `ol`, `p`, `pre`, `q`, `s`, `section`, `small`, `span`, `strong`, `sub`, `summary`, `sup`, `table`, `tbody`, `td`, `tfoot`, `th`, `thead`, `time`, `tr`, `u`, `ul`, `var`, `wbr`, and more.

#### setSanitizer

Override the built-in sanitizer with a custom one:

```ts
import { setSanitizer } from "@pyreon/runtime-dom"

// With DOMPurify:
import DOMPurify from "dompurify"
setSanitizer((html) => DOMPurify.sanitize(html))

// With sanitize-html:
import sanitize from "sanitize-html"
setSanitizer((html) => sanitize(html))

// Reset to built-in:
setSanitizer(null)
```

#### Security Best Practices

```tsx
// SAFE: innerHTML is auto-sanitized
<div innerHTML={userComment} />

// UNSAFE: you must sanitize yourself
<div dangerouslySetInnerHTML={{ __html: trustedHtml }} />

// RECOMMENDED: use a dedicated sanitizer for user content
import DOMPurify from "dompurify"
setSanitizer((html) => DOMPurify.sanitize(html))

// Now all innerHTML props go through DOMPurify
<div innerHTML={untrustedHtml} />
```

## Transition

The `Transition` component adds CSS enter/leave animation classes to a single child element, controlled by a reactive `show` prop.

```tsx
import { Transition } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

const visible = signal(false)

function App() {
  return () => (
    <div>
      <button onClick={() => visible.update(v => !v)}>Toggle</button>
      <Transition name="fade" show={() => visible()}>
        <div class="modal">Content</div>
      </Transition>
    </div>
  )
}
```

### CSS Class Lifecycle

The class lifecycle follows a standard enter/leave pattern:

**Enter:**
1. `&#123;name&#125;-enter-from` and `&#123;name&#125;-enter-active` are added.
2. Next animation frame: `&#123;name&#125;-enter-from` is removed, `&#123;name&#125;-enter-to` is added.
3. On `transitionend` or `animationend`: `&#123;name&#125;-enter-active` and `&#123;name&#125;-enter-to` are removed.

**Leave:**
1. `&#123;name&#125;-leave-from` and `&#123;name&#125;-leave-active` are added.
2. Next animation frame: `&#123;name&#125;-leave-from` is removed, `&#123;name&#125;-leave-to` is added.
3. On `transitionend` or `animationend`: element is unmounted.

### CSS Transition Example

```css
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 300ms ease;
}
```

### CSS Animation Example

```css
/* Using CSS @keyframes animations */
.bounce-enter-active {
  animation: bounce-in 500ms ease;
}
.bounce-leave-active {
  animation: bounce-in 300ms ease reverse;
}

@keyframes bounce-in {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
```

```tsx
<Transition name="bounce" show={() => showModal()}>
  <div class="modal">Modal content</div>
</Transition>
```

### Slide and Fade Combined

```css
.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}
.slide-fade-enter-active {
  transition: all 300ms ease-out;
}
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
.slide-fade-leave-active {
  transition: all 200ms ease-in;
}
```

```tsx
<Transition name="slide-fade" show={() => isOpen()}>
  <div class="dropdown-content">
    <p>Dropdown items here</p>
  </div>
</Transition>
```

### Appear on Mount

Set `appear` to animate the element when it first renders:

```tsx
<Transition name="fade" show={() => true} appear>
  <div class="hero-banner">Welcome!</div>
</Transition>
```

### Custom Class Names

Override individual class names for integration with CSS utility frameworks:

```tsx
<Transition
  show={() => visible()}
  enterFrom="opacity-0 -translate-y-4"
  enterActive="transition-all duration-300 ease-out"
  enterTo="opacity-100 translate-y-0"
  leaveFrom="opacity-100 translate-y-0"
  leaveActive="transition-all duration-200 ease-in"
  leaveTo="opacity-0 translate-y-4"
>
  <div class="card">Tailwind-animated card</div>
</Transition>
```

### Lifecycle Callbacks

```tsx
<Transition
  name="modal"
  show={() => showModal()}
  onBeforeEnter={(el) => {
    // Runs before enter animation starts
    el.style.willChange = "opacity, transform"
  }}
  onAfterEnter={(el) => {
    // Runs after enter animation completes
    el.style.willChange = ""
    el.querySelector("input")?.focus()
  }}
  onBeforeLeave={(el) => {
    // Runs before leave animation starts
    console.log("Modal closing...")
  }}
  onAfterLeave={(el) => {
    // Runs after leave animation completes and element is removed
    console.log("Modal closed")
  }}
>
  <div class="modal-overlay">
    <div class="modal-content">
      <input type="text" placeholder="Auto-focused on enter" />
    </div>
  </div>
</Transition>
```

### Cancellation Handling

If `show` flips back to `true` during a leave animation, Transition cancels the leave and immediately starts an enter animation. This prevents visual glitches when users rapidly toggle visibility.

### TransitionProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | `"pyreon"` | CSS class name prefix |
| `show` | `() => boolean` | required | Reactive boolean controlling visibility |
| `appear` | `boolean` | `false` | Run enter animation on initial mount |
| `enterFrom` | `string` | `&#123;name&#125;-enter-from` | Override enter-from class |
| `enterActive` | `string` | `&#123;name&#125;-enter-active` | Override enter-active class |
| `enterTo` | `string` | `&#123;name&#125;-enter-to` | Override enter-to class |
| `leaveFrom` | `string` | `&#123;name&#125;-leave-from` | Override leave-from class |
| `leaveActive` | `string` | `&#123;name&#125;-leave-active` | Override leave-active class |
| `leaveTo` | `string` | `&#123;name&#125;-leave-to` | Override leave-to class |
| `onBeforeEnter` | `(el: HTMLElement) => void` | -- | Called before enter animation |
| `onAfterEnter` | `(el: HTMLElement) => void` | -- | Called after enter animation |
| `onBeforeLeave` | `(el: HTMLElement) => void` | -- | Called before leave animation |
| `onAfterLeave` | `(el: HTMLElement) => void` | -- | Called after leave animation |

### Important Notes

- **Child must be a DOM element**, not a component. If you pass a component as a child, a console warning is emitted. Wrap it in a `<div>` for animations to work.
- Transition uses a `ref` injection to access the underlying DOM element. This is transparent -- you do not need to forward refs.
- When `show` is `false`, the child is unmounted from the DOM (not just hidden). Use `KeepAlive` if you need to preserve state while hidden.

## TransitionGroup

Animates a keyed reactive list with CSS enter/leave and FLIP move animations.

```tsx
import { TransitionGroup } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }])

function AnimatedList() {
  return () => (
    <TransitionGroup
      tag="ul"
      name="list"
      items={() => items()}
      keyFn={(item) => item.id}
      render={(item) => <li class="item">{item.id}</li>}
    />
  )
}
```

### CSS for TransitionGroup

```css
/* Enter and leave animations */
.list-enter-from, .list-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
.list-enter-active, .list-leave-active {
  transition: all 300ms ease;
}

/* FLIP move animation -- critical for smooth reordering */
.list-move {
  transition: transform 300ms ease;
}
```

### How FLIP Move Animation Works

TransitionGroup uses the FLIP (First, Last, Invert, Play) animation technique:

1. **First**: Record the bounding rect of every existing item before DOM mutations.
2. **Last**: Perform DOM mutations (add, remove, reorder items).
3. **Invert**: Calculate the delta between old and new positions. Apply an inverse `transform: translate(dx, dy)` so items appear in their old positions.
4. **Play**: Remove the transform with a CSS transition so items smoothly animate to their new positions.

### Complete Animated List Example

```tsx
import { TransitionGroup } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

const nextId = signal(4)
const items = signal([
  { id: 1, text: "Apple" },
  { id: 2, text: "Banana" },
  { id: 3, text: "Cherry" },
])

function AnimatedTodoList() {
  const addItem = () => {
    const id = nextId.peek()
    nextId.set(id + 1)
    items.update(list => [...list, { id, text: `Item ${id}` }])
  }

  const removeItem = (id: number) => {
    items.update(list => list.filter(item => item.id !== id))
  }

  const shuffle = () => {
    items.update(list => {
      const copy = [...list]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
      }
      return copy
    })
  }

  return () => (
    <div>
      <button onClick={addItem}>Add</button>
      <button onClick={shuffle}>Shuffle</button>
      <TransitionGroup
        tag="ul"
        name="todo"
        items={() => items()}
        keyFn={(item) => item.id}
        render={(item) => (
          <li class="todo-item">
            {item.text}
            <button onClick={() => removeItem(item.id)}>x</button>
          </li>
        )}
      />
    </div>
  )
}
```

```css
.todo-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}
.todo-enter-active {
  transition: all 400ms ease-out;
}
.todo-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
.todo-leave-active {
  transition: all 300ms ease-in;
}
.todo-move {
  transition: transform 400ms ease;
}
```

### TransitionGroup with Lifecycle Callbacks

```tsx
<TransitionGroup
  tag="div"
  name="card"
  items={() => cards()}
  keyFn={(card) => card.id}
  render={(card) => <div class="card">{card.title}</div>}
  onBeforeEnter={(el) => {
    el.style.willChange = "opacity, transform"
  }}
  onAfterEnter={(el) => {
    el.style.willChange = ""
  }}
  onBeforeLeave={(el) => {
    // Lock dimensions to prevent layout shift during leave
    const rect = el.getBoundingClientRect()
    el.style.width = `${rect.width}px`
    el.style.height = `${rect.height}px`
    el.style.position = "absolute"
  }}
  onAfterLeave={() => {
    console.log("Card removed from DOM")
  }}
/>
```

### TransitionGroupProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tag` | `string` | `"div"` | Wrapper element tag |
| `name` | `string` | `"pyreon"` | CSS class prefix |
| `appear` | `boolean` | `false` | Animate items on initial mount |
| `items` | `() => T[]` | required | Reactive list source |
| `keyFn` | `(item: T, index: number) => string \| number` | required | Stable key extractor |
| `render` | `(item: T, index: number) => VNode` | required | Render function for each item |
| `moveClass` | `string` | `&#123;name&#125;-move` | Class applied during move animation |
| `enterFrom` | `string` | `&#123;name&#125;-enter-from` | Override enter-from class |
| `enterActive` | `string` | `&#123;name&#125;-enter-active` | Override enter-active class |
| `enterTo` | `string` | `&#123;name&#125;-enter-to` | Override enter-to class |
| `leaveFrom` | `string` | `&#123;name&#125;-leave-from` | Override leave-from class |
| `leaveActive` | `string` | `&#123;name&#125;-leave-active` | Override leave-active class |
| `leaveTo` | `string` | `&#123;name&#125;-leave-to` | Override leave-to class |
| `onBeforeEnter` | `(el: HTMLElement) => void` | -- | Called before enter animation |
| `onAfterEnter` | `(el: HTMLElement) => void` | -- | Called after enter animation |
| `onBeforeLeave` | `(el: HTMLElement) => void` | -- | Called before leave animation |
| `onAfterLeave` | `(el: HTMLElement) => void` | -- | Called after leave animation |

## KeepAlive

Mounts children once and keeps them alive even when hidden. Unlike conditional rendering (which destroys and recreates component state), KeepAlive CSS-hides children while preserving all reactive state, scroll position, form values, and in-flight async operations.

```tsx
import { KeepAlive } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

function App() {
  const route = signal("/a")

  return () => (
    <>
      <nav>
        <button onClick={() => route.set("/a")}>Route A</button>
        <button onClick={() => route.set("/b")}>Route B</button>
      </nav>
      <KeepAlive active={() => route() === "/a"}>
        <RouteA />
      </KeepAlive>
      <KeepAlive active={() => route() === "/b"}>
        <RouteB />
      </KeepAlive>
    </>
  )
}
```

### How KeepAlive Works

1. **First activation**: Children are mounted into a wrapper `<div>` with `display: contents` (transparent to CSS layout).
2. **Deactivation**: The wrapper's `display` is set to `none`. Children remain in the DOM with all effects running.
3. **Reactivation**: The wrapper's `display` is set back to `""` (which becomes `contents`). No re-mounting occurs.

The `display: contents` wrapper means KeepAlive is invisible to CSS layout -- children behave as if they were direct children of the parent element.

### KeepAlive with Tab Switching

```tsx
function TabPanel() {
  const activeTab = signal("settings")

  return () => (
    <div class="tab-container">
      <div class="tab-bar">
        {["settings", "profile", "notifications"].map(tab => (
          <button
            class={() => activeTab() === tab ? "tab active" : "tab"}
            onClick={() => activeTab.set(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Each tab preserves its state independently */}
      <KeepAlive active={() => activeTab() === "settings"}>
        <SettingsForm />
      </KeepAlive>
      <KeepAlive active={() => activeTab() === "profile"}>
        <ProfileEditor />
      </KeepAlive>
      <KeepAlive active={() => activeTab() === "notifications"}>
        <NotificationPreferences />
      </KeepAlive>
    </div>
  )
}
```

### KeepAlive Preserving Form State

```tsx
function ExpensiveForm() {
  const name = signal("")
  const email = signal("")
  const bio = signal("")
  const scrollPos = signal(0)

  onMount(() => {
    // This scroll position is preserved across tab switches
    const el = document.querySelector(".form-container")
    if (el) el.scrollTop = scrollPos.peek()
    return undefined
  })

  return () => (
    <div class="form-container" onScroll={(e) =>
      scrollPos.set(e.currentTarget.scrollTop)
    }>
      <input value={() => name()} onInput={(e) =>
        name.set(e.currentTarget.value)
      } />
      <input value={() => email()} onInput={(e) =>
        email.set(e.currentTarget.value)
      } />
      <textarea value={() => bio()} onInput={(e) =>
        bio.set(e.currentTarget.value)
      } />
    </div>
  )
}

// When wrapped in KeepAlive, all form values, scroll position,
// and signal state survive when the tab is switched away and back.
```

### KeepAliveProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `active` | `() => boolean` | `() => true` | Reactive boolean controlling visibility. When false, children are CSS-hidden but remain mounted. |
| `children` | `VNodeChild` | -- | The content to keep alive |

### KeepAlive vs Conditional Rendering

| Feature | KeepAlive | Conditional Rendering |
|---------|-----------|----------------------|
| State preserved | Yes | No -- destroyed and recreated |
| Effects running | Yes (always) | Only when mounted |
| Scroll position | Preserved | Lost |
| Form values | Preserved | Lost |
| DOM nodes | Always in DOM (hidden) | Added/removed |
| Memory usage | Higher (all tabs mounted) | Lower (only active tab) |

## Real-World Examples

### Animated Route Transitions

```tsx
import { Transition } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

const route = signal<string>("/home")

function Router() {
  return () => (
    <div class="router">
      <Transition name="page" show={() => route() === "/home"}>
        <div class="page"><HomePage /></div>
      </Transition>
      <Transition name="page" show={() => route() === "/about"}>
        <div class="page"><AboutPage /></div>
      </Transition>
      <Transition name="page" show={() => route() === "/contact"}>
        <div class="page"><ContactPage /></div>
      </Transition>
    </div>
  )
}
```

```css
.page-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.page-enter-active {
  transition: all 300ms ease-out;
}
.page-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
.page-leave-active {
  transition: all 200ms ease-in;
  position: absolute;
  width: 100%;
}
```

### Staggered List Animation

```tsx
function StaggeredList() {
  const items = signal<string[]>([])

  const loadItems = async () => {
    const data = await fetch("/api/items").then(r => r.json())
    // Add items one at a time for staggered effect
    for (let i = 0; i < data.length; i++) {
      setTimeout(() => {
        items.update(list => [...list, data[i]])
      }, i * 100)
    }
  }

  return () => (
    <TransitionGroup
      tag="ul"
      name="stagger"
      items={() => items()}
      keyFn={(item, i) => i}
      render={(item) => <li class="stagger-item">{item}</li>}
    />
  )
}
```

```css
.stagger-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.stagger-enter-active {
  transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.stagger-move {
  transition: transform 300ms ease;
}
```

## Performance: Direct DOM vs Virtual DOM

| Aspect | Pyreon (Direct DOM) | Virtual DOM Frameworks |
|--------|--------------------|-----------------------|
| Initial render | Comparable | Comparable |
| Signal update | O(1) -- direct DOM mutation | O(n) -- full tree diff |
| Static content cost | Zero (no tracking) | Re-traversed on every render |
| Memory per component | Lower (no VNode tree retained) | Higher (VNode tree + fiber tree) |
| Template optimization | cloneNode (5-10x faster) | Not available |
| List reconciliation | LIS-based keyed diffing | Key-based reconciliation |
| Batch updates | Explicit `batch()` in event handlers | Automatic (scheduler) |

## Exports Summary

| Export | Description |
|--------|-------------|
| `mount` | Mount a VNode tree into a container |
| `render` | Alias for `mount` |
| `hydrateRoot` | Hydrate server-rendered HTML |
| `mountChild` | Mount a single child node (internal) |
| `createTemplate` | Create a template-cloning factory |
| `_tpl` | Compiler-emitted template instantiation |
| `_bindText` | Compiler-emitted text binding for simple signal identifiers. Falls back to `renderEffect` if the source lacks `.direct()` |
| `_bindDirect` | Compiler-emitted direct attribute binding. Falls back to `renderEffect` if the source lacks `.direct()` |
| `applyProp` | Apply a single prop to an element |
| `applyProps` | Apply all props to an element |
| `cx` | Compose class names from strings, arrays, objects (re-exported from `@pyreon/core`) |
| `sanitizeHtml` | Sanitize an HTML string |
| `setSanitizer` | Set a custom HTML sanitizer |
| `Transition` | CSS enter/leave animation component |
| `TransitionGroup` | Animated keyed list component |
| `KeepAlive` | Persistent component caching |
| `enableHydrationWarnings` | Enable hydration mismatch logging |
| `disableHydrationWarnings` | Disable hydration mismatch logging |

## Type Exports

| Type | Description |
|------|-------------|
| `SanitizeFn` | `(html: string) => string` |
| `TransitionProps` | Props for the Transition component |
| `TransitionGroupProps` | Props for the TransitionGroup component |
| `KeepAliveProps` | Props for the KeepAlive component |
| `DevtoolsComponentEntry` | DevTools component registration entry |
| `PyreonDevtools` | DevTools interface |

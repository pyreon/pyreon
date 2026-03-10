# @pyreon/runtime-dom

DOM renderer for Pyreon. Performs surgical signal-to-DOM updates with no virtual DOM diffing.

## Install

```bash
bun add @pyreon/runtime-dom
```

## Quick Start

```ts
import { mount } from "@pyreon/runtime-dom"
import { h } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"

const count = signal(0)

const App = () =>
  h("button", { onClick: () => count.update((n) => n + 1) }, () => `Clicks: ${count()}`)

const unmount = mount(h(App, null), document.getElementById("app")!)
```

## API

### Mounting

- **`mount(root, container): () => void`** -- Clears the container and mounts the VNode tree. Returns an `unmount` function.
- **`render`** -- Alias for `mount`.
- **`mountChild(child, parent, anchor)`** -- Low-level mount of a single child node.

### Hydration

- **`hydrateRoot(root, container)`** -- Hydrates server-rendered HTML with client-side reactivity.
- **`enableHydrationWarnings()` / `disableHydrationWarnings()`** -- Toggle console warnings for hydration mismatches.

### Props and Sanitization

- **`applyProp(el, key, value)`** -- Applies a single prop to a DOM element.
- **`applyProps(el, props)`** -- Applies all props to a DOM element.
- **`sanitizeHtml(html): string`** -- Sanitizes an HTML string using the active sanitizer.
- **`setSanitizer(fn: SanitizeFn)`** -- Replaces the default HTML sanitizer.

### Templates

- **`createTemplate(html): () => Element`** -- Creates a reusable DOM template factory from an HTML string.

### Transitions

- **`Transition`** -- Animates a single child on enter/leave with CSS classes or JS hooks.
- **`TransitionGroup`** -- Animates a list of keyed children, including move transitions.

### KeepAlive

- **`KeepAlive`** -- Caches inactive component subtrees instead of destroying them.

### Types

`TransitionProps`, `TransitionGroupProps`, `KeepAliveProps`, `Directive`, `SanitizeFn`, `DevtoolsComponentEntry`, `PyreonDevtools`

## License

MIT

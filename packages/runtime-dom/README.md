# @pyreon/runtime-dom

DOM renderer for Pyreon. Performs surgical signal-to-DOM updates with no virtual DOM diffing.

## Install

```bash
bun add @pyreon/runtime-dom
```

## Quick Start

```tsx
import { mount } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

const count = signal(0)

const App = () => (
  <button onClick={() => count.update((n) => n + 1)}>
    Clicks: {() => count()}
  </button>
)

const unmount = mount(<App />, document.getElementById("app")!)
```

## Transition Examples

Animate elements on enter and leave:

```tsx
import { Transition } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

const show = signal(true)

const App = () => (
  <div>
    <button onClick={() => show.set(!show())}>Toggle</button>
    <Transition name="fade">
      {() => show() && <p>Hello!</p>}
    </Transition>
  </div>
)
```

Animate keyed lists with move support:

```tsx
import { TransitionGroup } from "@pyreon/runtime-dom"
import { For } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"

const items = signal([1, 2, 3])

const List = () => (
  <TransitionGroup name="list">
    <For each={items} by={(n) => n}>
      {(item) => <div>{() => item()}</div>}
    </For>
  </TransitionGroup>
)
```

## KeepAlive Example

Cache inactive component subtrees instead of destroying them:

```tsx
import { KeepAlive } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

const tab = signal<"home" | "settings">("home")

const App = () => (
  <div>
    <button onClick={() => tab.set("home")}>Home</button>
    <button onClick={() => tab.set("settings")}>Settings</button>
    <KeepAlive>
      {() => tab() === "home" ? <Home /> : <Settings />}
    </KeepAlive>
  </div>
)
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

`TransitionProps`, `TransitionGroupProps`, `KeepAliveProps`, `SanitizeFn`, `DevtoolsComponentEntry`, `PyreonDevtools`

## License

MIT

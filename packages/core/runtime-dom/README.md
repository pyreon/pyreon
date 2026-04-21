# @pyreon/runtime-dom

DOM renderer for Pyreon. Performs surgical signal-to-DOM updates with no virtual DOM diffing.

## Install

```bash
bun add @pyreon/runtime-dom
```

## Quick Start

```tsx
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'

const count = signal(0)

const App = () => (
  <button onClick={() => count.update((n) => n + 1)}>Clicks: {() => count()}</button>
)

const unmount = mount(<App />, document.getElementById('app')!)
```

## Transition Examples

Animate elements on enter and leave:

```tsx
import { Transition } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'

const show = signal(true)

const App = () => (
  <div>
    <button onClick={() => show.set(!show())}>Toggle</button>
    <Transition name="fade">{() => show() && <p>Hello!</p>}</Transition>
  </div>
)
```

Animate keyed lists with move support:

```tsx
import { TransitionGroup } from '@pyreon/runtime-dom'
import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

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
import { KeepAlive } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'

const tab = signal<'home' | 'settings'>('home')

const App = () => (
  <div>
    <button onClick={() => tab.set('home')}>Home</button>
    <button onClick={() => tab.set('settings')}>Settings</button>
    <KeepAlive>{() => (tab() === 'home' ? <Home /> : <Settings />)}</KeepAlive>
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

- **`applyProp(el, key, value)`** -- Applies a single prop to a DOM element. The `class` prop accepts strings, arrays, objects, or nested mix (processed via `cx()` from `@pyreon/core`).
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

## Production Performance

The mount pipeline is optimized for zero unnecessary allocations:

- **Devtools gated on `__DEV__`** -- Component ID generation (`Math.random`), parent/child tracking (`_mountingStack`), and `registerComponent`/`unregisterComponent` are all behind `if (__DEV__)`. Vite tree-shakes the entire devtools module from production bundles.
- **Lazy LifecycleHooks** -- `mount`/`unmount`/`update`/`error` arrays start as `null`, allocated on first hook registration. Components with no hooks (80%+) skip all hook iteration.
- **Lazy mountCleanups** -- Only allocated when an `onMount` callback returns a cleanup function.
- **makeReactiveProps scan-first** -- Scans for `_rp()` brands before allocating the getter-backed object. Static-only components return `raw` immediately.
- **renderEffect first-run skip** -- Skips cleanup on first run since the deps array is empty.
- **Text .data no-op writes** -- `_bindText` and `_bindDirect` skip DOM writes when the value hasn't changed.

## Dev-mode warnings — bundler tree-shake

Dev warnings are gated on `import.meta.env?.DEV`. Tree-shake behavior depends on both the source pattern and the consumer bundler:

| Source pattern | Vite prod | Raw esbuild prod | Test |
| --- | --- | --- | --- |
| `if (!import.meta.env?.DEV) return` (inline early-return) | tree-shaken | tree-shaken | `flow/src/tests/integration.test.ts` (esbuild) |
| `const __DEV__ = ...; if (__DEV__) ...` | tree-shaken | mostly tree-shaken | `runtime-dom/src/tests/dev-gate-treeshake.test.ts` (Vite) |
| `const __DEV__ = ...; __DEV__ && cond && warn(...)` (chained &&) | tree-shaken | runtime-gated only | `runtime-dom/.../dev-gate-treeshake.test.ts` (Vite + non-Vite runtime smoke) |
| `typeof process !== 'undefined'` | dead in browser | dead in browser | `pyreon/no-process-dev-gate` lint rule |

Vite is Pyreon's primary supported bundler. Non-Vite consumers (webpack, bunchee, raw esbuild) using the chained `&&` form may retain warning strings as data, but the runtime gate evaluates to `false` when `import.meta.env.DEV` is undefined — warnings don't fire. Only a small bundle-size cost.

## License

MIT

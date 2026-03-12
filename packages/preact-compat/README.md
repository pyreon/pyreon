# @pyreon/preact-compat

Preact-compatible API shim that runs on Pyreon's signal-based reactive engine. Migrate Preact code by swapping the import path.

## Install

```bash
bun add @pyreon/preact-compat
```

## Quick Start

```ts
// Replace:
// import { h, render, useState } from "preact/compat"
// With:
import { h, render } from "@pyreon/preact-compat"
import { useState, useEffect } from "@pyreon/preact-compat/hooks"

function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    console.log("count changed:", count())
  })
  return h("button", { onClick: () => setCount((c) => c + 1) }, count)
}

render(h(Counter, null), document.getElementById("app")!)
```

## Key Differences from Preact

- **No hooks rules.** Call hooks anywhere -- in loops, conditions, nested functions.
- **Components run once** (setup phase only), not on every render.
- **`useEffect` deps are ignored.** Pyreon tracks reactive dependencies automatically. Pass `[]` to run once on mount.
- **`useCallback` and `memo` are no-ops.** No re-renders means no stale closures.

## Entry Points

### `@pyreon/preact-compat`

Core Preact API.

- **`h` / `createElement`** -- JSX factory.
- **`Fragment`** -- fragment component.
- **`render(vnode, container)`** -- mount a tree into a DOM element.
- **`hydrate(vnode, container)`** -- hydrate server-rendered HTML.
- **`createContext` / `useContext`** -- context API.
- **`createRef`** -- mutable ref container.
- **`Component`** -- class component base (lifecycle methods supported).
- **`cloneElement(vnode, props, ...children)`** -- clone with overrides.
- **`toChildArray(children)`** -- normalize children to a flat array.
- **`isValidElement(x)`** -- type guard for VNodes.

### `@pyreon/preact-compat/hooks`

Hooks API (mirrors `preact/hooks`).

- **`useState(initial)`** -- returns `[getter, setter]`. Call `getter()` to read.
- **`useReducer(reducer, initial)`** -- returns `[getter, dispatch]`.
- **`useEffect(fn, deps?)`** -- reactive effect. `[]` deps means mount-only.
- **`useLayoutEffect`** -- alias for `useEffect`.
- **`useMemo(fn, deps?)`** -- returns a computed getter. Deps are ignored.
- **`useCallback(fn, deps?)`** -- returns `fn` as-is (no-op).
- **`useRef(initial?)`** -- returns `{ current }`.
- **`useId()`** -- stable unique string per component instance.
- **`useErrorBoundary`** -- alias for `onErrorCaptured`.

### `@pyreon/preact-compat/signals`

Preact Signals API (mirrors `@preact/signals`).

- **`signal(initial)`** -- returns `{ value }` read/write accessor.
- **`computed(fn)`** -- returns `{ value }` read-only accessor.
- **`effect(fn)`** -- reactive side effect, returns dispose function.
- **`batch(fn)`** -- coalesce multiple signal writes.

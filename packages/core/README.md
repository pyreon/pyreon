# @pyreon/core

Core component model, VNode types, lifecycle hooks, and control-flow components for Pyreon.

## Install

```bash
bun add @pyreon/core
```

## Quick Start

```ts
import { h, Fragment, onMount, onUnmount, createContext, useContext } from "@pyreon/core"

function Counter() {
  onMount(() => {
    console.log("mounted")
    return undefined
  })

  return h("div", null, "Hello Pyreon")
}
```

## API

### VNode Creation

- **`h<P>(type, props, ...children): VNode`** -- Creates a virtual node. Accepts element tags, component functions, or Fragment.
- **`Fragment`** -- Groups children without adding a wrapper DOM element.
- **`EMPTY_PROPS`** -- Shared empty props object.

### Components

- **`defineComponent(fn)`** -- Wraps a function as a named component.
- **`runWithHooks(instance, fn)`** -- Executes a function within a component's hook context.
- **`propagateError(error, instance)`** -- Propagates an error up the component tree.
- **`dispatchToErrorBoundary(error, instance)`** -- Sends an error to the nearest ErrorBoundary.

### Lifecycle Hooks

- **`onMount(fn: () => CleanupFn | undefined)`** -- Runs after the component mounts. Return a cleanup function or `undefined`.
- **`onUnmount(fn)`** -- Runs when the component is removed.
- **`onUpdate(fn)`** -- Runs after each reactive update.
- **`onErrorCaptured(fn)`** -- Captures errors thrown by descendant components.

### Context

- **`createContext<T>(defaultValue?): Context<T>`** -- Creates a context with an optional default.
- **`useContext(ctx): T`** -- Reads the nearest provided context value.
- **`withContext(ctx, value, fn)`** -- Runs `fn` with the given context value.
- **`pushContext(map)` / `popContext()`** -- Low-level context stack manipulation.

### Refs

- **`createRef<T>(): Ref<T>`** -- Creates a mutable ref object.

### Control-Flow Components

- **`Show`** -- Conditionally renders children based on a `when` prop.
- **`Switch` / `Match`** -- Multi-branch conditional rendering.
- **`For`** -- Keyed list rendering with efficient reconciliation.
- **`Portal`** -- Renders children into a different DOM container.
- **`Suspense`** -- Shows fallback content while async children resolve.
- **`ErrorBoundary`** -- Catches errors in descendant components and renders a fallback.

### Utilities

- **`mapArray(source, mapFn)`** -- Reactively maps over an array source.
- **`registerErrorHandler(handler)` / `reportError(error, context)`** -- Global error telemetry.

### Types

`VNode`, `VNodeChild`, `VNodeChildAtom`, `Props`, `ComponentFn`, `ComponentInstance`, `LifecycleHooks`, `CleanupFn`, `NativeItem`, `Ref`, `Context`, `LazyComponent`, `ShowProps`, `SwitchProps`, `MatchProps`, `ForProps`, `PortalProps`, `ErrorContext`, `ErrorHandler`

## License

MIT

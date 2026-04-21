# @pyreon/core

Core component model, VNode types, lifecycle hooks, and control-flow components for Pyreon.

## Install

```bash
bun add @pyreon/core
```

## Quick Start

```tsx
import { onMount, onUnmount, createContext, useContext } from '@pyreon/core'

function Counter() {
  onMount(() => {
    console.log('mounted')
  })

  return <div>Hello Pyreon</div>
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

- **`onMount(fn: () => CleanupFn | void)`** -- Runs after the component mounts. Optionally return a cleanup function.
- **`onUnmount(fn)`** -- Runs when the component is removed.
- **`onUpdate(fn)`** -- Runs after each reactive update.
- **`onErrorCaptured(fn)`** -- Captures errors thrown by descendant components.

Lifecycle hook arrays are lazy-allocated -- `LifecycleHooks.mount`/`.unmount`/`.update`/`.error` start as `null` and are only allocated on first hook registration. Components with no hooks (the majority) pay zero allocation cost.

### Props Reactivity

- **`makeReactiveProps(raw)`** -- Converts compiler-emitted `_rp()` wrappers into getter properties. Uses a scan-first strategy: checks for any branded reactive prop before allocating the result object. Static-only components return `raw` immediately with no allocation.
- **`_rp(fn)`** -- Brands a function as a reactive prop wrapper (compiler-emitted, not user-facing).

### Context

- **`createContext<T>(defaultValue?): Context<T>`** -- Creates a context with an optional default.
- **`useContext(ctx): T`** -- Reads the nearest provided context value.
- **`provide(ctx, value)`** -- Provides a context value for the current component's subtree (auto-cleans up on unmount).
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

### Props Utilities

- **`splitProps(props, keys)`** -- Splits a props object into `[picked, rest]`, preserving signal reactivity.
- **`mergeProps(...sources)`** -- Merges multiple props objects; last source wins. Preserves reactivity.
- **`createUniqueId(): string`** -- Returns an SSR-safe unique ID (`"pyreon-1"`, `"pyreon-2"`, etc.).

### Class Utility

- **`cx(...values: ClassValue[]): string`** -- Combines class values (strings, arrays, objects, nested mix) into a single class string.

### Utilities

- **`mapArray(source, mapFn)`** -- Reactively maps over an array source.
- **`registerErrorHandler(handler)` / `reportError(error, context)`** -- Global error telemetry.

### Types

`VNode`, `VNodeChild`, `VNodeChildAtom`, `VNodeChildAccessor`, `Props`, `ComponentFn`, `ExtractProps`, `HigherOrderComponent`, `ComponentInstance`, `LifecycleHooks`, `CleanupFn`, `NativeItem`, `Ref`, `Context`, `LazyComponent`, `ShowProps`, `SwitchProps`, `MatchProps`, `ForProps`, `PortalProps`, `ErrorContext`, `ErrorHandler`, `ClassValue`, `TargetedEvent`, `PyreonHTMLAttributes`, `CSSProperties`, `StyleValue`, `CanvasAttributes`

**VNodeChild union ordering**: `VNodeChild = VNodeChildAccessor | VNodeChildAtom | VNodeChildAtom[]` — the accessor type is FIRST so TypeScript matches `{() => cond && <X />}` against the function arm without falling through to `VNodeChildAtom` and erroring on `false | VNode`.

## License

MIT

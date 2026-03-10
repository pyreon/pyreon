# @pyreon/model

Reactive models with signal-backed state, computed views, actions, patch tracking, snapshots, and middleware.

## Install

```bash
bun add @pyreon/model
```

## Quick Start

```ts
import { model } from "@pyreon/model"
import { computed } from "@pyreon/reactivity"

const Counter = model({
  state: { count: 0 },
  views: (self) => ({
    doubled: computed(() => self.count() * 2),
  }),
  actions: (self) => ({
    inc: () => self.count.update((c) => c + 1),
    reset: () => self.count.set(0),
  }),
})

const counter = Counter.create({ count: 5 })
counter.count()    // 5
counter.inc()
counter.doubled()  // 12
```

## API

### `model(config)`

Define a model with `state`, `views`, and `actions`. Returns a `ModelDefinition` with:

- **`.create(initial?)`** -- create an independent instance, optionally overriding default state.
- **`.asHook(id)`** -- return a singleton hook function (Zustand/Pinia style). Every call to the hook returns the same instance.

Each state key becomes a `Signal` on the instance. Views are computed signals. Actions are plain functions.

### `getSnapshot(instance)`

Serialize a model instance to a plain JS object. Nested model instances are recursively serialized.

```ts
getSnapshot(counter)  // { count: 6 }
```

### `applySnapshot(instance, snapshot)`

Restore state from a plain object. Writes are batched for a single reactive flush. Missing keys are left unchanged.

### `onPatch(instance, listener)`

Subscribe to state mutations as JSON patches. Returns an unsubscribe function.

```ts
const unsub = onPatch(counter, (patch) => {
  // { op: "replace", path: "/count", value: 6 }
})
```

### `addMiddleware(instance, middleware)`

Intercept every action call. Middlewares run in registration order. Returns an unsubscribe function.

```ts
const unsub = addMiddleware(counter, (call, next) => {
  console.log(`action: ${call.name}`)
  return next(call)
})
```

## Types

`ModelDefinition`, `ModelInstance`, `ModelSelf`, `StateShape`, `Snapshot`, `Patch`, `PatchListener`, `ActionCall`, `MiddlewareFn`

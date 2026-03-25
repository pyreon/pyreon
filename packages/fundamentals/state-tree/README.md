# @pyreon/state-tree

Structured reactive state trees with signal-backed models, computed views, actions, snapshots, JSON patches, and middleware.

## Install

```bash
bun add @pyreon/state-tree
```

## Quick Start

```ts
import { model, getSnapshot, onPatch } from "@pyreon/state-tree"
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

getSnapshot(counter)  // { count: 6 }
```

Models are defined once, then instantiated with `.create()` or used as singletons with `.asHook(id)`.

## API

### `model(config)`

Define a reactive model. Returns a `ModelDefinition` with `.create()` and `.asHook()`.

| Parameter | Type | Description |
| --- | --- | --- |
| `config.state` | `StateShape` | Plain object — each key becomes a `Signal<T>` on the instance |
| `config.views` | `(self) => Record<string, Computed>` | Factory returning computed signals for derived state |
| `config.actions` | `(self) => Record<string, Function>` | Factory returning functions that mutate state |

**Returns:** `ModelDefinition<TState, TActions, TViews>`

The `self` parameter in views and actions is strongly typed for state signals and loosely typed for actions/views to avoid circular type issues.

```ts
const Todo = model({
  state: { text: "", done: false },
  views: (self) => ({
    summary: computed(() => `${self.done() ? "[x]" : "[ ]"} ${self.text()}`),
  }),
  actions: (self) => ({
    toggle: () => self.done.update((d) => !d),
  }),
})
```

### `ModelDefinition.create(initial?)`

Create an independent model instance, optionally overriding default state values.

| Parameter | Type | Description |
| --- | --- | --- |
| `initial` | `Partial<Snapshot<TState>>` | Partial snapshot to override defaults |

**Returns:** `ModelInstance<TState, TActions, TViews>`

```ts
const todo = Todo.create({ text: "Buy milk" })
todo.text()  // "Buy milk"
todo.done()  // false (default)
```

### `ModelDefinition.asHook(id)`

Return a singleton hook function. Every call returns the same instance for the given ID.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique identifier for the singleton |

**Returns:** `() => ModelInstance<TState, TActions, TViews>`

```ts
const useCounter = Counter.asHook("app-counter")
const a = useCounter()
const b = useCounter()
// a === b (same instance)
```

### `getSnapshot(instance)`

Serialize a model instance to a plain JS object. Nested model instances are recursively serialized.

| Parameter | Type | Description |
| --- | --- | --- |
| `instance` | `object` | A model instance created via `.create()` or `.asHook()` |

**Returns:** `Snapshot<TState>`

```ts
getSnapshot(counter)  // { count: 6 }
```

### `applySnapshot(instance, snapshot)`

Restore state from a plain object. Writes are batched for a single reactive flush. Missing keys are left unchanged.

| Parameter | Type | Description |
| --- | --- | --- |
| `instance` | `object` | Target model instance |
| `snapshot` | `Partial<Snapshot<TState>>` | Partial or full snapshot to apply |

```ts
applySnapshot(counter, { count: 0 })
counter.count()  // 0
```

### `onPatch(instance, listener)`

Subscribe to state mutations as JSON patches. Returns an unsubscribe function.

| Parameter | Type | Description |
| --- | --- | --- |
| `instance` | `object` | Model instance to observe |
| `listener` | `PatchListener` | Callback receiving `Patch` objects |

**Returns:** `() => void` (unsubscribe)

```ts
const unsub = onPatch(counter, (patch) => {
  console.log(patch)  // { op: "replace", path: "/count", value: 7 }
})
counter.inc()
unsub()
```

### `applyPatch(instance, patch)`

Apply a JSON patch (or array of patches) to a model instance. Only `"replace"` operations are supported. Multiple patches are batched.

| Parameter | Type | Description |
| --- | --- | --- |
| `instance` | `object` | Target model instance |
| `patch` | `Patch \| Patch[]` | Single patch or array of patches |

```ts
applyPatch(counter, { op: "replace", path: "/count", value: 10 })

// Replay recorded patches (undo/redo, time-travel):
applyPatch(counter, [
  { op: "replace", path: "/count", value: 1 },
  { op: "replace", path: "/count", value: 2 },
])
```

### `addMiddleware(instance, middleware)`

Intercept every action call. Middlewares run in registration order. Call `next(call)` to continue the chain.

| Parameter | Type | Description |
| --- | --- | --- |
| `instance` | `object` | Model instance |
| `middleware` | `MiddlewareFn` | `(call, next) => unknown` |

**Returns:** `() => void` (unsubscribe)

```ts
const unsub = addMiddleware(counter, (call, next) => {
  console.log(`> ${call.name}(${call.args})`)
  const result = next(call)
  console.log(`< ${call.name}`)
  return result
})
```

### `resetHook(id)` / `resetAllHooks()`

Clear singleton instances created via `.asHook()`. Useful for testing and HMR.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | Hook ID to reset (for `resetHook`) |

```ts
resetHook("app-counter")  // Clear one hook
resetAllHooks()            // Clear all hooks
```

## Patterns

### Nested Models

Use `ModelDefinition` values in `state` to compose models. Snapshots and patches resolve nested paths automatically.

```ts
const Profile = model({ state: { name: "", age: 0 } })

const App = model({
  state: { title: "My App", profile: Profile },
})

const app = App.create({ title: "Hello", profile: { name: "Alice", age: 30 } })
getSnapshot(app)  // { title: "Hello", profile: { name: "Alice", age: 30 } }
```

### Time-Travel Debugging

Record patches and replay them to implement undo/redo.

```ts
const history: Patch[] = []
onPatch(counter, (p) => history.push(p))

counter.inc()
counter.inc()

applySnapshot(counter, { count: 0 })
applyPatch(counter, history)  // replays to count: 2
```

## Types

| Type | Description |
| --- | --- |
| `ModelDefinition` | Returned by `model()` — has `.create()` and `.asHook()` |
| `ModelInstance` | The instance type: state signals + actions + views |
| `ModelSelf` | The `self` type inside views/actions factories |
| `StateShape` | `Record<string, unknown>` — the state config shape |
| `Snapshot` | Recursive plain-object serialization of state |
| `Patch` | `{ op: "replace", path: string, value: unknown }` |
| `PatchListener` | `(patch: Patch) => void` |
| `ActionCall` | `{ name: string, args: unknown[], path: string }` |
| `MiddlewareFn` | `(call: ActionCall, next: (call: ActionCall) => unknown) => unknown` |

## Gotchas

- Only `"replace"` patches are supported — no `"add"` or `"remove"` operations.
- `applySnapshot` leaves missing keys unchanged; it does not delete extra state.
- `self` inside actions/views is loosely typed for non-state keys to prevent circular type resolution. Use explicit types if needed.
- Always call `resetAllHooks()` in test `afterEach` to prevent singleton leakage between tests.

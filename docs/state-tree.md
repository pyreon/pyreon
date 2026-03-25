# @pyreon/state-tree

Structured reactive models with signal-backed state, computed views, actions, JSON patch tracking, snapshots, and middleware.

## Installation

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
    inc: () => self.count.update(c => c + 1),
    reset: () => self.count.set(0),
  }),
})

const counter = Counter.create({ count: 5 })
counter.count()    // 5
counter.inc()
counter.doubled()  // 12
getSnapshot(counter) // { count: 6 }
```

## API

### `model(config)`

Define a model with state, views, and actions.

```ts
const Todo = model({
  state: { text: "", done: false },
  views: (self) => ({
    summary: computed(() => `${self.done() ? "✓" : "○"} ${self.text()}`),
  }),
  actions: (self) => ({
    toggle: () => self.done.update(d => !d),
    rename: (text: string) => self.text.set(text),
  }),
})
```

**Config:**

| Field | Type | Description |
| --- | --- | --- |
| `state` | `Record<string, unknown>` | Default values — each key becomes a `Signal` on instances |
| `views` | `(self) => Record<string, Computed>` | Optional. Computed signals derived from state |
| `actions` | `(self) => Record<string, Function>` | Optional. Functions that mutate state |

**Returns:** `ModelDefinition` with `.create()` and `.asHook()` methods.

The `self` parameter is a Proxy to the instance — actions can read signals and call other actions through it.

### `ModelDefinition.create(initial?)`

Create a new independent instance, optionally overriding default state:

```ts
const todo = Todo.create({ text: "Learn Pyreon", done: false })
const empty = Todo.create() // uses defaults
```

### `ModelDefinition.asHook(id)`

Create a singleton hook — same id always returns the same instance:

```ts
const useTodo = Todo.asHook("main-todo")
const a = useTodo()
const b = useTodo()
a === b // true
```

### `getSnapshot(instance)`

Serialize a model instance to a plain JS object. Nested models are recursively serialized.

```ts
const snap = getSnapshot(counter)
// { count: 6 }

const appSnap = getSnapshot(app)
// { profile: { name: "Alice", bio: "dev" }, title: "My App" }
```

### `applySnapshot(instance, snapshot)`

Restore state from a plain object. Writes are batched for a single reactive flush. Keys absent from the snapshot are left unchanged.

```ts
applySnapshot(counter, { count: 0 })
counter.count() // 0

// Partial — only updates specified keys
applySnapshot(profile, { name: "Bob" })
profile.bio() // unchanged
```

### `onPatch(instance, listener)`

Subscribe to state mutations as JSON patches. Returns an unsubscribe function.

```ts
const unsub = onPatch(counter, (patch) => {
  console.log(patch)
  // { op: "replace", path: "/count", value: 7 }
})

counter.inc()
unsub() // stop listening
```

Nested model mutations emit prefixed paths:

```ts
onPatch(app, (patch) => {
  // { op: "replace", path: "/profile/name", value: "Bob" }
})
app.profile().rename("Bob")
```

### `applyPatch(instance, patch)`

Apply a JSON patch (or array of patches) to a model instance. Only `"replace"` operations are supported (matching the patches emitted by `onPatch`). Multiple patches are batched into a single reactive flush.

```ts
applyPatch(counter, { op: "replace", path: "/count", value: 10 })

// Replay patches recorded from onPatch (undo/redo, time-travel)
applyPatch(counter, [
  { op: "replace", path: "/count", value: 1 },
  { op: "replace", path: "/count", value: 2 },
])
```

Paths use JSON pointer format: `"/count"` for top-level, `"/profile/name"` for nested models.

### `addMiddleware(instance, middleware)`

Intercept every action call. Middlewares run in registration order (Koa-style onion). Returns an unsubscribe function.

```ts
const unsub = addMiddleware(counter, (call, next) => {
  console.log(`> ${call.name}(${call.args})`)
  const result = next(call)
  console.log(`< ${call.name}`)
  return result
})

counter.inc()
// > inc()
// < inc
```

**ActionCall:**

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | Action name |
| `args` | `unknown[]` | Arguments passed to the action |
| `path` | `string` | JSON-pointer path, e.g. `"/inc"` |

Middleware can prevent actions from executing by not calling `next`:

```ts
addMiddleware(counter, (call, next) => {
  if (call.name === "reset") return // block reset
  return next(call)
})
```

### `resetHook(id)` / `resetAllHooks()`

Clear singleton instances created via `.asHook()`. Useful for tests and HMR.

```ts
resetHook("main-todo")   // clear one
resetAllHooks()           // clear all

afterEach(() => resetAllHooks())
```

## Nested Models

State fields can be `ModelDefinition` values — nested instances are created automatically:

```ts
const Profile = model({
  state: { name: "", bio: "" },
  actions: (self) => ({
    rename: (n: string) => self.name.set(n),
  }),
})

const App = model({
  state: { profile: Profile, title: "My App" },
  actions: (self) => ({
    setTitle: (t: string) => self.title.set(t),
  }),
})

const app = App.create({
  profile: { name: "Alice", bio: "dev" },
  title: "Hello",
})

app.profile().name()  // "Alice"
app.profile().rename("Bob")
```

Snapshots and patches work recursively:

```ts
getSnapshot(app)
// { profile: { name: "Bob", bio: "dev" }, title: "Hello" }

onPatch(app, console.log)
app.profile().rename("Carol")
// { op: "replace", path: "/profile/name", value: "Carol" }
```

## Types

| Type | Description |
| --- | --- |
| `ModelDefinition<TState, TActions, TViews>` | Model definition with `.create()` and `.asHook()` |
| `ModelInstance<TState, TActions, TViews>` | Instance type — state signals + actions + views |
| `ModelSelf<TState>` | The `self` type inside views/actions |
| `Snapshot<TState>` | Plain JS snapshot — recursively typed for nested models |
| `StateShape` | `Record<string, unknown>` |
| `Patch` | `{ op: "replace", path: string, value: unknown }` |
| `PatchListener` | `(patch: Patch) => void` |
| `ActionCall` | `{ name: string, args: unknown[], path: string }` |
| `MiddlewareFn` | `(call: ActionCall, next: (call: ActionCall) => unknown) => unknown` |

## Devtools

Import from `@pyreon/state-tree/devtools` for runtime inspection:

```ts
import {
  registerInstance,
  getActiveModels,
  getModelInstance,
  getModelSnapshot,
  onModelChange,
} from "@pyreon/state-tree/devtools"

registerInstance("counter", counter)   // Register a model instance for inspection
getActiveModels()                       // Map of all registered model instances
getModelInstance("counter")             // Get a specific instance
getModelSnapshot("counter")            // Get current snapshot of a registered model
onModelChange("counter", (snapshot) => {
  console.log("Model changed:", snapshot)
}) // Returns unsubscribe function
```

## Performance

- Patch emission is lazy — no allocation when no listeners are registered
- `applySnapshot` uses `batch()` to coalesce multiple signal writes into one reactive flush
- Instance metadata uses `WeakMap` — no memory leaks, garbage collected with instances
- Views are `computed` signals — only recompute when dependencies change

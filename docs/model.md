# Model

`@pyreon/model` provides reactive models with signal-backed state, computed views, actions, patch tracking, snapshots, and middleware. Think of it as a typed, reactive alternative to plain stores when you need structure and observability.

## Installation

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
    inc: () => self.count.update(c => c + 1),
    dec: () => self.count.update(c => c - 1),
    reset: () => self.count.set(0),
  }),
})

const counter = Counter.create({ count: 5 })
counter.count()    // 5
counter.inc()
counter.count()    // 6
counter.doubled()  // 12
```

## model(config)

Define a model with `state`, `views`, and `actions`:

```ts
const TodoItem = model({
  state: {
    text: "",
    done: false,
  },
  views: (self) => ({
    display: computed(() => self.done() ? `✓ ${self.text()}` : self.text()),
  }),
  actions: (self) => ({
    toggle: () => self.done.update(d => !d),
    rename: (text: string) => self.text.set(text),
  }),
})
```

### Config Shape

| Field | Type | Description |
| --- | --- | --- |
| `state` | `Record<string, T>` | Default values for each state key. Each becomes a `Signal<T>` on the instance. |
| `views` | `(self) => Record<string, Computed>` | Derived values as computed signals |
| `actions` | `(self) => Record<string, Function>` | Methods that modify state |

The `self` parameter is a live proxy — actions and views always see the fully-populated instance.

### create(initial?)

Create an independent instance, optionally overriding default state:

```ts
const todo = TodoItem.create({ text: "Buy milk" })
todo.text()  // "Buy milk"
todo.done()  // false (default)
```

### asHook(id)

Return a singleton hook function (Pinia-style). Every call returns the same instance:

```ts
const useTodoStore = TodoItem.asHook("todo-main")

// In any component:
const store = useTodoStore()
store.toggle()
```

## Nested Models

Models can nest other models as state fields:

```ts
const Address = model({
  state: { street: "", city: "", zip: "" },
  actions: (self) => ({
    update: (addr: Partial<{ street: string; city: string; zip: string }>) => {
      if (addr.street) self.street.set(addr.street)
      if (addr.city) self.city.set(addr.city)
      if (addr.zip) self.zip.set(addr.zip)
    },
  }),
})

const User = model({
  state: {
    name: "",
    address: Address,  // nested model definition
  },
  actions: (self) => ({
    setName: (name: string) => self.name.set(name),
  }),
})

const user = User.create({ name: "Alice", address: { city: "Portland" } })
user.address.city()  // "Portland"
```

Patches from nested models propagate upward with path prefixes.

## Snapshots

### getSnapshot(instance)

Serialize a model instance to a plain JS object:

```ts
import { getSnapshot } from "@pyreon/model"

const snap = getSnapshot(counter)  // { count: 6 }
```

Nested model instances are recursively serialized.

### applySnapshot(instance, snapshot)

Restore state from a plain object. Writes are batched for a single reactive flush:

```ts
import { applySnapshot } from "@pyreon/model"

applySnapshot(counter, { count: 0 })
```

Missing keys are left unchanged.

## Patch Tracking

Subscribe to state mutations as JSON-Patch-like operations:

```ts
import { onPatch } from "@pyreon/model"

const unsub = onPatch(counter, (patch) => {
  console.log(patch)
  // { op: "replace", path: "/count", value: 7 }
})

counter.inc()  // triggers patch listener

unsub()  // stop listening
```

Patches are only emitted when there are active listeners (zero overhead otherwise).

### Patch Shape

```ts
interface Patch {
  op: "replace"
  path: string   // JSON Pointer, e.g. "/count", "/address/city"
  value: unknown
}
```

## Middleware

Intercept every action call:

```ts
import { addMiddleware } from "@pyreon/model"

const unsub = addMiddleware(counter, (call, next) => {
  console.log(`[${call.name}]`, call.args)
  const result = next(call)
  console.log(`[${call.name}] done`)
  return result
})
```

Middlewares run in registration order. Each receives the action call and a `next` function to continue the chain.

### Use Cases

- Logging / telemetry
- Undo/redo (capture patches before and after)
- Validation (throw to reject an action)
- Optimistic updates (apply immediately, rollback on error)

## Gotchas

**State fields become signals.** You read them with `()` and write them with `.set()` or `.update()`.

**Actions are auto-wrapped.** The functions returned from `config.actions(self)` are wrapped with the middleware runner. You cannot call the raw function directly.

**Snapshots are shallow by default for primitives.** `getSnapshot` recursively serializes nested models but does not deep-clone plain objects stored as signal values.

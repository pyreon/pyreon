---
title: State Tree
description: MobX-State-Tree-inspired reactive models with snapshots, patches, and middleware.
---

`@pyreon/state-tree` provides structured, composable reactive models built on `@pyreon/reactivity` signals. Define models with typed state, computed views, and actions -- then observe changes via JSON patches and intercept actions with middleware.

<PackageBadge name="@pyreon/state-tree" href="/docs/state-tree" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/state-tree
```

```bash [bun]
bun add @pyreon/state-tree
```

```bash [pnpm]
pnpm add @pyreon/state-tree
```

```bash [yarn]
yarn add @pyreon/state-tree
```

:::

## Quick Start

`model()` returns a chainable builder. Add derived values with `.views(...)` and mutators with `.actions(...)`, then `.create(initial?)` to instantiate or `.asHook(id)` for a singleton.

```ts
import { model, getSnapshot, onPatch, addMiddleware } from '@pyreon/state-tree'

const Counter = model({ state: { count: 0 } })
  .views((self) => ({
    doubled: () => self.count() * 2,
  }))
  .actions((self) => ({
    increment: () => self.count.update((c) => c + 1),
    decrement: () => self.count.update((c) => c - 1),
    reset: () => self.count.set(0),
  }))

const counter = Counter.create({ count: 5 })
counter.increment()
counter.count() // 6
counter.doubled() // 12
getSnapshot(counter) // { count: 6 }
```

<Example file="./examples/state-tree/state-tree-history-undo" title="State tree — history & undo" />

## Defining a Model

`model()` carries one piece of state declaration — `state` (plain mode) OR `schema` (schema mode). Both modes return the same chainable `ModelDefinition`; `views` and `actions` are added exclusively via `.views(...)` / `.actions(...)`.

- **state** -- Plain JS object. Each key becomes a `Signal<T>` on the instance. Plain mode.
- **schema** -- A schema passed directly — `@pyreon/validate`'s `s.object(...)`, a raw `z.object(...)` / valibot / arktype (Standard Schema, auto-detected via `~standard`), or a `TypedSchemaAdapter` (`zodSchema(...)`, `valibotSchema(...)`, `arktypeSchema(...)`). Schema mode adds runtime validation, **strictly types the instance from the schema**, and installs five validated mutation helpers (`set` / `patch` / `deepPatch` / `update` / `reset`).
- **`.views(self => ...)`** -- Chainable. Each call adds a layer of derived values; subsequent layers see prior ones via `self`.
- **`.actions(self => ...)`** -- Chainable. Each call adds a layer of methods; can be `async` out of the box.

```ts
import { model } from '@pyreon/state-tree'
import { computed } from '@pyreon/reactivity'

const Counter = model({ state: { count: 0 } })
     .views((self) => ({
    doubled: computed(() => self.count() * 2),
  }))
     .actions((self) => ({
    increment: () => self.count.update((c) => c + 1),
    decrement: () => self.count.update((c) => c - 1),
    reset: () => self.count.set(0),
  }))
```

### State Field Types

State fields can hold any JavaScript value. Each field becomes a `Signal<T>` on the instance, providing `.set()`, `.update()`, and `.peek()` methods alongside the callable read interface.

```ts
const Settings = model({
  state: {
    // Primitives
    name: '',
    count: 0,
    enabled: true,
    // Objects and arrays
    tags: [] as string[],
    config: { theme: 'light', locale: 'en' } as { theme: string; locale: string },
    // Nullable values
    selectedId: null as string | null,
  },
})
  .actions((self) => ({
    setName: (name: string) => self.name.set(name),
    addTag: (tag: string) => self.tags.update((t) => [...t, tag]),
    toggleTheme: () =>
      self.config.update((c) => ({
        ...c,
        theme: c.theme === 'light' ? 'dark' : 'light',
      })),
    select: (id: string | null) => self.selectedId.set(id),
  }))
```

### Reading and Writing Signals

Every state field is a signal. Call it to read, use `.set()` for replacement, and `.update()` for transform-in-place. Use `.peek()` to read without subscribing to changes.

```ts
const counter = Counter.create({ count: 5 })

// Read (creates a reactive dependency)
counter.count() // 5

// Read without subscribing
counter.count.peek() // 5

// Replace value
counter.count.set(10)

// Transform current value
counter.count.update((c) => c + 1) // 11
```

### Models Without Views or Actions

Both `views` and `actions` are optional. A state-only model is valid:

```ts
const Config = model({
  state: { theme: 'light', locale: 'en' },
})

const config = Config.create()
config.theme() // "light"
config.theme.set('dark')
```

## Schema Mode

`model({ schema })` lets you define state with a validation schema. Field types are inferred end-to-end, and every `set` / `patch` is validated through the schema. Direct signal writes (`self.field.set(v)`) bypass validation by design — the documented escape hatch.

Schema mode accepts any of:

- **Pyreon adapters** — `zodSchema(...)`, `valibotSchema(...)`, `arktypeSchema(...)` (Tier A.1, brand: `_infer` + sync `parse`)
- **Standard Schema-compliant instances** — zod 3.24+, valibot 1.0+, arktype 2.0+, Effect Schema 0.66+, any future spec-compliant library (Tier A.2, auto-detected via the `~standard` property)
- **User-authored adapters** — any other library (yup, joi, ajv, runtypes, ...) wrapped in 5-10 lines (Tier B)

```ts
import { model } from '@pyreon/state-tree'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

const UserSchema = zodSchema(
  z.object({
    name: z.string().min(1),
    age: z.number().int().nonnegative(),
    prefs: z.object({ theme: z.enum(['light', 'dark']) }),
  }),
)

const User = model({
  schema: UserSchema,
  initial: { name: '', age: 0, prefs: { theme: 'light' } },
})
  .views((self) => ({
    greeting: () => `Hi, ${self.name()}`,
  }))
  .actions((self) => ({
    rename: (next: string) => self.patch({ name: next }),
  }))

const u = User.create({ name: 'Alice', age: 30, prefs: { theme: 'dark' } })
u.name()      // "Alice"
u.greeting()  // "Hi, Alice"
u.set({ name: 'Bob', age: 40, prefs: { theme: 'light' } })   // full replace, validated
u.patch({ age: 41 })                                          // shallow merge, validated
u.deepPatch({ prefs: { theme: 'dark' } })                     // recursive merge — keeps other prefs keys
u.update('age', n => (n as number) + 1)                       // transform one field, validated
u.name.set('')   // direct signal write — bypasses validation (escape hatch)
u.reset()       // restore parsed initial
```

**Standard Schema (Tier A.2)** — pass the raw schema, no adapter wrap needed. The
instance is **strictly typed from the schema** either way: `u.name()` is `string`,
`u.age()` is `number` — the field types flow through whether you use `@pyreon/validate`'s
native `s` ("our one"), a raw `z.object`, valibot, or arktype.

```ts
import { s } from '@pyreon/validate'

// @pyreon/validate — the native validator, passed directly:
const User = model({
  schema: s.object({ name: s.string(), age: s.number() }),
  initial: { name: 'Alice', age: 30 },
})
const u = User.create()
u.name()  // string  (strictly typed — not `unknown`)
u.age()   // number

// …or a raw zod schema (auto-detected via `~standard`), no zodSchema() wrapper:
const User2 = model({
  schema: z.object({ name: z.string(), age: z.number() }),
  initial: { name: 'Alice', age: 30 },
})
```

> The strict typing comes from reading the schema's `~standard.validate` output type
> (`InferSchemaState`), so it works even for validators (like `@pyreon/validate`) that
> don't populate the optional `~standard.types` slot. The `zodSchema(...)` /
> `valibotSchema(...)` / `arktypeSchema(...)` adapters still work (the `_infer` path)
> and are only needed when you want the adapter's async-validator interop.

### Mutation method comparison

Schema mode exposes five validated mutation methods. Pick by mutation shape:

| Method | Shape | Merge depth | Use when |
| --- | --- | --- | --- |
| `set(full)` | full state | n/a (replaces) | resetting to a known full shape |
| `patch(partial)` | top-level partial | shallow (depth-1) | replacing one or more top-level fields |
| `deepPatch(partial)` | recursive partial | deep (plain objects only) | updating nested fields without spreading the parent |
| `update(key, fn)` | one field | n/a (transformer-controlled) | array filter/append, object key edit, primitive math |
| `reset()` | (none) | n/a | restore the parsed-initial captured at `.create()` time |

All five validate the merged result against the schema and throw on failure (or invoke `onValidationError` if configured). Direct signal writes (`self.field.set(v)`) bypass validation by design — the documented escape hatch.

```ts
// Real-world mix:
u.patch({ name: 'Bob' })                          // simple top-level edit
u.deepPatch({ prefs: { theme: 'dark' } })         // density survives
u.update('items', items => items.filter(x => x.id !== id))  // array remove
u.update('items', items => [...items, newItem])             // array append
u.update('prefs', p => ({ ...p, theme: 'dark' }))           // alt to deepPatch
```

**Validation rules** mirror `@pyreon/store` schema mode exactly:

- All five `$*` methods validate every write. Invalid input throws (or invokes `onValidationError` if provided). State stays at its previous value on failure.
- Initial is validated once at `model({ schema, initial })` time. Invalid initial throws immediately. Schema defaults + transforms apply — the PARSED value is written to signals.
- Async validators are unsupported — schemas whose validator returns a Promise are rejected at definition time. Use `@pyreon/form` for async refinements.
- Schema field names cannot collide with `set` / `patch` / `deepPatch` / `update` / `reset` / `self` proxy keys — `model()` throws at construction with a clear message.
- `deepPatch` REPLACES arrays and class instances (Date, Map, Set) — only plain objects recurse.
- `update`'s key is constrained to `keyof TState & string` at the type level; the transformer signature is `(unknown) => unknown` (cast at call site for typed inference — a future refinement will narrow this automatically).

```ts
// Validation error handling — suppress throw, log instead
const User = model({
  schema: UserSchema,
  initial: { name: 'Alice', age: 30, prefs: { theme: 'light' } },
  onValidationError: (issues, op) => {
    toast.error(`${op}: ${issues.map((i) => i.message).join(', ')}`)
  },
})
```

## Chainable Views and Actions

Both `.views()` and `.actions()` are **chainable** — each call returns a NEW `ModelDefinition` with the new layer accumulated. Subsequent factory calls see every prior view + action via `self`. This mirrors MobX-State-Tree's `.views().actions()` shape.

```ts
const M = model({ state: { count: 0 } })
  .views((self) => ({
    doubled: () => self.count() * 2,
  }))
  .views((self) => ({
    // CHAINS — this factory sees `doubled` from the prior block via self.
    quadrupled: () => self.doubled() * 2,
  }))
  .actions((self) => ({
    inc: () => self.count.update((n) => n + 1),
  }))
  .actions((self) => ({
    // CHAINS — sees `inc` AND every accumulated view.
    twice: () => {
      self.inc()
      self.inc()
    },
    quadFromHere: () => self.quadrupled(),  // also sees views
  }))
```

**Order semantics**:

- Within a single `.views(...)` factory, the returned record's keys are installed at once (so two views in the same block can't reference each other via `self` at evaluation time — only at call time, via the live `self` proxy).
- Across the chain: `.views(...)` calls run before `.actions(...)` calls (every view is in place before any action factory evaluates). This means actions can always read view values, but views cannot read actions defined in earlier `.actions()` blocks.
- Subsequent `.views(...)` blocks always see prior views.
- Subsequent `.actions(...)` blocks always see prior actions + views.

**Builder immutability**: each chain method returns a NEW `ModelDefinition`; the prior one is unchanged. Safe to share builders across call sites.

## Creating Instances

Call `.create()` on a model definition to create an independent instance. Pass a partial snapshot to override defaults.

```ts
const counter = Counter.create()
counter.count() // 0

const counter2 = Counter.create({ count: 10 })
counter2.count() // 10
counter2.doubled() // 20

counter2.increment()
counter2.count() // 11
```

### Partial Initialization

When you pass a partial snapshot, only the specified keys are overridden. Unspecified keys use their default values from the model definition.

```ts
const NamedCounter = model({
  state: { count: 0, label: 'default' },
})

const c = NamedCounter.create({ count: 10 })
c.count() // 10
c.label() // "default" — not overridden
```

### Independent Instances

Each `.create()` call produces a fully independent instance. Mutations on one do not affect the other.

```ts
const a = Counter.create()
const b = Counter.create()

a.increment()
a.count() // 1
b.count() // 0  — independent
```

## Computed Views

Views are computed signals derived from state. They automatically recompute when their dependencies change and are fully reactive in effects and templates.

```ts
import { model } from '@pyreon/state-tree'
import { computed, effect } from '@pyreon/reactivity'

const Counter = model({ state: { count: 0 } })
     .views((self) => ({
    doubled: computed(() => self.count() * 2),
    isPositive: computed(() => self.count() > 0),
    label: computed(() => `Count is ${self.count()}`),
  }))
     .actions((self) => ({
    increment: () => self.count.update((c) => c + 1),
    decrement: () => self.count.update((c) => c - 1),
  }))

const counter = Counter.create({ count: 5 })
counter.doubled() // 10
counter.isPositive() // true
counter.label() // "Count is 5"

// Views are reactive — they update automatically
counter.increment()
counter.doubled() // 12
counter.label() // "Count is 6"
```

### Views in Effects

Views participate in the reactive graph. When used inside an `effect()`, the effect re-runs whenever the underlying state changes.

```ts
const counter = Counter.create()
const observed: boolean[] = []

effect(() => {
  observed.push(counter.isPositive())
})

counter.increment()
counter.decrement()
// observed: [false, true, false]
```

### Derived Views Across Multiple Fields

Views can depend on multiple state fields:

```ts
const CartItem = model({ state: { price: 0, quantity: 1, taxRate: 0.1 } })
     .views((self) => ({
    subtotal: computed(() => self.price() * self.quantity()),
    tax: computed(() => self.price() * self.quantity() * self.taxRate()),
    total: computed(() => {
      const sub = self.price() * self.quantity()
      return sub + sub * self.taxRate()
    }),
  }))
     .actions((self) => ({
    setPrice: (p: number) => self.price.set(p),
    setQuantity: (q: number) => self.quantity.set(q),
  }))

const item = CartItem.create({ price: 100, quantity: 3 })
item.subtotal() // 300
item.tax() // 30
item.total() // 330
```

## Actions

Actions are functions that mutate state. They are wrapped with the middleware runner, so every action invocation passes through any registered middleware.

### Sync Actions

```ts
const Todo = model({ state: { text: '', done: false } })
     .actions((self) => ({
    setText: (text: string) => self.text.set(text),
    toggle: () => self.done.update((d) => !d),
    complete: () => self.done.set(true),
  }))
```

### Actions With Arguments

Actions can accept any number of arguments:

```ts
const Counter = model({ state: { count: 0 } })
     .actions((self) => ({
    add: (n: number) => self.count.update((c) => c + n),
    addMultiple: (a: number, b: number) => self.count.update((c) => c + a + b),
  }))

const counter = Counter.create()
counter.add(5)
counter.count() // 5
counter.addMultiple(3, 7)
counter.count() // 15
```

### Actions Calling Other Actions

Actions can call other actions through `self`. The `self` proxy always reflects the final, fully-populated instance:

```ts
const Counter = model({ state: { x: 0 } })
     .actions((self) => ({
    doubleInc: () => {
      self.inc()
      self.inc()
    },
    inc: () => self.x.update((n: number) => n + 1),
  }))

const c = Counter.create()
c.doubleInc()
c.x() // 2
```

### Async Actions

Actions can be `async` out of the box — no `flow()` / `yield` wrapper needed (unlike MobX-State-Tree). The runtime detects Promise returns and propagates them verbatim through the middleware chain, so `await u.fetchUsers()` works end-to-end. Each signal write inside the async body is synchronous; subscribers and patch listeners fire at each `await` checkpoint.

```ts
const UserStore = model({
  state: {
    users: [] as User[],
    loading: false,
    error: null as string | null,
  },
})
  .actions((self) => ({
    async fetchUsers() {
      self.loading.set(true)
      self.error.set(null)
      try {
        const response = await fetch('/api/users')
        const data = await response.json()
        self.users.set(data)
      } catch (err) {
        self.error.set(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        self.loading.set(false)
      }
    },
  }))

const store = UserStore.create()
await store.fetchUsers()    // awaitable
```

**Middleware can observe async completion** by awaiting `next(call)`:

```ts
addMiddleware(store, async (call, next) => {
  const start = Date.now()
  try {
    const result = await (next(call) as Promise<unknown>)
    console.log(`${call.name} took ${Date.now() - start}ms`)
    return result
  } catch (err) {
    console.error(`${call.name} threw`, err)
    throw err
  }
})
```

Middleware that doesn't care about completion can stay sync — `next(call)` returns the Promise but the middleware doesn't have to await it. The runtime never forces awaiting.

**Schema mode + async**: `set` / `patch` are sync. Inside an async action you can call them between `await`s; each call validates at its own checkpoint. A rejected validation propagates through the action's Promise, and the pre-throw state survives (schema mode never half-writes).

```ts
const User = model({
  schema: zodSchema(z.object({ age: z.number().nonnegative() })),
  initial: { age: 0 },
})
  .actions((self) => ({
    async setAgeFromServer() {
      const r = await fetch('/api/age')
      const { age } = await r.json()
      self.patch({ age })  // throws if age < 0, leaving state intact
    },
  }))
```

## Nested Models (Composition)

Use a `ModelDefinition` as a state field value to compose models. Nested models are automatically instantiated and their patches propagate upward.

```ts
const Profile = model({ state: { name: '', email: '' } })
     .actions((self) => ({
    setName: (name: string) => self.name.set(name),
    setEmail: (email: string) => self.email.set(email),
  }))

const App = model({ state: { title: 'My App', profile: Profile, // nested model definition } })
     .actions((self) => ({
    setTitle: (title: string) => self.title.set(title),
  }))
```

### Creating Nested Instances

Pass nested snapshots as plain objects. The parent model automatically creates instances for nested model definitions.

```ts
const app = App.create({
  profile: { name: 'Alice', email: 'alice@example.com' },
})

// Access the nested instance via .peek() (it is stored in a signal)
app.profile.peek().name() // "Alice"
app.profile.peek().email() // "alice@example.com"
```

When no snapshot is provided for a nested model, its defaults are used:

```ts
const app = App.create()
app.profile.peek().name() // ""
app.title() // "My App"
```

### Nested Actions

Nested instances retain their own actions:

```ts
const app = App.create({ profile: { name: 'Alice', email: '' } })
app.profile.peek().setName('Bob')
app.profile.peek().name() // "Bob"
```

### Nested Snapshots and Patches

Nested models are fully integrated with the snapshot and patch systems. See [Snapshots](#snapshots) and [Patches](#patches) below.

## Singleton Hooks

Use `.asHook(id)` to get a Zustand/Pinia-style singleton hook. Every call returns the same instance, making it ideal for global stores.

```ts
const useCounter = Counter.asHook('app-counter')

// Anywhere in your app:
const store = useCounter()
store.increment()

// Same instance every time:
const same = useCounter()
same.count() // reflects the increment above
```

### Multiple Independent Hooks

Different IDs produce independent singletons:

```ts
const useCounterA = Counter.asHook('counter-a')
const useCounterB = Counter.asHook('counter-b')

useCounterA().increment()
useCounterA().count() // 1
useCounterB().count() // 0  — independent
```

### Resetting Hooks

Use `resetHook()` to destroy a specific singleton (the next call re-creates a fresh instance) or `resetAllHooks()` to clear all singletons at once.

```ts
import { resetHook, resetAllHooks } from '@pyreon/state-tree'

// Destroy a single hook singleton
resetHook('app-counter')

// Destroy all hook singletons (useful for tests / HMR)
resetAllHooks()
```

Resetting a non-existent hook ID is a silent no-op:

```ts
resetHook('no-such-hook') // no error
```

## Lifecycle & Cleanup

### `.lifecycle(self => ({ afterCreate, beforeDestroy }))`

Register instance lifecycle hooks. Chainable — the factory sees the fully-typed `self`.

- **`afterCreate`** runs once at the END of `.create()`, after every `.views()` / `.actions()` layer is merged, so `self` is the fully-built instance. For nested field-models it fires bottom-up (children before parents), like MST.
- **`beforeDestroy`** runs when you call `destroy(instance)`, before the instance is marked dead.

Only `afterCreate` / `beforeDestroy` are honored — any other key throws at `.create()` time (a typo guard).

```ts
const Clock = model({ state: { ms: 0 } })
  .actions((self) => ({ tick: () => self.ms.update((n) => n + 1) }))
  .lifecycle((self) => {
    // The factory runs once per instance, so a closure variable is a clean
    // home for transient handles like a timer id.
    let timer: ReturnType<typeof setInterval> | undefined
    return {
      afterCreate: () => {
        timer = setInterval(() => self.tick(), 1000)
      },
      beforeDestroy: () => clearInterval(timer),
    }
  })

const clock = Clock.create()
// ...later
destroy(clock) // runs beforeDestroy → clearInterval
```

### `destroy(instance)` / `isAlive(instance)`

`destroy` tears an instance down: runs its `beforeDestroy` handlers, **recursively destroys field-nested child models**, drops all subscriptions (patch listeners + middleware), and marks it dead. Idempotent. `isAlive` reports liveness.

```ts
import { destroy, isAlive } from '@pyreon/state-tree'

isAlive(clock) // true
destroy(clock)
isAlive(clock) // false
```

After `destroy`, **actions and the schema mutation helpers (`set` / `patch` / …) dev-warn and no-op** — a stale handler firing post-teardown is almost always a bug, so it's caught rather than silently mutating dead state. Use `isAlive` to guard deferred work that might land after teardown:

```ts
fetchUpdate().then((data) => {
  if (isAlive(model)) model.applyUpdate(data) // skip if torn down meanwhile
})
```

> **`destroy` is not `free()`.** Pyreon signals have no explicit per-signal dispose. `destroy` tears down *subscriptions* and runs your `beforeDestroy` cleanup (timers, listeners) and flips the liveness flag — the instance's signals are reclaimed by the garbage collector once you drop your references to it. Direct signal writes (`self.field.set(v)`) on a destroyed instance are **not** guarded (the same escape hatch as bypassing validation) — don't.

### `clone(instance)` / `getType(instance)`

`clone` makes an independent structural copy: it snapshots the instance's current state and creates a fresh instance from the same definition (own signals, listeners, middleware, lifecycle). In schema mode the snapshot is re-validated. `getType` returns the producing `ModelDefinition`.

```ts
import { clone, getType } from '@pyreon/state-tree'

const draft = clone(original) // edit draft freely; original is untouched
const Def = getType(original) // the ModelDefinition — create siblings from it
const sibling = Def?.create()
```

> Tree-traversal helpers (`getParent` / `getRoot` / `getPath`) and references / identifiers are a planned follow-up — field-nested-only tree helpers would silently fail on array/map-held children (the common composition shape), so they're deferred to a design that tracks assignment.

## Snapshots

Serialize and restore model instances as plain JS objects (no signals, no functions).

### `getSnapshot(instance)`

Recursively serialize a model instance to a plain object. Nested model instances are recursively serialized.

```ts
import { getSnapshot } from '@pyreon/state-tree'

const counter = Counter.create({ count: 5 })
counter.increment()

getSnapshot(counter) // { count: 6 }
```

The returned snapshot contains only plain values -- no signals, no functions:

```ts
const snap = getSnapshot(counter)
typeof snap.count // "number", not "function"
```

### Nested Snapshots

For nested models, `getSnapshot` recursively serializes all nested instances:

```ts
const app = App.create({ profile: { name: 'Alice' } })
getSnapshot(app)
// { title: "My App", profile: { name: "Alice", email: "" } }
```

### Snapshot Reflects Current State

Snapshots always reflect the latest state after mutations:

```ts
const counter = Counter.create()
counter.increment()
counter.increment()
counter.increment()
getSnapshot(counter) // { count: 3 }
```

### `applySnapshot(instance, snapshot)`

Restore a model instance from a plain-object snapshot. All signal writes are batched via `batch()` for a single reactive flush. Keys absent from the snapshot are left unchanged.

```ts
import { applySnapshot } from '@pyreon/state-tree'

applySnapshot(counter, { count: 0 })
counter.count() // 0
```

### Partial Snapshots

Only the keys present in the snapshot are updated. Other keys retain their current values.

```ts
const NamedCounter = model({ state: { count: 0, label: 'x' } })
const c = NamedCounter.create({ count: 5, label: 'hello' })

applySnapshot(c, { count: 99 })
c.count() // 99
c.label() // "hello" — unchanged
```

### Batched Updates

`applySnapshot` uses `batch()` internally. When updating multiple fields, effects that depend on any of those fields fire only once:

```ts
import { effect } from '@pyreon/reactivity'

const M = model({ state: { a: 0, b: 0 } })
const m = M.create()

let effectRuns = 0
effect(() => {
  m.a()
  m.b()
  effectRuns++
})
effectRuns = 0 // reset after initial run

applySnapshot(m, { a: 1, b: 2 })
// effectRuns === 1  (not 2)
```

### Nested applySnapshot

`applySnapshot` recurses into nested model instances:

```ts
const app = App.create({ profile: { name: 'Alice', email: '' }, title: 'old' })

applySnapshot(app, { profile: { name: 'Carol', email: 'carol@test.com' }, title: 'new' })
app.profile.peek().name() // "Carol"
app.profile.peek().email() // "carol@test.com"
app.title() // "new"
```

### Snapshot Serialization for Persistence

Combine `getSnapshot` and `applySnapshot` for persistence:

```ts
const TodoList = model({ state: { items: [] as Array<{ text: string; done: boolean }>, filter: 'all' as 'all' | 'active' | 'done', } })
     .actions((self) => ({
    addItem: (text: string) => self.items.update((i) => [...i, { text, done: false }]),
    toggleItem: (idx: number) =>
      self.items.update((i) =>
        i.map((item, i2) => (i2 === idx ? { ...item, done: !item.done } : item)),
      ),
    setFilter: (f: 'all' | 'active' | 'done') => self.filter.set(f),
  }))

// Save to localStorage
function save(store: ReturnType<typeof TodoList.create>) {
  const snapshot = getSnapshot(store)
  localStorage.setItem('todos', JSON.stringify(snapshot))
}

// Restore from localStorage
function restore(store: ReturnType<typeof TodoList.create>) {
  const raw = localStorage.getItem('todos')
  if (raw) {
    applySnapshot(store, JSON.parse(raw))
  }
}
```

### Error Handling

Both `getSnapshot` and `applySnapshot` throw if called on a non-model-instance:

```ts
getSnapshot({}) // throws: "[@pyreon/state-tree] getSnapshot: not a model instance"
applySnapshot({}, {}) // throws: "[@pyreon/state-tree] applySnapshot: not a model instance"
```

## Patches

Subscribe to every state mutation as a JSON patch (RFC 6902 `replace` operations).

### `onPatch(instance, listener)`

Returns an unsubscribe function. The listener receives a `Patch` object for every state mutation.

```ts
import { onPatch } from '@pyreon/state-tree'

const unsub = onPatch(counter, (patch) => {
  console.log(patch)
  // { op: "replace", path: "/count", value: 6 }
})

counter.increment()

unsub() // stop listening
```

### Patch Values

Patch values are always the new value after the mutation. For primitive state fields, the value is the primitive. For nested model instances, the value is a plain snapshot of the nested instance.

```ts
const counter = Counter.create()
const values: number[] = []

onPatch(counter, (p) => values.push(p.value as number))

counter.add(3)
counter.add(7)
// values: [3, 10]
```

### No Patch for Unchanged Values

If a `.set()` call writes the same value (determined by `Object.is`), no patch is emitted:

```ts
const counter = Counter.create()
const patches: Patch[] = []
onPatch(counter, (p) => patches.push(p))

counter.count.set(0) // same as default
// patches: [] — empty, no change detected
```

### Nested Model Patches

Mutations in nested model instances propagate upward with prefixed paths:

```ts
const app = App.create({ profile: { name: 'Alice', email: '' } })

onPatch(app, (patch) => {
  console.log(patch)
  // { op: "replace", path: "/profile/name", value: "Bob" }
})

app.profile.peek().setName('Bob')
```

### Unsubscribing

The function returned by `onPatch` removes the listener. After unsubscribing, no further patches are delivered:

```ts
const counter = Counter.create()
const patches: Patch[] = []
const unsub = onPatch(counter, (p) => patches.push(p))

unsub()
counter.increment()
// patches: [] — listener was removed
```

### `applyPatch` -- Apply JSON patches to a model instance

```ts
import { applyPatch } from '@pyreon/state-tree'

// Apply a single patch
applyPatch(counter, { op: 'replace', path: '/count', value: 10 })

// Apply multiple patches at once (batched)
applyPatch(counter, [
  { op: 'replace', path: '/count', value: 1 },
  { op: 'replace', path: '/count', value: 2 },
])

// Nested model patches use JSON pointer paths
applyPatch(user, { op: 'replace', path: '/profile/name', value: 'Alice' })
```

Only `"replace"` operations are supported (matching the patches emitted by `onPatch`). Paths use JSON pointer format: `"/count"` for top-level properties, `"/profile/name"` for nested model instances.

**Use cases:**

- **Undo/redo** -- replay recorded patches
- **Time-travel debugging** -- apply saved patch sequences
- **Remote sync** -- apply patches received from a server

### Combined Example: Undo/Redo with `onPatch` and `applyPatch`

```ts
const history: Patch[][] = []
let current: Patch[] = []

onPatch(root, (patch) => {
  current.push(patch)
})

function commit() {
  if (current.length > 0) {
    history.push(current)
    current = []
  }
}

function undo() {
  const last = history.pop()
  if (last) {
    // Apply inverse patches (restore previous values)
    applyPatch(root, last.map(p => ({
      ...p,
      value: /* previous value from snapshot */
    })))
  }
}
```

### Real-World: Syncing Patches to a Server

```ts
const store = TodoList.create()

onPatch(store, (patch) => {
  // Send each mutation to a server for real-time sync
  websocket.send(
    JSON.stringify({
      type: 'PATCH',
      payload: patch,
    }),
  )
})
```

### Real-World: Undo/Redo with Patches

```ts
import { onPatch, applySnapshot, getSnapshot, type Patch } from '@pyreon/state-tree'

function withUndoRedo<T extends object>(instance: T) {
  const history: Array<Record<string, unknown>> = [getSnapshot(instance)]
  let index = 0

  onPatch(instance, () => {
    // Trim any forward history after an undo
    history.length = index + 1
    history.push(getSnapshot(instance))
    index++
  })

  return {
    undo: () => {
      if (index > 0) {
        index--
        applySnapshot(instance, history[index]!)
      }
    },
    redo: () => {
      if (index < history.length - 1) {
        index++
        applySnapshot(instance, history[index]!)
      }
    },
    canUndo: () => index > 0,
    canRedo: () => index < history.length - 1,
  }
}

// Usage
const counter = Counter.create()
const { undo, redo, canUndo, canRedo } = withUndoRedo(counter)

counter.increment() // count: 1
counter.increment() // count: 2
counter.increment() // count: 3

undo()
counter.count() // 2

undo()
counter.count() // 1

redo()
counter.count() // 2
```

### Patch Type

```ts
interface Patch {
  op: 'replace'
  path: string // JSON pointer, e.g. "/count" or "/profile/name"
  value: unknown
}
```

## Middleware

Intercept every action call on an instance. Middlewares run in registration order. Call `next(call)` to continue the chain. If a middleware does not call `next()`, the action is blocked.

### `addMiddleware(instance, middleware)`

Returns an unsubscribe function.

```ts
import { addMiddleware } from '@pyreon/state-tree'

const unsub = addMiddleware(counter, (call, next) => {
  console.log(`> ${call.name}(${JSON.stringify(call.args)})`)
  const result = next(call)
  console.log(`< ${call.name}`)
  return result
})

counter.increment()
// > increment([])
// < increment

unsub()
```

### Middleware Execution Order

Multiple middlewares run in registration order, forming a Koa-style onion model. The first registered middleware is the outermost layer:

```ts
const counter = Counter.create()
const log: string[] = []

addMiddleware(counter, (call, next) => {
  log.push('A-before')
  next(call)
  log.push('A-after')
})

addMiddleware(counter, (call, next) => {
  log.push('B-before')
  next(call)
  log.push('B-after')
})

counter.increment()
// log: ["A-before", "B-before", "B-after", "A-after"]
```

### Blocking Actions

If a middleware does not call `next()`, the action never executes:

```ts
const counter = Counter.create()

addMiddleware(counter, (_call, _next) => {
  // Don't call next — action is blocked
})

counter.increment()
counter.count() // 0 — action was prevented
```

### Conditional Blocking

Block specific actions or based on conditions:

```ts
addMiddleware(counter, (call, next) => {
  // Only allow increment if count is below 10
  if (call.name === 'increment' && counter.count.peek() >= 10) {
    console.warn('Max count reached!')
    return
  }
  return next(call)
})
```

### Logging Middleware

```ts
function createLogger(prefix: string) {
  return (call: ActionCall, next: (call: ActionCall) => unknown) => {
    const start = performance.now()
    console.log(`[${prefix}] ${call.name}(${JSON.stringify(call.args)})`)
    const result = next(call)
    const ms = (performance.now() - start).toFixed(2)
    console.log(`[${prefix}] ${call.name} completed in ${ms}ms`)
    return result
  }
}

addMiddleware(counter, createLogger('Counter'))
```

### Persistence Middleware

Auto-save to localStorage after every action:

```ts
function createPersistenceMiddleware(key: string, root: Instance) {
  return (call: ActionCall, next: (call: ActionCall) => unknown) => {
    const result = next(call)
    // Save snapshot after every action
    const snapshot = getSnapshot(root)
    localStorage.setItem(key, JSON.stringify(snapshot))
    return result
  }
}
```

### Removing Middleware

The returned unsubscribe function removes the middleware:

```ts
const unsub = addMiddleware(counter, (call, next) => {
  console.log(call.name)
  return next(call)
})

unsub()
counter.increment() // no log output — middleware removed
```

### ActionCall Type

```ts
interface ActionCall {
  name: string // Action name, e.g. "increment"
  args: unknown[] // Arguments passed to the action
  path: string // JSON-pointer-style path, e.g. "/increment"
}
```

### MiddlewareFn Type

```ts
type MiddlewareFn = (call: ActionCall, next: (call: ActionCall) => unknown) => unknown
```

## Testing Models

Models are plain objects with signals and functions, making them straightforward to test.

### Basic Unit Tests

```ts
import { model, getSnapshot, applySnapshot, onPatch } from '@pyreon/state-tree'
import { computed } from '@pyreon/reactivity'

const Counter = model({ state: { count: 0 } })
     .views((self) => ({
    doubled: computed(() => self.count() * 2),
  }))
     .actions((self) => ({
    inc: () => self.count.update((c) => c + 1),
    add: (n: number) => self.count.update((c) => c + n),
    reset: () => self.count.set(0),
  }))

describe('Counter', () => {
  it('creates with default state', () => {
    const counter = Counter.create()
    expect(counter.count()).toBe(0)
  })

  it('creates with initial state', () => {
    const counter = Counter.create({ count: 42 })
    expect(counter.count()).toBe(42)
  })

  it('actions update state', () => {
    const counter = Counter.create()
    counter.inc()
    expect(counter.count()).toBe(1)
  })

  it('views recompute when state changes', () => {
    const counter = Counter.create({ count: 3 })
    expect(counter.doubled()).toBe(6)
    counter.inc()
    expect(counter.doubled()).toBe(8)
  })

  it('snapshot serializes correctly', () => {
    const counter = Counter.create({ count: 7 })
    expect(getSnapshot(counter)).toEqual({ count: 7 })
  })

  it('emits patches on mutation', () => {
    const counter = Counter.create()
    const patches: any[] = []
    onPatch(counter, (p) => patches.push(p))

    counter.add(5)
    expect(patches).toEqual([{ op: 'replace', path: '/count', value: 5 }])
  })
})
```

### Testing Hooks

Use `resetAllHooks()` in test teardown to ensure clean state between tests:

```ts
import { resetAllHooks } from '@pyreon/state-tree'

afterEach(() => {
  resetAllHooks()
})

it('hook returns singleton', () => {
  const useCounter = Counter.asHook('test-counter')
  const a = useCounter()
  const b = useCounter()
  expect(a).toBe(b) // same instance
})

it('hook is fresh after reset', () => {
  const useCounter = Counter.asHook('test-counter')
  useCounter().add(10)
  expect(useCounter().count()).toBe(10)

  resetAllHooks()
  expect(useCounter().count()).toBe(0) // fresh instance
})
```

## Real-World Example: Todo App with Undo/Redo

A complete todo application demonstrating nested models, snapshots, patches, and middleware.

```ts
import { model, getSnapshot, applySnapshot, onPatch, addMiddleware } from '@pyreon/state-tree'
import { computed } from '@pyreon/reactivity'

// ---- Todo Item Model ----
const TodoItem = model({ state: { id: '', text: '', done: false, } })
     .actions((self) => ({
    toggle: () => self.done.update((d) => !d),
    setText: (text: string) => self.text.set(text),
  }))

// ---- Todo List Model ----
const TodoList = model({ state: { items: [] as Array<{ id: string; text: string; done: boolean }>, filter: 'all' as 'all' | 'active' | 'done', nextId: 1, } })
     .views((self) => ({
    filteredItems: computed(() => {
      const items = self.items()
      const filter = self.filter()
      switch (filter) {
        case 'active':
          return items.filter((i) => !i.done)
        case 'done':
          return items.filter((i) => i.done)
        default:
          return items
      }
    }),
    activeCount: computed(() => self.items().filter((i) => !i.done).length),
    doneCount: computed(() => self.items().filter((i) => i.done).length),
    totalCount: computed(() => self.items().length),
  }))
     .actions((self) => ({
    addItem: (text: string) => {
      const id = `todo-${self.nextId.peek()}`
      self.nextId.update((n) => n + 1)
      self.items.update((items) => [...items, { id, text, done: false }])
    },
    removeItem: (id: string) => {
      self.items.update((items) => items.filter((i) => i.id !== id))
    },
    toggleItem: (id: string) => {
      self.items.update((items) => items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
    },
    clearDone: () => {
      self.items.update((items) => items.filter((i) => !i.done))
    },
    setFilter: (filter: 'all' | 'active' | 'done') => {
      self.filter.set(filter)
    },
  }))

// ---- Undo/redo manager ----
const todos = TodoList.create()

const snapshots: Array<Record<string, unknown>> = [getSnapshot(todos)]
let historyIndex = 0

onPatch(todos, () => {
  snapshots.length = historyIndex + 1
  snapshots.push(getSnapshot(todos))
  historyIndex++
})

function undo() {
  if (historyIndex > 0) {
    historyIndex--
    applySnapshot(todos, snapshots[historyIndex]!)
  }
}

function redo() {
  if (historyIndex < snapshots.length - 1) {
    historyIndex++
    applySnapshot(todos, snapshots[historyIndex]!)
  }
}

// ---- Logging middleware ----
addMiddleware(todos, (call, next) => {
  console.log(`[TodoList] ${call.name}(${JSON.stringify(call.args)})`)
  return next(call)
})

// ---- Usage ----
todos.addItem('Buy groceries')
todos.addItem('Write docs')
todos.addItem('Review PR')

todos.toggleItem('todo-1')
todos.activeCount() // 2
todos.doneCount() // 1

todos.setFilter('active')
todos.filteredItems() // only undone items

undo() // un-sets the filter
undo() // un-toggles todo-1
redo() // re-toggles todo-1
```

## TypeScript Inference Patterns

### Inferring Instance Types

Use `ReturnType` on `.create()` to extract the instance type:

```ts
const Counter = model({ state: { count: 0 } })
     .views((self) => ({
    doubled: computed(() => self.count() * 2),
  }))
     .actions((self) => ({
    inc: () => self.count.update((c) => c + 1),
  }))

type CounterInstance = ReturnType<typeof Counter.create>
// CounterInstance has:
//   count: Signal<number>
//   doubled: Computed<number>
//   inc: () => void
```

### Typed Snapshot

The `Snapshot<TState>` type recursively strips signals and model instances:

```ts
import type { Snapshot } from '@pyreon/state-tree'

// For a model with state { count: number, label: string }:
// Snapshot is { count: number, label: string }

// For nested models:
// Snapshot recursively resolves nested model state
```

### Typing Actions in Self

Inside `actions` and `views`, `self` is typed with `StateSignals<TState>` for state fields and `Record<string, any>` for actions/views. This avoids circular type issues when actions call each other:

```ts
const M = model({ state: { x: 0 } })
     .actions((self) => ({
    doubleInc: () => {
      // self.inc is typed as `any` (avoids circular reference)
      // but works correctly at runtime
      self.inc()
      self.inc()
    },
    inc: () => self.x.update((n: number) => n + 1),
  }))
```

## API Reference

### `model(config)`

Define a reactive model.

- **`config.state`** -- Default state values. Use `ModelDefinition` values for nested composition.
- **`config.views`** (`(self) => TViews`) -- Optional. Factory returning computed signals.
- **`config.actions`** (`(self) => TActions`) -- Optional. Factory returning action functions.
- **Returns** `ModelDefinition` with `.create()` and `.asHook()` methods.

### `ModelDefinition.create(initial?)`

Create a new independent model instance. Pass a partial snapshot to override defaults.

### `ModelDefinition.asHook(id)`

Returns a hook function that always returns the same singleton instance for the given ID.

### `getSnapshot(instance)`

Serialize a model instance to a plain object. Nested models are recursively serialized. Throws if the argument is not a model instance.

### `applySnapshot(instance, snapshot)`

Restore a model instance from a snapshot. Batched for a single reactive flush. Keys absent from the snapshot are left unchanged. Throws if the argument is not a model instance.

### `onPatch(instance, listener)`

Subscribe to state mutations as JSON patches. Returns an unsubscribe function. Throws if the argument is not a model instance.

### `applyPatch(instance, patch)`

Apply one or more JSON patches to a model instance. Accepts a single `Patch` or an array of `Patch` objects (batched). Only `"replace"` operations are supported. Paths use JSON pointer format. Throws if the argument is not a model instance.

### `addMiddleware(instance, middleware)`

Intercept action calls. Returns an unsubscribe function. Throws if the argument is not a model instance.

### `resetHook(id)`

Destroy a hook singleton by ID. No-op if the ID does not exist.

### `resetAllHooks()`

Destroy all hook singletons.

## Type Exports

| Type              | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `ModelDefinition` | The class returned by `model()`                                   |
| `ModelInstance`   | The instance type returned by `.create()` and hooks               |
| `ModelSelf`       | The `self` type inside actions and views                          |
| `StateShape`      | Constraint for state objects (`Record<string, unknown>`)          |
| `Snapshot`        | Plain JS snapshot type (no signals, no model instances)           |
| `Patch`           | JSON patch object (`&#123; op: 'replace', path, value &#125;`)    |
| `PatchListener`   | Callback for `onPatch`: `(patch: Patch) => void`                  |
| `ActionCall`      | Descriptor passed to middleware: `&#123; name, args, path &#125;` |
| `MiddlewareFn`    | Middleware function signature: `(call, next) => unknown`          |

## Error Handling

All public functions that accept a model instance (`getSnapshot`, `applySnapshot`, `onPatch`, `applyPatch`, `addMiddleware`) validate their input and throw a descriptive error if called on a non-model-instance:

```ts
getSnapshot({}) // Error: [@pyreon/state-tree] getSnapshot: not a model instance
applySnapshot({}, {}) // Error: [@pyreon/state-tree] applySnapshot: not a model instance
onPatch({}, () => {}) // Error: [@pyreon/state-tree] onPatch: not a model instance
applyPatch({}, {}) // Error: [@pyreon/state-tree] applyPatch: not a model instance
addMiddleware({}, fn) // Error: [@pyreon/state-tree] addMiddleware: not a model instance
```

## Internals

### Instance Metadata

Each model instance has internal metadata tracked via a `WeakMap`. This metadata stores:

- `stateKeys` -- the list of state field names
- `patchListeners` -- set of registered patch listeners
- `middlewares` -- array of registered middleware functions
- `emitPatch()` -- internal function to emit patches (skips iteration when no listeners exist)

### Self Proxy

The `self` parameter in `views` and `actions` is a `Proxy` over the instance object. This ensures that when an action references another action via `self`, it always gets the final wrapped version (with middleware), even though actions are defined in a single factory call.

### Tracked Signals

State signals are wrapped in a `trackedSignal()` that intercepts `.set()` and `.update()` calls to emit patches. Reads are pass-through with zero overhead. When no patch listeners are registered, patch object allocation is skipped entirely for performance.

---
title: "State Tree — API Reference"
description: "Structured reactive state tree — composable models with snapshots, patches, and middleware"
---

# @pyreon/state-tree — API Reference

> **Generated** from `state-tree`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [state-tree](/docs/state-tree).

MobX-State-Tree-inspired structured state management built on Pyreon signals. Models compose state (signals), views (computeds), and actions into self-contained units that support typed snapshots, JSON-patch record/replay, and action interception middleware. Models can nest other models for tree-shaped state, and `.asHook(id)` provides singleton instances scoped to a store-like registry.

## Features

- model(&#123; state &#125;) or model(&#123; schema &#125;) — chainable builder
- .views(self =&gt; ...) — chainable derived values; each layer sees prior ones
- .actions(self =&gt; ...) — chainable mutators; async out of the box
- .lifecycle(self =&gt; (&#123; afterCreate, beforeDestroy &#125;)) — instance lifecycle hooks
- .volatile(self =&gt; (&#123;...&#125;)) — signal-backed transient state; reactive but excluded from snapshots/patches
- destroy(instance) / isAlive(instance) — tear down (recurses field-nested children) + liveness; actions no-op after destroy
- clone(instance) / getType(instance) — independent structural copy + definition back-ref
- onSnapshot(instance, cb) — microtask-coalesced snapshot subscription; onAction(instance, cb) — observe action calls
- getParent / getRoot / getPath / isRoot / hasParent — tree traversal (parent tracked for field AND array/map children)
- identifier() / reference(Type) / resolveIdentifier — normalized references that resolve by id to the live node
- Schema mode validates + STRICTLY TYPES state from a schema passed directly — @pyreon/validate, raw zod / valibot / arktype, any Standard Schema (no adapter wrapper)
- Nested model composition for tree-shaped state
- getSnapshot / applySnapshot — typed recursive serialization
- onPatch / applyPatch — JSON patch record and replay
- addMiddleware — action interception chain (sync + async)
- .create(initial) for instances, .asHook(id) for singleton hooks
- Devtools subpath export with WeakRef-based registry

## Complete example

A full, end-to-end usage of the package:

```tsx
import { model, getSnapshot, applySnapshot, onPatch, applyPatch, addMiddleware } from '@pyreon/state-tree'

// Define a model — chainable: state, then .views(), then .actions():
const Todo = model({ state: { title: '', done: false } })
  .views((self) => ({
    summary: () => `${self.title()} [${self.done() ? 'x' : ' '}]`,
  }))
  .actions((self) => ({
    toggle: () => self.done.set(!self.done()),
    rename: (title: string) => self.title.set(title),
  }))

const TodoList = model({ state: { todos: [] as ReturnType<typeof Todo.create>[] } })
  .actions((self) => ({
    add: (title: string) => {
      const todo = Todo.create({ title, done: false })
      self.todos.update(list => [...list, todo])
    },
  }))

// Create instances:
const list = TodoList.create({ todos: [] })
list.add('Write tests')
list.todos()[0].toggle()

// Snapshots — typed recursive serialization:
const snap = getSnapshot(list)
applySnapshot(list, { todos: [{ title: 'Restored', done: true }] })

// JSON patches — record/replay for undo, sync, debugging:
const patches: Patch[] = []
const dispose = onPatch(list, (patch) => patches.push(patch))
list.add('New item')
// Later: applyPatch(list, patches[0]) to replay

// Middleware — intercept any action in the tree:
addMiddleware(list, (call, next) => {
  console.log(`Action: ${call.name}`, call.args)
  return next(call)
})

// Singleton hook for app-wide state:
const useTodoList = TodoList.asHook('todo-list')
const { store } = useTodoList() // same instance on every call
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`model`](#model) | function | Define a reactive model via a chainable builder. |
| [`SchemaModelHelpers`](#schemamodelhelpers) | type | The five schema-validated mutation helpers exposed on every schema-mode model instance AND on `self` inside schema-mode  |
| [`DeepPartial`](#deeppartial) | type | Recursive partial — every property optional at every depth. |
| [`ModelDefinition`](#modeldefinition) | type | The chainable builder returned by `model()`. |
| [`getSnapshot`](#getsnapshot) | function | Recursively serialize a model instance into a plain JSON-safe snapshot. |
| [`applySnapshot`](#applysnapshot) | function | Replace a model instance's state wholesale from a snapshot. |
| [`onPatch`](#onpatch) | function | Subscribe to JSON patches emitted by state mutations on a model instance. |
| [`applyPatch`](#applypatch) | function | Apply one or more JSON patches to a model instance. |
| [`addMiddleware`](#addmiddleware) | function | Add an action interception middleware to a model instance. |
| [`destroy`](#destroy) | function | Tear down a model instance: run its `beforeDestroy` handlers (from `.lifecycle()`), recursively destroy field-nested chi |
| [`isAlive`](#isalive) | function | Returns `true` while the instance is live, `false` after `destroy(instance)` (and `false` for a non-model-instance). |
| [`clone`](#clone) | function | Structurally clone a model instance: snapshot its current state, then create a fresh, fully-independent instance from th |
| [`getType`](#gettype) | function | Returns the `ModelDefinition` that produced `instance` (the back-reference stored at `.create()` time), or `undefined` f |
| [`volatile`](#volatile) | function | Add VOLATILE state — signal-backed transient fields that are reactive (read `self.x()`, write `self.x.set(v)`) but EXCLU |
| [`onSnapshot`](#onsnapshot) | function | Subscribe to snapshot changes. |
| [`onAction`](#onaction) | function | Observe every action call on an instance (logging, analytics, devtools). |
| [`getParent`](#getparent) | function | Tree-traversal helpers. |
| [`identifier`](#identifier) | function | Declare a state field as a model's IDENTIFIER — the field a `reference()` resolves against. |
| [`reference`](#reference) | function | Declare a state field as a normalized REFERENCE to another model by its identifier. |
| [`resolveIdentifier`](#resolveidentifier) | function | Find the model instance of `Type` whose identifier equals `id`, searching `root`'s subtree (depth-first, cycle-safe; rea |

## API

### model `function`

```ts
model({ state }) | model({ schema, initial?, onValidationError? }) → ModelDefinition; chain .views(f).actions(f) then .create(initial?) or .asHook(id)
```

Define a reactive model via a chainable builder. Two modes (mutually exclusive): **plain mode** `model({ state })` declares signal-backed fields with their initial values; **schema mode** `model({ schema, initial? })` validates state via a schema and STRICTLY TYPES the instance from it. The schema can be passed DIRECTLY — `@pyreon/validate`'s `s.object(...)`, a raw `z.object(...)`, valibot, arktype, or any [Standard Schema](https://standardschema.dev)-compliant validator — and the field types flow through end-to-end (`self.name()` is `string`, not `unknown`), no adapter wrapper required. The `@pyreon/validation` `zodSchema` / `valibotSchema` / `arktypeSchema` adapters still work (the `_infer` path) and are only needed for async-validator interop. Chain `.views(f)` for derived values and `.actions(f)` for mutators; both are CHAINABLE — every subsequent layer sees prior views + actions via `self`. Schema mode adds `set` / `patch` / `deepPatch` / `update` / `reset` helpers (bare names) on `self` and on the instance, each validated through the schema. Actions can be `async`; `await u.fetchPosts()` works end-to-end and middleware sees completion via `await next(call)`. Returns a `ModelDefinition` — call `.create(initial?)` for an independent instance or `.asHook(id)` for a singleton.

**Example**

```tsx
// Plain mode
const Counter = model({ state: { count: 0 } })
  .views((self) => ({ doubled: () => self.count() * 2 }))
  .actions((self) => ({ inc: () => self.count.update(n => n + 1) }))

// Schema mode — pass the schema DIRECTLY (no wrapper); types flow through.
// Works with @pyreon/validate (`s`), raw zod, valibot, arktype, any Standard Schema.
import { z } from 'zod'

const User = model({
  schema: z.object({ name: z.string().min(1), age: z.number() }),
  initial: { name: '', age: 0 },
})
// u.name() is string, u.age() is number — strictly typed from the schema.
  .views((self) => ({ greet: () => `Hi, ${self.name()}` }))
  .actions((self) => ({
    rename: (next: string) => self.patch({ name: next }),
    async fetchProfile() {
      const res = await fetch('/api/profile')
      const data = await res.json()
      self.set(data)
    },
  }))

const u = User.create({ name: 'Alice', age: 30 })
u.greet()                 // "Hi, Alice"
await u.fetchProfile()    // async action, awaitable
u.reset()                // back to initial
```

**Common mistakes**

- Mutating state outside of actions — bypasses middleware and patch recording, breaks the structured contract
- Forgetting that `self.count` is a signal — read with `self.count()`, write with `self.count.set(v)` or `.update(fn)` inside actions
- Nesting plain objects in state instead of child models — plain objects are not signal-backed, changes to their properties are not reactive
- Confusing `self.set` (validates against schema, throws on failure) with `self.field.set(v)` (direct signal write, bypasses validation — the documented escape hatch)
- Using `model({ state, views, actions })` — that single-config form was REMOVED. Chain `.views()` / `.actions()` instead
- Defining views/actions referencing each other across MULTIPLE `.actions()` blocks but expecting tight typing — `self` in each block is loosely typed at the tail (`Record<string, any>`) so cross-block calls work; the cost is weak inference for cross-block helpers

**See also:** `ModelDefinition` · `SchemaModelHelpers` · `getSnapshot` · `applySnapshot` · `onPatch` · `addMiddleware`

---

### SchemaModelHelpers `type`

```ts
interface SchemaModelHelpers<TState> { set, patch, deepPatch, update<K>, reset }
```

The five schema-validated mutation helpers exposed on every schema-mode model instance AND on `self` inside schema-mode action/view factories. They are BARE names (`set`, `patch`, `deepPatch`, `update`, `reset`) — a schema field that collides with one of them throws at `.create()` time (the reserved-name guard names the offending field), so pick a different field name rather than relying on a prefix. All five validate the merged result through the schema before writing to signals (or invoke `onValidationError` if configured). Direct signal writes (`self.field.set(v)`) bypass validation — the documented escape hatch. Parallel to `@pyreon/store`'s `SchemaStoreApi`.

**Example**

```tsx
// All five helpers — pick by mutation shape:
u.set({ name: 'Bob', age: 40, prefs: { theme: 'dark', density: 'cozy' } })   // full replace
u.patch({ name: 'Bob' })                                                       // shallow merge
u.deepPatch({ prefs: { theme: 'dark' } })                                      // recursive merge — density survives
u.update('items', items => items.filter(x => x.id !== 1))                      // transform one field
u.reset()                                                                       // restore parsed initial
```

**Common mistakes**

- `patch({ prefs: { theme } })` REPLACES the whole `prefs` object (shallow merge); use `deepPatch` to keep `density` intact
- `deepPatch` REPLACES arrays / class instances (Date, Map, Set) — only plain objects recurse
- `update`'s transformer is `(unknown) => unknown` — cast at the call site for typed inference (key is constrained to `keyof TState & string`)
- Using `update` for multi-field changes — it transforms ONE top-level field at a time; use `patch` / `deepPatch` / `set` for multi-field

**See also:** `model` · `DeepPartial`

---

### DeepPartial `type`

```ts
type DeepPartial<T> = T extends ReadonlyArray<unknown> ? T : T extends object ? { readonly [K in keyof T]?: DeepPartial<T[K]> } : T
```

Recursive partial — every property optional at every depth. Used by `SchemaModelHelpers.deepPatch` as the partial-shape constraint. Arrays and primitives pass through unchanged (because `deepPatch` REPLACES them); only plain objects get the recursive optional treatment, matching the runtime merge semantics. Parallel to `@pyreon/store`'s `DeepPartial`.

**Example**

```tsx
// State { count: number; prefs: { theme: string; density: string } }
// DeepPartial admits:
deepPatch({ count: 5 })                                  // primitive field
deepPatch({ prefs: { theme: 'dark' } })                  // partial nested object — density survives
deepPatch({ prefs: { theme: 'dark', density: 'cozy' } }) // full nested object
// Arrays REPLACE — DeepPartial<T[]> = T[], must pass full array shape
```

**Common mistakes**

- `DeepPartial<T[]>` is `T[]` (no element-level optionality) — arrays REPLACE in `deepPatch`. To mutate array contents, use `update`
- Class instances (Date, Map, Set) keep their full shape under `DeepPartial` — they are NOT plain objects and replace wholesale

**See also:** `SchemaModelHelpers` · `model`

---

### ModelDefinition `type`

```ts
class ModelDefinition<TState, TViews, TActions, HasSchema, TVolatile> { views(f), actions(f), volatile(f), lifecycle(f), create(initial?), asHook(id) }
```

The chainable builder returned by `model()`. Each `.views(f)` / `.actions(f)` returns a NEW `ModelDefinition` with the accumulated layer — immutable builder, safe to share across call sites. `f` receives `self` typed as the model AS IT IS SO FAR (state signals + prior views + prior actions + schema helpers when applicable). Type parameters: `TState` is the underlying value shape; `TViews` / `TActions` accumulate across chain steps; `HasSchema` flips to `true` in schema mode (adds `set`/`patch`/`reset` to instance type).

**Example**

```tsx
const M = model({ schema })
  .views((self) => ({ a: () => self.x() }))     // self has state
  .views((self) => ({ b: () => self.a() + 1 })) // self also has a
  .actions((self) => ({ go: () => self.b() })) // self has a + b
  .actions((self) => ({ go2: () => self.go() })) // self has a + b + go
```

**Common mistakes**

- Trying to mutate `_config` directly — it's frozen by intent. Use the chain methods.
- Forgetting that `.views(f).actions(g)` does NOT call `f` or `g` immediately — they run inside `.create()`. Side effects in factories run per-instance, not per-definition.

**See also:** `model`

---

### getSnapshot `function`

```ts
(instance: ModelInstance) => Snapshot
```

Recursively serialize a model instance into a plain JSON-safe snapshot. Reads all signal values via `.peek()` to avoid tracking subscriptions. Nested models are recursively serialized.

**Example**

```tsx
const snap = getSnapshot(counter) // { count: 10 }
```

**See also:** `applySnapshot` · `model`

---

### applySnapshot `function`

```ts
(instance: ModelInstance, snapshot: Snapshot) => void
```

Replace a model instance's state wholesale from a snapshot. Recursively applies to nested models. Triggers patch listeners with replace operations.

**Example**

```tsx
applySnapshot(counter, { count: 0 }) // reset to zero
```

**See also:** `getSnapshot` · `model`

---

### onPatch `function`

```ts
(instance: ModelInstance, listener: PatchListener) => () => void
```

Subscribe to JSON patches emitted by state mutations on a model instance. Each patch is a `replace` op carrying the JSON-pointer path (`/count`, `/profile/name` for nested) and the new value — Pyreon state is one signal per field, so a field holding an array/object emits a whole-value `replace`, not granular add/remove ops. Returns an unsubscribe function. Pairs with `applyPatch` for undo/redo and state synchronization.

**Example**

```tsx
const dispose = onPatch(counter, (patch) => {
  console.log(patch) // { op: 'replace', path: '/count', value: 11 }
})
```

**See also:** `applyPatch` · `model`

---

### applyPatch `function`

```ts
(instance: ModelInstance, patch: Patch | Patch[]) => void
```

Apply one or more JSON patches to a model instance. Accepts a single patch or an array for batch replay. Used with `onPatch` for undo/redo and state synchronization.

**Example**

```tsx
applyPatch(counter, { op: 'replace', path: '/count', value: 0 })
```

**See also:** `onPatch` · `model`

---

### addMiddleware `function`

```ts
(instance: ModelInstance, middleware: MiddlewareFn) => () => void
```

Add an action interception middleware to a model instance. The middleware receives the action call context and a `next` function — call `next(call)` to proceed or return early to block the action. Returns an unsubscribe function.

**Example**

```tsx
addMiddleware(counter, (call, next) => {
  console.log(`${call.name}(${call.args.join(', ')})`)
  return next(call)
})
```

**See also:** `model`

---

### destroy `function`

```ts
(instance: ModelInstance) => void
```

Tear down a model instance: run its `beforeDestroy` handlers (from `.lifecycle()`), recursively destroy field-nested child models, drop all subscriptions (patch listeners + middleware), and mark it dead (`isAlive` → false). Idempotent. NOTE: this tears down SUBSCRIPTIONS + runs cleanup — it does NOT free memory. Pyreon signals have no per-signal dispose; the instance is reclaimed by GC once you drop your references. After `destroy`, actions + schema mutation helpers dev-warn and no-op; direct signal writes (`self.field.set`) stay unguarded.

**Example**

```tsx
const clock = Clock.create()  // .lifecycle(() => ({ afterCreate: start, beforeDestroy: stop }))
destroy(clock)   // runs stop(), tears down subscriptions, marks dead
isAlive(clock)   // false
```

**Common mistakes**

- Expecting `destroy` to free memory immediately — it clears subscriptions + runs `beforeDestroy`; GC reclaims the signals once you drop your references
- Writing state via `self.field.set(v)` after destroy — direct signal writes are NOT guarded (only actions + schema helpers warn). Stop mutating a destroyed instance
- Calling actions on a destroyed instance — they no-op + dev-warn; this usually means a stale event handler outlived the instance

**See also:** `isAlive` · `model` · `clone`

---

### isAlive `function`

```ts
(instance: ModelInstance) => boolean
```

Returns `true` while the instance is live, `false` after `destroy(instance)` (and `false` for a non-model-instance). Use to guard deferred work (a queued callback, a fetch resolution) that might land after the instance was torn down.

**Example**

```tsx
if (isAlive(model)) model.applyServerUpdate(data)
```

**See also:** `destroy` · `model`

---

### clone `function`

```ts
<T>(instance: T) => T
```

Structurally clone a model instance: snapshot its current state, then create a fresh, fully-independent instance from the SAME definition. The clone has its own signals, listeners, middleware, and lifecycle — mutating one never affects the other. In schema mode the snapshot is re-validated by `.create()`. Throws if the instance carries no definition back-reference (i.e. was not produced by `ModelDefinition.create()`).

**Example**

```tsx
const draft = clone(original)   // independent copy of original's current state
draft.title.set('edited')        // does not touch original
```

**Common mistakes**

- Expecting `clone` to be a shallow reference copy — it is a deep structural copy via `getSnapshot` + `.create()`; nested field-models are re-created
- Cloning an instance built without `ModelDefinition.create()` — `clone` needs the definition back-reference and throws otherwise

**See also:** `getType` · `getSnapshot` · `model`

---

### getType `function`

```ts
(instance: ModelInstance) => ModelDefinition | undefined
```

Returns the `ModelDefinition` that produced `instance` (the back-reference stored at `.create()` time), or `undefined` for an instance created without one. Pairs with `clone`; lets you create siblings from an instance you were handed.

**Example**

```tsx
const Def = getType(instance)
const sibling = Def?.create()
```

**See also:** `clone` · `model`

---

### volatile `function`

```ts
.volatile(self => ({ ...initialValues })) → ModelDefinition (chainable)
```

Add VOLATILE state — signal-backed transient fields that are reactive (read `self.x()`, write `self.x.set(v)`) but EXCLUDED from snapshots, patches, and `onSnapshot`. For state that should not be persisted or replayed: in-flight flags, drag/hover UI state, live object references (websockets, timers, promises). The factory returns initial VALUES; each becomes a `Signal<T>` on `self` + the instance, strictly typed. Volatile keys cannot collide with state / schema-helper / view / action / other-volatile names (throws at `.create()`). A volatile-only change never fires `onSnapshot` (it produces the same snapshot).

**Example**

```tsx
model({ state: { items: [] as string[] } })
  .volatile(() => ({ loading: false, lastError: null as Error | null }))
  .actions((self) => ({
    async load() {
      self.loading.set(true)               // reactive, not persisted
      try { self.items.set(await fetchItems()) }
      finally { self.loading.set(false) }
    },
  }))
```

**Common mistakes**

- Putting persistent state in `.volatile()` — it is dropped from snapshots, so it will not survive serialize/restore or replay. Use `state` / `schema` for durable data
- Expecting a volatile change to fire `onSnapshot` / emit a patch — volatile is excluded from both by design

**See also:** `model` · `onSnapshot` · `getSnapshot`

---

### onSnapshot `function`

```ts
(instance: ModelInstance, listener: (snapshot) => void) => () => void
```

Subscribe to snapshot changes. The listener fires MICROTASK-COALESCED with the new snapshot after any STATE change — all writes in one synchronous burst (a multi-field `set`/`patch`, several signal writes in one action) collapse into a SINGLE emit on the next microtask (MST-like async semantics). Does NOT fire on subscribe. Volatile-field changes do not fire it. Returns an unsubscribe function; `destroy(instance)` also clears all snapshot listeners. (Implemented via the patch-write hook, NOT an `effect()` — so it never fires on creation and never depends on the untracked `.peek()` reads `getSnapshot` performs.)

**Example**

```tsx
const dispose = onSnapshot(store, (snap) => {
  localStorage.setItem('store', JSON.stringify(snap))
})
```

**Common mistakes**

- Expecting a synchronous / per-write callback — `onSnapshot` is coalesced onto a microtask; read the snapshot you are handed, not a value you `getSnapshot` synchronously after a write
- Expecting it to fire immediately on subscribe — it does not (unlike a reactive `effect`); take an initial `getSnapshot(instance)` yourself if you need the starting value

**See also:** `getSnapshot` · `onPatch` · `model`

---

### onAction `function`

```ts
(instance: ModelInstance, listener: (call: ActionCall) => void) => () => void
```

Observe every action call on an instance (logging, analytics, devtools). The listener receives the `ActionCall` descriptor (`name`, `args`, `path`) BEFORE the action runs; it is read-only — it cannot block or alter the call (use `addMiddleware` for interception). Sugar over `addMiddleware` (a middleware that observes then unconditionally proceeds). Returns an unsubscribe function.

**Example**

```tsx
const unsub = onAction(store, (call) => analytics.track(call.name, call.args))
```

**Common mistakes**

- Trying to block / mutate a call from `onAction` — it is observe-only; use `addMiddleware` to intercept

**See also:** `addMiddleware` · `model`

---

### getParent `function`

```ts
<T>(node) => T | undefined; also getRoot / getPath / isRoot / hasParent
```

Tree-traversal helpers. A model instance gets a tree PARENT when it is written into another model's state — as a field value, an ARRAY element, or a plain-object value (parent tracking runs on the initial value AND every subsequent write, so array-held children — the headline `todos: Todo[]` shape — are tracked, not just field-nested ones). `getParent(node)` → the instance `node` is attached under (or `undefined` for a root); `getRoot(node)` → walks to the top; `getPath(node)` → JSON-pointer path from the root built from each ancestor's parent-key (e.g. `"/todos"`, `""` for a root); `isRoot(node)` / `hasParent(node)` → booleans. All throw on a non-model-instance.

**Example**

```tsx
const list = TodoList.create({ todos: [] })
list.add('write tests')               // pushes a Todo into the array
const todo = list.todos()[0]
getParent(todo)   // → list   (array children get a parent, not just field-nested)
getRoot(todo)     // → list
getPath(todo)     // "/todos"
isRoot(list)      // true
```

**Common mistakes**

- Expecting a parent for a child removed from an array — parent tracking sets the parent on write; a detached node keeps its last parent until GC (v1). getParent reflects the last attachment, not live membership
- Expecting array INDICES in `getPath` — v1 paths carry the field key (`/todos`), not the element index (`/todos/0`)
- Auto-attachment is one container level deep — a model nested inside an array inside an array is not auto-parented; use field or single-array nesting

**See also:** `model` · `getSnapshot`

---

### identifier `function`

```ts
identifier<T extends string | number>(default?: T) => T
```

Declare a state field as a model's IDENTIFIER — the field a `reference()` resolves against. Plain mode: use as a field value, `model({ state: { id: identifier(), name: '' } })` — it is a normal signal at runtime (initialized to the default, or `''`); the marker just records WHICH field is the id on the definition. Schema mode names it via config instead: `model({ schema, identifier: 'id' })`. A model needs an identifier only to be the TARGET of a reference.

**Example**

```tsx
const User = model({ state: { id: identifier(), name: '' } })
// schema mode:
const User2 = model({ schema: s.object({ id: s.string(), name: s.string() }), identifier: 'id' })
```

**See also:** `reference` · `resolveIdentifier` · `model`

---

### reference `function`

```ts
reference(TargetModel) => ReferenceField<TargetInstance>
```

Declare a state field as a normalized REFERENCE to another model by its identifier. The field STORES the target's id (so it serializes + round-trips cleanly) but RESOLVES to the live node on read. `post.author()` → the target node (or `undefined` if unresolved); `post.author.set(node | id)` stores the id; `post.author.id()` reads the raw id; `getSnapshot`/`applySnapshot` serialize/restore the id. Resolution walks the tree from `getRoot(node)` for a node of the target type whose identifier equals the stored id (O(n) per read in v1 — a root id-index is a future optimization). The target type must declare an `identifier()`.

**Example**

```tsx
const Post = model({ state: { id: identifier(), title: '', author: reference(User) } })
// inside a store holding both users and posts:
post.author()      // → the live User node (resolves via getRoot(post))
post.author.set(user)  // stores user's id
post.author.id()   // 'u-42'
```

**Common mistakes**

- Reading `reference` resolution OUTSIDE the tree — the field resolves via `getRoot(node)`, so the referencing node and the target must share a root; an unrooted node resolves to `undefined`
- Expecting array-held nodes to deep-serialize in `getSnapshot` — references serialize as the id; the TARGET node serializes under its own owner in the tree (and getSnapshot v1 does not recurse arrays-of-instances)
- Referencing a model with no `identifier()` — `reference()`/`resolveIdentifier` throw without a declared identifier on the target type

**See also:** `identifier` · `resolveIdentifier` · `getRoot` · `model`

---

### resolveIdentifier `function`

```ts
<T>(root, Type, id) => T | undefined
```

Find the model instance of `Type` whose identifier equals `id`, searching `root`'s subtree (depth-first, cycle-safe; reads each node's owned state — fields, array elements, plain-object values — but does not follow references). Returns `undefined` if no match. Throws if `Type` has no `identifier()` declared. The resolver `reference()` fields use under the hood; also useful directly for ad-hoc lookups.

**Example**

```tsx
const user = resolveIdentifier(store, User, 'u-42')
```

**See also:** `reference` · `identifier` · `getRoot`

---

## Package-level notes

> **Actions only:** State mutations must go through actions — direct `.set()` calls on state signals bypass middleware and patch recording. The model enforces this in dev mode.

> **Snapshot serialization:** `getSnapshot` reads via `.peek()` so it does not subscribe to signals. The snapshot is a one-time read, not a reactive computed.

> **Devtools:** Import `@pyreon/state-tree/devtools` for a WeakRef-based registry of live model instances. Tree-shakeable — zero cost unless imported.

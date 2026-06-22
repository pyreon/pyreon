---
title: "State Tree — API Reference"
description: "Structured reactive state tree — composable models with snapshots, patches, and middleware"
---

# @pyreon/state-tree — API Reference

> **Generated** from `state-tree`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [state-tree](/docs/state-tree).

MobX-State-Tree-inspired structured state management built on Pyreon signals. Models compose state (signals), views (computeds), and actions into self-contained units that support typed snapshots, JSON-patch record/replay, and action interception middleware. Models can nest other models for tree-shaped state, and `.asHook(id)` provides singleton instances scoped to a store-like registry.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`model`](#model) | function | Define a reactive model via a chainable builder. |
| [`SchemaModelHelpers`](#schemamodelhelpers) | type | The five schema-validated mutation helpers exposed on every schema-mode model instance AND on `self` inside schema-mode  |
| [`DeepPartial`](#deeppartial) | type | Recursive partial — every property optional at every depth. |
| [`ModelDefinition`](#modeldefinition) | type | The chainable builder returned by `model()`. |
| [`getSnapshot`](#getsnapshot) | function | Recursively serialize a model instance into a plain JSON-safe snapshot. |
| [`applySnapshot`](#applysnapshot) | function | Replace a model instance's state wholesale from a snapshot. |
| [`onPatch`](#onpatch) | function | Subscribe to JSON patches emitted by actions on a model instance. |
| [`applyPatch`](#applypatch) | function | Apply one or more JSON patches to a model instance. |
| [`addMiddleware`](#addmiddleware) | function | Add an action interception middleware to a model instance. |

## API

### model `function`

```ts
model({ state }) | model({ schema, initial?, onValidationError? }) → ModelDefinition; chain .views(f).actions(f) then .create(initial?) or .asHook(id)
```

Define a reactive model via a chainable builder. Two modes (mutually exclusive): **plain mode** `model({ state })` declares signal-backed fields with their initial values; **schema mode** `model({ schema, initial? })` validates state via a TypedSchemaAdapter (`zodSchema` / `valibotSchema` / `arktypeSchema`) or a Standard Schema-compliant instance (zod 3.24+ / valibot 1.0+ / arktype 2.0+ / Effect Schema, etc.) — types are inferred end-to-end. Chain `.views(f)` for derived values and `.actions(f)` for mutators; both are CHAINABLE — every subsequent layer sees prior views + actions via `self`. Schema mode adds `set` / `patch` / `reset` helpers on `self` and on the instance, each validated through the schema. Actions can be `async`; `await u.fetchPosts()` works end-to-end and middleware sees completion via `await next(call)`. Returns a `ModelDefinition` — call `.create(initial?)` for an independent instance or `.asHook(id)` for a singleton.

**Example**

```tsx
// Plain mode
const Counter = model({ state: { count: 0 } })
  .views((self) => ({ doubled: () => self.count() * 2 }))
  .actions((self) => ({ inc: () => self.count.update(n => n + 1) }))

// Schema mode (zod / valibot / arktype / Standard Schema)
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

const User = model({
  schema: zodSchema(z.object({ name: z.string().min(1), age: z.number() })),
  initial: { name: '', age: 0 },
})
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

The five schema-validated mutation helpers exposed on every schema-mode model instance AND on `self` inside schema-mode action/view factories. `$`-prefixed so they never collide with user schema field names (`name`, `set`, `patch`, etc.). All five validate the merged result through the schema before writing to signals (or invoke `onValidationError` if configured). Direct signal writes (`self.field.set(v)`) bypass validation — the documented escape hatch. Parallel to `@pyreon/store`'s `SchemaStoreApi`.

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
class ModelDefinition<TState, TViews, TActions, HasSchema> { views(f), actions(f), create(initial?), asHook(id) }
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

Subscribe to JSON patches emitted by actions on a model instance. Each patch records the path, operation (add/replace/remove), and value. Returns an unsubscribe function. Pairs with `applyPatch` for undo/redo and state synchronization.

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

## Package-level notes

> **Actions only:** State mutations must go through actions — direct `.set()` calls on state signals bypass middleware and patch recording. The model enforces this in dev mode.

> **Snapshot serialization:** `getSnapshot` reads via `.peek()` so it does not subscribe to signals. The snapshot is a one-time read, not a reactive computed.

> **Devtools:** Import `@pyreon/state-tree/devtools` for a WeakRef-based registry of live model instances. Tree-shakeable — zero cost unless imported.

import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/state-tree',
  title: 'State Tree',
  tagline:
    'Structured reactive state tree — composable models with snapshots, patches, and middleware',
  description:
    'MobX-State-Tree-inspired structured state management built on Pyreon signals. Models compose state (signals), views (computeds), and actions into self-contained units that support typed snapshots, JSON-patch record/replay, and action interception middleware. Models can nest other models for tree-shaped state, and `.asHook(id)` provides singleton instances scoped to a store-like registry.',
  category: 'universal',
  longExample: `import { model, getSnapshot, applySnapshot, onPatch, applyPatch, addMiddleware } from '@pyreon/state-tree'

// Define a model — chainable: state, then .views(), then .actions():
const Todo = model({ state: { title: '', done: false } })
  .views((self) => ({
    summary: () => \`\${self.title()} [\${self.done() ? 'x' : ' '}]\`,
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
  console.log(\`Action: \${call.name}\`, call.args)
  return next(call)
})

// Singleton hook for app-wide state:
const useTodoList = TodoList.asHook('todo-list')
const shared = useTodoList() // same ModelInstance on every call
shared.add('Persisted item')`,
  features: [
    'model({ state }) or model({ schema }) — chainable builder',
    '.views(self => ...) — chainable derived values; each layer sees prior ones',
    '.actions(self => ...) — chainable mutators; async out of the box',
    '.lifecycle(self => ({ afterCreate, beforeDestroy })) — instance lifecycle hooks',
    '.volatile(self => ({...})) — signal-backed transient state; reactive but excluded from snapshots/patches',
    'destroy(instance) / isAlive(instance) — tear down (recurses field-nested children) + liveness; actions no-op after destroy',
    'clone(instance) / getType(instance) — independent structural copy + definition back-ref',
    'onSnapshot(instance, cb) — microtask-coalesced snapshot subscription; onAction(instance, cb) — observe action calls',
    'getParent / getRoot / getPath / isRoot / hasParent — tree traversal (parent tracked for field AND array/map children)',
    'identifier() / reference(Type) / resolveIdentifier — normalized references that resolve by id to the live node',
    'Schema mode validates + STRICTLY TYPES state from a schema passed directly — @pyreon/validate, raw zod / valibot / arktype, any Standard Schema (no adapter wrapper)',
    'Nested model composition for tree-shaped state',
    'getSnapshot / applySnapshot — typed recursive serialization',
    'onPatch / applyPatch — JSON patch record and replay',
    'addMiddleware — action interception chain (sync + async)',
    '.create(initial) for instances, .asHook(id) for singleton hooks',
    'Devtools subpath export with WeakRef-based registry',
  ],
  api: [
    {
      name: 'model',
      kind: 'function',
      signature:
        'model({ state }) | model({ schema, initial?, onValidationError? }) → ModelDefinition; chain .views(f).actions(f) then .create(initial?) or .asHook(id)',
      summary:
        'Define a reactive model via a chainable builder. Two modes (mutually exclusive): **plain mode** `model({ state })` declares signal-backed fields with their initial values; **schema mode** `model({ schema, initial? })` validates state via a schema and STRICTLY TYPES the instance from it. The schema can be passed DIRECTLY — `@pyreon/validate`\'s `s.object(...)`, a raw `z.object(...)`, valibot, arktype, or any [Standard Schema](https://standardschema.dev)-compliant validator — and the field types flow through end-to-end (`self.name()` is `string`, not `unknown`), no adapter wrapper required. The `@pyreon/validation` `zodSchema` / `valibotSchema` / `arktypeSchema` adapters still work (the `_infer` path) and are only needed for async-validator interop. Chain `.views(f)` for derived values and `.actions(f)` for mutators; both are CHAINABLE — every subsequent layer sees prior views + actions via `self`. Schema mode adds `set` / `patch` / `deepPatch` / `update` / `reset` helpers (bare names) on `self` and on the instance, each validated through the schema. Actions can be `async`; `await u.fetchPosts()` works end-to-end and middleware sees completion via `await next(call)`. Returns a `ModelDefinition` — call `.create(initial?)` for an independent instance or `.asHook(id)` for a singleton.',
      example: `// Plain mode
const Counter = model({ state: { count: 0 } })
  .views((self) => ({ doubled: () => self.count() * 2 }))
  .actions((self) => ({ inc: () => self.count.update(n => n + 1) }))

// Schema mode — pass the schema DIRECTLY (no wrapper); types flow through.
// Works with @pyreon/validate (\`s\`), raw zod, valibot, arktype, any Standard Schema.
import { z } from 'zod'

const User = model({
  schema: z.object({ name: z.string().min(1), age: z.number() }),
  initial: { name: '', age: 0 },
})
// u.name() is string, u.age() is number — strictly typed from the schema.
  .views((self) => ({ greet: () => \`Hi, \${self.name()}\` }))
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
u.reset()                // back to initial`,
      mistakes: [
        'Mutating state outside of actions — bypasses middleware and patch recording, breaks the structured contract',
        'Forgetting that `self.count` is a signal — read with `self.count()`, write with `self.count.set(v)` or `.update(fn)` inside actions',
        'Nesting plain objects in state instead of child models — plain objects are not signal-backed, changes to their properties are not reactive',
        'Confusing `self.set` (validates against schema, throws on failure) with `self.field.set(v)` (direct signal write, bypasses validation — the documented escape hatch)',
        'Using `model({ state, views, actions })` — that single-config form was REMOVED. Chain `.views()` / `.actions()` instead',
        'Defining views/actions referencing each other across MULTIPLE `.actions()` blocks but expecting tight typing — `self` in each block is loosely typed at the tail (`Record<string, any>`) so cross-block calls work; the cost is weak inference for cross-block helpers',
      ],
      seeAlso: ['ModelDefinition', 'SchemaModelHelpers', 'getSnapshot', 'applySnapshot', 'onPatch', 'addMiddleware'],
    },
    {
      name: 'SchemaModelHelpers',
      kind: 'type',
      signature:
        'interface SchemaModelHelpers<TState> { set, patch, deepPatch, update<K>, reset }',
      summary:
        'The five schema-validated mutation helpers exposed on every schema-mode model instance AND on `self` inside schema-mode action/view factories. They are BARE names (`set`, `patch`, `deepPatch`, `update`, `reset`) — a schema field that collides with one of them throws at `.create()` time (the reserved-name guard names the offending field), so pick a different field name rather than relying on a prefix. All five validate the merged result through the schema before writing to signals (or invoke `onValidationError` if configured). Direct signal writes (`self.field.set(v)`) bypass validation — the documented escape hatch. Parallel to `@pyreon/store`\'s `SchemaStoreApi`.',
      example: `// All five helpers — pick by mutation shape:
u.set({ name: 'Bob', age: 40, prefs: { theme: 'dark', density: 'cozy' } })   // full replace
u.patch({ name: 'Bob' })                                                       // shallow merge
u.deepPatch({ prefs: { theme: 'dark' } })                                      // recursive merge — density survives
u.update('items', items => items.filter(x => x.id !== 1))                      // transform one field
u.reset()                                                                       // restore parsed initial`,
      mistakes: [
        '`patch({ prefs: { theme } })` REPLACES the whole `prefs` object (shallow merge); use `deepPatch` to keep `density` intact',
        '`deepPatch` REPLACES arrays / class instances (Date, Map, Set) — only plain objects recurse',
        '`update`\'s transformer is `(unknown) => unknown` — cast at the call site for typed inference (key is constrained to `keyof TState & string`)',
        'Using `update` for multi-field changes — it transforms ONE top-level field at a time; use `patch` / `deepPatch` / `set` for multi-field',
      ],
      seeAlso: ['model', 'DeepPartial'],
    },
    {
      name: 'DeepPartial',
      kind: 'type',
      signature:
        'type DeepPartial<T> = T extends ReadonlyArray<unknown> ? T : T extends object ? { readonly [K in keyof T]?: DeepPartial<T[K]> } : T',
      summary:
        'Recursive partial — every property optional at every depth. Used by `SchemaModelHelpers.deepPatch` as the partial-shape constraint. Arrays and primitives pass through unchanged (because `deepPatch` REPLACES them); only plain objects get the recursive optional treatment, matching the runtime merge semantics. Parallel to `@pyreon/store`\'s `DeepPartial`.',
      example: `// State { count: number; prefs: { theme: string; density: string } }
// DeepPartial admits:
deepPatch({ count: 5 })                                  // primitive field
deepPatch({ prefs: { theme: 'dark' } })                  // partial nested object — density survives
deepPatch({ prefs: { theme: 'dark', density: 'cozy' } }) // full nested object
// Arrays REPLACE — DeepPartial<T[]> = T[], must pass full array shape`,
      mistakes: [
        '`DeepPartial<T[]>` is `T[]` (no element-level optionality) — arrays REPLACE in `deepPatch`. To mutate array contents, use `update`',
        'Class instances (Date, Map, Set) keep their full shape under `DeepPartial` — they are NOT plain objects and replace wholesale',
      ],
      seeAlso: ['SchemaModelHelpers', 'model'],
    },
    {
      name: 'ModelDefinition',
      kind: 'type',
      signature: 'class ModelDefinition<TState, TViews, TActions, HasSchema, TVolatile> { views(f), actions(f), volatile(f), lifecycle(f), create(initial?), asHook(id) }',
      summary:
        'The chainable builder returned by `model()`. Each `.views(f)` / `.actions(f)` returns a NEW `ModelDefinition` with the accumulated layer — immutable builder, safe to share across call sites. `f` receives `self` typed as the model AS IT IS SO FAR (state signals + prior views + prior actions + schema helpers when applicable). Type parameters: `TState` is the underlying value shape; `TViews` / `TActions` accumulate across chain steps; `HasSchema` flips to `true` in schema mode (adds `set`/`patch`/`reset` to instance type).',
      example: `const M = model({ schema })
  .views((self) => ({ a: () => self.x() }))     // self has state
  .views((self) => ({ b: () => self.a() + 1 })) // self also has a
  .actions((self) => ({ go: () => self.b() })) // self has a + b
  .actions((self) => ({ go2: () => self.go() })) // self has a + b + go`,
      mistakes: [
        'Trying to mutate `_config` directly — it\'s frozen by intent. Use the chain methods.',
        'Forgetting that `.views(f).actions(g)` does NOT call `f` or `g` immediately — they run inside `.create()`. Side effects in factories run per-instance, not per-definition.',
      ],
      seeAlso: ['model'],
    },
    {
      name: 'getSnapshot',
      kind: 'function',
      signature: '(instance: ModelInstance) => Snapshot',
      summary:
        'Recursively serialize a model instance into a plain JSON-safe snapshot. Reads all signal values via `.peek()` (a one-time read — NOT a reactive computed; it does not subscribe). Nested field-models AND arrays / plain-objects that HOLD model instances (`todos: Todo[]`, `byId: { [k]: Model }`) are recursively serialized; a `reference` field serializes as its stored ID, not the target node.',
      example: `const snap = getSnapshot(counter) // { count: 10 }`,
      mistakes: [
        'Expecting `getSnapshot` to be reactive — it reads via `.peek()`, so it is a one-time snapshot, not a `computed`. Call it again (e.g. inside `onSnapshot`) to get the next value.',
        'Expecting a `reference` field to serialize the target node — it serializes as the stored ID (owned instances in arrays/objects DO deep-serialize; a reference is an id by design).',
      ],
      seeAlso: ['applySnapshot', 'model'],
    },
    {
      name: 'applySnapshot',
      kind: 'function',
      signature: '(instance: ModelInstance, snapshot: Partial<Snapshot>) => void',
      summary:
        'Apply a (possibly PARTIAL) snapshot to a model instance — updates only the keys PRESENT in the snapshot, leaving absent keys unchanged (a merge, not a clear). Nested field-models, arrays-of-instances (`todos: Todo[]`), and object-of-instances (`byId: { [k]: Model }`) reconcile IN PLACE: existing instances are updated from the matching elements, never replaced by plain snapshot objects, and array length changes beyond the current↔snapshot overlap are NOT reconciled (use the array\'s own mutation methods to add/remove). Schema mode routes through the validated `patch` helper, so an invalid snapshot is REJECTED. Emits `replace` patches.',
      example: `applySnapshot(counter, { count: 0 })      // reset one field
applySnapshot(app, { title: 'New' })      // merge — profile is left unchanged`,
      mistakes: [
        'Expecting a partial snapshot to CLEAR unmentioned fields — it merges: keys absent from the snapshot keep their current value. Pass a full snapshot to replace everything.',
        'Expecting a longer array snapshot to grow the list — arrays-of-instances reconcile only up to the overlap (`min(current, snapshot)`); extra snapshot elements are NOT added (there is no element type to recreate them). Use the array\'s own add/remove action, then apply.',
        'Applying an invalid snapshot in schema mode expecting a silent write — it routes through the validated `patch` and THROWS on a schema violation (the schema is the source of truth).',
      ],
      seeAlso: ['getSnapshot', 'model'],
    },
    {
      name: 'onPatch',
      kind: 'function',
      signature: '(instance: ModelInstance, listener: PatchListener) => () => void',
      summary:
        'Subscribe to JSON patches emitted by state mutations on a model instance. Each patch is a `replace` op carrying the JSON-pointer path (`/count`, `/profile/name` for nested) and the new value — Pyreon state is one signal per field, so a field holding an array/object emits a whole-value `replace`, not granular add/remove ops. Returns an unsubscribe function. Pairs with `applyPatch` for undo/redo and state synchronization.',
      example: `const dispose = onPatch(counter, (patch) => {
  console.log(patch) // { op: 'replace', path: '/count', value: 11 }
})`,
      seeAlso: ['applyPatch', 'model'],
    },
    {
      name: 'applyPatch',
      kind: 'function',
      signature: '(instance: ModelInstance, patch: Patch | Patch[]) => void',
      summary:
        'Apply one or more JSON patches to a model instance. Accepts a single patch or an array for batch replay. REPLACE-ONLY: every patch must be `{ op: "replace" }` — any other op (`add`/`remove`/`move`/…) THROWS `unsupported op`. This mirrors what `onPatch` emits (Pyreon is one signal per field, so a field holding an array/object emits a whole-value `replace`, never granular add/remove), so an `onPatch`→`applyPatch` undo/redo round-trip is closed; a hand-authored standard JSON-Patch with add/remove is not.',
      example: `applyPatch(counter, { op: 'replace', path: '/count', value: 0 })`,
      mistakes: [
        'Passing an `add` / `remove` / `move` patch (e.g. imported from a standard JSON-Patch diff) — `applyPatch` throws `unsupported op "<op>"`; it accepts ONLY `replace`. Feed it the `replace` ops `onPatch` emits, or convert your diff to whole-value replaces.',
        'Expecting a granular array patch (`/todos/0`, add-at-index) — Pyreon emits a whole-value `replace` of the field (`/todos`); apply the whole array value, not an element op.',
      ],
      seeAlso: ['onPatch', 'model'],
    },
    {
      name: 'addMiddleware',
      kind: 'function',
      signature: '(instance: ModelInstance, middleware: MiddlewareFn) => () => void',
      summary:
        'Add an action interception middleware to a model instance. The middleware receives the action call context and a `next` function — call `next(call)` to proceed or return early to block the action. Returns an unsubscribe function.',
      example: `addMiddleware(counter, (call, next) => {
  console.log(\`\${call.name}(\${call.args.join(', ')})\`)
  return next(call)
})`,
      seeAlso: ['model'],
    },
    {
      name: 'destroy',
      kind: 'function',
      signature: '(instance: ModelInstance) => void',
      summary:
        'Tear down a model instance: run its `beforeDestroy` handlers (from `.lifecycle()`), recursively destroy field-nested child models, drop all subscriptions (patch listeners + middleware), and mark it dead (`isAlive` → false). Idempotent. NOTE: this tears down SUBSCRIPTIONS + runs cleanup — it does NOT free memory. Pyreon signals have no per-signal dispose; the instance is reclaimed by GC once you drop your references. After `destroy`, actions + schema mutation helpers dev-warn and no-op; direct signal writes (`self.field.set`) stay unguarded.',
      example: `const clock = Clock.create()  // .lifecycle(() => ({ afterCreate: start, beforeDestroy: stop }))
destroy(clock)   // runs stop(), tears down subscriptions, marks dead
isAlive(clock)   // false`,
      mistakes: [
        'Expecting `destroy` to free memory immediately — it clears subscriptions + runs `beforeDestroy`; GC reclaims the signals once you drop your references',
        'Writing state via `self.field.set(v)` after destroy — direct signal writes are NOT guarded (only actions + schema helpers warn). Stop mutating a destroyed instance',
        'Calling actions on a destroyed instance — they no-op + dev-warn; this usually means a stale event handler outlived the instance',
      ],
      seeAlso: ['isAlive', 'model', 'clone'],
    },
    {
      name: 'isAlive',
      kind: 'function',
      signature: '(instance: ModelInstance) => boolean',
      summary:
        'Returns `true` while the instance is live, `false` after `destroy(instance)` (and `false` for a non-model-instance). Use to guard deferred work (a queued callback, a fetch resolution) that might land after the instance was torn down.',
      example: `const counter = model({ state: { count: 0 } })
  .actions((self) => ({ inc: () => self.count.update((n) => n + 1) }))
  .create()

// Guard deferred work (a queued callback, a fetch resolution) that
// might land after the instance was torn down:
if (isAlive(counter)) counter.inc()`,
      seeAlso: ['destroy', 'model'],
    },
    {
      name: 'clone',
      kind: 'function',
      signature: '<T>(instance: T) => T',
      summary:
        'Structurally clone a model instance: snapshot its current state, then create a fresh, fully-independent instance from the SAME definition. The clone has its own signals, listeners, middleware, and lifecycle — mutating one never affects the other. In schema mode the snapshot is re-validated by `.create()`. Throws if the instance carries no definition back-reference (i.e. was not produced by `ModelDefinition.create()`).',
      example: `const draft = clone(original)   // independent copy of original's current state
draft.title.set('edited')        // does not touch original`,
      mistakes: [
        'Expecting `clone` to be a shallow reference copy — it is a deep structural copy via `getSnapshot` + `.create()`; nested field-models are re-created',
        'Cloning an instance built without `ModelDefinition.create()` — `clone` needs the definition back-reference and throws otherwise',
      ],
      seeAlso: ['getType', 'getSnapshot', 'model'],
    },
    {
      name: 'getType',
      kind: 'function',
      signature: '(instance: object) => unknown',
      summary:
        'Returns the `ModelDefinition` that produced `instance` (the back-reference stored at `.create()` time), or `undefined` for an instance created without one. Pairs with `clone`; lets you create siblings from an instance you were handed. The static return type is `unknown` (the definition\\\'s generics are not recoverable at runtime) — cast it to a `ModelDefinition<TState>` to call `.create()`.',
      example: `import type { ModelDefinition } from '@pyreon/state-tree'

// getType is typed \`unknown\` — cast to the definition type to instantiate siblings:
const Def = getType(instance) as ModelDefinition<{ count: number }> | undefined
const sibling = Def?.create()`,
      seeAlso: ['clone', 'model'],
    },
    {
      name: 'volatile',
      kind: 'function',
      signature: '.volatile(self => ({ ...initialValues })) → ModelDefinition (chainable)',
      summary:
        'Add VOLATILE state — signal-backed transient fields that are reactive (read `self.x()`, write `self.x.set(v)`) but EXCLUDED from snapshots, patches, and `onSnapshot`. For state that should not be persisted or replayed: in-flight flags, drag/hover UI state, live object references (websockets, timers, promises). The factory returns initial VALUES; each becomes a `Signal<T>` on `self` + the instance, strictly typed. Volatile keys cannot collide with state / schema-helper / view / action / other-volatile names (throws at `.create()`). A volatile-only change never fires `onSnapshot` (it produces the same snapshot).',
      example: `model({ state: { items: [] as string[] } })
  .volatile(() => ({ loading: false, lastError: null as Error | null }))
  .actions((self) => ({
    async load() {
      self.loading.set(true)               // reactive, not persisted
      try { self.items.set(await fetchItems()) }
      finally { self.loading.set(false) }
    },
  }))`,
      mistakes: [
        'Putting persistent state in `.volatile()` — it is dropped from snapshots, so it will not survive serialize/restore or replay. Use `state` / `schema` for durable data',
        'Expecting a volatile change to fire `onSnapshot` / emit a patch — volatile is excluded from both by design',
      ],
      seeAlso: ['model', 'onSnapshot', 'getSnapshot'],
    },
    {
      name: 'onSnapshot',
      kind: 'function',
      signature: '(instance: ModelInstance, listener: (snapshot) => void) => () => void',
      summary:
        'Subscribe to snapshot changes. The listener fires MICROTASK-COALESCED with the new snapshot after any STATE change — all writes in one synchronous burst (a multi-field `set`/`patch`, several signal writes in one action) collapse into a SINGLE emit on the next microtask (MST-like async semantics). Does NOT fire on subscribe. Volatile-field changes do not fire it. Returns an unsubscribe function; `destroy(instance)` also clears all snapshot listeners. (Implemented via the patch-write hook, NOT an `effect()` — so it never fires on creation and never depends on the untracked `.peek()` reads `getSnapshot` performs.)',
      example: `const dispose = onSnapshot(store, (snap) => {
  localStorage.setItem('store', JSON.stringify(snap))
})`,
      mistakes: [
        'Expecting a synchronous / per-write callback — `onSnapshot` is coalesced onto a microtask; read the snapshot you are handed, not a value you `getSnapshot` synchronously after a write',
        'Expecting it to fire immediately on subscribe — it does not (unlike a reactive `effect`); take an initial `getSnapshot(instance)` yourself if you need the starting value',
      ],
      seeAlso: ['getSnapshot', 'onPatch', 'model'],
    },
    {
      name: 'onAction',
      kind: 'function',
      signature: '(instance: ModelInstance, listener: (call: ActionCall) => void) => () => void',
      summary:
        'Observe every action call on an instance (logging, analytics, devtools). The listener receives the `ActionCall` descriptor (`name`, `args`, `path`) BEFORE the action runs; it is read-only — it cannot block or alter the call (use `addMiddleware` for interception). Sugar over `addMiddleware` (a middleware that observes then unconditionally proceeds). Returns an unsubscribe function.',
      example: `const unsub = onAction(store, (call) => analytics.track(call.name, call.args))`,
      mistakes: [
        'Trying to block / mutate a call from `onAction` — it is observe-only; use `addMiddleware` to intercept',
      ],
      seeAlso: ['addMiddleware', 'model'],
    },
    {
      name: 'getParent',
      kind: 'function',
      signature: '<T>(node) => T | undefined; also getRoot / getPath / isRoot / hasParent',
      summary:
        'Tree-traversal helpers. A model instance gets a tree PARENT when it is written into another model\'s state — as a field value, an ARRAY element, or a plain-object value (parent tracking runs on the initial value AND every subsequent write, so array-held children — the headline `todos: Todo[]` shape — are tracked, not just field-nested ones). `getParent(node)` → the instance `node` is attached under (or `undefined` for a root); `getRoot(node)` → walks to the top; `getPath(node)` → JSON-pointer path from the root built from each ancestor\'s parent-key (e.g. `"/todos"`, `""` for a root); `isRoot(node)` / `hasParent(node)` → booleans. All throw on a non-model-instance.',
      example: `const list = TodoList.create({ todos: [] })
list.add('write tests')               // pushes a Todo into the array
const todo = list.todos()[0]
getParent(todo)   // → list   (array children get a parent, not just field-nested)
getRoot(todo)     // → list
getPath(todo)     // "/todos"
isRoot(list)      // true`,
      mistakes: [
        'Expecting a parent for a child removed from an array — parent tracking sets the parent on write; a detached node keeps its last parent until GC (v1). getParent reflects the last attachment, not live membership',
        'Expecting array INDICES in `getPath` — v1 paths carry the field key (`/todos`), not the element index (`/todos/0`)',
        'Auto-attachment is one container level deep — a model nested inside an array inside an array is not auto-parented; use field or single-array nesting',
      ],
      seeAlso: ['model', 'getSnapshot'],
    },
    {
      name: 'identifier',
      kind: 'function',
      signature: 'identifier<T extends string | number>(default?: T) => T',
      summary:
        'Declare a state field as a model\'s IDENTIFIER — the field a `reference()` resolves against. Plain mode: use as a field value, `model({ state: { id: identifier(), name: \'\' } })` — it is a normal signal at runtime (initialized to the default, or `\'\'`); the marker just records WHICH field is the id on the definition. Schema mode names it via config instead: `model({ schema, identifier: \'id\' })`. A model needs an identifier only to be the TARGET of a reference.',
      example: `const User = model({ state: { id: identifier(), name: '' } })
// schema mode:
const User2 = model({ schema: s.object({ id: s.string(), name: s.string() }), identifier: 'id' })`,
      seeAlso: ['reference', 'resolveIdentifier', 'model'],
    },
    {
      name: 'reference',
      kind: 'function',
      signature: 'reference(TargetModel) => ReferenceField<TargetInstance>',
      summary:
        'Declare a state field as a normalized REFERENCE to another model by its identifier. The field STORES the target\'s id (so it serializes + round-trips cleanly) but RESOLVES to the live node on read. `post.author()` → the target node (or `undefined` if unresolved); `post.author.set(node | id)` stores the id; `post.author.id()` reads the raw id; `getSnapshot`/`applySnapshot` serialize/restore the id. Resolution walks the tree from `getRoot(node)` for a node of the target type whose identifier equals the stored id (O(n) per read in v1 — a root id-index is a future optimization). The target type must declare an `identifier()`.',
      example: `const Post = model({ state: { id: identifier(), title: '', author: reference(User) } })
// inside a store holding both users and posts:
post.author()      // → the live User node (resolves via getRoot(post))
post.author.set(user)  // stores user's id
post.author.id()   // 'u-42'`,
      mistakes: [
        'Reading `reference` resolution OUTSIDE the tree — the field resolves via `getRoot(node)`, so the referencing node and the target must share a root; an unrooted node resolves to `undefined`',
        'Expecting a `reference` field to deep-serialize its target — a reference serializes as the target\'s ID (so it round-trips), NOT as the node; the target serializes under its OWN owner in the tree. (Array-held OWNED instances — the `todos: Todo[]` shape — DO deep-serialize in `getSnapshot`; a reference is an id by design.)',
        'Referencing a model with no `identifier()` — `reference()`/`resolveIdentifier` throw without a declared identifier on the target type',
      ],
      seeAlso: ['identifier', 'resolveIdentifier', 'getRoot', 'model'],
    },
    {
      name: 'resolveIdentifier',
      kind: 'function',
      signature: '<T>(root, Type, id) => T | undefined',
      summary:
        'Find the model instance of `Type` whose identifier equals `id`, searching `root`\'s subtree (depth-first, cycle-safe; reads each node\'s owned state — fields, array elements, plain-object values — but does not follow references). Returns `undefined` if no match. Throws if `Type` has no `identifier()` declared. The resolver `reference()` fields use under the hood; also useful directly for ad-hoc lookups.',
      example: `const user = resolveIdentifier(store, User, 'u-42')`,
      seeAlso: ['reference', 'identifier', 'getRoot'],
    },
    {
      name: 'resetHook',
      kind: 'function',
      signature: 'resetHook(id: string) => void; resetAllHooks() => void',
      summary:
        'Destroy `.asHook(id)` singletons. `.asHook(id)` stores ONE instance per id in a MODULE-LEVEL registry (created lazily on first call, shared for the process), so every consumer of `useX = Model.asHook("x")` gets the SAME instance — great for app-global state, a hazard for tests. `resetHook(id)` deletes that one singleton so the next `asHook(id)` call re-creates a fresh instance; `resetAllHooks()` clears the whole registry. Both are for TEST isolation (and hot-reload).',
      example: `const useTodos = TodoList.asHook('todos')
// tests:
afterEach(() => resetAllHooks())   // else a mutation in one test leaks to the next`,
      mistakes: [
        'Not resetting between tests — the `asHook` singleton lives in a module-level Map for the whole process, NOT per-test. State mutated in one test persists into the next; call `resetAllHooks()` (or `resetHook(id)`) in `afterEach`.',
        'Expecting `resetHook` to `destroy()` the old instance\'s subscriptions — it only DROPS the registry entry so the next `asHook` re-creates. If code still holds the old reference, call `destroy()` on it yourself.',
      ],
      seeAlso: ['model', 'destroy'],
    },
  ],
  gotchas: [
    {
      label: 'Actions only',
      note: 'State mutations must go through actions — direct `.set()` calls on state signals bypass middleware and patch recording. The model enforces this in dev mode.',
    },
    {
      label: 'Snapshot serialization',
      note: '`getSnapshot` reads via `.peek()` so it does not subscribe to signals. The snapshot is a one-time read, not a reactive computed.',
    },
    {
      label: 'Devtools',
      note: 'Import `@pyreon/state-tree/devtools` for a WeakRef-based registry of live model instances. Tree-shakeable — zero cost unless imported.',
    },
  ],
})

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
const { store } = useTodoList() // same instance on every call`,
  features: [
    'model({ state }) or model({ schema }) — chainable builder',
    '.views(self => ...) — chainable derived values; each layer sees prior ones',
    '.actions(self => ...) — chainable mutators; async out of the box',
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
      signature: 'class ModelDefinition<TState, TViews, TActions, HasSchema> { views(f), actions(f), create(initial?), asHook(id) }',
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
        'Recursively serialize a model instance into a plain JSON-safe snapshot. Reads all signal values via `.peek()` to avoid tracking subscriptions. Nested models are recursively serialized.',
      example: `const snap = getSnapshot(counter) // { count: 10 }`,
      seeAlso: ['applySnapshot', 'model'],
    },
    {
      name: 'applySnapshot',
      kind: 'function',
      signature: '(instance: ModelInstance, snapshot: Snapshot) => void',
      summary:
        'Replace a model instance\'s state wholesale from a snapshot. Recursively applies to nested models. Triggers patch listeners with replace operations.',
      example: `applySnapshot(counter, { count: 0 }) // reset to zero`,
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
        'Apply one or more JSON patches to a model instance. Accepts a single patch or an array for batch replay. Used with `onPatch` for undo/redo and state synchronization.',
      example: `applyPatch(counter, { op: 'replace', path: '/count', value: 0 })`,
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

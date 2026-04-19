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

// Define a model — state (signals), views (derived), actions (mutations):
const Todo = model({
  state: { title: '', done: false },
  views: (self) => ({
    summary: () => \`\${self.title()} [\${self.done() ? 'x' : ' '}]\`,
  }),
  actions: (self) => ({
    toggle: () => self.done.set(!self.done()),
    rename: (title: string) => self.title.set(title),
  }),
})

const TodoList = model({
  state: { todos: [] as ReturnType<typeof Todo.create>[] },
  actions: (self) => ({
    add: (title: string) => {
      const todo = Todo.create({ title, done: false })
      self.todos.update(list => [...list, todo])
    },
  }),
})

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
    'model({ state, views, actions }) — structured reactive models',
    'Nested model composition for tree-shaped state',
    'getSnapshot / applySnapshot — typed recursive serialization',
    'onPatch / applyPatch — JSON patch record and replay',
    'addMiddleware — action interception chain',
    '.create(initial) for instances, .asHook(id) for singleton hooks',
    'Devtools subpath export with WeakRef-based registry',
  ],
  api: [
    {
      name: 'model',
      kind: 'function',
      signature: '(definition: { state: StateShape, views?: (self: ModelSelf) => Record<string, () => any>, actions?: (self: ModelSelf) => Record<string, (...args: any[]) => any> }) => ModelDefinition',
      summary:
        'Define a structured reactive model. `state` declares signal-backed fields with their initial values. `views` are computed derivations. `actions` are the only way to mutate state — enabling middleware interception and patch recording. Returns a `ModelDefinition` with `.create(initial?)` for instances and `.asHook(id)` for singleton access.',
      example: `const Counter = model({
  state: { count: 0 },
  views: (self) => ({
    doubled: () => self.count() * 2,
  }),
  actions: (self) => ({
    increment: () => self.count.update(n => n + 1),
  }),
})

const counter = Counter.create({ count: 10 })
counter.count()    // 10
counter.increment()
counter.doubled()  // 22`,
      mistakes: [
        'Mutating state outside of actions — bypasses middleware and patch recording, breaks the structured contract',
        'Forgetting that `self.count` is a signal — read with `self.count()`, write with `self.count.set(v)` or `.update(fn)` inside actions',
        'Nesting plain objects in state instead of child models — plain objects are not signal-backed, changes to their properties are not reactive',
      ],
      seeAlso: ['getSnapshot', 'applySnapshot', 'onPatch', 'addMiddleware'],
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
        'Subscribe to JSON patches emitted by actions on a model instance. Each patch records the path, operation (add/replace/remove), and value. Returns an unsubscribe function. Pairs with `applyPatch` for undo/redo and state synchronization.',
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

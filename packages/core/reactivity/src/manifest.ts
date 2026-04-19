import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/reactivity',
  title: 'Complete API',
  tagline:
    'Fine-grained reactivity: signal, computed, effect, batch, onCleanup, createStore, watch, createResource, untrack',
  description:
    'Standalone reactive primitives — no DOM, no JSX, no framework dependency. Signals are callable functions (`count()` to read, `count.set(5)` to write, `count.update(n => n + 1)` to derive). Subscribers tracked via `Set<() => void>`; batch uses pointer swap for zero-allocation grouping. Every other Pyreon package builds on this foundation but `@pyreon/reactivity` can be used independently in Node, Bun, or browser scripts without any framework overhead.',
  category: 'universal',
  longExample: `import { signal, computed, effect, batch, onCleanup, createStore, watch, untrack } from "@pyreon/reactivity"

// signal<T>() — callable function, NOT .value getter/setter
const count = signal(0)
count()              // read (subscribes)
count.set(5)         // write
count.update(n => n + 1)  // derive
count.peek()         // read WITHOUT subscribing

// computed<T>() — auto-tracked, memoized
const doubled = computed(() => count() * 2)

// effect() — re-runs when dependencies change
const dispose = effect(() => {
  console.log("Count:", count())
  onCleanup(() => console.log("cleaning up"))
})

// batch() — group 3+ writes into a single notification pass
batch(() => {
  count.set(10)
  count.set(20)  // subscribers fire once, with 20
})

// watch(source, callback) — explicit dependency tracking
watch(() => count(), (next, prev) => {
  console.log(\`changed from \${prev} to \${next}\`)
})

// createStore() — deeply reactive object (proxy-based)
const store = createStore({ todos: [{ text: 'Learn Pyreon', done: false }] })
store.todos[0].done = true  // fine-grained update, no immer needed

// untrack() — read signals without subscribing
effect(() => {
  const current = count()
  const other = untrack(() => otherSignal())  // won't re-run when otherSignal changes
})`,
  features: [
    'signal<T>() — callable function with .set() and .update()',
    'computed<T>() — auto-tracked memoized derivation',
    'effect() — side-effect that re-runs on dependency change',
    'batch() — group multiple writes into a single notification pass',
    'onCleanup() — register cleanup inside effects',
    'watch(source, callback) — explicit reactive watcher',
    'createStore() — deeply reactive proxy-based object',
    'createResource() — async data with signal-based status',
    'untrack() — read without subscribing',
    'Standalone — zero DOM, zero JSX, zero framework dependency',
  ],
  api: [
    {
      name: 'signal',
      kind: 'function',
      signature: '<T>(initialValue: T, options?: { name?: string }) => Signal<T>',
      summary:
        'Create a reactive signal. The returned value is a CALLABLE FUNCTION — `count()` reads (and subscribes), `count.set(v)` writes, `count.update(fn)` derives, `count.peek()` reads without subscribing. This is NOT a `.value` getter/setter pattern (React/Vue) — Pyreon signals are functions. Optional `{ name }` for debugging; auto-injected by `@pyreon/vite-plugin` in dev mode.',
      example: `const count = signal(0)
count()              // 0 (subscribes to updates)
count.set(5)         // sets to 5
count.update(n => n + 1)  // 6
count.peek()         // 6 (does NOT subscribe)`,
      mistakes: [
        '`count.value` — does not exist. Use `count()` to read',
        '`count = 5` — reassigning the variable replaces the signal, does not write to it. Use `count.set(5)`',
        '`signal(5)` called with an argument after creation — reads and ignores the argument (dev mode warns). Use `.set(5)` to write',
        '`const [val, setVal] = signal(0)` — signals are not destructurable tuples. The whole return value IS the signal',
        '`{count}` in JSX — renders the signal function itself, not its value. Use `{count()}` or `{() => count()}`',
        '`.peek()` inside `effect()` / `computed()` — bypasses tracking, creates stale reads. Only use `.peek()` for loop-prevention guards',
      ],
      seeAlso: ['computed', 'effect', 'batch'],
    },
    {
      name: 'computed',
      kind: 'function',
      signature: '<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }) => Computed<T>',
      summary:
        'Create a memoized derived value. Dependencies auto-tracked on each evaluation — no dependency array needed (unlike React `useMemo`). Only recomputes when a tracked signal actually changes. Custom `equals` function prevents downstream effects from firing on structurally-equal updates (default: `Object.is`).',
      example: `const count = signal(0)
const doubled = computed(() => count() * 2)
doubled()  // 0
count.set(5)
doubled()  // 10`,
      mistakes: [
        '`computed(() => count)` — must CALL the signal: `computed(() => count())`',
        'Using `computed()` for side effects — use `effect()` instead; computed is for pure derivation',
        'Expecting `computed()` to re-run when a `.peek()`-read signal changes — `.peek()` bypasses tracking',
      ],
      seeAlso: ['signal', 'effect'],
    },
    {
      name: 'effect',
      kind: 'function',
      signature: '(fn: () => (() => void) | void) => () => void',
      summary:
        'Run a side effect that auto-tracks signal dependencies and re-runs when they change. Returns a dispose function that unsubscribes. The effect function can return a cleanup callback (equivalent to calling `onCleanup()` inside the body) — the cleanup runs before each re-execution and on final dispose. For DOM-specific effects with lighter overhead, use `renderEffect()` instead.',
      example: `const count = signal(0)
const dispose = effect(() => {
  console.log("Count:", count())
  onCleanup(() => console.log("cleaning up"))
})
// Or return cleanup directly:
effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)
})`,
      mistakes: [
        'Passing a dependency array — Pyreon auto-tracks; no array needed',
        '`effect(() => { count })` — must call the signal: `effect(() => { count() })`',
        'Nesting `effect()` inside `effect()` — use `computed()` for derived values instead',
        'Creating signals inside an effect — they re-create on every run; create once outside',
      ],
      seeAlso: ['onCleanup', 'computed', 'renderEffect'],
    },
    {
      name: 'batch',
      kind: 'function',
      signature: '(fn: () => void) => void',
      summary:
        'Group multiple signal writes so subscribers fire only once — after the batch completes. Uses pointer swap (zero allocation). Essential when updating 3+ signals that downstream effects read together; without batch, each `.set()` triggers an independent notification pass.',
      example: `const a = signal(1)
const b = signal(2)
batch(() => {
  a.set(10)
  b.set(20)
})
// Effects that read both a() and b() fire once, not twice`,
      mistakes: [
        'Reading a signal inside `batch()` and expecting the NEW value before the batch completes — reads inside the batch see the new value (writes are synchronous), but effects fire only after the batch callback returns',
        'Forgetting `batch()` when updating 3+ related signals — causes N intermediate re-renders',
      ],
      seeAlso: ['signal', 'effect'],
    },
    {
      name: 'onCleanup',
      kind: 'function',
      signature: '(fn: () => void) => void',
      summary:
        'Register a cleanup function inside an `effect()` or `renderEffect()`. Runs before each re-execution of the effect (when dependencies change) and once on final dispose. Equivalent to returning a cleanup function from the effect body — both forms work, `onCleanup` is useful when you need to register cleanup at a different point than the end of the body.',
      example: `effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  onCleanup(() => window.removeEventListener("resize", handler))
})`,
      mistakes: [
        'Using `onCleanup` outside an effect — it only works inside `effect()` or `renderEffect()` body',
        'Confusing with `onUnmount` — `onCleanup` is for effects, `onUnmount` is for component lifecycle',
      ],
      seeAlso: ['effect'],
    },
    {
      name: 'watch',
      kind: 'function',
      signature: '<T>(source: () => T, callback: (next: T, prev: T) => void, options?: WatchOptions) => () => void',
      summary:
        'Explicit reactive watcher — tracks `source` and fires `callback` when it changes. Unlike `effect()`, the callback receives both `next` and `prev` values and does NOT auto-track signals read inside the callback body. `source` is evaluated at setup time to establish tracking; reading browser globals there still fires SSR lint rules. Returns a dispose function.',
      example: `watch(() => count(), (next, prev) => {
  console.log(\`changed from \${prev} to \${next}\`)
})`,
      mistakes: [
        'Reading browser globals in the `source` function — it runs at setup time (not just in mounted context), so `no-window-in-ssr` fires on `window.X` there',
        'Expecting signals read inside the `callback` to be tracked — only the `source` function establishes tracking; the callback is untracked',
      ],
      seeAlso: ['effect', 'computed'],
    },
    {
      name: 'createStore',
      kind: 'function',
      signature: '<T extends object>(initial: T) => T',
      summary:
        'Create a deeply reactive proxy-based object. Mutations at any depth trigger fine-grained updates — `store.todos[0].done = true` only re-runs effects that read `store.todos[0].done`, not effects that read `store.todos.length` or other items. No immer, no spread-copy, no `produce()` — just mutate. Works with nested objects, arrays, Maps, and Sets.',
      example: `const store = createStore({
  todos: [{ text: 'Learn Pyreon', done: false }],
  filter: 'all',
})
store.todos[0].done = true   // fine-grained — only 'done' subscribers fire
store.todos.push({ text: 'Build app', done: false })  // array methods work`,
      mistakes: [
        'Replacing the entire store object — `store = { ... }` replaces the variable, not the proxy. Mutate properties instead: `store.filter = "active"`',
        'Destructuring store properties at setup — `const { filter } = store` captures the value once, losing reactivity. Read `store.filter` inside reactive scopes',
        'Using `createStore` for simple scalar state — use `signal()` for primitives; `createStore` adds proxy overhead that only pays off for nested objects',
      ],
      seeAlso: ['signal'],
    },
    {
      name: 'untrack',
      kind: 'function',
      signature: '(fn: () => T) => T',
      summary:
        'Execute a function reading signals WITHOUT subscribing to them. Alias for `runUntracked`. Use inside effects when you need to read a signal\'s current value as a one-shot snapshot without the effect re-running when that signal changes.',
      example: `effect(() => {
  const current = count()        // tracked — effect re-runs on count change
  const other = untrack(() => otherSignal())  // NOT tracked — just reads the current value
})`,
      mistakes: [
        'Using `untrack` as the default — signals should be tracked by default; `untrack` is the escape hatch for specific optimization or loop-prevention cases',
      ],
      seeAlso: ['signal', 'effect'],
    },
  ],
  gotchas: [
    {
      label: 'Signals are callable functions',
      note: 'Pyreon signals are NOT `.value` getters (Vue ref) or `[state, setState]` tuples (React useState). The signal IS the function: `count()` reads, `count.set(v)` writes, `count.update(fn)` derives. This is the #1 confusion for developers coming from other frameworks.',
    },
    {
      label: 'No dependency arrays',
      note: '`effect()` and `computed()` auto-track dependencies on each execution — no `[dep1, dep2]` array needed. Every signal read inside the body is a tracked dependency. This means conditional reads (`if (cond()) { return x() }`) only track `x` when `cond()` is true.',
    },
    {
      label: 'Standalone',
      note: '`@pyreon/reactivity` has zero dependencies. Use it in Node/Bun scripts, edge workers, or any JavaScript environment without pulling in the rest of the framework. `@pyreon/core` and `@pyreon/runtime-dom` build on it but are not required.',
    },
  ],
})

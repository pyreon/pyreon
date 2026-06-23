/**
 * Pyreon API reference database — structured documentation for every public export.
 * Used by the MCP server's get_api tool and the llms.txt generator.
 *
 * Format: "package/symbol" → { signature, example, notes?, mistakes? }
 */

export interface ApiEntry {
  signature: string
  example: string
  notes?: string
  mistakes?: string
}

export const API_REFERENCE: Record<string, ApiEntry> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/reactivity
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/reactivity>

  'reactivity/signal': {
    signature: '<T>(initialValue: T, options?: { name?: string }) => Signal<T>',
    example: `const count = signal(0)
count()              // 0 (subscribes to updates)
count.set(5)         // sets to 5
count.update(n => n + 1)  // 6
count.peek()         // 6 (does NOT subscribe)`,
    notes: 'Create a reactive signal. The returned value is a CALLABLE FUNCTION — `count()` reads (and subscribes), `count.set(v)` writes, `count.update(fn)` derives, `count.peek()` reads without subscribing. This is NOT a `.value` getter/setter pattern (React/Vue) — Pyreon signals are functions. Optional `{ name }` for debugging; auto-injected by `@pyreon/vite-plugin` in dev mode. See also: computed, effect, batch.',
    mistakes: `- \`count.value\` — does not exist. Use \`count()\` to read
- \`count = 5\` — reassigning the variable replaces the signal, does not write to it. Use \`count.set(5)\`
- \`signal(5)\` called with an argument after creation — reads and ignores the argument (dev mode warns). Use \`.set(5)\` to write
- \`const [val, setVal] = signal(0)\` — signals are not destructurable tuples. The whole return value IS the signal
- \`{count}\` in JSX — renders the signal function itself, not its value. Use \`{count()}\` or \`{() => count()}\`
- \`.peek()\` inside \`effect()\` / \`computed()\` — bypasses tracking, creates stale reads. Only use \`.peek()\` for loop-prevention guards`,
  },

  'reactivity/isServer': {
    signature: 'const isServer: boolean',
    example: `import { isServer } from '@pyreon/reactivity'
if (isServer) return // bail on the server
window.addEventListener('resize', onResize)`,
    notes: `Canonical runtime environment flag — \`true\` when there is no DOM (\`typeof document === 'undefined'\`), i.e. during SSR / in a Node or edge worker. \`typeof document\` is the reliable "is there a DOM" discriminator; it is more correct than \`typeof window\`, which misreports Deno and polyfilled-Node setups. A plain constant evaluated once at module load — correct in every runtime with zero bundler configuration. Use it for small environment guards (module-level singletons, lazy globals, render output that differs server vs client). \`isClient\` is its inverse. See also: isClient.`,
    mistakes: `- Rolling your own \`const isBrowser = typeof window !== 'undefined'\` instead — \`typeof window\` misreports Deno / polyfilled Node; import \`isServer\` / \`isClient\`
- Reaching for \`isClient\` to gate DOM access inside a component — prefer \`onMount\` / \`effect\`, which never run during SSR
- Putting heavy server-only code behind \`isServer\` in a client-imported module — it still ships to the client bundle; use a \`/server\` subpath export instead`,
  },

  'reactivity/isClient': {
    signature: 'const isClient: boolean',
    example: `import { isClient } from '@pyreon/reactivity'
const initial = isClient ? navigator.onLine : true`,
    notes: `Inverse of \`isServer\` — \`true\` on a browser main thread where a DOM is available (\`typeof document !== 'undefined'\`). A plain constant evaluated once at module load. Use it for small environment guards; for DOM access inside a component prefer \`onMount\` / \`effect\` (which never run during SSR). See also: isServer.`,
    mistakes: `- Rolling your own \`const isBrowser = typeof window !== 'undefined'\` instead — import \`isClient\`
- Using \`isClient\` to defer DOM work that belongs in \`onMount\` / \`effect\``,
  },

  'reactivity/computed': {
    signature: '<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }) => Computed<T>',
    example: `const count = signal(0)
const doubled = computed(() => count() * 2)
doubled()  // 0
count.set(5)
doubled()  // 10`,
    notes: 'Create a memoized derived value. Dependencies auto-tracked on each evaluation — no dependency array needed (unlike React `useMemo`). Only recomputes when a tracked signal actually changes. Custom `equals` function prevents downstream effects from firing on structurally-equal updates (default: `Object.is`). See also: signal, effect.',
    mistakes: `- \`computed(() => count)\` — must CALL the signal: \`computed(() => count())\`
- Using \`computed()\` for side effects — use \`effect()\` instead; computed is for pure derivation
- Expecting \`computed()\` to re-run when a \`.peek()\`-read signal changes — \`.peek()\` bypasses tracking`,
  },

  'reactivity/effect': {
    signature: '(fn: () => (() => void) | void) => () => void',
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
    notes: 'Run a side effect that auto-tracks signal dependencies and re-runs when they change. Returns a dispose function that unsubscribes. The effect function can return a cleanup callback (equivalent to calling `onCleanup()` inside the body) — the cleanup runs before each re-execution and on final dispose. For DOM-specific effects with lighter overhead, use `renderEffect()` instead. See also: onCleanup, computed, renderEffect.',
    mistakes: `- Passing a dependency array — Pyreon auto-tracks; no array needed
- \`effect(() => { count })\` — must call the signal: \`effect(() => { count() })\`
- Nesting \`effect()\` inside \`effect()\` — use \`computed()\` for derived values instead
- Creating signals inside an effect — they re-create on every run; create once outside`,
  },

  'reactivity/renderEffect': {
    signature: '(fn: () => void) => () => void',
    example: `// Inside a custom DOM helper that updates a text node:
const node = document.createTextNode('')
const dispose = renderEffect(() => {
  node.data = String(count())
})
// Re-runs only when count() changes; lighter than effect() but no
// onCleanup support, no scope auto-disposal, no error-handler routing.`,
    notes: `DOM-specific effect with a lighter dependency tracking path — uses a local array for deps instead of the full \`EffectScope\` integration. Used internally by \`_bind\` / \`_tpl\` for compiled-template DOM updates. **Prefer \`effect()\` for general use**; reach for \`renderEffect()\` only when you're hand-writing DOM update logic and have measured the overhead difference. Returns a dispose function (not an \`Effect\` object — different shape from \`effect()\`). See also: effect, computed.`,
    mistakes: `- Calling \`onCleanup()\` inside \`renderEffect()\` — not supported; only \`effect()\` collects cleanups. Use \`effect()\` if you need cleanup callbacks
- Expecting \`renderEffect()\` to auto-dispose with the surrounding scope — it does NOT register with \`EffectScope\`. Component-scoped DOM effects should use \`effect()\` so they tear down on unmount
- Reaching for \`renderEffect()\` as the default — \`effect()\` is the canonical primitive. The performance delta only matters in extreme hot paths (1000+ DOM nodes), never in component-level code`,
  },

  'reactivity/batch': {
    signature: '(fn: () => void) => void',
    example: `const a = signal(1)
const b = signal(2)
batch(() => {
  a.set(10)
  b.set(20)
})
// Effects that read both a() and b() fire once, not twice`,
    notes: 'Group multiple signal writes so subscribers fire only once — after the batch completes. Uses pointer swap (zero allocation). Essential when updating 3+ signals that downstream effects read together; without batch, each `.set()` triggers an independent notification pass. See also: signal, effect.',
    mistakes: `- Reading a signal inside \`batch()\` and expecting the NEW value before the batch completes — reads inside the batch see the new value (writes are synchronous), but effects fire only after the batch callback returns
- Forgetting \`batch()\` when updating 3+ related signals — causes N intermediate re-renders`,
  },

  'reactivity/nextTick': {
    signature: '() => Promise<void>',
    example: `count.set(5)
// Effects haven't run yet (sync writes are queued)
await nextTick()
// Now everything is flushed — DOM reflects count = 5
expect(node.textContent).toBe('5')`,
    notes: `Returns a promise that resolves after the next microtask. Use to await pending reactive updates — every signal write that happens before \`nextTick()\` is fully flushed (effects ran, computeds settled, DOM patched) by the time the promise resolves. Equivalent to Vue's \`nextTick\`. Useful in tests and in code that needs to read the post-update DOM state. See also: batch.`,
    mistakes: `- Awaiting \`nextTick()\` inside a \`batch()\` callback — pointless; the batch flushes when the callback returns, not when the microtask drains. Move the await outside \`batch()\`
- Using \`nextTick()\` to defer work — it doesn't schedule anything; it just resolves on the next microtask. Use \`setTimeout\` / \`requestAnimationFrame\` for actual deferral`,
  },

  'reactivity/onCleanup': {
    signature: '(fn: () => void) => void',
    example: `effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  onCleanup(() => window.removeEventListener("resize", handler))
})`,
    notes: 'Register a cleanup function inside an `effect()` or `renderEffect()`. Runs before each re-execution of the effect (when dependencies change) and once on final dispose. Equivalent to returning a cleanup function from the effect body — both forms work, `onCleanup` is useful when you need to register cleanup at a different point than the end of the body. See also: effect.',
    mistakes: `- Using \`onCleanup\` outside an effect — it only works inside \`effect()\` or \`renderEffect()\` body
- Confusing with \`onUnmount\` — \`onCleanup\` is for effects, \`onUnmount\` is for component lifecycle`,
  },

  'reactivity/watch': {
    signature: '<T>(source: () => T, callback: (next: T, prev: T) => void, options?: WatchOptions) => () => void',
    example: `watch(() => count(), (next, prev) => {
  console.log(\`changed from \${prev} to \${next}\`)
})`,
    notes: 'Explicit reactive watcher — tracks `source` and fires `callback` when it changes. Unlike `effect()`, the callback receives both `next` and `prev` values and does NOT auto-track signals read inside the callback body. `source` is evaluated at setup time to establish tracking; reading browser globals there still fires SSR lint rules. Returns a dispose function. See also: effect, computed.',
    mistakes: `- Reading browser globals in the \`source\` function — it runs at setup time (not just in mounted context), so \`no-window-in-ssr\` fires on \`window.X\` there
- Expecting signals read inside the \`callback\` to be tracked — only the \`source\` function establishes tracking; the callback is untracked
- Forgetting to return a cleanup function from the callback — \`watch\` honors a returned function as a cleanup that runs before each re-run AND on dispose. Useful for cancelling in-flight requests, clearing timers, or removing listeners attached on the previous run`,
  },

  'reactivity/createSelector': {
    signature: '<T>(source: () => T) => (value: T) => boolean',
    example: `const selectedId = signal<string | null>(null)
const isSelected = createSelector(() => selectedId())

// In each row's render — O(1) selection updates regardless of N rows:
<For each={rows} by={r => r.id}>{row => (
  <li class={isSelected(row.id) ? 'selected' : ''}>
    {row.label}
  </li>
)}</For>`,
    notes: `Create an O(1) equality selector — returns a reactive predicate that fires only when the previously-selected and newly-selected values' subscribers are affected. Unlike a plain \`() => source() === value\` (which re-evaluates for every row in a list), this only triggers TWO subscribers per source change (deselected + newly selected) regardless of list size. Critical for keyed-list selection patterns. See also: signal, computed.`,
    mistakes: `- Using a plain \`() => source() === value\` in lists — every row subscribes to source; selecting a row notifies ALL N rows (O(N))
- Calling \`isSelected\` outside a reactive scope — returns the current value but doesn't subscribe
- Using \`createSelector\` for non-equality predicates — it's purpose-built for \`===\` matching; for ranges or filters, use \`computed()\``,
  },

  'reactivity/cell': {
    signature: '<T>(value: T) => Cell<T>',
    example: `import { cell } from '@pyreon/reactivity'

// Create a cell:
const label = cell('Initial')

// Read (no tracking — read inside an effect does NOT subscribe):
label.peek()             // 'Initial'

// Write:
label.set('Updated')
label.update(s => s + '!')

// Subscribe directly (returns disposer):
const dispose = label.subscribe(() => console.log(label.peek()))

// Fire-and-forget — no disposer (saves 1 closure allocation):
label.listen(() => console.log('changed'))`,
    notes: `Lightweight reactive primitive — class-based alternative to \`signal()\`. **1 object allocation vs \`signal()\`'s ~6 closures**, single-listener fast path (no Set allocated when ≤1 subscriber), methods on prototype shared across instances. **NOT callable as a getter** — does not integrate with effect dependency tracking. Use when you need reactive state but plan to subscribe directly via \`.subscribe()\` / \`.listen()\`, NOT via \`effect()\`. Ideal for keyed-list row labels where the subscription lifetime equals the row's lifetime. See also: signal.`,
    mistakes: `- Using \`label()\` to read — Cells are NOT callable. Use \`label.peek()\` to read
- Reading \`label.peek()\` inside \`effect()\` and expecting tracked re-runs — Cells don't integrate with effect tracking. Use \`signal()\` if you need automatic dependency tracking
- Using \`cell()\` for ALL reactive state — only switch from \`signal()\` when you've measured allocation pressure (1000+ instances) AND you don't need effect-based subscriptions`,
  },

  'reactivity/createStore': {
    signature: '<T extends object>(initial: T) => T',
    example: `const store = createStore({
  todos: [{ text: 'Learn Pyreon', done: false }],
  filter: 'all',
})
store.todos[0].done = true   // fine-grained — only 'done' subscribers fire
store.todos.push({ text: 'Build app', done: false })  // array methods work`,
    notes: 'Create a deeply reactive proxy-based object. Mutations at any depth trigger fine-grained updates — `store.todos[0].done = true` only re-runs effects that read `store.todos[0].done`, not effects that read `store.todos.length` or other items. No immer, no spread-copy, no `produce()` — just mutate. Works with nested plain objects and arrays. Built-in types with internal slots (`Map`, `Set`, `WeakMap`, `WeakSet`, `Date`, `RegExp`, `Promise`, `Error`) are returned raw and are NOT deeply reactive — they fail the Proxy internal-slot check on every method call. Replace the whole field (`store.users = new Map(store.users)`) to trigger reactivity for these. See also: signal.',
    mistakes: `- Replacing the entire store object — \`store = { ... }\` replaces the variable, not the proxy. Mutate properties instead: \`store.filter = "active"\`
- Destructuring store properties at setup — \`const { filter } = store\` captures the value once, losing reactivity. Read \`store.filter\` inside reactive scopes
- Using \`createStore\` for simple scalar state — use \`signal()\` for primitives; \`createStore\` adds proxy overhead that only pays off for nested objects
- Expecting fine-grained reactivity inside Map/Set/Date/RegExp/Promise — these are returned raw because Proxy can't intercept methods that rely on internal slots. Mutating the raw instance (\`store.users.set(...)\`) does NOT notify subscribers. Replace the whole field (\`store.users = new Map(store.users)\`) to trigger reactivity`,
  },

  'reactivity/createResource': {
    signature: '<T, P>(source: () => P, fetcher: (param: P) => Promise<T>) => Resource<T>',
    example: `const userId = signal(1)
const user = createResource(
  () => userId(),
  (id) => fetch(\`/api/users/\${id}\`).then(r => r.json()),
)
effect(() => {
  if (user.loading()) return
  if (user.error()) return console.error(user.error())
  console.log(user.data())
})
userId.set(2)            // auto-refetches
user.refetch()           // explicit refetch with current source
user.dispose()           // stop tracking, discard in-flight response`,
    notes: 'Async data primitive. Auto-fetches whenever `source()` changes — `data`, `loading`, `error` are signals readable inside effects. Stale-response guarded via internal `requestId` (typing fast then slow does not flicker old data). `refetch()` re-runs the fetcher with the current source value. **`dispose()` MUST be called for resources created outside an `EffectScope`** — otherwise the source-tracking effect leaks for the lifetime of the program. See also: signal, effect, effectScope.',
    mistakes: `- Forgetting \`dispose()\` for resources outside an EffectScope — the internal source-tracking effect runs forever, leaking memory and unbounded fetch calls on source changes
- Calling \`refetch()\` after \`dispose()\` — silently no-ops; check disposed state on your end if needed
- Reading \`data()\` without checking \`loading()\` / \`error()\` — undefined values flow through; gate the read on those signals
- Expecting an in-flight response to update the resource AFTER \`dispose()\` — the response is discarded by design (stale-id check), \`loading\` may stay frozen at its dispose-time value
- Reading signals INSIDE the fetcher and expecting tracked re-runs — only \`source()\` is tracked; signals read inside \`fetcher\` are read once per call without subscription`,
  },

  'reactivity/reconcile': {
    signature: '<T extends object>(source: T, target: T) => void',
    example: `const state = createStore({ user: { name: 'Alice', age: 30 }, items: [] })

// API response arrives — pure replacement payload:
reconcile(
  { user: { name: 'Alice', age: 31 }, items: [{ id: 1 }] },
  state,
)
// → only state.user.age signal fires (name unchanged)
// → state.items[0] is newly created, length signal fires`,
    notes: 'Surgically diff a new value into an existing `createStore` proxy. Walks both trees in parallel and only calls `.set()` on signals whose value actually changed — unchanged subtrees do NOT re-run their effects. Ideal for applying API responses to a long-lived store: only the truly-changed fields trigger updates, even if you receive a fully-replacement payload from the server. Arrays reconcile by index; excess elements are removed. See also: createStore, signal.',
    mistakes: `- Passing a non-store as \`target\` — \`reconcile\` requires a \`createStore\` proxy; for plain objects, just assign
- Expecting reconciliation by key for arrays — arrays are reconciled BY INDEX. For keyed list reconciliation, use a Map keyed by id and reconcile each entry by key, OR replace the array reference (which \`<For>\` reconciles via \`by\`)
- Using \`reconcile\` inside an effect — it triggers writes; you'd cycle. Call it outside reactive scopes (e.g. in a query callback or event handler)`,
  },

  'reactivity/isStore': {
    signature: '(value: unknown) => boolean',
    example: `const a = createStore({ x: 1 })
const b = { x: 1 }
isStore(a)  // true
isStore(b)  // false
isStore(null)  // false (null-safe)`,
    notes: 'Type guard — returns `true` if the value is a `createStore` proxy (recognized via an internal symbol marker). Use to differentiate reactive stores from plain objects in code that handles both shapes (e.g. helpers that conditionally `reconcile()` vs assign). See also: createStore, reconcile.',
    mistakes: `- Using \`isStore\` to detect ANY proxy — it's specific to Pyreon's store proxies. Other proxies return \`false\`
- Calling on \`null\` / \`undefined\` and expecting a throw — null-safe; returns \`false\``,
  },

  'reactivity/shallowReactive': {
    signature: '<T extends object>(initial: T) => T',
    example: `const store = shallowReactive({ user: { name: 'Alice' }, count: 0 })
effect(() => store.count)        // tracks store.count
effect(() => store.user)         // tracks store.user reference (not its contents)
store.user.name = 'Bob'          // does NOT trigger any effect (nested mutation)
store.count = 5                  // triggers count effect
store.user = { name: 'Bob' }     // triggers user effect (reference replacement)`,
    notes: 'Create a SHALLOW reactive store — only top-level mutations trigger updates. Nested objects are NOT auto-wrapped; reading a nested object returns the raw reference, and mutating it does NOT trigger any effect. Replacing the top-level reference DOES trigger reactivity. Use when nested data is immutable (frozen API responses), when you want explicit control over which subtrees are reactive, or when you need to store class instances/third-party objects without paying the deep-proxy overhead. Vue 3 parity. See also: createStore, markRaw.',
    mistakes: `- Expecting nested mutations to trigger effects — they don't. Use \`createStore\` if you need deep reactivity, or replace the top-level reference (\`store.user = { ...store.user, name: 'Bob' }\`)
- Mixing shallow + deep on the same raw object — \`createStore(raw)\` and \`shallowReactive({ wrapper: raw })\` produce DIFFERENT proxies (separate caches). Pick one shape per data flow`,
  },

  'reactivity/markRaw': {
    signature: '<T extends object>(value: T) => T',
    example: `import { markRaw, createStore } from '@pyreon/reactivity'

class Editor { /* ... */ }
const ed = markRaw(new Editor())   // skips proxy
const store = createStore({ editor: ed })
store.editor === ed                 // true — raw reference preserved
store.editor.someMethod()           // works — class methods see real receiver`,
    notes: `Mark an object as RAW — \`createStore\` and \`shallowReactive\` will return it unwrapped. Useful for class instances, third-party objects, DOM nodes, or any shape that shouldn't be deeply proxied (Vue 3 parity). Marking is one-way: there's no \`unmarkRaw\`. Mark BEFORE the object enters a store; marking after wrap doesn't unwrap an existing proxy. See also: createStore, shallowReactive.`,
    mistakes: `- Marking an object AFTER it's been wrapped — the existing proxy is unaffected. Mark before the object enters any store
- Expecting \`markRaw(obj)\` to return a different object — it mutates \`obj\` and returns the SAME reference (with the marker symbol attached)
- Using markRaw on plain data objects to "skip" deep wrap — for that, use \`shallowReactive\`. markRaw is for class instances and externally-managed shapes`,
  },

  'reactivity/untrack': {
    signature: '(fn: () => T) => T',
    example: `effect(() => {
  const current = count()        // tracked — effect re-runs on count change
  const other = untrack(() => otherSignal())  // NOT tracked — just reads the current value
})`,
    notes: `Execute a function reading signals WITHOUT subscribing to them. Alias for \`runUntracked\`. Use inside effects when you need to read a signal's current value as a one-shot snapshot without the effect re-running when that signal changes. See also: signal, effect.`,
    mistakes: '- Using `untrack` as the default — signals should be tracked by default; `untrack` is the escape hatch for specific optimization or loop-prevention cases',
  },

  'reactivity/effectScope': {
    signature: '() => EffectScope',
    example: `import { effectScope, signal, effect } from '@pyreon/reactivity'

const scope = effectScope()
const count = signal(0)

scope.runInScope(() => {
  effect(() => console.log(count()))    // tracked by scope
})

count.set(5)   // logs 5
scope.stop()   // tears down all effects in the scope
count.set(10)  // no log — effect was disposed`,
    notes: `Create an \`EffectScope\` — a container that auto-tracks effects/computeds created inside \`scope.runInScope(fn)\` and disposes them all at once via \`scope.stop()\`. \`@pyreon/core\`'s \`mountReactive\` uses this internally for component lifetime management. **Always use a scope for effects created outside a component's setup phase** (e.g. in event handlers, route loaders, or async-await chains) — without one, effects leak for the lifetime of the program. See also: effect, getCurrentScope, onScopeDispose.`,
    mistakes: `- Forgetting \`scope.stop()\` — effects leak for the lifetime of the program; same shape as forgetting \`dispose()\` on a top-level \`effect()\`
- Creating effects outside \`runInScope(fn)\` and expecting them to be tracked — effects must run during the synchronous body of \`runInScope\` to register with the scope
- Stopping a scope that has pending updates — in-flight microtasks may still fire \`onUpdate\` hooks; design for idempotency or check \`isActive\` before writes`,
  },

  'reactivity/onScopeDispose': {
    signature: '(fn: () => void) => void',
    example: `scope.runInScope(() => {
  const ws = new WebSocket(url)
  onScopeDispose(() => ws.close())
  // ws.close() runs when scope.stop() is called
})`,
    notes: 'Register a callback to run when the current `EffectScope` stops. Vue 3 parity. Captures the AMBIENT scope at registration time, so it must be called inside `scope.runInScope(fn)`. Calling outside any scope is a no-op (with a dev warning). Use for resource cleanup tied to scope lifetime — timers, listeners, external subscriptions. Equivalent to `getCurrentScope()?.add({ dispose: fn })` but without the boilerplate. See also: effectScope, getCurrentScope, onCleanup.',
    mistakes: `- Calling outside any scope — silently no-ops in production, dev warns. The callback is dropped on the floor; verify with \`getCurrentScope()\` before calling if scope is uncertain
- Expecting the callback to run on EFFECT cleanup — \`onScopeDispose\` fires only on \`scope.stop()\`. For per-effect cleanup, use \`onCleanup()\` inside the effect body or return a cleanup function from it
- Using outside \`runInScope\` and inside an effect callback — the effect captures whatever scope was ambient when the effect SET UP, not when the registration runs. Effects re-run later may see a different ambient scope; register at setup, not in the body`,
  },

  'reactivity/getCurrentScope': {
    signature: '() => EffectScope | null',
    example: `import { getCurrentScope } from '@pyreon/reactivity'

function myReactiveResource() {
  const scope = getCurrentScope()
  if (scope) {
    // Inside a component — register cleanup with the component's scope
    scope.add({ dispose: cleanup })
  } else {
    // Top-level / standalone — caller must call dispose() manually
    console.warn('myReactiveResource: no active scope; remember to dispose')
  }
}`,
    notes: `Returns the currently active \`EffectScope\` (the one whose \`runInScope(fn)\` is on the stack), or \`null\` if no scope is active. Use to register cleanup with the surrounding scope, or to detect "am I inside a component lifetime?" — useful for library code that wants to register an effect with the consumer's scope rather than the global one. See also: effectScope, setCurrentScope.`,
    mistakes: `- Calling \`getCurrentScope()\` outside any scope and expecting a default — returns \`null\`. Handle the no-scope case explicitly
- Using \`getCurrentScope()\` as a substitute for \`effectScope()\` — it returns the AMBIENT scope, not a fresh one`,
  },

  'reactivity/setCurrentScope': {
    signature: '(scope: EffectScope | null) => void',
    example: `// Inside a custom render boundary that needs to swap scopes mid-flow:
const prev = getCurrentScope()
setCurrentScope(myScope)
try {
  doWork()
} finally {
  setCurrentScope(prev)
}
// Or — preferred:
myScope.runInScope(() => doWork())`,
    notes: '**Low-level escape hatch** — directly set the ambient `EffectScope`. Use only when implementing scope-aware framework primitives (e.g. `mountReactive`, custom render boundaries). Most code should use `scope.runInScope(fn)` which sets and restores via try/finally. Pairing `setCurrentScope(s)` with a manual `setCurrentScope(prev)` is error-prone — `runInScope` is the safe form. See also: effectScope, getCurrentScope.',
    mistakes: `- Forgetting to restore the previous scope — leaks effects to the wrong owner forever
- Using \`setCurrentScope\` instead of \`runInScope\` in user code — the safe API is \`runInScope\``,
  },

  'reactivity/onSignalUpdate': {
    signature: '(listener: (event: { signal, name, prev, next, stack, timestamp }) => void) => () => void',
    example: `import { onSignalUpdate, signal } from '@pyreon/reactivity'

const dispose = onSignalUpdate(e => {
  console.log(\`\${e.name ?? '(anonymous)'}: \${e.prev} → \${e.next}\`)
})
const count = signal(0, { name: 'count' })
count.set(5)   // logs: count: 0 → 5
dispose()      // remove listener`,
    notes: 'Register a global trace listener that fires on every signal write. Returns a disposer. **Dev/debug only** — every signal write incurs the listener call. Use for time-travel debugging, recording reactive transcripts in tests, or building devtools panels. Multiple listeners are supported (each gets every event). See also: inspectSignal, why.',
    mistakes: `- Leaving \`onSignalUpdate\` registered in production — fires on EVERY signal write, even hot-path internal ones. Always dispose when done
- Throwing inside the listener — corrupts the signal's notification flow (the listener fires after \`_v\` is updated but before subscribers are notified). Wrap your handler in try/catch
- Expecting the event to capture writes that occur via batch flushes — the event fires per \`set()\` call, regardless of batch state`,
  },

  'reactivity/inspectSignal': {
    signature: '<T>(sig: Signal<T>) => SignalDebugInfo<T>',
    example: `const count = signal(0, { name: 'count' })
inspectSignal(count)
// Console group:
//   🔍 Signal "count"
//     value: 0
//     subscribers: 2`,
    notes: 'Inspect a signal — pretty-prints its current value, name, and subscriber count to the console (in a `console.group`) and returns the debug info object. Useful for one-shot inspection while debugging; for continuous tracing use `onSignalUpdate`. See also: onSignalUpdate, why.',
    mistakes: '- Calling `inspectSignal` in production — produces console noise. Gate calls behind `if (import.meta.env.DEV)` or `__DEV__`',
  },

  'reactivity/why': {
    signature: '() => void',
    example: `why()         // arm tracer
clickButton()  // any signal writes here are captured
why()         // disarm + dump transcript:
//   [pyreon:why] "filter": "all" → "active" (12 subscribers)
//   [pyreon:why] "scrollY": 0 → 240 (1 subscriber)`,
    notes: 'Toggle a global "why-did-it-update?" tracer that logs every signal write between consecutive calls. Calling once arms the tracer; calling again disarms it and dumps the captured transcript. **Dev/debug only.** Useful for hunting "why did this effect just re-run?" — wrap a suspicious operation, call `why()` before and after, see exactly which signals changed. See also: onSignalUpdate, inspectSignal.',
    mistakes: `- Calling \`why()\` once and forgetting to call it again — keeps tracing forever, leaks the listener, prints nothing until disarmed
- Using \`why()\` in production — pure dev tool`,
  },

  'reactivity/getReactiveTrace': {
    signature: '() => Array<{ name: string | undefined; prev: string; next: string; timestamp: number }>',
    example: `import { getReactiveTrace, clearReactiveTrace, signal } from '@pyreon/reactivity'

const status = signal('idle', { name: 'status' })
status.set('submitting')
getReactiveTrace()
// [{ name: 'status', prev: '"idle"', next: '"submitting"', timestamp: 1234.5 }]
clearReactiveTrace()  // → []`,
    notes: 'Returns the last ~50 signal writes (chronological, oldest → newest) from a bounded dev-only ring buffer — the causal SEQUENCE of reactive state changes, not a point-in-time snapshot. `@pyreon/core` attaches this to `ErrorContext.reactiveTrace` automatically so error reports carry "what changed in the run-up to the crash". Entries hold bounded string previews of values (never raw refs — no memory pinning, always serializable). **Dev-only**: the recorder feeding the buffer is behind the production dead-code gate and tree-shakes out, so this returns `[]` in prod builds. Distinct from `onSignalUpdate` — that is opt-in and captures stacks; this is always-on, deliberately cheap, and exists to enrich error reports. `clearReactiveTrace()` resets it (test isolation). See also: onSignalUpdate, inspectSignal.',
    mistakes: `- Expecting it to return signal VALUES — it returns string PREVIEWS (truncated, safely stringified). For live values inspect the signal directly
- Relying on it in production — returns \`[]\` (the recorder is dev-gated and tree-shaken). Use it for dev tooling / error-report enrichment, not runtime logic
- Treating it as a snapshot of all signals — it is a bounded ring of recent WRITES; signals never written (or written before the ~50-entry window) are absent`,
  },

  'reactivity/setErrorHandler': {
    signature: '(fn: (err: unknown) => void) => void',
    example: `setErrorHandler(err => {
  reportToSentry(err)
  toast.error('Something went wrong')
})

effect(() => {
  if (count() > 100) throw new Error('count too high')
})
count.set(101)  // logs/reports via handler instead of crashing`,
    notes: 'Register a global handler for unhandled errors thrown inside `effect()` / `computed()` / `renderEffect()`. Without a handler, errors are logged to `console.error` and the effect re-throws (potentially crashing the surrounding frame). With one, the framework calls your handler with the thrown value and continues. Use for telemetry / error-boundary integration. **One handler only — calling twice replaces the first.** See also: effect, renderEffect.',
    mistakes: `- Calling \`setErrorHandler\` multiple times and expecting all to fire — the second call REPLACES the first. Compose multiple handlers manually if you need a chain
- Throwing inside the handler — the framework will swallow this too, but you lose visibility. Make handlers no-throw (try/catch internally if needed)
- Expecting the handler to receive errors from \`signal.set()\` writes — only effect-runtime errors are routed. Synchronous errors at write time bubble up normally`,
  },

  'reactivity/activateReactiveDevtools': {
    signature: 'activateReactiveDevtools(): void  ·  deactivateReactiveDevtools(): void  ·  isReactiveDevtoolsActive(): boolean',
    example: `import { activateReactiveDevtools, getReactiveGraph } from '@pyreon/reactivity'

// Only AFTER activation are subsequently-created signals tracked.
activateReactiveDevtools()
const price = signal(10, { name: '$price' })
const total = computed(() => price() * 2)
effect(() => total())
getReactiveGraph().nodes // → [$price (signal), derived, effect]
deactivateReactiveDevtools() // → registry cleared`,
    notes: 'Opt-in lifecycle for the reactive-devtools bridge — the live signal/computed/effect graph the `@pyreon/devtools` Signals/Graph/Effects/Profiler tabs consume (surfaced on the browser hook as `window.__PYREON_DEVTOOLS__.reactive`). **Zero cost until activated**: every per-primitive instrumentation point early-returns on the inactive flag and sits inside the production dead-code gate, so it tree-shakes out of prod builds entirely (locked by a minified-bundle test) and, in dev, costs one predicted-false branch until a devtools client calls `activate()` — the same risk profile as the adjacent reactive-trace / perf-harness calls. `deactivate()` drops all retained registry + fire-buffer state (a closed panel leaves zero residue). Leak-free by construction: nodes are held via `WeakRef` + `FinalizationRegistry`, never pinned. See also: getReactiveGraph, onSignalUpdate, getReactiveTrace.',
    mistakes: `- Expecting nodes created BEFORE \`activate()\` to appear — registration is gated on the active flag (mirrors a devtools panel attaching). Activate first, then build/observe the graph
- Calling it in production for app logic — the whole bridge is dev-gated and tree-shaken; \`getReactiveGraph()\` returns an empty graph in prod builds
- Assuming it tracks compiler-emitted DOM bindings — only user \`signal()\` / \`computed()\` / \`effect()\` are registered; \`renderEffect\` / \`_bind\` plumbing is intentionally excluded (it would flood the graph and tax the hottest path)`,
  },

  'reactivity/getReactiveGraph': {
    signature: 'getReactiveGraph(): { nodes: ReactiveNode[]; edges: { from: number; to: number }[] }  ·  getReactiveFires(): { id: number; ts: number }[]',
    example: `activateReactiveDevtools()
const a = signal(1, { name: '$a' })
const b = computed(() => a() + 1)
effect(() => b())
a.set(2)
getReactiveGraph()
// nodes: [{ name:'$a', kind:'signal', value:'2', … }, { kind:'derived', … }, { kind:'effect', … }]
// edges: [{ from:$a, to:derived }, { from:derived, to:effect }]
getReactiveFires() // → [{ id, ts }, …]  (bounded, chronological)`,
    notes: 'Fresh snapshot of the live reactive graph + a bounded recent-fire timeline, for the reactive-devtools tabs. `getReactiveGraph()` returns every tracked node (`{ id, kind: "signal"|"derived"|"effect", name, value, subscribers, fires, lastFire }`) plus dependency edges recomputed on demand from the real subscriber `_s` Sets (source → subscriber: signal→derived, derived→effect) — always consistent with the framework’s actual subscription state, no incremental drift. `getReactiveFires()` returns a fixed-size ring buffer of recent fires (`{ id, ts }`, oldest → newest) powering the Effects/Profiler tabs. Both require `activateReactiveDevtools()` first and return empty otherwise. Names come from `signal(v, { name })` / the vite-plugin dev auto-naming; anonymous computeds/effects get a synthetic `derived#id` / `effect#id`. See also: activateReactiveDevtools, getReactiveTrace, onSignalUpdate.',
    mistakes: `- Holding the returned arrays expecting them to update — they are point-in-time snapshots; call again (the devtools panel polls)
- Reading \`node.value\` for non-string state as the real value — it is a bounded, safely-stringified PREVIEW (never a raw ref — no pinning). Inspect the signal directly for the live value
- Expecting fires for every write in a long-running app — \`getReactiveFires()\` is a fixed-size ring; older entries roll off`,
  },

  'reactivity/wrapSignal': {
    signature: '<T>(base: Signal<T>, options: WrapSignalOptions<T>) => Signal<T>',
    example: `const base = signal(0)
const wrapped = wrapSignal(base, {
  set: (v) => {
    base.set(v)
    localStorage.setItem('key', JSON.stringify(v))
  },
})
wrapped.set(5)  // writes through custom logic
console.log(wrapped())  // 5 (reads from base)`,
    notes: `Create a signal facade over a base signal with custom write behavior. The canonical way to build a signal whose write runs a side effect (persistence, validation, patch emission). Reads and the internal \`_v\` field are delegated to \`base\`, so the facade satisfies the full signal contract the compiler's fast paths depend on — a facade that exposes \`.direct()\` but forgets \`_v\` (or vice-versa) silently binds to \`undefined\` and renders empty. \`wrapSignal\` forwards both by construction, making hand-rolled facades structurally impossible to get wrong. See also: signal, effect, computed.`,
    mistakes: `- Forgetting to call \`base.set(value)\` inside the custom \`set\` handler — the signal's internal \`_v\` never updates, so reads stall at the old value and compiled fast paths see stale data.
- Hand-rolling a facade that exposes \`.direct()\` but not the \`_v\` property — the compiler's \`_bindText\` fast path reads \`source._v\` directly to skip the function call; without it, text bindings render empty even though \`()\` works.
- Capturing the \`base\` signal reference in closure and forgetting to return the facade itself — callers that track per-instance subscription identity (e.g. \`.remove()\` on shared state) break because every call returns the same identity.
- Using \`wrapSignal\` to add tracking to a signal that's written from multiple code paths without coordinating in the custom \`set\` handler — the side effect runs on EVERY write, including batch-deferred ones; if other code writes directly to \`base\` it bypasses the facade.
- Expecting the custom \`update\` option to be optional AND have a default — if not provided, it defaults to \`set(fn(base.peek()))\`, which may not match your intent if \`set\` has expensive side effects (it will run for every update, even pure derive ops).`,
  },

  'reactivity/WrapSignalOptions': {
    signature: 'interface WrapSignalOptions<T> { set: (value: T) => void; update?: (fn: (current: T) => T) => void }',
    example: `const store = createStore({ count: 0 })
const countSig = signal(store.count)
const wrapped = wrapSignal(countSig, {
  set: (v) => {
    countSig.set(v)
    store.count = v  // dual-write to store
  },
  update: (fn) => {
    const next = fn(countSig.peek())
    wrapped.set(next)  // coordinated update
  },
})`,
    notes: `Configuration object for \`wrapSignal()\`. The \`set\` handler runs in place of the base signal's \`.set()\`; call through to \`base.set(value)\` when the value should actually update. The optional \`update\` handler defaults to \`set(fn(peek()))\` — override it if you need custom batch or coalescing behavior that \`.set()\` alone doesn't express. See also: wrapSignal, Signal.`,
    mistakes: `- \`set\` handler not calling through to \`base.set()\` — the wrapped signal's value never updates internally, all reads stall.
- Providing \`update\` that doesn't eventually call \`set\` — reads won't reflect the update unless \`set\` is involved in the chain.
- Expecting the default \`update\` to coalesce rapid-fire calls — it calls \`set()\` directly, so if \`set\` has side effects (persist, emit), they fire on every update call without coalescing.
- Using the same \`options\` object for multiple \`wrapSignal()\` calls on different bases — the \`set\` and \`update\` closures capture the wrong \`base\` reference if reused.`,
  },
  // <gen-docs:api-reference:end @pyreon/reactivity>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/core
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/core>

  'core/h': {
    signature: 'h<P extends Props>(type: ComponentFn<P> | string | symbol, props: P | null, ...children: VNodeChild[]): VNode',
    example: `const vnode = h("div", { class: "container" },
  h("h1", null, "Hello"),
  h(Counter, { initial: 0 })
)`,
    notes: 'Create a VNode from a component function, HTML tag string, or symbol (Fragment, Portal). Low-level API — prefer JSX which compiles to `h()` calls (or `_tpl()` + `_bind()` for template-optimized paths). Children are stored in `vnode.children`; components must merge them via `props.children = vnode.children.length === 1 ? vnode.children[0] : vnode.children`. See also: Fragment, Dynamic, lazy.',
    mistakes: `- \`h("div", "text")\` — second arg is always props (or null). Text children go in the third+ positions: \`h("div", null, "text")\`
- \`h(MyComponent, { children: <span /> })\` — children go as rest args, not a prop: \`h(MyComponent, null, <span />)\`
- \`h("input", { className: "x" })\` — use \`class\` not \`className\` (Pyreon uses standard HTML attributes)
- \`h("input", { onChange: handler })\` — use \`onInput\` for keypress-by-keypress updates (native DOM events)`,
  },

  'core/Fragment': {
    signature: 'Fragment: symbol',
    example: `// JSX:
<>
  <h1>Title</h1>
  <p>Content</p>
</>

// h() API:
h(Fragment, null, h("h1", null, "Title"), h("p", null, "Content"))`,
    notes: 'Symbol used as the type for fragment VNodes that group children without producing a wrapper DOM element. In JSX, `<>...</>` compiles to `h(Fragment, null, ...)`. Useful when a component needs to return multiple sibling elements. See also: h.',
  },

  'core/onMount': {
    signature: 'onMount(fn: () => CleanupFn | void): void',
    example: `const Timer = () => {
  const count = signal(0)

  onMount(() => {
    const id = setInterval(() => count.update(n => n + 1), 1000)
    return () => clearInterval(id)  // cleanup on unmount
  })

  return <div>{count()}</div>
}`,
    notes: 'Register a callback that runs after the component mounts into the DOM. The callback can optionally return a cleanup function that runs on unmount — this is the idiomatic pattern for event listeners, timers, and subscriptions. Must be called during component setup (the synchronous function body), not inside effects or async callbacks. See also: onUnmount, onUpdate.',
    mistakes: `- Forgetting cleanup: \`onMount(() => { const id = setInterval(...) })\` leaks the interval. Return cleanup: \`return () => clearInterval(id)\`
- Using \`onMount\` + separate \`onUnmount\` for paired setup/teardown — prefer returning cleanup from \`onMount\` instead
- Calling \`onMount\` inside an \`effect()\` or async callback — it only works during synchronous component setup
- Accessing DOM refs before mount — the callback runs AFTER mount, which is the right place for DOM measurements`,
  },

  'core/onUnmount': {
    signature: 'onUnmount(fn: () => void): void',
    example: `onUnmount(() => {
  console.log("Component removed from DOM")
})`,
    notes: 'Register a callback that runs when the component is removed from the DOM. For paired setup/teardown, prefer returning a cleanup function from `onMount` instead — it co-locates the cleanup with the setup. `onUnmount` is useful when cleanup needs to reference state computed separately from the mount callback. See also: onMount.',
  },

  'core/onUpdate': {
    signature: 'onUpdate(fn: () => void): void',
    example: `onUpdate(() => {
  console.log("Component updated, DOM is current")
})`,
    notes: 'Register a callback that runs after the component updates (reactive dependencies change and DOM patches complete). Rarely needed — most update logic belongs in `effect()` or `computed()`. Useful for imperative DOM measurements that need to run after all reactive updates have flushed. See also: onMount, onUnmount.',
  },

  'core/onErrorCaptured': {
    signature: 'onErrorCaptured(fn: (error: unknown) => boolean | void): void',
    example: `onErrorCaptured((error) => {
  console.error("Caught:", error)
  return false  // stop propagation
})`,
    notes: 'Register an error handler that captures errors thrown by descendant components. Return `false` to prevent the error from propagating further up the tree. Works alongside `ErrorBoundary` for programmatic error handling. See also: ErrorBoundary.',
  },

  'core/createContext': {
    signature: 'createContext<T>(defaultValue: T): Context<T>',
    example: `const ThemeCtx = createContext<"light" | "dark">("light")

// Provide:
const App = () => {
  provide(ThemeCtx, "dark")
  return <Child />
}

// Consume:
const Child = () => {
  const theme = useContext(ThemeCtx)  // "dark" — safe to destructure
  return <div class={theme}>...</div>
}`,
    notes: 'Create a static context. `useContext()` returns the value directly (`T`), so it is safe to destructure. Use this for values that do not change after being provided (theme name, locale string, config object). For values that change reactively (mode signal, locale signal), use `createReactiveContext` instead — otherwise consumers capture a stale snapshot at setup time. See also: createReactiveContext, provide, useContext.',
    mistakes: `- \`provide(ThemeCtx, () => modeSignal())\` with a static context — the consumer receives the function itself, not the signal value. Use \`createReactiveContext\` for dynamic values
- Destructuring a reactive context value: \`const { mode } = useContext(reactiveCtx)\` captures once. Keep the object reference and access lazily
- Calling \`useContext\` outside a component body — it reads from the component context stack, which only exists during setup`,
  },

  'core/createReactiveContext': {
    signature: 'createReactiveContext<T>(defaultValue: T): ReactiveContext<T>',
    example: `const ModeCtx = createReactiveContext<"light" | "dark">("light")

// Provide:
const App = () => {
  const mode = signal<"light" | "dark">("dark")
  provide(ModeCtx, () => mode())
  return <Child />
}

// Consume:
const Child = () => {
  const getMode = useContext(ModeCtx)  // () => "dark"
  return <div class={getMode()}>...</div>
}`,
    notes: 'Create a reactive context. `useContext()` returns `() => T` — an accessor that must be called to read the current value. Use this for values that change over time (mode, locale, user). The accessor subscribes to updates when read inside reactive scopes (`effect()`, JSX thunks, `computed()`). See also: createContext, provide, useContext.',
  },

  'core/provide': {
    signature: 'provide<T>(ctx: Context<T> | ReactiveContext<T>, value: T): void',
    example: `const ThemeCtx = createContext<"light" | "dark">("light")

function App() {
  provide(ThemeCtx, "dark")
  return <Child />
}`,
    notes: 'Push a context value for all descendant components. Auto-cleans up on unmount. Must be called during component setup (synchronous function body). Preferred over manual `pushContext`/`popContext`. For reactive values, provide a getter function to a `ReactiveContext`: `provide(ModeCtx, () => modeSignal())`. See also: createContext, createReactiveContext, useContext.',
    mistakes: `- \`provide(ctx, "static")\` for a value that changes — use \`createReactiveContext\` + \`provide(ctx, () => signal())\`
- Calling \`provide\` inside \`onMount\` or \`effect\` — it must run during synchronous component setup
- Providing the same context twice in one component — the second \`provide\` shadows the first for that subtree`,
  },

  'core/useContext': {
    signature: 'useContext<T>(ctx: Context<T>): T',
    example: `const theme = useContext(ThemeContext)  // static: returns T
const getMode = useContext(ModeCtx)    // reactive: returns () => T`,
    notes: 'Read the nearest provided value for a context. For static `Context<T>`, returns `T` directly. For `ReactiveContext<T>`, returns `() => T` — must call the accessor to read. Falls back to the default value if no ancestor provides the context. See also: provide, createContext, createReactiveContext.',
  },

  'core/Show': {
    signature: '<Show when={condition} fallback={alternative}>{children}</Show>',
    example: `<Show when={isLoggedIn()} fallback={<LoginForm />}>
  <Dashboard />
</Show>`,
    notes: `Reactive conditional rendering. Mounts children when \`when\` is truthy, unmounts and shows \`fallback\` when falsy. More efficient than ternary for signal-driven conditions because it avoids re-evaluating the entire branch expression on every signal change — \`Show\` only transitions between mounted/unmounted when the boolean flips. \`when\` accepts BOTH a value (\`when={true}\`, \`when={signal()}\`) and an accessor (\`when={() => signal()}\`) — the framework normalizes via \`typeof === "function"\`. The accessor form is required for true reactivity (the framework re-evaluates it on signal change); a bare \`when={signal}\` reference works because the compiler's signal auto-call rewrites it to \`when={signal()}\`. See also: Switch, Match, For.`,
    mistakes: `- \`{cond() ? <A /> : <B />}\` — works but less efficient than \`<Show>\` for signal-driven conditions
- \`<Show when={items().length}>\` — works (truthy check), but be explicit: \`<Show when={items().length > 0}>\`
- \`<Show when={signal}>\` (bare reference) — relies on the compiler's signal auto-call to rewrite to \`when={signal()}\`. Works defensively but use \`when={() => signal()}\` for explicit accessor semantics across the entire reactive lifecycle.`,
  },

  'core/Switch': {
    signature: '<Switch fallback={default}>{Match children}</Switch>',
    example: `<Switch fallback={<p>Unknown status</p>}>
  <Match when={status() === "loading"}>
    <Spinner />
  </Match>
  <Match when={status() === "error"}>
    <ErrorDisplay />
  </Match>
  <Match when={status() === "success"}>
    <Results />
  </Match>
</Switch>`,
    notes: 'Multi-branch conditional rendering. Renders the first `<Match>` child whose `when` prop is truthy. If no match, renders the `fallback`. More readable than nested `<Show>` for multi-way conditions. See also: Match, Show.',
  },

  'core/Match': {
    signature: '<Match when={condition}>{children}</Match>',
    example: `<Switch>
  <Match when={tab() === "home"}><Home /></Match>
  <Match when={tab() === "settings"}><Settings /></Match>
</Switch>`,
    notes: 'A branch inside a `<Switch>`. Renders its children when `when` is truthy and it is the first truthy `<Match>` in the parent `<Switch>`. Must be a direct child of `<Switch>`. `when` accepts both a value and an accessor (same normalization as `<Show>`). See also: Switch, Show.',
  },

  'core/For': {
    signature: '<For each={items} by={keyFn}>{renderFn}</For>',
    example: `const items = signal([
  { id: 1, name: "Apple" },
  { id: 2, name: "Banana" },
])

<For each={items()} by={item => item.id}>
  {(item, index) => <li>{item.name}</li>}
</For>`,
    notes: 'Keyed reactive list rendering. Uses the `by` prop (not `key`) for the key function because JSX extracts `key` as a special VNode reconciliation prop. The render function receives each item and its index. Internally uses an LIS-based reconciler for minimal DOM mutations when the list changes. See also: Show, mapArray.',
    mistakes: `- \`<For each={items}>\` — must call the signal: \`<For each={items()}>\`
- \`<For each={items()} key={...}>\` — use \`by\` not \`key\` (JSX reserves \`key\` for VNode reconciliation)
- \`{items().map(...)}\` — use \`<For>\` for reactive list rendering; \`.map()\` re-creates all DOM nodes on every change
- \`<For each={items()} by={index}>\` — using array index as key defeats the reconciler; use a stable identity like \`item.id\``,
  },

  'core/Suspense': {
    signature: '<Suspense fallback={loadingUI}>{children}</Suspense>',
    example: `const LazyPage = lazy(() => import("./HeavyPage"))

<Suspense fallback={<div>Loading...</div>}>
  <LazyPage />
</Suspense>`,
    notes: 'Async boundary that shows `fallback` while any `lazy()` component or async child inside is loading. SSR mode streams the fallback immediately and swaps in the resolved content when ready (30s timeout). Nested Suspense boundaries are independent — an inner boundary resolving does not affect the outer. See also: lazy, ErrorBoundary.',
  },

  'core/ErrorBoundary': {
    signature: '<ErrorBoundary onCatch={handler} fallback={errorUI}>{children}</ErrorBoundary>',
    example: `<ErrorBoundary
  onCatch={(err) => console.error(err)}
  fallback={(err) => <div>Error: {err.message}</div>}
>
  <App />
</ErrorBoundary>`,
    notes: 'Catches render errors thrown by descendant components. The `fallback` receives the error object for display. `onCatch` fires with the error for logging/telemetry. Without an ErrorBoundary, uncaught errors propagate to the nearest `registerErrorHandler` or crash the app. See also: Suspense, onErrorCaptured.',
  },

  'core/lazy': {
    signature: 'lazy(loader: () => Promise<{ default: ComponentFn }>, options?: LazyOptions): LazyComponent',
    example: `const Settings = lazy(() => import("./pages/Settings"))

// Use in JSX (wrap with Suspense):
<Suspense fallback={<Spinner />}>
  <Settings />
</Suspense>`,
    notes: 'Wrap a dynamic import for code splitting. Returns a component that integrates with `Suspense` — the parent Suspense boundary shows its fallback until the import resolves. The loaded component is cached after first resolution. See also: Suspense, Dynamic.',
  },

  'core/Dynamic': {
    signature: '<Dynamic component={comp} {...props} />',
    example: `const components = { home: HomePage, about: AboutPage }
const current = signal("home")

<Dynamic component={components[current()]} />`,
    notes: 'Renders a component by reference or string tag name. Useful when the component to render is determined at runtime (tab panels, plugin systems, polymorphic containers). When `component` changes, the previous component unmounts and the new one mounts. See also: lazy, h.',
  },

  'core/cx': {
    signature: 'cx(...values: ClassValue[]): string',
    example: `cx("foo", "bar")                         // "foo bar"
cx("base", isActive && "active")         // conditional
cx({ base: true, active: isActive() })   // object syntax
cx(["a", ["b", { c: true }]])            // nested arrays

// class prop accepts ClassValue directly:
<div class={["base", cond && "active"]} />
<div class={{ base: true, active: isActive() }} />`,
    notes: 'Combine class values into a single string. Accepts strings, booleans (falsy values ignored), objects (`{ active: true }`), and arrays (nested). The `class` prop on JSX elements already accepts `ClassValue` directly, so explicit `cx()` is only needed when building class strings outside JSX or when composing values from multiple sources. See also: splitProps, mergeProps.',
  },

  'core/splitProps': {
    signature: 'splitProps<T, K extends keyof T>(props: T, keys: K[]): [Pick<T, K>, Omit<T, K>]',
    example: `const Button = (props: { class?: string; onClick: () => void; children: VNodeChild }) => {
  const [local, rest] = splitProps(props, ["class"])
  return <button {...rest} class={cx("btn", local.class)} />
}`,
    notes: 'Split a props object into two parts: the picked keys and the rest. Both halves preserve signal reactivity — reads through either half still track the original reactive prop getters. This is the Pyreon replacement for `const { x, ...rest } = props` destructuring, which captures values once and loses reactivity. See also: mergeProps, cx.',
    mistakes: `- \`const { class: cls, ...rest } = props\` — destructuring captures once, loses reactivity. Use \`splitProps(props, ["class"])\`
- Passing a non-props object — \`splitProps\` relies on reactive getter descriptors that the compiler creates on props objects
- Forgetting that symbol-keyed props are preserved — \`splitProps\` uses \`Reflect.ownKeys\` so symbols (like \`REACTIVE_PROP\`) survive`,
  },

  'core/mergeProps': {
    signature: 'mergeProps<T extends object[]>(...sources: T): MergedProps<T>',
    example: `const Button = (props: { size?: string; variant?: string }) => {
  const merged = mergeProps({ size: "md", variant: "primary" }, props)
  return <button class={\`btn-\${merged.size} btn-\${merged.variant}\`} />
}`,
    notes: 'Merge multiple props objects with last-source-wins semantics. Reads are lazy — the merged object delegates to the source objects via getters, so signal reactivity is preserved. Commonly used to inject default props: `mergeProps({ size: "md" }, props)`. Forces `configurable: true` on copied descriptors to prevent "Cannot redefine property" errors. See also: splitProps, cx.',
    mistakes: `- \`Object.assign({}, defaults, props)\` — loses reactivity. Use \`mergeProps(defaults, props)\` instead
- \`mergeProps(props, defaults)\` — wrong order. Defaults go FIRST, actual props last (last source wins)`,
  },

  'core/removeUndefinedProps': {
    signature: 'removeUndefinedProps<T>(props: T): { [K in keyof T as T[K] extends undefined ? never : K]: T[K] }',
    example: `const filtered = removeUndefinedProps(props) // undefined keys gone, getters live
const merged = mergeProps(defaults, filtered)`,
    notes: 'Copy a props object, dropping keys whose DATA value is exactly `undefined` while preserving every getter-shaped (reactive) prop verbatim. The descriptor-aware filter a prop-forwarding HOC runs before `mergeProps`: an `undefined` consumer prop must not shadow a default, but a compiler-emitted reactive prop must survive with its subscription intact. Copies property descriptors (never values) — a value-copy would fire each getter at setup time and collapse the live signal to a static snapshot. `null` / `0` / `""` / `false` are kept; only `undefined` data props are dropped, and getter descriptors are always kept (cannot peek without firing). See also: mergeProps, splitProps, makeReactiveProps.',
    mistakes: `- \`result[key] = props[key]\` to filter — fires getter-shaped reactive props, collapsing the subscription. Use this helper (it copies descriptors)
- Expecting \`null\` / \`0\` / \`false\` to be dropped — only \`undefined\` data values are removed
- Calling on \`undefined\` — \`Object.getOwnPropertyDescriptors(undefined)\` throws; guard the input`,
  },

  'core/createUniqueId': {
    signature: 'createUniqueId(): string',
    example: `const LabeledInput = (props: { label: string }) => {
  const id = createUniqueId()
  return (
    <>
      <label for={id}>{props.label}</label>
      <input id={id} />
    </>
  )
}`,
    notes: 'Generate a unique string ID ("pyreon-1", "pyreon-2", ...) that is consistent between server and client when called in the same order. SSR-safe — the counter resets per request context. Use for `id`/`for`/`aria-*` attribute pairing in components. See also: splitProps.',
  },

  'core/Portal': {
    signature: '<Portal target={element}>{children}</Portal>',
    example: `<Portal target={document.body}>
  <div class="modal-overlay">
    <div class="modal">Content</div>
  </div>
</Portal>`,
    notes: 'Render children into a DOM element outside the component tree (typically `document.body`). Useful for modals, tooltips, and overlays that need to escape parent overflow/z-index stacking contexts. Context values from the Portal source tree are preserved. See also: Dynamic.',
  },

  'core/mapArray': {
    signature: 'mapArray<T, U>(list: () => T[], mapFn: (item: T, index: () => number) => U): () => U[]',
    example: `const items = signal([1, 2, 3])
const doubled = mapArray(() => items(), (item) => item * 2)
// doubled() → [2, 4, 6] — updates reactively`,
    notes: 'Low-level reactive array mapping used internally by `<For>`. Maps a reactive array signal through a transform function, caching results per item identity. Prefer `<For>` in JSX — use `mapArray` only when you need a reactive derived array outside of rendering. See also: For.',
  },

  'core/createRef': {
    signature: 'createRef<T>(): Ref<T>',
    example: `const inputRef = createRef<HTMLInputElement>()
onMount(() => inputRef.current?.focus())
return <input ref={inputRef} />`,
    notes: 'Create a mutable ref object (`{ current: T | null }`) for holding DOM element references. Pass as the `ref` prop on JSX elements — the runtime sets `.current` after mount and clears it on unmount. Callback refs (`(el: T | null) => void`) are also supported via `RefProp<T>`. See also: onMount.',
  },

  'core/untrack': {
    signature: '(fn: () => T) => T',
    example: `effect(() => {
  const current = count()        // tracked
  const other = untrack(() => otherSignal())  // NOT tracked
})`,
    notes: 'Execute a function reading signals WITHOUT subscribing to them. Alias for `runUntracked` from `@pyreon/reactivity`. Use inside effects when you need a one-shot snapshot of a signal value without the effect re-running when that signal changes. See also: @pyreon/reactivity.',
  },

  'core/nativeCompat': {
    signature: '<T>(fn: T) => T',
    example: `// In a framework package:
export const RouterView = nativeCompat(function RouterView(props) {
  provide(RouterContext, ...)
  return <div>{children}</div>
})`,
    notes: `Mark a Pyreon framework component as "self-managing" so compat layers (\`@pyreon/{react,preact,vue,solid}-compat\`) skip their wrapping and route the component through Pyreon's mount path. Use on every \`@pyreon/*\` JSX component whose setup body uses \`provide()\` / lifecycle hooks / signal subscriptions — wrapping breaks those by running the body inside the compat layer's render context instead of Pyreon's. Idempotent; non-function inputs pass through unchanged. The marker is a registry symbol (\`Symbol.for("pyreon:native-compat")\`), so framework and compat sides share it without an import dependency between them. See also: isNativeCompat, NATIVE_COMPAT_MARKER.`,
    mistakes: `- Forgetting to mark a new framework JSX export — under compat mode, the component's \`provide()\` / \`onMount()\` calls fail with "called outside component setup" warnings and the rendered DOM silently breaks.
- Marking user-app components — only \`@pyreon/*\` framework components that already manage their own reactivity should be marked. User components in compat mode are SUPPOSED to be wrapped (that's how they get re-render-on-state-change semantics).`,
  },

  'core/isNativeCompat': {
    signature: '(fn: unknown) => boolean',
    example: `// In a compat layer's jsx-runtime:
if (isNativeCompat(type)) return h(type, props)
return wrapCompatComponent(type)(props)`,
    notes: 'Compat-layer-side: read whether a function has been marked as a Pyreon native framework component via `nativeCompat()`. Compat `jsx()` calls this to decide whether to skip the React/Vue/Solid/Preact-style wrapping. Always returns `false` for non-function inputs. See also: nativeCompat, NATIVE_COMPAT_MARKER.',
  },

  'core/NATIVE_COMPAT_MARKER': {
    signature: 'symbol',
    example: `import { NATIVE_COMPAT_MARKER } from '@pyreon/core'

// Equivalent to nativeCompat(MyComponent):
;(MyComponent as Record<symbol, boolean>)[NATIVE_COMPAT_MARKER] = true`,
    notes: 'The well-known registry symbol (`Symbol.for("pyreon:native-compat")`) used to mark a component as a Pyreon native framework component. Most callers should use `nativeCompat()` / `isNativeCompat()` instead of touching the symbol directly; exported for advanced cases (e.g., a compat layer that wants to inspect the property without going through the helper). See also: nativeCompat, isNativeCompat.',
  },

  'core/ExtractProps': {
    signature: 'type ExtractProps<T> = /* matches up to 4 overloads, unions the props */ T extends ComponentFn<infer P> ? P : T',
    example: `function Iterator<T extends SimpleValue>(p: { data: T[]; valueName?: string }): VNodeChild
function Iterator<T extends ObjectValue>(p: { data: T[]; component: ComponentFn<T> }): VNodeChild
type Props = ExtractProps<typeof Iterator>
// → { data: SimpleValue[]; valueName?: string }
//  | { data: ObjectValue[]; component: ComponentFn<ObjectValue> }`,
    notes: 'Extracts the props type from a `ComponentFn`. Passes through unchanged if `T` is not a `ComponentFn`. **Multi-overload aware** — matches up to 4 call signatures and produces the UNION of their first-argument types. Critical for multi-overload primitives (Iterator, List, Element) whose loosest overload is last; without overload-aware extraction, HOC wrapping (`rocketstyle()`, `attrs()`) silently downgraded their public prop surface. Single-overload functions still work — the union of 4 copies of the same props type dedupes back to the single shape. See also: HigherOrderComponent.',
    mistakes: `- Assuming \`ExtractProps<T>\` returns only the LAST overload — pre-fix it did, post-fix it returns the UNION of up to 4 overloads. Functions with more than 4 overloads still drop the extras.
- Using \`T extends (props: infer P) => any ? P : never\` directly in user code — that pattern captures only the LAST overload of a multi-overload function. Use \`ExtractProps<T>\` to get the full union.`,
  },

  'core/HigherOrderComponent': {
    signature: 'type HigherOrderComponent<HOP, P> = ComponentFn<HOP & P>',
    example: `function withLogger<P>(Wrapped: ComponentFn<P>): HigherOrderComponent<{ logLevel?: string }, P> {
  return (props) => {
    console.log(\`[\${props.logLevel ?? "info"}] Rendering\`)
    return <Wrapped {...props} />
  }
}`,
    notes: `Typed HOC pattern where \`HOP\` is the props the HOC adds and \`P\` is the wrapped component's own props. The resulting component accepts both sets of props. See also: ExtractProps.`,
  },
  // <gen-docs:api-reference:end @pyreon/core>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/primitives
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/primitives>

  'primitives/Stack': {
    signature: `(props: { direction?: 'column' | 'row'; align?: Align; justify?: Justify; gap?: Space; wrap?: boolean; padding?: Space; children }) => VNode`,
    example: '<Stack gap="md" align="center"><Text>a</Text><Text>b</Text></Stack>',
    notes: 'Primary layout container. Web → `<div style="display:flex;flex-direction:column|row">`; iOS → `VStack`/`HStack`; Android → `Column`/`Row`. Default `direction="column"`. `gap`/`padding` are theme-space tokens (number index OR "sm"|"md"|"lg"). See also: Inline, Layer, Scroll.',
    mistakes: `- Using \`<View>\` / \`<VStack>\` / \`<div>\` — the canonical name is \`<Stack>\` (one name, all platforms)
- Expecting responsive props (breakpoint arrays) — not supported in v1; use @pyreon/elements for responsive web`,
  },

  'primitives/Inline': {
    signature: '(props: { align?: Align; justify?: Justify; gap?: Space; wrap?: boolean; padding?: Space; children }) => VNode',
    example: '<Inline gap="sm"><Field value={q()} onChangeText={(t) => q.set(t)} /><Button onPress={search}>Go</Button></Inline>',
    notes: 'Horizontal row — sugar for `<Stack direction="row">`. Web flex-row; iOS `HStack`; Android `Row`. ⚠ On Android `<Inline>` is a NON-WRAPPING `Row` (SwiftUI HStack shrinks to fit, but Compose Row overflows + clips the last children). Keep horizontal groups short, or use a vertical `<Stack>` for action lists. See also: Stack.',
    mistakes: `- Putting 5+ buttons in an <Inline> — they overflow + clip (become untappable) on Android; stack vertically or split
- Relying on \`wrap\` for native multi-line — wrapping behavior differs per target`,
  },

  'primitives/Layer': {
    signature: '(props: { align?: Align; padding?: Space; children }) => VNode',
    example: '<Layer><Image src={hero} alt="" /><Text>overlaid caption</Text></Layer>',
    notes: 'Stacked / overlay container. Web → `position:relative` + abs children; iOS → `ZStack`; Android → `Box`. Use for badges, overlays, layered composition. See also: Stack.',
    mistakes: '- Using it for flow layout — Layer stacks children on the z-axis, not in a row/column',
  },

  'primitives/Scroll': {
    signature: `(props: { direction?: 'vertical' | 'horizontal'; padding?: Space; children }) => VNode`,
    example: '<Scroll><Stack gap="md">{/* long content */}</Stack></Scroll>',
    notes: 'Scrollable region. Web → `overflow:auto`; iOS → `ScrollView`; Android → `Column(verticalScroll)` / `Row(horizontalScroll)`. ⚠ Do not put a weighted `<Spacer>` inside a Scroll on Android (weight inside a scroll is invalid Compose). See also: Stack.',
    mistakes: '- Nesting a `<Spacer>` (weight) inside `<Scroll>` — invalid on Android Compose',
  },

  'primitives/Spacer': {
    signature: '() => VNode',
    example: '<Inline><Text>left</Text><Spacer /><Text>right</Text></Inline>',
    notes: 'Flexible gap that pushes siblings apart. Web → flex spacer; iOS → `Spacer`; Android → `Spacer(Modifier.weight(1f))`. Use in an `<Inline>`/`<Stack>` to right-align or space-between. See also: Inline, Stack.',
    mistakes: '- Using it inside a `<Scroll>` on Android (weight + scroll conflict)',
  },

  'primitives/Text': {
    signature: `(props: { color?: ColorToken; size?: 'xs'|'sm'|'md'|'lg'|'xl'; weight?: 'regular'|'medium'|'bold'; truncate?: boolean; children }) => VNode`,
    example: '<Text size="lg" weight="bold" color="primary">{label()}</Text>',
    notes: 'Inline text. Web `<span>`; iOS/Android `Text`. Read signals directly in children: `<Text>{count()}</Text>` (the compiler wraps it reactively). Avoid template literals on native — use string concat. See also: Heading.',
    mistakes: `- Using a template literal \`{\`Count: \${n()}\`}\` — partial native support; prefer \`{"Count: " + n()}\`
- Wrapping in \`String(...)\` — unnecessary, numbers coerce in JSX text`,
  },

  'primitives/Heading': {
    signature: '(props: { level?: 1|2|3|4|5|6; color?: ColorToken; children }) => VNode',
    example: '<Heading level={2}>Section</Heading>',
    notes: 'Heading text. Web `<h1>`–`<h6>` by `level`; iOS/Android a sized/weighted `Text`. See also: Text.',
    mistakes: '- Omitting `level` when document outline matters (web a11y)',
  },

  'primitives/Image': {
    signature: `(props: { src: string; alt: string; fit?: 'cover'|'contain'|'fill'|'none'; width?: number|string; height?: number|string }) => VNode`,
    example: '<Image src={logo} alt="Logo" width={120} height={40} fit="contain" />',
    notes: 'Image. Web `<img>`; iOS `Image`; Android `AsyncImage` (Coil). `src` + `alt` REQUIRED. Bundled assets (via the asset pipeline) vs remote URLs dispatch per target. See also: Icon.',
    mistakes: '- Omitting `alt` (required — a11y + it is the native contentDescription)',
  },

  'primitives/Icon': {
    signature: `(props: { name: string; size?: 'sm'|'md'|'lg'; color?: ColorToken }) => VNode`,
    example: '<Icon name="star" size="md" color="primary" />',
    notes: 'Icon by canonical name. Web → svg; iOS → SF Symbol (`Image(systemName:)`); Android → Material `Icons.Filled.*`. The name maps through `ICON_MAP`; unmapped names warn + fall back. See also: Image.',
    mistakes: '- Using a platform-specific icon id — use the canonical name; the compiler maps it per target',
  },

  'primitives/Button': {
    signature: `(props: { onPress: () => void; disabled?: boolean; variant?: 'primary'|'secondary'|'ghost'|'danger'; children }) => VNode`,
    example: '<Button variant="primary" onPress={() => count.set(count() + 1)}>Increment</Button>',
    notes: 'Styled CTA. Web `<button>`; iOS/Android `Button`. Handler is `onPress` (NOT `onClick`). Multi-statement handlers work: `onPress={() => { a.set(1); b.set(2) }}`. See also: Press, Link.',
    mistakes: `- Using \`onClick\` — the canonical event is \`onPress\` (mapped to onClick/action:/onClick per target)
- Passing \`onPress={maybeUndefined}\` — guard it; a non-function handler is a footgun`,
  },

  'primitives/Press': {
    signature: '(props: { onPress: () => void; onLongPress?: () => void; disabled?: boolean; children }) => VNode',
    example: '<Press onPress={() => select(item)}><Card item={item} /></Press>',
    notes: 'Unstyled tap target (no chrome). Web `<div role="button">`; iOS `Button {}` (plain); Android `Box(clickable)`. Use to make arbitrary content tappable; supports `onLongPress`. See also: Button.',
    mistakes: '- Using `<Press>` for a primary action — use `<Button>` for styled CTAs',
  },

  'primitives/Link': {
    signature: '(props: { to: string; external?: boolean; children }) => VNode',
    example: '<Link to="/profile">Profile</Link>',
    notes: 'Navigation link. Web `<a>`; iOS/Android router-aware navigation. Integrates with `@pyreon/router` (`to` is a route path). `external` opens outside the app. See also: Button.',
    mistakes: '- Hardcoding an href for internal routes — use `to` so it routes natively too',
  },

  'primitives/Field': {
    signature: `(props: { value: string | (() => string); onChangeText: (next: string) => void; kind?: 'text'|'number'|'password'|'email'|'search'|'tel'|'url'; placeholder?: string; disabled?: boolean; onSubmit?: () => void }) => VNode`,
    example: '<Field value={draft()} onChangeText={(t) => draft.set(t)} placeholder="Search…" onSubmit={search} />',
    notes: 'Text input. Web `<input>`; iOS/Android `TextField`. Handler is `onChangeText(next)` (NOT `onInput`/`onChange`). `value` accepts a signal accessor for two-way binding. See also: Toggle.',
    mistakes: `- Using \`onChange\`/\`onInput\` — the canonical handler is \`onChangeText(next: string)\`
- Forgetting \`value\` is the source of truth — write back via \`onChangeText\` → signal.set`,
  },

  'primitives/Toggle': {
    signature: '(props: { value: boolean | (() => boolean); onChange: (next: boolean) => void; disabled?: boolean }) => VNode',
    example: '<Toggle value={enabled()} onChange={(v) => enabled.set(v)} />',
    notes: 'Boolean switch/checkbox. Web checkbox; iOS `Toggle`; Android `Switch`. `onChange(next: boolean)`. See also: Field.',
    mistakes: '- Using `onPress`/`onClick` — Toggle uses `onChange(next: boolean)`',
  },

  'primitives/Modal': {
    signature: '(props: { open: boolean | (() => boolean); onClose: () => void; children }) => VNode',
    example: '<Modal open={showSheet()} onClose={() => showSheet.set(false)}><Stack>{/* sheet body */}</Stack></Modal>',
    notes: 'Modal/sheet. Web overlay; iOS `.sheet(isPresented:)`; Android `Dialog(onDismissRequest)`. Drive `open` with a signal; `onClose` fires on dismiss. See also: Layer.',
    mistakes: '- Forgetting `onClose` — needed so the platform dismiss gesture updates your signal',
  },

  'primitives/WebView': {
    signature: '(props: { html?: string; src?: string; data?: unknown; onMessage?: (message: string) => void }) => VNode',
    example: '<WebView html={CHART_HTML} data={metrics()} onMessage={(m) => selected.set(m)} />',
    notes: 'Host a web page/component natively (WKWebView on iOS, Android WebView; `<iframe srcdoc>` on web). THE escape hatch for web-only packages (charts/flow/code/document) on native — they run inside the WebView. Bidirectional bridge: `data` is pushed in as `window.__pyreonData` (+ a `pyreondata` event, live, no reload); the page calls `window.pyreonPostMessage(payload)` → your `onMessage` closure. See also: Web.',
    mistakes: `- Using it for core UI (nav/forms/lists) — pays WebView boot + bundle cost; use native primitives there. Reserve <WebView> for self-contained web-island panes (charts/editors/diagrams)
- Expecting native look-and-feel — content renders as a web view, not native widgets`,
  },

  'primitives/Web': {
    signature: '(props: { children }) => VNode  // + <NativeIOS> / <NativeAndroid>',
    example: '<NativeIOS><Text>iOS-only</Text></NativeIOS><Web><Text>web-only</Text></Web>',
    notes: `Per-platform escape hatches. \`<Web>\` renders its children only on web; \`<NativeIOS>\` only on iOS; \`<NativeAndroid>\` only on Android. Use for the rare genuinely-per-platform UI branch that the canonical primitives can't express. See also: WebView.`,
    mistakes: '- Overusing them — defeats "one source"; reach for them only when a target genuinely needs different UI',
  },
  // <gen-docs:api-reference:end @pyreon/primitives>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/compiler
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/compiler>

  'compiler/transformJSX': {
    signature: 'transformJSX(code: string, filename?: string, options?: TransformOptions): TransformResult',
    example: `import { transformJSX } from "@pyreon/compiler"

const { code, warnings } = transformJSX(
  "export const App = () => <div>{count()}</div>",
  "App.tsx",
  { knownSignals: ["count"] },
)`,
    notes: 'The production entry point. Tries the Rust native binary first (3.7-8.9× faster) and falls back per-call to `transformJSX_JS` inside a try/catch so a native panic never crashes the Vite dev server. Output (`{ code, usesTemplates?, warnings, reactivityLens? }`) is byte-identical across both backends. `options.ssr` skips the `_tpl()` template optimization so `@pyreon/runtime-server` can walk the VNode tree; `options.knownSignals` seeds cross-module signal auto-call; `options.reactivityLens` collects the additive `ReactivitySpan[]` sidecar (codegen is byte-identical whether or not it is collected). See also: transformJSX_JS, analyzeReactivity.',
    mistakes: `- Expecting \`transformJSX\` to throw on a native panic — it never does; it silently falls back to the JS backend (correctness-equivalent, just slower)
- Passing user component source WITHOUT \`ssr: true\` when feeding the result to \`@pyreon/runtime-server\` — SSR needs the \`h()\` VNode tree, not \`_tpl()\` clone templates
- Assuming bare \`{count}\` is auto-called for an IMPORTED signal without seeding \`knownSignals\` — the compiler only tracks \`const count = signal(...)\` declared in the same file unless told otherwise`,
  },

  'compiler/transformJSX_JS': {
    signature: 'transformJSX_JS(code: string, filename?: string, options?: TransformOptions): TransformResult',
    example: `import { transformJSX_JS } from "@pyreon/compiler"

// Backend-deterministic — never dispatches to the native binary.
const { code } = transformJSX_JS("<div>{name()}</div>", "x.tsx")`,
    notes: 'The pure-JS reactive pass (parses via `oxc-parser`). Same signature and byte-identical output to the native path — `transformJSX` calls it as the fallback. Call it directly only when you need backend-deterministic output (the Reactivity-Lens forces this path so the sidecar is always emitted regardless of whether the native binary is installed). See also: transformJSX.',
  },

  'compiler/analyzeReactivity': {
    signature: 'analyzeReactivity(code: string, filename?: string, options?: { knownSignals?: string[] }): AnalyzeReactivityResult',
    example: `import { analyzeReactivity, formatReactivityLens } from "@pyreon/compiler"

const result = analyzeReactivity(
  "const A = (props) => <div>{props.name}</div>",
  "A.tsx",
)
for (const f of result.findings) console.log(f.line, f.kind, f.detail)
console.log(formatReactivityLens(code, result)) // annotated-source debug view`,
    notes: `[EXPERIMENTAL] Reactivity-Lens entry point (experimental). The compiler ALREADY decides per-expression whether code is reactive while emitting codegen; this surfaces that ground truth back to the author instead of discarding it. Returns \`{ findings, spans }\` — \`findings\` merges the structural codegen decisions (\`reactive\` / \`reactive-prop\` / \`reactive-attr\` / \`static-text\` / \`hoisted-static\`) with the EXISTING \`detectPyreonPatterns\` footguns (\`kind: 'footgun'\`, carrying the detector \`code\`) under one (line, column)-sorted taxonomy. Forces the JS backend so the sidecar is always present. Absence of a span is “not asserted”, never an implicit static claim. See also: formatReactivityLens, detectPyreonPatterns, transformJSX_JS.`,
    mistakes: `- Treating the absence of a span as a static guarantee — the Lens is asymmetric: positive spans are RECORDS of a codegen branch; silence means "not analyzed", not "proven static"
- Expecting it to reflect the native backend — it deliberately forces \`transformJSX_JS\`; codegen is byte-identical so the analysis is sound, native just does not emit the sidecar at production bundle time (it is an editor-only feature)
- Calling it on a hot build path — it is an authoring-time / LSP tool, not part of the production transform pipeline`,
  },

  'compiler/formatReactivityLens': {
    signature: 'formatReactivityLens(code: string, result: AnalyzeReactivityResult): string',
    example: `import { analyzeReactivity, formatReactivityLens } from "@pyreon/compiler"

const r = analyzeReactivity(src, "App.tsx")
process.stdout.write(formatReactivityLens(src, r))`,
    notes: '[EXPERIMENTAL] Renders an `analyzeReactivity` result as an annotated-source CLI / debug view — each spanned expression gets an inline `live` / `static` / `live·prop` / `hoisted` / footgun tag. The LSP surface in `@pyreon/lint --lsp` consumes the structured `findings` directly (inlay hints + diagnostics); this string renderer is for terminals and bug reports. See also: analyzeReactivity.',
  },

  'compiler/detectReactPatterns': {
    signature: 'detectReactPatterns(code: string, filename?: string): ReactDiagnostic[]',
    example: `import { detectReactPatterns } from "@pyreon/compiler"

const diags = detectReactPatterns("const [n,setN] = useState(0)", "x.tsx")
console.log(diags[0]?.code) // "react-use-state"`,
    notes: 'AST-based detector for "coming from React" mistakes — `useState` / `useEffect`, `className` / `htmlFor`, `onChange` on inputs, `.value` writes on signals, React-package imports. Pairs with `detectPyreonPatterns` inside the MCP `validate` tool; the merged result is sorted by line + column. See also: migrateReactCode, detectPyreonPatterns, hasReactPatterns.',
  },

  'compiler/migrateReactCode': {
    signature: 'migrateReactCode(code: string, filename?: string): MigrationResult',
    example: `import { migrateReactCode } from "@pyreon/compiler"

const { code, changes } = migrateReactCode(reactSource, "C.tsx")`,
    notes: 'One-shot React→Pyreon codemod — `useState`→`signal`, `useEffect`→`effect`/`onMount`, `className`→`class`, etc. Returns the rewritten code plus the list of applied `MigrationChange`s. Mechanical only: shapes it cannot safely rewrite are left as `detectReactPatterns` diagnostics for the human. See also: detectReactPatterns.',
  },

  'compiler/hasReactPatterns': {
    signature: 'hasReactPatterns(code: string): boolean',
    example: `import { hasReactPatterns, detectReactPatterns } from "@pyreon/compiler"

if (hasReactPatterns(src)) report(detectReactPatterns(src, file))`,
    notes: 'Fast regex pre-filter — returns whether `code` is worth a full `detectReactPatterns` AST walk. Cheap gate for batch scanners; never reports diagnostics itself. See also: detectReactPatterns.',
  },

  'compiler/diagnoseError': {
    signature: 'diagnoseError(error: string): ErrorDiagnosis | null',
    example: `import { diagnoseError } from "@pyreon/compiler"

const d = diagnoseError("props.when is not a function")
if (d) console.log(d.cause, d.fix)`,
    notes: 'Maps a raw runtime/build error string to a structured `ErrorDiagnosis` (likely cause + actionable fix) for known Pyreon failure shapes. Returns `null` when the error is unrecognised — callers fall back to the raw message.',
  },

  'compiler/detectPyreonPatterns': {
    signature: 'detectPyreonPatterns(code: string, filename?: string): PyreonDiagnostic[]',
    example: `import { detectPyreonPatterns } from "@pyreon/compiler"

const diags = detectPyreonPatterns(
  "const A = (props) => { const { x } = props; return <i>{x}</i> }",
  "A.tsx",
)
console.log(diags[0]?.code) // "props-destructured-body"`,
    notes: 'AST-based (TypeScript compiler API) detector for "using Pyreon wrong" mistakes — 14 codes today (`for-missing-by`, `for-with-key`, `props-destructured`, `props-destructured-body`, `process-dev-gate`, `empty-theme`, `raw-add-event-listener`, `raw-remove-event-listener`, `date-math-random-id`, `on-click-undefined`, `signal-write-as-call`, `static-return-null-conditional`, `as-unknown-as-vnodechild`, `island-never-with-registry-entry`). The detector arm behind the MCP `validate` tool and `pyreon doctor --check-pyreon-patterns`. Every diagnostic reports `fixable: false` (invariant — no `migrate_pyreon` codemod ships yet). See also: hasPyreonPatterns, detectReactPatterns, analyzeReactivity.',
    mistakes: `- Reading \`fixable\` as sometimes-true — it is an enforced \`false\` invariant for every Pyreon code; wiring auto-fix UX off it applies nothing
- Expecting it to flag \`const { x } = props.nested\` or an \`onMount\`-scoped destructure — \`props-destructured-body\` is deliberately scoped to the canonical \`= props\` body-scope shape for zero false positives`,
  },

  'compiler/hasPyreonPatterns': {
    signature: 'hasPyreonPatterns(code: string): boolean',
    example: `import { hasPyreonPatterns, detectPyreonPatterns } from "@pyreon/compiler"

if (hasPyreonPatterns(src)) report(detectPyreonPatterns(src, file))`,
    notes: 'Fast regex pre-filter for `detectPyreonPatterns` — deliberately loose (the AST walker is the precise gate); only has to avoid skipping a file that might contain a pattern. See also: detectPyreonPatterns.',
  },

  'compiler/auditTestEnvironment': {
    signature: 'auditTestEnvironment(startDir: string): TestAuditResult',
    example: `import { auditTestEnvironment, formatTestAudit } from "@pyreon/compiler"

const r = auditTestEnvironment(process.cwd())
console.log(formatTestAudit(r, { minRisk: "high" }))`,
    notes: 'Scans every `*.test.ts(x)` under `startDir` for the mock-vnode anti-pattern (constructing `{ type, props, children }` literals or a `vnode()` helper instead of going through real `h()`), the bug class behind PR #197’s silent metadata drop. Classifies each file HIGH / MEDIUM / LOW. Powers the MCP `audit_test_environment` tool and `pyreon doctor --audit-tests`. See also: formatTestAudit, auditIslands, auditSsg.',
  },

  'compiler/formatTestAudit': {
    signature: 'formatTestAudit(result: TestAuditResult, options?: AuditFormatOptions): string',
    example: `import { auditTestEnvironment, formatTestAudit } from "@pyreon/compiler"

console.log(formatTestAudit(auditTestEnvironment("."), { minRisk: "medium" }))`,
    notes: 'Human-readable renderer for an `auditTestEnvironment` result; `options.minRisk` filters the floor (`high` | `medium` | `low`). The CLI / MCP surfaces also have a JSON path — this is the text view. See also: auditTestEnvironment.',
  },

  'compiler/auditIslands': {
    signature: 'auditIslands(rootDir: string): IslandAuditResult',
    example: `import { auditIslands, formatIslandAudit } from "@pyreon/compiler"

const r = auditIslands(process.cwd())
for (const f of r.findings) console.log(f.code, f.location.file)`,
    notes: 'Project-wide syntactic island audit — five cross-file detectors (`duplicate-name`, `never-with-registry-entry`, `registry-mismatch`, `nested-island`, `dead-island`) that auto-registry and the per-file detector cannot reach. No type-check pass / module resolution; entirely TypeScript-compiler-API syntactic. Powers `pyreon doctor --check-islands` + the MCP `audit_islands` tool. See also: formatIslandAudit, auditTestEnvironment, auditSsg.',
  },

  'compiler/formatIslandAudit': {
    signature: 'formatIslandAudit(result: IslandAuditResult, options?: IslandAuditFormatOptions): string',
    example: `import { auditIslands, formatIslandAudit } from "@pyreon/compiler"

console.log(formatIslandAudit(auditIslands(".")))`,
    notes: 'Text renderer for an `auditIslands` result — each finding with file path + line/column + an actionable fix suggestion. The `--json` CLI path bypasses this for CI gates. See also: auditIslands.',
  },

  'compiler/auditSsg': {
    signature: 'auditSsg(rootDir: string): SsgAuditResult',
    example: `import { auditSsg, formatSsgAudit } from "@pyreon/compiler"

const r = auditSsg(process.cwd())
for (const f of r.findings) console.log(f.code, f.location.file)`,
    notes: 'Project-wide syntactic SSG audit — three detectors: `404-outside-layout-dir` (`_404.tsx` not co-located with `_layout.tsx` → no layout chrome), `dynamic-route-missing-get-static-paths` (`[id].tsx` without `getStaticPaths` → silently skipped by SSG auto-detect), `non-literal-revalidate-export` (`export const revalidate = TTL` → dropped from the build-time ISR manifest). API routes (`src/routes/api/` or no `export default`) are skipped. Powers `pyreon doctor --check-ssg`. See also: formatSsgAudit, auditIslands.',
  },

  'compiler/formatSsgAudit': {
    signature: 'formatSsgAudit(result: SsgAuditResult, options?: SsgAuditFormatOptions): string',
    example: `import { auditSsg, formatSsgAudit } from "@pyreon/compiler"

console.log(formatSsgAudit(auditSsg(".")))`,
    notes: 'Text renderer for an `auditSsg` result — file path + line/column + actionable fix per finding. CI gates use the JSON path instead. See also: auditSsg.',
  },

  'compiler/transformDeferInline': {
    signature: 'transformDeferInline(code: string, filename?: string): DeferInlineResult',
    example: `import { transformDeferInline } from "@pyreon/compiler"

const { code, changed } = transformDeferInline(src, "page.tsx")`,
    notes: 'Standalone pre-pass that inlines `<Defer>` namespace-import boundaries. Fast-paths out entirely when the source contains no `Defer` mention (no parse). Returns `{ code, changed, warnings }`; runs before the JSX transform in the Vite plugin chain.',
  },

  'compiler/generateContext': {
    signature: 'generateContext(cwd: string): ProjectContext',
    example: `import { generateContext } from "@pyreon/compiler"

const ctx = generateContext(process.cwd())
console.log(ctx.routes.length, ctx.islands.length)`,
    notes: 'Project scanner — walks the source tree and produces a structured `ProjectContext` (routes, islands, components) that `@pyreon/vite-plugin` regenerates into `.pyreon/context.json` for AI agents. Syntactic only; no type-check / bundle.',
  },
  // <gen-docs:api-reference:end @pyreon/compiler>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/router
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/router>

  'router/runServerLoaders': {
    signature: `router.runServerLoaders(path: string, request?: Request): Promise<{ kind: 'data'; data: Record<number, unknown> } | { kind: 'redirect'; to: string; status: number }>`,
    example: `// zero's /_pyreon/data endpoint does exactly this:
const result = await router.runServerLoaders('/dash', ctx.req)
if (result.kind === 'redirect') return jsonRedirect(result)
return json({ data: result.data }) // keyed by matched-chain index`,
    notes: `The single-fetch data endpoint's worker (server-only — \`serverLoader\` functions exist only in the SSR module graph). Runs ONLY the matched chain's \`serverLoader\` records (NOT isomorphic \`loader\`s — those run client-side; running them here would double-fire side effects) and keys results by MATCHED-CHAIN INDEX (a layout and its index page share a \`path\`, so path-keying collided). A \`redirect()\` thrown by any server loader returns the redirect descriptor instead of data.`,
    mistakes: `- Calling it client-side — \`serverLoader\` is undefined in the client graph; the client router does the single FETCH instead
- Expecting isomorphic \`loader\`s to run here — deliberately excluded (double-fire prevention); they run on the client during navigation`,
  },

  'router/createRouter': {
    signature: 'createRouter(options: RouterOptions | RouteRecord[]): Router',
    example: `const router = createRouter([
  { path: "/", component: Home },
  { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) },
  { path: "/admin", component: Admin, beforeEnter: requireAuth, children: [
    { path: "settings", component: Settings },
  ]},
])`,
    notes: 'Create a router instance with route records, guards, middleware, and mode configuration. Accepts either an array of route records (shorthand) or a full `RouterOptions` object with `routes`, `mode` (`"history"` | `"hash"`), `scrollBehavior`, `beforeEach`, `afterEach`, and `middleware`. The returned `Router` is generic over route names for typed programmatic navigation. See also: RouterProvider, useRouter, useRoute.',
    mistakes: `- \`createRouter({ routes: [...], mode: "hash" })\` and using \`window.location.hash\` elsewhere — hash mode uses \`history.pushState\`, not \`location.hash\`. Reading \`location.hash\` directly will not reflect router state
- Defining route paths without leading \`/\` in root routes — all root-level paths must start with \`/\`
- Using \`redirect: "/target"\` with a guard on the same route — redirects bypass guards. Use \`beforeEnter\` to conditionally redirect instead
- Forgetting the catch-all route — \`{ path: "(.*)", component: NotFound }\` should be the last route to handle 404s`,
  },

  'router/RouterProvider': {
    signature: '<RouterProvider router={router}>{children}</RouterProvider>',
    example: `const App = () => (
  <RouterProvider router={router}>
    <nav><RouterLink to="/">Home</RouterLink></nav>
    <RouterView />
  </RouterProvider>
)`,
    notes: 'Provide the router instance to the component tree via `RouterContext`. Must wrap the entire app (or the routed section). Sets up the context stack so `useRouter()`, `useRoute()`, and other hooks can access the router. See also: createRouter, RouterView, RouterLink.',
  },

  'router/RouterView': {
    signature: '<RouterView />',
    example: `// Renders the matched route's component
<RouterView />

// Nested routes: parent component includes <RouterView /> for children
const Admin = () => (
  <div>
    <h1>Admin</h1>
    <RouterView />  {/* renders Settings, Users, etc. */}
  </div>
)`,
    notes: `Render the matched route's component. For nested routes, the parent route component includes a \`<RouterView />\` that renders the matched child. Each \`<RouterView>\` renders one level of the route tree. See also: RouterProvider, createRouter.`,
  },

  'router/RouterLink': {
    signature: '<RouterLink to={path} activeClass={cls} exactActiveClass={cls}>{children}</RouterLink>',
    example: `<RouterLink to="/" activeClass="nav-active">Home</RouterLink>
<RouterLink to={{ name: "user", params: { id: "42" } }}>Profile</RouterLink>`,
    notes: 'Declarative navigation link that renders an `<a>` element. Supports string paths or named route objects (`{ name, params }`). Applies `activeClass` when the current route matches the link path (prefix), and `exactActiveClass` for exact matches. Click handler calls `router.push()` and prevents default. See also: useRouter, useIsActive.',
    mistakes: `- \`<a href="/about" onClick={() => router.push("/about")}>\` — use \`<RouterLink to="/about">\` instead; it handles the anchor element, active class, and click interception
- \`<RouterLink to="/about" target="_blank">\` — external navigation bypasses the router; use a plain \`<a>\` for external links
- \`<RouterLink to={dynamicPath}>\` without calling the signal — must call: \`<RouterLink to={dynamicPath()}>\` (or let the compiler handle it via \`_rp()\`)`,
  },

  'router/useRouter': {
    signature: 'useRouter(): Router',
    example: `const router = useRouter()

router.push("/settings")
router.push({ name: "user", params: { id: "42" } })
router.replace("/login")
router.back()
router.forward()
router.go(-2)`,
    notes: 'Access the router instance for programmatic navigation. Returns the `Router` object with `push()`, `replace()`, `back()`, `forward()`, `go()`. `await router.push()` resolves after the View Transition `updateCallbackDone` (DOM commit is complete, new route state is live), NOT after the animation finishes. See also: useRoute, RouterLink, createRouter.',
    mistakes: `- \`router.push("/path")\` at the top level of a component body — this is synchronous imperative navigation during render, causing an infinite loop. Wrap in \`onMount\`, event handler, or \`effect\`
- \`await router.push("/path")\` expecting animation completion — \`push\` resolves after DOM commit (\`updateCallbackDone\`), not after View Transition animation finishes. Use the returned transition object's \`.finished\` if you need to wait for animation
- Calling \`useRouter()\` outside a \`<RouterProvider>\` — throws because no router context exists`,
  },

  'router/useRoute': {
    signature: 'useRoute<TPath extends string>(): () => ResolvedRoute<ExtractParams<TPath>>',
    example: `// Type-safe params:
const route = useRoute<"/user/:id">()
const userId = route().params.id  // string

// Access query, meta, etc:
route().query
route().meta`,
    notes: 'Access the current resolved route as a reactive accessor. Generic over the path string for typed params — `useRoute<"/user/:id">()` yields `route().params.id: string`. Returns a function (accessor) that must be called to read the current route — reads inside reactive scopes track route changes. See also: useRouter, useSearchParams, useLoaderData.',
  },

  'router/useIsActive': {
    signature: 'useIsActive(path: string, exact?: boolean): () => boolean',
    example: `const isHome = useIsActive("/")
const isAdmin = useIsActive("/admin")          // prefix match
const isExactAdmin = useIsActive("/admin", true)  // exact only

// Reactive — updates when route changes:
<a class={{ active: isAdmin() }} href="/admin">Admin</a>`,
    notes: 'Returns a reactive boolean for whether a path matches the current route. Segment-aware prefix matching: `/admin` matches `/admin/users` but NOT `/admin-panel`. Pass `exact=true` for exact-only matching. Updates reactively when the route changes. See also: useRoute, RouterLink.',
    mistakes: `- \`useIsActive("/admin")\` matching \`/admin-panel\` — this does NOT happen. Matching is segment-aware: \`/admin\` only matches paths starting with \`/admin/\` or exactly \`/admin\`
- \`if (useIsActive("/settings")())\` at component top level — the outer call returns an accessor; make sure to read it inside a reactive scope for updates
- Using \`useIsActive\` for complex route matching — it only does path prefix/exact matching. For query-param-aware or meta-aware checks, use \`useRoute()\` directly`,
  },

  'router/useTypedSearchParams': {
    signature: 'useTypedSearchParams<T>(schema: T): TypedSearchParams<T>',
    example: `const params = useTypedSearchParams({ page: "number", q: "string", active: "boolean" })
params.page()    // number (auto-coerced)
params.q()       // string
params.set({ page: 2 })  // updates URL`,
    notes: 'Type-safe search params with auto-coercion from URL strings. Schema keys define parameter names, values define types (`"string"`, `"number"`, `"boolean"`). Returns an object where each key is a reactive accessor and `.set()` updates the URL. See also: useSearchParams, useRoute.',
  },

  'router/useTransition': {
    signature: 'useTransition(): () => boolean',
    example: `const isTransitioning = useTransition()

<Show when={isTransitioning()}>
  <ProgressBar />
</Show>`,
    notes: 'Returns a reactive accessor for route transition state. The accessor is true during navigation (while guards run + loaders resolve), false when the new route is mounted. Call it inside a reactive scope. Useful for progress bars and global loading indicators. See also: useRouter, useRoute.',
  },

  'router/useMiddlewareData': {
    signature: 'useMiddlewareData(): () => Record<string, unknown>',
    example: `// Middleware:
const authMiddleware: RouteMiddleware = async (ctx) => {
  ctx.data.user = await getUser(ctx.to)
}

// Component:
const data = useMiddlewareData()
// data().user is available`,
    notes: 'Returns a reactive accessor for data set by `RouteMiddleware` in the middleware chain. Middleware functions receive `ctx` with a mutable `ctx.data` object — properties set there are read by calling the returned accessor inside a reactive scope. See also: createRouter, useLoaderData.',
  },

  'router/useLoaderData': {
    signature: 'useLoaderData<T>(): T',
    example: `// Route: { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) }

const User = () => {
  const data = useLoaderData<UserData>()
  return <div>{data.name}</div>
}`,
    notes: `Access the data returned by the current route's \`loader\` function. The loader runs before the route component mounts; its return value is cached and available synchronously via this hook. Generic over the loader return type. See also: useMiddlewareData, useRoute.`,
  },

  'router/redirect': {
    signature: 'redirect(url: string, status?: 301 | 302 | 303 | 307 | 308): never',
    example: `// src/routes/app/_layout.tsx
import { redirect, type LoaderContext } from "@pyreon/router"

export async function loader(ctx: LoaderContext) {
  // SSR: read from request headers; CSR: read from document.cookie
  const cookie = ctx.request?.headers.get("cookie")
    ?? (typeof document !== "undefined" ? document.cookie : "")
  const sid = /(?:^|;\\s*)sid=([^;]+)/.exec(cookie)?.[1]
  if (!sid) redirect("/login")
  const session = await getSession(sid)
  if (!session) redirect("/login")
  return { session }
}`,
    notes: `Throw inside a route loader to redirect the navigation BEFORE the layout renders. On SSR (initial nav), the thrown error is converted by \`@pyreon/server\`'s handler into a real HTTP \`302\`/\`307\` \`Location:\` response — no layout HTML leaves the server. On CSR (subsequent nav), the redirect propagates through the navigate flow and triggers \`router.replace()\` before any matched route's component mounts. Replaces the fragile \`onMount + router.push()\` workaround for auth-gates under nested-layout dev SSR + hydration. Default status is \`307\` (Temporary Redirect, method-preserving). See also: notFound, useLoaderData, isRedirectError.`,
    mistakes: `- Calling \`redirect()\` outside a loader (in a component body, an event handler, etc.) — the helper expects to be caught by the loader-runner. For imperative redirects from event handlers, use \`router.replace(target)\` instead.
- Forgetting to make \`LoaderContext.request\` access optional. It's populated only on SSR; CSR loaders see \`request: undefined\`. Read both: \`ctx.request?.headers.get('cookie') ?? document.cookie\`.
- Using \`redirect()\` for control-flow that should be a \`<Match>\` / \`<Show>\` conditional — the helper is for redirecting the URL, not for branching the rendered output.
- Returning \`redirect()\` instead of throwing it. The helper has return type \`never\` and throws — \`return redirect(...)\` is misleading and may suppress the throw under TS strict-null checks.
- Picking the wrong status. Default \`307\` preserves the request method (POST stays POST after redirect). Use \`302\`/\`303\` to force GET on the target. Use \`301\`/\`308\` for PERMANENT moves (browsers cache them aggressively).
- Assuming \`redirect()\` cancels every loader in a sibling chain. The first loader to throw wins; later loaders in the same \`Promise.allSettled\` batch may have already started executing before the redirect short-circuits. Treat them as best-effort.`,
  },

  'router/isRedirectError': {
    signature: 'isRedirectError(err: unknown): boolean',
    example: `import { ErrorBoundary } from "@pyreon/core"
import { isRedirectError } from "@pyreon/router"

<ErrorBoundary fallback={(err, reset) => {
  if (isRedirectError(err)) throw err  // let the framework handle it
  return <ErrorPage error={err} onReset={reset} />
}}>
  <App />
</ErrorBoundary>`,
    notes: 'Type guard for errors thrown by `redirect()`. Used internally by the router (CSR) and `@pyreon/server` (SSR) to distinguish redirect-control-flow errors from real failures. Useful in custom error boundaries that should let redirects pass through to the framework instead of catching them. See also: redirect, isNotFoundError, getRedirectInfo.',
  },

  'router/getRedirectInfo': {
    signature: 'getRedirectInfo(err: unknown): { url: string; status: 301 | 302 | 303 | 307 | 308 } | null',
    example: `import { getRedirectInfo } from "@pyreon/router"

try {
  await prefetchLoaderData(router, path, request)
} catch (err) {
  const info = getRedirectInfo(err)
  if (info) return new Response(null, { status: info.status, headers: { Location: info.url } })
  throw err
}`,
    notes: `Extract the redirect URL and status from a thrown RedirectError. Returns \`null\` for non-redirect errors. Used by \`@pyreon/server\`'s SSR handler to convert the thrown error into a 302/307 \`Response\`. See also: redirect, isRedirectError.`,
  },

  'router/useSearchParams': {
    signature: 'useSearchParams<T>(defaults?: T): [get: () => T, set: (updates: Partial<T>) => Promise<void>]',
    example: `const [search, setSearch] = useSearchParams({ page: "1", sort: "name" })

// Read:
search().page  // "1"

// Write:
setSearch({ page: "2" })`,
    notes: 'Access and update URL search params as a reactive tuple. Returns `[get, set]` where `get()` reads the current params and `set()` updates them via `replaceState`. For typed params with auto-coercion, prefer `useTypedSearchParams`. See also: useTypedSearchParams, useRoute.',
  },

  'router/useBlocker': {
    signature: 'useBlocker(shouldBlock: () => boolean): Blocker',
    example: `const blocker = useBlocker(() => form.isDirty())

<Show when={blocker.isBlocked()}>
  <Dialog>
    <p>Unsaved changes. Leave anyway?</p>
    <button onClick={blocker.proceed}>Leave</button>
    <button onClick={blocker.reset}>Stay</button>
  </Dialog>
</Show>`,
    notes: `Block navigation when a condition is true (e.g., unsaved form changes). Returns a \`Blocker\` object with \`proceed()\` and \`reset()\` methods. Also hooks into the browser's \`beforeunload\` event to warn on tab close. Uses a shared ref-counted listener for \`beforeunload\` — N blockers share one event handler. See also: useRouter.`,
  },

  'router/onBeforeRouteLeave': {
    signature: 'onBeforeRouteLeave(guard: NavigationGuard): void',
    example: `onBeforeRouteLeave((to, from) => {
  if (hasUnsavedChanges()) return false  // cancel navigation
})`,
    notes: 'Register a per-component navigation guard that fires when leaving the current route. Return `false` to cancel, a string path to redirect, or `undefined` to allow. Must be called during component setup. See also: onBeforeRouteUpdate, useBlocker.',
  },

  'router/onBeforeRouteUpdate': {
    signature: 'onBeforeRouteUpdate(guard: NavigationGuard): void',
    example: `onBeforeRouteUpdate((to, from) => {
  if (to.params.id === from.params.id) return  // no change
  // reload data for new ID...
})`,
    notes: 'Register a per-component navigation guard that fires when the route updates but the same component stays mounted (e.g., param change `/user/1` to `/user/2`). Same return semantics as `onBeforeRouteLeave`. See also: onBeforeRouteLeave, useRoute.',
  },
  // <gen-docs:api-reference:end @pyreon/router>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/head
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/head>

  'head/useHead': {
    signature: 'useHead(input: UseHeadInput | (() => UseHeadInput)): void',
    example: `// Static:
useHead({ title: "My Page", meta: [{ name: "description", content: "..." }] })

// Reactive (updates when signals change):
useHead(() => ({
  title: \`\${username()} — Profile\`,
  meta: [{ property: "og:title", content: username() }]
}))`,
    notes: 'Register head tags from any component in the tree. Pass a static `UseHeadInput` object for one-shot registration, or a `() => UseHeadInput` thunk for reactive re-registration when signal reads inside the thunk change. Calling `useHead()` outside a `HeadProvider` ancestor (CSR) or `renderWithHead()` invocation (SSR) is a silent no-op — it does not throw. See also: HeadProvider, renderWithHead.',
    mistakes: `- Using \`\${...}\` in a \`titleTemplate\` string — the placeholder is \`%s\` (or pass a function form \`(title) => …\`)
- Calling \`useHead()\` outside any \`HeadProvider\` / \`renderWithHead()\` boundary — silent no-op, the entries simply go nowhere
- Wrapping the input in \`computed()\` instead of a thunk — pass a plain \`() => ({...})\` arrow; \`useHead\` registers its own effect
- Expecting \`</script>\` inside an inline script body to render verbatim — the SSR escaper rewrites it as \`<\\/script>\` to prevent breaking out of the inline tag
- Treating \`speculationRules\` as a guaranteed perf win — it is a declarative HINT (like \`<link rel=prefetch>\`); supported browsers prefetch/prerender at their own discretion, unsupported ones ignore it. It is opt-in and zero-runtime-JS; it does not replace \`RouterLink prefetch\` (which warms loader data for client-side nav)`,
  },

  'head/HeadProvider': {
    signature: '(props: HeadProviderProps) => VNodeChild',
    example: `<HeadProvider>{children}</HeadProvider>

// CSR root — auto-creates a fresh context:
mount(
  <HeadProvider>
    <App />
  </HeadProvider>,
  document.getElementById("app")!
)

// SSR — composes with renderWithHead out of the box (no context prop needed):
const { html, head } = await renderWithHead(
  <HeadProvider><App /></HeadProvider>
)

// Explicit isolation (iframe / micro-frontend boundary):
<HeadProvider context={createHeadContext()}><App /></HeadProvider>`,
    notes: 'Context provider that collects every `useHead()` call from descendants. Resolves its context as `props.context ?? outer HeadContext in scope ?? a fresh one`, so a `HeadProvider` mounted INSIDE `renderWithHead()` (or inside another `HeadProvider`) transparently inherits the outer registry instead of shadowing it with a write-only one. On the client it also syncs the resolved tags into the live `document.head`. Mount once near the application root for the canonical CSR shape; the inheritance step makes nested mounts and the SSR-wrapped shape work without manual context plumbing. See also: useHead, renderWithHead, createHeadContext.',
    mistakes: `- Mounting two \`HeadProvider\` instances at SIBLING roots — each owns an independent context, so a \`useHead()\` deeper in tree A is invisible to tree B (use a shared \`context\` prop or merge under a common parent provider)
- Forgetting to mount \`HeadProvider\` (or \`renderWithHead\`) and expecting \`useHead()\` to still update \`document.head\` — silent no-op outside any provider
- Assuming a NESTED \`HeadProvider\` isolates its subtree by default — it does the opposite, inheriting the outer context. Pass \`context={createHeadContext()}\` explicitly when you genuinely want isolation`,
  },

  'head/renderWithHead': {
    signature: 'renderWithHead(app: VNode): Promise<{ html: string; head: string; htmlAttrs: string; bodyAttrs: string }>',
    example: `import { renderWithHead } from '@pyreon/head'

const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />)
const doc = \`<!doctype html><html\${htmlAttrs}><head>\${head}</head><body\${bodyAttrs}>\${html}</body></html>\``,
    notes: 'SSR companion to `HeadProvider`. Renders the app to HTML via `renderToString` while collecting every `useHead()` call from the tree, then serializes the resolved tags into a single `head` string plus separate `htmlAttrs` / `bodyAttrs` strings. Async components that call `useHead()` in their body work — the renderer awaits suspended subtrees before serialization. See also: useHead, HeadProvider.',
    mistakes: `- Awaiting \`renderWithHead\` and then NOT splicing \`head\` into the \`<head>\` element — every \`useHead()\` call quietly disappears
- Forgetting to interpolate \`htmlAttrs\` / \`bodyAttrs\` (the leading space is included in each string) — \`htmlAttrs.lang\` and \`bodyAttrs.class\` set via \`useHead\` won\\'t reach the DOM`,
  },

  'head/createHeadContext': {
    signature: '() => HeadContextValue',
    example: `import { createHeadContext, HeadContext } from '@pyreon/head'

const ctx = createHeadContext()
provide(HeadContext, ctx)
// ... render tree that calls useHead() ...
const { tags, htmlAttrs, bodyAttrs } = ctx.resolve()`,
    notes: 'Manual factory for a `HeadContextValue` — only needed when wiring up a custom SSR pipeline that bypasses `renderWithHead`, or when running multiple isolated head contexts in the same process. The value exposes `add` / `remove` / `resolve` / `resolveTitleTemplate` / `resolveHtmlAttrs` / `resolveBodyAttrs` for full programmatic control. See also: HeadProvider, renderWithHead.',
  },

  'head/ScriptTag': {
    signature: 'interface ScriptTag { src?: string; type?: string; async?: string; defer?: string; crossorigin?: string; integrity?: string; nomodule?: string; referrerpolicy?: string; fetchpriority?: string; children?: string }',
    example: `// External script auto-gets defer unless author overrides
useHead({
  script: [
    { src: '/app.js' },  // becomes: <script src="/app.js" defer></script>
    { src: '/async.js', async: '' },  // author intent: <script src="/async.js" async></script>
    { src: '/module.js', type: 'module' },  // module defers by spec: <script src="/module.js" type="module"></script>
    { children: 'console.log(1)' },  // inline: <script>console.log(1)</script> (no defer added)
  ]
})`,
    notes: `Standard \`<script>\` tag attributes passed to \`useHead({ script: [...] })\`. External scripts (with \`src\`) default to \`defer=''\` unless the author explicitly sets \`type\` (e.g. \`module\`), \`async\`, or \`defer\`. This prevents render-blocking—aligns with Lighthouse / Core Web Vitals best practice. Inline scripts (no \`src\`) are never touched; \`type="module"\` and \`type="importmap"\` skip the defer default per HTML spec (modules defer by spec; importmap executes synchronously). See also: UseHeadInput, useHead.`,
    mistakes: `- Wrapping external scripts in \`defer: 'true'\` (boolean string) — use \`defer: ''\` (empty string) or omit it and let the default apply
- Assuming inline scripts get deferred — they don't; defer only applies to external src + no explicit load strategy
- Setting \`type="module"\` expecting defer to be added — modules are deferred by spec; adding defer is a no-op (and the code skips it)
- Passing \`type="text/javascript"\` or \`type="application/javascript"\` then expecting defer — the \`type\` field blocks the default; use no \`type\` attr to get the default
- Expecting JSON-LD via \`jsonLd\` convenience property to be affected by defer logic — \`jsonLd\` auto-wraps as \`type="application/ld+json"\`, so defer is never added (type blocks it)`,
  },
  // <gen-docs:api-reference:end @pyreon/head>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/server
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/server>

  'server/createHandler': {
    signature: 'createHandler(options: HandlerOptions): (req: Request) => Promise<Response>',
    example: `import { createHandler } from "@pyreon/server"

export default createHandler({
  App,
  routes,
  clientEntry: "/src/entry-client.ts",
  mode: "stream",  // or "string"
})`,
    notes: 'Build a production SSR handler from your `App`, `routes`, and optional template / client entry / middleware. The template is precompiled once at handler-creation (split into 4 parts to skip three string scans per request); a missing `<!--pyreon-app-->` placeholder throws at creation time, not per request. Middleware runs before render with `ctx.locals` for cross-middleware data passing — return a `Response` to short-circuit the chain. `mode: "stream"` uses `renderToStream` so Suspense boundaries flush out-of-order; `mode: "string"` uses `renderToString` (default). See also: prerender, island, useRequestLocals.',
    mistakes: `- Omitting \`<!--pyreon-app-->\` from the custom template — throws at handler-creation, not per request
- Returning a \`Response\` from middleware and expecting downstream middleware to still run — the chain short-circuits on the first \`Response\`
- Reading \`ctx.locals\` from inside the component without \`useRequestLocals()\` — the component tree only sees locals when bridged through that hook
- Forgetting to escape user data inserted into a custom template — \`createHandler\` only escapes its own loader-data injection (\`</script>\` → \`<\\/script>\`); your template content is your responsibility`,
  },

  'server/renderPage': {
    signature: 'renderPage(App: ComponentFn, router: RenderablePageRouter, path: string, options?: RenderPageOptions): Promise<RenderPageResult>',
    example: `import { renderPage } from "@pyreon/server"

const result = await renderPage(App, router, "/posts/42", {
  request: req,                  // loaders read cookies; redirect() works
  collectStyles: () => sheet.getStyleTag(),
})
if (result.kind === "redirect") return Response.redirect(result.to, result.status)
if (result.kind === "html") compose(template, result)`,
    notes: `The ONE string-mode page-render pipeline — preload (lazy components + loaders, with \`redirect()\` catching) → render with head collection → CSS-in-JS style collect → loader-data inline script → HTTP status (404 via the router's \`notFoundComponent\` chain). Shared by \`createHandler\`, zero's SSG prerender entry, and zero's dev SSR middleware so per-page concerns can never drift between them again. Returns discriminated parts (\`kind: "html" | "redirect" | "unmatched"\`) for the caller to compose into its own template; template injection and streaming stay caller-specific by design. The router MUST be a per-request instance created AT \`path\` — \`preload\` warms caches but does not navigate. See also: createHandler, useRequestLocals.`,
    mistakes: `- Creating the router at a DIFFERENT url than \`path\` — \`preload\` does not navigate; the render shows the router's creation url, not \`path\`
- Expecting \`kind: "unmatched"\` without setting \`bailOnUnmatched: true\` — by default an empty match renders through (the notFoundComponent chain is the framework's 404 story)
- Wrapping the call in your own \`runWithRequestContext\` AND providing locals separately — pass \`locals\` in options; renderPage opens the request context itself
- Composing \`loaderScript\` into the template twice (it is already a complete \`<script>\` tag, not bare JSON)`,
  },

  'server/island': {
    signature: 'island(loader: () => Promise<ComponentFn>, options: { name: string; hydrate?: HydrationStrategy; prefetch?: PrefetchStrategy }): ComponentFn',
    example: `// Visible-hydration paired with idle-prefetch — chunk arrives during
// browser idle so by scroll-in, hydration is instant.
const Comments = island(
  () => import("./Comments"),
  { name: "Comments", hydrate: "visible", prefetch: "idle" }
)

// Interaction-hydration — perfect for modals / dropdowns / command palettes.
const CommandPalette = island(
  () => import("./CommandPalette"),
  { name: "CommandPalette", hydrate: "interaction" }, // first focus/click/pointerenter/touchstart
)

// Hydration strategies: "load" | "idle" | "visible" | "interaction" | "media" | "never"
// Prefetch strategies:  "none" (default) | "idle" | "visible"`,
    notes: 'Wrap a lazily-loaded component in a `<pyreon-island>` boundary with a hydration strategy. The rest of the page stays HTML-only; only the island fetches its JS bundle and hydrates. Strategies: `"load"` (immediate), `"idle"` (`requestIdleCallback`), `"visible"` (IntersectionObserver), `"interaction"` (first focus/click/pointerenter/touchstart — also `"interaction(<events>)"` for custom event lists; clicks are REPLAYED on the equivalent live element after hydration so the first click both wakes the island AND fires the action), `"media(query)"` (matchMedia), `"never"` (HTML-only, no JS). Props passed to islands are JSON-serialized — non-JSON values (functions, symbols, undefined, children) are stripped. Pair with `prefetch: "idle"` or `"visible"` to pre-warm the chunk BEFORE the hydration trigger fires — eliminates the blank-while-fetching flash on deferred-strategy islands. Prefetch is a no-op for `hydrate: "load"` (loader runs synchronously already) and `hydrate: "never"` (defeats the zero-JS strategy). See also: createHandler, hydrateIslands, hydrateIslandsAuto.',
    mistakes: `- Passing function props (event handlers, callbacks) — silently stripped during JSON serialization, the island sees \`undefined\`
- Passing children to an island — stripped; islands cannot render arbitrary descendant trees from props
- Forgetting to wire client-side hydration — under \`@pyreon/vite-plugin\` use \`hydrateIslandsAuto(registry)\` (the registry is auto-generated from \`island()\` calls); without a plugin use the manual \`hydrateIslands({ Name: () => import("./Path") })\`
- Using a duplicate \`name\` across two islands — the client-side registry collapses them, only one loader will fire
- Setting \`prefetch: "idle"\` on a \`hydrate: "load"\` island — load runs the loader synchronously, prefetch is redundant (silently suppressed; no \`data-prefetch\` attribute is emitted)
- Setting any \`prefetch\` on a \`hydrate: "never"\` island — defeats the whole zero-JS point of \`never\` (silently suppressed)
- Registering a \`hydrate: "never"\` island in \`hydrateIslands({ ... })\` — defeats the strategy by pulling the component module into the client bundle. The whole point of \`never\` is zero client JS. The runtime short-circuits never-strategy before the registry lookup so missing entries are silent (no \`data-island-error="no-loader"\`); the auto-registry omits never-strategy islands by design.
- Using \`"interaction"\` for visible-on-load components — defeats the strategy. Use \`"load"\` for above-the-fold interactive content; reserve \`"interaction"\` for modals / dropdowns / command palettes that are interactive but only shown on user demand
- Relying on focus/pointerenter to trigger the SAME action as click for \`"interaction"\` — only clicks are replayed post-hydration. Non-click events trigger hydration but no replay (focus can\\'t be reliably re-dispatched once the user has tabbed past; pointerenter is passive)`,
  },

  'server/serverIsland': {
    signature: 'serverIsland(loader: () => Promise<{ default: ComponentFn } | ComponentFn>, options: { name: string; fallback?: VNodeChild; cache?: string }): ComponentFn',
    example: `import { serverIsland } from '@pyreon/zero' // or '@pyreon/server'

const CartBadge = serverIsland(() => import('../islands/CartBadge'), {
  name: 'CartBadge',
  fallback: <span class="badge">Cart</span>,
})

// page stays SSG/ISR/CDN-cacheable; the badge renders per request
;<CartBadge label="Cart" />`,
    notes: `The INVERSE of \`island()\`: a static (CDN/ISR/prerender-cacheable) page with per-request SERVER-rendered holes. Every render emits only a \`<pyreon-server-island>\` marker carrying the name + codec-encoded props — the page contains nothing request-specific, so it stays cacheable. On the client each marker SELF-ACTIVATES on mount and fetches \`GET /_pyreon/fragment/<name>?props=…\` (auto-mounted by zero's createServer); the fragment renders per-request on the server with full request context (middleware locals, cookies — \`useRequestLocals()\` works inside). The endpoint is name-ALLOWLISTED — only registered islands render. \`fallback\` is the structural placeholder for no-JS clients and until the fragment arrives. \`cache\` sets the fragment response Cache-Control (default \`no-store\`) — only for fragments that do NOT vary on cookies/auth.`,
    mistakes: `- Passing children — island props cross the fragment boundary as codec-encoded data; children are dropped (same contract as client islands)
- Setting \`cache\` on a cookie-varying fragment — the same auth poisoning class as ISR cacheKey; the no-store default exists for a reason
- Expecting the fragment to hydrate interactivity — fragments are server-rendered HTML; composing a client island() INSIDE a server island is a documented follow-up, not v1
- Rendering personalized data in the PAGE around the island — the page is the cacheable part; everything request-specific belongs inside the island
- Two serverIsland() declarations with the same name — the endpoint serves the FIRST registration (dev-mode warns)`,
  },

  'server/useRequestLocals': {
    signature: 'useRequestLocals(): Record<string, unknown>',
    example: `import { useRequestLocals } from '@pyreon/server'

function Header() {
  const user = useRequestLocals().user as { name: string } | undefined
  return <span>{user?.name ?? 'Guest'}</span>
}`,
    notes: 'Read middleware `ctx.locals` inside components during SSR (and inside server-island fragments / server loaders). Non-generic — cast the fields you read. Returns an empty record outside a request context (client render).',
    mistakes: `- Importing it from \`@pyreon/zero\` — it lives in \`@pyreon/server\` (zero does not re-export it)
- Calling it with a type argument \`useRequestLocals<{ user }>()\` — the API is non-generic; cast the read instead`,
  },

  'server/hydrateIslands': {
    signature: 'hydrateIslands(registry: Record<string, () => Promise<ComponentFn | { default: ComponentFn }>>): () => void',
    example: `import { hydrateIslands } from "@pyreon/server/client"

hydrateIslands({
  Counter:  () => import("./Counter"),
  SearchBar: () => import("./SearchBar"),
  // hydrate: "never" islands are intentionally omitted —
  // registering them defeats the zero-JS contract.
})`,
    notes: 'Client-side counterpart to `island()`. Walks every `<pyreon-island>` element on the page and schedules hydration per its `data-hydrate` strategy. Manual form: the user maintains the `Name → loader` mapping by hand (must match every `island()` `name` field). Returns a cleanup function that disconnects pending observers / listeners. Use `hydrateIslandsAuto()` under `@pyreon/vite-plugin` to skip the manual sync. Imported from `@pyreon/server/client`, NOT from `@pyreon/server` (server-only entry). See also: island, hydrateIslandsAuto.',
    mistakes: `- Registry key must match the \`island()\` \`name\` field exactly — typo / drift causes runtime \`data-island-error="no-loader"\`. Use \`hydrateIslandsAuto()\` to eliminate this manual sync.
- Including a \`hydrate: "never"\` island in the registry — defeats the strategy by pulling its module into the client bundle. Skip never-islands; the runtime short-circuits silently for them.
- Importing from \`@pyreon/server\` instead of \`@pyreon/server/client\` — the main entry is server-only and stubs/throws on client-side use.`,
  },

  'server/hydrateIslandsAuto': {
    signature: 'hydrateIslandsAuto(registry: AutoIslandRegistry): () => void',
    example: `// src/entry-client.ts
import { hydrateIslandsAuto } from "@pyreon/server/client"
import * as registry from "virtual:pyreon/islands-registry"

hydrateIslandsAuto(registry)`,
    notes: 'Auto-discovered counterpart to `hydrateIslands()`. Under `@pyreon/vite-plugin` (`pyreon({ islands: true })` is the default), the plugin pre-scans your source for `island()` declarations and emits a `virtual:pyreon/islands-registry` virtual module. The user imports it into `entry-client.ts` and passes it here. Eliminates the manual `Name → loader` sync that drives the #1 author foot-gun for islands. Never-strategy islands are omitted from the auto-registry by design — their components stay out of the client bundle. See also: hydrateIslands, island.',
    mistakes: `- Calling without the registry argument — the function takes the imported virtual module explicitly. The user-side \`import\` is what lets the plugin\\'s \`resolveId\` hook run; importing from inside \`@pyreon/server/client\` would fail at build time because Rolldown\\'s static-import analysis runs before plugin resolveId hooks for workspace sources.
- Using under a non-Vite bundler — the virtual module only exists under \`@pyreon/vite-plugin\`. Fall back to manual \`hydrateIslands({ ... })\` for non-Vite consumers.
- Setting \`pyreon({ islands: false })\` and still calling \`hydrateIslandsAuto()\` — the plugin emits a stub registry that throws at runtime with a clear error message. Either re-enable islands (the default) or use \`hydrateIslands({ ... })\` instead.`,
  },

  'server/prerender': {
    signature: 'prerender(options: PrerenderOptions): Promise<PrerenderResult>',
    example: `await prerender({
  handler,
  paths: ["/", "/about", "/blog/1", "/blog/2"],
  outDir: "./dist",
})`,
    notes: 'Static-site generator built on `createHandler`. Walks the `paths` array (or async generator), invokes the handler for each path, and writes the rendered HTML to `outDir/<path>.html`. The `onPage(path, html)` callback fires per page so callers can post-process or stream output. Validates `outDir` against path traversal (`../` segments are rejected). Errors per-page are collected in the result, not thrown. See also: createHandler.',
    mistakes: `- Passing a relative \`outDir\` and being surprised when it resolves against \`process.cwd()\` — pass an absolute path for predictability
- Expecting per-page errors to throw — they\\'re collected in \`result.errors\`; check the array after \`await\`
- Generating thousands of paths without batching — the function processes the array sequentially; if you need parallelism, batch the \`paths\` array yourself`,
  },
  // <gen-docs:api-reference:end @pyreon/server>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/runtime-dom
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/runtime-dom>

  'runtime-dom/mount': {
    signature: 'mount(root: VNodeChild, container: Element): () => void',
    example: `import { mount } from "@pyreon/runtime-dom"

const dispose = mount(<App />, document.getElementById("app")!)

// To unmount:
dispose()`,
    notes: 'Mount a VNode tree into a container element. Clears the container first, sets up event delegation, then mounts the given child. Returns an `unmount` function that removes everything and disposes all effects. In dev mode, throws if `container` is null/undefined with an actionable error message. See also: hydrateRoot, render.',
    mistakes: `- \`createRoot(container).render(<App />)\` — Pyreon uses a single function call: \`mount(<App />, container)\`
- \`mount(<App />, document.getElementById("app"))\` without \`!\` — getElementById returns \`Element | null\`. The runtime throws in dev if null, but TypeScript needs the assertion
- \`mount(<App />, document.body)\` — mounting directly to body is discouraged; use a dedicated container element
- Forgetting to call the returned unmount function — leaks event listeners and effects. Store and call it on cleanup`,
  },

  'runtime-dom/render': {
    signature: 'render(root: VNodeChild, container: Element): () => void',
    example: `import { render } from "@pyreon/runtime-dom"
render(<App />, document.getElementById("app")!)`,
    notes: 'Alias for `mount`. Provided for API familiarity — both names point to the same function. See also: mount.',
  },

  'runtime-dom/hydrateRoot': {
    signature: 'hydrateRoot(root: VNodeChild, container: Element): () => void',
    example: `import { hydrateRoot } from "@pyreon/runtime-dom"

// Hydrate SSR-rendered HTML:
hydrateRoot(<App />, document.getElementById("app")!)`,
    notes: 'Hydrate server-rendered HTML. Walks the existing DOM and attaches reactive bindings without recreating elements. Expects the DOM to match the VNode tree structure — mismatches emit dev-mode warnings. Returns an unmount function. See also: mount, @pyreon/runtime-server.',
  },

  'runtime-dom/Transition': {
    signature: '<Transition name={name} mode={mode} onEnter={fn} onLeave={fn}>{children}</Transition>',
    example: `<Transition name="fade" mode="out-in">
  <Show when={visible()}>
    <div>Content</div>
  </Show>
</Transition>

/* CSS:
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
*/`,
    notes: 'CSS-based enter/leave animation wrapper. Applies `{name}-enter-from`, `{name}-enter-active`, `{name}-enter-to` classes on enter and the corresponding `-leave-*` classes on leave. `mode` controls sequencing: `"out-in"` waits for leave to complete before entering, `"in-out"` enters first. Has a 5-second safety timeout — if `transitionend`/`animationend` never fires, the transition completes automatically. See also: TransitionGroup, @pyreon/kinetic.',
    mistakes: `- Missing CSS classes — \`<Transition name="fade">\` does nothing without \`.fade-enter-active\` / \`.fade-leave-active\` CSS
- Wrapping multiple root elements — Transition expects a single child (or null). Multiple children cause undefined behavior
- Using \`mode="in-out"\` when you want sequential — \`"out-in"\` is almost always what you want (old leaves, then new enters)`,
  },

  'runtime-dom/TransitionGroup': {
    signature: '<TransitionGroup name={name} tag={tag}>{children}</TransitionGroup>',
    example: `<TransitionGroup name="list" tag="ul">
  <For each={items()} by={i => i.id}>
    {item => <li>{item.name}</li>}
  </For>
</TransitionGroup>

/* CSS:
.list-enter-active, .list-leave-active { transition: all 0.3s }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(10px) }
.list-move { transition: transform 0.3s }
*/`,
    notes: 'Animate list item additions and removals with CSS transitions. Each item gets enter/leave classes on mount/unmount. The `tag` prop controls the wrapper element (defaults to a fragment). Works with `<For>` for reactive lists. Also applies `-move` classes for FLIP-animated reordering. See also: Transition, For.',
  },

  'runtime-dom/KeepAlive': {
    signature: '<KeepAlive include={pattern} exclude={pattern} max={number}>{children}</KeepAlive>',
    example: `const tab = signal<"a" | "b">("a")

<KeepAlive>
  <Show when={tab() === "a"}><ExpensiveFormA /></Show>
  <Show when={tab() === "b"}><ExpensiveFormB /></Show>
</KeepAlive>`,
    notes: 'Cache component instances across mount/unmount cycles so their state (signals, scroll position, form inputs) is preserved when they are toggled out and back in. `include`/`exclude` filter by component name. `max` limits cache size (LRU eviction). Useful for tab panels and multi-step forms. See also: Transition, Show.',
  },

  'runtime-dom/_tpl': {
    signature: '_tpl(html: string, bind: (root: Element) => (() => void) | undefined): NativeItem',
    example: `// Compiler output for <div class="box">{text()}</div>:
_tpl("<div class=\\"box\\"> </div>", (__root) => {
  const __t0 = __root.firstChild
  const __d0 = _bindText(text, __t0)
  return () => { __d0() }
})`,
    notes: 'Compiler-internal: instantiate a cached template and run its bindings. The html string is parsed into a `<template>` ONCE per distinct string (module-level cache); every call `cloneNode(true)`s the content and invokes `bind(root)` — which wires reactive bindings and returns the cleanup. Returns a `NativeItem` (`{ __isNative, el, cleanup }`) that `mountChild`/`hydrateRoot` consume directly. Sole-dynamic-text children arrive with a BAKED `" "` placeholder text node in the html (grabbed via `.firstChild` — no createTextNode/appendChild per instantiation). Not intended for direct use — the JSX compiler emits `_tpl()` calls automatically. See also: _bindText, _bindDirect.',
  },

  'runtime-dom/_bindText': {
    signature: '_bindText(source: Signal-like, node: Text, caller?: () => unknown): () => void',
    example: `// Compiler output for <div>{count()}</div>:
_tpl("<div> </div>", (__root) => {
  const __t0 = __root.firstChild
  const __d0 = _bindText(count, __t0) // the SIGNAL, not a thunk
  return () => { __d0() }
})`,
    notes: `Compiler-internal: bind a SIGNAL (anything carrying \`._v\` + \`.direct\`) to a text node via \`TextNode.data\` assignment, returning a dispose function. The fast path BYPASSES the effect system entirely — it subscribes via the signal's \`.direct()\` single-subscriber slot (no Set, no deps array, no tracking-stack push); \`renderEffect\` is only the fallback for bare callables. Writes the initial value synchronously at bind time (which is why the baked \`" "\` template placeholder never renders). Each text node gets its own independent binding for fine-grained reactivity. See also: _tpl, _bindDirect.`,
  },

  'runtime-dom/sanitizeHtml': {
    signature: 'sanitizeHtml(html: string): string',
    example: `import { setSanitizer, sanitizeHtml } from "@pyreon/runtime-dom"
setSanitizer(DOMPurify.sanitize)
const clean = sanitizeHtml(userInput)`,
    notes: 'Sanitize an HTML string using the registered sanitizer (set via `setSanitizer()`). Falls back to the identity function if no sanitizer is registered. Used by the runtime when setting `innerHTML` on elements. See also: setSanitizer.',
  },

  'runtime-dom/__PYREON_DEVTOOLS__': {
    signature: 'window.__PYREON_DEVTOOLS__: { version; getComponentTree(); getAllComponents(); highlight(id); onComponentMount(cb); onComponentUnmount(cb); enableOverlay(); disableOverlay(); reactive: PyreonReactiveDevtools }',
    example: `// In the browser console (after the app has mounted):
$p.tree()                              // root component entries
window.__PYREON_DEVTOOLS__.reactive.activate()
window.__PYREON_DEVTOOLS__.reactive.getGraph()  // { nodes, edges }`,
    notes: 'Browser devtools hook, installed automatically on the first `mount()` (no-op on the server). Exposes the component tree + an element-picker overlay (also `Ctrl+Shift+P`) for the `@pyreon/devtools` Chrome extension, plus a `$p` console helper. The `reactive` namespace bridges `@pyreon/reactivity`’s opt-in graph: `reactive.activate()` / `deactivate()` start/stop tracking, `reactive.getGraph()` returns the live signal/computed/effect nodes + dependency edges, `reactive.getFires()` the bounded fire timeline — powering the extension’s Signals / Graph / Effects / Profiler / Console tabs. **Dev-only and tree-shaken from production builds**; `reactive` is zero-cost until `activate()` is called by an attached panel. See also: mount.',
    mistakes: `- Reading it before the first \`mount()\` — it is installed by mount; it is \`undefined\` until then (and always \`undefined\` on the server / in production builds)
- Expecting \`reactive.getGraph()\` to return data without calling \`reactive.activate()\` first — tracking is opt-in (zero-cost until a panel attaches)
- Depending on it in app code — it is a dev-tooling hook, tree-shaken in production; never branch runtime behavior on its presence`,
  },
  // <gen-docs:api-reference:end @pyreon/runtime-dom>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/runtime-server
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/runtime-server>

  'runtime-server/renderToString': {
    signature: 'renderToString(root: VNode | null): Promise<string>',
    example: `import { renderToString } from "@pyreon/runtime-server"

const html = await renderToString(<App />)`,
    notes: 'Render a VNode tree to a single HTML string. Each call runs in a fresh isolated ALS context stack (and store registry if `configureStoreIsolation` was called) so concurrent requests never bleed `provide()` frames into each other. Signal accessors are invoked synchronously to snapshot their CURRENT value — there is no reactivity on the server, so a `<div>{count()}</div>` renders the value at render time and only becomes live after client hydration. Async component functions (`async function C()`) are awaited before the walk continues. Returns the empty string for a `null` root. See also: renderToStream, runWithRequestContext.',
    mistakes: `- Expecting signal writes after \`renderToString\` to change the output — SSR is one-shot; the string is already produced. Reactivity is a post-hydration (client) concern
- Calling Pyreon context APIs (\`useHead\`, loaders) OUTSIDE \`renderToString\` and expecting per-request isolation — use \`runWithRequestContext\` for that; bare calls share the fallback stack across concurrent requests
- Reaching for \`renderToString\` directly when you have an HTTP handler — the \`createHandler\` in \`@pyreon/server\` wraps it with template precompilation, middleware, and loader-data injection; prefer that for request handling`,
  },

  'runtime-server/renderToStream': {
    signature: 'renderToStream(root: VNode | null, options?: { signal?: AbortSignal; suspenseTimeoutMs?: number }): ReadableStream<string>',
    example: `import { renderToStream } from "@pyreon/runtime-server"

return new Response(renderToStream(<App />, {
  signal: req.signal,
  suspenseTimeoutMs: 5_000, // ops-controlled per-boundary cap
}), {
  headers: { "content-type": "text/html" },
})`,
    notes: 'Render to a Web-standard `ReadableStream<string>` with true progressive flushing — synchronous subtrees enqueue immediately, async component boundaries are awaited in order. Suspense boundaries stream OUT OF ORDER: the fallback is emitted inline at once, and the resolved children arrive later as a `<template>` + a tiny inline swap `<script>` that replaces the placeholder client-side — without blocking the rest of the page. Each call gets its own isolated ALS context stack. A Suspense boundary that does not resolve within the per-boundary timeout (default 30_000 ms, configurable via `options.suspenseTimeoutMs`; pass `Infinity` to disable) leaves its fallback in place and a dev-mode warning fires; a boundary that throws also leaves the fallback (no swap script emitted). Pass `options.signal` (e.g. `Request.signal`) to abort pending Suspense work when the consumer disconnects. See also: renderToString.',
    mistakes: `- Assuming Suspense children arrive in source order — they are swapped in as each boundary resolves; the fallback ships first, resolved content can arrive in any order
- Expecting \`@pyreon/head\` tags registered inside a Suspense child to reach the document \`<head>\` — the head is flushed in the shell BEFORE any boundary resolves, so async-loaded data does not contribute to it
- Treating a timed-out boundary as an error — by design the fallback simply stays; only a dev-mode \`console.warn\` signals it. Tune \`options.suspenseTimeoutMs\` to match your SLA (5_000–10_000 typical for user-facing apps; \`Infinity\` to disable entirely for export jobs / reports)
- Buffering the whole stream before responding — that throws away the progressive-flush benefit; pass the stream straight into the \`Response\`
- Forgetting \`signal: req.signal\` — without it, in-flight Suspense work keeps running (and tries to write to a closed stream) after the consumer disconnects`,
  },

  'runtime-server/runWithRequestContext': {
    signature: 'runWithRequestContext<T>(fn: () => Promise<T>): Promise<T>',
    example: `import { runWithRequestContext } from "@pyreon/runtime-server"

const data = await runWithRequestContext(async () => {
  await prefetchLoaderData(router, url.pathname, request)
  return renderToString(<App />)
})`,
    notes: 'Run an async function inside a fresh, isolated ALS context stack (and store registry, if `configureStoreIsolation` was called). Use this when you need to call Pyreon context-aware APIs — `useHead`, `prefetchLoaderData`, router resolution — OUTSIDE a `renderToString` / `renderToStream` call but still want per-request isolation. Without it those calls land on a process-global fallback stack shared by every concurrent request. See also: renderToString, configureStoreIsolation.',
    mistakes: `- Calling \`prefetchLoaderData\` / \`useHead\` before \`renderToString\` WITHOUT wrapping the whole sequence in one \`runWithRequestContext\` — the prefetch lands in a different (or the shared fallback) context than the render, so the render sees no loader data
- Wrapping a synchronous function — the signature is \`() => Promise<T>\`; return the promise (or make the fn \`async\`) so the ALS scope spans the awaited work`,
  },

  'runtime-server/configureStoreIsolation': {
    signature: 'configureStoreIsolation(setStoreRegistryProvider: (fn: () => Map<string, unknown>) => void): void',
    example: `import { configureStoreIsolation } from "@pyreon/runtime-server"
import { setStoreRegistryProvider } from "@pyreon/store"

// once, at server startup:
configureStoreIsolation(setStoreRegistryProvider)`,
    notes: `Opt in to per-request \`@pyreon/store\` isolation. Call ONCE at server startup, passing \`@pyreon/store\`'s \`setStoreRegistryProvider\`. After this, every \`renderToString\` / \`renderToStream\` / \`runWithRequestContext\` call gets its own fresh store registry via ALS. WITHOUT calling it, store isolation is a no-op and all concurrent requests share ONE process-global store registry — request A's \`defineStore\` state is visible to request B (SSR state bleed across users). See also: runWithRequestContext, renderToString.`,
    mistakes: `- Not calling it at all in an SSR app that uses \`@pyreon/store\` — concurrent requests share one global registry, so one request’s store state leaks into another request’s render
- Calling it per request instead of once at startup — it only needs to wire the provider once; the per-request fresh \`Map\` is handled internally by the ALS run
- Passing something other than the \`setStoreRegistryProvider\` exported by \`@pyreon/store\` — the contract is specifically that provider-setter shape`,
  },

  'runtime-server/decodeKeyFromMarker': {
    signature: 'decodeKeyFromMarker(encoded: string): string',
    example: `import { decodeKeyFromMarker } from "@pyreon/runtime-server"

decodeKeyFromMarker("a%2Db") // "a-b"`,
    notes: 'Inverse of the internal For-list key encoder. `<For>` SSR emits per-item `<!--k:KEY-->` markers; the encoder URL-encodes the key and replaces every `-` with `%2D` so a user-supplied key can never form `-->` and break out of the HTML comment (an injection vector). `decodeKeyFromMarker` reverses that. Not used by the runtime today (hydration does not read per-item markers) — shipped alongside the encoder so future hydration or devtools consumers decode symmetrically without re-deriving the scheme.',
    mistakes: '- Assuming the runtime consumes this — it does not yet; it exists for forward-compat / devtools symmetry with the marker encoder',
  },
  // <gen-docs:api-reference:end @pyreon/runtime-server>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/store
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/store>

  'store/defineStore': {
    signature: '<T extends Record<string, unknown>>(id: string, setup: () => T) => () => StoreApi<T>',
    example: `const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const double = computed(() => count() * 2)
  const increment = () => count.update(n => n + 1)
  return { count, double, increment }
})

const { store, patch, subscribe, reset } = useCounter()
store.count()       // 0
store.increment()   // reactive update
patch({ count: 42 })`,
    notes: 'Define a composition-style store. The setup function runs once per store ID, returning an object whose signals become tracked state and whose functions become interceptable actions. Returns a hook function that produces a StoreApi with `.store` (user state/actions), `.patch()`, `.subscribe()`, `.onAction()`, `.reset()`, and `.dispose()`. Stores are singletons — calling the hook twice with the same ID returns the same instance. See also: StoreApi, addStorePlugin, resetStore, defineStore (schema mode).',
    mistakes: `- Calling \`useCounter()\` expecting a new instance — stores are singletons by ID. The setup runs once; the registry returns the same \`StoreApi\` for every later call with that ID until \`resetStore(id)\` / \`resetAllStores()\`
- Reading \`store.count\` without calling it — signals are functions; use \`store.count()\` to read
- Calling \`store.count.set()\` for multi-field updates instead of \`patch()\` — separate \`.set()\` calls each notify subscribers; \`patch()\` batches them into ONE \`type: "patch"\` mutation
- Forgetting \`dispose()\` / \`resetAllStores()\` in tests — the store persists in the global registry across test cases, leaking state into the next test. Put \`afterEach(() => resetAllStores())\` in setup
- Returning a non-signal, non-function value from \`setup\` (a plain object/array) and expecting it to be reactive — only signals become tracked state. Classification is duck-typed: signals = \`.set\` + \`.peek\`, computeds = \`.dispose\` (and not a signal), everything-else-callable = action. A plain object is none of these and is passed through inert
- Mutating state by reassigning \`store.count\` — it is a frozen accessor; write via \`store.increment()\` (an action) or \`patch({ count })\`. Direct property assignment is silently ineffective
- Registering an \`addStorePlugin\` AFTER the store was first created and expecting it to apply — plugins run only at creation time. The already-created store never sees it (see \`addStorePlugin\` mistakes)`,
  },

  'store/defineStore (schema mode)': {
    signature: '<S, U extends Record<string, unknown> = {}>(id: string, config: SchemaStoreConfig<S, U>) => () => SchemaStoreApi<SignalsOf<InferSchema<S>> & U>',
    example: `import { zodSchema } from '@pyreon/validation'
import { defineStore, computed } from '@pyreon/store'
import { z } from 'zod'

const UserSchema = zodSchema(z.object({
  name: z.string().min(1),
  age: z.number(),
}))

const useUser = defineStore('user', {
  schema: UserSchema,
  initial: { name: '', age: 0 },
  setup: ({ state }) => ({
    // state.name: Signal<string>  ← inferred from schema
    // state.age:  Signal<number>
    greet: computed(() => \`Hello, \${state.name()}\`),
  }),
})

const u = useUser()
u.store.name()                              // Signal read
u.store.greet()                             // computed
u.set({ name: 'Alice', age: 30 })           // validates + replaces
u.patch({ age: 31 })                        // validates merged + writes only changed
u.store.age.set(-1)                         // direct write — bypasses validation`,
    notes: 'Schema-driven `defineStore` overload. Accepts a `TypedSchemaAdapter` (from `@pyreon/validation` — Tier A.1) OR a Standard Schema-compliant schema (Tier A.2, e.g. raw zod 3.24+ / valibot 1.0+ / arktype 2.0+ / Effect Schema) plus an `initial` state. Field types are inferred from the schema — zero manual annotations. Returns a hook whose `store` exposes per-field signals at the top level alongside any setup-returned actions/computeds. `set` (full replace) and `patch` (partial merge) validate every write through the schema; direct signal writes (`store.field.set(v)`) bypass validation by design as an escape hatch for hot paths. The PARSED initial is written to signals — zod `.default()` / `.transform()` work correctly. Async validators are rejected at `defineStore`-time. For libraries without Standard Schema support (yup, joi, ajv, io-ts, etc.), users author a 5-10 line adapter (Tier B) matching the `_infer` + `parse` shape. See also: SchemaStoreApi, SchemaStoreConfig, SchemaStoreContext, StoreApi.',
    mistakes: `- **Direct signal writes bypass validation.** \`store.fieldName.set(v)\` writes directly to the underlying signal — the schema is NOT consulted. Intentional escape hatch for hot paths, but easy to hit by accident. Use \`.set(full)\` or \`.patch(partial)\` for guaranteed validation
- **Top-level fields only get signals.** Nested objects (e.g. \`prefs: { theme: "light" }\`) remain as VALUES inside the parent signal. To mutate a nested field: \`patch({ prefs: { ...store.prefs(), theme: "dark" } })\`. Recursive signal-ization is NOT supported — would require library-specific schema introspection
- **Async validators are unsupported.** If the schema validator returns a Promise, \`defineStore\` throws at definition-time. Use \`@pyreon/form\` for async refinements, or validate manually before calling \`.set()\`
- **\`initial\` is validated ONCE at defineStore-time.** A bad initial throws immediately (fail-fast). The PARSED initial (defaults applied, transforms run) is what gets written to signals — \`z.string().default("Alice")\` with \`initial: { name: undefined }\` yields \`store.name() === "Alice"\`
- **Reserved StoreApi keys can't be schema fields.** \`set\` is reserved on the returned API. A schema with \`set: z.string()\` throws at defineStore-time. Rename the schema field
- **setup() return-value collision with schema fields throws.** If your setup returns \`{ name: ... }\` but \`name\` is also a schema field, defineStore throws. Schema field signals always live on \`store\` at the top level — actions/computeds named identically would silently overwrite them, so the check is strict
- **\`patch((s) => ...)\` (functional form) skips validation.** The functional patch receives raw signals and is an explicit escape hatch. Use object form \`patch({ key: value })\` for validated writes
- **\`onValidationError\` callback suppresses the throw.** When set, validation failures invoke the callback with \`{ issues, op }\` and skip the write — state stays at its previous value. Without the callback, the same failure throws. Choose the mode that matches your UX (e.g. callback → show toast; throw → developer-time error boundary)`,
  },

  'store/SchemaStoreApi': {
    signature: 'interface SchemaStoreApi<T> extends StoreApi<T> { set(next): void; deepPatch(partial): void; update<K extends keyof T>(key: K, fn): void }',
    example: `const u = useUser()  // SchemaStoreApi<{ name: Signal<string>; prefs: Signal<{theme: string}> }>
u.set({ name: 'Alice', prefs: { theme: 'dark' } })   // full replace, validated
u.patch({ name: 'Bob' })                              // shallow per-field replace, validated
u.deepPatch({ prefs: { theme: 'dark' } })             // deep-merge nested objects, validated
u.update('items', items => items.filter(x => x.id !== 1))  // transform single field, validated`,
    notes: 'Return type of the schema-driven `defineStore` overload. Extends `StoreApi<T>` with four validated mutation methods: `set(next)` REPLACES the whole state atomically; `patch(partial)` SHALLOW-merges top-level fields (inherited from StoreApi, wrapped to validate the merged result); `deepPatch(partial)` recursively merges nested plain objects while REPLACING arrays / class instances / primitives; `update(key, transformer)` transforms a single field via callback (covers add / remove / map / filter / object-key-delete in one method). All four validate the merged result against the schema and throw on failure (or invoke `onValidationError` if configured). Direct signal writes (`store.field.set(v)`) bypass validation by design — the documented escape hatch. See also: defineStore (schema mode), DeepPartial, StoreApi.',
    mistakes: `- Passing the wrong shape to \`set\` — it requires the FULL state matching the schema. Use \`patch\` / \`deepPatch\` for partial updates
- Expecting \`set\` to silently merge — it REPLACES. Use \`patch\` (shallow) or \`deepPatch\` (recursive) to merge with current state
- Using \`patch({ prefs: { theme: "dark" } })\` expecting other \`prefs\` keys to survive — \`patch\` is SHALLOW, the whole \`prefs\` object is replaced. Use \`deepPatch\` for nested-object merging
- \`deepPatch\` REPLACES arrays / class instances / Dates — it only recurses into PLAIN objects. To merge an array, use \`update\` with a callback
- Using \`update\` for multi-field changes — it transforms ONE top-level field at a time. For multi-field updates, use \`patch\` / \`deepPatch\` / \`set\`
- Expecting \`update\`'s transformer to receive a strongly-typed value — current signature passes \`unknown\`. Cast at the call site (\`(n as number) + 1\`); future versions will infer from the schema`,
  },

  'store/DeepPartial': {
    signature: 'type DeepPartial<T> = T extends ReadonlyArray<unknown> ? T : T extends object ? { readonly [K in keyof T]?: DeepPartial<T[K]> } : T',
    example: `// State { count: number; prefs: { theme: string; density: string } }
// DeepPartial admits:
deepPatch({ count: 5 })                          // primitive field
deepPatch({ prefs: { theme: 'dark' } })          // partial nested object — density survives
deepPatch({ prefs: { theme: 'dark', density: 'compact' } })  // full nested object
// Arrays REPLACE — DeepPartial<T[]> = T[], must pass full array shape`,
    notes: 'Recursive partial — every property optional at every depth. Used by `SchemaStoreApi.deepPatch` as the partial-shape constraint. Arrays and primitives pass through unchanged (because `deepPatch` REPLACES them); only plain objects get the recursive optional treatment, matching the runtime merge semantics. See also: SchemaStoreApi.',
    mistakes: `- \`DeepPartial<T[]>\` is \`T[]\` (no element-level optionality) — arrays REPLACE in \`deepPatch\`. To mutate array contents, use \`update\`
- Class instances (Date, Map, Set) keep their full shape under \`DeepPartial\` — they are NOT plain objects and replace wholesale`,
  },

  'store/SchemaStoreConfig': {
    signature: 'interface SchemaStoreConfig<S, U> { schema: S; initial: InferSchema<S>; setup?: (ctx: SchemaStoreContext<InferSchema<S>>) => U; onValidationError?: (issues: SchemaIssue[], op: "set" | "patch" | "init") => void }',
    example: `defineStore('user', {
  schema: zodSchema(z.object({ name: z.string(), age: z.number() })),
  initial: { name: '', age: 0 },
  setup: ({ state, set, patch, reset }) => ({
    greet: computed(() => 'Hi, ' + state.name()),
  }),
  onValidationError: (issues, op) => toast.error(\`\${op}: \${issues.length} errors\`),
})`,
    notes: 'Config object passed as the 2nd arg of the schema-mode `defineStore` overload. `schema` accepts either a Pyreon `TypedSchemaAdapter` (from `@pyreon/validation`) or a Standard Schema-compliant instance — duck-typed at runtime. `initial` is validated once at definition time; the parsed (coerced) value is written to signals. `setup` (optional) runs once at store-creation; it receives the per-field signals + validated mutation helpers. `onValidationError`, if provided, replaces the default throw-on-invalid behavior — useful for non-fatal UX (e.g. show a toast instead of crashing the render). See also: defineStore (schema mode), SchemaStoreContext.',
    mistakes: `- \`schema\` must carry the type-inference brand — pass \`zodSchema(z.object(...))\`, not \`z.object(...)\` directly (for the Tier A.1 path). For Tier A.2 (Standard Schema), pass the raw schema — auto-detected via \`~standard\`
- \`initial\` is REQUIRED and is type-checked against \`InferSchema<S>\`. A bad shape is a TypeScript error
- \`setup\`-returned keys MUST NOT collide with schema field names — defineStore throws at construction`,
  },

  'store/SchemaStoreContext': {
    signature: 'interface SchemaStoreContext<T> { state: SignalsOf<T>; set: (next: T) => void; patch: (partial: Partial<T>) => void; reset: () => void }',
    example: `defineStore('counter', {
  schema: zodSchema(z.object({ count: z.number().nonnegative() })),
  initial: { count: 0 },
  setup: ({ state, patch }) => ({
    inc: () => patch({ count: state.count() + 1 }),    // validated
    dec: () => state.count.update(n => n - 1),         // BYPASSES validation — can go negative
  }),
})`,
    notes: 'Argument passed to the schema-mode `setup` function. `state` is the per-field signals map (`state.name` is `Signal<string>` etc.). `set` / `patch` / `reset` are validated mutation helpers — calling them from inside setup actions is the canonical way to write validated state. See also: defineStore (schema mode), SchemaStoreConfig.',
    mistakes: `- \`state.x.set(v)\` skips validation — for guaranteed validation, call \`set\`/\`patch\` from the context
- \`state\` contains SIGNALS, not values. Read via \`state.x()\`; assign via \`set\`/\`patch\` or direct \`state.x.set()\``,
  },

  'store/StoreApi': {
    signature: 'interface StoreApi<T> { store: T; id: string; state: Snapshot<T>; patch(p: Partial|fn): void; subscribe(cb): () => void; onAction(cb): () => void; reset(): void; dispose(): void }',
    example: `const { store, patch, subscribe, onAction, reset, dispose } = useCounter()
patch({ count: 42 })                       // object form — batched
patch((s) => { s.count.set(s.count.peek() + 1) }) // functional form: real signals
const off = subscribe((m) => console.log(m.type, m.events))
onAction((ctx) => { ctx.after((r) => log(r)); ctx.onError((e) => report(e)) })
reset()      // signals → setup-time values
dispose()    // teardown + registry removal`,
    notes: 'The object the `defineStore` hook returns. `store` is the user state + actions; `id` the registry key; `state` a plain-value snapshot getter (signals read via `.peek()`, no tracking — safe to log / serialize). `patch` batch-updates signals; `subscribe` fires per mutation with `{ storeId, type: "direct" | "patch", events }`; `onAction` intercepts wrapped actions (`ctx.name`, `ctx.args`, `ctx.after(fn)`, `ctx.onError(fn)`); `reset` restores each signal to its setup-time `.peek()` value; `dispose` unsubscribes all listeners and removes the store from the registry. See also: defineStore, addStorePlugin.',
    mistakes: `- \`patch({ typoKey: 1 })\` is a SILENT no-op — object-form patch only writes keys that are signal names; an unknown / mistyped key is skipped with no error or warning. Verify key names
- \`patch\` silently drops \`__proto__\` / \`constructor\` / \`prototype\` keys (prototype-pollution guard) — a state field literally named one of those cannot be patched via the object form; use the functional form
- Expecting \`reset()\` to restore the "last good" or current-default value — it restores the value captured by \`.peek()\` when \`setup\` first ran. A signal whose initial value was itself derived at setup resets to THAT, not to a fresh recomputation
- Reading \`.state\` and expecting it to be reactive — it is a one-shot plain snapshot via \`.peek()\` (no tracking). Reading it inside an \`effect\`/\`computed\` will NOT re-run on change; read \`store.x()\` for reactive access
- Keeping a destructured \`store\`/\`patch\` reference after \`resetStore(id)\` — the old \`StoreApi\` keeps working but is detached from the registry; the next hook call creates a NEW instance and your stale reference points at the orphan
- Returning the \`subscribe\` / \`onAction\` disposer and never calling it — listeners live until disposed (or the store is disposed); in long-lived stores this leaks`,
  },

  'store/addStorePlugin': {
    signature: '(plugin: StorePlugin) => void',
    example: `// Register BEFORE any store hook is first called.
addStorePlugin((api) => {
  api.subscribe((mutation) => {
    console.log(\`[\${api.id}] \${mutation.type}:\`, mutation.events)
  })
})`,
    notes: 'Register a global store plugin. The plugin runs ONCE per store, at first creation of that store, receiving its full `StoreApi` — for logging, persistence, devtools, etc. Runs for every store created AFTER registration. Plugin throws are caught and (dev-only) `console.warn`ed so one bad plugin cannot break store creation — but in production a throwing plugin fails completely silently. The plugin chain is uncached: cost is O(stores × plugins) across all fresh store creations. See also: defineStore, StoreApi.',
    mistakes: `- Registering AFTER a store was already created — plugins run only at creation. Stores already in the registry never receive the plugin. Register at module init before the first hook call, or \`resetStore(id)\` to force re-creation through the plugin chain
- Relying on a plugin throw surfacing in production — errors are swallowed with only a dev-mode \`console.warn\`. A plugin that throws in prod silently does nothing; make the plugin itself defensive
- Calling \`api.subscribe\` / \`api.onAction\` in a plugin without ever disposing — those listeners live for the whole store lifetime; in tests they accumulate across cases unless \`resetAllStores()\` runs in cleanup
- Registering many plugins and not noticing the cost — the chain is uncached and runs per fresh store creation (O(stores × plugins)); the \`store.pluginRun\` perf counter scales exactly with this
- Assuming plugin registration is idempotent — \`addStorePlugin\` pushes onto a list every call; registering the same plugin twice runs it twice per store`,
  },

  'store/setStoreRegistryProvider': {
    signature: '(provider: () => Map<string, StoreApi<any>>) => void',
    example: `import { setStoreRegistryProvider } from '@pyreon/store'
import { AsyncLocalStorage } from 'node:async_hooks'

const als = new AsyncLocalStorage<Map<string, any>>()
setStoreRegistryProvider(() => als.getStore() ?? new Map())`,
    notes: 'Replace the default global store registry with a provider function. Essential for concurrent SSR — pass an AsyncLocalStorage-backed provider so each request gets isolated store state instead of sharing a single global map across concurrent requests. See also: defineStore.',
    mistakes: '- Forgetting to call this on the SSR server — all concurrent requests share the same store instances, causing cross-request state leaks',
  },

  'store/resetStore': {
    signature: '(id: string) => void',
    example: `resetStore('counter') // next useCounter() call builds a fresh store`,
    notes: 'Remove ONE store from the registry by ID. The next call to that store hook re-runs `setup` from scratch, producing a brand-new `StoreApi`. For per-test isolation and HMR. Does NOT dispose the old instance or notify its subscribers — it just detaches it from the registry. See also: resetAllStores, defineStore, StoreApi.',
    mistakes: `- Expecting components/closures holding the OLD \`StoreApi\` to pick up the new one — they keep operating on the now-orphaned old instance. \`resetStore\` only affects what the NEXT hook call resolves
- Using it as a "clear state" within a live app — it swaps the instance, so any active subscribers/effects bound to the old store go stale. For in-app state clearing use \`reset()\` on the StoreApi (restores setup-time values, keeps the instance + subscribers)
- Calling it without re-invoking the hook and expecting fresh state — the new store is created lazily on the next hook call, not by \`resetStore\` itself
- Passing a wrong / mistyped ID — silently no-ops (the ID simply is not in the registry); state is not reset and you get no error`,
  },

  'store/resetAllStores': {
    signature: '() => void',
    example: 'afterEach(() => resetAllStores()) // canonical test isolation',
    notes: 'Clear the ENTIRE store registry. Every subsequent store hook call creates a fresh instance. Primary use: test cleanup (the canonical `afterEach`) and forcing a clean slate. Like `resetStore`, it detaches — it does not dispose old instances or notify their subscribers. See also: resetStore, setStoreRegistryProvider.',
    mistakes: `- Forgetting it in test cleanup — THE store-test footgun: a store mutated in one test persists into the next, causing order-dependent failures that pass in isolation. \`afterEach(() => resetAllStores())\` is mandatory boilerplate
- Expecting it to also clear registered plugins — \`addStorePlugin\` registrations are global and survive \`resetAllStores()\`. Stores re-created afterward still run the previously-registered plugins
- Calling it mid-render in a live app — every component holding a destructured store keeps its orphaned instance while new hook calls build fresh ones; you get a split-brain UI. This is a test/SSR-isolation tool, not runtime state management
- Relying on it for SSR request isolation instead of \`setStoreRegistryProvider\` — calling \`resetAllStores()\` per request is racy under concurrency (one request wipes stores belonging to a concurrent request mid-flight); use an AsyncLocalStorage-backed registry provider`,
  },
  // <gen-docs:api-reference:end @pyreon/store>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/state-tree
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/state-tree>

  'state-tree/model': {
    signature: 'model({ state }) | model({ schema, initial?, onValidationError? }) → ModelDefinition; chain .views(f).actions(f) then .create(initial?) or .asHook(id)',
    example: `// Plain mode
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
    notes: 'Define a reactive model via a chainable builder. Two modes (mutually exclusive): **plain mode** `model({ state })` declares signal-backed fields with their initial values; **schema mode** `model({ schema, initial? })` validates state via a TypedSchemaAdapter (`zodSchema` / `valibotSchema` / `arktypeSchema`) or a Standard Schema-compliant instance (zod 3.24+ / valibot 1.0+ / arktype 2.0+ / Effect Schema, etc.) — types are inferred end-to-end. Chain `.views(f)` for derived values and `.actions(f)` for mutators; both are CHAINABLE — every subsequent layer sees prior views + actions via `self`. Schema mode adds `set` / `patch` / `reset` helpers on `self` and on the instance, each validated through the schema. Actions can be `async`; `await u.fetchPosts()` works end-to-end and middleware sees completion via `await next(call)`. Returns a `ModelDefinition` — call `.create(initial?)` for an independent instance or `.asHook(id)` for a singleton. See also: ModelDefinition, SchemaModelHelpers, getSnapshot, applySnapshot, onPatch, addMiddleware.',
    mistakes: `- Mutating state outside of actions — bypasses middleware and patch recording, breaks the structured contract
- Forgetting that \`self.count\` is a signal — read with \`self.count()\`, write with \`self.count.set(v)\` or \`.update(fn)\` inside actions
- Nesting plain objects in state instead of child models — plain objects are not signal-backed, changes to their properties are not reactive
- Confusing \`self.set\` (validates against schema, throws on failure) with \`self.field.set(v)\` (direct signal write, bypasses validation — the documented escape hatch)
- Using \`model({ state, views, actions })\` — that single-config form was REMOVED. Chain \`.views()\` / \`.actions()\` instead
- Defining views/actions referencing each other across MULTIPLE \`.actions()\` blocks but expecting tight typing — \`self\` in each block is loosely typed at the tail (\`Record<string, any>\`) so cross-block calls work; the cost is weak inference for cross-block helpers`,
  },

  'state-tree/SchemaModelHelpers': {
    signature: 'interface SchemaModelHelpers<TState> { set, patch, deepPatch, update<K>, reset }',
    example: `// All five helpers — pick by mutation shape:
u.set({ name: 'Bob', age: 40, prefs: { theme: 'dark', density: 'cozy' } })   // full replace
u.patch({ name: 'Bob' })                                                       // shallow merge
u.deepPatch({ prefs: { theme: 'dark' } })                                      // recursive merge — density survives
u.update('items', items => items.filter(x => x.id !== 1))                      // transform one field
u.reset()                                                                       // restore parsed initial`,
    notes: `The five schema-validated mutation helpers exposed on every schema-mode model instance AND on \`self\` inside schema-mode action/view factories. \`$\`-prefixed so they never collide with user schema field names (\`name\`, \`set\`, \`patch\`, etc.). All five validate the merged result through the schema before writing to signals (or invoke \`onValidationError\` if configured). Direct signal writes (\`self.field.set(v)\`) bypass validation — the documented escape hatch. Parallel to \`@pyreon/store\`'s \`SchemaStoreApi\`. See also: model, DeepPartial.`,
    mistakes: `- \`patch({ prefs: { theme } })\` REPLACES the whole \`prefs\` object (shallow merge); use \`deepPatch\` to keep \`density\` intact
- \`deepPatch\` REPLACES arrays / class instances (Date, Map, Set) — only plain objects recurse
- \`update\`'s transformer is \`(unknown) => unknown\` — cast at the call site for typed inference (key is constrained to \`keyof TState & string\`)
- Using \`update\` for multi-field changes — it transforms ONE top-level field at a time; use \`patch\` / \`deepPatch\` / \`set\` for multi-field`,
  },

  'state-tree/DeepPartial': {
    signature: 'type DeepPartial<T> = T extends ReadonlyArray<unknown> ? T : T extends object ? { readonly [K in keyof T]?: DeepPartial<T[K]> } : T',
    example: `// State { count: number; prefs: { theme: string; density: string } }
// DeepPartial admits:
deepPatch({ count: 5 })                                  // primitive field
deepPatch({ prefs: { theme: 'dark' } })                  // partial nested object — density survives
deepPatch({ prefs: { theme: 'dark', density: 'cozy' } }) // full nested object
// Arrays REPLACE — DeepPartial<T[]> = T[], must pass full array shape`,
    notes: `Recursive partial — every property optional at every depth. Used by \`SchemaModelHelpers.deepPatch\` as the partial-shape constraint. Arrays and primitives pass through unchanged (because \`deepPatch\` REPLACES them); only plain objects get the recursive optional treatment, matching the runtime merge semantics. Parallel to \`@pyreon/store\`'s \`DeepPartial\`. See also: SchemaModelHelpers, model.`,
    mistakes: `- \`DeepPartial<T[]>\` is \`T[]\` (no element-level optionality) — arrays REPLACE in \`deepPatch\`. To mutate array contents, use \`update\`
- Class instances (Date, Map, Set) keep their full shape under \`DeepPartial\` — they are NOT plain objects and replace wholesale`,
  },

  'state-tree/ModelDefinition': {
    signature: 'class ModelDefinition<TState, TViews, TActions, HasSchema> { views(f), actions(f), create(initial?), asHook(id) }',
    example: `const M = model({ schema })
  .views((self) => ({ a: () => self.x() }))     // self has state
  .views((self) => ({ b: () => self.a() + 1 })) // self also has a
  .actions((self) => ({ go: () => self.b() })) // self has a + b
  .actions((self) => ({ go2: () => self.go() })) // self has a + b + go`,
    notes: 'The chainable builder returned by `model()`. Each `.views(f)` / `.actions(f)` returns a NEW `ModelDefinition` with the accumulated layer — immutable builder, safe to share across call sites. `f` receives `self` typed as the model AS IT IS SO FAR (state signals + prior views + prior actions + schema helpers when applicable). Type parameters: `TState` is the underlying value shape; `TViews` / `TActions` accumulate across chain steps; `HasSchema` flips to `true` in schema mode (adds `set`/`patch`/`reset` to instance type). See also: model.',
    mistakes: `- Trying to mutate \`_config\` directly — it's frozen by intent. Use the chain methods.
- Forgetting that \`.views(f).actions(g)\` does NOT call \`f\` or \`g\` immediately — they run inside \`.create()\`. Side effects in factories run per-instance, not per-definition.`,
  },

  'state-tree/getSnapshot': {
    signature: '(instance: ModelInstance) => Snapshot',
    example: 'const snap = getSnapshot(counter) // { count: 10 }',
    notes: 'Recursively serialize a model instance into a plain JSON-safe snapshot. Reads all signal values via `.peek()` to avoid tracking subscriptions. Nested models are recursively serialized. See also: applySnapshot, model.',
  },

  'state-tree/applySnapshot': {
    signature: '(instance: ModelInstance, snapshot: Snapshot) => void',
    example: 'applySnapshot(counter, { count: 0 }) // reset to zero',
    notes: `Replace a model instance's state wholesale from a snapshot. Recursively applies to nested models. Triggers patch listeners with replace operations. See also: getSnapshot, model.`,
  },

  'state-tree/onPatch': {
    signature: '(instance: ModelInstance, listener: PatchListener) => () => void',
    example: `const dispose = onPatch(counter, (patch) => {
  console.log(patch) // { op: 'replace', path: '/count', value: 11 }
})`,
    notes: 'Subscribe to JSON patches emitted by actions on a model instance. Each patch records the path, operation (add/replace/remove), and value. Returns an unsubscribe function. Pairs with `applyPatch` for undo/redo and state synchronization. See also: applyPatch, model.',
  },

  'state-tree/applyPatch': {
    signature: '(instance: ModelInstance, patch: Patch | Patch[]) => void',
    example: `applyPatch(counter, { op: 'replace', path: '/count', value: 0 })`,
    notes: 'Apply one or more JSON patches to a model instance. Accepts a single patch or an array for batch replay. Used with `onPatch` for undo/redo and state synchronization. See also: onPatch, model.',
  },

  'state-tree/addMiddleware': {
    signature: '(instance: ModelInstance, middleware: MiddlewareFn) => () => void',
    example: `addMiddleware(counter, (call, next) => {
  console.log(\`\${call.name}(\${call.args.join(', ')})\`)
  return next(call)
})`,
    notes: 'Add an action interception middleware to a model instance. The middleware receives the action call context and a `next` function — call `next(call)` to proceed or return early to block the action. Returns an unsubscribe function. See also: model.',
  },
  // <gen-docs:api-reference:end @pyreon/state-tree>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/form

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/validation
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/validation>

  'validation/zodSchema': {
    signature: '<T>(schema: ZodType<T>) => SchemaAdapter<T>',
    example: `const schema = z.object({ email: z.string().email(), age: z.number().min(18) })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: zodSchema(schema),
  onSubmit: (values) => save(values),
})`,
    notes: 'Create a whole-form schema adapter from a Zod schema. Duck-typed against the `.safeParse()` method so it works with both Zod v3 and v4 without version checks. Pass the result to `useForm({ schema })` for automatic full-form validation on submit or blur. See also: zodField, valibotSchema, arktypeSchema.',
    mistakes: `- Passing zodSchema AND per-field validators for the same field — both run and errors may conflict
- Using zodSchema with a non-object schema (z.string()) — form schemas must validate an object shape matching initialValues`,
  },

  'validation/zodField': {
    signature: '<T>(schema: ZodType<T>) => ValidateFn<T>',
    example: `const form = useForm({
  initialValues: { username: '' },
  validators: { username: zodField(z.string().min(3).max(20)) },
  onSubmit: (values) => save(values),
})`,
    notes: `Create a per-field validator from a Zod schema. Returns a function compatible with \`useForm({ validators: { fieldName: zodField(z.string().email()) } })\`. Use when individual fields have independent validation rules that don't need cross-field context. See also: zodSchema, valibotField.`,
  },

  'validation/valibotSchema': {
    signature: '<T>(schema: ValibotSchema<T>, safeParse: SafeParseFn) => SchemaAdapter<T>',
    example: `import * as v from 'valibot'
const schema = v.object({ email: v.pipe(v.string(), v.email()) })
const form = useForm({
  initialValues: { email: '' },
  schema: valibotSchema(schema, v.safeParse),
  onSubmit: (values) => save(values),
})`,
    notes: `Create a whole-form schema adapter from a Valibot schema. Requires passing the \`safeParse\` function explicitly (Valibot uses standalone functions, not methods). This keeps the adapter independent of Valibot's internal module structure across versions. See also: valibotField, zodSchema.`,
    mistakes: '- Forgetting to pass v.safeParse as the second argument — the adapter cannot call safeParse without it since Valibot uses standalone functions',
  },

  'validation/valibotField': {
    signature: '<T>(schema: ValibotSchema<T>, safeParse: SafeParseFn) => ValidateFn<T>',
    example: 'validators: { email: valibotField(v.pipe(v.string(), v.email()), v.safeParse) }',
    notes: 'Create a per-field validator from a Valibot schema. Same standalone-function-style as valibotSchema — pass `v.safeParse` explicitly. See also: valibotSchema, zodField.',
  },

  'validation/arktypeSchema': {
    signature: '<T>(schema: ArkTypeSchema<T>) => SchemaAdapter<T>',
    example: `import { type } from 'arktype'
const schema = type({ email: 'email', age: 'number > 18' })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: arktypeSchema(schema),
  onSubmit: (values) => save(values),
})`,
    notes: 'Create a whole-form schema adapter from an ArkType type. ArkType validation is synchronous only — async validators are not supported through this adapter. Returns errors via the ArkType `problems` array. See also: arktypeField, zodSchema.',
  },

  'validation/arktypeField': {
    signature: '<T>(schema: ArkTypeSchema<T>) => ValidateFn<T>',
    example: `validators: { age: arktypeField(type('number > 18')) }`,
    notes: 'Create a per-field validator from an ArkType type. Synchronous only, same as arktypeSchema. See also: arktypeSchema, zodField.',
  },
  // <gen-docs:api-reference:end @pyreon/validation>
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/form>

  'form/useForm': {
    signature: '<TValues extends Record<string, unknown>>(options: UseFormOptions<TValues>) => FormState<TValues>',
    example: `const form = useForm({
  initialValues: { email: '', password: '' },
  validators: {
    email: (v) => (!v ? 'Required' : undefined),
    password: (v, all) => (v.length < 8 ? 'Too short' : undefined),
  },
  onSubmit: async (values) => { await login(values) },
})

// Bind inputs with register():
// h('input', form.register('email'))
// h('input', { type: 'checkbox', ...form.register('remember', { type: 'checkbox' }) })`,
    notes: `Create a signal-based form. \`initialValues\` drives field keys and types end-to-end — TValues is inferred from it, so all downstream typings (\`useField\` field name, \`useWatch\` keys, validator signatures) are fully typed without annotation. Returns \`FormState<TValues>\` with per-field signals, form-level signals (\`isSubmitting\`, \`isValidating\`, \`isValid\`, \`isDirty\`, \`submitCount\`, \`isSubmitted\`, \`isSubmitSuccessful\`, \`submitError\`), and handlers (\`handleSubmit\`, \`reset\`, \`validate\`, \`trigger\`). react-hook-form-parity accessors: \`trigger(name?)\` validates a field/subset/whole-form on demand; \`getValues(name?)\` reads one value or all; \`dirtyFields()\` / \`touchedFields()\` return the changed/visited fields as records; \`getFieldState(name)\` returns a field's live signals; \`isSubmitted\` / \`isSubmitSuccessful\` track submit lifecycle. \`validateOn\` defaults to \`"blur"\` (not \`"change"\`) so users aren't scolded mid-keystroke; optional \`schema\` integrates with \`@pyreon/validation\` adapters (\`zodSchema\`, \`valibotSchema\`, \`arktypeSchema\`) for whole-form validation after per-field validators run. See also: useField, FormProvider, useFormState.`,
    mistakes: `- Mutating \`initialValues\` after creation — it is read once at setup; use \`setFieldValue\` for programmatic updates
- Reading \`form.fields[name].value\` as a plain value — it is \`Signal<T>\`, call it: \`form.fields.email.value()\`
- Passing \`validateOn: "change"\` without \`debounceMs\` on async validators — fires a network request on every keystroke
- Calling \`form.handleSubmit()\` without attaching it as a form \`onSubmit\` handler — it calls \`preventDefault()\` so it must receive the form event, or be called with no argument for programmatic submit
- Forgetting that \`schema\` runs AFTER per-field \`validators\` — errors from both sources merge; if a field validator already set an error, the schema can override it`,
  },

  'form/useField': {
    signature: '<TValues, K extends keyof TValues & string>(form: FormState<TValues>, name: K) => UseFieldResult<TValues[K]>',
    example: `function EmailField({ form }: { form: FormState<{ email: string }> }) {
  const field = useField(form, 'email')
  return (
    <>
      <input {...field.register()} />
      {() => field.showError() && <span>{field.error()}</span>}
    </>
  )
}`,
    notes: `Extract a single field's state and helpers from a form instance — avoids passing the entire \`FormState\` to leaf components. Returns all \`FieldState\` signals (\`value\`, \`error\`, \`touched\`, \`dirty\`) plus two convenience computeds: \`hasError\` (true when an error string exists) and \`showError\` (true when touched AND errored — the typical UI condition for gating error display). Also exposes \`register(opts?)\` to bind an \`<input>\` element with a single spread. See also: useForm, useWatch.`,
    mistakes: `- Destructuring \`const { value } = useField(form, "email")\` and calling \`value()\` — works, but the getter evaluates to the Signal itself; storing \`value()\` at setup captures the initial value and defeats reactivity
- Forgetting \`showError\` and reimplementing \`touched() && hasError()\` in every template — \`showError\` is a \`Computed<boolean>\`, use it directly`,
  },

  'form/useFieldArray': {
    signature: '<T>(initial?: T[]) => UseFieldArrayResult<T>',
    example: `const tags = useFieldArray<string>([])
tags.append('typescript')
tags.prepend('signals')
tags.insert(1, 'reactive')
tags.move(0, 2)
tags.remove(0)

// Keyed rendering — never drop the \`by={i => i.key}\`
<For each={tags.items()} by={(i) => i.key}>
  {(item) => <input value={item.value()} onInput={(e) => item.value.set(e.currentTarget.value)} />}
</For>`,
    notes: 'Manage a dynamic array of form fields with stable keys. Each item is `{ key: number, value: Signal<T> }` — use `item.key` inside `<For by={i => i.key}>` so reordering / inserts do not remount child components. Full mutation surface: `append`, `prepend`, `insert`, `remove`, `update`, `move`, `swap`, `replace`. See also: useForm.',
    mistakes: `- Rendering with <For by={(_, i) => i}> — index-based keys lose identity on reorder, defeating the stable-key design
- Calling tags.items() inside setup and storing the array — it is a Signal, read inside reactive scopes`,
  },

  'form/useWatch': {
    signature: '(form, name) => Signal<TValues[K]> | (form, names[]) => Signal<T>[] | (form) => Computed<TValues>',
    example: `const email = useWatch(form, 'email')            // Signal<string>
const [first, last] = useWatch(form, ['firstName', 'lastName'])
const everything = useWatch(form)                 // Computed<TValues>

// Derive and sync: preview displays the email as the user types.
effect(() => { preview.set(\`Hello \${email()}\`) })`,
    notes: 'Typed overloads for reactively watching form field values. Single-field form returns `Signal<T>` (fast path — same signal, no wrapper), multi-field returns a tuple of signals, no-args returns a `Computed<TValues>` over the whole values object. Prefer the narrowest form — watching everything re-runs your effect when ANY field changes. See also: useFormState, useField.',
    mistakes: '- Using the all-fields overload (`useWatch(form)`) to derive a single computed — re-runs when any field changes, not just the one you care about. Use `useWatch(form, "email")` for single-field precision',
  },

  'form/useFormState': {
    signature: '<TValues, T>(form: FormState<TValues>, selector?: (s: FormStateSummary) => T) => Computed<T>',
    example: `const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting && s.isDirty)
<button disabled={!canSubmit()}>Save</button>`,
    notes: 'Computed summary of form-level state (`isValid`, `isDirty`, `isSubmitting`, `isValidating`, `submitCount`, `errors`). Passing a selector restricts the tracked subset — a button driven by `canSubmit` should not re-render just because `submitCount` changed. Without a selector, the computed re-derives on ANY form-level state change. See also: useForm, useWatch.',
    mistakes: '- Omitting the selector and reading `useFormState(form)` as a whole — triggers on every field change, every validation, every submit count bump. Always pass a selector for UI-bound computeds',
  },

  'form/FormProvider': {
    signature: '<TValues>(props: { form: FormState<TValues>; children: VNodeChild }) => VNode',
    example: `<FormProvider form={form}>
  <PersonalInfoSection />
  <AddressSection />
  <SubmitButton />
</FormProvider>

// Inside any descendant:
const form = useFormContext<typeof values>()`,
    notes: 'Provide a form via context so nested components can read it with `useFormContext<TValues>()` without prop-drilling. Every call to `useFormContext` inside the provider tree returns the same `FormState` instance. Nest inside `PyreonUI` or any other provider — the form context is independent. See also: useFormContext, useForm.',
    mistakes: '- Nesting `FormProvider` within itself expecting scoped forms — the inner provider shadows the outer; for multi-form pages, use separate providers at sibling level, not nested',
  },

  'form/useFormContext': {
    signature: '<TValues>() => FormState<TValues>',
    example: `const form = useFormContext<{ email: string; password: string }>()
const field = useField(form, 'email')`,
    notes: 'Read the nearest `FormProvider` form from context. Throws at dev time if no provider is mounted above the call site. Pass the expected `TValues` generic so downstream typings (`useField` field names, `useWatch` keys) stay end-to-end typed. Returns the same `FormState<TValues>` instance that was passed to `FormProvider`. See also: FormProvider, useForm.',
    mistakes: `- Calling at module scope — hooks require an active component setup context; call inside a component body
- Omitting the \`<TValues>\` generic — TypeScript infers \`FormState<Record<string, unknown>>\` and \`useField\` field names lose type narrowing`,
  },
  // <gen-docs:api-reference:end @pyreon/form>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/query
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/query>

  'query/QueryClientProvider': {
    signature: '(props: { client: QueryClient; children: VNodeChild }) => VNode',
    example: `const client = new QueryClient()
<QueryClientProvider client={client}>
  <App />
</QueryClientProvider>`,
    notes: 'Mounts a `QueryClient` at the root of the component tree via context so every descendant hook (`useQuery`, `useMutation`, `useSubscription`, `useSSE`, etc.) can reach it via `useQueryClient()`. Must wrap the app — omitting it causes a runtime throw on the first hook call. One provider per app; nested providers are not supported (the deepest one wins, silently shadowing the outer). See also: useQueryClient, QueryClient.',
    mistakes: `- Forgetting to wrap the app — every query/mutation hook throws "No QueryClient set" at runtime
- Creating the \`QueryClient\` inside a component body — it re-creates on every render. Hoist to module scope or use \`useMemo\`-equivalent (\`const client = useMemo(() => new QueryClient())\`)
- Nesting providers expecting scoped caches — only one provider is supported; the deepest one wins silently`,
  },

  'query/HydrationBoundary': {
    signature: '(props: { state?: DehydratedState | null; options?: HydrateOptions; children: VNodeChild }) => VNodeChild',
    example: `// server: const state = dehydrate(queryClient)
// client:
<QueryClientProvider client={client}>
  <HydrationBoundary state={state}>
    <App />
  </HydrationBoundary>
</QueryClientProvider>`,
    notes: `Hydrates a server-dehydrated query cache into the nearest \`QueryClient\`, then renders its children — the ergonomic SSR companion to the \`dehydrate\` / \`hydrate\` functions. Hydration happens once, synchronously, in component setup BEFORE children mount, so descendant \`useQuery\` calls resolve from the server-fetched cache (no loading flash, no refetch). \`state\` is the static dehydrated blob serialized from the server render. Marked \`nativeCompat\` so the \`useQueryClient()\` lookup + \`hydrate()\` run in Pyreon's setup frame even under the \`*-compat\` jsx() runtimes. See also: QueryClientProvider, useQueryClient.`,
    mistakes: `- Passing a reactive accessor for \`state\` — hydration reads \`state\` once at setup; a server dehydrated blob is static, so a signal-wrapped value is unnecessary and only the initial read takes effect
- Hydrating into a different \`QueryClient\` than the one the children read — \`HydrationBoundary\` hydrates the nearest provider's client; ensure the same \`QueryClientProvider\` wraps both`,
  },

  'query/useQuery': {
    signature: '<TData, TError, TKey>(options: () => QueryObserverOptions<...>) => UseQueryResult<TData, TError>',
    example: `const userId = signal(1)
const user = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetch(\`/api/users/\${userId()}\`).then((r) => r.json()),
}))
// user.data(), user.error(), user.isFetching() — each its own signal`,
    notes: `Subscribe to a query with fine-grained reactive signals. \`options\` is a FUNCTION (not an object) so it can read Pyreon signals — when a tracked signal inside changes (e.g. a reactive queryKey), the observer re-evaluates options and refetches automatically. Returns one independent \`Signal<T>\` per observer field (\`data\`, \`error\`, \`status\`, \`isPending\`, \`isLoading\`, \`isFetching\`, \`isError\`, \`isSuccess\`) so templates only re-run for the exact fields they read. Internally wraps TanStack's \`QueryObserver\` and subscribes via \`onUnmount\`-guarded effect — the observer unsubscribes when the component unmounts. See also: useQueryClient, useMutation, useSuspenseQuery.`,
    mistakes: `- Passing the options object directly instead of a function — loses reactive queryKey support; the observer never re-evaluates when signals change
- Reading \`.data\` / \`.error\` / \`.isFetching\` as plain values — they are \`Signal<T>\`, call them: \`user.data()\`, \`user.isFetching()\`
- Destructuring \`const { data } = useQuery(...)\` at setup and reading \`data\` later — captures the Signal reference once, which is fine, but storing \`data()\` at setup captures the initial VALUE and defeats reactivity
- Returning \`user.data()\` at the top of a component body instead of inside a reactive accessor — components run once; read signals inside \`() => user.data()?.name\` or effects
- Expecting refetch on \`queryFn\` closure changes alone — only signals read inside the options function trigger re-evaluation; a closure capture of a \`let\` variable does not`,
  },

  'query/useMutation': {
    signature: '<TData, TError, TVars, TCtx>(options: MutationObserverOptions<...>) => UseMutationResult<TData, TError, TVars, TCtx>',
    example: `const create = useMutation({
  mutationFn: (input) => fetch('/api/posts', { method: 'POST', body: JSON.stringify(input) }).then(r => r.json()),
  onSuccess: () => client.invalidateQueries({ queryKey: ['posts'] }),
})
// <button onClick={() => create.mutate({ title: 'New' })}>Create</button>`,
    notes: 'Run a mutation (create / update / delete). Returns reactive `pending` / `success` / `error` signals plus two firing modes: `mutate(vars)` (fire-and-forget — errors go to the `error` signal) and `mutateAsync(vars)` (returns a promise for try/catch). `reset()` returns state to idle. Unlike `useQuery`, options is a plain OBJECT (not a function) because mutations are imperative — there are no reactive queryKeys to re-evaluate, so the function-wrapper overhead would add no value. `onSuccess` / `onError` / `onSettled` callbacks fire synchronously after the mutation resolves, useful for cache invalidation (`client.invalidateQueries`). See also: useQuery, useIsMutating, useMutationState.',
    mistakes: `- \`mutate()\` swallows errors into the \`error\` signal — use \`mutateAsync()\` with try/catch if you need programmatic error handling
- Calling \`mutate()\` inside a \`useQuery\` \`queryFn\` — mutations are imperative user actions, not data-fetching side effects; this causes infinite loops if the mutation invalidates the query that spawned it
- Reading \`mutation.data()\` outside a reactive scope — same rule as \`useQuery\`: read inside \`() => mutation.data()\` or effects`,
  },

  'query/useMutationState': {
    signature: '<TResult>(options?: () => { filters?: MutationFilters; select?: (m: Mutation) => TResult }) => Signal<TResult[]>',
    example: `const pending = useMutationState(() => ({
  filters: { status: 'pending' },
  select: (m) => m.state.variables,
}))
// pending() — array of variables of every in-flight mutation`,
    notes: 'Reactively read state from the MutationCache across the whole app — e.g. to render in-flight mutations globally (optimistic-UI lists, a "saving…" indicator that shows the variables of every pending mutation). Returns a `Signal<TResult[]>` that re-snapshots whenever a matching mutation is added / updated / removed. `options` is a function so reactive filters (signal-driven `status` / `mutationKey`) re-evaluate automatically; `select` maps each matched `Mutation` to a value (defaults to `mutation.state`). Distinct from `useMutation` (which drives ONE mutation) — this OBSERVES the cache without owning a mutation. See also: useMutation, useIsMutating.',
    mistakes: `- Passing options as an object instead of a function — loses reactive filter tracking; a signal-driven \`status\` filter won't re-evaluate
- Expecting it to TRIGGER mutations — it only READS the cache; use \`useMutation\` to run a mutation
- Reading \`pending()\` outside a reactive scope — it is a \`Signal\`, call it inside \`() => pending()\` or an effect`,
  },

  'query/useInfiniteQuery': {
    signature: '<TQueryFnData, TError>(options: () => InfiniteQueryObserverOptions<...>) => UseInfiniteQueryResult<TQueryFnData, TError>',
    example: `const feed = useInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
}))`,
    notes: 'Paginated / cursor-based query. Returns reactive `data` (wrapping `InfiniteData<T>` with `.pages` + `.pageParams`), `hasNextPage` / `hasPreviousPage` booleans, and `fetchNextPage` / `fetchPreviousPage` trigger functions. Options is a function (same reactive-tracking contract as `useQuery`). `getNextPageParam` / `getPreviousPageParam` drive cursor progression — return `undefined` to signal the end. See also: useQuery, useSuspenseInfiniteQuery.',
    mistakes: `- Forgetting \`initialPageParam\` — required by TanStack v5; omitting it throws at the first \`queryFn\` call
- Using \`data().pages\` without flattening — \`pages\` is an array of page results; most UIs want \`data().pages.flat()\` or \`data().pages.flatMap(p => p.items)\``,
  },

  'query/useQueries': {
    signature: '(queries: () => UseQueriesOptions[]) => Signal<QueryObserverResult[]>',
    example: `const results = useQueries(() =>
  userIds().map((id) => ({ queryKey: ['user', id], queryFn: () => fetchUser(id) })),
)
// results() is QueryObserverResult[] — one entry per input query`,
    notes: 'Subscribe to multiple queries in parallel. Returns a `Signal<QueryObserverResult[]>` — one entry per input query. Options is a function so the query list can depend on signals (e.g. derive one query per item in a reactive array). Each inner query independently tracks its own `data` / `error` / `isFetching` — the outer signal fires when ANY inner query updates. See also: useQuery, useSuspenseQueries.',
    mistakes: `- Expecting per-query fine-grained signals — \`useQueries\` returns a single combined signal, not individual \`UseQueryResult\` objects. For independent per-query tracking, call \`useQuery\` N times
- Passing a static array instead of a function — loses reactive query-list tracking; if the list of IDs changes (e.g. \`userIds()\` is a signal), the queries won't re-evaluate. Always wrap: \`useQueries(() => ids().map(...))\``,
  },

  'query/usePrefetchQuery': {
    signature: '<TData, TError, TKey>(options: () => FetchQueryOptions<...>) => void',
    example: `// In a parent / layout component:
usePrefetchQuery(() => ({ queryKey: ['user', id], queryFn: fetchUser }))
// then a child's useSuspenseQuery(['user', id]) resolves instantly`,
    notes: `Prefetch a query during component setup so its data is warm before a child's \`useQuery\` mounts. Fire-and-forget (returns nothing). Only prefetches when the key is NOT already in the cache, so it never re-fetches data the cache already has. Pair with \`useSuspenseQuery\` in a child to avoid a loading flash — the parent warms the cache, the suspense child reads it as immediately-resolved. \`usePrefetchInfiniteQuery\` is the paginated equivalent (requires \`initialPageParam\` + \`getNextPageParam\`). See also: usePrefetchInfiniteQuery, useSuspenseQuery, useQueryClient.`,
    mistakes: `- Calling it inside a conditional/loop — like all hooks it must run unconditionally in component setup
- Expecting a return value — it is fire-and-forget; read the data via \`useQuery\` / \`useSuspenseQuery\` with the same key`,
  },

  'query/usePrefetchInfiniteQuery': {
    signature: '<TQueryFnData, TError, TData, TKey, TPageParam>(options: () => FetchInfiniteQueryOptions<...>) => void',
    example: `usePrefetchInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.next,
}))`,
    notes: `Infinite-query variant of \`usePrefetchQuery\` — warms the first page of a paginated query into the cache during setup, only when the key isn't already cached. Requires \`initialPageParam\` + \`getNextPageParam\` like \`useInfiniteQuery\`. Pair with \`useSuspenseInfiniteQuery\` in a child. See also: usePrefetchQuery, useSuspenseInfiniteQuery, useInfiniteQuery.`,
  },

  'query/useSubscription': {
    signature: '(options: UseSubscriptionOptions) => UseSubscriptionResult',
    example: `const sub = useSubscription({
  url: 'wss://api.example.com/feed',
  onMessage: (event, client) => {
    if (JSON.parse(event.data).type === 'post-created') {
      client.invalidateQueries({ queryKey: ['posts'] })
    }
  },
})
// sub.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
// sub.send(data), sub.close(), sub.reconnect()`,
    notes: 'Reactive WebSocket with auto-reconnect and QueryClient cache integration. `onMessage` receives the active `QueryClient` so push updates can invalidate or directly patch cached queries in a single line. Exponential backoff on reconnect (default 1s doubling, max 10 attempts — configurable via `reconnectDelay` / `maxReconnectAttempts`). `url` and `enabled` may be signals for reactive connection management — changing the URL closes the old socket and opens a new one. Returns `status` (signal), `send(data)`, `close()`, `reconnect()`. See also: useSSE, useQuery.',
    mistakes: `- \`onMessage\` runs on every frame the socket receives — debounce cache invalidations for high-frequency streams or you'll trigger N refetches per second
- Storing data in a parallel signal instead of using \`queryClient.setQueryData\` inside \`onMessage\` — defeats the QueryClient cache; use \`setQueryData\` to push updates into the same cache that \`useQuery\` reads
- Forgetting \`enabled: false\` on unmount-sensitive connections — the WebSocket stays open unless \`enabled\` is a signal that tracks component lifecycle or a reactive condition`,
  },

  'query/useSSE': {
    signature: '<T>(options: UseSSEOptions<T>) => UseSSEResult<T>',
    example: `const sse = useSSE({
  url: '/api/events',
  parse: JSON.parse,
  onMessage: (data, queryClient) => {
    if (data.type === 'order-updated') {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  },
})
// sse.data() — last parsed message
// sse.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
// sse.lastEventId(), sse.readyState(), sse.close(), sse.reconnect()`,
    notes: 'Reactive Server-Sent Events hook with QueryClient cache integration. Same pattern as `useSubscription` but read-only (no `send`). `parse` deserializes raw event data per message (e.g. `JSON.parse`); `events` filters named SSE event types (defaults to generic `message` events). Honours the SSE spec `id` field via `lastEventId()` so the browser includes `Last-Event-ID` on reconnect and the server can resume from the right offset. `onMessage` receives the `QueryClient` for cache invalidation. See also: useSubscription.',
    mistakes: `- Passing \`queryKey\` (TanStack v4 pattern) instead of using \`onMessage\` for cache integration — Pyreon's \`useSSE\` does NOT auto-update query cache; use \`queryClient.setQueryData\` or \`invalidateQueries\` inside \`onMessage\`
- Omitting \`parse\` and expecting typed data — without \`parse\`, \`data()\` is \`string\` (raw event payload); pass \`parse: JSON.parse\` for auto-deserialization`,
  },

  'query/useSuspenseQuery': {
    signature: '<TData, TError>(options: () => QueryObserverOptions<...>) => UseSuspenseQueryResult<TData, TError>',
    example: `const user = useSuspenseQuery(() => ({ queryKey: ['user', id()], queryFn: fetchUser }))

<QuerySuspense query={user} fallback={<Spinner />}>
  {() => <UserCard name={user.data().name} />}
</QuerySuspense>`,
    notes: 'Like `useQuery` but `data` is narrowed to `Signal<TData>` (never undefined). Designed for use inside a `QuerySuspense` boundary that guarantees children only render after the query succeeds — read `user.data().name` unconditionally, no `undefined` guard needed. The Suspense-mode observer fires a background refetch but never transitions `data` back to `undefined` (the previous data is retained as placeholder). `useSuspenseInfiniteQuery` is the equivalent for paginated queries. See also: QuerySuspense, useSuspenseInfiniteQuery, useQuery.',
    mistakes: `- Using \`useSuspenseQuery\` without a \`QuerySuspense\` wrapper — the narrowed type assumes a boundary guarantees data; without it, \`data()\` CAN be the initial value during the first render cycle
- Mixing \`useSuspenseQuery\` and \`useQuery\` for the same \`queryKey\` — the Suspense observer and the regular observer can race; use one or the other per key`,
  },

  'query/useSuspenseInfiniteQuery': {
    signature: '<TQueryFnData, TError>(options: () => InfiniteQueryObserverOptions<...>) => UseSuspenseInfiniteQueryResult<TQueryFnData, TError>',
    example: `const feed = useSuspenseInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
}))

<QuerySuspense query={feed} fallback={<Spinner />}>
  {() => <Feed pages={feed.data().pages} onMore={feed.fetchNextPage} />}
</QuerySuspense>`,
    notes: 'Like `useInfiniteQuery` but `data` is narrowed to `Signal<InfiniteData<TQueryFnData>>` (never undefined) — for use inside a `QuerySuspense` boundary. Returns the same `fetchNextPage` / `fetchPreviousPage` / `hasNextPage` / `hasPreviousPage` surface as `useInfiniteQuery`. Same caveats as `useSuspenseQuery` regarding Suspense boundary requirement. See also: useSuspenseQuery, useInfiniteQuery, QuerySuspense.',
    mistakes: `- Using without a \`QuerySuspense\` wrapper — same boundary-requirement as \`useSuspenseQuery\`; the narrowed type assumes success, but \`data()\` CAN be the initial value during the first render cycle without a boundary
- Mixing \`useSuspenseInfiniteQuery\` and \`useInfiniteQuery\` for the same \`queryKey\` — the Suspense observer and the regular observer can race; use one or the other per key`,
  },

  'query/useSuspenseQueries': {
    signature: '<TData, TError>(queries: () => UseQueriesOptions[]) => { results: Signal<...[]>; data: Signal<TData[]>; isPending: Signal<boolean>; isError: Signal<boolean>; error: Signal<TError | null> }',
    example: `const users = useSuspenseQueries(() =>
  ids().map((id) => ({ queryKey: ['user', id], queryFn: () => fetchUser(id) })),
)
<QuerySuspense query={users} fallback={<Spinner />}>
  {() => <UserList users={users.data()} />}
</QuerySuspense>`,
    notes: 'Like `useQueries` but shaped for a `QuerySuspense` boundary: aggregates the array of queries into ONE query-like (`isPending` = any pending, `isError` = any errored, `error` = first error) plus a `data` array. The returned object is itself a valid query-gate — pass the WHOLE result as the `query` of a `QuerySuspense`, and children render only after every query succeeds, at which point `data()` is the fully-populated (never-undefined) array. `queries` is reactive (signal-driven keys re-evaluate automatically). See also: useQueries, useSuspenseQuery, QuerySuspense.',
    mistakes: `- Gating a \`QuerySuspense\` on \`users.data\` instead of \`users\` — pass the whole result object as \`query\`; it carries the \`isPending\`/\`isError\`/\`error\` signals the boundary reads
- Passing a static array instead of a function — loses reactive query-list tracking (same rule as \`useQueries\`)
- Using without a \`QuerySuspense\` wrapper — \`data()\` can contain \`undefined\` entries until every query succeeds; the boundary is what guarantees a full array`,
  },

  'query/QuerySuspense': {
    signature: '(props: QuerySuspenseProps) => VNodeChild',
    example: `<QuerySuspense
  query={[userQuery, postsQuery]}
  fallback={<Spinner />}
  error={(err) => <ErrorCard message={String(err)} />}
>
  {() => <Dashboard user={userQuery.data()} posts={postsQuery.data()} />}
</QuerySuspense>`,
    notes: 'Pyreon-native Suspense boundary for queries — replaces `<Suspense>` for the query use case with explicit error handling. Shows `fallback` while any query is `isPending`. On error, renders the `error` callback or re-throws to the nearest `ErrorBoundary`. Accepts a single query or an array — pass an array to gate on multiple queries in parallel. Children are a function (`{() => <UI />}`) so they only execute after all queries succeed. See also: useSuspenseQuery, useSuspenseInfiniteQuery.',
    mistakes: `- Passing children as plain JSX (\`<QuerySuspense query={q}><Data /></QuerySuspense>\`) instead of a function — plain children evaluate eagerly, defeating the Suspense gate. Always wrap: \`{() => <Data />}\`
- Omitting the \`error\` callback — errors re-throw to the nearest \`ErrorBoundary\`, which may not exist or may be too far up the tree. Provide an explicit \`error\` fallback for precise error handling`,
  },

  'query/useIsFetching': {
    signature: '(filters?: QueryFilters) => Signal<number>',
    example: `const fetching = useIsFetching()
// <TopSpinner visible={() => fetching() > 0} />`,
    notes: 'Global reactive count of currently-fetching queries. Pass `QueryFilters` to narrow by `queryKey` prefix, `stale` status, or `fetchStatus`. Pair with `useIsMutating` to drive a top-of-page progress bar that aggregates ALL in-flight data fetching without tracking individual queries. Returns `Signal<number>` — zero when idle. See also: useIsMutating.',
  },

  'query/useIsMutating': {
    signature: '(filters?: MutationFilters) => Signal<number>',
    example: `const mutating = useIsMutating()
// <Banner visible={() => mutating() > 0}>Saving…</Banner>`,
    notes: 'Global reactive count of currently-running mutations (optionally filtered by `MutationFilters`). Same pattern as `useIsFetching` but for the mutation pipeline. Returns `Signal<number>` — zero when no mutations are in flight. See also: useIsFetching.',
  },

  'query/QueryErrorResetBoundary': {
    signature: '(props: QueryErrorResetBoundaryProps) => VNodeChild',
    example: `<QueryErrorResetBoundary>
  {(reset) => (
    <ErrorBoundary fallback={(err, retry) => <button onClick={() => { reset(); retry() }}>Retry</button>}>
      <QuerySuspense query={q}>{() => <Data />}</QuerySuspense>
    </ErrorBoundary>
  )}
</QueryErrorResetBoundary>`,
    notes: 'Resets errored queries inside its subtree when a sibling `ErrorBoundary` recovers. Wrap around a `QuerySuspense` + `ErrorBoundary` pair to get clean retry semantics — without this, a recovered `ErrorBoundary` re-renders children but the queries still hold their error state, so the boundary immediately catches the same error again (infinite error loop). Accepts a render function child `{(reset) => ...}` so the reset action can be wired to a retry button. See also: QuerySuspense.',
  },

  'query/useQueryErrorResetBoundary': {
    signature: '() => { reset: () => void }',
    example: `const { reset } = useQueryErrorResetBoundary()
// Inside an ErrorBoundary fallback:
<button onClick={() => { reset(); retry() }}>Try again</button>`,
    notes: `Imperative access to the nearest \`QueryErrorResetBoundary\`. Returns \`{ reset }\` — call \`reset()\` to clear errored queries in the subtree. Useful when an error fallback has its own retry button outside the render-prop form of \`QueryErrorResetBoundary\`, e.g. inside a standalone \`ErrorBoundary\` fallback component that isn't a direct child of the boundary. See also: QueryErrorResetBoundary.`,
  },

  'query/useQueryClient': {
    signature: '() => QueryClient',
    example: `const client = useQueryClient()
client.invalidateQueries({ queryKey: ['posts'] })
await client.prefetchQuery({ queryKey: ['user', 1], queryFn: fetchUser })`,
    notes: 'Access the nearest `QueryClient` from context. Used to invalidate queries (`client.invalidateQueries`), prefetch data (`client.prefetchQuery`), read/write cache (`getQueryData` / `setQueryData`), or cancel queries. Throws "[Pyreon] No QueryClient set" if no `QueryClientProvider` is mounted above the call site. Returns the same `QueryClient` instance that TanStack core exposes — all TanStack methods work. See also: QueryClientProvider.',
    mistakes: '- Calling `useQueryClient()` at module scope — hooks require an active component setup context; hoist into the component body or pass the client as a function parameter',
  },

  'query/PersistQueryClientProvider': {
    signature: '(props: { client: QueryClient; persistOptions: Omit<PersistQueryClientOptions, "queryClient">; onSuccess?: () => unknown; onError?: () => unknown; children?: VNodeChild }) => VNodeChild',
    example: `import { PersistQueryClientProvider, createSyncStoragePersister } from '@pyreon/query/persist'

const persister = createSyncStoragePersister({ storage: localStorage })
<PersistQueryClientProvider client={client} persistOptions={{ persister }}>
  <App />
</PersistQueryClientProvider>`,
    notes: `Drop-in replacement for \`<QueryClientProvider>\` that ALSO restores the query cache from a persister on mount and keeps it persisted on every change — the offline / reload-survival story. Provides both the \`QueryClient\` AND the reactive \`isRestoring\` flag, so descendant \`useQuery\` calls DEFER their first fetch until restoration completes (no redundant network request for data the cache is about to restore). Import from \`@pyreon/query/persist\`. Built on TanStack's framework-agnostic \`persistQueryClient\` engine; pair with \`createSyncStoragePersister({ storage: localStorage })\`. See also: useIsRestoring, QueryClientProvider, HydrationBoundary.`,
    mistakes: `- Using BOTH \`<QueryClientProvider>\` and \`<PersistQueryClientProvider>\` — the persist provider already provides the client; nest only one
- Expecting synchronous restore — restoration is async (even sync localStorage resolves on a microtask). Gate UI on \`useIsRestoring()\` during the window
- A heavy \`staleTime: 0\` default — restored queries immediately refetch on subscribe; set a \`staleTime\` so the restored cache is treated as fresh`,
  },

  'query/useIsRestoring': {
    signature: '() => () => boolean',
    example: `const isRestoring = useIsRestoring()
<Show when={() => !isRestoring()} fallback={<Splash />}>{() => <App />}</Show>`,
    notes: 'Reactive accessor — `true` while the persisted cache is being restored by `<PersistQueryClientProvider>`. Returns `() => false` when there is no persistence layer. Gate a splash / skeleton on it during the async restore window. Exported from both `@pyreon/query` and `@pyreon/query/persist`. `IsRestoringProvider` is the standalone provider for a custom restoration flow. See also: PersistQueryClientProvider.',
    mistakes: '- Reading it as a plain boolean — it returns an ACCESSOR; call it: `isRestoring()`',
  },

  'query/QueryDevtools': {
    signature: '(props: { client?: QueryClient; initialIsOpen?: boolean; buttonPosition?: DevtoolsButtonPosition; position?: DevtoolsPosition; errorTypes?: DevtoolsErrorType[]; shadowDOMTarget?: ShadowRoot }) => VNode',
    example: `import { QueryDevtools } from '@pyreon/query/devtools'

<QueryClientProvider client={client}>
  <App />
  {import.meta.env.DEV ? <QueryDevtools initialIsOpen={false} /> : null}
</QueryClientProvider>`,
    notes: `In-app TanStack Query devtools panel — the SAME panel React / Solid / Vue users see, as a thin shim over \`@tanstack/query-devtools\`'s framework-agnostic engine (on mount it instantiates the engine with the nearest \`QueryClient\` and mounts it into a host element; tears down on unmount). Import from the dev-only subpath \`@pyreon/query/devtools\` so it tree-shakes out of production. Render once under your provider. Config props are read once at mount. See also: QueryClientProvider, useQueryClient.`,
    mistakes: `- Importing from \`@pyreon/query\` (main) — it lives at the \`@pyreon/query/devtools\` subpath so the heavy devtools engine stays out of the production bundle
- Rendering it unconditionally in production — gate on \`import.meta.env.DEV\` (or your bundler's dev flag) so it ships only in development`,
  },

  'query/Persistence subpath re-exports': {
    signature: `import { persistQueryClient, persistQueryClientRestore, persistQueryClientSave, persistQueryClientSubscribe, removeOldestQuery, createSyncStoragePersister, createAsyncStoragePersister } from '@pyreon/query/persist'`,
    example: `import { persistQueryClient, createSyncStoragePersister } from '@pyreon/query/persist'

const persister = createSyncStoragePersister({ storage: localStorage })
const [unsubscribe, restored] = persistQueryClient({ queryClient: client, persister })
await restored // cache is now hydrated from storage`,
    notes: `The \`@pyreon/query/persist\` subpath re-exports TanStack's framework-agnostic persist engine (\`persistQueryClient\` → \`[unsubscribe, restorePromise]\`, plus the \`*Restore\` / \`*Save\` / \`*Subscribe\` granular pieces and \`removeOldestQuery\`) and the storage persisters (\`createSyncStoragePersister\` for localStorage/sessionStorage, \`createAsyncStoragePersister\` for IndexedDB / RN AsyncStorage / any Promise-returning store). Types (\`Persister\`, \`PersistedClient\`, \`PersistQueryClientOptions\`, …) re-export alongside. Use these for a custom persistence flow; most apps just use \`<PersistQueryClientProvider>\`. See also: PersistQueryClientProvider, useIsRestoring.`,
  },

  'query/TanStack core re-exports': {
    signature: `import { QueryClient, QueryCache, MutationCache, QueryObserver, InfiniteQueryObserver, MutationObserver, QueriesObserver, dehydrate, hydrate, skipToken, keepPreviousData, hashKey, matchQuery, matchMutation, replaceEqualDeep, focusManager, onlineManager, notifyManager, isServer, isCancelledError, CancelledError, defaultShouldDehydrateQuery, defaultShouldDehydrateMutation } from '@pyreon/query'`,
    example: `// SSR dehydration round-trip:
import { QueryClient, dehydrate, hydrate, skipToken } from '@pyreon/query'

const server = new QueryClient()
await server.prefetchQuery({ queryKey: ['users'], queryFn: fetchUsers })
const snapshot = dehydrate(server)

const client = new QueryClient()
hydrate(client, snapshot)

// skipToken: type-safe conditional disabling
useQuery(() => ({ queryKey: ['user', id()], queryFn: id() ? fetchUser : skipToken }))`,
    notes: '`@pyreon/query` re-exports the full framework-agnostic TanStack surface (identity-equal to `@tanstack/query-core`) so consumers import every primitive from one entry: `QueryClient` / `QueryCache` / `MutationCache` (instance classes); all four observers (`QueryObserver` / `InfiniteQueryObserver` / `MutationObserver` / `QueriesObserver`) for advanced consumers driving query-core directly; `dehydrate` / `hydrate` (SSR serialization); `skipToken` (the v5 sentinel — `queryFn: skipToken` type-safely disables a query); `keepPreviousData`; the cache-key + structural-sharing utilities `hashKey` / `matchQuery` / `matchMutation` / `replaceEqualDeep`; the singleton managers `focusManager` / `onlineManager` / `notifyManager` (toggle focus/online refetch behaviour, batch notifications); `isServer`; `hashKey` / `isCancelledError` / `CancelledError`; and the `defaultShouldDehydrate*` predicates. Types (`QueryKey`, `QueryFilters`, `MutationFilters`, `Mutation`, `MutationState`, `QueryState`, `DehydratedState`, `HydrateOptions`, `InfiniteData`, `DefaultError`, `FetchQueryOptions`, `FetchInfiniteQueryOptions`, `InvalidateQueryFilters`, `InvalidateOptions`, `RefetchQueryFilters`, `RefetchOptions`, `QueryClientConfig`) re-export alongside the runtime values. See also: QueryClientProvider, useQueryClient, HydrationBoundary.',
  },
  // <gen-docs:api-reference:end @pyreon/query>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/hooks
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/hooks>

  'hooks/useControllableState': {
    signature: '<T>(opts: { value?: () => T | undefined; defaultValue: () => T; onChange?: (v: T) => void }) => [Signal<T>, (v: T) => void]',
    example: `function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,
    defaultValue: () => props.defaultChecked ?? false,
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{checked() ? 'on' : 'off'}</button>
}`,
    notes: 'Canonical controlled/uncontrolled state pattern. Returns a `[value, setValue]` tuple where the setter respects controlled mode (calls `onChange` only if controlled, mutates internal signal if uncontrolled). Used by every primitive in `@pyreon/ui-primitives`. Never reimplement the `isControlled + signal + getter` shape by hand. `value` and `defaultValue` are FUNCTIONS so signal reads track reactively — passing a plain value loses controlled/uncontrolled detection on prop changes. See also: useToggle, usePrevious.',
    mistakes: `- Passing \`value: props.checked\` (not a function) — loses reactivity on prop changes
- Mutating the returned signal directly with \`.set()\` instead of using the returned setter — bypasses the controlled-mode check`,
  },

  'hooks/useEventListener': {
    signature: '(target: EventTarget | (() => EventTarget | null), event: string, handler: EventListener, options?: AddEventListenerOptions) => void',
    example: `useEventListener(window, 'resize', () => layoutSig.set(measure()))
useEventListener(() => panelRef(), 'keydown', (e) => {
  if (e.key === 'Escape') setOpen(false)
})`,
    notes: `Register a DOM event listener with automatic cleanup on unmount. Use this instead of raw \`addEventListener\` in primitives — never \`addEventListener\` / \`removeEventListener\` directly in component code (the cleanup is the hook's whole job). \`target\` may be a getter so reactive refs (\`() => buttonRef()\`) re-bind when the underlying element changes. See also: useClickOutside, useKeyboard.`,
    mistakes: `- Using raw \`addEventListener\` instead of \`useEventListener\` — you lose automatic \`onUnmount\` cleanup
- Passing a static \`window\` / \`document\` when the target might not exist on SSR — \`useEventListener\` handles SSR-safe registration internally, but the target must be resolvable at \`onMount\` time`,
  },

  'hooks/useClickOutside': {
    signature: '(ref: () => HTMLElement | null, handler: (e: MouseEvent) => void) => void',
    example: 'useClickOutside(() => panelRef(), () => setOpen(false))',
    notes: 'Fire a callback when the user clicks outside the referenced element. Foundation for click-to-dismiss popovers, dropdowns, modals. Pair with `useFocusTrap` + `useScrollLock` for the full modal package. See also: useFocusTrap, useScrollLock, useDialog.',
    mistakes: '- Attaching to a ref that encompasses the entire viewport — every click anywhere except the ref itself triggers the handler; use a more specific ref (the popover panel, not the whole page)',
  },

  'hooks/useElementSize': {
    signature: '(ref: () => HTMLElement | null) => Signal<{ width: number; height: number }>',
    example: `const size = useElementSize(() => boxRef())
effect(() => console.log('Box is', size().width, 'x', size().height))`,
    notes: 'Reactive element size via `ResizeObserver`. Returns `Signal<{ width, height }>` that updates whenever the observed element resizes. SSR-safe (returns `{ width: 0, height: 0 }` until mount). See also: useWindowResize, useRootSize.',
  },

  'hooks/useFocusTrap': {
    signature: '(ref: () => HTMLElement | null, active: () => boolean) => void',
    example: `const isOpen = signal(false)
useFocusTrap(() => modalRef(), () => isOpen())
useScrollLock(() => isOpen())`,
    notes: 'Trap Tab/Shift+Tab focus inside the referenced element while `active()` is true. Required for modals / drawers / fullscreen overlays to be keyboard-accessible. Returns focus to the previously-focused element on deactivation. See also: useScrollLock, useDialog, useClickOutside.',
    mistakes: `- Forgetting the second argument \`active\` — always pass a reactive boolean (\`() => isOpen()\`) so the trap deactivates when the modal closes; a static \`true\` traps focus forever
- Using on an element that isn't rendered yet — the ref getter must return the element at the time \`active\` becomes true; pair with a \`<Show>\` or reactive accessor that mounts the element first`,
  },

  'hooks/useBreakpoint': {
    signature: '() => Signal<{ xs: boolean; sm: boolean; md: boolean; lg: boolean; xl: boolean }>',
    example: `const bp = useBreakpoint()
{() => bp().md ? <DesktopNav /> : <MobileNav />}`,
    notes: 'Reactive breakpoint flags driven by the **theme**, not raw media queries — reads `theme.breakpoints` so swapping themes (or unit systems) Just Works. Use `useMediaQuery` for one-off arbitrary queries. See also: useMediaQuery, useThemeValue.',
    mistakes: '- Using `useBreakpoint` for a one-off media query like `(prefers-contrast: more)` — `useBreakpoint` reads theme breakpoints only; use `useMediaQuery` for arbitrary media queries',
  },

  'hooks/useDebouncedValue': {
    signature: '<T>(source: Signal<T> | (() => T), delayMs: number) => Signal<T>',
    example: `const search = signal('')
const debouncedSearch = useDebouncedValue(search, 300)
effect(() => fetchResults(debouncedSearch()))`,
    notes: `Returns a debounced signal that only updates after \`delayMs\` of source-signal idle. Use for search-as-you-type, filter inputs, anywhere downstream effects shouldn't fire on every keystroke. The PAIR — \`useDebouncedCallback\` — debounces a function call instead of a value. See also: useDebouncedCallback, useThrottledCallback.`,
    mistakes: '- Reading the debounced signal immediately after setting the source — it still holds the OLD value during the debounce window; effects downstream of the debounced signal are correct, but imperative reads in the same tick are stale',
  },

  'hooks/useFetch': {
    signature: '<T>(url: string) => { data: Signal<T | undefined>; error: Signal<unknown>; isPending: Signal<boolean>; refetch: () => void }',
    example: `type Quote = { id: number; text: string }
const quotes = useFetch<Quote[]>('/api/quotes.json')
<Show when={quotes.isPending}><Text>Loading…</Text></Show>
<For each={() => quotes.data() ?? []} by={(q) => q.id}>{(q) => <Text>{q.text}</Text>}</For>`,
    notes: 'Thin reactive JSON fetch matching the multiplatform `useFetch<T>(url)` contract — the SAME call in a shared `.tsx` compiles to native `PyreonFetch<T>` containers on iOS (URLSession `.task {}`) and Android (`LaunchedEffect` + kotlinx-serialization) via PMTC, while this runs on web. Fires once at component setup (client only — SSR renders the not-yet-loaded state); each `refetch()` aborts the previous in-flight request so a slow stale response can never clobber a fresh one; unmount aborts too. Deliberately thinner than `@pyreon/query`: no cache, no dedup, no retries. See also: useOnline.',
    mistakes: `- Reading \`quotes.data\` without calling it in non-JSX code — the fields are Signals; \`quotes.data()\` reads the value. In JSX child position the bare signal works (accessor children render reactively)
- Expecting data during SSR — the fetch only runs client-side; server HTML renders the \`undefined\`-data state and the request fires after hydration
- Using a reactive/computed URL — v1 takes a plain string captured once (PMTC requires a string literal for native emit anyway); call \`refetch()\` for manual re-runs, or use \`@pyreon/query\` for signal-driven keys
- Reaching for useFetch when you need caching, request dedup, retries, or mutations — that is \`@pyreon/query\` (TanStack) territory; useFetch is the thin multiplatform primitive
- Forgetting the non-2xx contract — HTTP errors land in \`error()\` as \`[Pyreon] useFetch <url>: HTTP <status>\`, they do NOT throw`,
  },

  'hooks/useClipboard': {
    signature: '(timeoutMs?: number) => { copy: (text: string) => Promise<void>; copied: Signal<boolean> }',
    example: `const { copy, copied } = useClipboard()
<button onClick={() => copy(token)}>{copied() ? 'Copied!' : 'Copy'}</button>`,
    notes: '`navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `timeoutMs` (default 2000). Use the `copied` signal to flash a "Copied!" UI cue without manual timer management. See also: useDialog, useOnline.',
  },

  'hooks/useDialog': {
    signature: '() => { ref: (el: HTMLDialogElement | null) => void; open: () => void; close: (returnValue?: string) => void; isOpen: Signal<boolean>; returnValue: Signal<string> }',
    example: `const dialog = useDialog()
<dialog ref={dialog.ref}>...</dialog>
<button onClick={dialog.open}>Open</button>`,
    notes: `Native \`<dialog>\` element wrapper with reactive \`isOpen\` / \`returnValue\` signals. Handles \`showModal()\` / \`close()\` plumbing and the \`cancel\`/\`close\` event wiring so consumers don't reimplement the boilerplate. See also: useFocusTrap, useScrollLock.`,
    mistakes: '- Calling `dialog.open()` before the ref callback has fired — Pyreon components run once, so the `<dialog>` must be in the initial render (not behind a conditional `<Show>`); the ref callback fires synchronously during mount, and `dialog.open()` before that point has no element to call `showModal()` on',
  },

  'hooks/useTimeAgo': {
    signature: '(date: Date | (() => Date), opts?: UseTimeAgoOptions) => Signal<string>',
    example: `const sent = useTimeAgo(message.sentAt)
<span>{sent}</span>`,
    notes: 'Reactive "5 minutes ago" / "in 2 hours" relative-time string. Auto-updates on a sensible interval (every minute under an hour, every hour under a day, etc.) so the UI stays accurate without manual scheduling. Cleans up the interval on unmount. See also: useInterval, useDebouncedValue.',
  },

  'hooks/useInfiniteScroll': {
    signature: '(onLoadMore: () => void | Promise<void>, opts?: { rootMargin?: string; threshold?: number; enabled?: () => boolean }) => { sentinelRef: (el: HTMLElement | null) => void; isLoading: Signal<boolean> }',
    example: `const { sentinelRef, isLoading } = useInfiniteScroll(loadNextPage, { rootMargin: '200px', enabled: () => hasMore() })
<For each={items()} by={(i) => i.id}>{(item) => <Row data={item} />}</For>
<div ref={sentinelRef}>{isLoading() && 'Loading…'}</div>`,
    notes: `\`IntersectionObserver\`-based infinite loading. Attach the returned \`sentinelRef\` to a node at the bottom of the list — when it scrolls into view, \`onLoadMore\` fires. \`isLoading\` blocks re-fires until the promise resolves. \`enabled\` accessor lets you stop observing once you've loaded the last page. See also: useIntersection.`,
    mistakes: `- Placing the sentinel inside a container with \`overflow: hidden\` and no scroll — IntersectionObserver never fires because the sentinel is always clipped; the sentinel must be inside the scrollable container
- Forgetting to pass \`enabled: () => hasMore()\` — the hook keeps calling \`onLoadMore\` even after the last page`,
  },

  'hooks/useMergedRef': {
    signature: '<T>(...refs: (Ref<T> | RefCallback<T> | null | undefined)[]) => RefCallback<T>',
    example: `const localRef = ref<HTMLDivElement>()
const merged = useMergedRef(localRef, props.ref)
<div ref={merged}>...</div>`,
    notes: 'Combine multiple refs into a single callback ref — used when forwarding `props.ref` while also keeping a local ref to the same element. Each provided ref (callback or object) receives the element on mount and `null` on unmount. See also: useEventListener.',
  },

  'hooks/useUpdateEffect': {
    signature: '(fn: () => void | (() => void), deps: Signal<unknown>[]) => void',
    example: `useUpdateEffect(() => api.save(value()), [value])
// Doesn't fire on initial mount — only on subsequent value changes`,
    notes: 'Like `effect` but skips the initial run — only fires when one of the tracked signals updates *after* mount. Use for "save on change but not on first render" patterns where the initial value is already persisted. See also: useIsomorphicLayoutEffect.',
  },

  'hooks/useIsomorphicLayoutEffect': {
    signature: '(fn: () => void | (() => void)) => void',
    example: `const ref = signal<HTMLDivElement | null>(null)
useIsomorphicLayoutEffect(() => {
  const el = ref()
  if (el) widthSig.set(el.getBoundingClientRect().width)
})`,
    notes: 'Runs a layout-phase effect on the client (synchronous, before paint) and a no-op on the server. Use when you need to read DOM measurements before the next paint without triggering an SSR mismatch warning. See also: useUpdateEffect, useElementSize.',
  },
  // <gen-docs:api-reference:end @pyreon/hooks>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/permissions
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/permissions>

  'permissions/createPermissions': {
    signature: '<T extends PermissionMap>(initial?: T) => Permissions',
    example: `const can = createPermissions({
  'posts.read': true,
  'posts.delete': (post) => post.authorId === userId,
  'admin.*': false,
})

can('posts.read')         // true (reactive)
can('posts.delete', post) // evaluates predicate
can.not('admin.dashboard')
can.all('posts.read', 'posts.create')
can.any('admin.users', 'posts.read')
can.set({ 'admin.*': true })  // replace all
can.patch({ 'posts.delete': true })  // merge`,
    notes: 'Create a reactive permissions instance. Returns a callable object — `can(key, context?)` checks a permission reactively (reads as a signal in effects and JSX). Permissions can be booleans or predicate functions `(context?) => boolean`. Supports wildcard keys: `admin.*` (exactly one segment), `admin.**` (any depth below `admin`), `*` (everything); resolution is most-specific-first, so an exact or `**` deny overrides a broader subtree grant. The instance exposes `.not()`, `.all()`, `.any()` for multi-checks, `.assert()` to throw-on-deny, and `.set()` / `.patch()` / `.clear()` for runtime updates. See also: PermissionsProvider, usePermissions, can.assert.',
    mistakes: `- Reading \`can("key")\` outside a reactive scope and expecting updates — the check is a signal read, it only re-evaluates inside \`effect()\`, \`computed()\`, or JSX expression thunks
- Using a static object instead of a predicate for context-dependent checks — \`'posts.update': true\` always passes, use \`(post) => post.authorId === userId()\` for ABAC
- Forgetting that \`admin.*\` only matches ONE segment — \`admin.users.list\` is NOT matched by \`admin.*\` (only \`admin.users\` is). Use \`admin.**\` to match any depth below \`admin\``,
  },

  'permissions/can.assert': {
    signature: 'can.assert(key: string, context?: unknown) => void',
    example: `// in a route loader / server action:
can.assert('posts.delete', post) // throws if denied
await deletePost(post)`,
    notes: `Throw if a permission is NOT granted — the imperative companion to the reactive \`can()\` check, for route loaders, navigation guards, and server actions where a denial must halt execution. Throws a \`[Pyreon]\`-prefixed error (\`permission denied: '<key>'\`); returns void when granted. Evaluates predicates + wildcards exactly like \`can()\`. See also: createPermissions.`,
    mistakes: '- Using `can.assert` inside JSX for conditional rendering — it throws; use the boolean `can(key)` in render and reserve `assert` for imperative guard code',
  },

  'permissions/PermissionsProvider': {
    signature: '(props: { value: Permissions; children: VNodeChild }) => VNodeChild',
    example: `<PermissionsProvider value={can}>
  <App />
</PermissionsProvider>`,
    notes: 'Context provider that makes a permissions instance available to descendant components via `usePermissions()`. Enables SSR isolation (per-request permissions) and testing (override permissions per test). See also: usePermissions, createPermissions.',
  },

  'permissions/usePermissions': {
    signature: '() => Permissions',
    example: `const can = usePermissions()
return (() => can('admin.dashboard') ? <Dashboard /> : <AccessDenied />)`,
    notes: 'Consume the nearest `PermissionsProvider` value. Returns the same callable `Permissions` instance. Throws if no provider is mounted. See also: PermissionsProvider, createPermissions.',
  },
  // <gen-docs:api-reference:end @pyreon/permissions>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/machine
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/machine>

  'machine/createMachine': {
    signature: '<S extends string, E extends string>(config: MachineConfig<S, E>) => Machine<S, E>',
    example: `const traffic = createMachine({
  initial: 'red',
  states: {
    red:    { on: { NEXT: 'green' } },
    green:  { on: { NEXT: 'yellow' } },
    yellow: { on: { NEXT: 'red' } },
  },
})

traffic()            // 'red' (reactive)
traffic.send('NEXT') // 'green'
traffic.matches('green') // true
traffic.can('NEXT')  // true`,
    notes: 'Create a reactive state machine. The returned machine reads like a signal (`machine()` returns the current state string) and transitions via `machine.send(event, payload?)`. States and events are type-safe — TypeScript infers the union from the config object. Guards enable conditional transitions with typed payloads. Beyond named events, states support eventless `always` transitions (transient/condition states that resolve synchronously), `final: true` terminal states (`isFinal()` + `onDone()`), and full lifecycle listeners (`onEnter` / `onExit` / `onTransition` / `onDone`). No built-in context or effects — use Pyreon signals and `effect()` alongside the machine for data and side effects. See also: Machine, MachineConfig.',
    mistakes: `- Expecting \`machine.send()\` to return the new state — it returns void; read the state with \`machine()\` after sending
- Calling \`machine.set()\` — machines are constrained signals, they do not expose \`.set()\`. State changes only happen through \`machine.send(event)\`
- Using a machine for data storage — machines only hold the current state string. Use regular signals alongside the machine for associated data
- Forgetting guard payloads — \`machine.send("LOGIN")\` without the required payload silently fails the guard`,
  },

  'machine/Eventless (always) transitions': {
    signature: 'states.<state>.always?: TransitionConfig | TransitionConfig[]',
    example: `const score = signal(0)
const m = createMachine({
  initial: 'check',
  states: {
    // transient: resolves immediately to pass/fail based on the signal
    check: { always: [{ target: 'pass', guard: () => score() >= 50 }, 'fail'] },
    pass: {},
    fail: {},
  },
})
m() // 'pass' or 'fail' — 'check' is never observed`,
    notes: `A state may declare \`always\` transitions that fire SYNCHRONOUSLY the moment the state is entered (and for the initial state at creation / on \`reset()\`). The first unguarded entry — or the first whose guard passes — wins, then the new state's \`always\` is re-evaluated, cascading until none fire. Guards receive NO payload (the transition is eventless), so they read external signals instead. Use for transient / condition states — e.g. enter \`check\`, then branch to \`pass\` or \`fail\` based on a computed value, without an intermediate visible state. An always-loop (a state that always re-targets itself) throws after 1000 steps instead of hanging. See also: createMachine.`,
    mistakes: `- Expecting an \`always\` guard to receive a payload — eventless transitions have none; read external signals in the guard
- A self-targeting unconditional \`always\` (\`{ always: "self" }\`) — infinite loop; throws after 1000 steps
- Putting a catch-all FIRST in an \`always\` array — order matters; the first matching entry wins, so list specific guarded targets before an unguarded fallback`,
  },

  'machine/Machine.onExit / onEnter / onTransition / onDone': {
    signature: 'onExit(state, cb) | onEnter(state, cb) | onTransition(cb) | onDone(cb) => () => void',
    example: `const m = createMachine({
  initial: 'idle',
  states: { idle: { on: { GO: 'busy' } }, busy: { on: { STOP: 'idle' } } },
})
m.onEnter('busy', () => { const id = setInterval(poll, 1000); cleanup = () => clearInterval(id) })
m.onExit('busy', () => cleanup())`,
    notes: 'Lifecycle listeners. On each transition they fire in state-chart order: `onExit(from)` (while the machine still reads `from`) → `onTransition(from, to, event)` → `onEnter(to)` (machine now reads `to`) → `onDone(event)` if `to` is a `final` state. Each returns an unsubscribe function; `dispose()` removes all. `onExit` pairs with `onEnter` for setup/teardown per state — e.g. start a timer on enter, clear it on exit (the idiomatic alternative to a built-in delayed transition). See also: createMachine.',
    mistakes: `- Assuming \`onExit\` fires AFTER the state changed — it fires while the machine still reads the state being left (state-chart exit-before-enter order)
- Using \`onEnter\`/\`onExit\` for derived data — listeners are for side effects; for data derived from state use a \`computed()\` reading \`machine()\``,
  },

  'machine/Final states (final / isFinal / onDone)': {
    signature: 'states.<state>.final?: boolean — machine.isFinal(): boolean — machine.onDone(cb)',
    example: `const m = createMachine({
  initial: 'active',
  states: { active: { on: { FINISH: 'done' } }, done: { final: true } },
})
m.onDone((e) => console.log('finished via', e.type))
m.isFinal()      // false
m.send('FINISH')
m.isFinal()      // true → onDone fired`,
    notes: `Mark a terminal state with \`final: true\`. \`machine.isFinal()\` reads reactively true while the machine is in any final state (use it in JSX / effects), and \`machine.onDone(cb)\` listeners fire whenever a final state is entered (by event OR by an \`always\` cascade), receiving the triggering event. Final states model "the machine is done" — e.g. a wizard's \`complete\` state or a fetch's terminal \`success\`/\`failure\`. See also: createMachine.`,
    mistakes: '- Expecting a final state to block further `send()` — Pyreon does not freeze final states; if a final state declares `on` transitions they still fire. Omit `on` for true terminals',
  },
  // <gen-docs:api-reference:end @pyreon/machine>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/storage
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/storage>

  'storage/useStorage': {
    signature: '<T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
    example: `const theme = useStorage('theme', 'light')
theme()           // 'light'
theme.set('dark') // persists + cross-tab sync
theme.remove()    // delete from storage, reset to default`,
    notes: 'Create a reactive signal backed by localStorage. Reads the stored value on creation (falling back to `defaultValue` if absent or on SSR), writes on every `.set()`, and syncs across browser tabs via `storage` events. Returns `StorageSignal<T>` which extends `Signal<T>` with `.remove()` to delete the key and reset to default. Serialization defaults to JSON; provide custom `serialize`/`deserialize` in options for non-JSON types. See also: useSessionStorage, useCookie, useIndexedDB, createStorage.',
    mistakes: `- Expecting cross-tab sync with \`useSessionStorage\` — only \`useStorage\` (localStorage) fires storage events across tabs
- Storing non-serializable values (functions, class instances) without custom \`serialize\`/\`deserialize\` — JSON.stringify drops them silently
- Reading \`.remove()\` return value — it returns void, not the removed value`,
  },

  'storage/useCookie': {
    signature: '<T>(key: string, defaultValue: T, options?: CookieOptions) => StorageSignal<T>',
    example: `const locale = useCookie('locale', 'en', { maxAge: 365 * 86400, path: '/' })
locale.set('fr')`,
    notes: 'Reactive signal backed by browser cookies. SSR-readable — on the server, reads from the request cookie header via `setCookieSource()`. Options include `maxAge`, `path`, `domain`, `sameSite`, `secure`. Same `StorageSignal<T>` return type as other hooks. See also: useStorage, setCookieSource, useSessionStorage.',
    mistakes: `- Forgetting \`setCookieSource(req.headers.get("cookie"))\` on SSR — without it the server-side render starts from \`defaultValue\`, not the user's actual cookie; the page flashes the wrong locale/theme until client-side hydration corrects it.
- Omitting \`sameSite\` for auth-style cookies — the browser default has tightened across vendors. Be explicit: \`sameSite: "lax"\` (default for nav) or \`"strict"\` (login cookies) or \`"none"\` (cross-origin embeds with \`secure: true\`).
- Setting \`maxAge\` in milliseconds — it's in SECONDS (matches the HTTP spec). \`maxAge: 86400\` is one DAY, not one minute.
- Storing > 4KB in a cookie — browsers enforce a ~4KB per-cookie limit. Reach for \`useIndexedDB\` for large values; cookies are for small server-readable state.`,
  },

  'storage/useSessionStorage': {
    signature: '<T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
    example: `const filter = useSessionStorage('list-filter', { query: '', page: 1 })
filter.set({ query: 'pyreon', page: 1 })
// → persists for the tab's lifetime; gone on close`,
    notes: `Per-tab ephemeral reactive storage. Same shape as \`useStorage\` but writes go to \`sessionStorage\` instead of \`localStorage\` — cleared when the tab closes. NO cross-tab sync (browsers do not fire storage events for sessionStorage). Useful for per-visit filter state, unsaved form drafts that shouldn't survive tab close, and any state that should NOT outlive the current browsing session. See also: useStorage, useMemoryStorage.`,
    mistakes: `- Expecting cross-tab sync — sessionStorage is per-tab by spec. Two tabs on the same page each have their own independent sessionStorage. For shared state across tabs, use \`useStorage\` (localStorage).
- Treating sessionStorage as "private" — same JavaScript-readable shape as localStorage; do not store secrets there.`,
  },

  'storage/useMemoryStorage': {
    signature: '<T>(key: string, defaultValue: T) => StorageSignal<T>',
    example: `const draft = useMemoryStorage('draft-id-42', '')
draft.set('typing...')
// → reactive, but cleared on reload`,
    notes: 'In-memory reactive signal that mimics the storage hook shape — useful as an SSR-safe fallback or in environments without `localStorage`/`sessionStorage` (sandbox iframes, web workers without DOM, some embedded WebViews). Same `StorageSignal<T>` shape with `.remove()`. Values are lost on page reload; no persistence. See also: useStorage, useSessionStorage.',
    mistakes: `- Reaching for useMemoryStorage when a plain \`signal()\` would do — if you don't need the StorageSignal \`.remove()\` shape or the cross-storage-backend interchangeability, a plain \`signal(defaultValue)\` is simpler.
- Expecting persistence — values vanish on reload by design. If persistence is needed, swap to \`useStorage\` / \`useSessionStorage\` / \`useIndexedDB\`.`,
  },

  'storage/setCookieSource': {
    signature: 'setCookieSource(source: string | (() => string) | null) => void',
    example: `import { setCookieSource } from '@pyreon/storage'

// Inside an SSR handler:
setCookieSource(request.headers.get('cookie') ?? '')
const html = await renderToString(<App />)`,
    notes: `Tell \`useCookie\` how to read cookies during SSR. Pass the raw cookie header string (or an accessor returning it) at the top of each request handler so server-side renders see the user's actual cookies. Pass \`null\` to clear (typically at request cleanup). The module-level cookie source is per-request-context-isolated via \`runWithRequestContext\` so concurrent SSR requests do not see each other's cookies. See also: useCookie.`,
    mistakes: `- Forgetting to call setCookieSource on SSR — \`useCookie\` falls back to \`defaultValue\` on every request, ignoring the user's real cookie state. The page hydrates correctly on the client but flashes the default first.
- Passing a stale cookie source after redirect or login — the source is captured once; re-call after any operation that should change the cookie set.
- Calling setCookieSource(null) too early — call it at request CLEANUP (after the response is sent), not before render. Cleaning up mid-render erases the source from later loaders.`,
  },

  'storage/useIndexedDB': {
    signature: '<T>(key: string, defaultValue: T, options?: IndexedDBOptions) => StorageSignal<T>',
    example: `const draft = useIndexedDB('article-draft', { title: '', body: '' })
draft.set({ title: 'New Article', body: 'Content...' })`,
    notes: 'Reactive signal backed by IndexedDB for large data. Writes are debounced to avoid excessive I/O. The signal initializes with `defaultValue` synchronously and hydrates from IndexedDB asynchronously — the value updates reactively once the read completes. Silent init error logging in dev mode. See also: useStorage, useMemoryStorage.',
    mistakes: `- Reading the signal in render and expecting the persisted value on FIRST render — IDB initialization is async. The signal starts at \`defaultValue\`, then the persisted value flows in on the next tick. UIs that need the persisted value before paint should pair with a synchronous fallback (e.g. \`useStorage\` for a small marker).
- Storing huge blobs without considering quota — IDB has per-origin quotas (~50% of free disk, browser-dependent). Bumping into the quota throws on \`setItem\` async; handle with try/catch around \`.set()\` if the write may exceed.
- Expecting cross-tab sync — IndexedDB does NOT fire storage events. Two tabs writing to the same key will overwrite each other silently. Use \`BroadcastChannel\` alongside if multi-tab consistency matters.
- Setting the value rapidly in a loop — writes are debounced but unbounded loop assignments still queue. Throttle at the caller for high-frequency mutations.`,
  },

  'storage/createStorage': {
    signature: '(backend: StorageBackend | AsyncStorageBackend) => <T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
    example: `const useEncrypted = createStorage({
  getItem: (key) => decrypt(localStorage.getItem(key)),
  setItem: (key, value) => localStorage.setItem(key, encrypt(value)),
  removeItem: (key) => localStorage.removeItem(key),
})
const secret = useEncrypted('api-key', '')`,
    notes: 'Factory for custom storage backends. Pass an object with `getItem`, `setItem`, `removeItem` methods (sync or async) and receive a hook function with the same signature as `useStorage`. Use for encrypted storage, remote backends, or any custom persistence layer. See also: useStorage.',
    mistakes: `- Returning \`undefined\` from getItem when the key is absent — return \`null\` (matches the localStorage / sessionStorage contract). \`undefined\` may be JSON-serialized as the literal string \`"undefined"\` by some serialize-deserialize pipelines.
- Throwing synchronously from setItem — backend errors should be either logged + swallowed (graceful degradation, the signal still updates) OR propagated via a rejected Promise for async backends. A thrown error breaks the calling \`.set()\` and leaves the in-memory signal in a state inconsistent with the backend.
- Forgetting that the backend must implement ALL three (\`getItem\`, \`setItem\`, \`removeItem\`) — \`.remove()\` calls removeItem, and omitting it makes the hook crash on cleanup paths.`,
  },
  // <gen-docs:api-reference:end @pyreon/storage>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/i18n
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/i18n>

  'i18n/createI18n': {
    signature: '(options: I18nOptions) => I18nInstance',
    example: `const i18n = createI18n({
  locale: 'en',
  messages: { en: { greeting: 'Hello, {{name}}!' } },
  loader: (locale, ns) => import(\`./locales/\${locale}/\${ns}.json\`),
  fallbackLocale: 'en',
})

i18n.t('greeting', { name: 'World' })  // "Hello, World!"
i18n.locale.set('fr')  // switch reactively`,
    notes: 'Create a reactive i18n instance. Returns `{ t, locale, addMessages, loadNamespace }`. The `t(key, values?)` function resolves translations reactively — changing `locale` via `.set()` re-evaluates all `t()` reads in reactive scopes. Supports `{{name}}` interpolation, `_one`/`_other` plural suffixes, namespace lazy loading with deduplication, fallback locale, and custom plural rules. Available from both `@pyreon/i18n` and `@pyreon/i18n/core`. See also: I18nProvider, useI18n, Trans, interpolate.',
    mistakes: `- Reading \`t(key)\` outside a reactive scope and expecting updates on locale change — \`t()\` is a reactive signal read, wrap in JSX thunk or \`effect()\`
- Using \`@pyreon/i18n\` on the backend — use \`@pyreon/i18n/core\` instead, it has zero JSX/core dependencies
- Forgetting \`fallbackLocale\` — missing keys in the current locale return the key string instead of falling back to another language`,
  },

  'i18n/I18nProvider': {
    signature: '(props: I18nProviderProps) => VNodeChild',
    example: `<I18nProvider value={i18n}>
  <App />
</I18nProvider>`,
    notes: 'Context provider that makes an i18n instance available to descendant components via `useI18n()`. Only available from the full `@pyreon/i18n` entry, not from `/core`. See also: useI18n, createI18n.',
  },

  'i18n/useI18n': {
    signature: '() => I18nInstance',
    example: `const { t, locale } = useI18n()
return <div>{t('greeting', { name: 'User' })}</div>`,
    notes: 'Consume the nearest `I18nProvider` value. Returns the same `I18nInstance` with `t`, `locale`, `addMessages`, etc. Only available from the full `@pyreon/i18n` entry. See also: I18nProvider, createI18n.',
  },

  'i18n/Trans': {
    signature: '(props: TransProps) => VNodeChild',
    example: `// Message: "Please <link>click here</link> to continue"
<Trans key="action" components={{ link: <a href="/next" /> }}>
  Please <link>click here</link> to continue
</Trans>`,
    notes: 'Rich text interpolation component. Translates a key and replaces named placeholders with JSX components. Use for translations that contain markup (bold, links, etc.) that cannot be expressed as plain string interpolation. See also: createI18n, useI18n.',
  },

  'i18n/interpolate': {
    signature: '(template: string, values?: InterpolationValues) => string',
    example: `interpolate('Hello, {{name}}!', { name: 'World' })  // 'Hello, World!'`,
    notes: 'Pure string interpolation — replaces `{{name}}` placeholders with values from the map. Available from both entries. Use directly when you need interpolation without the full i18n instance (e.g. server-side email templates). See also: createI18n.',
  },
  // <gen-docs:api-reference:end @pyreon/i18n>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/document
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/document>

  'document/render': {
    signature: '(node: DocNode, format: OutputFormat, options?: RenderOptions) => Promise<RenderResult>',
    example: `const pdf = await render(doc, 'pdf')            // Uint8Array
const html = await render(doc, 'html')           // string
const email = await render(doc, 'email')         // Outlook-safe HTML
const md = await render(doc, 'md')               // Markdown string
const slack = await render(doc, 'slack')          // Slack Block Kit JSON`,
    notes: 'Render a document node tree to any supported format. Returns a string (HTML, Markdown, text, CSV, email, Slack, Teams, etc.) or Uint8Array (PDF, DOCX, XLSX, PPTX) depending on the format. Heavy format renderers are lazy-loaded on first use. Supports 14+ built-in formats plus custom renderers registered via `registerRenderer()`. See also: createDocument, Document, download, registerRenderer.',
    mistakes: `- Not awaiting the render call — render() is always async due to lazy-loaded format renderers
- Expecting render("pdf") to return a string — PDF, DOCX, XLSX, PPTX return Uint8Array
- Passing a VNode instead of a DocNode — render() expects the output of JSX primitives (Document, Page, etc.) or createDocument(), not arbitrary Pyreon VNodes`,
  },

  'document/createDocument': {
    signature: '(props?: DocumentProps) => DocumentBuilder',
    example: `const doc = createDocument({ title: 'Report' })
  .heading('Sales Report')
  .text('Q4 2026 summary.')
  .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })

await doc.toPdf()      // PDF Uint8Array
await doc.toEmail()    // Outlook-safe HTML
await doc.toDocx()     // Word document`,
    notes: 'Fluent builder API for constructing documents without JSX. Chain `.heading()`, `.text()`, `.table()`, `.image()`, `.list()`, `.code()`, `.divider()`, `.page()` calls. Terminal methods: `.toPdf()`, `.toDocx()`, `.toEmail()`, `.toSlack()`, `.toNotion()`, `.toHtml()`, `.toMarkdown()`, etc. Each terminal method calls `render()` internally. See also: render, Document.',
    mistakes: `- Forgetting to await terminal methods — toPdf(), toDocx(), etc. are async
- Calling builder methods after a terminal method — the builder is consumed; create a new one`,
  },

  'document/Document': {
    signature: '(props: DocumentProps) => DocNode',
    example: `const doc = (
  <Document title="Report" author="Team">
    <Page>
      <Heading>Title</Heading>
      <Text>Content</Text>
    </Page>
  </Document>
)
await render(doc, 'pdf')`,
    notes: 'Root JSX primitive for document trees. Accepts `title`, `author`, `subject` as metadata props. Children should be `Page` elements (or other block-level primitives for single-page documents). The returned DocNode is passed to `render()` for output. See also: render, Page, createDocument.',
  },

  'document/download': {
    signature: '(data: Uint8Array | string, filename: string) => void',
    example: `const pdf = await render(doc, 'pdf')
download(pdf, 'report.pdf')`,
    notes: 'Browser helper that triggers a file download from rendered document data. Creates a temporary Blob URL and clicks a hidden anchor element. Works with both Uint8Array (PDF, DOCX) and string (HTML, Markdown) outputs from `render()`. See also: render.',
  },
  // <gen-docs:api-reference:end @pyreon/document>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/flow
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/flow>

  'flow/createFlow': {
    signature: '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
    example: `// Generic over node data shape — typed consumers get strong narrowing
interface WorkflowData {
  kind: 'trigger' | 'filter' | 'transform' | 'notify'
  label: string
}

const flow = createFlow<WorkflowData>({
  nodes: [
    { id: '1', type: 'custom', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } },
    { id: '2', type: 'custom', position: { x: 200, y: 100 }, data: { kind: 'notify', label: 'End' } },
  ],
  edges: [{ id: 'e1', source: '1', target: '2', animated: true }],
})

// node.data.kind narrows to the typed union, not unknown
const trigger = flow.findNodes((n) => n.data.kind === 'trigger')

flow.addNode({ id: '3', type: 'custom', position: { x: 100, y: 200 }, data: { kind: 'transform', label: 'New' } })
await flow.layout('layered', { direction: 'RIGHT', nodeSpacing: 50, layerSpacing: 100 })
// LayoutOptions applicability: direction / layerSpacing / edgeRouting apply to layered/tree only;
// force/stress/radial/box/rectpacking silently ignore them. nodeSpacing applies to all algorithms.
const json = flow.toJSON(); flow.fromJSON(json)       // round-trip serialization`,
    notes: 'Create a reactive flow instance. Generic over node data shape — `createFlow<MyData>(...)` returns `FlowInstance<MyData>` so `node.data.kind` narrows correctly without an `[key: string]: unknown` index signature on consumer types. Defaults to `Record<string, unknown>` when no generic is supplied. The returned instance owns signal-native nodes / edges and exposes CRUD, selection, viewport (zoom / pan / fitView), and auto-layout via lazy-loaded elkjs (first `.layout()` call fetches a ~1.4MB chunk). Pan / zoom uses pointer events + CSS transforms — no D3. See also: useFlow, FlowInstance, Flow.',
    mistakes: `- Forgetting to declare \`@pyreon/runtime-dom\` in consumer app deps — flow's JSX emits \`_tpl()\` which needs runtime-dom imports
- Reading \`NodeComponentProps.data\` / \`.selected\` / \`.dragging\` as plain values — all three are REACTIVE ACCESSORS: \`props.data()\`, \`props.selected()\`, \`props.dragging()\`
- Calling \`props.data()\` OUTSIDE a reactive scope — captures the value once at component setup, defeating the per-node reactivity. Read it inside JSX expression thunks, \`effect\`, or \`computed\`
- Adding \`[key: string]: unknown\` index signature to your node data interface — no longer needed now that \`createFlow\` is generic. Pass \`createFlow<MyData>(...)\` instead
- Setting \`LayoutOptions.direction\` (or \`layerSpacing\`, or \`edgeRouting\`) on a force / stress / radial / box / rectpacking layout and expecting a directional result — these options are namespaced under ELK's layered / tree pipelines and silently ignored by the geometric algorithms. Dev-mode \`console.warn\` fires when this happens
- Missing \`<Flow nodeTypes={{ key: Component }}>\` registration — \`node.type\` strings dispatch to that map, unregistered types fall through to the default renderer
- Using \`createFlow\` inside a component body without \`onUnmount(() => flow.dispose())\` — prefer \`useFlow\` which auto-disposes
- Using \`direction: 'row'\` on flow's containing Element layout — Pyreon \`Element\` accepts \`'inline'\` / \`'rows'\` / \`'reverseInline'\` / \`'reverseRows'\`, not CSS flex-direction values like \`'row'\` or \`'column'\`
- Confusing \`markerEnd: null\` with omitting it — \`null\` is the explicit "no end arrow" opt-out that overrides \`config.defaultMarkerEnd\`; OMITTING it falls back to the flow default (a closed arrowhead). Set \`config.defaultMarkerEnd: null\` to make every edge arrowless by default
- Expecting \`onlyRenderVisibleElements\` to cull an edge whose line crosses the viewport while BOTH its endpoint nodes are off-screen — only nodes (and the edges touching at least one visible node) are kept; a long edge spanning two off-screen nodes is culled (rare; matches React Flow)
- Leaving object-snapping on for very large graphs — \`snapToObjects\` (default \`true\`) runs an O(N) align-to-other-nodes scan on EVERY drag frame; on big graphs it dominates per-frame cost. Set \`snapToObjects: false\` to skip it (≈3-4× faster drags) when you don't need helper-line alignment`,
  },

  'flow/useFlow': {
    signature: '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
    example: `// Component-scoped flow — auto-disposes when the component unmounts.
// Identical shape to createFlow, plus an implicit onUnmount(() => flow.dispose()).
const MyDiagram = () => {
  const flow = useFlow<WorkflowData>({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } }],
    edges: [],
  })
  return (
    <Flow instance={flow}>
      <Background />
    </Flow>
  )
}`,
    notes: `Component-scoped wrapper around \`createFlow\` — identical shape plus an implicit \`onUnmount(() => flow.dispose())\`. Prefer inside component bodies; use \`createFlow\` directly only for flows owned outside the component tree (app stores, singletons, SSR-shared state) where you'll dispose at the correct lifecycle point yourself. See also: createFlow.`,
    mistakes: `- Using \`useFlow\` outside a component body — the \`onUnmount\` hook registration requires an active component setup context, same constraint as every \`useX\` hook
- Using \`createFlow\` inside a component and forgetting \`onUnmount(() => flow.dispose())\` — that was the footgun \`useFlow\` exists to prevent
- Storing the returned instance in a module-level variable — bypasses the auto-dispose guarantee; use \`createFlow\` for that pattern`,
  },

  'flow/Flow': {
    signature: '(props: FlowComponentProps) => VNodeChild',
    example: `<Flow instance={flow} nodeTypes={{ custom: MyNode }} edgeTypes={{ arrow: ArrowEdge }}>
  <Background variant="dots" gap={20} />
  <Controls position="bottom-left" />
  <MiniMap nodeColor={(node) => '#6366f1'} />
</Flow>

// Custom node renderer — every prop except id is a REACTIVE ACCESSOR
function MyNode(props: NodeComponentProps<WorkflowData>) {
  return (
    <div
      class={props.selected() ? 'selected' : ''}
      style={() => \`cursor: \${props.dragging() ? 'grabbing' : 'grab'}\`}
    >
      {props.data().label}
    </div>
  )
}`,
    notes: 'Main flow container. Accepts a `FlowInstance` via the `instance` prop plus optional `nodeTypes` / `edgeTypes` maps for custom renderers. Internally uses `<For>` keyed by `node.id` plus per-node reactive accessors that read live state from `instance.nodes()` — each node mounts EXACTLY ONCE across the lifetime of the graph regardless of drags, selection clicks, or `updateNode` mutations. A 60fps drag in a 1000-node graph stays O(1) per frame. JSX components are NOT generic at the call site (`<Flow<MyData> />` is invalid JSX); `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers can pass `FlowInstance<MyData>` without casting. See also: createFlow, Background, Controls, MiniMap, Handle.',
    mistakes: `- \`<Flow<MyData> />\` is invalid JSX — the component is not generic at the call site; pass a typed \`FlowInstance<MyData>\` via \`instance\` prop
- Missing \`nodeTypes\` entry for a \`node.type\` string — falls through to the default renderer
- Mutating \`instance.nodes()\` return value directly — use \`instance.addNode\` / \`updateNode\` / \`removeNode\` so the internal signals fire`,
  },

  'flow/Background': {
    signature: '(props: { variant?: "dots" | "lines"; gap?: number; color?: string }) => VNodeChild',
    example: `<Flow instance={flow}>
  <Background variant="dots" gap={24} color="#e5e7eb" />
</Flow>`,
    notes: 'Dot or line grid background inside a `<Flow>`. Place as a direct child. `variant` defaults to `"dots"`, `gap` controls pattern spacing, `color` sets the pattern color. Renders as an SVG pattern at the back of the z-order. See also: Flow, Controls, MiniMap.',
  },

  'flow/Controls': {
    signature: '(props?: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) => VNodeChild',
    example: `<Flow instance={flow}>
  <Controls position="bottom-left" />
</Flow>`,
    notes: 'Zoom in / zoom out / fit-view button cluster. Renders absolutely inside the flow viewport at the configured corner (default `"bottom-right"`). Each button dispatches to the corresponding `FlowInstance` viewport method. See also: Flow, Background, MiniMap.',
  },

  'flow/MiniMap': {
    signature: '(props?: { nodeColor?: (node: FlowNode) => string; maskColor?: string }) => VNodeChild',
    example: `<Flow instance={flow}>
  <MiniMap nodeColor={(node) => node.data.highlighted ? '#f59e0b' : '#6366f1'} />
</Flow>`,
    notes: 'Overview minimap of the full graph. `nodeColor` is a per-node color function (default grey), `maskColor` fills the area outside the current viewport (default semi-transparent black). Clicks on the minimap recenter the main viewport. See also: Flow, Background, Controls.',
  },

  'flow/Handle': {
    signature: '(props: { type: "source" | "target"; position: Position; id?: string }) => VNodeChild',
    example: `function CustomNode(props: NodeComponentProps<MyData>) {
  return (
    <div>
      <Handle type="target" position={Position.Left} />
      {props.data().label}
      <Handle type="source" position={Position.Right} id="out-primary" />
      <Handle type="source" position={Position.Bottom} id="out-fallback" />
    </div>
  )
}

// Edge referencing a specific source handle by id
flow.addEdge({ source: '1', sourceHandle: 'out-primary', target: '2' })`,
    notes: 'Connection handle on a custom node — exposes a connectable point that edges attach to. `type` picks direction (`"source"` emits edges, `"target"` receives), `position` is a `Position` enum (`Top` / `Right` / `Bottom` / `Left`). Provide a distinct `id` when a node has multiple source or target handles so edges can reference the specific one via `edge.sourceHandle` / `edge.targetHandle`. See also: Flow, Position.',
    mistakes: `- Multiple \`source\` / \`target\` handles on one node without distinct \`id\` values — edges cannot disambiguate which handle they connect to
- Nesting a \`<Handle>\` inside a non-node component (a \`<Background>\` child, a \`<Panel>\`, etc.) — the connection machinery expects handles to live inside a node renderer`,
  },

  'flow/Panel': {
    signature: '(props: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right"; children: VNodeChild }) => VNodeChild',
    example: `<Flow instance={flow}>
  <Panel position="top-right">
    <button onClick={() => flow.fitView()}>Fit</button>
    <button onClick={() => flow.toJSON()}>Export</button>
  </Panel>
</Flow>`,
    notes: 'Overlay panel positioned absolutely relative to the flow viewport. Use for toolbars, legend badges, or contextual action buttons. Pass any JSX as children — the panel is a plain positioned container, not a predefined chrome component. See also: Flow, Controls.',
  },
  // <gen-docs:api-reference:end @pyreon/flow>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/code

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/charts
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/charts>

  'charts/useChart': {
    signature: '<TOption extends EChartsOption = EChartsOption>(optionsFn: () => TOption, config?: UseChartConfig) => UseChartResult',
    example: `const chart = useChart(() => ({
  xAxis: { type: 'category', data: months() },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: revenue() }],
}))

<div ref={chart.ref} style="height: 400px" />
// chart.loading() — true until ECharts modules loaded + chart initialized
// chart.instance() — raw ECharts instance for imperative API`,
    notes: 'Create a reactive ECharts instance. Options are passed as a function — signal reads inside are tracked and the chart updates automatically when any tracked signal changes. Lazy-loads the required ECharts modules on first render (zero bytes until mount). Returns `ref` (bind to a container div), `instance` (Signal<ECharts | null>), `loading` (Signal<boolean>), `error` (Signal<Error | null>), and `resize()`. Auto-resizes via ResizeObserver and disposes on unmount. See also: Chart.',
    mistakes: `- Forgetting to set a height on the container div — ECharts requires explicit dimensions, it does not auto-size to content
- Passing options as a plain object instead of a function — signal reads are not tracked and the chart never updates
- Reading chart.instance() immediately after useChart — the instance is null until the async module load completes; check chart.loading() first
- Calling chart.resize() during SSR — useChart is browser-only; the hook no-ops safely on the server but resize is meaningless`,
  },

  'charts/Chart': {
    signature: '(props: ChartProps) => VNodeChild',
    example: `<Chart
  options={() => ({
    series: [{ type: 'pie', data: [{ value: 60, name: 'A' }, { value: 40, name: 'B' }] }],
  })}
  style="height: 300px"
  onClick={(params) => alert(params.name)}
/>`,
    notes: 'Declarative chart component that wraps `useChart` internally. Accepts `options` (reactive function), `style`/`class` for the container, and event handlers (`onClick`, `onMouseover`, etc.) that bind to the ECharts instance. Renders a div with the chart — auto-resizes and cleans up on unmount. Simpler than useChart for most use cases. See also: useChart.',
    mistakes: `- Missing style height on the Chart component — same as useChart, ECharts requires explicit container dimensions
- Passing a static options object — wrap in \`() => ({...})\` so signal reads inside are tracked reactively`,
  },
  // <gen-docs:api-reference:end @pyreon/charts>
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/code>

  'code/createEditor': {
    signature: '(config: EditorConfig) => EditorInstance',
    example: `const editor = createEditor({
  value: '// hello',
  language: 'typescript',
  theme: 'dark',
  minimap: true,
  onChange: (next) => console.log('edit:', next),
})

editor.value()              // reactive read
editor.value.set('new')     // write into CodeMirror
editor.cursor()             // { line, col }
editor.lineCount()          // computed
editor.goToLine(42)
editor.insert('code')

<CodeEditor instance={editor} style="height: 400px" />`,
    notes: 'Create a reactive editor instance. `editor.value` is a writable Signal<string> — `editor.value()` reads reactively, `editor.value.set(next)` writes back into CodeMirror. `editor.cursor` and `editor.lineCount` are computed signals. Config accepts value, language, theme, minimap, lineNumbers, foldGutter, onChange, and more. The instance is framework-independent — mount it via `<CodeEditor instance={editor} />`. See also: CodeEditor, bindEditorToSignal, loadLanguage.',
    mistakes: `- Forgetting to declare @pyreon/runtime-dom in consumer app deps — <CodeEditor> JSX emits _tpl() which needs runtime-dom
- Hand-rolling the applyingFromExternal/applyingFromEditor flag pattern — use bindEditorToSignal instead
- Calling cursor-relative methods (insert / replaceSelection) before mount — the view is created by mount() after an async grammar load, so a pre-mount call has no cursor and is dropped (with a dev warning). Use editor.value.set(...) to set content independently of the view (it seeds the doc whenever the view is created)
- Setting both vim: true and emacs: true — emacs wins`,
  },

  'code/bindEditorToSignal': {
    signature: '<T>(options: BindEditorToSignalOptions<T>) => EditorBinding',
    example: `const data = signal<Doc>({ name: 'Alice', count: 1 })
const editor = createEditor({ value: JSON.stringify(data(), null, 2), language: 'json' })

const binding = bindEditorToSignal({
  editor,
  signal: data,
  serialize: (val) => JSON.stringify(val, null, 2),
  parse: (text) => { try { return JSON.parse(text) } catch { return null } },
  onParseError: (err) => console.warn(err.message),
})
// binding.dispose() on unmount`,
    notes: 'Two-way binding between an editor instance and an external Signal<T> (or SignalLike<T>). Replaces the recurring loop-prevention flag-pair boilerplate. Round-trips through user-supplied `serialize`/`parse` functions. Internal flags break the format-on-input race; parse failures call `onParseError` and leave the external state at its last valid value. Returns `{ dispose }` for cleanup. See also: createEditor.',
    mistakes: `- Forgetting to call binding.dispose() on unmount — leaks both effects
- Non-deterministic serialize() — if serialize(parse(text)) varies on each call, the helper dispatches redundant writes that fight the user's typing
- Returning a non-null value from parse() for malformed input — return null on failure, or throw
- Using bindEditorToSignal AND a manual editor.value.set() loop — defeats loop prevention`,
  },

  'code/CodeEditor': {
    signature: '(props: CodeEditorProps) => VNodeChild',
    example: '<CodeEditor instance={editor} style="height: 400px" class="my-editor" />',
    notes: 'Mount component for a `createEditor` instance. Accepts `instance`, `style`, `class`, and passes through to a container div. Auto-mounts the CodeMirror view on render and cleans up on unmount. See also: createEditor, DiffEditor, TabbedEditor.',
  },

  'code/DiffEditor': {
    signature: '(props: DiffEditorProps) => VNodeChild',
    example: '<DiffEditor original="old code" modified="new code" language="typescript" />',
    notes: 'Side-by-side diff editor. Accepts `original` and `modified` strings plus optional `language` and `theme`. Renders two CodeMirror instances with unified diff highlighting via @codemirror/merge. See also: CodeEditor, TabbedEditor.',
  },

  'code/loadLanguage': {
    signature: '(lang: EditorLanguage) => Promise<void>',
    example: `await loadLanguage('python')
// Now 'python' is available in createEditor({ language: 'python' })`,
    notes: 'Lazy-load a language grammar. Supports 19 languages: json, typescript, javascript, python, css, html, markdown, rust, go, java, cpp, sql, xml, yaml, php, and more. Grammars are declared as optional dependencies and loaded on demand. See also: createEditor, getAvailableLanguages.',
  },

  'code/minimapExtension': {
    signature: '() => Extension',
    example: `const editor = createEditor({ value: longCode, minimap: true })
// or: import { minimapExtension } from '@pyreon/code'`,
    notes: 'CodeMirror extension that renders a canvas-based code overview minimap. Enable via `createEditor({ minimap: true })` or add the extension manually to a CodeMirror state. See also: createEditor.',
  },
  // <gen-docs:api-reference:end @pyreon/code>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/hotkeys
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/hotkeys>

  'hotkeys/useHotkey': {
    signature: '(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => void',
    example: `useHotkey('mod+s', (e) => {
  e.preventDefault()
  save()
}, { description: 'Save' })

useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
useHotkey('escape', () => close(), { enableOnFormElements: true })`,
    notes: `Register a keyboard shortcut that auto-unregisters when the component unmounts. Shortcut format: \`mod+s\`, \`ctrl+shift+p\`, \`escape\`, etc. \`mod\` is Command on Mac, Ctrl elsewhere. By default, shortcuts don't fire when focused on form elements (input, textarea, select) — override with \`enableOnFormElements: true\`. Supports \`scope\` option for context-aware activation and \`description\` for introspection. See also: useHotkeyScope, registerHotkey.`,
    mistakes: `- Forgetting e.preventDefault() for browser-reserved shortcuts (mod+s, mod+p) — the browser dialog fires alongside your handler
- Registering the same shortcut in overlapping scopes without priority — both handlers fire; use scope isolation to prevent conflicts
- Using useHotkey outside a component body — the onUnmount cleanup requires an active component setup context
- Not activating the scope — useHotkey with a scope option does nothing unless useHotkeyScope(scope) is called or enableScope(scope) is invoked`,
  },

  'hotkeys/useHotkeyScope': {
    signature: '(scope: string) => void',
    example: `// In an editor component:
useHotkeyScope('editor')
useHotkey('ctrl+z', () => undo(), { scope: 'editor' })

// In a modal component:
useHotkeyScope('modal')
useHotkey('escape', () => close(), { scope: 'modal' })`,
    notes: 'Activate a hotkey scope for the lifetime of the current component. When the component mounts, the scope is enabled; when it unmounts, the scope is disabled. Shortcuts registered with a matching `scope` option only fire when the scope is active. Multiple components can activate the same scope — it stays active until the last one unmounts. See also: useHotkey, enableScope, disableScope.',
    mistakes: `- Using useHotkeyScope outside a component body — the lifecycle hooks require an active setup context
- Assuming scope deactivation is immediate on unmount — if another component also activated the scope, it stays active`,
  },

  'hotkeys/registerHotkey': {
    signature: '(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => () => void',
    example: `const unregister = registerHotkey('ctrl+q', () => quit(), { scope: 'global' })
// Later:
unregister()`,
    notes: 'Imperative hotkey registration for non-component contexts (stores, global setup). Returns an unregister function. Unlike useHotkey, this does NOT auto-cleanup on unmount — caller is responsible for calling the returned unregister function. See also: useHotkey.',
  },
  // <gen-docs:api-reference:end @pyreon/hotkeys>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/table
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/table>

  'table/useTable': {
    signature: '<TData extends RowData>(options: () => TableOptions<TData>) => Computed<Table<TData>>',
    example: `const table = useTable(() => ({
  data: users(),
  columns: [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
  ],
  getCoreRowModel: getCoreRowModel(),
}))

// Read inside reactive scope:
<For each={() => table().getRowModel().rows} by={(r) => r.id}>
  {(row) => <tr>...</tr>}
</For>`,
    notes: 'Create a reactive TanStack Table instance. Options are passed as a function so reactive signals (data, columns, sorting state) can be read inside and the table updates automatically when they change. Returns a Computed<Table<T>> — read it inside JSX expression thunks or effects to track state changes. Internal state management uses a version counter to force re-notification even when the table reference is the same object. See also: flexRender.',
    mistakes: `- Passing options as a plain object instead of a function — signal reads are not tracked and the table never updates when data changes
- Reading \`table\` without calling it — \`table\` is a Computed, you must call \`table()\` to get the Table instance
- Forgetting getCoreRowModel() — TanStack Table requires at least getCoreRowModel in options or it throws
- Using \`.map()\` on rows instead of \`<For>\` — loses Pyreon's keyed reconciliation and fine-grained DOM updates`,
  },

  'table/flexRender': {
    signature: '<TData extends RowData, TValue>(component: Renderable<TValue>, props: TValue) => unknown',
    example: `// Header:
flexRender(header.column.columnDef.header, header.getContext())
// Cell:
flexRender(cell.column.columnDef.cell, cell.getContext())`,
    notes: 'Render a TanStack Table column definition template (header, cell, or footer). Handles strings, numbers, functions (component functions or render functions), and VNodes. Returns the rendered output or null for undefined/null inputs. Use in JSX to render column definitions provided by TanStack Table. See also: useTable.',
    mistakes: `- Wrapping flexRender output in an extra function accessor — the result is already renderable JSX content
- Passing the column def directly instead of calling getContext() — TanStack Table requires the context object`,
  },
  // <gen-docs:api-reference:end @pyreon/table>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/virtual
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/virtual>

  'virtual/useVirtualizer': {
    signature: '(options: UseVirtualizerOptions) => UseVirtualizerResult',
    example: `const virtualizer = useVirtualizer({
  count: () => items().length,
  getScrollElement: () => scrollRef,
  estimateSize: () => 35,
  overscan: 5,
})

// virtualItems() is reactive — re-evaluates as user scrolls
<For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
  {(item) => <div style={() => \`top: \${item.start}px\`}>{item.index}</div>}
</For>`,
    notes: 'Create an element-scoped virtualizer. Attach to a scrollable container via `getScrollElement`. Returns reactive `virtualItems()`, `totalSize()`, and `isScrolling()` signals plus `scrollToIndex()` and `scrollToOffset()` for programmatic control. Options that accept functions (`count`, `estimateSize`) track signal reads reactively. See also: useWindowVirtualizer.',
    mistakes: `- Forgetting to set a fixed height on the scroll container — without overflow:auto + a height, the virtualizer has no viewport to measure
- Passing count as a plain number instead of a function when the list length is dynamic — the virtualizer won't update when items change
- Reading virtualItems() outside a reactive scope — captures the initial window only, never updates on scroll
- Using .map() instead of <For> on virtualItems — loses keyed reconciliation`,
  },

  'virtual/useWindowVirtualizer': {
    signature: '(options: UseWindowVirtualizerOptions) => UseWindowVirtualizerResult',
    example: `const virtualizer = useWindowVirtualizer({
  count: () => items().length,
  estimateSize: () => 50,
})

<div style={() => \`height: \${virtualizer.totalSize()}px; position: relative\`}>
  <For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
    {(item) => <div style={() => \`position: absolute; top: \${item.start}px\`}>Row {item.index}</div>}
  </For>
</div>`,
    notes: 'Create a window-scoped virtualizer that uses the browser window as the scroll container. SSR-safe — checks for browser environment before attaching scroll listeners. Same return shape as `useVirtualizer` (virtualItems, totalSize, isScrolling, scrollToIndex). Use for long page-level lists where the entire page scrolls. See also: useVirtualizer.',
    mistakes: `- Using useWindowVirtualizer inside a scrollable container that is not the window — use useVirtualizer with getScrollElement instead
- Forgetting to position items absolutely inside a relative container with the total height — items overlap or collapse`,
  },
  // <gen-docs:api-reference:end @pyreon/virtual>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/feature
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/feature>

  'feature/defineFeature': {
    signature: '<T>(config: FeatureConfig<T>) => Feature<T>',
    example: `const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    body: 'string',
    author: reference('users'),
  },
  api: { baseUrl: '/api/posts' },
})

Posts.useList({ page: 1 })
Posts.useById('123')
Posts.useCreate()
Posts.useForm('123')
Posts.useTable({ columns: ['title', 'author'] })`,
    notes: 'Define a schema-driven CRUD feature. Accepts a name, field schema, and API config. Returns a Feature object with auto-generated hooks: `useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`, `useForm`, `useTable`, `useStore`. Composes @pyreon/query (data fetching), @pyreon/form (form state), @pyreon/validation (schema validation), @pyreon/store (global state), and @pyreon/table (table configuration). Schema field types are inferred for TypeScript autocompletion across all generated hooks. See also: reference, extractFields, defaultInitialValues.',
    mistakes: `- Forgetting to install peer dependencies — defineFeature composes @pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table internally
- Using defineFeature without a QueryClient provider — useList/useById/useSearch/useCreate/useUpdate/useDelete all depend on @pyreon/query which requires a QueryClient in context
- Passing schema field types as TypeScript types instead of string literals — schema values must be runtime strings like \`"string"\`, \`"number"\`, \`"boolean"\`, or \`reference("otherFeature")\`
- Calling useForm without an id for edit mode — pass an id to load existing data, omit it for create mode`,
  },

  'feature/reference': {
    signature: 'reference(target: { name: string }) => ReferenceSchema',
    example: `const Users = defineFeature({ name: 'users', schema: { name: 'string' }, api: { baseUrl: '/api/users' } })
const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    author: reference(Users),    // FK to users feature
    category: reference({ name: 'categories' }),
  },
  api: { baseUrl: '/api/posts' },
})`,
    notes: `Mark a schema field as a foreign key reference to another feature. Used inside defineFeature schema definitions to establish relationships between features. The generated form and table hooks understand reference fields and can render appropriate UI (select dropdowns, linked displays). The marker is a \`Symbol.for('pyreon:feature:reference')\` property — invisible to JSON.stringify but detected by extractFields() and the validation layer. See also: defineFeature, isReference.`,
    mistakes: `- Passing a plain string instead of a Feature ref — \`reference("users")\` will not typecheck; pass the Feature object or \`{ name: "users" }\`.
- Forgetting that the referenced Feature must ALSO be defined via defineFeature — the FK only works end-to-end when both sides are real Features sharing the same QueryClient.
- Expecting reference() to enforce schema validation at the foreign side — it only marks the field. Cascade behaviour (deleting a user → orphaning posts) is the consumer's concern.`,
  },

  'feature/isReference': {
    signature: 'isReference(value: unknown) => value is ReferenceSchema',
    example: `import { isReference } from '@pyreon/feature'

for (const [key, value] of Object.entries(Posts.schema)) {
  if (isReference(value)) {
    console.log(\`\${key} is a foreign key to \${value._featureName}\`)
  }
}`,
    notes: 'Type-guard that returns true if a value is a ReferenceSchema produced by `reference()`. Used internally by `extractFields` to recognise FK fields, and exposed for consumers building custom form/table renderers that need to special-case reference fields (e.g. render a select dropdown instead of a text input). See also: reference, extractFields.',
    mistakes: `- Trying to detect references via \`instanceof\` — references are symbol-tagged plain objects, not class instances. Always use isReference().
- Confusing isReference() with Zod's own type guards — isReference checks ONLY for the Pyreon reference marker, not for arbitrary Zod schemas.`,
  },

  'feature/extractFields': {
    signature: 'extractFields(schema: unknown) => FieldInfo[]',
    example: `import { extractFields } from '@pyreon/feature'
import { z } from 'zod'

const schema = z.object({
  title: z.string(),
  views: z.number().optional(),
  status: z.enum(['draft', 'published']),
})

const fields = extractFields(schema)
// [
//   { name: 'title',  type: 'string', optional: false, label: 'Title' },
//   { name: 'views',  type: 'number', optional: true,  label: 'Views' },
//   { name: 'status', type: 'enum',   optional: false, label: 'Status', enumValues: ['draft', 'published'] },
// ]`,
    notes: 'Introspect a schema object and return an array of `FieldInfo` describing each field (name, type, optional, label, plus enumValues for enums and referenceTo for references). Duck-types both Zod v3 (`._def.shape` callable) and Zod v4 (`._zod.def.shape` direct) without importing Zod. Used internally by `defineFeature` to build the generated form/table; exposed for consumers building custom UI that needs to enumerate schema fields. See also: defaultInitialValues, defineFeature.',
    mistakes: `- Calling extractFields on a Pyreon plain-string schema (\`{ title: "string" }\`) instead of a Zod schema — extractFields expects Zod shapes; the plain-string form is interpreted inside defineFeature, not here.
- Expecting field order to match declaration order in ALL JS engines — relies on Object.keys() insertion order, which V8 / SpiderMonkey / JSC all preserve for string keys but is technically engine-specific.
- Assuming \`label\` is derived from a docs comment — labels are derived from the field name via humanize-case (\`firstName\` → \`First Name\`). Override by passing a label via your own \`FieldInfo\`.`,
  },

  'feature/defaultInitialValues': {
    signature: 'defaultInitialValues(fields: FieldInfo[]) => Record<string, unknown>',
    example: `import { extractFields, defaultInitialValues } from '@pyreon/feature'

const fields = extractFields(zodSchema)
const initial = defaultInitialValues(fields)
// { title: '', views: 0, status: 'draft' }

const form = useForm({ initialValues: initial, ... })`,
    notes: 'Generate sensible default initial values from extracted field info. Returns `{ stringField: "", numberField: 0, booleanField: false, enumField: <first enumValue>, dateField: "", arrayField: [], objectField: {}, referenceField: null }`. Used by `Posts.useForm()` to seed an empty form when no id is passed (create mode). Exposed for consumers building their own form initial-value seeding logic. See also: extractFields, defineFeature.',
    mistakes: `- Expecting defaults to come from Zod's \`.default()\` modifier — defaultInitialValues uses the FIELD TYPE only. Zod-level defaults flow through Zod's own parse, not this helper.
- Using these defaults for create-or-update forms — these are CREATE-mode seeds. For edit mode, fetch the existing record and use those values.`,
  },
  // <gen-docs:api-reference:end @pyreon/feature>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/storybook
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/lint
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/lint>

  'lint/lint': {
    signature: 'lint(options?: LintOptions): LintResult',
    example: `import { lint } from "@pyreon/lint"

const result = lint({ paths: ["src/"], preset: "recommended" })
console.log(result.totalErrors, result.totalWarnings)
// Config-level diagnostics (malformed rule options, etc.)
for (const d of result.configDiagnostics) console.log(d.ruleId, d.message)

// Severity overrides + per-rule options overrides
lint({
  paths: ["."],
  ruleOverrides: { "pyreon/no-classname": "off" },
  ruleOptionsOverrides: {
    "pyreon/no-window-in-ssr": { exemptPaths: ["src/foundation/"] },
  },
})`,
    notes: '90 rules across 18 categories. Auto-loads `.pyreonlintrc.json`. Presets: `recommended`, `strict`, `app`, `lib`. Per-rule options via tuple form in config (`["error", { exemptPaths: [...] }]`) or `ruleOptionsOverrides`. Wrong-typed options surface on `result.configDiagnostics`. Uses `oxc-parser` with AST caching. See also: lintFile, getPreset, AstCache.',
  },

  'lint/lintFile': {
    signature: 'lintFile(filePath: string, sourceText: string, rules: Rule[], config: LintConfig, cache?: AstCache, configDiagnosticsSink?: ConfigDiagnostic[]): LintFileResult',
    example: `import { lintFile, allRules, getPreset, AstCache } from "@pyreon/lint"

const cache = new AstCache()
const config = getPreset("recommended")
const configSink: ConfigDiagnostic[] = []
const result = lintFile("app.tsx", source, allRules, config, cache, configSink)`,
    notes: 'Low-level single-file API. Optional `AstCache` for repeat runs (FNV-1a hash keyed). Optional `configDiagnosticsSink` collects malformed-option diagnostics; without it they print to stderr. See also: lint, AstCache.',
  },

  'lint/cli': {
    signature: `pyreon-lint [--preset name] [--fix] [--format text|json|compact] [--quiet] [--watch] [--list] [--config path] [--ignore path] [--rule id=severity] [--rule-options id='{json}'] [path...]`,
    example: `pyreon-lint --preset strict --quiet    # CI mode
pyreon-lint --fix                       # auto-fix
pyreon-lint --watch src/                # watch mode
pyreon-lint --list                      # list all 90 rules
pyreon-lint --format json               # machine-readable
pyreon-lint --rule-options 'pyreon/no-window-in-ssr={"exemptPaths":["src/foundation/"]}' src/`,
    notes: `CLI entry. Config: \`.pyreonlintrc.json\` (reference \`schema/pyreonlintrc.schema.json\` for IDE autocomplete) or \`package.json\`'s \`'pyreonlint'\` field. Ignore: \`.pyreonlintignore\` + \`.gitignore\`. Watch: \`fs.watch\` recursive with 100ms debounce. \`--rule-options id='{json}'\` passes per-rule options on a single run. See also: lint.`,
  },

  'lint/no-process-dev-gate': {
    signature: 'rule: pyreon/no-process-dev-gate (architecture, error, auto-fixable)',
    example: `// ❌ Wrong — dead code in real Vite browser bundles
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
if (__DEV__) console.warn('hello')

// ✅ Correct — Vite literal-replaces import.meta.env.DEV at build time
// @ts-ignore — provided by Vite/Rolldown at build time
const __DEV__ = import.meta.env?.DEV === true
if (__DEV__) console.warn('hello')`,
    notes: `The \`typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'\` pattern works in vitest (Node, \`process\` is defined) but is silently dead code in real Vite browser bundles because Vite does NOT polyfill \`process\` for the client. Every \`console.warn\` gated on the broken constant never fires for real users in dev mode — unit tests pass while users get nothing. Use \`import.meta.env.DEV\` instead — Vite/Rolldown literal-replace it at build time, prod tree-shakes the warning to zero bytes, and vitest sets it to \`true\` automatically. Server-only packages (\`zero\`, \`core/server\`, \`core/runtime-server\`, \`vite-plugin\`, \`cli\`, \`lint\`, \`mcp\`, \`storybook\`, \`typescript\`) and test files are exempt. Reference implementation: \`packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions\`. The rule has an auto-fix that replaces the broken expression with \`import.meta.env?.DEV === true\`. See also: require-browser-smoke-test.`,
    mistakes: `- Copying the \`typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'\` pattern from existing codebases — it works in Node but is dead in browser bundles
- Trying to test with \`delete globalThis.process\` — vitest's own \`import.meta.env\` depends on \`process\`, so deleting it breaks the FIXED gate too (not because the gate is wrong, but because vitest can't resolve it)
- Adding \`process: { env: { ... } }\` polyfills to vite.config.ts as a workaround — fix the source instead
- Using the rule for server-only packages — they're correctly exempt because Node always has \`process\``,
  },

  'lint/require-browser-smoke-test': {
    signature: 'rule: pyreon/require-browser-smoke-test (architecture, error in recommended/strict/lib, off in app)',
    example: `// Per-package config (optional — defaults cover all known browser packages)
{
  "rules": {
    "pyreon/require-browser-smoke-test": [
      "error",
      {
        "additionalPackages": ["@my-org/my-browser-pkg"],
        "exemptPaths": ["packages/experimental/"]
      }
    ]
  }
}`,
    notes: `Locks in the durability of the T1.1 browser smoke harness (PRs #224, #227, #229, #231). Every browser-categorized package MUST ship at least one \`*.browser.test.{ts,tsx}\` file under \`src/\`. Without this rule, new browser packages can quietly ship without smoke coverage and we drift back to the world before T1.1 — happy-dom silently masks environment-divergence bugs (PR #197 mock-vnode metadata drop, PR #200 \`typeof process\` dead code, multi-word event delegation bug). Default browser-package list mirrors \`.claude/rules/test-environment-parity.md\`. The rule fires once per package on its \`src/index.ts\`, walks the package directory looking for \`*.browser.test.*\`, and reports if none are found. Off in \`app\` preset because apps don't ship as packages with smoke obligations. See also: no-process-dev-gate.`,
    mistakes: `- Adding a new browser-running package without a browser test — the rule will fail your PR
- Hardcoding the browser-package list in the rule — the list lives in \`.claude/rules/browser-packages.json\` (single source of truth), not in the rule source
- Disabling the rule globally — use \`exemptPaths\` to exempt specific packages still under construction
- Shipping a \`sanity.browser.test.ts\` with \`expect(1).toBe(1)\` just to satisfy the rule — it passes but provides zero signal. The rule is a GATE, not a quality check; review actual contents on PR`,
  },
  // <gen-docs:api-reference:end @pyreon/lint>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/mcp
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/mcp>

  'mcp/mcp_overview': {
    signature: 'tool: mcp_overview() → MarkdownTable',
    example: `mcp_overview()
// → | Tool | When to use | Example |
//   |------|-------------|---------|
//   | mcp_overview | Returns a markdown table of every registered MCP tool... | mcp_overview() |
//   | get_api | Look up any Pyreon API by package and symbol... | get_api({ package: 'flow', symbol: 'createFlow' }) |
//   | ...`,
    notes: 'Returns a markdown table of every registered MCP tool with a one-sentence "when to use" description and a one-line example. Reads from this same manifest at runtime — single source of truth (the same data feeds `api-reference.ts`, `llms-full.txt`, and `docs/src/content/docs/mcp.md`). Intended as the first call for any AI agent connecting to the server: enumerates the surface so the agent can navigate by intent (e.g. "I need release notes" → `get_changelog`) rather than guessing tool names from `tools/list`. See also: get_api.',
    mistakes: '- Skipping this tool and calling `tools/list` instead — that returns names + parameter schemas but no "when to use" guidance, so an agent has to call multiple tools to figure out which one fits the task.',
  },

  'mcp/get_browser_smoke_status': {
    signature: 'tool: get_browser_smoke_status — no args',
    example: `// Ask the MCP server:
//   "which Pyreon packages are missing browser smoke coverage?"
// Tool walks packages/, matches against .claude/rules/browser-packages.json,
// returns a coverage report.`,
    notes: `Companion to the \`pyreon/require-browser-smoke-test\` lint rule. Reports which browser-categorized Pyreon packages have at least one \`*.browser.test.{ts,tsx}\` file under \`src/\`. Uses the same \`.claude/rules/browser-packages.json\` single source of truth as the rule + the CI script. Lets an AI agent check coverage before writing a new browser package (so it adds a smoke test in the same PR) instead of discovering the failure when CI runs. Falls back with a clear message if the JSON isn't present (e.g. consumer apps that don't ship the Pyreon monorepo layout). See also: audit_test_environment.`,
    mistakes: `- Using the tool's output as a substitute for running the CI script — this tool only checks file existence, not the self-expiring-exemption check that \`bun run lint:browser-smoke\` performs`,
  },

  'mcp/get_api': {
    signature: 'tool: get_api({ package: string; symbol: string }) → APIEntry',
    example: `// Agent-side
get_api({ package: 'flow', symbol: 'createFlow' })
get_api({ package: '@pyreon/router', symbol: 'useTypedSearchParams' })`,
    notes: `Look up any Pyreon API by \`package\` (e.g. \`"flow"\` or \`"@pyreon/flow"\`) and \`symbol\` (e.g. \`"createFlow"\`). Returns the canonical signature, example, foot-gun catalogue, and cross-references — drawn from \`api-reference.ts\`, which is regenerated from each package\\'s \`manifest.ts\`. The single agent-facing entry point for "what does this API do and how do I avoid the common mistakes." See also: validate, get_pattern.`,
    mistakes: `- Passing the package name with a typo or wrong scope — \`get_api({ package: "pyreon-flow", ... })\` returns nothing. Use \`"flow"\` or \`"@pyreon/flow"\`; the tool accepts both.
- Expecting \`symbol\` to match a method on a returned instance (e.g. \`Posts.useList\`) — only TOP-LEVEL exports are in api-reference. Method-on-instance APIs are documented in the parent symbol's \`summary\` / \`example\`.
- Treating a 404 as "the API doesn't exist" — it may exist but the package's manifest is not yet on the MCP pipeline (~33 of ~55 packages migrated). Check the docs page or source as a fallback when get_api returns empty.
- Forgetting that \`summary\` may contain the answer to a follow-up question — read the full body before falling back to \`get_pattern\` / \`validate\` / source diving.`,
  },

  'mcp/validate': {
    signature: 'tool: validate({ code: string; filename?: string }) → Diagnostics[]',
    example: `validate({ code: \`
function MyComp(props) {
  const { value } = props          // → props-destructured
  return <For each={items}>{...}</For>  // → for-missing-by
}
\` })`,
    notes: 'Two AST-based detectors run in parallel: `detectReactPatterns` flags "coming from React" mistakes (`useState`, `useEffect`, `className`, `onChange` on inputs, React-package imports), and `detectPyreonPatterns` flags "using Pyreon wrong" mistakes (`<For>` missing `by`, props destructured at component signature, `typeof process` dev gates, raw `addEventListener`, `Date.now() + Math.random()` IDs). Diagnostics are merged + sorted by line / column for top-down reading. See also: get_anti_patterns, migrate_react.',
    mistakes: `- Treating zero diagnostics as "the code is correct" — \`validate\` is a STATIC detector. It catches the documented anti-patterns from \`.claude/rules/anti-patterns.md\` but does NOT verify runtime semantics, cross-file consistency, type correctness, or compiler output. Pair with \`tsc\` + tests for full coverage.
- Omitting the \`filename\` arg for path-sensitive detectors — some detectors (e.g. \`pyreon/no-window-in-ssr\` with its \`exemptPaths\` option) need the path to know whether the file is server-only-exempt. Without it the diagnostic may misfire or fail to fire.
- Running \`validate\` on a snippet that is NOT a full file — detectors expect complete syntax (every \`import\`, every \`function\`). Passing a partial expression yields no diagnostics, which can be mistaken for "clean".
- Calling \`validate\` after the code is already merged — it's a pre-commit / before-paste tool. After-the-fact use is fine but the maximum value is catching the bug BEFORE it ships.`,
  },

  'mcp/migrate_react': {
    signature: 'tool: migrate_react({ code: string; filename?: string }) → MigrationResult',
    example: `migrate_react({ code: \`
import { useState, useEffect } from 'react'
function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => { console.log(count) }, [count])
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
\` })`,
    notes: 'Convert React code to idiomatic Pyreon. Handles `useState` → `signal()`, `useEffect` → `effect()`, `className` → `class`, `onChange` → `onInput`, `useMemo` → `computed()`, React imports → Pyreon imports. Reports per-edit fixable diagnostics so callers can apply or review. See also: validate.',
    mistakes: `- Expecting the migration to handle every React feature — currently covers the most common hooks/JSX patterns. Class components, Concurrent React APIs, Suspense boundaries, and React-specific libs (react-router, redux) are NOT migrated automatically; the result will flag remaining issues but won't rewrite them.
- Running \`migrate_react\` on a file that's already mostly Pyreon — it's idempotent against already-migrated code (nothing flagged → nothing changed), so the cost is just the parse pass; safe to re-run.
- Forgetting that \`useEffect(() => fn, [deps])\` → \`effect(() => fn)\` changes semantics: Pyreon effects auto-track via signal reads, the explicit deps array is dropped. Verify your effects read the same signals the React deps array listed.
- Trusting the migration to produce idiomatic Pyreon — the output is CORRECT but mechanical. Pair with \`get_pattern\` after migration to apply Pyreon-native shapes (e.g. \`<Show when={() => …}>\` instead of ternaries; \`<For>\` instead of \`.map()\`).`,
  },

  'mcp/diagnose': {
    signature: 'tool: diagnose({ error: string, componentSource?: string, reactiveTrace?: ReactiveTraceEntry[], filename?: string, phase?: string }) → DiagnoseResult',
    example: `// v1 — unchanged, backward-compatible
diagnose({ error: 'Cannot redefine property X on object [object Object]' })
// → cause: configurable: false on a getter; fix: set configurable: true

// v2 — structured context → causal diagnosis
diagnose({
  error: 'name is stale after parent update',
  componentSource: 'function G({ name }) { return <div>{name}</div> }',
  reactiveTrace: [{ name: 'name', prev: '"a"', next: '"b"', timestamp: 1 }],
})
// → base diagnosis + "Static detector findings: props-destructured"
//   + matched anti-pattern entry + the reactive run-up`,
    notes: 'Parse a Pyreon runtime / build error into structured fix information. **String-only call is unchanged** (probable cause + fix + related docs from the regex pattern table — fully backward-compatible). v2 adds OPTIONAL structured context for richer, causal diagnosis: pass `componentSource` and the tool runs the static Pyreon detectors over it and maps each hit to the documented anti-pattern catalog entry (the `detectorCodes` bridge); pass `reactiveTrace` (the `ErrorContext.reactiveTrace` from `@pyreon/core`, populated in dev) and the tool formats the causal sequence of signal writes leading to the crash. The tool is deterministic — it assembles structured context, the calling agent reasons over it (no embedded LLM). Use the enriched form when you have the failing component + the error report; use the bare string form for a quick "what does this error mean". See also: validate, get_anti_patterns, explain_error.',
    mistakes: `- Assuming v2 changed the string-only behaviour — it did not; an error-only call returns byte-identical output to before. The enrichment sections appear ONLY when componentSource / reactiveTrace are supplied
- Expecting the tool to return a fix patch — it returns structured CONTEXT (regex diagnosis + detector hits + matched anti-patterns + reactive run-up). The agent reasons over it; the tool does not embed a model
- Passing a production error report and expecting \`reactiveTrace\` content — the trace is dev-only (it tree-shakes out of prod builds), so prod reports carry \`reactiveTrace: undefined\` and the tool degrades to the v1 base diagnosis`,
  },

  'mcp/explain_error': {
    signature: 'tool: explain_error({ report: string; componentSource?: string }) → FailureDossier',
    example: `explain_error({ report: JSON.stringify(errorContext) })
// errorContext from registerErrorHandler(ctx => …) in dev;
// ctx.reactiveTrace is the high-signal field`,
    notes: `The rich-context sibling of \`diagnose\`. \`diagnose\` matches an error STRING against known footguns; \`explain_error\` takes a full \`ErrorContext\`-shaped report — crucially the \`reactiveTrace\` (the causal SEQUENCE of signal writes from @pyreon/core's error reports) — and assembles a structured failure dossier: the reactive run-up + heuristic findings (empty-trace / nullish-then-crash / write-storm / last-write-correlation / type-flip), optional static \`detectPyreonPatterns\` on the component source, and correlated anti-pattern catalogue entries. The server only assembles + applies cheap heuristics; the consuming agent reasons over the dossier and a human gates any patch (the tool returns text only — no mutation, no LLM dependency). Use it when an agent has a captured Pyreon crash and the stack trace alone is not enough — the reactive sequence shows *how* the app reached the failing state. See also: diagnose, validate, get_anti_patterns.`,
    mistakes: `- Passing only an error string — that is what \`diagnose\` is for. \`explain_error\` wants the structured report (phase, component, props, reactiveTrace) to be worth more than \`diagnose\`
- Expecting it to apply a fix — it returns a dossier + suspected cause only. Repair is human-gated by construction (the tool has no write capability)
- Capturing the report in production — \`reactiveTrace\` is dev-only (tree-shaken in prod), so the highest-signal section will be empty. Capture in dev`,
  },

  'mcp/get_routes': {
    signature: 'tool: get_routes() → Route[]',
    example: `get_routes()
// → [{ path: '/', name: 'home', hasLoader: true, params: [] }, ...]`,
    notes: 'List every route in the current project — path, loader presence, guards, params, and named-route name. Walks the project source from `process.cwd()` down. Cached per server instance with auto-invalidation on `cwd` change. See also: get_components.',
    mistakes: `- Calling \`get_routes\` from outside a Pyreon project (no \`package.json\` with \`@pyreon/router\` or \`@pyreon/zero\` reachable from \`process.cwd()\`) — returns an empty array. Run from the project root, not from \`~/\` or a parent directory.
- Expecting the route list to update mid-session after file changes — the scanner caches per server-instance + cwd. Restart the MCP server or change cwd to refresh.
- Treating \`hasLoader: false\` as "no data" — the route may load data via \`useQuery\` in the component body. \`hasLoader\` reflects the \`export const loader = …\` convention only.`,
  },

  'mcp/get_components': {
    signature: 'tool: get_components() → ComponentInfo[]',
    example: `get_components()
// → [{ name: 'Button', file: 'src/Button.tsx', props: ['onClick', 'children'], signals: ['count'] }, ...]`,
    notes: 'List every component in the current project with its props and signal usage. Same scanner as `get_routes`. Useful for an agent before generating new code that needs to reference existing components. See also: get_routes.',
    mistakes: `- Trusting the \`props\` list to be complete — the scanner extracts props from the FIRST parameter type annotation or destructure. Components using prop spread (\`<Comp {...rest}>\`) or computed prop shapes won't have their forwarded keys listed.
- Expecting \`signals\` to count signals declared INSIDE the component body — yes, those are listed; but signals imported from another module and used here are NOT listed (the scanner is per-file).
- Calling outside a Pyreon project — same caveat as \`get_routes\`: returns empty if the scanner can't find a project root.`,
  },

  'mcp/get_pattern': {
    signature: 'tool: get_pattern({ name?: string }) → PatternBody | string[]',
    example: `get_pattern({ name: 'controllable-state' })
// → full canonical pattern body
get_pattern({})
// → [{ name: 'controllable-state', summary: '...' }, ...]`,
    notes: 'Fetch a canonical "how do I do X" pattern body from `docs/patterns/`. 16 foundational patterns ship: `controllable-state`, `data-fetching`, `dev-warnings`, `dynamic-fields`, `event-listeners`, `form-fields`, `imperative-toasts`, `islands`, `keyed-lists`, `reactive-context`, `reactive-spread`, `routing-setup`, `signal-writes`, `ssr-safe-hooks`, `state-management`, `styler-theming`. Omit `name` to list available patterns. Drop a new `docs/patterns/<slug>.md` file to add one — picked up on next call. See also: get_anti_patterns.',
    mistakes: `- Passing a name in CamelCase or PascalCase — pattern names are kebab-case (\`controllable-state\`, not \`ControllableState\`). A wrong-case name 404s.
- Expecting the pattern list to include every Pyreon idiom — \`get_pattern\` covers the 16 foundational shapes (data fetching, forms, signal writes, etc.). Specialized patterns (PMTC, native compat, devtools wiring) live elsewhere in the docs.
- Confusing patterns with anti-patterns — \`get_pattern\` returns "how to do X correctly"; \`get_anti_patterns\` returns "what to avoid". They're complementary.`,
  },

  'mcp/get_anti_patterns': {
    signature: `tool: get_anti_patterns({ category?: 'reactivity'|'jsx'|'context'|'architecture'|'testing'|'lifecycle'|'documentation'|'all'; name?: string; full?: boolean }) → string`,
    example: `get_anti_patterns()
// → compact index (~3.3K): titles + detector tags + one-line hooks
get_anti_patterns({ name: 'Destructuring props' })  // → that entry's full body
get_anti_patterns({ category: 'reactivity' })       // → full bodies, one category
get_anti_patterns({ full: true })                   // → entire catalog (~14K)`,
    notes: `Browse the anti-patterns catalog from \`.claude/rules/anti-patterns.md\`, token-frugal by default. **No args → a COMPACT INDEX** (one line per entry: title + \`[detector: <code>]\` tag + one-sentence hook; ≈3.3K tokens vs the ≈14K full dump — a ~76% cut on the common orient call). Drill in deliberately: \`{ name }\` → the single matching entry\\'s full body (cheapest); \`{ category }\` → full bodies for one category; \`{ full: true }\` → entire catalog (≈14K, explicit opt-in). The index keeps per-category \`## <Heading>\` markers so categories are still discoverable in one call; each \`[detector: <code>]\` tag pairs the entry with the live \`validate\` detector. See also: validate, get_pattern.`,
    mistakes: `- Reaching for \`{ full: true }\` to "see the anti-patterns" — that is the ~14K dump. The no-arg index is the orient call; pull full bodies with \`{ name }\` once you know which entry matters
- Expecting no-arg to return full bodies — it returns the index (behaviour changed in the token-slim PR). Full bodies need \`{ name }\`, \`{ category }\`, or \`{ full: true }\``,
  },

  'mcp/get_changelog': {
    signature: 'tool: get_changelog({ package?: string; limit?: number; includeDependencyUpdates?: boolean; since?: string }) → ChangelogEntry[]',
    example: `get_changelog({ package: 'flow', limit: 5 })
get_changelog({ package: '@pyreon/router', since: '0.12.0' })`,
    notes: 'Recent release notes for any `@pyreon/*` package without scraping `git log`. Parses `packages/**/CHANGELOG.md` into version entries (`{ version, changes[], dependencyUpdates[], empty }`) and returns the N most recent substantive versions (default 5). Filters out ceremonial version bumps (pure dependency-update releases with no user-facing body) by default — opt back in with `includeDependencyUpdates: true`. `since: "0.12.0"` returns the delta from a known floor — useful when an agent knows the version it was trained against. See also: get_api.',
    mistakes: `- Forgetting that ceremonial version bumps are filtered by default — if you NEED the dep-only releases (e.g. tracking when a transitive Pyreon dep flipped), pass \`includeDependencyUpdates: true\`. Otherwise the gap between "what changed" and "what shipped" can confuse a coverage analysis.
- Passing \`since: "0.27"\` (without patch) — the parser does a semver-aware comparison and treats \`"0.27"\` as \`"0.27.0"\`. Be explicit (\`"0.27.0"\`) to avoid silent off-by-one.
- Omitting \`package\` and expecting a multi-package digest — the tool is per-package. For a cross-package release survey, call once per package or read the release notes on GitHub.
- Trusting changelog entries to spell out the migration — they describe WHAT changed, not always HOW to migrate. Pair with \`get_pattern\` / \`get_api\` for shape changes.`,
  },

  'mcp/audit_test_environment': {
    signature: `tool: audit_test_environment({ minRisk?: 'high' | 'medium' | 'low'; limit?: number }) → AuditReport`,
    example: `audit_test_environment({ minRisk: 'medium', limit: 10 })
// → grouped report with HIGH / MEDIUM / LOW sections`,
    notes: `Scan every \`*.test.{ts,tsx}\` under \`packages/\` for the mock-vnode anti-pattern that caused PR #197\\'s silent metadata drop. Files are classified HIGH / MEDIUM / LOW based on the balance of mock-vnode literals + helpers + helper-call sites vs real \`h()\` calls + \`@pyreon/core\` import. Three context-aware skips (helper-def vs binding discrimination, type-guard call-arg skip, template-string fixture mask) keep the false-positive rate low. Run before merging a new test file or after a framework change. See also: get_browser_smoke_status, audit_islands.`,
    mistakes: `- Treating a HIGH finding as "this test is broken" — HIGH means the test relies HEAVILY on mock vnodes. The test may still be correct given its scope (e.g. testing a helper that only operates on vnode shapes); review the file and pair with a real-\`h()\` companion test if the contract assertion matters.
- Calling with \`minRisk: "low"\` and getting overwhelmed — LOW includes any file that even mentions a mock vnode helper. Use \`medium\` for actionable signal, \`high\` for "would have prevented PR #197"-tier risk.
- Running outside the monorepo root — the scanner walks \`packages/\` from \`process.cwd()\`. From a subpackage dir, you get a partial result.
- Expecting it to flag missing tests — it ONLY scans existing test files. Missing test coverage is a separate concern (coverage gate, not audit_test_environment).`,
  },

  'mcp/audit_islands': {
    signature: 'tool: audit_islands({ json?: boolean }) → IslandAuditReport',
    example: `audit_islands({})
// → markdown-grouped report with one section per finding code

audit_islands({ json: true })
// → machine-readable { root, findings: [...], summary: {...} }`,
    notes: `Project-wide cross-file islands audit (PR C of the islands DX roadmap). Walks \`packages/\` + \`examples/\` and runs five detectors that auto-registry can\\'t reach (manual \`hydrateIslands({...})\` for non-Vite consumers / library authors) AND PR G\\'s per-file \`island-never-with-registry-entry\` detector misses (it only catches the same-file shape): \`duplicate-name\`, \`never-with-registry-entry\`, \`registry-mismatch\`, \`nested-island\`, \`dead-island\`. Each finding ships with file path + line/column + actionable fix suggestion. Companion to the \`pyreon doctor --check-islands\` CLI flag (same scanner, same five detectors). Run before merging an island PR; CI gate by piping \`--json\` and grepping \`findings.length > 0\`. See also: audit_test_environment, get_anti_patterns.`,
    mistakes: `- Running outside a project that uses islands — the audit walks \`packages/\` + \`examples/\` from \`process.cwd()\`. A project with zero \`island()\` declarations returns an empty findings array (not an error).
- Treating \`registry-mismatch\` as a hard error in auto-registry apps — it only fires for MANUAL \`hydrateIslands({ ... })\` calls. Apps using \`hydrateIslandsAuto()\` (Vite plugin default) won't see this finding even if they'd be vulnerable to the same drift in a manual setup.
- Expecting \`dead-island\` to catch every never-used island — the detector tracks static imports of the loader path. Dynamic-import chains routed through a registry indirection may not be statically traceable; verify by source-grepping the loader path before deleting.
- Confusing \`nested-island\` with intentional island composition — the outer island's \`hydrateRoot\` REPLACES the inner subtree before the inner can hydrate. If you genuinely need nested islands, flatten or use a different boundary primitive.`,
  },
  // <gen-docs:api-reference:end @pyreon/mcp>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/ui-core
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/ui-core>

  'ui-core/PyreonUI': {
    signature: `(props: { theme?: Theme; mode?: 'light' | 'dark' | 'system'; inversed?: boolean; children: VNodeChild }) => VNodeChild`,
    example: `import { PyreonUI } from "@pyreon/ui-core"
import { enrichTheme } from "@pyreon/unistyle"

const theme = enrichTheme({ colors: { primary: "#3b82f6" } })

<PyreonUI theme={theme} mode="system">
  <App />
</PyreonUI>

// mode="system" auto-detects OS dark mode via prefers-color-scheme
// inversed flips the resolved mode (light↔dark)`,
    notes: `Unified provider replacing the previous theme / mode / config split (3 nested providers became 1). Accepts an enriched \`theme\` object (merge with defaults via \`enrichTheme()\`), a \`mode\` of \`'light' | 'dark' | 'system'\`, and an optional \`inversed\` flip. When \`mode='system'\`, the provider subscribes to \`matchMedia('(prefers-color-scheme: dark)')\` and re-resolves the mode reactively. Calls \`init()\` internally so consumers don\\'t need to wire it up themselves. Whole-theme swaps (user-preference themes) propagate through the styler resolver and re-resolve CSS without remounting the VNode. Under \`init({ cssVariables: true })\` the provider additionally autogenerates CSS custom properties from the theme (unistyle\\'s \`themeToCssVars\`), injects the \`:root\` block once, provides a var-leaf theme tree, and renders a layout-neutral \`display: contents\` wrapper carrying the mode attribute — a dark/light flip becomes ONE attribute write (zero re-resolution, zero className churn), nested \`inversed\` providers scope via the CSS cascade, and SSR ships the right mode server-rendered. See also: useMode, enrichTheme, init.`,
    mistakes: `- Using \`ThemeProvider\` + \`ModeProvider\` + \`ConfigProvider\` separately — \`PyreonUI\` is the single replacement covering all three
- Flipping \`init({ cssVariables })\` after the first render — the switch is a boot-time contract; theme-resolution caches across the ui-system assume it does not change mid-session
- Expecting \`mode(a, b)\` pairs with NUMBER values to unit-convert under \`cssVariables\` — pairs are emitted verbatim into CSS custom properties; pass unit-complete strings
- Forgetting \`enrichTheme()\` — raw theme objects miss default breakpoints / spacing / unit utilities
- Destructuring \`props\` inside the provider — components run once; destructuring captures values at setup. Read \`props.mode\` lazily inside reactive scopes
- Re-augmenting the \`ThemeDefault\` / \`StylesDefault\` interfaces in your app — \`@pyreon/ui-theme\` already augments them; double-augmentation throws TS2320`,
  },

  'ui-core/useMode': {
    signature: `useMode(): Signal<'light' | 'dark'>`,
    example: `import { useMode } from "@pyreon/ui-core"

const mode = useMode()
// mode() returns "light" or "dark" (resolved, reactive)
// Reflects OS preference when PyreonUI mode="system"`,
    notes: `Returns the currently resolved mode as a reactive signal — \`'light'\` or \`'dark'\`. When the nearest \`PyreonUI\` ancestor uses \`mode='system'\`, the signal reflects the OS preference and updates when the user changes their system setting. When \`inversed\` is true on any ancestor, the mode is flipped before resolution. Component-scoped subscription — readers re-run only when the resolved mode actually changes. See also: PyreonUI.`,
    mistakes: `- Reading \`useMode()\` without calling it — the value is a \`Signal\`; use \`mode()\` to read
- Using \`useMode()\` outside any \`PyreonUI\` ancestor — falls back to a default but loses the reactive system / inversed handling`,
  },

  'ui-core/cssVariablesPrePaintScript': {
    signature: 'cssVariablesPrePaintScript(options?: { attribute?: string; storageKey?: string; fallback?: "light" | "dark" }): string',
    example: `import { cssVariablesPrePaintScript } from '@pyreon/ui-core'

// In your document <head>, before the app bundle:
// <script>{cssVariablesPrePaintScript()}</script>`,
    notes: 'Build the blocking pre-paint script that sets the CSS-variables mode attribute on `document.documentElement` BEFORE first paint — the standard dark-mode FOUC fix for `init({ cssVariables: true })`. Inject the returned string as a synchronous `<script>` in `<head>`: it reads a persisted toggle from localStorage (default key `zero-theme`), else the OS `prefers-color-scheme`, else `fallback`, and writes the attribute at `:root` — exactly where the var rules cascade from and where the ROOT `PyreonUI` writes after hydration, so the two agree and there is no flash for `mode="system"` or a persisted toggle. Self-contained + try/catch-wrapped. (zero apps can use the existing `themeScript` export, which writes the same attribute.) See also: PyreonUI.',
    mistakes: `- Placing it at end-of-body instead of <head> — it must run before first paint; an in-body script can flash on a streamed/large document
- Using it without the ROOT PyreonUI under cssVariables — the script fixes the PRE-hydration paint; the root provider keeps documentElement in sync AFTER hydration. Both are needed
- Expecting it to cover a hardcoded \`mode="dark"\` SSR app with no stored preference — the mode lives only in the app JSX; stamp \`<html data-theme="dark">\` server-side for that case`,
  },
  // <gen-docs:api-reference:end @pyreon/ui-core>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/unistyle
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/unistyle>

  'unistyle/enrichTheme': {
    signature: 'enrichTheme(theme: PartialTheme): Theme',
    example: `import { enrichTheme } from "@pyreon/unistyle"

const theme = enrichTheme({
  colors: { primary: "#3b82f6", secondary: "#6366f1" },
  fonts: { body: "Inter, sans-serif" },
})

// Merges user overrides with default breakpoints, spacing, and units`,
    notes: 'Merge a partial theme with the full default theme (breakpoints, spacing, unit utilities, fallback colors). Always call this before passing a user theme to `PyreonUI` — raw theme objects miss the default breakpoints and spacing scale that the rest of the UI system reads from. Idempotent: enriching an already-enriched theme is a no-op. See also: breakpoints, createMediaQueries.',
    mistakes: `- Passing the raw partial theme to \`<PyreonUI theme={...}>\` without enriching — \`theme.breakpoints\` is undefined and every responsive prop falls back to the desktop value
- Mutating the theme after passing it to \`PyreonUI\` — the styler resolver caches off the theme identity; clone + re-enrich for whole-theme swaps`,
  },

  'unistyle/breakpoints': {
    signature: 'breakpoints(): Breakpoints',
    example: `import { breakpoints } from '@pyreon/unistyle'

const bp = breakpoints()
// { xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536 }`,
    notes: 'Return the default breakpoint set keyed by name (`xs`, `sm`, `md`, `lg`, `xl`, `xxl`) with min-width values in pixels. The same map is folded into `enrichTheme()` output, so most consumers read `theme.breakpoints` rather than calling this directly. Use it when you need the defaults outside a theme context (e.g. building a custom theme programmatically). See also: enrichTheme, createMediaQueries.',
  },

  'unistyle/createMediaQueries': {
    signature: 'createMediaQueries(breakpoints: Breakpoints): Record<string, string>',
    example: `import { createMediaQueries, breakpoints } from '@pyreon/unistyle'

const queries = createMediaQueries(breakpoints())
// { xs: '@media (min-width: 0)', sm: '@media (min-width: 640px)', md: '@media (min-width: 768px)', ... }`,
    notes: 'Build a record of media-query strings keyed by breakpoint name. Each value is a `min-width` query — `xs` is `(min-width: 0)`, `sm` becomes `(min-width: 640px)`, and so on. Used internally by `makeItResponsive()`; expose to consumers when they need to compose custom CSS-in-JS rules outside the responsive-prop pipeline. See also: breakpoints, makeItResponsive.',
  },

  'unistyle/makeItResponsive': {
    signature: 'makeItResponsive<T>(options: { value: T | T[] | Record<string, T>; property: string; theme: Theme }): string',
    example: `import { makeItResponsive } from '@pyreon/unistyle'

makeItResponsive({ value: 16, property: 'padding', theme })
// → 'padding: 16px;'

makeItResponsive({ value: [8, 12, 16], property: 'padding', theme })
// → 'padding: 8px; @media (min-width: 640px) { padding: 12px } @media (min-width: 768px) { padding: 16px }'

makeItResponsive({ value: { xs: 8, md: 16, xl: 24 }, property: 'padding', theme })
// → '@media (min-width: 0) { padding: 8px } @media (min-width: 768px) { padding: 16px } @media (min-width: 1280px) { padding: 24px }'`,
    notes: 'Resolve a responsive prop value to CSS for the current screen. Accepts three input shapes: single value (applies at all breakpoints), mobile-first array `[xs, sm, md, lg]` (each entry maps to the next breakpoint), or breakpoint object `{ xs: ..., md: ..., xl: ... }` (named keys map directly). The output is a CSS string with media queries already embedded; insert into a styled component template literal. See also: createMediaQueries, styles.',
    mistakes: `- Passing CSS-spec property names (\`borderTopWidth\`) — unistyle uses property-first naming (\`borderWidthTop\`); the responsive transformer expects the unistyle convention
- Forgetting to pass an enriched theme — without \`theme.breakpoints\`, the array form falls back to the first value at every breakpoint`,
  },

  'unistyle/styles': {
    signature: 'styles(theme: Theme): string',
    example: `import { styles, enrichTheme } from '@pyreon/unistyle'

const theme = enrichTheme({ colors: { primary: '#3b82f6' } })
const css = styles(theme)
// → ':root { --color-primary: #3b82f6; --spacing-xs: 4px; ... }'`,
    notes: `Generate the CSS string for a complete theme — colors, spacing, fonts, breakpoints, the works. Used to produce the cascade of CSS variables / global declarations that backs every styled component. Most consumers don\\'t call this directly; the \`PyreonUI\` provider invokes it internally on theme mount. See also: enrichTheme, extendCss.`,
  },

  'unistyle/alignContent': {
    signature: `alignContent(options: { alignX?: AlignXKey; alignY?: AlignYKey; direction?: 'row' | 'column' | 'inline' | 'rows' }): string`,
    example: `import { alignContent } from '@pyreon/unistyle'

alignContent({ alignX: 'center', alignY: 'start', direction: 'row' })
// → 'justify-content: center; align-items: flex-start;'

alignContent({ alignX: 'spaceBetween', direction: 'inline' })
// → 'justify-content: space-between;'`,
    notes: `Resolve \`alignX\` / \`alignY\` / \`direction\` shorthand to the matching flex / grid CSS (\`justify-content\`, \`align-items\`). The Element / Row / Column primitives use this internally — it\\'s exposed for custom layout components that want the same alignment semantics. \`direction: "inline"\` maps to \`row\`; \`direction: "rows"\` maps to \`column\`. See also: makeItResponsive.`,
  },

  'unistyle/extendCss': {
    signature: 'extendCss(base: ExtendCss, override?: ExtendCss): ExtendCss',
    example: `import { extendCss } from '@pyreon/unistyle'

const base = { color: 'red', hover: { color: 'darkred' } }
const extended = extendCss(base, { hover: { background: 'pink' } })
// → { color: 'red', hover: { color: 'darkred', background: 'pink' } }`,
    notes: 'Extend a CSS definition (theme block, style descriptor) with overrides — deep-merges nested objects without losing the base. Used by rocketstyle dimension chains to layer dimension-specific CSS over a baseline. The base is not mutated; the result is a new object. See also: styles.',
  },

  'unistyle/stripUnit': {
    signature: 'stripUnit(value: string | number): number',
    example: `import { stripUnit } from '@pyreon/unistyle'

stripUnit('16px')   // → 16
stripUnit('1.5rem') // → 1.5
stripUnit(16)       // → 16`,
    notes: 'Strip the unit suffix from a CSS value and return the numeric part (`"16px"` → `16`, `"1.5rem"` → `1.5`). Returns the input unchanged when already a number. Useful for arithmetic on theme values declared as strings (`"16px"`) without manually parsing. See also: value, values.',
  },

  'unistyle/value': {
    signature: 'value(input: PropertyValue, fallback?: PropertyValue): UnitValue',
    example: `import { value } from '@pyreon/unistyle'

value(16)         // → { value: 16, unit: 'px' }
value('1.5rem')   // → { value: 1.5, unit: 'rem' }
value('50%')      // → { value: 50, unit: '%' }
value('garbage', 0) // → { value: 0, unit: 'px' }`,
    notes: 'Parse and validate a single property value into a `UnitValue` shape (`{ value, unit }`). Accepts numbers (treated as pixels), strings with units (`"16px"`, `"1rem"`, `"50%"`), or objects already in `UnitValue` form. Optional `fallback` is returned when the input is invalid. The companion `values()` does the same over an array. See also: stripUnit, values.',
  },

  'unistyle/themeToCssVars': {
    signature: 'themeToCssVars(theme: object, options?: { prefix?: string; exclude?: readonly string[]; units?: Record<string, CssVarsUnitPolicy>; rootSize?: number }): { vars, css, registry }',
    example: `import { themeToCssVars } from '@pyreon/unistyle'

const theme = { rootSize: 16, spacing: { small: 8 }, ratio: { medium: 1.5 } }
const { vars, css, registry } = themeToCssVars(theme)

vars.spacing.small               // 'var(--px-spacing-small)'
css                              // ':root {\\n  --px-spacing-small: 0.5rem;\\n  --px-ratio-medium: 1.5;\\n}'
registry.get('--px-spacing-small') // '0.5rem'

// proportional sizing is native CSS — no extra machinery:
const width = \`calc(\${vars.spacing.small} * \${vars.ratio.medium})\`
// custom scales opt into conversion per top-level key:
themeToCssVars(theme, { units: { mySizes: 'rem' } })`,
    notes: 'Autogenerate CSS custom properties from a plain theme JSON. Returns `vars` (same-shape tree with every eligible leaf replaced by a `var(--px-…)` reference string — plain strings, so they flow through the entire unistyle value pipeline untouched), `css` (a ready-to-inject `:root { … }` block), and `registry` (`varName → emitted value` for consumers that cannot evaluate `var()`, e.g. document export). Units are baked at EMISSION using the same `value()` conversion the pipeline applies today: `spacing.small: 8` emits `--px-spacing-small: 0.5rem`, so themes stay authored in pixels. Conventional length keys (`spacing`/`fontSize`/`headingSize`/`elementSize`/`borderRadius` → rem, `borderWidth` → px) convert by default; everything else emits verbatim so unitless scales (`lineHeight`, `ratio`, `zIndex`) keep working in `calc()` multiplication. Pure + WeakMap-cached per theme identity — repeated calls return the SAME result object. See also: enrichTheme, value.',
    mistakes: `- Doing JS arithmetic on a var leaf (\`vars.spacing.small * 2\` → NaN) — compose with native CSS calc instead: \`\` \`calc(\${vars.spacing.small} * 2)\` \`\`
- Expecting \`breakpoints\` / \`rootSize\` to be tokenized — they are excluded by design (\`@media\` queries cannot read \`var()\`); JS consumes them at build/render time
- Using a var leaf for \`backgroundImage\` — CSS forbids \`var()\` inside \`url(…)\`; keep image URLs as raw values
- Forgetting to inject \`css\` — the function is pure; nothing lands on the page until the \`:root\` block reaches a style sink (\`<style>\` tag, \`sheet.injectRules\`, \`createGlobalStyle\`)
- Re-creating the theme object per render — results are WeakMap-cached by theme IDENTITY; a fresh object every call re-walks the tree and defeats downstream identity-keyed caches
- Assuming a custom top-level key converts to rem — only the conventional length keys convert by default; declare \`units: { myScale: "rem" }\` for custom scales`,
  },

  'unistyle/resolveCssVarReferences': {
    signature: 'resolveCssVarReferences<T>(input: T, registry: ReadonlyMap<string, string>): T',
    example: `import { resolveCssVarReferences, themeToCssVars } from '@pyreon/unistyle'

const { registry } = themeToCssVars(theme)
resolveCssVarReferences('var(--px-spacing-small)', registry)           // '0.5rem'
resolveCssVarReferences('calc(var(--px-spacing-small) * 2)', registry) // 'calc(0.5rem * 2)'
resolveCssVarReferences('var(--px-missing, 1rem)', registry)           // '1rem'`,
    notes: 'Resolve `var(--…)` references in a string back to their raw emitted values using a `themeToCssVars` registry — for consumers that cannot evaluate CSS custom properties (document export to PDF/DOCX/email, devtools, non-CSS render targets). Inline fallbacks (`var(--x, 1rem)`) apply when the name is unknown; unresolvable references stay verbatim; non-strings pass through untouched. `calc()` expressions are inlined, NOT evaluated. See also: themeToCssVars.',
    mistakes: `- Expecting calc() to be EVALUATED — only the var() references inside are inlined; a non-CSS target needing one number must evaluate the calc itself or avoid calc-composed values
- Passing a registry from a DIFFERENT theme identity — registries are per themeToCssVars(theme) result; mixed registries resolve to wrong values`,
  },
  // <gen-docs:api-reference:end @pyreon/unistyle>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/styler
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/styler>

  'styler/styled': {
    signature: 'styled: ((tag: Tag, options?: StyledOptions) => TagTemplateFn) & { div: TagTemplateFn; span: TagTemplateFn; /* …all HTML tags via Proxy */ }',
    example: `import { styled } from "@pyreon/styler"

const Button = styled("button")\`
  background: \${(p) => p.theme.colors.primary};
  padding: \${(p) => (p.$compact ? "4px" : "12px")};
\`
// <Button $compact onClick={...}>Go</Button>  — $compact not forwarded to <button>`,
    notes: `Component factory. \`styled('div')\`, \`styled(MyComp)\`, and \`styled.div\` (Proxy sugar) are all tagged templates returning a \`ComponentFn\` that injects a generated class. Tagged-template interpolations are called with the live \`props\` object (theme included), so a function interpolation reading \`p.theme.color\` / signal-driven values works and puts the component on the dynamic resolve path. Supports the polymorphic \`as\` prop and \`$\`-prefixed TRANSIENT props (consumed by styles, NOT forwarded to the DOM). Per-definition caching keys generated classes so repeat mounts skip re-resolution. See also: css, useCSS, useTheme.`,
    mistakes: `- Expecting \`$\`-prefixed props to reach the DOM — they are transient by design (consumed by the template, stripped before forwarding). Use a non-\`$\` name if the attribute must land on the element
- Destructuring \`props\` in the interpolation (\`\${({ theme }) => …}\`) and being surprised it does not update on a whole-theme swap — read \`props.theme\` lazily; the theme context is reactive and the styled resolver re-runs on swap
- Passing a resolved value where a function interpolation is needed for reactivity — \`\${signal()}\` snapshots once at definition; use \`\${() => signal()}\` (or \`\${(p) => p.x}\`) to stay on the dynamic path
- Using \`styled.div\` and expecting a different identity per call — the Proxy returns the same tag template fn shape; per-definition caches key on the template, not the call site`,
  },

  'styler/css': {
    signature: 'css(strings: TemplateStringsArray, ...values: Interpolation[]): CSSResult',
    example: `import { css, useCSS } from "@pyreon/styler"

const card = css\`border: 1px solid #ddd; padding: 16px;\`
function Card(props) {
  const cls = useCSS(card)
  return <div class={cls}>{props.children}</div>
}`,
    notes: 'Tagged-template that returns a LAZY `CSSResult` — it is NOT a class name or a CSS string until resolved by `styled()`, `useCSS()`, or composition into another template. Compose reusable fragments with it (assign a `css` result to `const base`, then interpolate `base` inside a `styled` template). Resolution is deferred so it can read the props/theme of the consuming component at use time. See also: styled, useCSS, keyframes.',
    mistakes: `- Treating the \`css\` tagged-template return value as a string / class name — it is a lazy \`CSSResult\`; interpolating it into text (e.g. \`class={card}\`) renders \`[object Object]\`. Resolve via \`useCSS\` or embed in a \`styled\` template
- Reading props/theme at \`css\` call time — the template is resolved later; put dynamic bits in function interpolations so they read the LIVE props at use`,
  },

  'styler/keyframes': {
    signature: 'keyframes(strings: TemplateStringsArray, ...values: Interpolation[]): KeyframesResult',
    example: `import { keyframes, styled } from "@pyreon/styler"

const spin = keyframes\`from { transform: rotate(0) } to { transform: rotate(360deg) }\`
const Spinner = styled("div")\`animation: \${spin} 1s linear infinite;\``,
    notes: 'Tagged-template returning a `KeyframesResult` whose string form is the GENERATED, content-hashed `@keyframes` animation NAME. Reference it inside a `css` / `styled` template as the `animation-name` value; the `@keyframes` rule is injected (deduped via FNV-1a) on first use. See also: css, styled.',
    mistakes: `- Expecting a CSS class — \`keyframes\` yields an animation-NAME token, used as the \`animation\` / \`animation-name\` value, not a class applied to an element
- Defining \`keyframes\` inside the render body per mount — define once at module scope so the hashed rule is injected once and reused`,
  },

  'styler/createGlobalStyle': {
    signature: 'createGlobalStyle(strings: TemplateStringsArray, ...values: Interpolation[]): ComponentFn',
    example: `import { createGlobalStyle } from "@pyreon/styler"

const GlobalReset = createGlobalStyle\`
  *, *::before, *::after { box-sizing: border-box }
  body { margin: 0; font-family: \${(p) => p.theme.fonts.body}; }
\`
// render <GlobalReset /> once at the app root`,
    notes: 'Returns a `ComponentFn` that injects GLOBAL CSS (resets, `:root` tokens, body styles) when MOUNTED — it is not a side-effecting call. Render the returned component once near the app root; unmounting removes the global rule. Function interpolations make the global block dynamic (re-resolves on prop/theme change). See also: styled, css.',
    mistakes: `- Calling \`createGlobalStyle\` (the tagged template) and expecting the CSS to inject — nothing happens until the returned component is RENDERED. Mount \`<GlobalReset />\` once near the root
- Mounting it in many components — duplicates the global rule lifetime management; mount exactly once`,
  },

  'styler/useCSS': {
    signature: 'useCSS(template: CSSResult, props?: Record<string, any>, boost?: boolean): string',
    example: `import { css, useCSS } from "@pyreon/styler"

const box = css\`color: \${(p) => p.danger ? "red" : "inherit"};\`
function Box(props) {
  return <div class={useCSS(box, props)}>{props.children}</div>
}`,
    notes: 'Resolves a `CSSResult` (from the `css` tagged template) to an injected class-name string inside a component. Pass `props` so function interpolations in the template read live values; `boost` opts into a faster cache path for hot, stable templates. The returned class is deduped/hashed by the active `StyleSheet`. See also: css, styled.',
    mistakes: `- Forgetting to pass \`props\` when the template has function interpolations — they then resolve against an empty object and the dynamic values are lost
- Calling \`useCSS\` outside a component setup — it depends on the active sheet/theme context like any hook`,
  },

  'styler/useTheme': {
    signature: 'useTheme<T extends object = Theme>(): T',
    example: `import { useTheme } from "@pyreon/styler"

function Badge() {
  const t = useTheme()
  return <span style={{ color: t.colors.primary }}>{/* … */}</span>
}`,
    notes: 'Returns the current theme as a SNAPSHOT at call time. `ThemeContext` is a REACTIVE context — `useTheme()` reads it once, so the returned object is static unless the read happens inside a reactive scope. For values that must track whole-theme swaps inside an `effect` / `computed`, use `useThemeAccessor()` instead. See also: useThemeAccessor, ThemeProvider, styled.',
    mistakes: `- Destructuring \`const { colors } = useTheme()\` and expecting it to update on a user-preference theme swap — the snapshot is captured once. Use \`useThemeAccessor()\` and read inside the reactive scope, or rely on \`styled\` templates (their resolver tracks the theme)
- Calling \`useTheme()\` at module scope — it must run during component setup where the context is available`,
  },

  'styler/useThemeAccessor': {
    signature: 'useThemeAccessor<T extends object = Theme>(): () => T',
    example: `import { useThemeAccessor } from "@pyreon/styler"
import { effect } from "@pyreon/reactivity"

const theme = useThemeAccessor()
effect(() => applyChartPalette(theme().colors)) // re-runs on theme swap`,
    notes: 'Returns the raw `() => T` theme accessor (not a snapshot). Call it inside an `effect` / `computed` / JSX thunk so the read TRACKS the reactive theme context — whole-theme swaps (user-preference themes) then re-run the consumer without a remount. This is the escape hatch `styled()` itself uses internally. See also: useTheme, ThemeProvider.',
    mistakes: `- Calling the accessor once at setup and caching the result — that defeats the point; call it INSIDE the reactive scope every time so the dependency is tracked
- Reaching for this when a \`styled\` template would do — the template resolver already tracks the theme; use the accessor only for imperative/non-CSS theme reads`,
  },

  'styler/ThemeProvider': {
    signature: 'ThemeProvider(props: { theme: Theme | ((parent: Theme) => Theme); children?: VNodeChild }): VNodeChild',
    example: `import { ThemeProvider } from "@pyreon/styler"

<ThemeProvider theme={{ colors: { primary: "#06f" } }}>
  <App />
</ThemeProvider>`,
    notes: 'Provides a theme to the reactive `ThemeContext`. Nested providers compose — a function `theme` receives the parent theme so subtrees can extend rather than replace. Because the context is reactive, swapping the `theme` prop re-resolves every `styled` / `useCSS` consumer below without remounting the tree. Marked `nativeCompat` so it works inside `@pyreon/{react,preact,vue,solid}-compat` apps. See also: useTheme, useThemeAccessor, ThemeContext.',
    mistakes: `- Replacing the whole theme in a nested provider when you meant to extend — pass \`theme={(parent) => ({ ...parent, colors: { ...parent.colors, accent: "#0a0" } })}\`
- Expecting most apps to mount this directly — \`<PyreonUI>\` wraps it; use \`ThemeProvider\` standalone only outside the \`@pyreon/ui-core\` provider`,
  },

  'styler/ThemeContext': {
    signature: 'ThemeContext: ReactiveContext<Theme>',
    example: `import { ThemeContext } from "@pyreon/styler"
import { useContext } from "@pyreon/core"

const themeAccessor = useContext(ThemeContext) // () => Theme`,
    notes: 'The reactive context backing the theme. Created via `createReactiveContext<Theme>` — `useContext(ThemeContext)` returns a `() => Theme` accessor (which is what `useTheme()` / `useThemeAccessor()` wrap). Exposed for advanced consumers building their own theme-aware primitives; prefer the hooks for app code. See also: useTheme, useThemeAccessor, ThemeProvider.',
    mistakes: '- Treating `useContext(ThemeContext)` as the theme object — it is the ACCESSOR `() => Theme` (reactive context). Call it to read',
  },

  'styler/createSheet': {
    signature: 'createSheet(options?: StyleSheetOptions): StyleSheet',
    example: `import { createSheet } from "@pyreon/styler"

const shadowSheet = createSheet({ /* StyleSheetOptions */ })`,
    notes: 'Creates an ISOLATED `StyleSheet` instance (its own FNV-1a dedup cache + rule registry) instead of the shared singleton `sheet`. Use for shadow-DOM roots, multi-window/iframe rendering, or test isolation where one request/realm must not share the global dedup cache. Most apps never need this — the singleton is correct for a single document. See also: StyleSheet, sheet.',
    mistakes: `- Creating a fresh sheet per render — defeats dedup; create once per realm/root and reuse
- Mixing the singleton and an isolated sheet for the same DOM — classes from one will not be deduped against the other; pick one per document root`,
  },

  'styler/StyleSheet': {
    signature: 'class StyleSheet { constructor(options?: StyleSheetOptions) }',
    example: `import { StyleSheet } from "@pyreon/styler"

const s = new StyleSheet({ /* options */ })`,
    notes: 'The CSS injection engine: FNV-1a content hashing, a dedup cache (identical CSS → one rule), and SSR support (collect rules to a string on the server, hydrate on the client). `sheet` is the process singleton; `createSheet()` wraps `new StyleSheet()`. Direct instantiation is for custom integrations (server frameworks collecting critical CSS, test harnesses). See also: createSheet, sheet.',
    mistakes: '- Instantiating `new StyleSheet()` in app code — use the exported `sheet` singleton (or `createSheet()` for explicit isolation); a stray instance will not be where `styled()` injects',
  },

  'styler/sheet': {
    signature: 'sheet: StyleSheet',
    example: `import { sheet } from "@pyreon/styler"
// SSR: render the app, then read the collected rules off \`sheet\` for the <head>`,
    notes: 'The process-wide singleton `StyleSheet` that `styled()` / `css` / `keyframes` / `createGlobalStyle` inject into by default. Read it for SSR critical-CSS extraction or debugging the rule registry; do not mutate it directly. See also: StyleSheet, createSheet.',
  },

  'styler/resolve': {
    signature: 'resolve(strings: TemplateStringsArray, values: Interpolation[], props: Record<string, any>): string',
    example: `import { resolve } from "@pyreon/styler"

const cssText = resolve(strings, values, { theme, $compact: true })`,
    notes: 'Low-level: resolve a tagged-template (strings + interpolations) against a `props` object into a final CSS string (function interpolations invoked with `props`). The engine `styled()` / `useCSS` build on. Direct use is for custom CSS-in-JS layered on top of styler; app code should prefer `styled` / `css`. See also: normalizeCSS, resolveValue, styled.',
  },

  'styler/normalizeCSS': {
    signature: 'normalizeCSS(css: string): string',
    example: `import { normalizeCSS } from "@pyreon/styler"

normalizeCSS("color:  red ;") // canonical form, dedup-stable`,
    notes: 'Normalizes a raw CSS string (whitespace/format canonicalization) so identical-intent CSS hashes to the same FNV-1a key and dedupes. Memoized via an internal cache — call `clearNormCache()` to drop it (tests / long-lived processes). See also: clearNormCache, resolve.',
  },

  'styler/resolveValue': {
    signature: 'resolveValue(value: Interpolation, props: Record<string, any>): string',
    example: `import { resolveValue } from "@pyreon/styler"

resolveValue((p) => p.theme.colors.primary, { theme })`,
    notes: 'Resolves a SINGLE interpolation against `props`: invokes function interpolations with `props`, flattens nested `CSSResult` / `KeyframesResult`, and stringifies the result. The per-interpolation primitive `resolve()` loops over. See also: resolve, isDynamic.',
  },

  'styler/clearNormCache': {
    signature: 'clearNormCache(): void',
    example: `import { clearNormCache } from "@pyreon/styler"

afterEach(() => clearNormCache())`,
    notes: 'Clears the `normalizeCSS` memo cache. Needed in test suites that assert on injection counts / sheet contents across cases, and in long-lived processes that churn unique CSS and want to bound the cache. No effect on already-injected rules. See also: normalizeCSS.',
  },

  'styler/buildProps': {
    signature: 'buildProps(rawProps: Record<string, any>, generatedCls: string, isDOM: boolean, customFilter?: (prop: string) => boolean): Record<string, any>',
    example: `import { buildProps } from "@pyreon/styler"

const forwarded = buildProps(rawProps, "sc-abc123", true)`,
    notes: 'Builds the final prop object forwarded to the rendered element: merges the generated class, drops `$`-transient props, and (for DOM targets) filters non-DOM attributes — `customFilter` overrides per-component. **Copies DESCRIPTORS, not values**, so compiler-emitted reactive (`_rp` getter) props survive forwarding instead of collapsing to a static snapshot. See also: filterProps, styled.',
    mistakes: `- Re-implementing prop forwarding with \`result[key] = source[key]\` — that fires getters and freezes reactive props to a one-time value. styler uses descriptor copy specifically to preserve the \`_rp\` getter contract; any custom forwarder must do the same
- Passing \`isDOM: true\` for a component target — DOM-attr filtering will strip props the wrapped component legitimately needs`,
  },

  'styler/filterProps': {
    signature: 'filterProps(props: Record<string, unknown>): Record<string, unknown>',
    example: `import { filterProps } from "@pyreon/styler"

const domSafe = filterProps(props)`,
    notes: 'Returns a copy of `props` with `$`-transient and known non-DOM props removed — the DOM-safety filter `buildProps` applies for element targets. Exposed for consumers doing their own forwarding who still want the styler allowlist semantics. Descriptor-preserving, same reactive-prop rationale as `buildProps`. See also: buildProps.',
  },

  'styler/isDynamic': {
    signature: 'isDynamic(v: Interpolation): boolean',
    example: `import { isDynamic } from "@pyreon/styler"

isDynamic((p) => p.color) // true → dynamic path
isDynamic("12px")          // false → static, cached`,
    notes: 'True when an interpolation is a function (signal accessor / props reader) — i.e. the styled component must take the DYNAMIC resolve path (re-resolve per prop/theme change) rather than the static cached path. Used internally to decide the resolver branch; exported for tooling that mirrors that decision. See also: resolve, styled.',
  },
  // <gen-docs:api-reference:end @pyreon/styler>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/elements
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/elements>

  'elements/Element': {
    signature: 'Element(props: ElementProps): VNodeChild',
    example: `import { Element } from "@pyreon/elements"

<Element tag="section" direction="rows" gap="md" alignX="center">
  <Header />
  <Body />
</Element>`,
    notes: 'The responsive flexbox block primitive every layout-bearing component renders through. Layout props live here (NOT in a styler `.theme()`): `direction` (`inline` | `rows` | `reverseInline` | `reverseRows` — note `row` is INVALID), `alignX`, `alignY`, `gap`, `block`, plus `beforeContent` / `afterContent` slot wrappers and `equalBeforeAfter` (equalizes the slot widths on mount AND keeps them equal via ResizeObserver). The 2026-Q2 simple-path fast path inlines the Wrapper for non-compound, non-needsFix tags: the rendered VNode then exposes the HTML tag as `props.as` and layout under `props.$element.{direction,alignX,alignY,block,equalCols,extraStyles}` rather than flat props (styled-components consumers see no change since `as` is the canonical tag selector). See also: Text, List, Portal.',
    mistakes: `- Using \`direction="row"\` — invalid; the values are \`inline\` / \`rows\` / \`reverseInline\` / \`reverseRows\`
- Putting layout props in a styler \`.theme()\` callback — \`direction\` / \`alignX\` / \`alignY\` / \`gap\` / \`block\` are Element ATTRS, not CSS; theme is for colors / spacing / borders
- Reading flat \`props.direction\` on a simple-path Element in a test or styled consumer — the fast path moves layout to \`props.$element.*\` and the tag to \`props.as\`; read both shapes via a helper
- Passing children to a void \`tag\` (\`hr\` / \`img\` / \`br\` / \`input\`) — Element correctly drops them; do not rely on a children slot for void tags
- Relying on \`equalBeforeAfter\` measuring async slot content where \`ResizeObserver\` is undefined (older runtimes / SSR) — it falls back to the one-shot mount measurement there`,
  },

  'elements/Text': {
    signature: 'Text(props: TextProps): VNodeChild',
    example: `import { Text } from "@pyreon/elements"

<Text tag="span">Inline label</Text>`,
    notes: 'Inline typography primitive — the text counterpart to `Element`. Carries typography props and renders an inline element; use it for runs of text that need the design-system typography contract rather than a raw `<span>`. Like `Element`, visual styling belongs in the styler/rocketstyle layer; `Text` owns the inline-flow structure. See also: Element.',
  },

  'elements/List': {
    signature: 'List(props: ListProps): VNodeChild',
    example: `import { List } from "@pyreon/elements"

<List tag="ul" data={items()} component={(item) => <li>{item.name}</li>} />`,
    notes: 'A flowing-children container (`ul` / `ol` / `dl` / custom) built on the Iterator data API. Render children directly OR drive it with `data` + a `component` renderer. Inherits Iterator’s four typed overloads (Simple / Object / Children / Loose) and additionally blocks Element-only `label` / `content` props at the type level. See also: Iterator, Element.',
    mistakes: `- Mixing primitive and object entries in \`data\` (\`[1, {id:1}, null]\`) — primitive arrays and object arrays are mutually exclusive iteration modes; the typed overloads reject the mix for direct callers
- Passing \`valueName\` with an object-array \`data\` — \`valueName\` is a Simple-mode (primitive) prop only
- Passing \`children\` AND \`data\`/\`component\` — Children mode and Object mode are distinct overloads; pick one`,
  },

  'elements/Overlay': {
    signature: 'Overlay(props: OverlayProps): VNodeChild',
    example: `import { Overlay } from "@pyreon/elements"

<Overlay isOpen={open()} type="dropdown" align="bottom" onClose={() => open.set(false)}>
  <Menu />
</Overlay>`,
    notes: 'A positioned layer (dropdown / modal / tooltip / popover) with an optional backdrop, driven internally by `useOverlay`. It handles viewport flipping, ESC-to-close, click-outside, scroll tracking, and hover delay — do NOT reimplement any of that in a primitive; compose `Overlay` (or `useOverlay`) instead. Renders through `Portal` so the layer escapes overflow/stacking contexts. See also: useOverlay, OverlayProvider, Portal.',
    mistakes: `- Hand-rolling positioning / flip / click-outside / ESC logic in a tooltip or dropdown primitive — \`useOverlay\` already owns all of it; reimplementing drifts from the shared behavior
- Reading the rendered overlay as \`document.body.firstChild\` — it renders through \`Portal\` into a per-instance wrapper; traverse the wrapper, not body’s direct child`,
  },

  'elements/useOverlay': {
    signature: 'useOverlay(props?: Partial<UseOverlayProps>): { isOpen, open, close, toggle, triggerProps, overlayProps, /* … */ }',
    example: `import { useOverlay } from "@pyreon/elements"

const o = useOverlay({ openOn: "hover", type: "tooltip", hoverDelay: 150 })
// spread o.triggerProps on the anchor, o.overlayProps on the floating layer`,
    notes: 'The positioning + interaction engine `Overlay` is built on, exposed for headless consumers. Options: `openOn` / `closeOn` (`click` | `hover` | …), `type` (`dropdown` | `modal` | …), `position` (`fixed` | …), `align` + `alignX` / `alignY` + `offsetX` / `offsetY`, `closeOnEsc`, `hoverDelay`, `throttleDelay`, `parentContainer`, `disabled`, `onOpen` / `onClose`. SSR-safe: the internal positioning helpers early-return under no-`window` so the contract is documented at the call site rather than crashing on the server. See also: Overlay, OverlayProvider.',
    mistakes: `- Passing \`align\` as a function accessor — it is a value option, not a signal accessor; let the compiler wrap reactive values
- Expecting positioning to run during SSR — the helpers are guarded and no-op without \`window\`; positioning happens post-mount on the client
- Reaching for \`addEventListener\` for outside-click / scroll instead of letting \`useOverlay\` own the listener lifecycle — it self-cleans on unmount`,
  },

  'elements/OverlayProvider': {
    signature: 'OverlayProvider(props: { children?: VNodeChild }): VNodeChild',
    example: `import { OverlayProvider } from "@pyreon/elements"

<OverlayProvider>
  <App />
</OverlayProvider>`,
    notes: 'Context provider that lets nested overlays coordinate (shared root, stacking, outside-click scoping). `useOverlay` reads it via `useOverlayContext`. Marked `nativeCompat` so it works correctly inside `@pyreon/{react,preact,vue,solid}-compat` apps (its `provide()` runs in Pyreon’s setup frame, not the compat wrapper accessor). See also: useOverlay, Overlay.',
  },

  'elements/Portal': {
    signature: 'Portal(props: PortalProps): VNodeChild',
    example: `import { Portal } from "@pyreon/elements"

<Portal>
  <Modal />
</Portal>`,
    notes: 'Renders children OUTSIDE the parent DOM hierarchy — into a PER-INSTANCE wrapper element (default `<div>`, configurable via `tag`) created inside a `DOMLocation` (default `document.body`). Multiple Portals sharing a location each get their OWN wrapper so children never intermingle, which gives cleanup isolation when several modals / tooltips share a portal root. See also: Overlay, Element.',
    mistakes: `- Asserting \`document.body.firstChild === modalRoot\` in a test — the Portal nests one level deeper; query the per-instance wrapper (\`document.body.querySelector("[data-…]").parentElement\`) instead
- Assuming all Portals share one container — each instance gets its own wrapper inside the DOMLocation; they do not merge`,
  },

  'elements/Iterator': {
    signature: 'Iterator<T>(props: IteratorProps<T>): VNodeChild',
    example: `import Iterator from "@pyreon/elements/helpers/Iterator"

<Iterator data={users()} component={(u) => <Row user={u} />} />`,
    notes: 'The data-iteration helper backing `List` (default export of `helpers/Iterator`). FOUR typed overloads keep iteration modes honest: `SimpleProps<T>` (primitive arrays — `valueName` allowed), `ObjectProps<T>` (object arrays — `valueName` and `children` FORBIDDEN), `ChildrenProps` (no data/component, only children), and a `LooseProps` fallback that exists so rocketstyle/attrs forwarding patterns (`<Iterator {...wrapperProps} />`) bind without a per-call-site overload error. The discriminator picks the overload via `unknown extends T ? Loose : T extends SimpleValue ? Simple : T extends ObjectValue ? Object : Children`. See also: List.',
    mistakes: `- Mixed-shape \`data\` (\`[1, {id:1}, null]\`) — primitive and object iteration are mutually exclusive; the narrow overloads reject it (the Loose fallback only catches forwarding-pattern shapes)
- \`valueName\` with object-array \`data\` — Simple-mode only; ObjectProps forbids it
- \`children\` together with \`data\`/\`component\` — Children and Object are distinct overloads; the runtime picks the mode by which props are populated, but the types steer you to one`,
  },

  'elements/Util': {
    signature: 'Util(props: UtilProps): VNodeChild',
    example: `import { Util } from "@pyreon/elements"

<Util>{children}</Util>`,
    notes: 'A bare utility primitive — the minimal structural wrapper when you need an Element-family node without layout semantics (no flex direction / align). Use it for thin passthrough containers where `Element` would impose unwanted flex defaults. See also: Element.',
  },

  'elements/Provider': {
    signature: 'Provider(props: { children?: VNodeChild }): VNodeChild',
    example: 'import { Provider } from "@pyreon/elements"',
    notes: 'Re-exported from `@pyreon/unistyle` for convenience (responsive/breakpoint context). Most apps mount the unified `<PyreonUI>` from `@pyreon/ui-core` instead, which wires this internally — reach for the bare `Provider` only outside the `ui-core` provider tree. See also: Element.',
  },
  // <gen-docs:api-reference:end @pyreon/elements>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/storybook
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/rx
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/rx>

  'rx/rx': {
    signature: 'Readonly<{ filter, map, sortBy, groupBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample, count, sum, min, max, average, reduce, every, some, distinct, scan, combine, zip, merge, debounce, throttle, search, pipe }>',
    example: `const active = rx.filter(users, u => u.active)      // Computed<User[]>
const sorted = rx.sortBy(active, 'name')             // Computed<User[]>
const total = rx.sum(users, u => u.age)              // Computed<number>
const grouped = rx.groupBy(users, u => u.department) // Computed<Record<string, User[]>>`,
    notes: 'Namespaced object exposing all 37 reactive transform functions plus `pipe`. Use `rx.filter(...)` for dot-notation style, or destructure individual functions for tree-shaking. Every function is overloaded: `Signal<T[]>` input produces `Computed<T[]>` that auto-tracks, plain `T[]` input produces a static result. See also: pipe, filter, sortBy, groupBy.',
    mistakes: `- Expecting \`rx.filter(signal, pred)\` to return a plain array — signal inputs always produce \`Computed\` outputs. Call the result to read: \`active()\`
- Passing a RESOLVED value where a signal was meant — \`rx.filter(items(), pred)\` (note the \`()\`) takes the static path and never updates when \`items\` changes. Pass \`items\` (the signal), not \`items()\`. A spike in the \`rx.transform.raw\` perf counter is exactly this mistake
- Assuming signal detection inspects the value — it is purely \`typeof source === "function"\`. Any function (an accessor wrapper \`() => items()\`, a bound method, a getter) is treated as a reactive source and invoked inside a computed; only non-function inputs (arrays) take the static path
- Reading a \`Computed\` output once and caching the array — it is reactive; re-read it (or read inside an \`effect\`/JSX) so you see updates`,
  },

  'rx/pipe': {
    signature: '<T>(source: Signal<T[]> | T[], ...operators: Operator[]) => Computed<T[]> | T[]',
    example: `const result = pipe(
  users,
  filter(u => u.active),
  sortBy('name'),
  map(u => u.name),
  take(10),
)
// Computed<string[]> when users is a signal`,
    notes: 'Compose transforms left-to-right. Each operator receives the output of the previous one. Signal source produces a reactive `Computed` that re-derives when the source changes. Use curried forms of individual functions as operators: `filter(pred)`, `sortBy(key)`, `map(fn)`, etc. See also: rx, filter, map, sortBy.',
    mistakes: `- Calling the non-curried form inside pipe — \`pipe(users, filter(users, pred))\` is wrong; use the curried form: \`pipe(users, filter(pred))\`
- Expecting \`pipe(arr, ...)\` (plain array source) to be reactive — only a signal source produces a \`Computed\`; a plain array gives a one-shot plain result
- Reading the pipe result as an array when the source is a signal — it is a \`Computed\`; call it: \`result()\`
- Putting a timing operator (\`debounce\`/\`throttle\`) in a \`pipe\` chain — those take a single \`Signal<T>\` and return a signal, they are not curried collection operators and do not compose in \`pipe\``,
  },

  'rx/filter': {
    signature: '<T>(source: Signal<T[]> | T[], predicate: (item: T) => boolean) => Computed<T[]> | T[]  // curried: filter(pred)',
    example: `const evens = filter(items, n => n % 2 === 0)  // Computed<number[]> (items is a signal)
const result = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5] (plain)
pipe(items, filter(n => n > 3))                      // curried form in a pipe`,
    notes: 'Filter items by predicate. Signal input produces a reactive `Computed<T[]>` that re-evaluates when the source signal changes; plain array input returns a plain array. Curried form `filter(pred)` is for `pipe()`. Curry vs direct is detected by argument count, so a single-argument call is always the curried operator. See also: rx, pipe, map.',
    mistakes: `- Calling \`filter(pred)\` directly expecting a result — a single function arg is the CURRIED operator (returns a function), not a filtered array. Use \`filter(source, pred)\` for the direct form
- Passing \`items()\` instead of \`items\` — the resolved array takes the static path; the result never updates`,
  },

  'rx/map': {
    signature: '<T, U>(source: Signal<T[]> | T[], fn: (item: T, index: number) => U) => Computed<U[]> | U[]  // curried: map(fn)',
    example: `const names = map(users, u => u.name)            // Computed<string[]>
pipe(users, filter(u => u.active), map(u => u.name)) // curried in pipe`,
    notes: 'Transform each item. Signal input → reactive `Computed<U[]>`; plain array → plain array. The mapper receives `(item, index)`. Curried form `map(fn)` composes in `pipe()`. See also: rx, filter, pipe.',
    mistakes: `- Expecting this to be the JSX list renderer — \`rx.map\` derives a reactive array; to render a keyed list use \`<For each={…} by={…}>\`, not \`rx.map\` output spread into JSX
- Relying on referential stability of mapped objects — every re-derive produces fresh objects; key lists by a stable id, not object identity`,
  },

  'rx/sortBy': {
    signature: '<T>(source: Signal<T[]> | T[], key: keyof T | ((item: T) => unknown)) => Computed<T[]> | T[]',
    example: `const byName = sortBy(users, 'name')          // Computed<User[]>, ascending
const byAge = sortBy(users, u => u.age)        // key-selector form
const desc = sortBy(users, 'age')              // then reverse() for descending`,
    notes: 'Sort by a key or key-selector. **Non-mutating** — copies via `[...arr]` before sorting, so the source array/signal is never mutated (unlike native `Array.prototype.sort`). Signal input → reactive `Computed<T[]>`. Comparison is a plain `a < b ? -1 : a > b ? 1 : 0` — ascending only, no direction option, no locale/`Intl` collation. See also: rx, pipe, groupBy.',
    mistakes: `- Expecting it to mutate / sort in place like \`Array.sort\` — it returns a NEW sorted array; the source is untouched
- Expecting a direction option — there is none. Always ascending; compose \`reverse()\` for descending
- Sorting numeric STRINGS expecting numeric order — comparison is \`<\`/\`>\`, so \`"10" < "2"\` lexically. Use a numeric key-selector (\`u => Number(u.id)\`) when the field is a numeric string
- Expecting locale-aware ordering — no \`Intl.Collator\`; accented / non-ASCII ordering is codepoint order, not locale order`,
  },

  'rx/groupBy': {
    signature: '<T>(source: Signal<T[]> | T[], key: keyof T | ((item: T) => unknown)) => Computed<Record<string, T[]>> | Record<string, T[]>',
    example: `const byDept = groupBy(users, u => u.department) // Computed<Record<string, User[]>>
for (const [dept, members] of Object.entries(byDept())) { … }`,
    notes: 'Group items into buckets by key. **Returns a plain `Record<string, T[]>`, NOT a `Map`.** Keys are coerced with `String(...)`, so numeric / boolean group keys become strings (`1` → `"1"`, `true` → `"true"`). Signal input → reactive `Computed<Record<string, T[]>>`. Insertion order within each bucket is preserved. See also: rx, sortBy, keyBy.',
    mistakes: `- Treating the result as a \`Map\` — it is a plain object. Use \`Object.entries()\` / \`result[key]\`, not \`.get()\` / \`.has()\` / \`.size\`
- Expecting original key types — every key is \`String()\`-coerced; group under \`"1"\`, not \`1\`, and \`"true"\`, not \`true\`
- Iterating with \`for...in\` and not guarding inherited keys — prefer \`Object.entries()\` / \`Object.keys()\`
- Assuming a missing group is \`[]\` — \`result[unknownKey]\` is \`undefined\`, not an empty array; default it explicitly`,
  },

  'rx/search': {
    signature: '<T>(source: Signal<T[]> | T[], query: Signal<string> | string, keys: (keyof T)[]) => Computed<T[]> | T[]',
    example: `const q = signal('')
const results = search(users, q, ['name', 'email'])  // Computed<User[]>
// substring, case-insensitive: q="ali" matches "Alice"`,
    notes: 'Case-insensitive **substring** filter across the named fields. The third argument is a POSITIONAL `keys` array — `search(users, q, ["name", "email"])` — NOT a `{ keys }` options object. Only `string`-typed fields match (non-string values are skipped). Reactive when EITHER `source` OR `query` is a signal. Empty/whitespace query returns the full list. See also: rx, filter.',
    mistakes: `- Passing \`{ keys: [...] }\` — the signature is positional: \`search(source, query, ["name","email"])\`. An options object is treated as the keys array and matches nothing
- Expecting fuzzy / typo-tolerant matching — it is plain \`String.includes\` after \`toLowerCase().trim()\`, not fuzzy. "alce" will NOT match "Alice"
- Searching a non-string field (number/date) — only \`typeof val === "string"\` fields are tested; numeric columns never match. Pre-stringify if you need them searchable
- Passing \`query\` as a resolved string when you want reactivity — pass the \`Signal<string>\` so the result re-derives as the user types; a plain string is matched once`,
  },

  'rx/debounce': {
    signature: '<T>(source: Signal<T>, ms: number) => ReadableSignal<T> & { dispose: () => void }',
    example: `const raw = signal('')
const debounced = debounce(raw, 300)   // ReadableSignal<string> & { dispose }
effect(() => fetchResults(debounced())) // fires 300ms after typing stops
onCleanup(() => debounced.dispose())    // REQUIRED — not auto-cleaned`,
    notes: 'Debounce a SIGNAL value (the whole emitted value, not array items — it is not a collection transform and does not curry into `pipe`). Returns a new readable signal that settles `ms` after the source stops changing, plus a `dispose()` that tears down its internal effect + timer. Seeds synchronously with the current `source()` value. See also: throttle, rx.',
    mistakes: `- Not calling \`dispose()\` — each \`debounce\`/\`throttle\` owns a live effect + timer that are NOT auto-cleaned. Leaks across navigations; a growing \`rx.debounce.create\` perf counter is exactly this
- Putting it in a \`pipe()\` chain — \`debounce\` takes a single \`Signal<T>\` and returns a signal; it is not a curried collection operator
- Expecting array-item debounce — \`debounce(usersSignal, 300)\` debounces the whole array emission, not individual rows
- Reading it before the first settle and expecting the latest value — it seeds with the initial \`source()\` and only updates after the quiet window`,
  },

  'rx/throttle': {
    signature: '<T>(source: Signal<T>, ms: number) => ReadableSignal<T> & { dispose: () => void }',
    example: `const throttled = throttle(scrollY, 100)
effect(() => updateHeader(throttled()))
onCleanup(() => throttled.dispose())   // REQUIRED — not auto-cleaned`,
    notes: 'Throttle a SIGNAL value to at most one emission per `ms`. Returns a new readable signal + `dispose()` (internal effect + timer). Like `debounce`, value-level not item-level, does not compose in `pipe`, and seeds synchronously with the current `source()`. See also: debounce, rx.',
    mistakes: `- Not calling \`dispose()\` — same leak as \`debounce\`; tracked by the \`rx.throttle.create\` perf counter
- Confusing it with \`debounce\` — throttle emits at a steady max rate during continuous change; debounce emits once after change STOPS
- Using it as a \`pipe\` operator — it is not curried and takes a single signal`,
  },
  // <gen-docs:api-reference:end @pyreon/rx>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/toast
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/toast>

  'toast/toast': {
    signature: '(message: string, options?: ToastOptions) => string',
    example: `// Basic:
toast('Hello!')
const id = toast.success('Saved!')

// Loading → success:
const loadId = toast.loading('Saving...')
await save()
toast.update(loadId, { type: 'success', message: 'Done!' })

// Promise helper:
toast.promise(fetchData(), {
  loading: 'Loading...',
  success: 'Loaded!',
  error: 'Failed',
})

// Dismiss:
toast.dismiss(id)  // one
toast.dismiss()    // all`,
    notes: 'Create a toast notification imperatively. Returns the toast ID for later `update()` or `dismiss()`. Works from anywhere in the app — no context or provider needed. The function also exposes `.success()`, `.error()`, `.warning()`, `.info()`, `.loading()` preset methods, `.update(id, options)` for modifying existing toasts, `.dismiss(id?)` for removal, and `.promise(promise, messages)` for async operation tracking. See also: Toaster.',
    mistakes: `- Forgetting to render \`<Toaster />\` — toasts are created but have no visual container to render into
- Calling \`toast.update()\` after the toast has been auto-dismissed — the ID is no longer valid, the update is silently ignored
- Using \`toast.promise()\` with a function instead of a promise — pass the promise directly, not \`() => fetch(...)\``,
  },

  'toast/Toaster': {
    signature: '(props?: ToasterProps) => VNodeChild',
    example: '<Toaster position="top-right" duration={5000} />',
    notes: 'Render container for toast notifications. Mount once at the app root. Renders via Portal with CSS transitions, auto-dismiss timer, and pause-on-hover behavior. Position configurable via `position` prop (`top-right`, `top-left`, `bottom-right`, `bottom-left`, `top-center`, `bottom-center`). Duration configurable via `duration` prop (default 4000ms). See also: toast.',
    mistakes: `- Mounting multiple \`<Toaster />\` instances — toasts render in all of them, causing duplicates
- Conditional rendering of \`<Toaster />\` — if unmounted, toasts created via \`toast()\` are queued but invisible until the Toaster mounts`,
  },
  // <gen-docs:api-reference:end @pyreon/toast>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/url-state
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/url-state>

  'url-state/useUrlState': {
    signature: '<T>(key: string, defaultValue: T, options?: UrlStateOptions) => UrlStateSignal<T>',
    example: `// Single param:
const page = useUrlState('page', 1)
page()        // 1
page.set(2)   // URL → ?page=2

// Schema mode:
const { q, sort } = useUrlState({ q: '', sort: 'name' })
q.set('hello')  // ?q=hello&sort=name

// Array with repeated keys:
const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
tags.set(['a', 'b'])  // ?tags=a&tags=b`,
    notes: 'Create a reactive signal synced to a URL search parameter. Type is inferred from the default value — numbers, booleans, strings, and arrays are auto-coerced. Uses `replaceState` by default (no history entries). Returns a `UrlStateSignal<T>` with `.set()`, `.reset()`, and `.remove()`. Schema mode overload: `useUrlState({ page: 1, sort: "name" })` creates multiple synced signals from a single call. SSR-safe — reads from the request URL on server. See also: setUrlRouter.',
    mistakes: `- Using pushState behavior (adds history entries per keystroke) — useUrlState defaults to replaceState; if you pass \`{ replaceState: false }\` on a high-frequency input, the browser back button breaks
- Forgetting the default value — the type is inferred from it and determines the auto-coercion strategy (number default = coerce to number, boolean default = coerce to boolean)
- Reading useUrlState in a non-reactive scope at component setup — the signal reads the URL once; wrap in a reactive scope to track URL changes
- Calling setUrlRouter before the router is available — SSR renders may not have a router instance yet`,
  },

  'url-state/setUrlRouter': {
    signature: '(router: UrlRouter) => void',
    example: `import { useRouter } from '@pyreon/router'
import { setUrlRouter } from '@pyreon/url-state'

const router = useRouter()
setUrlRouter(router)
// Now useUrlState uses router.replace() internally`,
    notes: `Configure useUrlState to use a @pyreon/router instance for URL updates instead of raw \`history.replaceState\`. When set, URL changes go through the router's navigation system, ensuring route guards, middleware, and scroll management integrate correctly. See also: useUrlState.`,
  },
  // <gen-docs:api-reference:end @pyreon/url-state>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/document-primitives
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/document-primitives>

  'document-primitives/extractDocNode': {
    signature: 'extractDocNode(templateFn: () => VNode, options?: ExtractOptions): DocNode',
    example: `import {
  DocDocument, DocPage, DocHeading, DocText,
  extractDocNode,
} from '@pyreon/document-primitives'
import { download } from '@pyreon/document'

const tree = extractDocNode(() => (
  <DocDocument title="Quarterly Report" author="Aisha">
    <DocPage>
      <DocHeading level="h1">Q4 Results</DocHeading>
      <DocText>Revenue grew 23% YoY.</DocText>
    </DocPage>
  </DocDocument>
))
await download(tree, 'report.pdf')
await download(tree, 'report.docx')`,
    notes: `18 primitives: \`DocDocument\`, \`DocPage\`, \`DocSection\`, \`DocRow\`, \`DocColumn\`, \`DocHeading\`, \`DocText\`, \`DocLink\`, \`DocImage\`, \`DocTable\`, \`DocList\`, \`DocListItem\`, \`DocCode\`, \`DocDivider\`, \`DocSpacer\`, \`DocButton\`, \`DocQuote\`, \`DocPageBreak\`. Same component tree renders in browser AND exports — primitives carry \`_documentType\` statics that \`extractDocumentTree\` (from \`@pyreon/connector-document\`) walks to produce a \`DocNode\` for \`@pyreon/document\`\\'s \`render()\` to consume. \`DocDocument\`\\'s \`title\` / \`author\` / \`subject\` accept either a string OR a \`() => string\` accessor; function values are stored in \`_documentProps\` and resolved at extraction time so reactive metadata works without \`const initial = get()\` workarounds. PR #197 also fixed a latent bug in \`extractDocumentTree\`: it now CALLS rocketstyle component functions to read post-attrs \`_documentProps\`, where before it only looked at the JSX vnode\\'s props directly — every primitive\\'s metadata was silently dropped during export until that fix landed. See also: createDocumentExport.`,
    mistakes: `- Calling \`props.title()\` at the top of a template body to "fix" reactivity — components run ONCE at mount, so this captures the initial value forever. Pass the accessor through to DocDocument as-is: \`<DocDocument title={() => get().name}>\`
- DocRow direction: layout props (direction, gap) go in \`.attrs()\` not \`.theme()\`. Element accepts \`'inline'\` | \`'rows'\` | \`'reverseInline'\` | \`'reverseRows'\` — \`'row'\` is NOT valid
- For text children reactivity, pass a signal accessor and read inside body: \`<DocText>{store.field()}</DocText>\`
- Don't declare runtime-filled fields (\`tag\`, \`_documentProps\`) in the rocketstyle \`.attrs<P>()\` generic — they leak as required JSX props
- Using \`createDocumentExport(...).getDocNode()\` in new code — prefer \`extractDocNode(fn)\` which is one call instead of two. \`createDocumentExport\` is kept for backward compat`,
  },

  'document-primitives/createDocumentExport': {
    signature: 'createDocumentExport(templateFn: () => VNode): { getDocNode(): DocNode }',
    example: `// Two-step form (kept for backward compat). New code should
// prefer the one-step extractDocNode helper.
import { createDocumentExport } from '@pyreon/document-primitives'

const helper = createDocumentExport(() => <Resume name="Aisha" />)
const tree = helper.getDocNode()`,
    notes: 'Wrapper around `extractDocNode`. The wrapper-object form is kept for callers that want to pass the helper around (e.g. to wrapper components that take a `DocumentExport` instance). New code should use `extractDocNode(templateFn)` which is one call instead of two. See also: extractDocNode.',
  },

  'document-primitives/DocDocument': {
    signature: '(props: { title?: string | (() => string); author?: string | (() => string); subject?: string | (() => string); children: VNodeChild }) => VNodeChild',
    example: `<DocDocument title="Quarterly Report" author="Aisha" subject="Q4 2025">
  <DocPage>...</DocPage>
</DocDocument>

// Reactive metadata via accessor
<DocDocument title={() => \`\${user().name} — Resume\`}>
  <DocPage>...</DocPage>
</DocDocument>`,
    notes: 'Root container for a document tree — produces a `_documentType: "document"` node. Accepts optional metadata: `title`, `author`, `subject`. Each accepts either a plain string OR a `() => string` accessor; function values are stored in `_documentProps` and resolved at extraction time so each export call reads the LIVE value from any underlying signal. See also: DocPage, extractDocNode.',
  },

  'document-primitives/DocPage': {
    signature: `(props: { size?: string; orientation?: 'portrait' | 'landscape'; children: VNodeChild }) => VNodeChild`,
    example: `<DocDocument>
  <DocPage size="A4" orientation="portrait">
    <DocHeading level="h1">Page 1</DocHeading>
  </DocPage>
  <DocPage size="A4" orientation="landscape">
    <DocHeading level="h1">Page 2 — landscape</DocHeading>
  </DocPage>
</DocDocument>`,
    notes: 'A page boundary inside a `DocDocument`. Paginated outputs (PDF, DOCX) treat each `DocPage` as a separate page; flow outputs (HTML, Markdown) render the contents inline with no page boundary. `size` and `orientation` configure paginated formats — common values: `"A4"`, `"Letter"`, `"Legal"`. See also: DocDocument, DocPageBreak.',
  },

  'document-primitives/DocSection': {
    signature: `(props: { direction?: 'column' | 'row'; children: VNodeChild }) => VNodeChild`,
    example: `<DocPage>
  <DocSection direction="column">
    <DocHeading level="h2">Introduction</DocHeading>
    <DocText>Background paragraph.</DocText>
  </DocSection>
</DocPage>`,
    notes: 'Semantic grouping inside a page. Default `direction` is `"column"` (children stack vertically); `"row"` arranges them horizontally. Use to group related content for visual rhythm and for export targets that emit semantic section markers (HTML `<section>`, DOCX section breaks). See also: DocRow, DocColumn.',
  },

  'document-primitives/DocRow': {
    signature: '(props: { children: VNodeChild }) => VNodeChild',
    example: `<DocRow>
  <DocText>Name:</DocText>
  <DocText>Aisha Patel</DocText>
</DocRow>`,
    notes: 'Horizontal layout container — children flow inline with a fixed 8px gap. Use for side-by-side content (label + value pairs, columns of metadata, button rows). Layout-only — no user-configurable props on this primitive; for columns with custom widths use `DocColumn` inside. See also: DocColumn, DocSection.',
  },

  'document-primitives/DocColumn': {
    signature: '(props: { width?: number | string; children: VNodeChild }) => VNodeChild',
    example: `<DocRow>
  <DocColumn width="30%">
    <DocText>Label</DocText>
  </DocColumn>
  <DocColumn width="70%">
    <DocText>Value</DocText>
  </DocColumn>
</DocRow>`,
    notes: `A column inside a row layout. Optional \`width\` controls the column\\'s share of the row — accepts a number (interpreted as pixels) or a string (\`"50%"\`, \`"1fr"\`). When omitted, columns share available width equally. Most common shape is \`<DocRow><DocColumn width="30%" /> <DocColumn width="70%" /></DocRow>\`. See also: DocRow, DocSection.`,
  },

  'document-primitives/DocHeading': {
    signature: `(props: { level?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; children: VNodeChild }) => VNodeChild`,
    example: `<DocHeading level="h1">Quarterly Report</DocHeading>
<DocHeading level="h2">Q4 Results</DocHeading>
<DocHeading level="h3">Revenue Breakdown</DocHeading>`,
    notes: 'Heading text — `level` (`"h1"` through `"h6"`) controls both visual size and the semantic level emitted to outputs (HTML `<h1>...<h6>`, DOCX heading styles, Markdown `#`...`######`). Default `level` is `"h1"`. Used for document structure that downstream tooling can build a TOC from. See also: DocText, DocSection.',
  },

  'document-primitives/DocText': {
    signature: '(props: { children: VNodeChild }) => VNodeChild',
    example: `<DocText>Static paragraph content.</DocText>

// Reactive children
<DocText>{\`Hello, \${user().name}\`}</DocText>`,
    notes: 'Paragraph / inline text. The most common primitive — wraps any text content for the document. Children may be string literals OR signal accessors (`{() => store.field()}`) for reactive content. Visual styling (font weight, variant) is controlled via rocketstyle dimension props on the wrapping component definition. See also: DocHeading, DocLink.',
  },

  'document-primitives/DocLink': {
    signature: '(props: { href?: string; children: VNodeChild }) => VNodeChild',
    example: `<DocText>
  Read more on
  <DocLink href="https://pyreon.dev">our blog</DocLink>
  for the latest releases.
</DocText>`,
    notes: 'Hyperlink within text. `href` is the URL — defaults to `"#"`. Outputs that support hyperlinks (HTML, PDF, DOCX, email) render this as a clickable link; flat outputs (plain text, certain Slack variants) render the link target inline as `text (href)`. See also: DocText.',
  },

  'document-primitives/DocImage': {
    signature: '(props: { src: string; alt?: string; width?: number; height?: number; caption?: string }) => VNodeChild',
    example: `<DocImage
  src="/charts/q4-revenue.png"
  alt="Revenue grew 23% in Q4"
  width={600}
  height={400}
  caption="Figure 1: Quarterly revenue, 2024-2025"
/>`,
    notes: 'An image embedded in the document. `src` is the image URL or data URI. `alt` is the accessible description (also used as fallback text in non-visual outputs). `width` / `height` constrain dimensions in pixels. Optional `caption` renders a caption beneath the image. See also: DocCode.',
  },

  'document-primitives/DocTable': {
    signature: '(props: { columns: TableColumn[]; rows: TableRow[]; headerStyle?: object; striped?: boolean; bordered?: boolean; caption?: string }) => VNodeChild',
    example: `<DocTable
  caption="Q4 results by region"
  bordered
  striped
  columns={[
    { key: 'region', label: 'Region', align: 'left' },
    { key: 'revenue', label: 'Revenue', align: 'right' },
    { key: 'growth', label: 'YoY Growth', align: 'right' },
  ]}
  rows={[
    { region: 'NA', revenue: '$12.4M', growth: '+23%' },
    { region: 'EU', revenue: '$8.7M', growth: '+18%' },
    { region: 'APAC', revenue: '$5.1M', growth: '+41%' },
  ]}
/>`,
    notes: 'Tabular data. `columns` defines the header cells (label, key, optional alignment). `rows` is an array of data rows keyed by column key. `striped` adds alternating row backgrounds; `bordered` adds cell borders; `caption` renders an accessible table caption. Both `rows` and `columns` are filtered before reaching the DOM via `.attrs(..., { filter: [...] })` because `HTMLTableElement.rows` / `.cells` are read-only DOM properties — assignment would crash. See also: DocList, DocSection.',
  },

  'document-primitives/DocList': {
    signature: '(props: { ordered?: boolean; children: VNodeChild }) => VNodeChild',
    example: `<DocList>
  <DocListItem>First bullet</DocListItem>
  <DocListItem>Second bullet</DocListItem>
</DocList>

<DocList ordered>
  <DocListItem>First step</DocListItem>
  <DocListItem>Second step</DocListItem>
</DocList>`,
    notes: 'Bulleted (default) or numbered (`ordered`) list. Children are typically `DocListItem` instances. Outputs map this to the right native list type — HTML `<ul>` / `<ol>`, Markdown `-` / `1.`, DOCX list styles. See also: DocListItem.',
  },

  'document-primitives/DocListItem': {
    signature: '(props: { children: VNodeChild }) => VNodeChild',
    example: `<DocList>
  <DocListItem>Top-level item</DocListItem>
  <DocListItem>
    Item with nested list
    <DocList>
      <DocListItem>Nested A</DocListItem>
      <DocListItem>Nested B</DocListItem>
    </DocList>
  </DocListItem>
</DocList>`,
    notes: `Single item inside a \`DocList\`. Children may be plain text, \`DocText\`, nested \`DocList\` for sublists, or any other inline primitive. Visual marker (bullet vs number) is decided by the parent list\\'s \`ordered\` prop, not by the item. See also: DocList.`,
  },

  'document-primitives/DocCode': {
    signature: '(props: { language?: string; children: VNodeChild }) => VNodeChild',
    example: `<DocCode language="typescript">{
\`const flow = createFlow({
  nodes: [{ id: '1', position: { x: 0, y: 0 } }],
  edges: [],
})\`
}</DocCode>`,
    notes: 'Monospace code block. Optional `language` hint enables syntax highlighting in outputs that support it (HTML via Prism / Shiki, Markdown fenced code blocks with language tag). Whitespace is preserved verbatim — pass code as a single string child to keep newlines. See also: DocText.',
  },

  'document-primitives/DocDivider': {
    signature: '(props: { color?: string; thickness?: number }) => VNodeChild',
    example: `<DocText>Above the divider.</DocText>
<DocDivider color="#e5e7eb" thickness={1} />
<DocText>Below the divider.</DocText>`,
    notes: 'Horizontal rule — visual section separator. `color` controls the line color (any CSS color string); `thickness` controls the line thickness in pixels. Outputs map this to native dividers — HTML `<hr>`, Markdown `---`, DOCX horizontal rule. See also: DocSpacer.',
  },

  'document-primitives/DocSpacer': {
    signature: '(props: { height?: number }) => VNodeChild',
    example: `<DocSection>
  <DocHeading level="h2">Section A</DocHeading>
  <DocText>Content...</DocText>
  <DocSpacer height={32} />
  <DocHeading level="h2">Section B</DocHeading>
  <DocText>More content...</DocText>
</DocSection>`,
    notes: 'Vertical whitespace — adds a blank vertical gap. `height` is in pixels (default 16). Use to space out content beyond what `DocSection` / `DocPage` margins provide. In flow outputs this becomes a styled blank block; in plain-text outputs, a sequence of newlines. See also: DocDivider.',
  },

  'document-primitives/DocButton': {
    signature: '(props: { href?: string; children: VNodeChild }) => VNodeChild',
    example: `<DocButton href="https://pyreon.dev/signup">
  Get started
</DocButton>`,
    notes: 'Call-to-action button. Renders as a styled clickable element in HTML / email outputs (mail-safe button table layout for email), and as a labeled link in PDF / DOCX. `href` is the action URL — defaults to `"#"`. Visual style (variant) is controlled via rocketstyle dimensions on the component definition. See also: DocLink.',
  },

  'document-primitives/DocQuote': {
    signature: '(props: { borderColor?: string; children: VNodeChild }) => VNodeChild',
    example: `<DocQuote borderColor="#3b82f6">
  <DocText>"The best way to predict the future is to build it."</DocText>
  <DocText>— Aisha Patel, Q4 keynote</DocText>
</DocQuote>`,
    notes: 'Block quote — sets off a quoted passage with an indented left border. `borderColor` controls the indicator stripe (any CSS color). Outputs map this to native quote styling — HTML `<blockquote>`, Markdown `> ...`, DOCX quote style. See also: DocText.',
  },

  'document-primitives/DocPageBreak': {
    signature: '() => VNodeChild',
    example: `<DocPage>
  <DocHeading level="h1">Section 1</DocHeading>
  <DocText>...long content...</DocText>
  <DocPageBreak />
  <DocHeading level="h1">Section 2 — new page</DocHeading>
</DocPage>`,
    notes: 'Explicit page boundary inside a `DocPage`. Forces the renderer to start a new page at this point in paginated outputs (PDF, DOCX). In flow outputs (HTML, Markdown), it renders as visible whitespace or is omitted entirely. Use for explicit pagination control beyond what `DocPage` boundaries already provide. See also: DocPage.',
  },
  // <gen-docs:api-reference:end @pyreon/document-primitives>

  // <gen-docs:api-reference:start @pyreon/zero>

  'zero/zero': {
    signature: 'function zero(config?: ZeroConfig): Plugin[] // default export of @pyreon/zero/server',
    example: `import zero from '@pyreon/zero/server'

// SPA (default) — no special config needed
plugins: [pyreon(), zero()]

// SSG with auto-detected paths + i18n + adapter
plugins: [pyreon(), zero({
  mode: 'ssg',
  i18n: { locales: ['en','de','cs'], defaultLocale: 'en' },
  adapter: vercelAdapter(),
})]

// Subpath deploy (e.g. served at /blog/)
plugins: [pyreon(), zero({ base: '/blog/', mode: 'ssg' })]`,
    notes: `Top-level Vite plugin chain for @pyreon/zero. Single config object selects rendering mode (\`'ssr' | 'ssg' | 'isr' | 'spa'\`), subpath base (\`base: '/blog/'\`), SSG settings (paths, concurrency, onProgress, emit404, emitRedirects), i18n config (locales / defaultLocale / strategy), and deployment adapter. Returns \`Plugin[]\` because the SSG mode adds a companion \`ssgPlugin()\` automatically — Vite's plugins array natively flattens nested arrays so \`plugins: [pyreon(), zero()]\` works without spread. See also: I18nRoutingConfig, GetStaticPaths, Adapter, createISRHandler.`,
    mistakes: `- Setting \`base\` in BOTH \`vite.config.base\` AND \`zero({ base })\` and expecting them to merge — user's explicit \`vite.config.base\` overrides the plugin-returned base. Set base ONCE via \`zero({ base })\`; let it propagate to Vite + router automatically
- Passing \`layout\` to \`createApp\` / \`startClient\` when fs-router already emits \`_layout.tsx\` as a parent route — double-mounts the layout. Drop the explicit option; \`_layout.tsx\` is the canonical layout registration
- Mixing \`mode: 'ssg'\` with a runtime adapter that has no SSG branch (e.g. expecting \`nodeAdapter\` to write platform routing config under SSG) — node/bun/static adapters no-op for SSG; use vercel/cloudflare/netlify if you need platform routing emission
- Configuring \`ssg.paths\` AND per-route \`getStaticPaths\` together for the same dynamic route — both produce the same path list and the SSG plugin renders each path TWICE (the second pass overwrites). Pick one: \`ssg.paths\` for top-down explicit lists, \`getStaticPaths\` for per-route enumerators
- Forgetting that \`mode: 'ssg'\` returns \`Plugin[]\` (not a single Plugin) — any downstream test code that does \`plugins: [zeroPlugin().name]\` instead of \`plugins: zeroPlugin()\` breaks
- Setting \`ssg.concurrency\` higher than the data layer's connection ceiling — loaders running concurrently overwhelm the upstream (db pool, external API rate limit). Default \`4\` is safe; raise after profiling, lower to \`1\` for serial-required loaders`,
  },

  'zero/I18nRoutingConfig': {
    signature: `interface I18nRoutingConfig { locales: string[]; defaultLocale: string; strategy?: 'prefix' | 'prefix-except-default' }`,
    example: `// Prefix-except-default (canonical SEO shape — default unprefixed)
zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en' } })
// Emits: /about, /de/about, /cs/about
// Default locale's index.html: dist/about/index.html (NOT dist/en/about/...)

// Prefix (every locale prefixed)
zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en', strategy: 'prefix' } })
// Emits: /en/about, /de/about, /cs/about
// NO unprefixed /about exists`,
    notes: `Configuration shape for \`zero({ i18n })\`. \`locales\` is the supported BCP-47 list (validated against path-traversal — \`..\`, \`/\`, backslash, \`.\`, leading-dot, NUL chars rejected). \`defaultLocale\` is the canonical / SEO-primary locale. \`strategy\` selects URL shape — \`'prefix-except-default'\` (default) keeps \`/about\` unprefixed for the default locale + emits \`/de/about\` etc. for non-defaults (best for SEO-on-default-locale apps); \`'prefix'\` prefixes every locale including default (\`/en/about\`, \`/de/about\`) for apps with no primary locale. See also: zero, expandRoutesForLocales, i18nRouting.`,
    mistakes: `- Configuring locale strings with \`.\`, \`..\`, \`/\`, backslash, or NUL — rejected by \`validateLocale\` (PR L2 guard). Common BCP-47 shapes pass: \`en\`, \`de-AT\`, \`en-US\`, \`zh-Hans\`, \`pt-BR\`
- Expecting \`<RouterLink to='/posts/1'>\` rendered inside \`/de/posts\` to emit \`/de/posts/1\` automatically — RouterLinks emit LITERAL hrefs; cross-locale navigation falls through to the default-locale route. Locale-aware navigation is a separate API (not yet shipped)
- Assuming the framework runtime-detects locale from URL prefix — it doesn't. The router matches \`/de/about\` to the duplicated route record; consumer code reads locale from URL parsing OR from \`i18nRouting()\` middleware (request-time Accept-Language detection)
- Using \`prefix-except-default\` and then duplicating the root \`_layout.tsx\` per locale — \`expandRoutesForLocales\` deliberately SKIPS root-layout duplication under this strategy because the unprefixed root layout already wraps locale-prefixed children via hierarchical match. Under \`prefix\` strategy the skip does NOT apply (no unprefixed default to inherit from)
- Single-locale \`locales: ['en']\` + \`prefix-except-default\` — short-circuits to a no-op (no other locales to prefix). Use \`prefix\` strategy if you want \`/en/about\` for SEO consistency with future multi-locale expansion
- Hand-writing per-locale routes (\`src/routes/de/about.tsx\`) instead of letting \`expandRoutesForLocales\` duplicate from a single source file — the framework's duplication wires hierarchical layouts + loader-data hydration + hreflang sitemap clustering correctly; hand-written variants miss the cross-cuts`,
  },

  'zero/expandRoutesForLocales': {
    signature: 'function expandRoutesForLocales(routes: FileRoute[], config: I18nRoutingConfig): FileRoute[] // server-only',
    example: `import { expandRoutesForLocales } from '@pyreon/zero/server'
import { parseFileRoutes, scanRouteFiles } from '@pyreon/zero/server'

const files = await scanRouteFiles('./src/routes')
const baseRoutes = parseFileRoutes(files)
const fileRoutes = expandRoutesForLocales(baseRoutes, {
  locales: ['en', 'de', 'cs'],
  defaultLocale: 'en',
  strategy: 'prefix-except-default',
})
// fileRoutes now contains: original routes + /de/* + /cs/* subtrees`,
    notes: 'Fans a flat route list into per-locale variants based on `I18nRoutingConfig`. Each non-default locale gets a full subtree duplicate — layouts, error boundaries, loading components, 404 pages, dynamic params (`[id]` → `:id`), catch-all routes (`[...slug]` → `:slug*`) all compose naturally with the locale prefix. Source `filePath` is preserved so the duplicated routes share the same component module; only `urlPath` / `dirPath` / `depth` change. `getStaticPaths` inherits across duplicates so dynamic-route × locale cross-products work automatically (3 IDs × 3 locales = 9 SSG outputs). Root-layout skip under `prefix-except-default` prevents double-mount. See also: I18nRoutingConfig, zero, parseFileRoutes.',
    mistakes: `- Calling this from CLIENT code — server-only export from \`@pyreon/zero/server\`. Importing from \`@pyreon/zero\` (the client entry) gives a clear server-only error stub
- Expecting hand-written \`src/routes/de/about.tsx\` to compose with duplicated \`/de/about\` from \`/about\` — the helper does NOT detect collisions today; a user-defined route at \`/de/profile\` + locale \`de\` produces two records at the same urlPath (router matches first)
- Modifying the returned \`FileRoute[]\` and expecting \`getStaticPaths\` inheritance to update — the duplicates carry frozen \`exports\` references at duplication time; later mutations don't propagate to the SSG enumerator
- Setting \`strategy: 'prefix'\` and expecting \`/about\` (unprefixed) to ALSO render — under \`prefix\` every locale is prefixed; the default-locale unprefixed URL does NOT exist as a dist file. Use \`prefix-except-default\` if you need both
- Passing user-controlled strings as locales without validation — the helper validates against path-traversal (\`..\`, \`/\`, backslash, \`.\`, NUL) but does NOT validate BCP-47 shape; an invalid locale silently produces oddly-shaped URLs`,
  },

  'zero/GetStaticPaths': {
    signature: 'type GetStaticPaths<TParams> = () => Array<{ params: TParams }> | Promise<Array<{ params: TParams }>>',
    example: `import type { GetStaticPaths } from '@pyreon/zero/server'

// src/routes/posts/[id].tsx
export const getStaticPaths: GetStaticPaths<{ id: string }> = () =>
  POSTS.map((p) => ({ params: { id: String(p.id) } }))

// Async loader-driven enumeration
export const getStaticPaths: GetStaticPaths<{ slug: string }> = async () => {
  const posts = await db.query('SELECT slug FROM posts WHERE published = true')
  return posts.map((p) => ({ params: { slug: p.slug } }))
}`,
    notes: 'Per-route export type for dynamic-route enumeration at SSG build time (PR A of the SSG roadmap). Route files at `src/routes/posts/[id].tsx` export `getStaticPaths` returning the concrete param values; the SSG plugin expands the URL pattern (`/posts/:id` × `[1, 2, 3]` → `/posts/1`, `/posts/2`, `/posts/3`). Sync or async return; errors during enumeration land in `PrerenderResult.errors` without aborting other routes. Catch-all routes (`[...slug].tsx`) work via `{ params: { slug: "a/b" } }` → `/blog/a/b`. See also: zero, I18nRoutingConfig.',
    mistakes: `- Returning param values as numbers instead of strings (\`{ id: 1 }\` instead of \`{ id: '1' }\`) — URL segments are always strings; the type enforces this but a runtime cast (\`as any\`) silently produces wrong paths
- Forgetting to handle the no-i18n vs i18n cardinality — with \`zero({ i18n })\` the cross-product is \`paths × locales\`; a 100-path enumerator with 3 locales produces 300 dist files. Pair with \`ssg.concurrency\` to avoid serial-render blowup
- Throwing in \`getStaticPaths\` and expecting the build to abort — errors are CAPTURED into \`PrerenderResult.errors\` and the build continues for other routes. Check \`dist/_pyreon-ssg-errors.json\` after the build (PR G)
- Mixing \`getStaticPaths\` and \`ssg.paths\` for the same dynamic route — both produce paths and the SSG plugin renders each twice
- Reading external state in \`getStaticPaths\` without await — the function is async-aware; missing await produces "[object Promise]" segments in the URL`,
  },

  'zero/Adapter': {
    signature: 'interface Adapter { name: string; build?(options: AdapterBuildOptions): Promise<void>; revalidate?(path: string): Promise<AdapterRevalidateResult> }',
    example: `import { vercelAdapter, cloudflareAdapter, netlifyAdapter, staticAdapter } from '@pyreon/zero/server'

// Vercel — emits .vercel/output/config.json v3 STATIC variant
plugins: [pyreon(), zero({ mode: 'ssg', adapter: vercelAdapter() })]

// Cloudflare — emits _routes.json (zero-function deploy)
plugins: [pyreon(), zero({ mode: 'ssg', adapter: cloudflareAdapter() })]

// Netlify — emits netlify.toml with publish="." + cache headers
plugins: [pyreon(), zero({ mode: 'ssg', adapter: netlifyAdapter() })]

// ISR revalidation webhook handler (Vercel-side)
await vercelAdapter().revalidate?.('/posts/123')
// → { regenerated: true } on success`,
    notes: `Deployment adapter contract. \`build()\` is auto-invoked by SSG's \`closeBundle\` AFTER the path render loop (PR J) and writes platform-specific routing config: Vercel emits \`.vercel/output/config.json\`; Cloudflare emits \`_routes.json\` with zero-function \`exclude: ['/*']\`; Netlify emits \`netlify.toml\` with \`publish = '.'\` + asset cache headers. \`revalidate(path)\` is the runtime hook for build-time ISR (PR I) — Vercel POSTs to a revalidation webhook, Cloudflare purges the edge cache, Netlify triggers a Build Hook. Static / node / bun adapters no-op for SSG. See also: zero, createISRHandler, vercelAdapter.`,
    mistakes: `- Calling \`adapter.revalidate(path)\` without the platform's env vars set (e.g. \`VERCEL_DEPLOYMENT_URL\` + \`VERCEL_REVALIDATE_TOKEN\`) — returns \`{ regenerated: false }\` with a dev-mode warning. The webhook is a no-op without credentials
- Expecting \`nodeAdapter\` / \`bunAdapter\` to emit platform routing config under SSG — they no-op (no platform routing to configure). Use vercel/cloudflare/netlify if you need a routing config emitted
- Setting \`mode: 'ssg'\` + \`adapter: vercelAdapter()\` and ALSO writing \`.vercel/output/config.json\` manually — the adapter overwrites it. Pick one source of truth
- Calling adapter methods from CLIENT code — server-only. Import from \`@pyreon/zero/server\`
- Forgetting that Netlify's revalidate triggers a FULL-SITE rebuild (Build Hook semantics) — Netlify doesn't expose per-page ISR. The \`path\` arg flows into \`trigger_title\` for audit logs but doesn't scope the rebuild`,
  },

  'zero/createISRHandler': {
    signature: 'function createISRHandler(handler: (req: Request) => Promise<Response>, config: ISRConfig): ISRHandler',
    example: `import { createISRHandler, createServer } from '@pyreon/zero/server'

const ssrHandler = createServer({ routes })
const isr = createISRHandler(ssrHandler, { revalidate: 60 })

// Use as the request handler
Bun.serve({ fetch: isr })

// CMS webhook: drop one entry
app.post('/api/webhooks/post-updated', async (req) => {
  const { postId } = await req.json()
  const result = await isr.revalidateNow(\`/posts/\${postId}\`)
  return Response.json(result) // { dropped: true | false }
})

// Admin "purge cache" endpoint
app.post('/admin/purge', async () => {
  await isr.revalidateAll()
  return new Response('ok')
})

// Tag-based group invalidation — record tags at cache-set time…
const tagged = createISRHandler(ssrHandler, {
  revalidate: 60,
  tagsForRequest: (req) => {
    const p = new URL(req.url).pathname
    return p.startsWith('/posts/') ? ['posts', \`post:\${p.split('/')[2]}\`] : []
  },
})
// …then drop every page that rendered posts, no path enumeration:
app.post('/api/webhooks/posts-changed', async () => {
  const { dropped } = await tagged.revalidateTag('posts')
  return Response.json({ dropped })
})`,
    notes: `Runtime ISR — on-demand SSR caching with stale-while-revalidate. Wraps an SSR handler so pages are rendered on the FIRST request, cached per-URL (or per-\`cacheKey\`-derived key), and served stale until expiry while a background revalidate fires. The returned \`ISRHandler\` is still a callable \`(req) => Promise<Response>\` for \`Bun.serve({ fetch: ... })\`, but ALSO exposes imperative invalidation: \`.revalidateNow(key)\` drops one entry (returns \`{ dropped: boolean }\`), \`.revalidateAll()\` drops everything (when the store implements \`clear()\`), and \`.revalidateTag(tag)\` drops every entry recorded under a tag (returns \`{ dropped: number }\`) — pair with \`config.tagsForRequest(req) => string[]\`, which records tags at cache-SET time, for CMS-webhook group invalidation without path enumeration. \`config.store\` swaps the backing (\`createMemoryStore\` default; \`createFsStore(dir)\` survives restarts on a single box; Redis/KV for multi-instance). Pair with webhooks for CMS-driven cache busting — no stale window between content update and propagation. Distinct from build-time ISR (per-route \`revalidate\` export + \`Adapter.revalidate\`): runtime ISR caches at request time; build-time ISR triggers platform rebuilds. They can coexist: a \`mode: 'isr'\` app with per-route \`revalidate\` exports gets BOTH. See also: zero, Adapter, ISRStore, createMemoryStore.`,
    mistakes: `- Treating the returned handler as a plain function — it ALSO carries \`.revalidateNow(key)\` and \`.revalidateAll()\` methods. Webhook-driven invalidation is the canonical way to bust the cache; waiting for the TTL is the fallback
- Calling \`.revalidateAll()\` against a store that does not implement \`clear()\` — throws a clear error. External stores (Redis with TTL-only) must opt in by implementing the method
- Expecting \`revalidateNow(key)\` against a store without \`delete?()\` to physically drop the entry — returns \`{ dropped: false }\` honestly; such stores rely on TTL for eviction
- Sharing the ISR handler across server instances without external cache — each server's in-memory cache diverges. For multi-instance deploys, swap \`config.store\` to a shared cache layer (Redis / Vercel KV / Cloudflare KV)
- Setting \`revalidate: 0\` and expecting "never cache" — pass-through is the explicit handler call (no \`createISRHandler\` wrapper). Use \`revalidate: Number.MAX_SAFE_INTEGER\` for "cache forever, invalidate only via \`revalidateNow\`"
- Calling \`.revalidateTag()\` against a custom store without \`setTags\`/\`keysByTag\` — throws a clear error naming the missing methods; both shipped stores implement them
- A throwing \`tagsForRequest\` never breaks caching — the entry is cached UNTAGGED (dev-mode warns)`,
  },

  'zero/ISRStore': {
    signature: 'interface ISRStore<E = ISRCacheEntry> { get(key): E | Promise<E | undefined> | undefined; set(key, entry): void | Promise<void>; delete?(key): void | Promise<void>; clear?(): void | Promise<void>; setTags?(key, tags: readonly string[]): void | Promise<void>; keysByTag?(tag): string[] | Promise<string[]> }',
    example: `import type { ISRStore } from '@pyreon/zero/server'

const redisStore: ISRStore = {
  get: (key) => redis.get(key).then((s) => (s ? JSON.parse(s) : undefined)),
  set: (key, entry) => redis.set(key, JSON.stringify(entry), { EX: 3600 }),
  delete: (key) => redis.del(key),
}
createISRHandler(handler, { revalidate: 60, store: redisStore })`,
    notes: 'The pluggable ISR cache backing. All methods may return sync OR async — the handler awaits every call (a same-tick microtask for the in-memory default; real network promises for Redis / Vercel KV / Cloudflare KV adapters). `delete`/`clear` are optional (stores without them degrade `revalidateNow`/`revalidateAll` honestly); `setTags`/`keysByTag` are the tag-invalidation surface consumed by `revalidateTag`. When a custom store is supplied, `config.maxEntries` is ignored — the store owns its eviction/TTL policy. See also: createISRHandler, createMemoryStore, createFsStore.',
  },

  'zero/createMemoryStore': {
    signature: 'function createMemoryStore<E = ISRCacheEntry>(opts?: { maxEntries?: number }): ISRStore<E>',
    example: 'createISRHandler(handler, { revalidate: 60, store: createMemoryStore({ maxEntries: 5000 }) })',
    notes: 'The default in-memory ISR store: insertion-order LRU capped at `maxEntries` (default 1000), with `get` bumping recency so hot paths survive eviction. Implements the full optional surface (`delete`/`clear`/`setTags`/`keysByTag` — the tag index prunes evicted keys lazily). Per-process — fine for single-instance deploys; multi-instance wants a shared external store. See also: createISRHandler, ISRStore, createFsStore.',
  },

  'zero/createFsStore': {
    signature: 'function createFsStore<E = ISRCacheEntry>(dir: string): ISRStore<E>',
    example: `import { createFsStore } from '@pyreon/zero/server'

createISRHandler(handler, {
  revalidate: 60,
  store: createFsStore('./.isr-cache'),
  tagsForRequest: (req) => (new URL(req.url).pathname.startsWith('/posts/') ? ['posts'] : []),
})`,
    notes: `Filesystem-backed ISR store for self-hosted node/bun: cache entries (and the tag index) persist as JSON files under \`dir\`, so a server restart does NOT cold-start the cache (no thundering herd on the origin). One file per key (fs-safe encoded; over-length keys hash to a fixed name so long query strings can't silently ENAMETOOLONG-drop), \`_tags.json\` sidecar written atomically (tmp+rename). EVERY fs error degrades to cache-miss behavior — never a request-path throw. Per-BOX — multi-instance deploys still want Redis/KV. See also: createISRHandler, ISRStore, createMemoryStore.`,
    mistakes: `- Using it across multiple instances — each box has its own directory; tag invalidation on one box does not reach the others
- Pointing \`dir\` at a tmpfs that clears on reboot — defeats the restart-survival purpose`,
  },

  'zero/vercelAdapter': {
    signature: 'function vercelAdapter(): Adapter',
    example: `plugins: [pyreon(), zero({ mode: 'ssg', adapter: vercelAdapter() })]`,
    notes: 'Vercel deployment adapter. SSG branch emits `.vercel/output/config.json` v3 STATIC variant (no functions, asset cache headers). Does NOT copy files into `.vercel/output/static/` — Vercel CLI auto-detects dist. ISR `revalidate(path)` POSTs to `<VERCEL_DEPLOYMENT_URL>/api/_pyreon-revalidate?path=…&secret=<token>`; user-side webhook validates secret + calls `res.revalidate()`. See also: Adapter, zero.',
  },

  'zero/cloudflareAdapter': {
    signature: 'function cloudflareAdapter(): Adapter',
    example: `plugins: [pyreon(), zero({ mode: 'ssg', adapter: cloudflareAdapter() })]`,
    notes: `Cloudflare Pages adapter. SSG branch emits \`_routes.json\` with \`{ version: 1, include: [], exclude: ['/*'] }\` — i.e. "every URL is static, never invoke a Pages Function" (zero-function deploy). Without this file Pages defaults to running the worker on every request, wasting paid-plan compute. ISR \`revalidate(path)\` POSTs to Cloudflare's zone purge_cache API. See also: Adapter, zero.`,
  },

  'zero/netlifyAdapter': {
    signature: 'function netlifyAdapter(): Adapter',
    example: `plugins: [pyreon(), zero({ mode: 'ssg', adapter: netlifyAdapter() })]`,
    notes: `Netlify adapter. SSG branch emits \`netlify.toml\` with \`publish = "."\` + \`Cache-Control\` headers for \`/assets/*\`. PR B's \`dist/_redirects\` covers loader-thrown redirects (Netlify reads the file natively). ISR \`revalidate(path)\` POSTs to a Build Hook URL with \`trigger_title=revalidate:<path>\` for audit-log traceability (Netlify queues a full-site partial rebuild — no per-page ISR API). See also: Adapter, zero.`,
  },

  'zero/seoPlugin': {
    signature: 'function seoPlugin(config: SeoPluginConfig): Plugin // server-only',
    example: `seoPlugin({
  sitemap: {
    baseUrl: 'https://example.com',
    useSsgPaths: true,      // PR F — auto-detect SSG paths
    hreflang: true,         // PR K — auto-detect i18n + emit cross-refs
  },
  robots: { sitemap: 'https://example.com/sitemap.xml' },
})`,
    notes: `SEO plugin — emits \`sitemap.xml\`, \`robots.txt\`, JSON-LD, and hreflang cross-references. \`sitemap.useSsgPaths: true\` auto-detects from SSG output manifest (paths from \`getStaticPaths\` × locale variants flow in automatically). \`sitemap.hreflang: true\` auto-detects i18n config from the SSG manifest → clusters per-locale URLs into ONE \`<url>\` with \`<xhtml:link rel='alternate' hreflang>\` siblings + \`x-default\` entry. \`sitemap.trailingSlash: 'always' | 'never' | 'preserve'\` (default \`'preserve'\`) controls non-root \`<loc>\` slashes — set \`'always'\` for hosts that 301 \`/path\` → \`/path/\` (GitHub Pages, directory-style Netlify/Cloudflare Pages) so the sitemap doesn't emit redirect-triggering URLs. Falls back to fs-router walk when SSG manifest is absent. See also: aiPlugin, zero.`,
    mistakes: `- Setting \`useSsgPaths: true\` in non-SSG mode — silently falls back to fs-router walk (no SSG manifest to read). Same effect as omitting the flag
- Setting \`hreflang: true\` without \`zero({ i18n })\` — emits a plain single-URL sitemap (no clustering). Configure i18n on zero() to activate hreflang
- Expecting \`hreflang: I18nRoutingConfig\` (explicit form) to override the SSG manifest's i18n config — explicit wins, but typically the auto-detect is the right shape. Use explicit only if you want a different locale set in the sitemap than in routing`,
  },

  'zero/aiPlugin': {
    signature: 'function aiPlugin(config?: AiPluginConfig): Plugin // server-only',
    example: 'plugins: [pyreon(), zero(), seoPlugin({ ... }), aiPlugin()]',
    notes: `AI integration plugin — generates \`llms.txt\`, \`llms-full.txt\`, and JSON-LD inference metadata at build time. Designed for sites that want to be AI-readable (search engines, model trainers, agentic crawlers). The generated files are themselves Pyreon's on-publish artifacts; the plugin runs \`inferJsonLd\` per route to extract structured data from \`meta\` exports. See also: seoPlugin, zero.`,
  },

  'zero/i18nRouting': {
    signature: 'function i18nRouting(config: I18nRoutingConfig): Plugin // server-only',
    example: `import { i18nRouting } from '@pyreon/zero/server'

plugins: [pyreon(), zero({ i18n: { locales, defaultLocale } }), i18nRouting({ locales, defaultLocale })]
// Same config object shape — accepts the i18n already passed to zero() if you keep one source of truth`,
    notes: 'Vite plugin for REQUEST-TIME locale detection — Accept-Language header, cookie, root-path redirect to detected locale. Orthogonal to BUILD-TIME route duplication (`expandRoutesForLocales`); both can be used together. The plugin sets a request-context locale that components read via `createLocaleContext`. See also: zero, I18nRoutingConfig, createLocaleContext.',
    mistakes: `- Confusing this plugin with route duplication — they're separate concerns. \`zero({ i18n })\` controls BUILD-TIME duplication; \`i18nRouting()\` plugin controls REQUEST-TIME detection
- Using \`i18nRouting()\` under SSG mode without a server runtime — request-time middleware needs a live request handler. SSG only emits static files. Use \`mode: 'ssr'\` for request-time locale detection`,
  },

  'zero/validateEnv': {
    signature: 'function validateEnv<T>(schema: T, env?: ProcessEnv): ValidatedEnv<T> // server-only',
    example: `import { validateEnv, publicEnv, schema } from '@pyreon/zero/server'

const env = validateEnv({
  PORT: 3000,
  DEBUG: false,
  API_KEY: String,        // required string
  API_URL: schema((v) => new URL(v)),
})
// env.PORT → number; env.API_KEY → string; env.API_URL → URL

const pub = publicEnv(env, ['API_URL'])  // omit secrets`,
    notes: 'Env-variable validation with type coercion. Schema accepts primitives (`String`, `Number`, `Boolean`) for default coercion + `schema()` for custom parsers. `publicEnv()` returns a client-safe subset (no secrets). Catches missing-required-env errors at startup instead of mid-request runtime crashes. See also: zero.',
  },

  'zero/cspMiddleware': {
    signature: 'function cspMiddleware(config: { directives: CspDirectives }): Middleware // server-only',
    example: `import { cspMiddleware } from '@pyreon/zero/server'

plugins: [pyreon(), zero({
  middleware: [cspMiddleware({
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'nonce-{{nonce}}'"],
    },
  })],
})]`,
    notes: `CSP (Content Security Policy) middleware — emits \`Content-Security-Policy\` header per request with configurable directives. Pair with \`useNonce()\` for inline scripts (nonce is generated per-request and embedded in CSP \`script-src 'nonce-XXX'\`). Server-only; SPA mode without a request handler can't emit per-request nonces. See also: useRequestLocals.`,
  },

  'zero/useRequestLocals': {
    signature: 'function useRequestLocals(): Record<string, unknown>',
    example: `// middleware
async function authMiddleware(ctx, next) {
  ctx.locals.user = await verifyToken(ctx.req.headers.get('authorization'))
  return next()
}

// component
import { useRequestLocals } from '@pyreon/server'
const user = useRequestLocals().user as User | null`,
    notes: 'Bridge middleware-attached request locals into the component tree. Middleware sets `ctx.locals.user = currentUser`; components call `useRequestLocals()` to read during SSR (also works inside server-island fragments and server loaders). IMPORT IT FROM `@pyreon/server` — zero does not re-export it from any entry. Non-generic: cast the fields you read. Returns an empty record outside a request context. See also: cspMiddleware.',
    mistakes: `- Importing from \`@pyreon/zero\` or \`@pyreon/zero/server\` — the only home is \`@pyreon/server\`
- Calling with a type argument — the API is non-generic; cast the read instead`,
  },

  'zero/Link': {
    signature: '<Link href={path} prefetch="hover" activeClass={cls}>{children}</Link>',
    example: `import { Link } from '@pyreon/zero/link'

<Link href="/about" prefetch="viewport" activeClass="nav-active">About</Link>
<Link href="/external" external>External</Link>  // target="_blank" rel="noopener noreferrer"`,
    notes: 'Default navigation link built on an `<a>` tag — client-side push via `router.push()`, hover/viewport prefetch, `aria-current="page"` on exact match, `activeClass` / `exactActiveClass` for nav-state styling. Built on `createLink` so consumers can swap the rendered element via `createLink(MyCustomLink)` without losing the prefetch + active-state behavior. See also: useLink, createLink, prefetchRoute.',
    mistakes: `- Using \`<a href={path} onClick={() => router.push(path)}>\` instead of \`<Link>\` — manual approach skips prefetch, active-state class merging, and the keyboard-modifier guard (Cmd+click should open new tab, not navigate in-place)
- Setting \`prefetch="hover"\` (default) and expecting prefetch on mobile — mobile devices don't fire mouseenter; use \`prefetch="viewport"\` for IntersectionObserver-based prefetch (or accept that touchstart triggers prefetch too)
- Passing \`class\` AND \`activeClass\` — both are MERGED via \`cx\` (not overridden); the user-provided \`class\` always applies, \`activeClass\` is appended when \`isActive()\` is true
- \`<Link to={...}>\` — Link uses \`href\`, NOT \`to\` (RouterLink from \`@pyreon/router\` uses \`to\`; Link from \`@pyreon/zero/link\` uses \`href\` to match HTML anchor convention)
- Expecting \`external: true\` to skip prefetch — \`external\` controls click handling (opens in new tab via \`target="_blank"\`), not prefetch. Use \`prefetch="none"\` if you want to skip prefetch for an internal link
- Building a custom anchor wrapper from scratch instead of using \`createLink\` or \`useLink\` — the prefetch cache, keyboard-modifier guard, active-state class composition, and SSR-safe document.head injection are non-trivial`,
  },

  'zero/useLink': {
    signature: 'function useLink(props: LinkProps): UseLinkReturn',
    example: `import { useLink } from '@pyreon/zero/link'

function CardLink(props: LinkProps) {
  const link = useLink(props)
  return (
    <div
      ref={link.ref}
      class={\`card \${link.classes()}\`}
      onClick={link.handleClick}
      onMouseEnter={link.handleMouseEnter}
      onTouchStart={link.handleTouchStart}
    >
      {props.children}
    </div>
  )
}`,
    notes: 'Composable that returns all link behavior — `{ ref, handleClick, handleMouseEnter, handleTouchStart, isActive, isExactActive, classes }`. Use when `createLink` is too opinionated (e.g. you need a `<button>` link, a card-shaped link, or want to compose with another framework primitive). Internals: hover/viewport prefetch via IntersectionObserver, keyboard-modifier guard (Cmd+click opens new tab), active/exact-active path matching, class-string composition. See also: Link, createLink, UseLinkReturn.',
    mistakes: `- Reading \`link.classes\` as a plain string — it's a \`() => string\` accessor. Call it inside reactive scopes (JSX expression thunks, \`class={link.classes}\`) so the active class updates on route change
- Forgetting to wire \`link.ref\` to the root element under \`prefetch="viewport"\` — without the ref the IntersectionObserver has nothing to observe; viewport-based prefetch never fires
- Calling \`link.handleClick(e)\` synchronously in the component body — handlers are meant to be JSX event props (\`onClick={link.handleClick}\`); synchronous invocation in the render body triggers \`router.push\` during render which the lint rule \`no-imperative-navigate-in-render\` flags
- Mixing \`useLink\` + a router instance from a different \`RouterProvider\` — \`useLink\` reads the nearest router context; multi-router apps need explicit context boundaries
- Treating \`useLink\` as setup-only (calling it conditionally inside an effect) — like all hooks, call it at the top of the component body. The ref / handlers are stable across re-renders
- Forgetting that \`external: true\` bypasses the click handler entirely — \`useLink\` still returns handlers but \`handleClick\`'s body short-circuits when \`props.external\` is true; the wrapped element should let the native anchor \`target="_blank"\` semantics handle the rest`,
  },

  'zero/createLink': {
    signature: 'function createLink(Component: (p: LinkRenderProps) => any): (props: LinkProps) => any',
    example: `import { createLink } from '@pyreon/zero/link'

const ButtonLink = createLink((props) => (
  <button
    ref={props.ref}
    class={props.class}
    onClick={props.onClick}
    onMouseEnter={props.onMouseEnter}
  >
    {props.children}
  </button>
))

<ButtonLink href="/dashboard" activeClass="active">Dashboard</ButtonLink>`,
    notes: 'HOC that wraps any component with link behavior. The wrapped component receives `LinkRenderProps` with all handlers + state pre-wired (`href`, `ref`, `onClick`, `onMouseEnter`, `onTouchStart`, `isActive`, `isExactActive`, `class`, `target`, `rel`). Use this to build styled link variants (button-links, card-links, design-system anchors) without re-implementing the prefetch + active-state machine. See also: Link, useLink, LinkRenderProps.',
    mistakes: `- Not forwarding \`props.ref\` to the rendered element — the prefetch IntersectionObserver and active-state observer both need a real DOM ref to attach to
- Calling the user-provided \`props.class\` as a function in JSX (\`class={props.class()}\`) — \`class\` is a string-or-accessor union; pass it directly (\`class={props.class}\`) and let the renderer call it if needed
- Forgetting \`onTouchStart\` — mobile devices don't fire mouseenter; without \`onTouchStart\` mobile users get no prefetch benefit
- Re-rendering the wrapped component on every router event — the HOC calls \`useLink\` ONCE per component instance, returns stable handlers, and the route signal is reactive at the granularity of \`isActive\` / \`classes\`. Don't memoize the wrapper output manually
- Building separate wrappers for \`<button>\` vs \`<a>\` vs \`<div>\` instead of having ONE styled wrapper that accepts a \`tag\` prop — \`createLink\` only handles the link logic; the rendered tag choice is the consumer's structural decision
- Expecting \`createLink\` to handle \`external: true\` semantics on a non-anchor component — \`target\` and \`rel\` are forwarded as RenderProps but \`<button target="_blank">\` does nothing; for external links rendered as buttons, the consumer must handle \`window.open()\` explicitly`,
  },

  'zero/prefetchRoute': {
    signature: 'function prefetchRoute(href: string): void',
    example: `import { prefetchRoute } from '@pyreon/zero/link'

// On user hovering a card, prefetch the linked route's chunk
<Card onMouseEnter={() => prefetchRoute('/posts/' + post.id)}>...</Card>`,
    notes: `Imperatively prefetch a route's JS chunk by injecting \`<link rel="prefetch">\` + \`<link rel="modulepreload">\` into \`document.head\`. Deduplicates — calling twice with the same \`href\` is a no-op. Backed by an LRU cache (MAX 200 entries) that evicts oldest entries AND removes their DOM nodes to prevent head-bloat across long SPA sessions. See also: Link, useLink.`,
  },

  'zero/Icon': {
    signature: '<Icon as={ImportedSvgComponent} | svg={rawSvgMarkupString} {...hostProps} />',
    example: `import { Icon } from '@pyreon/zero'
import Check from './check.svg?component'
import checkRaw from './check.svg?raw'

// Component form — rendered directly, no wrapper, reliable fill:
<span style="width:2rem"><Icon as={Check} /></span>

// Raw-markup form — inlined inside one <span> host:
<span style="width:2rem"><Icon svg={checkRaw} /></span>`,
    notes: `Renders a FULL loaded SVG — it does NOT synthesize its own \`<svg>\` around hand-authored \`<path>\` children. You load an svg (it already contains the \`<svg>\` root) and Icon makes it container-sizable + theme-aware. Two source props: \`as\` — an imported SVG *component* (\`import X from './x.svg?component'\`), rendered DIRECTLY with no host wrapper (recommended; it's a real \`<svg>\` so container-fill is reliable); \`svg\` — the raw \`<svg>…</svg>\` *markup string* (\`import x from './x.svg?raw'\`), inlined via a single \`<span>\` host (a markup string needs a parent to mount — this one host is unavoidable for the string form). Defaults (\`fill="currentColor"\`, \`display:block;width:100%;height:100%\`) are overridable — consumer props spread through and win. No fixed size → fills its container; \`fill="currentColor"\` themes via CSS \`color\`. Intentionally no \`useIcon\` hook (an icon has no composable behaviour); two layers: \`createIcon\` (one component per loaded glyph) + \`Icon\` (one-off). See also: createIcon, IconProps, Image.`,
    mistakes: `- Expecting \`<Icon>\` to synthesize an \`<svg>\` from \`<path>\` children — it does NOT. Pass a loaded svg via \`as\` (imported \`?component\`) or \`svg\` (imported \`?raw\` string). Children are not the API
- Expecting \`<Icon>\` to size itself — it has NO intrinsic size; it fills its container. Wrap + size it (\`<span style="width:1.5rem">\`) or use a sized flex/grid cell
- Hardcoding \`fill="#000"\` — breaks theming. Leave the \`currentColor\` default; drive colour with CSS \`color\` so dark mode + hover work for free. Only the \`as\` form forwards \`fill\` to the real svg — the \`svg\`-string form's markup is opaque, so colour it via \`currentColor\` inside the asset
- Expecting svg-only props (\`viewBox\`, \`fill\`) to apply in the \`svg\`-string form — they can't reach the opaque inlined markup; only host attrs (\`class\`, \`style\`, \`aria-*\`, events) forward. Use the \`as\` form when you need to drive svg attributes
- Reaching for a \`useIcon\` hook — there isn't one, by design. Use \`createIcon\` or inline \`<Icon>\`; an icon has no behaviour worth a hook layer
- Preferring \`svg\` (raw string) for the wrapper-free guarantee — it's the opposite: \`svg\` ALWAYS adds a \`<span>\` host (unavoidable for string inlining); \`as\` is the zero-wrapper form`,
  },

  'zero/createIcon': {
    signature: 'function createIcon(source: string | SvgComponent): (props: SvgAttributes) => VNodeChild',
    example: `import { createIcon } from '@pyreon/zero'
import StarSvg from './star.svg?component'
import checkRaw from './check.svg?raw'

export const Star = createIcon(StarSvg)     // component → rendered directly
export const Check = createIcon(checkRaw)   // raw string → inlined via <span>

// Sized + themed entirely by the consumer:
<span style="width:48px"><Check class="text-green-600" aria-label="done" /></span>`,
    notes: `Builds a reusable icon component from a LOADED svg — a raw \`<svg>…</svg>\` markup string (\`?raw\`) OR an imported SVG component (\`?component\`). The result is still just \`<Icon>\` (string → \`svg\` prop, component → \`as\` prop), so it's container-sizable + theme-aware with every prop passed through. A generated icon set is \`createIcon\`-per-glyph with zero per-icon boilerplate. Mirrors the \`createLink\`/\`createImage\` factory layer, minus a hook (icons have no composable behaviour). See also: Icon, IconProps, createNamedIcon, iconsPlugin.`,
    mistakes: `- Calling \`createIcon\` inside a component body — define icon components at module scope (like \`createLink\`/\`createImage\`). Re-creating the component every render defeats identity-based reconciliation
- Passing hand-built \`<path>\` JSX as \`source\` — \`source\` is a full loaded svg: a \`?raw\` markup string OR a \`?component\` import. It does NOT take individual shapes; the loaded asset already contains its own \`<svg>\` root
- Assuming the \`?raw\` form has no wrapper — the string form ALWAYS adds one \`<span>\` host (unavoidable for inlining markup). Use the \`?component\` form for the zero-wrapper, attribute-forwarding path`,
  },

  'zero/iconsPlugin': {
    signature: `iconsPlugin({ dir | sets, out?, mode?: 'inline' | 'image' }): Plugin`,
    example: `// vite.config.ts — single set:
import { iconsPlugin } from '@pyreon/zero/server'
iconsPlugin({ dir: './src/icons' })
// app (PREFERRED — tree-shakeable, unused icons dropped):
import { CheckCircle } from './icons.gen'
<span style="width:2rem"><CheckCircle /></span>
// dynamic / data-driven name (escape hatch — retains the whole set):
import { Icon } from './icons.gen'; <Icon name={iconKey()} />

// Named multi-set — per-set typed components, no IconName clash:
iconsPlugin({ sets: {
  ui:    { dir: './src/icons/ui' },
  brand: { dir: './src/icons/brand', mode: 'image' },
}})
// app: per-icon bindings are namespaced by set (UiArrowLeft / BrandLogoMark):
import { UiArrowLeft, BrandIcon } from './icons.gen'`,
    notes: `Vite plugin (from \`@pyreon/zero/server\`): point it at a folder of \`*.svg\` files and it writes a strictly-typed generated \`icons.gen.tsx\` exporting \`<Icon name="…" />\`. Add an svg → the \`name\` union widens; remove one → an invalid \`name\` fails typecheck. The generated file calls \`createNamedIcon(REGISTRY)\`, so \`keyof typeof REGISTRY\` IS the type surface (autocomplete + real go-to-definition, zero per-app wiring — same one-touch shape as fs-router / islands auto-registry). Regenerates on add/unlink in dev (idempotent write — never rewrites identical content). **Named multi-set form** (\`sets: { ui: { dir }, brand: { dir, mode } }\`, mutually exclusive with \`dir\`): one generated file exports a strictly-typed component PER set with NAMESPACED types so they never clash — \`ui\` → \`<UiIcon name="…" />\` + \`type UiIconName\`, \`brand\` → \`<BrandIcon name="…" />\` + \`type BrandIconName\`; per-set binding prefixes mean two sets sharing a glyph filename don't collide. Two render modes per the colorful-vs-system split (settable per-set): \`mode: 'inline'\` (default — system icons; each svg inlined as raw \`?raw\` markup, \`currentColor\`-themeable, recolor via CSS \`color\`) and \`mode: 'image'\` (colorful / brand icons; each svg emitted as a static asset, rendered \`<img>\`, NO mutation, original colors preserved). Default \`out\` is \`icons.gen.tsx\` next to \`dir\` for the single-set form (\`src/icons\` → \`src/icons.gen.tsx\`) or \`src/icons.gen.tsx\` for the multi-set form — recommend gitignoring it (build artifact). It writes a real file (NOT a virtual module) deliberately: the published \`@pyreon/zero\` package can't \`import\` a plugin virtual module — Rolldown resolves static imports before plugin \`resolveId\` (the same constraint that makes islands need \`hydrateIslandsAuto(registry)\` with an explicit import). **In inline mode the generated file exports TWO shapes: (1) per-icon PascalCase components (\`export const CheckCircle = /*#__PURE__*/ createIcon(...)\`) — the PREFERRED surface, tree-shakeable by standard ESM dead-code elimination, so \`import { CheckCircle } from './icons.gen'\` drops every unused icon AND the runtime registry from the bundle; (2) \`<Icon name="…" />\` — the runtime \`registry[name]\` lookup, kept as the escape hatch for DYNAMIC / data-driven names (\`<Icon name={cmsKey} />\`), which necessarily retains the whole set. Bounded, statically-named sets should import the per-icon bindings; image-mode sets stay registry-only (\`createIcon\` renders raw \`?raw\` markup, not an \`<img>\`).** See also: createNamedIcon, Icon, IconProps.`,
    mistakes: `- Reaching for \`<Icon name="close" />\` for a bounded, statically-known set — that's the dynamic escape hatch and a \`registry[name]\` lookup retains EVERY icon. Import the per-icon binding (\`import { Close } from './icons.gen'; <Close />\`) so unused icons tree-shake out
- Passing BOTH \`dir\` and \`sets\` (or neither) — exactly one is required; the plugin throws \`[Pyreon] iconsPlugin: provide EXACTLY ONE of dir or sets\` at config time
- Using \`mode: 'inline'\` (default) for multicolor / brand SVGs — inline mode is for monochrome system icons you recolor via \`currentColor\`. A multicolor logo's hardcoded fills survive but you lose nothing by using \`mode: 'image'\`, which is the correct choice for no-mutation colorful assets
- Using \`mode: 'image'\` for icons you need to recolor — \`<img>\` can't be themed via CSS \`color\`; the svg is opaque. Recolorable system icons need \`mode: 'inline'\`
- Editing the generated \`icons.gen.tsx\` by hand — it's regenerated on every add/unlink. Add/remove \`.svg\` files in the set folder(s) instead; commit the gitignore entry, not the file
- Expecting a virtual \`import 'virtual:zero/icons'\` — there isn't one (Rolldown import-ordering constraint). The plugin writes a REAL file you import by path; that's what gives go-to-definition + zero wiring
- Pointing a set \`dir\` at a folder that doesn't exist yet — \`scanIconDir\` returns empty and the generated \`*IconName\` is \`never\` (every \`name\` fails typecheck). Create the folder + drop at least one \`.svg\` first
- Forgetting \`vite/client\` types — the generated file's \`?raw\` imports rely on Vite's ambient \`*.svg?raw\` module declaration; the generated file emits \`/// <reference types="vite/client" />\` but the consuming tsconfig must still resolve \`vite/client\``,
  },

  'zero/createNamedIcon': {
    signature: `function createNamedIcon<R extends Record<string, string>>(registry: R, options?: { mode?: 'inline' | 'image' }): (props: { name: keyof R & string } & …) => VNodeChild`,
    example: `// icons.gen.tsx (auto-generated by iconsPlugin):
import { createNamedIcon } from '@pyreon/zero'
export const Icon = createNamedIcon({ 'check-circle': '<svg…>…</svg>' })

// image mode (hand-maintained colorful set):
import logo from './logo.svg' // Vite → URL
export const Brand = createNamedIcon({ logo }, { mode: 'image' })
<Brand name="logo" alt="Company" />`,
    notes: `Runtime half of \`iconsPlugin\` — builds a strictly-typed \`<Icon name="…" />\` from a name→source registry. \`keyof R\` makes \`name\` a precise string union (the generated file passes a literal registry so the union infers there → autocomplete + go-to-definition). \`mode: 'inline'\` (default) treats each \`source\` as raw \`<svg>\` markup rendered via \`Icon\` (\`currentColor\`-themeable system icons); \`mode: 'image'\` treats each \`source\` as an asset URL rendered \`<img>\` with NO mutation (colorful / brand icons). Either way it stays container-filling + props-transparent. **This is the DYNAMIC-name surface — a \`registry[name]\` lookup necessarily retains the WHOLE icon set in the bundle (it can't tree-shake an unknown runtime key). Use it for data-driven names (\`<Icon name={cmsKey} />\`); for a bounded, statically-named set prefer the per-icon \`createIcon\`-backed bindings the generated file also exports (\`import { CheckCircle } from './icons.gen'\`), which tree-shake.** Not normally hand-called — \`iconsPlugin\` emits the generated file that calls it; call it directly only for a hand-maintained set. See also: iconsPlugin, Icon, IconProps.`,
    mistakes: `- Passing a \`Record<string, string>\` typed loosely (e.g. \`: Record<string, string>\`) — that widens \`keyof R\` to \`string\` and you lose the typed \`name\`. Pass the object literal directly (or \`as const\`) so the keys infer
- Using \`mode: 'image'\` then expecting \`fill\` / svg props to apply — the \`<img>\` is opaque; only host attrs (\`class\`, \`style\`, \`alt\`, events) forward. Use \`mode: 'inline'\` for svg-attribute control
- Omitting \`alt\` in \`mode: 'image'\` — it defaults to \`""\` (decorative). Pass a real \`alt\` for meaningful icons; screen readers skip empty-alt images
- Calling \`createNamedIcon\` inside a component body — define the set once at module scope (the generated file does). Re-creating it per render defeats identity-based reconciliation`,
  },

  'zero/Image': {
    signature: '<Image src={descriptor | url} alt={alt} width? height? optimize? priority loading="lazy" placeholder={blurUrl} /> — bi-modal `src`: a `?optimize` ProcessedImage descriptor (Shape A, dims inferred) OR a runtime string URL (Shape B, width+height then REQUIRED)',
    example: `import { Image } from '@pyreon/zero/image'
import hero from './hero.jpg?optimize'

// Shape A — descriptor as src (dims + srcset + formats inferred)
<Image src={hero} alt="Hero" priority />
// (legacy spread form still works: <Image {...hero} alt="Hero" />)

// Shape B — runtime string URL: width + height REQUIRED
<Image src="/hero.jpg" alt="Hero" width={1200} height={630} />

// Opt out of optimization for one image (bare <img>)
<Image src={logo} alt="Logo" optimize={false} />

// Force optimization back ON inside a <NoOptimize> boundary
<NoOptimize>
  <Image src={hero} alt="Hero" optimize />
</NoOptimize>

// Raw mode — skip ALL wrappers (custom layout)
<Image src="/bg.jpg" alt="" width={400} height={300} raw />`,
    notes: `Default optimized image. **Bi-modal \`src\` (post-0.28)**: pass a \`?optimize\` descriptor as \`src\` (Shape A — width / height / srcset / formats / placeholder all carried by the descriptor, you supply only display props) OR a runtime string URL (Shape B — \`width\` + \`height\` are REQUIRED at the type level so a remote / signal-driven URL can't silently cause CLS). Optimization = lazy loading via IntersectionObserver, automatic aspect-ratio for CLS prevention, responsive srcset, multi-format \`<picture>\`, blur-up placeholder, \`fetchPriority="high"\` for LCP images. The \`optimize\` prop opts out / back in: \`false\` bypasses the pipeline and renders a bare \`<img>\`; \`true\` forces optimization ON even inside an outer \`<NoOptimize>\` boundary (caller intent wins); omitted respects the surrounding \`<NoOptimize>\` if present, else full optimization. Built on \`createImage\` so consumers layer rocketstyle / custom wrappers via \`createImage(MyStyledImage)\` without losing the pipeline. \`raw: true\` is the hard escape hatch — a bare \`<img>\` with no container, no lazy load, no aspect-ratio enforcement. See also: useImage, createImage, OptimizedImage, NoOptimize, ImageProps, ImageRenderProps.`,
    mistakes: `- Passing a runtime string URL (Shape B) without \`width\` + \`height\` — both are REQUIRED at the type level for that shape (CLS prevention). Only the \`?optimize\` descriptor form (Shape A) infers them
- Setting \`priority\` on below-the-fold images — \`priority\` disables lazy loading AND adds \`fetchPriority="high"\`. Reserve it for the LCP image only (typically the hero)
- Setting \`loading="eager"\` AND \`priority\` — they're redundant; \`priority\` already implies eager. Pick one (\`priority\` is the LCP-marker; \`loading="eager"\` is the no-priority eager hint)
- Using \`placeholder\` as a full-resolution image — it should be a tiny base64 data URI or a /placeholder.jpg (~1-2 KB). Large placeholders defeat the purpose by blocking initial paint
- Expecting \`optimize={false}\` to still emit a srcset — \`false\` bypasses the WHOLE pipeline (bare \`<img>\`). It's for opting a single image OUT; use \`<NoOptimize>\` for a subtree and \`optimize\` (true) to opt one image back in
- Reaching for the legacy spread (\`<Image {...hero} />\`) when the descriptor-as-\`src\` form (\`<Image src={hero} />\`) is now canonical and keeps \`alt\` a required, separate prop the type system enforces
- Wrapping \`<Image>\` in a \`<picture>\` manually for WebP/AVIF — \`formats\` already does this via \`imagePlugin\`. Manual \`<picture>\` defeats the optimization`,
  },

  'zero/OptimizedImage': {
    signature: '<OptimizedImage source={img} alt={alt} priority={false} />',
    example: `import { OptimizedImage } from '@pyreon/zero/image'
import hero from './hero.jpg?optimize'

<OptimizedImage source={hero} alt="Hero" priority />`,
    notes: 'One-prop form of `<Image>` for `?optimize` imports. `<Image {...hero} alt="…" />` already works, but spreading by hand makes it easy to drop a field — the #1 real-world CLS cause is pulling just `hero.src` onto a raw `<img>` and losing width / height / srcset / placeholder. `<OptimizedImage source={hero} alt="…" />` takes the whole descriptor as a single prop, so every optimization field reaches `<Image>` by construction. Display props (`alt`, `sizes`, `priority`, `loading`, `class`, `style`, `fit`, `decoding`, `raw`) pass through alongside `source`. The companion opt-in lint rule `pyreon/no-discarded-optimize-fields` flags the discard shape (`<img src={hero.src}>`) and points here. See also: Image, ProcessedImage, useImage.',
    mistakes: `- Pulling just \`hero.src\` onto a raw \`<img src={hero.src}>\` — that discards width / height / srcset / placeholder / formats (CLS + no responsive images). Pass the whole descriptor: \`<OptimizedImage source={hero} />\`
- Forgetting \`alt\` — it is required for accessibility and is NOT part of the \`?optimize\` descriptor, so \`source\` alone never supplies it`,
  },

  'zero/useImage': {
    signature: 'function useImage(props: ImageProps): UseImageReturn',
    example: `import { useImage } from '@pyreon/zero/image'

function FigureImage(props: ImageProps) {
  const img = useImage(props)
  return (
    <figure ref={img.containerRef} style={img.containerStyle}>
      <img
        src={img.src}
        srcSet={img.srcSet}
        sizes={img.sizes}
        alt={props.alt}
        width={props.width}
        height={props.height}
        loading={img.loading}
        onLoad={img.handleLoad}
        style={img.imageStyle}
      />
      <figcaption>{props.alt}</figcaption>
    </figure>
  )
}`,
    notes: `Composable that returns resolved image attributes + signals — \`{ containerRef, inView, loaded, src, srcSet, sizes, aspectRatio, containerStyle, imageStyle, placeholderStyle, loading, fetchPriority, handleLoad, formats, hasFormats }\`. Use for full control when \`createImage\`'s default \`<div><img/></div>\` structure is wrong (e.g. \`<figure>\` + \`<figcaption>\`, custom container layouts, overlay elements). Reactive accessors (\`src\`, \`srcSet\`, \`imageStyle\`, \`placeholderStyle\`) re-evaluate on \`inView()\` flip — wire them as JSX expressions for fine-grained updates. See also: Image, createImage, UseImageReturn.`,
    mistakes: `- Reading \`img.src\` as a plain string — it's a \`() => string\` accessor that returns empty string until \`inView()\` triggers. Pass it as a JSX attribute (\`src={img.src}\`) so the renderer wraps it in a reactive binding
- Forgetting to wire \`img.containerRef\` — without the ref, IntersectionObserver has nothing to observe; lazy images never enter view, never load
- Calling \`img.handleLoad()\` from your own code — \`handleLoad\` is the \`<img>\`'s \`onLoad\` handler. Wire it as \`onLoad={img.handleLoad}\`; calling it manually marks the image as loaded prematurely (placeholder fades out before the image arrives)
- Spreading \`useImage\` return on the \`<img>\` directly (\`<img {...img}/>\`) — most fields aren't \`<img>\` attributes (\`containerRef\`, \`aspectRatio\`, \`imageStyle\`, \`placeholderStyle\`, \`hasFormats\`). Pick the fields you need
- Ignoring \`img.hasFormats\` — if \`formats\` is set, you should render a \`<picture>\` with per-format \`<source>\` elements; \`img.srcSet()\` returns empty string under formats mode (the format-specific srcsets live on \`<source>\`)
- Treating \`useImage\` as setup-only — like all Pyreon hooks, call it at the top of the component body. The container ref + signals are stable across re-renders`,
  },

  'zero/createImage': {
    signature: 'function createImage(Component: (p: ImageRenderProps) => any): (props: ImageProps) => any',
    example: `import { createImage } from '@pyreon/zero/image'

const FigureImage = createImage((props) => (
  <figure ref={props.containerRef} class={props.class} style={props.containerStyle}>
    {props.placeholder}
    {props.image}
    <figcaption>Caption</figcaption>
  </figure>
))

<FigureImage src="/hero.jpg" alt="Hero" width={1200} height={630} placeholder="/blur.jpg" />`,
    notes: 'HOC that wraps any component with image optimization. The wrapped component receives `ImageRenderProps` with pre-rendered `placeholder` JSX (null when no placeholder set) + pre-rendered `image` JSX (bare `<img>` OR `<picture>` tree depending on formats), the container ref, container styles, and class. Consumer composes those pieces with whatever wrapper element / extra layout (overlay, badge, caption). See also: Image, useImage, ImageRenderProps.',
    mistakes: `- Forgetting to render \`props.image\` — without it, the actual \`<img>\` never appears in the DOM. The HOC pre-renders the bare \`<img>\` or \`<picture>\` tree; the consumer just needs to place it
- Conditionally rendering \`props.placeholder\` — it's already conditional (null when no \`placeholder\` prop set). Always render it; React/Pyreon ignore null children
- Forwarding \`props.containerStyle\` to a child instead of the container — the styles (aspect-ratio, position: relative, overflow: hidden) MUST apply to the element holding \`props.containerRef\`. Otherwise CLS prevention breaks AND IntersectionObserver observes the wrong element
- Building \`placeholder\` JSX from scratch — \`createImage\` already constructs the blur-up \`<img>\` with the right styles. Just render \`{props.placeholder}\`; don't reach into \`useImage().placeholderStyle()\` manually
- Passing \`raw: true\` to a \`createImage\`-wrapped component — \`raw\` short-circuits BEFORE \`createImage\`'s wrapped component runs (returns bare \`<img>\`). The wrapped component never receives \`ImageRenderProps\` in raw mode. Documented as the no-optimization escape hatch
- Re-implementing the \`<picture>\` switch — \`props.image\` already handles the formats branch. Wrapping \`props.image\` in another \`<picture>\` produces nested \`<picture>\` which browsers ignore (the outer wins)`,
  },

  'zero/Script': {
    signature: '<Script src={url} strategy="afterHydration" id={uniqueId} async={true} onLoad={cb} onError={cb} />',
    example: `import { Script } from '@pyreon/zero/script'

// Load analytics after page is interactive
<Script src="https://analytics.example.com/script.js" strategy="onIdle" id="analytics" />

// Load chat widget when scrolled into view
<Script src="/chat-widget.js" strategy="onViewport" />

// Inline script with deferred execution
<Script strategy="afterHydration">{\`console.log("App hydrated!")\`}</Script>`,
    notes: 'Default optimized third-party script loader. Strategies: `beforeHydration` (in HTML already), `afterHydration` (inject on mount — default), `onIdle` (via `requestIdleCallback`), `onInteraction` (on first click/scroll/keydown/touchstart), `onViewport` (when sentinel enters viewport). Built on `createScript` — consumers can render loading indicators, retry buttons, or analytics-readiness gates via `createScript(MyCustom)` without re-implementing the strategy machine. Returns a 0×0 sentinel `<div>` for `onViewport` strategy, `null` otherwise. See also: useScript, createScript, ScriptProps, ScriptStrategy.',
    mistakes: `- Setting \`strategy="onInteraction"\` for analytics that needs first-paint metrics — by definition, onInteraction loads AFTER the first user interaction; first-paint metrics from such a script are useless. Use \`onIdle\` for analytics that needs LCP / FCP capture
- Forgetting \`id\` for scripts that might mount in multiple places — without \`id\`, dedup doesn't fire and the script loads twice. Always provide \`id\` for analytics / tracking / third-party widgets
- Mixing \`src\` + \`children\` — \`children\` is the inline script body; \`src\` is the URL. If BOTH are set, \`src\` wins and \`children\` is ignored (the dom script.src takes precedence). Use one or the other
- \`strategy="beforeHydration"\` without actually putting the \`<script>\` in the HTML — beforeHydration is a NO-OP marker; the script must already exist in the SSR-emitted HTML. Use SSR \`<script>\` tag injection in your entry-server, not \`<Script>\`
- Setting \`async={false}\` for non-critical scripts — \`async={false}\` blocks parser; reserve for scripts that MUST execute in order (rare for third-party). Default is true
- Expecting \`onError\` to fire for inline scripts — only \`src\`-based scripts trigger onerror via the browser. Inline scripts (\`children\`) execute synchronously; runtime exceptions don't propagate to \`onError\``,
  },

  'zero/useScript': {
    signature: 'function useScript(props: ScriptProps): UseScriptReturn',
    example: `import { useScript } from '@pyreon/zero/script'

function TrackedScript(props: ScriptProps) {
  const s = useScript(props)
  return (
    <>
      {() => s.pending() && <Spinner />}
      {() => s.errored() && <button onClick={() => location.reload()}>Retry</button>}
      {s.needsSentinel && <div ref={s.sentinelRef} style="width:0;height:0" />}
    </>
  )
}`,
    notes: 'Composable returning script load-state signals + sentinel ref — `{ sentinelRef, loaded, errored, pending, needsSentinel, load }`. Reactive signals (`loaded`, `errored`, `pending`) let consumers render loading indicators, retry buttons, or analytics-readiness gates without re-implementing the strategy machine. `needsSentinel` is true ONLY for `onViewport` strategy. `load()` is the imperative escape hatch (strategy normally triggers it; rarely needed). See also: Script, createScript, UseScriptReturn.',
    mistakes: `- Reading \`s.loaded\` / \`s.errored\` / \`s.pending\` as booleans — they're \`() => boolean\` accessors. Call them inside reactive scopes (JSX thunks, \`effect()\`) so the UI updates when state changes
- Forgetting \`s.needsSentinel\` and always rendering a sentinel — non-onViewport strategies don't need one; rendering a div anyway is harmless but reads as wrong
- Calling \`s.load()\` in the component body — the strategy already calls it (afterHydration runs it on mount, onInteraction on first interaction, etc.). Manual \`load()\` typically duplicates the request (unless \`id\` is set for dedup)
- Wiring \`s.sentinelRef\` to a non-DOM element — IntersectionObserver needs a real Element. A \`null\` or detached ref means viewport-based load never fires
- Expecting \`s.pending()\` to start true for \`afterHydration\` — it doesn't. \`afterHydration\` is the synchronous-load strategy; pending only starts true for \`onIdle\` / \`onInteraction\` / \`onViewport\` (where the load is deferred)
- Using \`s.errored()\` to suppress retry-on-mount — \`errored\` is set when the script's onerror fires, NOT when a previous mount errored. Multi-mount apps need their own retry budget tracking`,
  },

  'zero/createScript': {
    signature: 'function createScript(Component: (p: ScriptRenderProps) => any): (props: ScriptProps) => any',
    example: `import { createScript } from '@pyreon/zero/script'

const StatusScript = createScript((props) => (
  <div>
    {() => props.pending() && <span>Loading analytics...</span>}
    {() => props.errored() && <span>Analytics failed to load</span>}
    {props.needsSentinel && <div ref={props.sentinelRef} style="width:0;height:0" />}
  </div>
))

<StatusScript src="/analytics.js" strategy="onIdle" id="analytics" />`,
    notes: 'HOC that wraps any component with script load behavior. The wrapped component receives `ScriptRenderProps` with the sentinel ref, load-state signals (`loaded`, `errored`, `pending`), and `needsSentinel` flag. Use this to render loading indicators, retry UI, or analytics-readiness gates around the script load lifecycle. See also: Script, useScript, ScriptRenderProps.',
    mistakes: `- Always rendering \`<div ref={props.sentinelRef} .../>\` regardless of \`needsSentinel\` — for non-onViewport strategies the ref is \`undefined\`. Gate the sentinel render on \`props.needsSentinel\`
- Calling \`props.loaded()\` / \`props.errored()\` / \`props.pending()\` outside reactive scopes — they're accessors; outside JSX thunks they capture the value at setup time and never update
- Forgetting that the wrapped component's render output doesn't affect script loading — the script load fires in \`useScript\`'s \`onMount\` regardless of what the wrapped component returns (null, div, fragment). The wrapper is purely a UI surface
- Building a custom strategy machine in the wrapped component — the strategy is already resolved by \`useScript\`. The wrapped component just observes the resulting signals
- Forwarding \`props.sentinelRef\` to multiple elements — \`useIntersectionObserver\` observes ONE element. Multi-ref forwarding produces undefined behavior (the last-attached element wins)
- Expecting the wrapped component to fire \`onLoad\` / \`onError\` — those callbacks are on the \`ScriptProps\` (passed to the OUTER component), not on the wrapped component. The wrapped component reads \`props.loaded()\` / \`props.errored()\` signals to react to the same events`,
  },

  'zero/createImageRegistry': {
    signature: '(entries: GlobRecord | Record<K, GlobEntry>, options?: ImageRegistryOptions): ImageRegistry<K>',
    example: `const logos = createImageRegistry(
  import.meta.glob('../assets/partners/*.png', { eager: true })
)

function PartnerLogos({ partners }: { partners: string[] }) {
  return partners.map((name) => (
    <Image src={logos(name)} alt={name + ' logo'} />
  ))
}`,
    notes: `Collapses N hand-written image imports into one typed accessor. Takes Vite's \`import.meta.glob\` output (or a \`Record<string, ProcessedImage>\`) and returns a function that resolves a name to its full descriptor — width, height, srcset, placeholder, formats preserved end-to-end. Enables the icon-set / logo-list pattern: render the right image from a lookup, composing with the full optimization pipeline for free. By default aliases both \`basename.ext\` and \`basename\` (no extension) so you have multiple lookup styles; pass \`keyBy: 'path'\` to disable aliases when you have filename collisions across directories. See also: Image, OptimizedImage, ProcessedImage.`,
    mistakes: `- Forgetting \`{ eager: true }\` on the glob — lazy imports return Promises, not descriptors, and the registry can't use them synchronously
- Calling \`logos(name)\` without a fallback when the name might not exist throws in dev and crashes in prod — use \`logos(name, defaultDesc)\` instead
- Relying on basename aliases when you have collisions (e.g., \`logos/strv.png\` and \`icons/strv.png\` both named \`strv.png\`) — use \`keyBy: 'path'\` to disambiguate
- Assuming the registry preserves the full glob path — it aliases to basename by default, so \`r('strv')\` and \`r('logos/strv.png')\` both work
- Not calling \`.has(name)\` before \`.get(name)\` when the name is user-supplied, leaving yourself vulnerable to throwing errors`,
  },

  'zero/NoOptimize': {
    signature: '(props: { disabled?: boolean, children?: VNodeChild }): VNodeChild',
    example: `// Disable optimization for an entire icon library
export default function IconLibraryRoute() {
  return (
    <NoOptimize>
      <Image src={icon1} alt="Heart" width={24} height={24} />
      <Image src={icon2} alt="Star"  width={24} height={24} />
    </NoOptimize>
  )
}

// Mixed: outer disables, inner re-enables
<NoOptimize>
  <Icons />
  <NoOptimize disabled>
    <Image src={hero} alt="Hero" /> {/* still optimized */}
  </NoOptimize>
</NoOptimize>`,
    notes: 'Subtree boundary that disables `<Image>` optimization for every descendant — drops them all to bare `<img>` elements (no IntersectionObserver wrapper, no aspect-ratio container, no lazy loading). Useful for icon-heavy routes, server-rendered cached HTML (emails, PDFs, OG cards), or hand-crafted `<picture>` markup. Set `disabled: true` to re-enable optimization for a specific inner subtree (nested override pattern). Per-call `optimize={true}` on an `<Image>` also overrides a parent boundary — caller intent wins. See also: Image, useNoOptimize.',
    mistakes: `- Wrapping \`<NoOptimize>\` around non-Image components expects them to respect the context — they don't, only \`<Image>\` reads it
- Using \`disabled={false}\` (or omitting it) on a nested \`<NoOptimize>\` is a no-op — pass \`disabled={true}\` to override a parent boundary
- Relying on \`<NoOptimize>\` when you actually need \`zero({ image: false })\` for a global opt-out — boundaries are subtree-scoped only
- Combining \`<NoOptimize>\` with \`optimize={false}\` on the same \`<Image>\` is redundant (both disable, but double-disabling is confusing to readers)
- Expecting \`<NoOptimize>\` to affect external third-party image components — it only works with Pyreon's \`<Image>\``,
  },

  'zero/imagePlugin': {
    signature: '(config?: ImagePluginConfig): Plugin',
    example: `// vite.config.ts — explicit wiring (optional if using zero plugin)
import { imagePlugin } from '@pyreon/zero/image-plugin'

export default {
  plugins: [
    pyreon(),
    zero(),
    imagePlugin({ 
      widths: [480, 960, 1440], 
      quality: 85,
      placeholder: 'blur' 
    }),
  ],
}

// In a component — import with ?optimize
import hero from './images/hero.jpg?optimize'
<Image src={hero} alt="Hero" priority />`,
    notes: `Vite plugin that transforms image imports with \`?optimize\` / \`?component\` / \`?raw\` query params into optimized responsive images at build time. Generates multiple widths, modern formats (WebP, AVIF), tiny blur placeholders (base64 inline), and outputs optimized images to the build directory. Automatically wired by \`zero({ image: {} })\` — you typically don't need to add it manually to vite.config. In dev, uses \`/@fs/\` URLs; in build, emits assets and bakes the descriptor (src, srcset, width, height, placeholder, formats) into the JS module. See also: Image, ProcessedImage, ImagePluginConfig.`,
    mistakes: `- Forgetting \`{ eager: true }\` on glob-based image registries — async imports return Promises, not descriptors
- Misconfiguring widths (e.g., widths larger than the source) — plugin still generates them, wasting build time and space
- Not installing sharp (bun add -D sharp) — the plugin warns and falls back to copying unoptimized images, silently losing srcset/formats
- Tuning per-format quality without understanding codec tolerances — AVIF tolerates 55 where WebP needs 75 for the same perceived quality
- Mixing CDN mode (\`cdn\` provider set) with local processing expectations — CDN mode rewrites URLs, doesn't generate local assets`,
  },

  'zero/usePreloadFont': {
    signature: 'function usePreloadFont(href: string, opts?: PreloadFontOptions): void',
    example: `export default function HeroRoute() {
  usePreloadFont('/fonts/display-bold.woff2')
  return <h1 style="font-family: 'Display Bold'">Hero</h1>
}

// With explicit type override (rare):
usePreloadFont('https://cdn.example.com/brand.woff2', {
  type: 'font/woff2',
  crossorigin: 'anonymous'
})`,
    notes: 'Runtime hook to emit `<link rel="preload" as="font">` tags for fonts not declared in the global config (per-route hero fonts, conditional loads, or CDN-hosted faces). Auto-infers MIME type from file extension and enforces the `crossorigin="anonymous"` attribute required by the CSS Fonts CORS spec — without it, browsers preload then refuse to use the file and re-fetch it, causing a double-fetch penalty. See also: inferFontMimeType, PreloadFontOptions, fontPlugin.',
    mistakes: `- Forgetting that \`usePreloadFont\` must be called at component render time (during SSR), not in loaders or global code — it relies on \`@pyreon/head\`'s render-time collection
- Omitting the MIME type for non-standard extensions (e.g. \`.custom\`) — the auto-infer defaults to \`font/woff2\`, which silently breaks the preload if the extension is actually a different format; pass \`type\` explicitly
- Thinking the \`crossorigin\` attribute is optional for same-origin fonts — the CSS Fonts spec requires CORS for all font loads, even local files; the default \`'anonymous'\` is required
- Calling \`usePreloadFont\` multiple times with the same href expecting multiple preload tags — \`@pyreon/head\` deduplicates by href, so only one tag is emitted (the correct behavior)
- Using \`usePreloadFont\` for fonts already declared in \`zero({ font: { google, local } })\` — the global fontPlugin emits preload tags at build time; runtime preloads are for per-route or conditional fonts only`,
  },

  'zero/inferFontMimeType': {
    signature: 'function inferFontMimeType(href: string): string',
    example: `import { inferFontMimeType } from '@pyreon/zero'

const mimeType = inferFontMimeType('/fonts/inter.woff2')
console.log(mimeType) // 'font/woff2'

// Handles query strings and fragments:
inferFontMimeType('/fonts/x.woff2?v=123') // 'font/woff2'
inferFontMimeType('/fonts/x.ttf#variant=bold') // 'font/ttf'`,
    notes: 'Pure function that maps file extensions to IANA-registry MIME types for use in font preload `<link type=...>` tags. Handles `.woff2` → `font/woff2`, `.woff` → `font/woff`, `.ttf` → `font/ttf`, `.otf` → `font/otf`, `.eot` → `application/vnd.ms-fontobject`, and defaults unknown extensions to `font/woff2` (wrong type is less harmful than missing type, which the preload-scanner silently ignores). See also: usePreloadFont, fontImportPlugin.',
    mistakes: `- Relying on the MIME type for formats outside the five standard types (.woff2, .woff, .ttf, .otf, .eot) — the fallback is always \`font/woff2\`, which may not match your format
- Assuming the function parses the full URL — it does, but only to strip query strings and fragments before extension matching; pass only the file extension if you have a non-standard URL shape
- Using the result for purposes other than preload \`type\` attributes — MIME type inference is specifically for the CSS preload-scanner contract, not for Content-Type headers or browser format detection
- Not stripping the extension yourself if you have a custom URL parser — the function expects a path/URL with a recognizable extension, not a bare format name`,
  },

  'zero/PreloadFontOptions': {
    signature: `interface PreloadFontOptions { type?: string crossorigin?: 'anonymous' | 'use-credentials' }`,
    example: `usePreloadFont('/fonts/inter.woff2')
// Emits: <link rel="preload" as="font" href="/fonts/inter.woff2" type="font/woff2" crossorigin="anonymous">

usePreloadFont('/fonts/custom', { type: 'font/woff2' })
// Emits with explicit type override for unknown extension

usePreloadFont('/fonts/auth-required.woff2', { crossorigin: 'use-credentials' })
// For credential-bearing same-origin fonts (uncommon)`,
    notes: `Options for \`usePreloadFont\`. Both fields are optional — \`type\` is auto-inferred from the file extension, and \`crossorigin\` defaults to \`'anonymous'\` (required by the CSS Fonts CORS spec). Override \`type\` for unknown extensions; use \`'use-credentials'\` for rare credential-bearing same-origin fonts only. See also: usePreloadFont.`,
    mistakes: `- Setting \`crossorigin: 'anonymous'\` explicitly when it's the default — unnecessary but harmless; rely on the default unless you have a specific reason to use \`'use-credentials'\`
- Using \`'use-credentials'\` for cross-origin fonts — the CSS Fonts spec only allows this for same-origin loads; cross-origin fonts must use \`'anonymous'\`
- Passing a MIME type with \`charset\` (e.g. \`'font/woff2; charset=utf-8'\`) — font MIME types do not accept charset; preload-scanner will fail to match`,
  },

  'zero/fontPlugin': {
    signature: 'function fontPlugin(config: FontConfig = {}): Plugin',
    example: `// In vite.config.ts with the zero plugin:
import { zeroPlugin } from '@pyreon/zero/vite-plugin'

export default {
  plugins: [
    zeroPlugin({
      font: {
        google: ['Inter:wght@400;500;700', 'JetBrains Mono:wght@400'],
        local: [
          { family: 'Display', src: '/fonts/display-bold.woff2', weight: 700 }
        ],
        display: 'swap',
        fallbacks: {
          'Inter': { fallback: 'Arial', sizeAdjust: 1.07, ascentOverride: 90 }
        }
      }
    })
  ]
}`,
    notes: 'Vite plugin that auto-optimizes Google Fonts and local fonts declared in `zero({ font: { google, local } })`. In dev mode, injects CDN links for fast startup; in build mode, downloads fonts at build time, self-hosts them from `/assets/fonts/` with hashed filenames, injects preload + preconnect hints into the HTML, applies `font-display: swap` to prevent FOIT (Flash of Invisible Text), and optionally generates size-adjusted fallback `@font-face` rules to reduce CLS. Auto-wired by the zero plugin unless disabled via `zero({ font: false })`. See also: fontImportPlugin, FontConfig, usePreloadFont.',
    mistakes: `- Declaring fonts in both \`google\` and \`local\` with the same family name — the plugin applies all CSS at once; duplicate families cause cascade conflicts
- Using \`display: 'block'\` for all fonts — this causes FOIT (Flash of Invisible Text); \`'swap'\` is the default for a reason and avoids invisible text during font load
- Forgetting to add fallback metrics when using variable-weight fonts — without CLS-reduction fallback overrides, layout shift occurs when the custom font replaces the system fallback
- Declaring heavy fonts (e.g. all weights 100-900 of a variable font) without assessing the build-time download penalty — Google Fonts self-hosting downloads at build time; monitor your build duration
- Setting \`selfHost: false\` in dev mode thinking it skips the download — \`selfHost\` controls the BUILD mode behavior; dev always uses CDN for speed`,
  },

  'zero/fontImportPlugin': {
    signature: 'function fontImportPlugin(config: FontImportPluginConfig = {}): Plugin',
    example: `// In a component:
import display from './fonts/display-bold.woff2?font'
import inter700 from './fonts/inter.woff2?font&family=Inter&weight=700'

export default function Hero() {
  return (
    <>
      <h1 style={{ fontFamily: display.family }}>Display Font</h1>
      <p style={{ fontFamily: inter700.family, fontWeight: 700 }}>Body</p>
    </>
  )
}

// Or with usePreloadFont:
usePreloadFont(display)
// Emits preload + uses auto-generated @font-face`,
    notes: `Vite plugin that transforms \`import x from './path.woff2?font'\` into typed \`FontDescriptor\` modules with auto-generated \`@font-face\` CSS and hashed font URLs. Auto-extracts family/weight/style from the filename (e.g. \`inter-700.woff2\` → family='inter', weight=700), generates the \`@font-face\` rule as a side-effect CSS import, emits the font file with a content-addressed hash to \`/assets/fonts/\` in production, and serves it via \`/@fs/\` in dev. Auto-wired by the zero plugin alongside \`fontPlugin\` unless \`zero({ font: false })\` is set. See also: usePreloadFont, FontDescriptor, fontPlugin.`,
    mistakes: `- Forgetting to include font-types ambient declarations in tsconfig — without \`/// <reference types="@pyreon/zero/font-types" />\` or \`"types": ["@pyreon/zero/font-types"]\`, the \`?font\` import returns \`unknown\` instead of a typed \`FontDescriptor\`
- Assuming filename inference applies to all tokens — weight keywords like \`bold\`, \`semibold\`, etc. are recognized, but \`inter-bold-italic.woff2\` extracts \`family='inter'\`, \`weight=700\`, \`style='italic'\`, NOT \`family='inter-bold'\`
- Overriding \`family\` in the query without matching the CSS rule — the plugin generates \`@font-face { font-family: '...' }\` with the FAMILY from your override, so \`?font&family=Custom\` must match the CSS you reference
- Using the descriptor's \`src\` directly in custom CSS without the \`?font\` query context — the src changes per mode (dev=\`/@fs/...\`, build=Vite asset placeholder); always use the descriptor object to stay synchronized
- Stacking multiple query parameters in the wrong order — the plugin parses \`?font&family=X&weight=700\`, so always put \`?font\` first`,
  },

  'zero/FontDescriptor': {
    signature: `interface FontDescriptor { family: string src: string weight: number style: 'normal' | 'italic' | 'oblique' display: 'auto' | 'block' | 'swap' | 'fallback' | 'optional' type: string fontFace: string }`,
    example: `import display from './fonts/display-bold.woff2?font'

// Display is typed as FontDescriptor:
console.log(display.family)    // 'display'
console.log(display.weight)    // 700
console.log(display.style)     // 'normal'
console.log(display.type)      // 'font/woff2'
console.log(display.src)       // '/assets/fonts/display-abc123.woff2' (build) or '/@fs/...' (dev)

// toString() for interpolation:
const style = \`font-family: \${display};\` // 'font-family: display;'

// Use with usePreloadFont:
usePreloadFont(display)
// Preload href matches display.src perfectly (no drift)`,
    notes: `Descriptor object returned by \`import x from './path.woff2?font'\`. Contains the CSS family name, hashed src URL (auto-updated per build), font-weight/style/display values inferred from or overridden via query params, MIME type for preload contracts, and the auto-generated \`@font-face\` CSS rule string. The descriptor's \`toString()\` returns the family name, so it interpolates directly in template literals: \`font-family: \${descriptor}\`. The object is frozen to prevent accidental mutations. See also: fontImportPlugin, usePreloadFont.`,
    mistakes: `- Calling \`JSON.stringify(descriptor)\` and expecting it to be safe — the descriptor contains a \`fontFace\` string with user-facing CSS; for logging, use a property selector instead
- Attempting to mutate descriptor properties (e.g. \`descriptor.weight = 500\`) — the object is frozen; reassign to a new variable or create a new import with query overrides
- Assuming \`descriptor.src\` is stable across dev/build — in dev it's \`/@fs/...\`; in build it's a Vite asset hash like \`/assets/fonts/...\`; always reference the descriptor, never hardcode the src
- Using \`descriptor.fontFace\` directly instead of relying on Vite's CSS pipeline — the \`?font\` import side-effects a CSS module; if you want the rule in a stylesheet, use the descriptor's family/weight/style to build a fresh \`@font-face\``,
  },

  'zero/usePreconnect': {
    signature: 'function usePreconnect(origin: string, opts?: { credentials?: boolean }): void',
    example: `usePreconnect('https://fonts.gstatic.com')
usePreconnect('https://api.example.com', { credentials: true })`,
    notes: 'Emit a `<link rel="preconnect" href="..." crossorigin>` into the head. Opens the connection (DNS + TCP + TLS) to a remote origin before any resource is requested, saving ~100-300ms on the first fetch from that origin. Use `credentials: true` only for credentialed cross-origin fetches (rare); the default `crossorigin="anonymous"` is correct for 99% of cases. Avoid preconnecting to more than 3-4 origins — the marginal benefit drops fast past ~4. See also: useDnsPrefetch, usePreload, PreloadOptions.',
    mistakes: `- Preconnecting to more than 3-4 origins — each connection costs memory + battery; the benefit plateaus quickly, and too many preconnects slow down the entire request queue
- Forgetting that \`credentials: false\` (default) emits \`crossorigin="anonymous"\` — this is the correct value for fonts, cross-origin images, and anonymous fetches; without it the credentialed fetch doesn't reuse the connection
- Expecting \`usePreconnect\` alone to warm up the connection under SSG — it only emits the tag; the browser must visit the page to open the connection. During SSG prerender, no connection is made
- Mixing preconnect for an origin that will never be used on this page — you're paying the connection cost for zero benefit; reserve it for the 1-3 most-critical external origins
- Using \`credentials: true\` for a cross-origin API that doesn't require CORS — \`crossorigin="use-credentials"\` is an unnecessary hint; the default \`anonymous\` works fine`,
  },

  'zero/useDnsPrefetch': {
    signature: 'function useDnsPrefetch(origin: string): void',
    example: `useDnsPrefetch('https://analytics.example.com')
// Fallback pair:
usePreconnect('https://api.example.com')
useDnsPrefetch('https://api.example.com')`,
    notes: `Emit a \`<link rel="dns-prefetch" href="...">\` into the head. A cheaper but weaker hint than \`preconnect\` — only resolves the DNS, doesn't open the TCP/TLS connection. Use for origins that are LIKELY but not certain to be hit (analytics endpoints that may not fire, third-party widgets that may not render). Does NOT take \`crossorigin\` (DNS resolution is scheme-agnostic). Pair with \`preconnect\` for browser fallback — preconnect-capable browsers ignore the dns-prefetch, while older browsers without preconnect support still get the DNS hint. See also: usePreconnect, usePreload, PreloadOptions.`,
    mistakes: `- Using dns-prefetch for a resource you're CERTAIN will be hit — use \`preconnect\` instead; the full connection pre-open is worth the extra cost
- Expecting dns-prefetch to work on very old browsers — it's only a fallback hint; modern browsers prefer preconnect. If you need deep browser coverage, pair both
- Adding \`crossorigin\` to a dns-prefetch tag — DNS resolution doesn't use CORS; the attribute is ignored. Only \`preconnect\` uses \`crossorigin\`
- Dns-prefetching 20+ third-party domains — DNS lookups still have latency and memory cost; reserve it for the most-likely fallback origins, not every possible dependency
- Forgetting that dns-prefetch, like all resource hints, is advisory — the browser may ignore it due to network conditions, Save-Data preference, or memory pressure; it's never a guarantee`,
  },

  'zero/usePreload': {
    signature: 'function usePreload(href: string, opts: PreloadOptions): void',
    example: `// LCP image not using <Image priority>:
usePreload('/hero.jpg', { as: 'image' })

// Style sheet loaded at runtime:
usePreload('/extra.css', { as: 'style' })

// Responsive image with srcset:
usePreload('/hero.jpg', { as: 'image', imagesrcset: '/hero-640.jpg 640w, /hero-1920.jpg 1920w', imagesizes: '100vw' })

// Font (requires type):
usePreload('/font.woff2', { as: 'font', type: 'font/woff2', crossorigin: 'anonymous' })`,
    notes: `Emit a \`<link rel="preload" as="..." href="..." crossorigin>\` for a specific resource that the page will hit in the critical path. Unlike generic preload markup, this hook enforces the \`as\` parameter (required — the preload scanner ignores \`<link rel="preload">\` without it). Use for LCP images (when not using \`<Image priority>\`), CSS/fonts loaded at runtime, JSON responses the critical path needs, and web worker scripts. Deduplicates via \`@pyreon/head\`'s href-keying — two \`usePreload(h)\` calls with the same href emit ONE preload tag. See also: usePreconnect, useDnsPrefetch, PreloadOptions.`,
    mistakes: `- Forgetting \`as\` — it is REQUIRED; the preload scanner ignores \`<link rel="preload">\` without it, defeating the entire hint
- Using \`as: 'font'\` without \`type\` — the browser's preload scanner ignores font preloads without a matching MIME type. Always pair with \`type: 'font/woff2'\` (or the actual format)
- Preloading a cross-origin resource without \`crossorigin: 'anonymous'\` — the browser preload-fetches it early, but then the actual fetch with CORS headers is a second fetch (double-fetch penalty). Add \`crossorigin\` to reuse the preloaded response
- Preloading too many resources — each preload competes for bandwidth with the critical path. Reserve preload for the 2-5 most-critical resources (fonts, LCP images, critical JSON)
- Not using \`imagesrcset\` + \`imagesizes\` for responsive image preloads — without them the preload scanner picks a fixed size; responsive images should provide both to let the scanner choose the right variant for the viewport`,
  },

  'zero/PreloadOptions': {
    signature: `interface PreloadOptions { as: 'script' | 'style' | 'image' | 'font' | 'fetch' | 'document' | 'audio' | 'video' | 'track' | 'object' | 'embed' | 'worker'; type?: string; crossorigin?: 'anonymous' | 'use-credentials'; media?: string; imagesrcset?: string; imagesizes?: string; fetchpriority?: 'high' | 'low' | 'auto'; }`,
    example: `// Image with responsive variants:
{ as: 'image', imagesrcset: '/hero-sm.jpg 640w, /hero-lg.jpg 1920w', imagesizes: '100vw' }

// Font (requires type + crossorigin):
{ as: 'font', type: 'font/woff2', crossorigin: 'anonymous' }

// Fetch with type and CORS:
{ as: 'fetch', type: 'application/json', crossorigin: 'anonymous' }

// Mobile-only preload:
{ as: 'style', media: '(max-width: 600px)' }

// High-priority script:
{ as: 'script', fetchpriority: 'high' }`,
    notes: `Configuration shape for \`usePreload(href, opts)\`. \`as\` is REQUIRED and tells the browser what kind of resource is being preloaded (affects Accept header, priority bucket, download size budget). \`type\` is required for \`as: 'font'\` (preload scanner ignores font preloads without matching MIME type) and for \`as: 'fetch'\` with a specific response shape. \`crossorigin\` is required for fonts ('anonymous') and for cross-origin \`fetch\`/\`image\` preloads that will be read with CORS (prevents double-fetch). \`media\` enables conditional preloads (e.g. mobile-only). \`imagesrcset\` + \`imagesizes\` let the preload scanner pick the right responsive variant. \`fetchpriority\` hints the browser's fetch scheduler. See also: usePreload, usePreconnect, useDnsPrefetch.`,
    mistakes: `- Omitting \`type\` for \`as: 'font'\` — the preload scanner requires a matching MIME type to recognize font preloads; without it the hint is silently ignored
- Using \`type: 'application/json'\` for a fetch preload that will be parsed as JSON — while not strictly required, the browser uses the type to set the Accept header correctly; always include it for specificity
- Specifying \`crossorigin: 'use-credentials'\` when \`'anonymous'\` is sufficient — use-credentials adds cookie/header overhead; only use it for credentialed cross-origin requests
- Providing \`imagesrcset\` without \`imagesizes\` — the scanner can't make a sizing decision without the media-relative size; both must be present for responsive image preloads
- Setting \`fetchpriority: 'high'\` for non-critical resources — the browser's fetch scheduler is already smart about prioritization; high priority is reserved for true LCP/critical-path resources`,
  },

  'zero/useNoOptimize': {
    signature: 'function useNoOptimize(): boolean',
    example: `// Inside Image component (internal usage pattern)
const noOptimizeBoundary = useNoOptimize()
const isBypass =
  local.optimize === false || (noOptimizeBoundary && local.optimize !== true)

if (isBypass) {
  return renderBareImg(props)
}`,
    notes: 'Reads the current `<NoOptimize>` boundary state. Returns `true` if the render scope is within a `<NoOptimize>` boundary (optimization disabled), `false` otherwise. Primarily used internally by `<Image>` to decide whether to bypass optimization; not intended for public application code. See also: NoOptimize, NoOptimizeContext.',
    mistakes: `- Calling \`useNoOptimize()\` outside the component tree where \`<NoOptimize>\` is mounted — returns \`false\` (falsy but valid; the contract is non-router-aware)
- Relying on \`useNoOptimize()\` to enforce optimization boundaries in custom code — the hook is read-only; use \`<NoOptimize>\` to set the boundary
- Assuming the hook's value is stable across re-renders — it responds dynamically to boundary mount/unmount, so guards/memoization may be needed`,
  },
  // <gen-docs:api-reference:end @pyreon/zero>

  // <gen-docs:api-reference:start @pyreon/zero-content>

  'zero-content/defineConfig': {
    signature: 'defineConfig(config: ContentConfig): ContentConfig',
    example: `// content.config.ts — BYO validator (zod / valibot / arktype / typia)
import { defineConfig, defineCollection } from '@pyreon/zero-content'
import { z } from 'zod'

export default defineConfig({
  collections: {
    docs: defineCollection({
      type: 'pages',
      schema: z.object({ title: z.string() }),
    }),
  },
})`,
    notes: 'Top-level configuration helper. Pass-through factory that preserves the literal type of `collections` so downstream type inference works. Lives in `content.config.ts` at the project root; the plugin auto-discovers it.',
    mistakes: `- Importing \`z\` from \`@pyreon/zero-content\` — the package does NOT re-export zod. Bring your own validator (zod, valibot, arktype, typia all duck-type onto Standard Schema). See @pyreon/validation for curated adapters.
- Adding components in \`vite.config.ts\` instead of \`content.config.ts\`. The vite config is build orchestration; content components live in user space.
- Forgetting the \`default export\`. The plugin reads \`content.config.ts\` via dynamic import and reads the default export.
- Putting collections under a path that doesn't exist. Default \`path\` is \`src/content/<collection-name>\`; either create that directory or override with \`path:\`.`,
  },

  'zero-content/defineCollection': {
    signature: 'defineCollection<TSchema>({ type, path?, schema, components?, searchable? }): CollectionDefinition<TSchema>',
    example: `defineCollection({
  type: 'pages',
  path: 'src/content/docs',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    sidebar: z.object({ order: z.number(), group: z.string() }).optional(),
  }),
})`,
    notes: `Per-collection definition. \`type: 'pages'\` triggers route generation under \`src/routes/_content/<name>/[...slug].tsx\` (auto-gitignored); \`type: 'data'\` is queryable via \`getCollection\`/\`getEntry\` but not routed. Schema is a zod schema — frontmatter is validated against it at build with file:line errors on mismatch.`,
    mistakes: `- Returning raw \`z.object(...)\` schemas without wrapping in \`defineCollection\`. The plugin needs the wrapper to know the collection name + type.
- Setting \`type: "pages"\` for a collection that should not be routed (e.g. blog posts queried via \`getCollection\` for an index page). Use \`type: "data"\`.
- Schema mismatches that surface only at build time. Use \`pyreon doctor --check-content\` (PR 9) at edit time, or watch the dev server output during \`bun run dev\`.`,
  },

  'zero-content/defineComponents': {
    signature: 'defineComponents<T extends Record<string, ComponentFn>>(components: T): T & ComponentsRegistry',
    example: `import { defineComponents } from '@pyreon/zero-content'
import { Playground, APIReference } from './components'

export default defineComponents({ Playground, APIReference })`,
    notes: 'Wrap a map of MDX components. The brand symbol distinguishes user bundles from accidentally raw objects (which fail the build). Dev-mode validates each value is a function — catches `{ Playground: undefined }` typos. Compose with `mergeComponents`.',
    mistakes: `- Passing a raw \`{...}\` object to a \`components:\` field. The plugin refuses raw objects with a build error pointing at the call site.
- Mixing component imports inside \`vite.config.ts\`. Imports live in user-space files (content.config.ts or _-prefixed files under src/mdx/), never in build orchestration.`,
  },

  'zero-content/getCollection': {
    signature: 'getCollection<K extends keyof CollectionSchemas>(name: K): Promise<CollectionEntry<CollectionSchemas[K]>[]>',
    example: `import { getCollection } from '@pyreon/zero-content'

const posts = await getCollection('blog')
//    ^? Array<{ slug: string; data: { title: string; author: string; date: Date; ... }; render(); headings }>

for (const post of posts) {
  console.log(post.data.title, post.slug)
}`,
    notes: `Runtime query — returns every entry in a collection. Data shape inferred from the collection's zod schema via the generated \`.pyreon/content-types.d.ts\`. Each entry exposes a \`render()\` lazy loader to get the page component.`,
    mistakes: `- Calling \`getCollection\` in a component body without \`await\`. It returns a Promise. Wrap in an async setup function, use a loader, or await it during SSG render.
- Passing a string that isn't a defined collection. TypeScript catches this once \`.pyreon/content-types.d.ts\` is generated; without it, you'd get a runtime error.`,
  },

  'zero-content/Callout': {
    signature: '<Callout type="tip"|"warning"|"note"|"danger"|"info" title? children?>',
    example: `// In markdown:
:::tip{title="Pro tip"}
Use **signals** for fine-grained reactivity. See [reactivity rules](/docs/reactivity).
:::

// In JSX (when used directly):
<Callout type="warning" title="Breaking change">…</Callout>`,
    notes: 'Built-in callout box. Emitted automatically by the `:::tip` / `:::warning` / `:::note` / `:::danger` / `:::info` container syntax in markdown. Each type carries a default icon + title; pass `title` to override. Body content renders through the full markdown pipeline (bold, links, code, lists all work inside).',
    mistakes: `- Forgetting the closing \`:::\` line — the rest of the markdown file becomes part of the callout silently.
- Using \`:::tip\` to highlight code — Shiki + dual themes already make code blocks visually distinct; callouts are for prose context (warnings, tips, side-notes).
- Putting a \`:::code-group\` inside a \`:::tip\` — directives don't nest reliably; refactor to sibling blocks.`,
  },

  'zero-content/CodeGroup': {
    signature: '<CodeGroup labels={["npm","bun","pnpm"]} initial? children>',
    example: `// In markdown:
:::code-group
\\\`\\\`\\\`bash [npm]
npm install @pyreon/zero
\\\`\\\`\\\`
\\\`\\\`\\\`bash [bun]
bun add @pyreon/zero
\\\`\\\`\\\`
:::`,
    notes: 'Tabbed code blocks. Emitted by the `:::code-group` container syntax — each child code fence carries `[label]` in its meta string. The active tab is a signal; SSR ships tab 0 visible, client-side hydration enables tab switching with zero per-mount cost (tabs are CSS class swaps, not VNode reconciliation).',
    mistakes: `- Omitting the \`[label]\` on a code fence inside \`:::code-group\` — the unlabelled block is silently dropped from the group (consistent with the prototype, but easy to miss). Always label every fence.
- Mixing languages without labels — \`:::code-group\` is for the same task in different syntaxes (npm vs bun vs pnpm), not arbitrary unrelated code.
- Hand-writing \`<CodeGroup>\` JSX with mismatched labels-to-children count — write markdown instead so the codegroup plugin keeps them in sync.`,
  },

  'zero-content/CodeBlock': {
    signature: '<CodeBlock lang? filename? dangerouslySetInnerHTML={{ __html }}>',
    example: `// Output from \\\`\\\`\\\`ts\\nconst x = 1\\n\\\`\\\`\\\` becomes:
<CodeBlock lang="ts" dangerouslySetInnerHTML={{ __html: "<pre class=\\"shiki\\">…</pre>" }} />

// Hand-using is rare; the pipeline emits it for you.
<CodeBlock lang="ts" filename="signal.ts" dangerouslySetInnerHTML={{ __html: shikiOutput }} />`,
    notes: 'Wrapper around a Shiki-rendered code block. Emitted automatically when highlighting is enabled — Shiki produces a full `<pre><code>` with per-token coloring + dual light/dark themes baked into one `<span>` tree, and CodeBlock wraps it for filename labels + copy buttons (future) without forcing the markdown pipeline to know about them. The `dangerouslySetInnerHTML` here is safe because Shiki output is build-time HTML, not user input — round-tripping it through the JSX emitter would throw away the precomputed coloring.',
    mistakes: `- Hand-emitting CodeBlock without Shiki-shaped HTML in \`__html\` — you lose dual-theme support; just write a code fence in markdown.
- Trying to read or mutate the rendered HTML at runtime — it's baked at build time. To customize coloring, swap themes via the plugin's \`highlighter\` option.
- Building a copy-to-clipboard button by parsing the \`__html\` — use the original code value before highlighting (PR 4 will expose the raw value alongside the rendered HTML).`,
  },

  'zero-content/Example': {
    signature: '<Example file="./path/to/example" share?="key" shareInitial?={value} title?="…" class?="…">',
    example: `// In markdown:
<Example file="./examples/counter" share="cnt" />
<Example file="./examples/readout" share="cnt" />

// examples/counter.tsx — a real Pyreon component file
import { signal, type Signal } from '@pyreon/reactivity'
export default function Counter(props: { shared?: Signal<number> }) {
  const count = props.shared ?? signal(0)
  return (
    <div>
      <button onClick={() => count.update(n => n + 1)}>+</button>
      <span>{count()}</span>
    </div>
  )
}

// entry-client.ts — one-time consumer-side registration
import { registerExamples } from '@pyreon/zero-content'
registerExamples(import.meta.glob('./examples/⁎⁎/⁎.tsx'))`,
    notes: 'The Pyreon-native replacement for iframe-sandboxed `<Playground>`. Loads a real `.tsx` file inline (NOT iframe) — no escape passes, no srcdoc string-blob, no SyntaxError when a string contains a backslash. Two `<Example>` calls with the same `share` key receive the SAME signal instance via a module-level registry, so a click in one example reactively updates the rendered output of another mounted example on the same page. Build-time-resolved via `import.meta.glob` registered at startup with `registerExamples()` — no runtime overhead beyond the dynamic `import()` of the resolved chunk.',
    mistakes: `- Forgetting \`registerExamples(import.meta.glob(...))\` in \`entry-client.ts\` — the registry stays empty and every \`<Example>\` renders the "not found" error message. \`import.meta.glob\` is resolved at COMPILE TIME relative to the file it's called in, so the registration MUST live in the consumer's source tree (this package can't do it for you).
- Passing children to an example: \`<Example file="./x">content</Example>\` — children are dropped during JSON serialization of props. Render content inside the example file itself.
- Using \`share="key"\` with a value the receiving component can't consume — the example component must accept \`{ shared?: Signal<T> }\` and fall back to a local signal when undefined. Without that fallback, the example breaks when used WITHOUT \`share\`.`,
  },

  'zero-content/registerExamples': {
    signature: 'registerExamples(glob: Record<string, () => Promise<unknown>>): void',
    example: `// entry-client.ts
import { registerExamples } from '@pyreon/zero-content'
registerExamples(
  import.meta.glob('./examples/⁎⁎/⁎.tsx') as Record<
    string,
    () => Promise<unknown>
  >,
)`,
    notes: `Register the consumer's example files for \`<Example file="./...">\` lookups. Call once at app boot from \`entry-client.ts\` (or equivalent), passing the result of \`import.meta.glob('./examples/**/*.tsx')\`. Idempotent: re-registering replaces the previous registry (useful for hot-reload scenarios).`,
    mistakes: `- Calling \`registerExamples\` at module scope of a server-only file — the glob must be evaluated in the client bundle. Put it in \`entry-client.ts\`, not \`entry-server.ts\`.
- Passing the wrong glob shape (resolved path strings instead of loaders) — \`import.meta.glob\` returns \`Record<path, lazy loader>\`. Don't wrap it.
- Forgetting that the glob is COMPILE-TIME-RESOLVED relative to the file. If you \`registerExamples(import.meta.glob('./x/**/*.tsx'))\` in \`src/foo/entry.ts\`, the glob walks \`src/foo/x/\`, NOT \`src/x/\`.`,
  },

  'zero-content/getOrCreateSharedSignal': {
    signature: 'getOrCreateSharedSignal<T>(key: string, initial: T): Signal<T>',
    example: `import { getOrCreateSharedSignal } from '@pyreon/zero-content'

// Two components on the same page receive the SAME signal:
const a = getOrCreateSharedSignal<number>('cnt', 0)
const b = getOrCreateSharedSignal<number>('cnt', 99)
console.log(a === b) // true
console.log(a()) // 0 (initial from FIRST lookup; second arg ignored)
b.set(5)
console.log(a()) // 5`,
    notes: 'Module-level registry of `Signal<T>` instances keyed by string. First lookup for a key creates a signal with the supplied initial value; subsequent lookups return the SAME instance (ignoring `initial` after the first). Powers the `share="key"` prop on `<Example>` but can be used directly for cross-component shared state without a context. Companion `clearAllSharedSignals()` resets the whole registry (test-helper / page-nav use case).',
    mistakes: `- Disagreeing on \`T\` across two callers with the same key — both get the same runtime signal but mismatched compile-time types (author error, no runtime safeguard).
- Calling \`clearAllSharedSignals()\` in production (default-page-nav handler etc.) — signals are normally session-scoped; clearing wipes intentional app-wide state (theme/locale/...).
- Re-implementing the registry per-feature instead of reusing this — the registry is the canonical home for module-level shared signals across mount boundaries.`,
  },
  // <gen-docs:api-reference:end @pyreon/zero-content>
  // <gen-docs:api-reference:start @pyreon/sync>

  'sync/syncedSignal': {
    signature: '<T>(options: SyncedSignalOptions<T>) => SyncedSignal<T>',
    example: `const title = syncedSignal({ doc, key: "title", initial: "Untitled" })
// <h1>{title()}</h1>  — patches in place when any peer edits the title
title()              // "Untitled"  (reactive read)
title.set("Roadmap") // writes the CRDT; the observer drives the DOM update
title.dispose()      // detach observer (auto on onCleanup inside a scope)`,
    notes: `Bind a Signal<T> to a single scalar entry in a CRDT map. The return value is a NORMAL signal (via wrapSignal — reads / \`_v\` / \`.direct\` all delegate), so the compiler's \`_bindText\`/\`_bindDirect\` fast paths and every effect treat it like any signal: a remote op becomes one \`base.set\` → one fine-grained DOM update. The update loop has a single writer — \`.set(v)\` writes ONLY the CRDT; the map observer is the one path that writes the base signal (for local AND remote commits); the local echo is an \`Object.is\` no-op. See also: syncedStore, syncedText, syncedList.`,
    mistakes: `- Calling \`title(newValue)\` to write — that reads and ignores the arg like any signal. Use \`title.set(newValue)\`
- Expecting \`initial\` to win when the key already exists — it is create-if-missing only; a persisted / peer value is authoritative and \`initial\` is ignored (the local-first convention)
- Storing an object/array and expecting per-field surgical updates — v1 is scalar (string/number/boolean); whole-value replace works but re-fires per replace. Use \`syncedText\`/\`syncedList\` for collaborative collections
- Forgetting \`.dispose()\` for a module-scope synced signal that outlives any reactive scope (inside a scope it auto-disposes via onCleanup)`,
  },

  'sync/syncedStore': {
    signature: '<T extends Record<string, unknown>>(initial: T, options: SyncedStoreOptions) => SyncedStore<T>',
    example: `const store = syncedStore({ title: "Untitled", done: false }, { doc })
store.title()            // "Untitled"
store.title.set("Ship")  // one CRDT write → one DOM update
store.done.set(true)
store.dispose()          // tear down all fields (or rely on onCleanup in-scope)`,
    notes: `Build a flat store of synced fields from a plain initial object — the ergonomic layer over syncedSignal. Each field becomes its own SyncedSignal over one shared map, so \`store.title()\` reads reactively and \`store.title.set(v)\` writes through the CRDT. A single-key change still produces exactly one base-signal write: every field's observer runs, but only the field whose key changed calls \`base.set\` (the rest early-return on a cheap \`Set.has\`). See also: syncedSignal.`,
    mistakes: `- Adding a key at runtime — the store's fields are fixed from the \`initial\` object's keys at construction; reshape by creating a new store
- Sharing one map across two unrelated stores — \`{ map }\` names the map; one map = one store, or fields collide
- Reading \`store\` as a plain object snapshot — each field is a SyncedSignal; call it (\`store.title()\`) to read reactively`,
  },

  'sync/SyncedSignal': {
    signature: 'interface SyncedSignal<T> extends Signal<T> { dispose(): void }',
    example: 'const s: SyncedSignal<number> = syncedSignal({ doc, key: "n", initial: 0 })',
    notes: 'A Signal<T> bound to a CRDT entry. Identical to a normal Signal for reads/writes/tracking, plus `dispose()` to detach the CRDT observer (idempotent; auto-called via onCleanup when created inside a reactive scope). See also: syncedSignal.',
  },

  'sync/SyncedStore': {
    signature: 'type SyncedStore<T> = { readonly [K in keyof T]: SyncedSignal<T[K]> } & { dispose(): void }',
    example: 'const store: SyncedStore<{ title: string }> = syncedStore({ title: "x" }, { doc })',
    notes: `A mapped type — each key of the initial object becomes a SyncedSignal of that field's type, plus a store-level \`dispose()\` that tears down every field's observer. See also: syncedStore.`,
  },

  'sync/CrdtAdapter': {
    signature: 'interface CrdtAdapter { createDoc(): CrdtDoc }  // + CrdtDoc.getMap → CrdtMap, CrdtMap.observe/transact',
    example: `function bindTitle(adapter: CrdtAdapter) {
  const doc = adapter.createDoc()
  return syncedSignal({ doc, key: "title", initial: "Untitled" })
}`,
    notes: 'The engine-neutral seam. `CrdtAdapter` / `CrdtDoc` / `CrdtMap` abstract the CLIENT reactive bridge so syncedSignal/syncedStore never import a concrete engine. The bridge depends ONLY on this seam (+ @pyreon/reactivity); the Yjs implementation lives behind `@pyreon/sync/yjs`. Note: the seam ports the bridge, NOT the wire format — persistence/transport/relay are Yjs-coupled, so swapping engines re-platforms the infrastructure, not the bridge. See also: FakeCrdtAdapter, createYjsDoc.',
  },

  'sync/LOCAL_ORIGIN': {
    signature: 'const LOCAL_ORIGIN: unique symbol',
    example: 'doc.getMap("m").transact(() => map.set("k", v), LOCAL_ORIGIN)',
    notes: 'Transaction-origin tag for a LOCAL write (a `.set` originating on this client). The bridge tags its CRDT writes with this; transports use the origin to prevent the NETWORK loop — they re-broadcast LOCAL-origin updates but NEVER a REMOTE-origin one. The bridge observer itself applies every change regardless of origin (the local echo is an Object.is no-op). See also: REMOTE_ORIGIN.',
  },

  'sync/REMOTE_ORIGIN': {
    signature: 'const REMOTE_ORIGIN: unique symbol',
    example: 'doc.yDoc.transact(() => Y.applyUpdate(doc.yDoc, bytes), REMOTE_ORIGIN)',
    notes: 'Transaction-origin tag for a REMOTE-applied update (received from a peer/relay). Transports apply inbound updates with this origin so they are NOT echoed back, which is what prevents the network loop. Gating the bridge OBSERVER on origin would be a bug — it must apply remote changes to drive the local UI; the loop guard belongs in the transport. See also: LOCAL_ORIGIN.',
  },

  'sync/FakeCrdtAdapter': {
    signature: 'class FakeCrdtAdapter implements CrdtAdapter { createDoc(): FakeCrdtDoc }',
    example: `const a = new FakeCrdtAdapter().createDoc()
const b = new FakeCrdtAdapter().createDoc()
connectFakeDocs(a, b)
const sa = syncedSignal({ doc: a, key: "k", initial: 0 })
const sb = syncedSignal({ doc: b, key: "k", initial: 0 })
sa.set(5) // sb() becomes 5`,
    notes: `An in-memory, dependency-free CrdtAdapter for unit-testing synced stores without standing up a real engine. Pair docs with \`connectFakeDocs(a, b)\` to simulate two peers in-process. It does NOT do state-vector reconciliation, so it can't model offline-reconnect convergence — use the Yjs adapter (\`createYjsDoc\` + a transport) for that. See also: connectFakeDocs, createYjsDoc.`,
    mistakes: `- Using the fake adapter to test offline-reconnect convergence — it has no state-vector merge; use the Yjs adapter for that scenario
- Shipping the fake adapter to production — it is a test double with no persistence or real conflict resolution`,
  },

  'sync/connectFakeDocs': {
    signature: '(a: FakeCrdtDoc, b: FakeCrdtDoc) => { disconnect(): void }',
    example: `const link = connectFakeDocs(a, b)
link.disconnect() // simulate offline`,
    notes: 'Link two in-memory FakeCrdtDocs so a write to one propagates to the other — the test analog of a transport. Returns a `disconnect()` to simulate going offline. See also: FakeCrdtAdapter.',
  },

  'sync/createYjsDoc': {
    signature: '(yDoc?: Y.Doc) => YjsCrdtDoc',
    example: `import { createYjsDoc, connectViaWebSocket } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const title = syncedSignal({ doc, key: "title", initial: "Untitled" })
connectViaWebSocket(doc, "wss://sync.example.com/my-room?token=abc")`,
    notes: 'Create a CrdtDoc backed by a real Yjs Y.Doc (or wrap an existing one). Exported from `@pyreon/sync/yjs` — importing it pulls in `yjs`, which is why it is NOT on the core entry. `.yDoc` exposes the underlying Y.Doc for the transports / persistence helpers. See also: persistViaIndexedDB, connectViaWebSocket, syncedText.',
  },

  'sync/syncedText': {
    signature: '(doc: YjsCrdtDoc, key: string) => SyncedText',
    example: `const body = syncedText(doc, "body")
// <textarea value={body()} onInput={e => body.set(e.currentTarget.value)} />
body.insert(0, "Hello ")  // positional — merges with a concurrent peer edit
body.delete(0, 6)`,
    notes: `Bind a Signal<string> to a Yjs Y.Text — a COLLABORATIVE string with character-level CRDT merge. Unlike syncedSignal (scalar last-writer-wins, which drops the loser's value), two peers editing different regions BOTH keep their edits. Use \`.insert(i, s)\` / \`.delete(i, n)\` (positional ops Y.Text merges faithfully) for true concurrent editing; \`.set(full)\` applies a minimal prefix/suffix diff (one replace) — handy for a controlled \`<textarea>\` but not a positional merge. Engine-specific (in \`@pyreon/sync/yjs\`, not behind the seam — collab text is coupled to the CRDT's text type). See also: syncedList, syncedSignal.`,
    mistakes: `- Using \`syncedSignal\` for a collaboratively-edited string — scalar LWW drops one peer's edit; use \`syncedText\` so both are kept
- Relying on \`.set(fullText)\` for concurrent multi-region editing — it is a single prefix/suffix-diff replace, not a positional merge; use \`.insert\`/\`.delete\` where concurrency matters`,
  },

  'sync/syncedList': {
    signature: '<T>(doc: YjsCrdtDoc, key: string) => SyncedList<T>',
    example: `const items = syncedList<string>(doc, "todos")
items.push("buy milk", "walk dog")  // merges with a concurrent peer push
items.insert(0, ["first"])
items.delete(1, 1)
// <For each={() => items()} by={(t) => t}>{(t) => <li>{t}</li>}</For>`,
    notes: 'Bind a Signal<T[]> to a Yjs Y.Array — a COLLABORATIVE list with positional CRDT merge. Concurrent `push`/`insert` from two peers are BOTH kept (no item dropped). Render with a keyed `<For each={() => list()} by={…}>` so a remote change reconciles O(changed). `.push` / `.insert(i, items)` / `.delete(i, count?)` are positional; `.set(next)` does a coarse whole-list replace. Engine-specific (in `@pyreon/sync/yjs`). See also: syncedText.',
    mistakes: `- Calling \`.set(newArray)\` for concurrent edits — whole-list replace resolves by that coarse op, not a positional merge; use \`.push\`/\`.insert\`/\`.delete\`
- Rendering with \`.map()\` instead of a keyed \`<For>\` — you lose the O(changed) reconcile a remote list change should give`,
  },

  'sync/syncedAwareness': {
    signature: '<T extends Record<string, unknown>>(doc: YjsCrdtDoc, initial?: T) => SyncedAwareness<T>',
    example: `import { createYjsDoc, syncedAwareness, connectViaWebSocket } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const presence = syncedAwareness<{ name: string; cursor?: { x: number; y: number } }>(
  doc, { name: "Vít" },
)
connectViaWebSocket(doc, "wss://sync.example.com/room?token=abc")
// live cursors: window.addEventListener("mousemove", e =>
//   presence.setLocalField("cursor", { x: e.clientX, y: e.clientY }))
// <For each={() => presence.others()} by={p => p.clientId}>
//   {p => <Cursor color={p.state.color} at={p.state.cursor} />}</For>`,
    notes: `Reactive EPHEMERAL presence — who's online + their live cursor — over the Yjs awareness protocol, a SEPARATE channel from the document CRDT (awareness is never merged into the doc and never persisted). Returns read signals (\`local\` / \`others\` / \`states\`) that recompute when any peer joins, leaves, or moves, plus \`setLocal\` / \`setLocalField\` to publish your own presence. Wired automatically to whatever transports are (or later get) connected to the doc — they share the doc's single Awareness. The relay is awareness-stateful, so a new client sees existing peers INSTANTLY and a crashed peer is purged on disconnect. Create it BEFORE connecting a transport (the transport peeks for the doc's awareness at connect time). See also: SyncedAwareness, PeerState, connectViaWebSocket, createSyncServer.`,
    mistakes: `- Putting durable data in awareness — it is EPHEMERAL and never persisted; a peer state vanishes on disconnect. Use syncedSignal/syncedStore/syncedText for data that must survive
- Creating it AFTER connecting a transport — the transport peeks for the doc awareness at connect, so presence created later is not wired. Create syncedAwareness BEFORE connectViaWebSocket / connectViaBroadcastChannel
- Reading \`others()\` / \`local()\` outside a reactive scope and expecting it to update — they are signals; read them inside JSX / an effect / a computed so the UI tracks presence changes
- Treating cursor coordinates as exact across clients — they are raw viewport points with no scroll / window-size normalization (good enough for v1; map to content coordinates if you need pixel parity)
- Expecting \`dispose()\` to announce your departure / tear down the shared awareness — it only detaches THIS view's observer. The TRANSPORT announces departure on disconnect, and the DOC owns teardown (doc.destroy()). So dispose the view freely (a second view + the transports keep working); call doc.destroy() for a full local teardown
- Assuming presence scales to hundreds of peers cheaply — every awareness change rebuilds the full peers snapshot (O(N) in peer count) and re-runs each \`others()\` consumer; fine for the typical handful-to-dozens of collaborators, but a large cursor swarm will re-render on every mouse move (throttle cursor publishes; this is a v1 limit, not free)`,
  },

  'sync/SyncedAwareness': {
    signature: 'interface SyncedAwareness<T> { setLocal(s: T): void; setLocalField<K extends keyof T>(k: K, v: T[K]): void; local: Signal<T | null>; others: Signal<PeerState<T>[]>; states: Signal<PeerState<T>[]>; awareness: Awareness; dispose(): void }',
    example: `const p: SyncedAwareness<{ name: string }> = syncedAwareness(doc, { name: "Vít" })
p.others()  // PeerState<{ name: string }>[] — other people here`,
    notes: `The reactive presence handle from syncedAwareness. \`others\` is every peer EXCEPT you (the avatars / cursors to render); \`states\` includes you; \`local\` is your own published state. \`setLocal\` / \`setLocalField\` publish; \`awareness\` is the raw y-protocols escape hatch; \`dispose()\` detaches ONLY this view's observer (idempotent; auto-called via onCleanup in a reactive scope) — it does NOT destroy the doc-shared awareness (the doc owns that via doc.destroy()) and does NOT announce departure (the transport does, on disconnect). See also: syncedAwareness, PeerState.`,
  },

  'sync/PeerState': {
    signature: 'interface PeerState<T> { clientId: number; state: T; isLocal: boolean }',
    example: `<For each={() => presence.others()} by={p => p.clientId}>
  {p => <Avatar name={p.state.name} />}
</For>`,
    notes: `One peer's presence entry: its awareness \`clientId\` (use it as the \`<For>\` key), its published \`state\`, and \`isLocal\` (whether it is you). \`others()\` returns only \`isLocal: false\` entries; \`states()\` returns all. See also: syncedAwareness, SyncedAwareness.`,
  },

  'sync/connectViaBroadcastChannel': {
    signature: '(doc: YjsCrdtDoc, channelName: string) => { disconnect(): void }',
    example: `const doc = createYjsDoc()
const link = connectViaBroadcastChannel(doc, "my-doc-room")
// edit in tab A → the same <h1> patches in place in tab B
link.disconnect()`,
    notes: 'Same-origin CROSS-TAB sync over BroadcastChannel — edits in one tab appear in another tab of the same origin, no server. Includes a minimal state-vector handshake so a late-opening tab catches up. Follows the universal echo rule: a REMOTE-origin update is never re-broadcast, so there is no loop. See also: connectViaWebSocket, persistViaIndexedDB.',
    mistakes: '- Expecting cross-DEVICE sync — BroadcastChannel is same-origin/same-browser only; use connectViaWebSocket + a relay for cross-device',
  },

  'sync/connectViaWebSocket': {
    signature: '(doc: YjsCrdtDoc, url: string, options?: WebSocketTransportOptions) => WebSocketTransport',
    example: `import { connectViaWebSocket, createYjsDoc } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const t = connectViaWebSocket(doc, "wss://sync.example.com/my-room?token=abc", {
  onConnect: () => console.log("synced"),
})
t.disconnect() // close + stop reconnecting`,
    notes: `Sync a YjsCrdtDoc to a relay over WebSocket — the CROSS-DEVICE transport. Sends our state vector on open (relay replies with the diff), then live updates; a REMOTE-origin update is never re-sent (no loop). Reconnects with exponential backoff by default. Uses the global WebSocket (browsers / Node 22+ / Bun / Deno); pass \`WebSocketImpl\` on older Node. Auth: put a token in the \`url\` query string — browser WebSockets can't set headers — which the relay's \`authorize\` hook reads. See also: createSyncServer, connectViaBroadcastChannel.`,
    mistakes: `- Trying to set an Authorization header — browser WebSockets can't; pass the token in the URL query string and read it in the relay's \`authorize\`
- Using it on old Node without a global WebSocket and not passing \`WebSocketImpl\` — it throws; pass the \`ws\` package's WebSocket
- Treating a 4401 close as retryable — that is the relay's authz rejection and is terminal; reconnect won't help`,
  },

  'sync/persistViaIndexedDB': {
    signature: '(doc: YjsCrdtDoc, dbName: string) => YjsPersistence',
    example: `const doc = createYjsDoc()
const persist = persistViaIndexedDB(doc, "my-app-doc")
await persist.whenSynced  // load persisted state FIRST
const title = syncedSignal({ doc, key: "title", initial: "Untitled" })`,
    notes: 'Persist a YjsCrdtDoc to IndexedDB so edits survive a reload and the app works offline (thin wrapper over y-indexeddb). Browser-only — it opens the IndexedDB connection eagerly. AWAIT `.whenSynced` BEFORE creating syncedSignals so create-if-missing adopts the persisted value instead of racing the async load against a fresh seed. See also: createYjsDoc, syncedSignal.',
    mistakes: `- Creating syncedSignals before awaiting \`.whenSynced\` — the fresh seed can race the async load and clobber the persisted value
- Calling it under Node/SSR — it constructs an IndexedDB connection eagerly; importing is safe, calling is browser-only`,
  },

  'sync/createSyncServer': {
    signature: '(options: SyncServerOptions) => Promise<SyncServer>',
    example: `import { createSyncServer } from "@pyreon/sync/server"
const relay = await createSyncServer({
  port: 1234,
  authorize: ({ room, token }) => token === secretFor(room), // REQUIRED in prod
})
// later: await relay.close()`,
    notes: `Start a Node/Bun WebSocket relay that brokers Yjs sync between clients sharing a room. Keeps one authoritative Y.Doc per room (so a late-joiner catches up), applies each inbound update, and broadcasts to the room's OTHER clients. Server-only (\`@pyreon/sync/server\` — imports \`ws\` + \`node:http\`, never enters a client bundle). The \`authorize(ctx)\` hook is the per-room/per-doc access gate: return false (or throw) to reject with close code 4401 before any data flows. Rooms are GC'd when the last client leaves — the relay is ephemeral (no persistence); clients keep their own copy. Pass \`server\` to attach to an existing http.Server instead of opening a port. See also: connectViaWebSocket, AuthorizeContext.`,
    mistakes: `- Deploying without an \`authorize\` hook — the default allows EVERY connection (dev-only); a real deployment MUST supply it or anyone with the room id can read/write
- Importing \`@pyreon/sync/server\` into client code — it pulls \`ws\` + \`node:http\`; it is the server-only subpath by design
- Expecting the relay to persist data — it is ephemeral; durability lives on the clients (persistViaIndexedDB) or an external store`,
  },

  'sync/AuthorizeContext': {
    signature: 'interface AuthorizeContext { room: string; token: string | null; req: IncomingMessage }',
    example: 'authorize: ({ room, token, req }) => verify(room, token)',
    notes: `Context passed to the relay's \`authorize\` hook: the \`room\` parsed from the URL path, the \`token\` query-string param (browser WebSockets can't set headers, so auth rides the query string), and the raw HTTP upgrade \`req\` (read cookies / headers here if you prefer). See also: createSyncServer.`,
  },
  // <gen-docs:api-reference:end @pyreon/sync>
}

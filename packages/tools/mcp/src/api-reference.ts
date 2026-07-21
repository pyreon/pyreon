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
count.peek()         // 6 (does NOT subscribe)

// Mutable value held in a signal:
const items = signal(new Map())
items.peek().set('a', 1)  // mutate in place — set(sameRef) would be a no-op
items.trigger()           // force subscribers to re-run`,
    notes: 'Create a reactive signal. The returned value is a CALLABLE FUNCTION — `count()` reads (and subscribes), `count.set(v)` writes, `count.update(fn)` derives, `count.peek()` reads without subscribing. This is NOT a `.value` getter/setter pattern (React/Vue) — Pyreon signals are functions. Writes gate on `Object.is`, so `set(sameReference)` is a no-op; when you hold a MUTABLE value and mutate it in place, `count.trigger()` force-notifies subscribers without a value change (Vue `triggerRef` semantic). Optional `{ name }` for debugging; auto-injected by `@pyreon/vite-plugin` in dev mode. See also: computed, effect, batch.',
    mistakes: `- \`count.value\` — does not exist. Use \`count()\` to read
- \`count = 5\` — reassigning the variable replaces the signal, does not write to it. Use \`count.set(5)\`
- \`signal(5)\` called with an argument after creation — reads and ignores the argument (dev mode warns). Use \`.set(5)\` to write
- \`const [val, setVal] = signal(0)\` — signals are not destructurable tuples. The whole return value IS the signal
- \`{count}\` in JSX — renders the signal function itself, not its value. Use \`{count()}\` or \`{() => count()}\`
- \`.peek()\` inside \`effect()\` / \`computed()\` — bypasses tracking, creates stale reads. Only use \`.peek()\` for loop-prevention guards
- Mutating a held object in place then \`set(sameReference)\` — a no-op (Object.is gate), subscribers never re-run. Prefer an immutable \`set(newObject)\`; if you deliberately own a mutable value, mutate then \`.trigger()\``,
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
- Expecting \`computed()\` to re-run when a \`.peek()\`-read signal changes — \`.peek()\` bypasses tracking
- Expecting eager evaluation — the default computed is LAZY: a dependency change only marks it dirty; the derivation runs on the next read. Pass \`options.equals\` for the eager variant that re-evaluates on notification and gates downstream updates
- Reasoning about memory from stale branches — a re-evaluated computed drops subscriptions to sources it no longer reads (exact dep list per evaluation), so \`dispose()\` fully unsubscribes even after conditional-branch flips`,
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
- Creating signals inside an effect — they re-create on every run; create once outside
- Passing an \`async\` function — only signal reads BEFORE the first \`await\` are tracked (dev mode warns at registration); read every tracked signal before awaiting, or use \`watch(source, asyncCb)\`
- Assuming a conditional read (\`cond() ? a() : b()\`) keeps BOTH branches subscribed — only the branch actually read this run is a dependency; the effect re-runs when the read branch or the condition changes, then re-tracks (stale-branch subscriptions are dropped on the next run)`,
  },

  'reactivity/renderEffect': {
    signature: '(fn: () => void) => () => void',
    example: `// Inside a custom DOM helper that updates a text node:
const node = document.createTextNode('')
const dispose = renderEffect(() => {
  node.data = String(count())
})
// Re-runs only when count() changes; lighter than effect() but no
// onCleanup support and no error-handler routing (it DOES auto-register
// its disposer with the surrounding EffectScope, like effect()).`,
    notes: `DOM-specific effect with a lighter dependency tracking path — uses a local array for deps instead of the full \`EffectScope\` integration. Used internally by \`_bind\` / \`_tpl\` for compiled-template DOM updates. **Prefer \`effect()\` for general use**; reach for \`renderEffect()\` only when you're hand-writing DOM update logic and have measured the overhead difference. Returns a dispose function (not an \`Effect\` object — different shape from \`effect()\`). See also: effect, computed.`,
    mistakes: `- Calling \`onCleanup()\` inside \`renderEffect()\` — not supported; only \`effect()\` collects cleanups. Use \`effect()\` if you need cleanup callbacks
- Assuming \`renderEffect()\` supports the full \`effect()\` surface — it auto-registers its DISPOSER with the surrounding \`EffectScope\` (tears down on unmount like \`effect()\`), but has no \`onCleanup\` collection, no error-handler routing, and returns a bare dispose function, not an \`Effect\` object
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
effect(() => { store.count })        // tracks store.count
effect(() => { store.user })         // tracks store.user reference (not its contents)
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

class Editor { someMethod() {} }
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
effect(() => { total() })
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
effect(() => { b() })
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

  'reactivity/describeReactiveGraph': {
    signature: 'describeReactiveGraph(graph?: ReactiveGraph): GraphDescription  ·  formatGraphDescription(desc): string',
    example: `activateReactiveDevtools()
const qty = signal(2, { name: 'qty' })
const shippingFlat = signal(4, { name: 'shippingFlat' }) // never read → orphan
const total = computed(() => qty() * 9.99)
effect(() => { void total() })
console.log(formatGraphDescription(describeReactiveGraph()))
// Signals:
//   qty            changing it re-derives 1 value and runs 1 effect
//   shippingFlat   nothing reacts to it (no dependents)
// Insights: orphan-signal  nothing depends on \`shippingFlat\``,
    notes: `Auto-generated BEHAVIORAL description of the reactive graph — what a change to each signal actually DOES, in English, plus health insights only the graph shape can surface. No framework generates behavioral (not API) docs from the reactive graph; Pyreon can because it holds the precise graph. Returns \`{ summary, nodes, insights }\`: each \`nodes[]\` entry has an English \`behavior\` one-liner (a signal describes its downstream fan-out — 'changing it re-derives N values and runs M effects'; a computed/effect describes what it reacts to — 'recomputes when qty, price change'). \`insights\` flags behavioral smells: \`orphan-signal\` (nothing depends on it — dead reactivity), \`high-fanout\` (a change re-runs many effects — a hot signal), \`deep-chain\` (end of a long dependency chain). Pure over \`getReactiveGraph()\`; dev/test only. Pairs with \`getUpdateCause\` — this describes the whole graph, that explains one update. See also: getReactiveGraph, getUpdateCause, activateReactiveDevtools.`,
    mistakes: `- Running it in production — the reactive registry is tree-shaken when \`NODE_ENV === "production"\`, so the graph (and description) is empty.
- Treating an \`orphan-signal\` insight as always a bug — a signal read only outside a tracking scope (an event handler) legitimately has no graph dependents; it flags the SHAPE, you confirm intent.
- Expecting it to describe a component from SOURCE without running — it reads the LIVE graph (\`getReactiveGraph()\`), so the reactive nodes must have been created + subscribed first.`,
  },

  'reactivity/getUpdateCause': {
    signature: 'getUpdateCause(nodeId: number): UpdateCause | null  ·  formatUpdateCause(cause: UpdateCause): string',
    example: `activateReactiveDevtools()
const qty = signal(2, { name: 'qty' })
const total = computed(() => qty() * 9.99)
effect(() => { void total() })
qty.set(5)
const effectId = getReactiveGraph().nodes.find(n => n.kind === 'effect').id
console.log(formatUpdateCause(getUpdateCause(effectId)))
// Why did effect#4 update?
//   qty (signal) changed  Cart.tsx:2:13
//   → total (derived) recomputed
//   → effect#4 (effect) ran   ← explained`,
    notes: `Answers "why did this node just update?" at the SOURCE LINE, along the exact causal chain — the thing React DevTools' whole-component "why did this render?" can't. \`getUpdateCause\` reconstructs the chain that led to a node's most recent fire by walking the dependency graph from the target through the deps that fired in the SAME synchronous cascade (clustered within ~one animation frame). Returns \`{ target, chain, rootReached }\` where \`chain\` is ROOT-FIRST (\`chain[0]\` is the originating signal write) and each \`CauseLink\` is \`{ id, kind, name, loc, ts }\`. \`formatUpdateCause\` renders it as a source-anchored trace. Purely READ-time over \`getReactiveGraph()\` + \`getReactiveFires()\` — zero hot-path cost. The graph (not the timeline) is the causal structure: a lazy computed recomputes DURING its subscriber's read, so temporal order ≠ causal order. Also on \`window.__PYREON_DEVTOOLS__.reactive\`. Requires \`activateReactiveDevtools()\`. See also: getReactiveGraph, activateReactiveDevtools, getReactiveTrace.`,
    mistakes: `- Trusting the chain across UNRELATED rapid interactions — reconstruction is exact for one synchronous cascade; interactions within the ~16ms cluster window can blur. \`rootReached: false\` means older fires aged out of the ring buffer.
- Calling it in production — the reactive registry is tree-shaken when \`NODE_ENV === "production"\`, so \`getUpdateCause\` returns null (nothing tracked).
- Expecting timeline order to be causal order — it is NOT (a lazy computed recomputes during its subscriber's read). \`getUpdateCause\` uses the dependency graph as the causal structure on purpose.`,
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

  'reactivity/startReactiveCoverage': {
    signature: '() => void',
    example: `import { startReactiveCoverage, takeReactiveCoverage, stopReactiveCoverage, formatReactiveCoverage } from '@pyreon/reactivity/coverage'

startReactiveCoverage()
// … mount a component / run a test scenario …
const report = takeReactiveCoverage()
stopReactiveCoverage()
console.log(formatReactiveCoverage(report))`,
    notes: `Begin a Reactive Coverage session (from the \`@pyreon/reactivity/coverage\` subpath). Resets the dev registry to a clean baseline, pins every node created from here on (so an unmounting component isn't GC-pruned out of the denominator), and enables graph reads. Create + exercise the reactive code you want to measure AFTER calling this. Pairs with \`takeReactiveCoverage()\` + \`stopReactiveCoverage()\`. Dev/test only — the registry is tree-shaken in production. See also: takeReactiveCoverage, stopReactiveCoverage, computeReactiveCoverage.`,
    mistakes: `- Creating the signals/effects you want to measure BEFORE \`startReactiveCoverage()\` — the baseline reset wipes pre-session nodes; create them after.
- Expecting coverage in a production build — the reactive registry is tree-shaken when \`NODE_ENV === "production"\`, so the report is a vacuous 100%.`,
  },

  'reactivity/takeReactiveCoverage': {
    signature: '() => ReactiveCoverageReport',
    example: `const report = takeReactiveCoverage()
console.log(report.percent, 'covered') // e.g. 42.9
for (const e of report.uncoveredEntries) console.log(e.reason, e.name, e.loc)`,
    notes: 'Snapshot the current Reactive Coverage session into a `ReactiveCoverageReport` — `{ total, covered, uncovered, percent, byKind, entries, uncoveredEntries }`, where each entry is `{ id, kind, name, fires, subscribers, covered, reason, loc }`. A node is covered when its reactive behaviour actually fired: signals when they changed (`fires ≥ 1`), effects/derived when they RE-ran past their mount run (`fires ≥ 2`). The `ran-once` reason flags the interesting bucket — a mounted effect/computed whose reactive re-run was never triggered. Call any number of times while the session is active. See also: startReactiveCoverage, formatReactiveCoverage, computeReactiveCoverage.',
  },

  'reactivity/formatReactiveCoverage': {
    signature: '(report: ReactiveCoverageReport, opts?: { showCovered?: boolean; limit?: number }) => string',
    example: `console.log(formatReactiveCoverage(report))
// Reactive Coverage — 42.9% (3 of 7 reactive nodes exercised)
//   signals 1/3   derived 1/2   effects 1/2
console.log(formatReactiveCoverage(report, { showCovered: true, limit: 20 }))`,
    notes: `Render a \`ReactiveCoverageReport\` as a dependency-free, human-readable text block: a headline (\`Reactive Coverage — 42.9% (3 of 7 …)\`), a per-kind line (\`signals 1/3   derived 1/2   effects 1/2\`), and the uncovered list with each node's reason + source location. The machine-readable form is the \`ReactiveCoverageReport\` itself; \`computeReactiveCoverage(nodes)\` is the pure function that builds it from \`getReactiveGraph().nodes\`. See also: takeReactiveCoverage, computeReactiveCoverage.`,
  },

  'reactivity/SignalValue': {
    signature: 'type SignalValue<S> = S extends () => infer T ? T : never',
    example: `const user = signal({ id: 1, name: 'Ada' })
type User = SignalValue<typeof user> // { id: number; name: string }

function save(next: SignalValue<typeof user>) { user.set(next) }`,
    notes: `Unwrap the VALUE type of a \`Signal<T>\`, \`Computed<T>\`, \`ReadonlySignal<T>\`, or any zero-arg accessor — \`SignalValue<typeof count>\` is \`number\` for \`const count = signal(0)\`. Derive, don't annotate twice: when a function's parameter should be "whatever that signal holds", derive it from the signal instead of repeating the value type. Type-only export — zero runtime bytes. See also: signal, ComputedValue, MaybeAccessor.`,
    mistakes: `- \`SignalValue<number>\` — resolves to \`never\`; the input must be the SIGNAL type (\`typeof mySignal\`), not the value type itself
- Passing the signal where the unwrapped value is expected — \`save(user)\` fails typecheck; read it first: \`save(user())\`
- Using it on a function that REQUIRES arguments — only zero-arg callables unwrap; \`(x: number) => string\` resolves to \`never\` by design`,
  },

  'reactivity/ComputedValue': {
    signature: 'type ComputedValue<C> = C extends () => infer T ? T : never',
    example: `const total = computed(() => price() * qty())
type Total = ComputedValue<typeof total> // number`,
    notes: 'Unwrap the value type of a `Computed<T>` — intent-revealing alias of `SignalValue` (every Pyreon reactive read is a zero-arg callable, so one conditional covers both). Type-only, zero runtime bytes. See also: computed, SignalValue.',
    mistakes: `- \`ComputedValue<ReturnType<typeof computed>>\` gymnastics — pass \`typeof total\` directly
- Expecting it to unwrap a plain derived VALUE — a non-callable resolves to \`never\``,
  },

  'reactivity/MaybeAccessor': {
    signature: 'type MaybeAccessor<T> = T | (() => T)',
    example: `function useTitle(title: MaybeAccessor<string>) {
  const read = () => (typeof title === 'function' ? title() : title)
  effect(() => { document.title = read() }) // accessor form stays reactive
}
useTitle('Static')
useTitle(() => pageTitle())`,
    notes: 'The standard "static value OR reactive accessor" parameter shape used across Pyreon APIs (`<Show when>`, hook options). NOT auto-called — code accepting a `MaybeAccessor<T>` must resolve it itself (`typeof v === "function" ? v() : v`) and should do that read inside a reactive scope so the accessor form tracks. Pair with `AccessorReturn` to derive the resolved type. Type-only, zero runtime bytes. See also: AccessorReturn, SignalValue, signal.',
    mistakes: `- MaybeAccessor is NOT auto-called — the ACCEPTING code must resolve it with a \`typeof v === "function"\` check; passing an accessor to code that only reads the value renders the function source
- Resolving it ONCE at setup (\`const v = typeof title === "function" ? title() : title\`) — captures the accessor's value statically; resolve INSIDE the effect/JSX accessor to keep tracking
- Using it for a FUNCTION-valued parameter (\`MaybeAccessor<() => void>\`) — the two union arms are runtime-ambiguous; use a dedicated options field instead
- Discriminating with a framework brand check when plain \`typeof v === "function"\` suffices — a Signal IS a \`() => T\`, the accessor arm covers it`,
  },

  'reactivity/AccessorReturn': {
    signature: 'type AccessorReturn<A> = A extends () => infer T ? T : A',
    example: `type A = AccessorReturn<() => number>           // number
type B = AccessorReturn<string>                  // string
type C = AccessorReturn<MaybeAccessor<boolean>>  // boolean`,
    notes: 'Resolve a `MaybeAccessor` (or any accessor) to its VALUE type — unwraps the `() => T` arm and passes plain values through unchanged (`AccessorReturn<MaybeAccessor<T>>` round-trips to `T`). Type-only, zero runtime bytes. See also: MaybeAccessor, SignalValue.',
    mistakes: '- Confusing it with `SignalValue` — `AccessorReturn<number>` is `number` (pass-through) while `SignalValue<number>` is `never` (strict: input must be callable)',
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
    signature: '<ErrorBoundary fallback={(err, reset) => VNodeChild}>{children}</ErrorBoundary>',
    example: `<ErrorBoundary
  fallback={(err, reset) => (
    <div>
      <p>Error: {String(err)}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
>
  <App />
</ErrorBoundary>`,
    notes: 'Catches render errors thrown by descendant components. The `fallback` receives the caught error (typed `unknown`) and a `reset()` function — calling `reset()` clears the error and re-renders children. Without an ErrorBoundary, uncaught errors propagate to the nearest `registerErrorHandler` or crash the app. There is no `onCatch` prop — for logging/telemetry, log inside `fallback` or use `registerErrorHandler`. See also: Suspense, registerErrorHandler.',
    mistakes: `- Passing an \`onCatch\` prop — it does not exist. \`fallback\` is the only prop (besides children); log the error inside it or via \`registerErrorHandler\`
- Reading \`err.message\` directly — \`err\` is typed \`unknown\`; narrow it (\`err instanceof Error ? err.message : String(err)\`) or \`String(err)\``,
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
    signature: 'cx(value: ClassValue): string',
    example: `cx(["foo", "bar"])                       // "foo bar"
cx(["base", isActive && "active"])       // conditional
cx({ base: true, active: isActive() })   // object syntax
cx(["a", ["b", { c: true }]])            // nested arrays

// class prop accepts ClassValue directly:
<div class={["base", cond && "active"]} />`,
    notes: 'Combine a class value into a single string. Takes ONE `ClassValue` — a string, boolean (falsy ignored), object (`{ active: true }`), or (possibly nested) array. To combine multiple values, pass them as an ARRAY (`cx(["btn", active && "on"])`), not as separate arguments — `cx` is single-arg. The `class` prop on JSX elements already accepts `ClassValue` directly, so explicit `cx()` is only needed when building class strings outside JSX. See also: splitProps, mergeProps.',
    mistakes: '- Calling `cx("a", "b")` with multiple arguments — `cx` takes ONE `ClassValue`. Wrap in an array: `cx(["a", "b"])`',
  },

  'core/useControllableState': {
    signature: 'useControllableState<T>(options: { value: () => T | undefined; defaultValue: T; onChange?: (value: T) => void }): [() => T, (next: T | ((prev: T) => T)) => void]',
    example: `const Switch = (props: { checked?: boolean; onChange?: (v: boolean) => void }) => {
  const [own, rest] = splitProps(props, ["checked", "onChange"])
  const [checked, setChecked] = useControllableState({
    value: () => own.checked,
    defaultValue: false,
    onChange: own.onChange,
  })
  return <button {...rest} aria-checked={() => (checked() ? "true" : "false")} onClick={() => setChecked(!checked())} />
}`,
    notes: 'The controlled/uncontrolled state pattern, as one primitive. Returns a `[getter, setter]` pair that reads an external `value` prop when one is supplied and falls back to internal signal state when it is not, calling `onChange` on every write either way. `value` MUST be a getter (`() => own.checked`) so the controlled prop is read lazily inside reactive scopes — an eager read captures it once and the component stops tracking the owner. Every component with a `checked`/`value`/`open`-style prop needs this; it lives beside `splitProps` because it is a props primitive, not a hook (it owns no lifecycle). Re-exported from `@pyreon/hooks` for back-compat. See also: splitProps, mergeProps.',
    mistakes: `- Passing a VALUE instead of a getter — \`value: own.checked\` reads once at setup and freezes; it must be \`value: () => own.checked\`
- Hand-rolling \`const isControlled = props.value !== undefined\` + a parallel signal — that is exactly this primitive, and the hand-rolled version usually forgets to call \`onChange\` in the uncontrolled branch
- Writing to the setter and expecting a CONTROLLED component to update itself — it will not; the owner decides. The setter only reports via \`onChange\`
- Assuming \`defaultValue\` still applies once \`value\` is supplied — controlled wins for the whole lifetime of the component`,
  },

  'core/splitProps': {
    signature: 'splitProps<T, K extends keyof T>(props: T, keys: K[]): [Pick<T, K>, Omit<T, K>]',
    example: `const Button = (props: { class?: string; onClick: () => void; children: VNodeChild }) => {
  const [local, rest] = splitProps(props, ["class"])
  return <button {...rest} class={cx(["btn", local.class])} />
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
    signature: 'mapArray<T, U>(source: () => T[], getKey: (item: T) => string | number, map: (item: T) => U): () => U[]',
    example: `const items = signal([{ id: 1, n: 2 }, { id: 2, n: 3 }])
const doubled = mapArray(() => items(), (item) => item.id, (item) => item.n * 2)
// doubled() → [4, 6] — updates reactively, keyed by id`,
    notes: 'Low-level reactive array mapping used internally by `<For>`. Maps a reactive array through a transform, caching results per KEY so unchanged items reuse their mapped value. Takes THREE args — the source accessor, a `getKey` identity function, and the `map` transform. Prefer `<For>` in JSX — use `mapArray` only when you need a reactive derived array outside of rendering. See also: For.',
    mistakes: '- Omitting the `getKey` argument — `mapArray` requires 3 args (source, getKey, map); without a key function it cannot cache per-item across updates',
  },

  'core/createRef': {
    signature: 'createRef<T>(): Ref<T>',
    example: `const inputRef = createRef<HTMLInputElement>()
onMount(() => inputRef.current?.focus())
return <input ref={inputRef} />`,
    notes: 'Create a mutable ref object (`{ current: T | null }`) for holding DOM element references. Pass as the `ref` prop on JSX elements — the runtime sets `.current` after mount and clears it on unmount. Callback refs (`(el: T | null) => void`) are also supported via `RefProp<T>`. See also: onMount.',
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

  'primitives/Web / NativeIOS / NativeAndroid': {
    signature: 'Web(props: { children }) => VNodeChild · NativeIOS(props: { children }) => VNodeChild · NativeAndroid(props: { children }) => VNodeChild',
    example: `<Web>{/* web-only-rich: <Chart>, <Flow>, <Table> */}</Web>
<NativeIOS>{/* Swift Charts, or a <WebView> embed */}</NativeIOS>
<NativeAndroid>{/* Compose chart, or a <WebView> embed */}</NativeAndroid>`,
    notes: `The Layer-4 per-platform escape hatch — one source carries a platform-specific subtree and exactly ONE branch renders per target. \`<Web>\` renders its children on WEB only (a layout-transparent Fragment, no wrapper element); \`<NativeIOS>\` / \`<NativeAndroid>\` render NOTHING on web (they return null — their children are emitted only on the iOS / Android target by PMTC). Reach for these for the rare genuinely-per-platform UI branch the 15 canonical primitives can't express (a web-only-rich chart/flow/table view vs a native equivalent or a \`<WebView>\` embed). See also: WebView, init / resetPrimitivesConfig.`,
    mistakes: `- Overusing them — defeats the one-source model; reach for them only when a target genuinely needs different UI.
- Putting web-visible content in \`<NativeIOS>\` / \`<NativeAndroid>\` — both render NOTHING on web (they are no-ops there); only \`<Web>\` content reaches the browser.`,
  },

  'primitives/init / resetPrimitivesConfig': {
    signature: 'init(options: { navigate?: (to: string) => void }) => void · resetPrimitivesConfig() => void',
    example: `import { init } from '@pyreon/primitives'

// at app boot, wire your router's navigate so <Link> does SPA navigation:
init({ navigate: (to) => myRouter.push(to) })`,
    notes: 'One-time app-boot configuration for `@pyreon/primitives`. The package is deliberately router-AGNOSTIC (a consumer using only `<Stack>`/`<Text>` never pulls a router into their graph), so `<Link>` needs a navigation handler supplied ONCE via `init({ navigate })`. With it, `<Link>` intercepts plain left-clicks and routes via `navigate` (SPA — no full reload); WITHOUT it, `<Link>` is a plain `<a href>` that does a normal full-page navigation — so links always WORK, `init` only UPGRADES them to SPA. `init` merges with any previous config (later calls override the keys they set). `resetPrimitivesConfig()` clears it back to defaults (primarily for tests / teardown). The config is a module-level singleton and SSR-safe (the server renders a static `<a href>`; `navigate` is read only inside a client click handler). See also: Link, Web / NativeIOS / NativeAndroid.',
    mistakes: `- Wondering why \`<Link>\` does a FULL PAGE RELOAD — you did not call \`init({ navigate })\`. Without a navigate handler, \`<Link>\` falls back to a plain \`<a href>\` full-load; call \`init\` once at app boot with your router push.
- Expecting it to import a router — it is router-AGNOSTIC by design (works with any router, or none); YOU supply the \`navigate\` closure so the package never depends on \`@pyreon/router\`.`,
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
- Assuming bare \`{count}\` is auto-called for an IMPORTED signal without seeding \`knownSignals\` — the compiler only tracks \`const count = signal(...)\` declared in the same file unless told otherwise
- Treating the output as standalone/portable — the emitted code calls internal runtime helpers (\`_tpl\`/\`_setChild\` from \`@pyreon/runtime-dom\`, \`_bind\` from \`@pyreon/reactivity\`, \`_rp\` from \`@pyreon/core\`, …) that only the Pyreon packages provide. Unlike Babel's JSX→\`React.createElement\` (where the runtime is just React), transformed code cannot run without the Pyreon runtime.`,
  },

  'compiler/transformJSX_JS': {
    signature: 'transformJSX_JS(code: string, filename?: string, options?: TransformOptions): TransformResult',
    example: `import { transformJSX_JS } from "@pyreon/compiler"

// Backend-deterministic — never dispatches to the native binary.
const { code } = transformJSX_JS("<div>{name()}</div>", "x.tsx")`,
    notes: 'The pure-JS reactive pass (parses via `oxc-parser`). Same signature and byte-identical output to the native path — `transformJSX` calls it as the fallback. Call it directly only when you need backend-deterministic output (the Reactivity-Lens forces this path so the sidecar is always emitted regardless of whether the native binary is installed). See also: transformJSX.',
    mistakes: `- Reaching for it in a production build to be "safe" — it is the SLOW fallback (the native binary is 3.7-8.9× faster). Use \`transformJSX\`; it already falls back to this path per-call inside a try/catch. Call \`transformJSX_JS\` directly only when you need backend-deterministic output (tests, the Reactivity-Lens sidecar).
- Expecting a simpler/lighter transform than the native path — the output is BYTE-IDENTICAL (locked by the cross-backend equivalence + fuzz tests). It is not a reduced pass, just the same pass in JS.`,
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

  'compiler/analyzeValidate': {
    signature: 'analyzeValidate(code: string, filename?: string): ValidateSchemaInfo[]',
    example: `import { analyzeValidate } from "@pyreon/compiler"

const [info] = analyzeValidate("const L = s.object({ e: s.string().email() })")
info.emittable // true`,
    notes: `[EXPERIMENTAL] Build-time analogue of @pyreon/validate's runtime JIT: reads \`s.*\` schema DEFINITIONS from source and parses each into a typed IR (\`ValidateSchemaInfo\` — primitives \`string\`/\`number\`/\`boolean\`/\`literal\` with their common checks, plus \`object\`/\`array\` composition and \`.optional()\`). Conservative by construction — any shape it doesn't recognize becomes an \`unsupported\` node and the schema's \`emittable\` is false, so a partial understanding never yields a wrong validator. Pure, deterministic, TS-compiler-API based. Pairs with \`emitValidator\` to produce typia-class specialized validators at build time. See also: emitValidator, isEmittable.`,
  },

  'compiler/emitValidator': {
    signature: 'emitValidator(node: ValidateNode): string',
    example: `import { analyzeValidate, emitValidator } from "@pyreon/compiler"

const [info] = analyzeValidate("const S = s.string().email()")
const src = emitValidator(info.node)
const validate = new Function("return " + src)()
validate("a@b.co").length // 0`,
    notes: '[EXPERIMENTAL] Emits a monomorphic, fully-inlined validator FUNCTION SOURCE for an emittable `analyzeValidate` IR node — straight-line `typeof` / regex / comparison checks specialized to the exact shape, with NO op-array traversal or per-check closure dispatch (the typia-class approach). Returns an arrow expression `(input) => Issue[]` (zero issues ⟺ valid). Throws on an `unsupported` node — guard with `isEmittable` first. Wiring this into @pyreon/vite-plugin (replacing runtime schema construction at a call site) is a follow-up; this is the pure, independently-testable foundation. See also: analyzeValidate.',
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

  'compiler/migratePyreonCode': {
    signature: 'migratePyreonCode(source: string, filename?: string): PyreonMigrationResult',
    example: `import { migratePyreonCode } from "@pyreon/compiler"

const { code, changes, remaining } = migratePyreonCode(source, "C.tsx")`,
    notes: 'Pyreon→correct-Pyreon codemod (the parallel to `migrateReactCode`). Auto-fixes ONLY the mechanically-safe `detectPyreonPatterns` footguns — `sig(v)`→`sig.set(v)` (signal-write-as-call), `<For key>`→`<For by>` (for-with-key), and dropping `x as unknown as VNodeChild` (as-unknown-as-vnodechild), tracked by `AUTO_FIXABLE_PYREON_CODES`. Span-based, applied back-to-front, non-overlapping, idempotent — so the output is safe to apply verbatim. Returns `{ code, changes, remaining }` where `remaining` is every OTHER detected footgun (props-destructured, on-click-undefined, …) that needs a human. This is why those three codes report `fixable: true`. See also: detectPyreonPatterns, migrateReactCode.',
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
    notes: 'Maps a raw runtime/build error string to a structured `ErrorDiagnosis` (likely cause + actionable fix) for known Pyreon failure shapes. Returns `null` when the error is unrecognised — callers fall back to the raw message. See also: detectPyreonPatterns.',
    mistakes: `- Importing it from the main \`@pyreon/compiler\` barrel for CLIENT-SIDE use — the barrel transitively \`import ts from "typescript"\` (via the AST detectors/migrators), dragging the heavy Node-only TS compiler API into the browser bundle. For browser use (the dev throw-time error printer) import from the browser-safe \`@pyreon/compiler/diagnose\` subpath — \`diagnoseError\` + its \`ERROR_PATTERNS\` are pure regex/strings with ZERO \`typescript\` dependency.
- Feeding it a structured Error object — it matches the error STRING (\`error.message\`), not an \`Error\` instance. Pass \`err.message\`.
- Treating a \`null\` return as a failure — \`null\` just means "no known pattern matched"; callers fall back to showing the raw message. Only a non-null \`ErrorDiagnosis\` carries a cause/fix.`,
  },

  'compiler/detectPyreonPatterns': {
    signature: 'detectPyreonPatterns(code: string, filename?: string): PyreonDiagnostic[]',
    example: `import { detectPyreonPatterns } from "@pyreon/compiler"

const diags = detectPyreonPatterns(
  "const A = (props) => { const { x } = props; return <i>{x}</i> }",
  "A.tsx",
)
console.log(diags[0]?.code) // "props-destructured-body"`,
    notes: 'AST-based (TypeScript compiler API) detector for "using Pyreon wrong" mistakes — 16 codes today (`for-missing-by`, `for-with-key`, `props-destructured`, `props-destructured-body`, `process-dev-gate`, `empty-theme`, `raw-add-event-listener`, `raw-remove-event-listener`, `date-math-random-id`, `on-click-undefined`, `signal-write-as-call`, `static-return-null-conditional`, `static-early-return-conditional`, `as-unknown-as-vnodechild`, `island-never-with-registry-entry`, `query-options-as-function`). The detector arm behind the MCP `validate` tool and `pyreon doctor --check-pyreon-patterns`. Diagnostics report `fixable: true` ONLY for the 3 codes `migratePyreonCode` can auto-fix mechanically (`signal-write-as-call`, `for-with-key`, `as-unknown-as-vnodechild` — kept in sync via `AUTO_FIXABLE_PYREON_CODES`); every other code is `fixable: false`. See also: hasPyreonPatterns, detectReactPatterns, analyzeReactivity.',
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
for (const f of r.findings) console.log(f.code, f.location.relPath)`,
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
for (const f of r.findings) console.log(f.code, f.location.relPath)`,
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

  'compiler/filePathToUrlPath': {
    signature: 'filePathToUrlPath(filePath: string): string',
    example: `import { filePathToUrlPath } from "@pyreon/compiler/fs-route-convention"

filePathToUrlPath("blog/[...slug]") // "/blog/:slug*"
filePathToUrlPath("(auth)/login")   // "/login"`,
    notes: `The \`@pyreon/zero\` fs-route convention: extension-stripped route file path → URL pattern (\`index\` collapses, \`[id]\` → \`:id\`, \`[...slug]\` → \`:slug*\`, \`(group)\` segments are URL-invisible, special files \`_layout\`/\`_error\`/\`_loading\`/\`_404\`/\`_not-found\` are skipped). SINGLE SOURCE OF TRUTH — zero's fs-router re-exports this exact function and the project scanner (\`generateContext\`) uses it, so the two can never drift. Importable without the compiler barrel via the pure \`@pyreon/compiler/fs-route-convention\` subpath (no \`typescript\` cold-load). See also: isApiRoute, apiFilePathToPattern, generateContext.`,
  },

  'compiler/isApiRoute': {
    signature: 'isApiRoute(filePath: string): boolean',
    example: `import { isApiRoute } from "@pyreon/compiler/fs-route-convention"

isApiRoute("api/posts.ts")    // true
isApiRoute("posts/api/x.ts")  // false — page route
isApiRoute("api/page.tsx")    // false — page route`,
    notes: `True for a zero file-based API route: a \`.ts\`/\`.js\` file inside the TOP-LEVEL \`api/\` directory of the routes dir (path is routes-dir-relative). NOT nested \`posts/api/x.ts\` (a page route), NOT \`.tsx\`/\`.jsx\` under \`api/\` (page routes — they still SSR), NOT method-handler \`.ts\` files outside \`api/\` (zero registers those as page routes too). Shared by zero's api-route registration and the project scanner — the scanner's old copy accepted \`/api/\` at any depth and reported API routes zero never serves. See also: apiFilePathToPattern, filePathToUrlPath.`,
    mistakes: `- Assuming a nested \`posts/api/x.ts\` is an API route — only the TOP-LEVEL \`api/\` directory registers API routes; nested ones are page routes
- Assuming a method-handler \`.ts\` file outside \`api/\` becomes an API route — zero includes it in the PAGE route module (broken at render; move it under \`api/\`)`,
  },

  'compiler/apiFilePathToPattern': {
    signature: 'apiFilePathToPattern(filePath: string): string',
    example: `import { apiFilePathToPattern } from "@pyreon/compiler/fs-route-convention"

apiFilePathToPattern("api/posts/[id].ts") // "/api/posts/:id"`,
    notes: 'API route file path → URL pattern, keeping the `api/` prefix (it IS part of the URL): `api/posts.ts` → `/api/posts`, `api/posts/index.ts` → `/api/posts`, `api/posts/[id].ts` → `/api/posts/:id`, `api/[...path].ts` → `/api/:path*`. Only meaningful for paths `isApiRoute` accepts. See also: isApiRoute.',
  },

  'compiler/deriveIslandName': {
    signature: 'deriveIslandName(varName: string, relPath: string): string',
    example: `import { deriveIslandName, islandRelPath } from "@pyreon/compiler"

deriveIslandName("Counter", islandRelPath(root, "/app/src/islands.ts"))
// "Counter$<6-char-hash>"`,
    notes: `The island auto-name derivation: \`const X = island(…)\` (no explicit \`name:\`) in file F gets the registry name \`X$<fnv1a6(relPath(F))>\` — deterministic and collision-free by construction. SINGLE SOURCE OF TRUTH shared by \`@pyreon/vite-plugin\`'s transform-time name injection + auto-registry prescan AND the project scanner (\`generateContext\`), so marker, registry, and reported context names can never disagree. \`relPath\` is the Vite-root-relative forward-slash path (\`islandRelPath(root, absPath)\`). See also: generateContext.`,
    mistakes: `- Passing a \`relPath\` that is NOT the \`islandRelPath(root, absPath)\` output (an absolute path, a differently-rooted path, or a Windows backslash path) — the \`fnv1a6\` hash then differs from the one the transform + prescan + project scanner compute, so the injected marker name and the registry name DIVERGE and the island silently fails to hydrate. Always normalize via \`islandRelPath\` (root-relative, forward-slash).
- Deriving for a bindingless \`island(…)\` call (no \`const X = …\`) — there is no \`varName\` to build from; give the island an explicit \`name:\` instead (the runtime throws with guidance when no name reaches it).
- Expecting the derived name to override an explicit \`name:\` — an explicit \`name:\` on the island options WINS; derivation only supplies the auto-name when none is given.`,
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
    mistakes: `- SSR renders a BLANK page for a lazy route when the handler only ran \`prefetchLoaderData\` — that runs LOADERS ONLY, it does NOT resolve \`lazy()\` route components. \`renderToString\` is synchronous, so an unresolved lazy component falls back to its empty loading state. The SSR handler must ALSO call \`router.preload(path, req)\` (resolves lazy components into \`_componentCache\`) before rendering.
- Forgetting the inner \`<RouterView />\` inside a LAYOUT component — nested child routes render by placing a SECOND \`<RouterView />\` in the layout body, one per depth level. Without it the layout renders but its children never appear (they have no mount point).
- Expecting a param-only navigation (\`/user/1 → /user/2\`) to re-run the layout body — it does NOT. Each depth is a single atomic \`computed\` keyed on (matched record, component, its own loader data, route ref); it re-emits only when the matched RECORD or that depth's own loader data changes. A loader-LESS layout mounts ONCE and persists; only the page leaf re-renders (via reactive props). Do not put per-navigation side effects in a layout body expecting them to re-fire.
- Passing the route component as a prop or child to \`<RouterView>\` — it takes none except \`router?\` (explicit router override; defaults to the context/active router) and \`announceRouteChanges\` (a11y live-region opt-out). It reads the matched chain from \`RouterContext\`; configure routes in \`createRouter\`, never on RouterView.
- In a \`*-compat\` app, wrapping \`<RouterView>\` in your OWN layout helper that uses \`provide()\`/\`onMount()\`/\`effect()\` at body scope without marking it \`nativeCompat()\` — the compat jsx runtime relocates its setup into a wrapper accessor. RouterView itself ships \`nativeCompat\`-marked; your helpers around it must be too.
- Passing \`layout\` to \`@pyreon/zero\`'s \`createApp\`/\`startClient\` when fs-router already emits \`_layout.tsx\` — the layout is a parent route in the matched chain that RouterView renders, so the explicit \`layout\` mounts it a SECOND time (two navbars / two providers). Let \`_layout.tsx\` be the canonical registration; do not also pass \`layout\`.`,
  },

  'router/RouterLink': {
    signature: '<RouterLink to={path} activeClass={cls} exactActiveClass={cls}>{children}</RouterLink>',
    example: `<RouterLink to="/" activeClass="nav-active">Home</RouterLink>
<RouterLink to="https://github.com/pyreon">GitHub</RouterLink>{/* auto target=_blank + secure rel */}`,
    notes: 'Declarative navigation link that renders an `<a>` element. Applies `activeClass` when the current route matches the link path (prefix), and `exactActiveClass` for exact matches. Only INTERNAL navigations are intercepted (`router.push()` + `preventDefault`); external URLs, `mailto:`/`tel:`, and `#hash` are detected from `to` at runtime and left to the browser — external links auto-get `target="_blank" rel="noopener noreferrer"`. Resolves its router like every hook does (context ?? active router), so links outside the provider subtree still client-navigate; with NO router resolvable it degrades to a plain anchor (plain-path `href`, no click interception → full-load navigation) and warns once per `to` in dev. `to` is generic (`CheckHref<T>`): with routes registered via the `RegisteredRoutes` augmentation, a mistyped internal path is a compile error, while dynamic `string`s and external URLs are always accepted. See also: useRouter, useIsActive, createRouter.',
    mistakes: `- \`<a href="/about" onClick={() => router.push("/about")}>\` — use \`<RouterLink to="/about">\` instead; it handles the anchor element, active class, and click interception
- Plain internal \`<a href="/about">\` in a router app — triggers a FULL page reload (dev warns at the document level with the RouterLink replacement). Deliberate full-load links opt out via \`target\`, \`download\`, or \`data-allow-reload\`.
- Rendering \`<RouterLink>\` with no \`<RouterProvider>\` ancestor (and no \`setActiveRouter\`) — the link degrades to a plain anchor: plain-path \`href\`, full page load on click (dev warns once per \`to\`). Wrap the tree in \`<RouterProvider router={…}>\` for client-side navigation.
- Wrapping an external URL in a plain \`<a>\` to avoid router interception — unnecessary: \`<RouterLink to="https://x.com">\` already detects it as external, renders \`target="_blank" rel="noopener noreferrer"\`, and does NOT client-navigate. Override with \`external\` / \`target\` / \`rel\` props or the \`createRouter({ links })\` config.
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
    notes: `Access the router instance for programmatic navigation. Returns the \`Router\` object with \`push()\`, \`replace()\`, \`back()\`, \`forward()\`, \`go()\`. \`await router.push()\` resolves after the View Transition \`updateCallbackDone\` (DOM commit is complete, new route state is live), NOT after the animation finishes — and resolves WITH a \`NavigationResult\`: \`'committed'\` (route changed), \`'cancelled'\` (a blocker/guard/middleware refused), or \`'superseded'\` (a newer navigation won). Browser Back/Forward routes through the same pipeline (guards, blockers, loaders, afterEach, scroll, \`meta.title\`). See also: useRoute, RouterLink, createRouter.`,
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
    mistakes: `- \`const { params } = useRoute()\` — \`useRoute()\` returns an ACCESSOR (it IS \`router.currentRoute\`), so this destructures the FUNCTION object (which has no \`params\`) → \`undefined\`. Read it: \`const route = useRoute(); route().params.id\`.
- Reading \`route().params.id\` OUTSIDE a reactive scope (in the raw component body) captures the value ONCE — it will NOT update on a same-component param change (\`/user/1 → /user/2\` re-renders the User leaf but the top-level \`const\` was already evaluated). Read inside JSX / \`effect\` / \`computed\` to track.
- Treating the \`<TPath>\` type param as validated — \`useRoute<"/user/:id">()\` is your ASSERTION about the mounted path (the impl casts \`as never\`). A wrong literal gives wrong param types with no runtime error.
- Calling \`useRoute()\` with no \`<RouterProvider>\` ancestor and no active router — throws \`[Pyreon] No router installed\`.`,
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
    signature: 'useTypedSearchParams<T extends SearchParamSchema>(schema: T): [get: () => InferSearchParams<T>, set: (updates: Partial<InferSearchParams<T>>) => Promise<NavigationResult>]',
    example: `const [params, setParams] = useTypedSearchParams({ page: "number", q: "string", active: "boolean" })
params().page    // number (auto-coerced)
params().q       // string
setParams({ page: 2 })  // updates URL via router.replace`,
    notes: `Type-safe search params with auto-coercion from URL strings. Schema keys define parameter names, values define types (\`"string"\`, \`"number"\`, \`"boolean"\`). Returns a \`[get, set]\` TUPLE (like \`useSearchParams\`): \`get()\` reads the coerced values reactively; \`set()\` merges updates and navigates via \`router.replace\` (resolving with the navigation's \`NavigationResult\`). Missing numbers coerce to \`0\`, booleans accept \`"true"\`/\`"1"\`. See also: useSearchParams, useRoute.`,
    mistakes: `- Destructuring an object (\`params.page()\`) — the hook returns a TUPLE: \`const [params, setParams] = useTypedSearchParams(...)\`, read via \`params().page\`
- Expecting \`set()\` to bypass navigation — it navigates via \`router.replace\`, so guards/blockers apply (check the resolved \`NavigationResult\` if you need to know it committed)`,
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
    notes: 'Returns a reactive accessor for data set by `RouteMiddleware` in the middleware chain. Middleware functions receive `ctx` with a mutable `ctx.data` object — properties set there are read by calling the returned accessor inside a reactive scope. The data is per-navigation: it resets to `{}` when a navigation whose chain has no middleware commits. (Stored on the router at commit time — the in-flight route object never becomes `currentRoute()`, which is why the pre-fix accessor always returned `{}`.) See also: createRouter, useLoaderData.',
  },

  'router/useLoaderData': {
    signature: 'useLoaderData<T>(): T',
    example: `// Route: { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) }

const User = () => {
  const data = useLoaderData<UserData>()
  return <div>{data.name}</div>
}`,
    notes: `Access the data returned by the current route's \`loader\` function. The loader runs before the route component mounts; its return value is cached and available synchronously via this hook. Generic over the loader return type. See also: useMiddlewareData, useRoute.`,
    mistakes: `- Getting \`undefined\` when the route has NO \`loader\` — it reads \`LoaderDataContext\` (default \`undefined\`). The \`<T>\` generic is an unchecked CAST, not validation; \`data.name\` then throws on the undefined.
- Wrapping \`useLoaderData()\` in an \`effect\` expecting it to re-fire on navigation — it is a plain (non-reactive) context READ, a snapshot at mount, NOT an accessor. RouterView RE-MOUNTS the route component on a real navigation, which re-runs the body and re-reads the hook; there is no signal to subscribe to.
- SSR returning \`undefined\` at render time — loaders are async but \`renderToString\` is synchronous, so the handler must run loaders (\`prefetchLoaderData\` or \`router.preload\`) BEFORE rendering. An un-prefetched loader has not resolved when the component reads the hook.
- Calling it in a component NOT rendered by \`<RouterView>\` (a sibling inside \`<RouterProvider>\`, a portal outside the route tree) — no \`LoaderDataProvider\` wraps it, so the context is the default \`undefined\`.
- Expecting a nested LAYOUT's \`useLoaderData()\` to return the child PAGE's data — each depth is wrapped with its OWN \`LoaderDataProvider\`, so a layout reads its own loader's data and the page reads the page's. The hook reads the nearest provider, not the leaf.`,
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
    signature: 'useSearchParams<T>(defaults?: T): [get: () => T, set: (updates: Partial<T>) => Promise<NavigationResult>]',
    example: `const [search, setSearch] = useSearchParams({ page: "1", sort: "name" })

// Read:
search().page  // "1"

// Write:
setSearch({ page: "2" })`,
    notes: 'Access and update URL search params as a reactive tuple. Returns `[get, set]` where `get()` reads the current params and `set()` updates them via `replaceState`. For typed params with auto-coercion, prefer `useTypedSearchParams`. See also: useTypedSearchParams, useRoute.',
    mistakes: `- Object-destructuring the return (\`params.page()\`) — it is a \`[get, set]\` TUPLE like \`useTypedSearchParams\`: \`const [search, setSearch] = useSearchParams(...)\`, read via \`search().page\`.
- Expecting auto-coerced types — \`useSearchParams\` values are RAW strings (\`search().page\` is \`"1"\`, not \`1\`). For typed, auto-coerced params (\`"number"\`/\`"boolean"\`), use \`useTypedSearchParams\`.`,
  },

  'router/useBlocker': {
    signature: 'useBlocker(fn: BlockerFn): Blocker',
    example: `const blocker = useBlocker((to, from) => {
  return form.isDirty() && !confirm('Discard unsaved changes?')
})
// later, e.g. after save:
blocker.remove()`,
    notes: 'Block navigations while a condition holds. `fn(to, from)` is called before EVERY navigation — including browser Back/Forward, which route through the full pipeline — and returning `true` (or resolving to `true`; async blockers are supported, e.g. `confirm()` dialogs) cancels it. A cancelled browser traversal restores the URL/history position. Returns `{ remove() }` to unregister (auto-removed on component unmount). Also installs a shared ref-counted `beforeunload` handler so tab-close shows the browser confirmation while any blocker is active. See also: useRouter, onBeforeRouteLeave.',
    mistakes: `- Expecting \`proceed()\` / \`reset()\` methods (React Router shape) — Pyreon's blocker is a predicate: return \`true\` to block, \`false\` to allow; \`remove()\` unregisters it
- Returning \`false\` to block — inverted: \`true\` means BLOCK (it answers "should this navigation be blocked?")
- Assuming the Back button bypasses blockers — browser traversals run the same pipeline; a blocked Back restores the URL`,
  },

  'router/onBeforeRouteLeave': {
    signature: 'onBeforeRouteLeave(guard: NavigationGuard): () => void',
    example: `onBeforeRouteLeave((to, from) => {
  if (hasUnsavedChanges()) return false  // cancel navigation
})`,
    notes: 'Register a per-component navigation guard that fires when leaving the current route. Return `false` to cancel, a string path to redirect, or `undefined` to allow. Must be called during component setup. See also: onBeforeRouteUpdate, useBlocker.',
    mistakes: `- Return-value inversion vs \`useBlocker\` — a GUARD returns \`false\` to CANCEL (and \`undefined\` to allow), while a BLOCKER returns \`true\` to BLOCK. They are opposite; mixing them up either lets navigations through or blocks them all.
- Calling it in an event handler or \`effect\` — the guard DOES register (it goes through \`router.beforeEach\` unconditionally), but only the \`onUnmount\` auto-removal is setup-bound: outside component setup the cleanup never attaches, so the guard LEAKS (keeps firing after the component unmounts). Call it during setup, or hold the returned remover and call it yourself.
- Returning a truthy non-string (e.g. an object) expecting a redirect — only a STRING return redirects (to that path); \`false\` cancels, \`undefined\` allows.`,
  },

  'router/onBeforeRouteUpdate': {
    signature: 'onBeforeRouteUpdate(guard: NavigationGuard): () => void',
    example: `onBeforeRouteUpdate((to, from) => {
  if (to.params.id === from.params.id) return  // no change — allow
  if (hasUnsavedChanges()) return false        // cancel: the param change would lose unsaved edits
  // otherwise allow — reload data for the new ID
})`,
    notes: 'Register a per-component navigation guard that fires when the route updates but the same component stays mounted (e.g., param change `/user/1` to `/user/2`). Same return semantics as `onBeforeRouteLeave` — return `false` to cancel, a string path to redirect, or `undefined` to allow. See also: onBeforeRouteLeave, useRoute.',
  },

  'router/useNavigate': {
    signature: 'useNavigate() => (path: string) => void',
    example: `const navigate = useNavigate()
// call it from an event handler / onMount / effect — never the render body:
const goHome = () => navigate('/')`,
    notes: 'Returns an imperative navigate function. Resolves the active router (context first, module singleton fallback) and returns `(path) => router.push(path)`. The returned function ALWAYS pushes (never replaces) and is typed `void` — the underlying `push()` Promise<NavigationResult> is dropped. Mirrors the `useNavigate()` shape on the native (Swift/Kotlin) targets for cross-target source parity. See also: useRouter, RouterLink.',
    mistakes: `- Awaiting the result — the returned function is typed \`void\` (it drops \`push()\`'s Promise). To observe the NavigationResult ('committed' | 'cancelled' | 'superseded'), or to \`replace()\` instead of push, call \`useRouter().push()\` / \`.replace()\` directly.
- Calling \`navigate()\` synchronously in the component body — that fires during render and infinite-loops. Defer it (event handler, \`onMount\`, \`effect\`); the \`pyreon/no-imperative-navigate-in-render\` lint rule catches this.
- Calling \`useNavigate()\` before a router exists (outside a \`<RouterProvider>\` with no module router set) — it throws \`[Pyreon] No router installed\`.`,
  },

  'router/useParams': {
    signature: 'useParams<T extends Record<string, string> = Record<string, string>>() => T',
    example: `const params = useParams<{ id: string }>()   // snapshot at setup

// for params that update on navigation, use the reactive route accessor:
const route = useRoute<'/user/:id'>()
// route().params.id re-reads on every navigation`,
    notes: `Returns a SNAPSHOT map of the current route's path params (\`{ id: '42' }\` for \`/user/:id\`). Values are always STRINGS at runtime — the generic \`T\` is caller-supplied typing only, it does NOT coerce. It reads \`router.currentRoute().params\` once at call time, so the snapshot is captured when the hook runs; to track param changes across navigation, read \`useRoute()().params\` in a reactive scope instead. See also: useRoute, useNavigate.`,
    mistakes: `- Treating the returned object as LIVE — it is a one-time snapshot from the component body. On a \`/user/1\` -> \`/user/2\` navigation (same component stays mounted), the captured object does NOT update. Read \`useRoute()().params\` in a reactive scope to track changes.
- Assuming param values are typed — at runtime they are always strings; \`useParams<{ id: number }>()\` types but does NOT coerce. Parse yourself (\`Number(params.id)\`).`,
  },

  'router/useValidatedSearch': {
    signature: 'useValidatedSearch<T extends Record<string, unknown> = Record<string, unknown>>() => () => T',
    example: `// route config: { path: '/search', validateSearch: (raw) => schema.parse(raw) }
const search = useValidatedSearch<{ q: string; page: number }>()
// read the accessor inside a reactive scope:
const page = () => search().page`,
    notes: `Returns a REACTIVE ACCESSOR \`() => T\` for the current route's VALIDATED search params. It takes NO argument — validation is configured on the ROUTE record via \`validateSearch(raw)\` (run during navigation; supports arbitrary validators like Zod / Valibot), and this hook surfaces its result off \`currentRoute().search\` (an empty \`{}\` when no \`validateSearch\` is set). Structural sharing (shallow-equal caching) means unrelated query-param changes do not re-trigger downstream reads. See also: useTypedSearchParams, useSearchParams.`,
    mistakes: `- Passing a schema to the hook — it takes NO argument. The schema goes on the route record's \`validateSearch\` config; \`useValidatedSearch()\` only READS the already-validated result.
- Confusing it with the other two search hooks: \`useTypedSearchParams(schema)\` takes a \`{ key: 'string' | 'number' | 'boolean' }\` shape, coerces primitives itself, and returns a \`[get, set]\` tuple; \`useSearchParams(defaults?)\` returns raw strings with no coercion. \`useValidatedSearch\` is READ-ONLY (no setter), argument-less, and defers to the route validator (arbitrary shapes).
- Reading the accessor once and caching the value — call \`search()\` inside a reactive scope so it re-reads on navigation.`,
  },

  'router/notFound / NotFoundBoundary': {
    signature: 'notFound(message?: string) => never · NotFoundBoundary(props: { fallback: ComponentFn | VNodeChild; children?: VNodeChild }) => VNodeChild',
    example: `async function loadUser(params: { id: string }) {
  const user = await fetchUser(params.id)
  if (!user) notFound()          // throws — code below is unreachable
  return user
}

const app = (
  <NotFoundBoundary fallback={() => <h1>404 — not found</h1>}>
    <RouterView />
  </NotFoundBoundary>
)`,
    notes: `The Next.js-style 404 pair. \`notFound()\` THROWS a branded Error (message defaults to 'Not Found') from inside a loader or component; \`isNotFoundError\` detects the brand (\`Symbol.for('pyreon.notFound')\`, realm-shared). \`NotFoundBoundary\` wraps the core \`ErrorBoundary\`: it renders \`children\` normally, and when a \`notFound()\` is thrown in its subtree it renders \`fallback\` (invoked as a component with \`{ error, reset }\` when its arity is <= 1, else returned as a plain VNodeChild). It RE-THROWS any non-notFound error so real errors still propagate to an outer error boundary. See also: redirect, RouterView.`,
    mistakes: `- Expecting code after \`notFound()\` to run — it THROWS (\`=> never\`) and never returns, so a guard-then-continue pattern does not work (everything after it is unreachable).
- Using \`NotFoundBoundary\` as a general error boundary — it ONLY handles \`notFound()\` throws; every other error is RE-THROWN to the nearest outer \`ErrorBoundary\`.
- Confusing \`notFound()\` with the route-record \`notFoundComponent\` / fs-router \`_404.tsx\` — those are the route-level no-match fallback; \`notFound()\` drives the \`NotFoundBoundary\` in the rendered subtree (a different mechanism).`,
  },

  'router/lazy': {
    signature: 'lazy(loader: () => Promise<ComponentFn | { default: ComponentFn }>, options?: { loading?: ComponentFn; error?: ComponentFn; hmrId?: string }) => LazyComponent',
    example: `const routes = [
  { path: '/reports', component: lazy(() => import('./Reports')) },
]`,
    notes: `Code-split a route component. Returns a LazyComponent DESCRIPTOR (a branded object, NOT a rendered component) to assign as a route \`component\`. The loader may resolve a bare component OR an ES-module \`{ default }\` namespace (so \`() => import('./Page')\` works). \`options.loading\` / \`options.error\` supply Suspense fallbacks; \`options.hmrId\` is the dev-only module id fs-router emits for hot-swap. The ROUTER caches resolved chunks in a bounded LRU (\`maxCacheSize\`, default 100); \`lazy()\` itself does not dedupe. See also: createRouter, RouterView.`,
    mistakes: `- Calling the result like a component (\`lazy(...)()\`) — it is an inert DESCRIPTOR; assign it to a route \`component\` and the router resolves it (into \`_componentCache\`) on navigation.
- Assuming \`lazy()\` dedupes concurrent imports — it does not; the router owns caching (bounded LRU, default 100; \`router.preload()\` warms it before SSR renderToString, which is required so a lazy route is not blank on the server).`,
  },

  'router/LoaderData': {
    signature: 'type LoaderData<L> = L extends (...args: never[]) => infer R ? Awaited<R> : never',
    example: `export const loader = async () => ({ posts: await fetchPosts() })

function PostsPage() {
  const data = useLoaderData<LoaderData<typeof loader>>()
  return <ul>{/* data.posts is fully typed */}</ul>
}`,
    notes: `Derive a route loader's RESOLVED data type from the loader function itself — pair with \`useLoaderData<LoaderData<typeof loader>>()\` so the component's data type follows the loader with no second annotation (and no drift when the loader changes). Unwraps async returns via \`Awaited\`; sync-returning loaders pass through. Type-only, zero runtime bytes. See also: useLoaderData, RouteLoaderFn, ExtractParams.`,
    mistakes: `- Annotating \`useLoaderData<{ posts: Post[] }>()\` by hand next to the loader — the drift this type removes; derive it from \`typeof loader\`
- \`LoaderData<ReturnType<typeof loader>>\` — pass the FUNCTION type (\`typeof loader\`), not its return type
- It types, it does not validate — the loader data crosses an SSR JSON boundary; Date/Map/class instances arrive as plain JSON on the client`,
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
    signature: 'renderWithHead(app: VNode): Promise<{ html: string; head: string; htmlAttrs: Record<string, string>; bodyAttrs: Record<string, string> }>',
    example: `import { renderWithHead } from '@pyreon/head/ssr'

const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />)
// htmlAttrs / bodyAttrs are Record<string, string> — serialize to attribute strings:
const attrs = (r: Record<string, string>) =>
  Object.entries(r).map(([k, v]) => \` \${k}="\${v}"\`).join('')
const doc = \`<!doctype html><html\${attrs(htmlAttrs)}><head>\${head}</head><body\${attrs(bodyAttrs)}>\${html}</body></html>\``,
    notes: 'SSR companion to `HeadProvider`, exported from the `@pyreon/head/ssr` subpath (kept out of the client entry). Renders the app to HTML via `renderToString` while collecting every `useHead()` call from the tree, then serializes the resolved tags into a single `head` string. `htmlAttrs` / `bodyAttrs` are returned as `Record<string, string>` objects (e.g. `{ lang: "en" }`) — serialize them into attribute strings yourself. Async components that call `useHead()` in their body work — the renderer awaits suspended subtrees before serialization. See also: useHead, HeadProvider.',
    mistakes: `- Importing \`renderWithHead\` from \`@pyreon/head\` — it lives in the \`@pyreon/head/ssr\` subpath so the base entry stays client-safe
- Awaiting \`renderWithHead\` and then NOT splicing \`head\` into the \`<head>\` element — every \`useHead()\` call quietly disappears
- Interpolating \`htmlAttrs\` / \`bodyAttrs\` directly (\`<html\${htmlAttrs}>\`) — they are \`Record<string, string>\` objects, not strings; interpolating them renders \`[object Object]\`. Serialize the entries first`,
  },

  'head/createHeadContext': {
    signature: '() => HeadContextValue',
    example: `import { createHeadContext, HeadContext } from '@pyreon/head'

const ctx = createHeadContext()
provide(HeadContext, ctx)
// ... render tree that calls useHead() ...
const tags = ctx.resolve()                 // HeadTag[]
const htmlAttrs = ctx.resolveHtmlAttrs()   // Record<string, string>
const bodyAttrs = ctx.resolveBodyAttrs()   // Record<string, string>`,
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
    mistakes: `- \`render\` is an EXACT alias for \`mount\` (same function reference) — its foot-guns are \`mount\`'s (null container throws; props are reactive-vs-static per the compiler; call the returned function to unmount + dispose effects). Do NOT expect any \`render\`-specific behavior`,
  },

  'runtime-dom/hydrateRoot': {
    signature: 'hydrateRoot(container: Element, root: VNodeChild): () => void',
    example: `import { hydrateRoot } from "@pyreon/runtime-dom"

// Hydrate SSR-rendered HTML — container FIRST, then the app:
hydrateRoot(document.getElementById("app")!, <App />)`,
    notes: 'Hydrate server-rendered HTML. Walks the existing DOM and attaches reactive bindings without recreating elements. Expects the DOM to match the VNode tree structure — mismatches emit dev-mode warnings. Returns an unmount function. NOTE the argument order is `(container, root)` — the CONTAINER comes first, which is the REVERSE of `mount(root, container)`. See also: mount, @pyreon/runtime-server.',
    mistakes: '- Passing arguments in `mount` order — `hydrateRoot(container, root)` takes the container FIRST (opposite of `mount(root, container)`)',
  },

  'runtime-dom/Transition': {
    signature: '<Transition name={name} show={() => boolean} appear={boolean} onAfterEnter={fn} onAfterLeave={fn}>{children}</Transition>',
    example: `const visible = signal(true)

<Transition name="fade" show={() => visible()}>
  <div>Content</div>
</Transition>

/* CSS:
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
*/`,
    notes: 'CSS-based enter/leave animation wrapper. Visibility is driven by the REQUIRED `show: () => boolean` accessor — the child animates in when it flips true and out when it flips false (do NOT wrap the child in a `<Show>`; `show` is the toggle). Applies `{name}-enter-from`/`-enter-active`/`-enter-to` classes on enter and the corresponding `-leave-*` classes on leave. `appear` runs the enter transition on initial mount. Has a 5-second safety timeout — if `transitionend`/`animationend` never fires, the transition completes automatically. `onAfterEnter`/`onAfterLeave` fire when each phase settles. See also: TransitionGroup, @pyreon/kinetic.',
    mistakes: `- Omitting \`show\` — it is REQUIRED (\`() => boolean\`); Transition drives visibility itself, so a plain child with no \`show\` will not animate
- Wrapping the child in a \`<Show>\` — \`show\` already toggles visibility; a nested \`<Show>\` double-gates it
- Missing CSS classes — \`<Transition name="fade">\` does nothing without \`.fade-enter-active\` / \`.fade-leave-active\` CSS
- Passing a \`mode\` prop — Transition has no \`mode\`; for sequenced list moves use TransitionGroup`,
  },

  'runtime-dom/TransitionGroup': {
    signature: '<TransitionGroup items={() => T[]} keyFn={(item, i) => key} render={(item, i) => VNode} name={name} tag={tag} />',
    example: `const items = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }])

<TransitionGroup
  name="list"
  tag="ul"
  items={() => items()}
  keyFn={(item) => item.id}
  render={(item) => <li>{item.name}</li>}
/>

/* CSS:
.list-enter-active, .list-leave-active { transition: all 0.3s }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(10px) }
.list-move { transition: transform 0.3s }
*/`,
    notes: 'Animate list item additions and removals with CSS transitions. Unlike `<Transition>`, it does NOT take `<For>` children — it drives the list itself via three required props: `items` (a reactive accessor), `keyFn` (a stable key extractor), and `render` (returns ONE DOM-element VNode per item, whose `type` must be a string tag like `"li"` so a ref can be injected). Each item gets enter/leave classes on mount/unmount; `-move` classes FLIP-animate reordering. `tag` sets the wrapper element (default `"div"`). See also: Transition, For.',
    mistakes: `- Passing a \`<For>\` as children — TransitionGroup owns iteration via \`items\`/\`keyFn\`/\`render\`, it is not a \`<For>\` wrapper
- A \`render\` that returns a component or fragment — it must return a single DOM-element VNode (string \`type\`) so the group can inject a ref`,
  },

  'runtime-dom/KeepAlive': {
    signature: '<KeepAlive active={() => boolean}>{children}</KeepAlive>',
    example: `// One KeepAlive per route — each keeps its own subtree mounted + hidden.
<KeepAlive active={() => route() === "/a"}><RouteA /></KeepAlive>
<KeepAlive active={() => route() === "/b"}><RouteB /></KeepAlive>`,
    notes: 'Mount children ONCE and keep them alive when hidden — when `active()` returns false the children are CSS-hidden (`display: none`) but stay mounted, so their signals, effects, scroll position, and form inputs are PRESERVED. This is the opposite of conditional rendering (`<Show>`/ternary), which destroys and recreates component state on every toggle. `active` defaults to `true` (always visible). Use one KeepAlive per slot you want cached (e.g. one per route or tab). See also: Transition, Show.',
    mistakes: `- \`active\` MUST be a thunk — write \`active={() => cond()}\`, not \`active={cond}\`; the runtime calls \`props.active?.()\`, so any non-function value (a boolean, or a bare signal the compiler auto-calls to a value) THROWS \`TypeError: props.active is not a function\` at mount — there is no \`<Show when>\`-style value-form normalization; only omitting \`active\` entirely defaults to visible
- KeepAlive CSS-HIDES when inactive, it does NOT unmount — the hidden component's effects, timers, subscriptions, and signals keep RUNNING (memory + side-effect cost); use it ONLY for expensive-to-recreate state, not as a default wrapper
- It is the OPPOSITE of \`<Show>\`/ternary — those DESTROY + recreate state on toggle; reach for KeepAlive precisely when you need state PRESERVED across hide/show (form drafts, scroll, heavy trees)
- Each KeepAlive slot keeps its OWN children mounted — wrapping N routes in N KeepAlives keeps ALL N subtrees mounted + their effects live simultaneously, not just the active one
- There is NO \`include\`/\`exclude\`/\`max\`/name-based cache or LRU eviction (that is Vue's KeepAlive) — visibility is driven solely by the \`active\` accessor`,
  },

  'runtime-dom/_tpl': {
    signature: '_tpl(html: string, bind: (root: Element) => (() => void) | undefined): NativeItem',
    example: `// Compiler output for <div class="box">{text()}</div>:
_tpl("<div class=\\"box\\"> </div>", (__root) => {
  const __t0 = __root.firstChild as Text
  const __d0 = _bindText(text, __t0)
  return () => { __d0() }
})`,
    notes: 'Compiler-internal: instantiate a cached template and run its bindings. The html string is parsed into a `<template>` ONCE per distinct string (module-level cache); every call `cloneNode(true)`s the content and invokes `bind(root)` — which wires reactive bindings and returns the cleanup. Returns a `NativeItem` (`{ __isNative, el, cleanup }`) that `mountChild`/`hydrateRoot` consume directly. Sole-dynamic-text children arrive with a BAKED `" "` placeholder text node in the html (grabbed via `.firstChild` — no createTextNode/appendChild per instantiation). Not intended for direct use — the JSX compiler emits `_tpl()` calls automatically. See also: _bindText, _bindDirect.',
    mistakes: `- COMPILER-EMITTED — never hand-write \`_tpl()\`; the html string + the bind walks (\`.firstChild\`/\`.nextSibling\` captures) are generated to match the JSX exactly, and a hand-written mismatch corrupts the ref walks
- The html is parsed + cached per DISTINCT string (module-level) then \`cloneNode(true)\`d — a dynamically-built html string defeats the cache (a \`<template>\` parse per unique string)
- Bindings run against the CLONE after ALL node references are captured (the two-phase ref-hoist) — this is what keeps a dynamic slot before static siblings from corrupting their walks; the capture-before-mutate ordering is load-bearing, not cosmetic`,
  },

  'runtime-dom/_bindText': {
    signature: '_bindText(source: Signal-like, node: Text, caller?: () => unknown): () => void',
    example: `// Compiler output for <div>{count()}</div>:
_tpl("<div> </div>", (__root) => {
  const __t0 = __root.firstChild as Text
  const __d0 = _bindText(count, __t0) // the SIGNAL, not a thunk
  return () => { __d0() }
})`,
    notes: `Compiler-internal: bind a SIGNAL (anything carrying \`._v\` + \`.direct\`) to a text node via \`TextNode.data\` assignment, returning a dispose function. The fast path BYPASSES the effect system entirely — it subscribes via the signal's \`.direct()\` single-subscriber slot (no Set, no deps array, no tracking-stack push); \`renderEffect\` is only the fallback for bare callables. Writes the initial value synchronously at bind time (which is why the baked \`" "\` template placeholder never renders). Each text node gets its own independent binding for fine-grained reactivity. See also: _tpl, _bindDirect.`,
    mistakes: `- COMPILER-EMITTED — don't hand-write \`_bindText\`; write JSX \`{signal()}\` or \`{row.label()}\` and let the compiler emit it (bare identifiers AND non-computed member chains qualify; computed access like \`row[k]()\` stays on the general path)
- The \`source\` MUST expose \`._v\` (read DIRECTLY for the initial value, not via a call) — a custom signal-wrapper that forwards \`.direct\`/\`.peek\` but NOT \`_v\` binds \`''\` and never updates (the \`storage-signal-v-forwarding\` bug class); build wrappers with \`wrapSignal(base, { set })\`, which forwards \`_v\` by construction
- Hand-writing a member-chain bind without the \`caller\` arg loses \`this\` — for \`{row.label()}\` the compiler emits \`_bindText(row.label, node, () => row.label())\`; the 3rd arg is what preserves \`this\` on the slow path (a detached \`obj.method\` alone would lose it)
- A signal whose VALUE later becomes a VNode / VNode[] UPGRADES the binding to a subtree mount at the text node's position (the polymorphic upgrade); plain string/number values stay on the \`.data\` fast path`,
  },

  'runtime-dom/sanitizeHtml': {
    signature: 'sanitizeHtml(html: string): string',
    example: `import { setSanitizer, sanitizeHtml } from "@pyreon/runtime-dom"
setSanitizer(DOMPurify.sanitize)
const clean = sanitizeHtml(userInput)`,
    notes: `Sanitize an HTML string. If a custom sanitizer was registered via \`setSanitizer()\` (e.g. DOMPurify) it is used; OTHERWISE a built-in DOMParser-based tag-allowlist runs (strips unsafe elements + attributes) — it is NOT an identity passthrough, and it never uses the browser Sanitizer API (that lives only in the runtime's \`innerHTML\` PROP sink, which prefers native \`el.setHTML()\` on Chrome 105+ and falls back to \`sanitizeHtml\`). DOM-only: the runtime invokes it only on the client \`innerHTML\` prop path — \`dangerouslySetInnerHTML\` is intentionally RAW (never sanitized; React parity), and SSR never calls it. See also: setSanitizer.`,
    mistakes: `- Assuming \`dangerouslySetInnerHTML\` is sanitized — it is NOT: the runtime assigns \`__html\` RAW (React parity — the developer owns sanitization), and no \`setSanitizer\` policy applies to it; sanitize untrusted HTML yourself, e.g. \`dangerouslySetInnerHTML={{ __html: sanitizeHtml(userHtml) }}\`
- WITHOUT \`setSanitizer\` it is NOT a passthrough — a built-in tag-allowlist sanitizer strips unsafe elements/attributes; but that allowlist is CONSERVATIVE, so legitimate-but-uncommon markup may be stripped — register a policy via \`setSanitizer(DOMPurify.sanitize)\` if you need specific tags
- \`setSanitizer(fn)\` is GLOBAL but does NOT cover every \`innerHTML\` sink — on browsers with the native Sanitizer API the \`innerHTML\` PROP path prefers \`el.setHTML()\` (bypassing your custom policy); only direct \`sanitizeHtml()\` calls and the no-\`setHTML\` fallback use it, and \`dangerouslySetInnerHTML\` never does
- It is DOM-only (uses DOMParser) — never call it during SSR; the runtime only invokes it on the client innerHTML prop path
- \`setSanitizer(null)\` RESTORES the built-in allowlist fallback — it does NOT disable sanitization`,
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
    notes: `Define a composition-style store. The setup function runs once per store ID — inside a store-OWNED effect scope, so \`computed()\`/\`effect()\` created in setup belong to the STORE (disposed by \`dispose()\`), never to the component whose mount happened to create the store first (a component unmount cannot freeze a singleton's computeds). Setup returns an object whose signals become tracked state and whose functions become interceptable actions. Returns a hook function that produces a StoreApi with \`.store\` (user state/actions), \`.patch()\`, \`.subscribe()\`, \`.onAction()\`, \`.reset()\`, and \`.dispose()\`. Stores are singletons — calling the hook twice with the same ID returns the same instance; redefining an ID from a DIFFERENT setup function dev-warns once (the existing instance wins). See also: StoreApi, addStorePlugin, resetStore, defineStore (schema mode).`,
    mistakes: `- Calling \`useCounter()\` expecting a new instance — stores are singletons by ID. The setup runs once; the registry returns the same \`StoreApi\` for every later call with that ID until \`resetStore(id)\` / \`resetAllStores()\`
- Reading \`store.count\` without calling it — signals are functions; use \`store.count()\` to read
- Calling \`store.count.set()\` for multi-field updates instead of \`patch()\` — separate \`.set()\` calls each notify subscribers; \`patch()\` batches them into ONE \`type: "patch"\` mutation
- Forgetting \`dispose()\` / \`resetAllStores()\` in tests — the store persists in the global registry across test cases, leaking state into the next test. Put \`afterEach(() => resetAllStores())\` in setup
- Returning a non-signal, non-function value from \`setup\` (a plain object/array) and expecting it to be reactive — only signals become tracked state. Classification is duck-typed: signals = \`.set\` + \`.peek\`, computeds = \`.dispose\` (and not a signal), everything-else-callable = action. A plain object is none of these and is passed through inert
- Mutating state by reassigning \`store.count\` — it is a frozen accessor; write via \`store.increment()\` (an action) or \`patch({ count })\`. Direct property assignment is silently ineffective
- Registering an \`addStorePlugin\` AFTER the store was first created and expecting it to apply — plugins run only at creation time. The already-created store never sees it (see \`addStorePlugin\` mistakes)
- Defining the same id twice with different setups (or editing a store module under HMR) and expecting the new setup to apply — the registry returns the FIRST instance; the second definition dev-warns once per id and is otherwise inert until \`resetStore(id)\` or a full reload
- Expecting persisted state to need a middleware — return \`useStorage()\` (from \`@pyreon/storage\`) signals from setup instead; a StorageSignal IS a signal, so it classifies as state and \`patch\`/\`reset\`/\`subscribe\`/\`dehydrateStores\` all flow through it (cross-tab sync included)`,
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
    signature: 'interface SchemaStoreApi<TRaw, TStore = SignalsOf<TRaw>> extends Omit<StoreApi<TStore>, "state" | "patch"> { readonly state: TRaw; set(next: TRaw): void; patch(partial: Partial<TRaw>): void; deepPatch(partial: DeepPartial<TRaw>): void; update<K extends keyof TRaw>(key: K, fn: (current: TRaw[K]) => TRaw[K]): void }',
    example: `const u = useUser()  // SchemaStoreApi<{ name: Signal<string>; prefs: Signal<{theme: string}> }>
u.set({ name: 'Alice', prefs: { theme: 'dark' } })   // full replace, validated
u.patch({ name: 'Bob' })                              // shallow per-field replace, validated
u.deepPatch({ prefs: { theme: 'dark' } })             // deep-merge nested objects, validated
u.update('items', items => items.filter(x => x.id !== 1))  // transform single field, validated`,
    notes: 'Return type of the schema-driven `defineStore` overload — STRICTLY TYPED from the schema. Two type params: `TRaw` = the schema-inferred field VALUES (`InferSchema<S>`), and `TStore` = the `.store` shape (per-field `Signal`s + setup-returned actions/computeds). Extends `StoreApi<TStore>` with four validated mutation methods, every one checked against the real field types at compile time (no manual annotations, no casts): `set(next: TRaw)` REPLACES the whole state atomically; `patch(partial: Partial<TRaw>)` SHALLOW-merges top-level fields; `deepPatch(partial: DeepPartial<TRaw>)` recursively merges nested plain objects while REPLACING arrays / class instances / primitives; `update(key, current => next)` transforms a single field via callback whose value is typed `TRaw[K]` (covers add / remove / map / filter / object-key-delete in one method). `state` is the typed field-value snapshot `TRaw`. All four validate the merged result against the schema and throw on failure (or invoke `onValidationError` if configured). Escape hatches (unvalidated by design): the FUNCTIONAL `patch(fn)` form and direct signal writes (`store.field.set(v)`). See also: defineStore (schema mode), DeepPartial, StoreApi.',
    mistakes: `- Passing the wrong shape to \`set\` — it requires the FULL state matching the schema. Use \`patch\` / \`deepPatch\` for partial updates
- Expecting \`set\` to silently merge — it REPLACES. Use \`patch\` (shallow) or \`deepPatch\` (recursive) to merge with current state
- Using \`patch({ prefs: { theme: "dark" } })\` expecting other \`prefs\` keys to survive — \`patch\` is SHALLOW, the whole \`prefs\` object is replaced. Use \`deepPatch\` for nested-object merging
- \`deepPatch\` REPLACES arrays / class instances / Dates — it only recurses into PLAIN objects. To merge an array, use \`update\` with a callback
- Using \`update\` for multi-field changes — it transforms ONE top-level field at a time. For multi-field updates, use \`patch\` / \`deepPatch\` / \`set\`
- Calling \`update\` on a setup-returned action/computed key — \`update\`'s key is constrained to the schema FIELD names only (typos and non-field keys fail typecheck). Actions/computeds are not writable state
- Expecting the FUNCTIONAL \`patch(fn)\` form to validate — only the OBJECT form (\`patch({ … })\`) runs through the schema. The \`patch(state => …)\` callback is a raw-signal escape hatch, unvalidated by design (same as direct \`store.field.set(v)\`)`,
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
    notes: 'The object the `defineStore` hook returns. `store` is the user state + actions; `id` the registry key; `state` a plain-value snapshot getter (signals read via `.peek()`, no tracking — safe to log / serialize). `patch` batch-updates signals; `subscribe` fires per mutation with `{ storeId, type: "direct" | "patch", events }` (per-key `{ key, oldValue, newValue }` events); `onAction` intercepts wrapped actions (`ctx.name`, `ctx.args`, `ctx.after(fn)`, `ctx.onError(fn)`); `reset` restores each signal to its setup-time `.peek()` value; `dispose` is the full teardown — runs plugin cleanups, unsubscribes all listeners, stops the store-owned effect scope (disposing every computed/effect created in setup or plugin bodies), and removes the store from the registry. See also: defineStore, addStorePlugin.',
    mistakes: `- \`patch({ typoKey: 1 })\` drops the key — it WARNS in dev (\`[Pyreon] patch(...): key "typoKey" is not a signal field\`) and is silent in production. Object-form patch only writes keys that are signal fields; computeds/actions are not patchable
- Worrying about \`__proto__\` keys in patch payloads — membership is checked against the store's signal-field Set FIRST, so unknown keys (including \`__proto__\`-shaped keys from parsed JSON) never touch anything; a LEGITIMATE signal field named \`constructor\`/\`prototype\` IS patchable
- Expecting \`dispose()\` to leave setup-created effects running — dispose stops the store-owned scope: every \`computed\`/\`effect\` from setup (and plugin bodies) is disposed with the store. An orphaned \`StoreApi\` reference still reads signals but its computeds are frozen
- Expecting \`reset()\` to restore the "last good" or current-default value — it restores the value captured by \`.peek()\` when \`setup\` first ran. A signal whose initial value was itself derived at setup resets to THAT, not to a fresh recomputation
- Reading \`.state\` and expecting it to be reactive — it is a one-shot plain snapshot via \`.peek()\` (no tracking). Reading it inside an \`effect\`/\`computed\` will NOT re-run on change; read \`store.x()\` for reactive access
- Keeping a destructured \`store\`/\`patch\` reference after \`resetStore(id)\` — the old \`StoreApi\` keeps working but is detached from the registry; the next hook call creates a NEW instance and your stale reference points at the orphan
- Returning the \`subscribe\` / \`onAction\` disposer and never calling it — listeners live until disposed (or the store is disposed); in long-lived stores this leaks`,
  },

  'store/addStorePlugin': {
    signature: '(plugin: StorePlugin) => void  // StorePlugin: (api) => void | (() => void)',
    example: `// Register BEFORE any store hook is first called.
addStorePlugin((api) => {
  api.subscribe((mutation) => {
    console.log(\`[\${api.id}] \${mutation.type}:\`, mutation.events)
  })
})`,
    notes: `Register a global store plugin. The plugin runs ONCE per store, at first creation of that store, receiving its full \`StoreApi\` — for logging, persistence, devtools, etc. Runs for every store created AFTER registration. A plugin may RETURN a cleanup function — it runs on that store's \`dispose()\` (for external resources: timers, sockets, sync loops); \`effect()\`/\`computed()\` created in the plugin body need no cleanup because plugins run inside the store's effect scope (auto-disposed). Plugin throws are caught and (dev-only) \`console.warn\`ed so one bad plugin cannot break store creation — but in production a throwing plugin fails completely silently. The plugin chain is uncached: cost is O(stores × plugins) across all fresh store creations. See also: defineStore, StoreApi.`,
    mistakes: `- Registering AFTER a store was already created — plugins run only at creation. Stores already in the registry never receive the plugin. Register at module init before the first hook call, or \`resetStore(id)\` to force re-creation through the plugin chain
- Relying on a plugin throw surfacing in production — errors are swallowed with only a dev-mode \`console.warn\`. A plugin that throws in prod silently does nothing; make the plugin itself defensive
- Calling \`api.subscribe\` / \`api.onAction\` in a plugin without ever disposing — those listeners live for the whole store lifetime; in tests they accumulate across cases unless \`resetAllStores()\` runs in cleanup
- Tearing down plugin-created \`effect\`s manually in the returned cleanup — unnecessary: plugin bodies run inside the store's effect scope, so reactive primitives are auto-disposed on \`dispose()\`. The returned cleanup is for EXTERNAL resources (timers, sockets, subscriptions to other systems)
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

  'store/dehydrateStores': {
    signature: '(filter?: (id: string) => boolean) => Record<string, Record<string, unknown>>',
    example: `// server, after render:
const stores = dehydrateStores(id => !id.startsWith('server:'))
html = html.replace('</head>',
  \`<script>window.__PYREON_STORE_STATE__=\${JSON.stringify(stores)}</script></head>\`)`,
    notes: `SERVER side of the SSR store-hydration handshake (the \`@pyreon/store\` analogue of TanStack Query \`dehydrate\`). Call after \`renderToString\` completes — it walks the active per-request registry and snapshots each store's signal-backed \`.state\` into a plain, JSON-serializable object keyed by store id. Actions and computeds are excluded (they are not in \`.state\`). Pass a \`filter\` predicate to scope which stores ship to the client (e.g. exclude server-only / sensitive stores). The framework serializes the result into the HTML; \`hydrateStores\` reads it back on the client. This is what makes cross-island shared state production-complete: a store shared by multiple islands hydrates ONCE with server state instead of per-island. See also: hydrateStores, setStoreRegistryProvider.`,
    mistakes: `- Storing non-JSON-serializable values (Date / Map / Set / class instances) in a dehydrated store — the framework \`JSON.stringify\`s the snapshot, so those silently degrade. Keep dehydrated state plain, or revive on read
- Calling it BEFORE render completes — it snapshots current signal values; run it after \`renderToString\` so loaders/server mutations are reflected
- Forgetting the \`filter\` for sensitive stores — by default EVERY active store is dehydrated and shipped to the client. Exclude server-only state with the predicate`,
  },

  'store/hydrateStores': {
    signature: '(data: Record<string, Record<string, unknown>>) => void',
    example: `// client entry, before mount:
hydrateStores(window.__PYREON_STORE_STATE__ ?? {})`,
    notes: `CLIENT side of the SSR store-hydration handshake. Call once at boot BEFORE the app mounts — it seeds stores from the server snapshot so components/islands read the hydrated values immediately (no flash of default state). Stores that already exist are patched in place; stores not yet created (the common lazy-island case) are seeded on their first use. Each store seeds exactly once (a boot-time one-shot) — a later \`resetStore\` + re-create falls back to the store's own \`setup()\` initial values, not stale boot state. Unknown keys in the snapshot are ignored (patch writes only the store's declared signal keys). See also: dehydrateStores, setStoreRegistryProvider.`,
    mistakes: `- Calling it AFTER mount — components already read default state; hydrate before \`mount\`/\`hydrateRoot\` so the first render sees server values
- Expecting it to create stores eagerly — it seeds lazily: a store only hydrates when first used. The snapshot is stashed until then
- Trusting the snapshot blob as validated input for a schema store — hydration patches the inner per-field store directly, bypassing schema validation (the value was validated server-side when set). Treat the embedded JSON as the same trust boundary as loader data`,
  },

  'store/StoreState': {
    signature: 'type StoreState<Api> // SchemaStoreApi<TRaw, TStore> → TRaw; StoreApi<T> → unwrapped signal fields of T',
    example: `const useCart = defineStore('cart', () => {
  const items = signal<string[]>([])
  const count = computed(() => items().length)
  const add = (item: string) => items.update((xs) => [...xs, item])
  return { items, count, add }
})
type CartState = StoreState<ReturnType<typeof useCart>>
// → { items: string[] }  (count/add excluded — not snapshot state)`,
    notes: `Derive the UNWRAPPED per-field value shape of a store from its api object — the inverse of \`SignalsOf\`. For a schema store it's the schema-inferred raw values (\`TRaw\`); for a composition store it's the signal fields of the setup return, each unwrapped to its value type. Computeds and actions are EXCLUDED, mirroring the runtime \`api.state\` snapshot (a computed has no \`.set\`, an action is a plain function). Type-only, zero runtime bytes. See also: StoreActions, SignalsOf, defineStore.`,
    mistakes: `- Passing the setup-return type instead of the API — the input is \`ReturnType<typeof useStore>\` (the \`StoreApi\`), not the object your setup function returns
- Expecting computeds in the state shape — they are derived, not snapshot state; the runtime \`api.state\` excludes them too (no \`.set\` → not signal-like)
- \`StoreState<typeof useCart>\` — that's the HOOK type; call-site is \`StoreState<ReturnType<typeof useCart>>\`
- Re-declaring the state interface by hand next to the store — the drift this type exists to remove; derive it`,
  },

  'store/StoreActions': {
    signature: 'type StoreActions<Api> // plain function fields of the store shape (signals + computeds excluded)',
    example: `type CartActions = StoreActions<ReturnType<typeof useCart>>
// → { add: (item: string) => void }
function callAction<K extends keyof CartActions>(name: K, ...args: Parameters<CartActions[K]>) { /* … */ }`,
    notes: 'Derive the ACTIONS surface of a store from its api object — the plain function fields of the setup return (schema stores: of `TStore`, so auto-generated field signals drop out). Signals and computeds are excluded even though both are callable. Useful for typing an action-dispatching wrapper or a test double without re-annotating. Type-only, zero runtime bytes. See also: StoreState, defineStore.',
    mistakes: `- Expecting signals/computeds to appear — they are callable but deliberately excluded (they are state/derivation, not actions)
- Using it to type \`patch()\` payloads — that is \`Partial<StoreState<Api>>\`, not the actions record`,
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
    notes: `Define a reactive model via a chainable builder. Two modes (mutually exclusive): **plain mode** \`model({ state })\` declares signal-backed fields with their initial values; **schema mode** \`model({ schema, initial? })\` validates state via a schema and STRICTLY TYPES the instance from it. The schema can be passed DIRECTLY — \`@pyreon/validate\`'s \`s.object(...)\`, a raw \`z.object(...)\`, valibot, arktype, or any [Standard Schema](https://standardschema.dev)-compliant validator — and the field types flow through end-to-end (\`self.name()\` is \`string\`, not \`unknown\`), no adapter wrapper required. The \`@pyreon/validation\` \`zodSchema\` / \`valibotSchema\` / \`arktypeSchema\` adapters still work (the \`_infer\` path) and are only needed for async-validator interop. Chain \`.views(f)\` for derived values and \`.actions(f)\` for mutators; both are CHAINABLE — every subsequent layer sees prior views + actions via \`self\`. Schema mode adds \`set\` / \`patch\` / \`deepPatch\` / \`update\` / \`reset\` helpers (bare names) on \`self\` and on the instance, each validated through the schema. Actions can be \`async\`; \`await u.fetchPosts()\` works end-to-end and middleware sees completion via \`await next(call)\`. Returns a \`ModelDefinition\` — call \`.create(initial?)\` for an independent instance or \`.asHook(id)\` for a singleton. See also: ModelDefinition, SchemaModelHelpers, getSnapshot, applySnapshot, onPatch, addMiddleware.`,
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
    notes: `The five schema-validated mutation helpers exposed on every schema-mode model instance AND on \`self\` inside schema-mode action/view factories. They are BARE names (\`set\`, \`patch\`, \`deepPatch\`, \`update\`, \`reset\`) — a schema field that collides with one of them throws at \`.create()\` time (the reserved-name guard names the offending field), so pick a different field name rather than relying on a prefix. All five validate the merged result through the schema before writing to signals (or invoke \`onValidationError\` if configured). Direct signal writes (\`self.field.set(v)\`) bypass validation — the documented escape hatch. Parallel to \`@pyreon/store\`'s \`SchemaStoreApi\`. See also: model, DeepPartial.`,
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
    signature: 'class ModelDefinition<TState, TViews, TActions, HasSchema, TVolatile> { views(f), actions(f), volatile(f), lifecycle(f), create(initial?), asHook(id) }',
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
    notes: 'Recursively serialize a model instance into a plain JSON-safe snapshot. Reads all signal values via `.peek()` (a one-time read — NOT a reactive computed; it does not subscribe). Nested field-models AND arrays / plain-objects that HOLD model instances (`todos: Todo[]`, `byId: { [k]: Model }`) are recursively serialized; a `reference` field serializes as its stored ID, not the target node. See also: applySnapshot, model.',
    mistakes: `- Expecting \`getSnapshot\` to be reactive — it reads via \`.peek()\`, so it is a one-time snapshot, not a \`computed\`. Call it again (e.g. inside \`onSnapshot\`) to get the next value.
- Expecting a \`reference\` field to serialize the target node — it serializes as the stored ID (owned instances in arrays/objects DO deep-serialize; a reference is an id by design).`,
  },

  'state-tree/applySnapshot': {
    signature: '(instance: ModelInstance, snapshot: Partial<Snapshot>) => void',
    example: `applySnapshot(counter, { count: 0 })      // reset one field
applySnapshot(app, { title: 'New' })      // merge — profile is left unchanged`,
    notes: `Apply a (possibly PARTIAL) snapshot to a model instance — updates only the keys PRESENT in the snapshot, leaving absent keys unchanged (a merge, not a clear). Nested field-models, arrays-of-instances (\`todos: Todo[]\`), and object-of-instances (\`byId: { [k]: Model }\`) reconcile IN PLACE: existing instances are updated from the matching elements, never replaced by plain snapshot objects, and array length changes beyond the current↔snapshot overlap are NOT reconciled (use the array's own mutation methods to add/remove). Schema mode routes through the validated \`patch\` helper, so an invalid snapshot is REJECTED. Emits \`replace\` patches. See also: getSnapshot, model.`,
    mistakes: `- Expecting a partial snapshot to CLEAR unmentioned fields — it merges: keys absent from the snapshot keep their current value. Pass a full snapshot to replace everything.
- Expecting a longer array snapshot to grow the list — arrays-of-instances reconcile only up to the overlap (\`min(current, snapshot)\`); extra snapshot elements are NOT added (there is no element type to recreate them). Use the array's own add/remove action, then apply.
- Applying an invalid snapshot in schema mode expecting a silent write — it routes through the validated \`patch\` and THROWS on a schema violation (the schema is the source of truth).`,
  },

  'state-tree/onPatch': {
    signature: '(instance: ModelInstance, listener: PatchListener) => () => void',
    example: `const dispose = onPatch(counter, (patch) => {
  console.log(patch) // { op: 'replace', path: '/count', value: 11 }
})`,
    notes: 'Subscribe to JSON patches emitted by state mutations on a model instance. Each patch is a `replace` op carrying the JSON-pointer path (`/count`, `/profile/name` for nested) and the new value — Pyreon state is one signal per field, so a field holding an array/object emits a whole-value `replace`, not granular add/remove ops. Returns an unsubscribe function. Pairs with `applyPatch` for undo/redo and state synchronization. See also: applyPatch, model.',
  },

  'state-tree/applyPatch': {
    signature: '(instance: ModelInstance, patch: Patch | Patch[]) => void',
    example: `applyPatch(counter, { op: 'replace', path: '/count', value: 0 })`,
    notes: 'Apply one or more JSON patches to a model instance. Accepts a single patch or an array for batch replay. REPLACE-ONLY: every patch must be `{ op: "replace" }` — any other op (`add`/`remove`/`move`/…) THROWS `unsupported op`. This mirrors what `onPatch` emits (Pyreon is one signal per field, so a field holding an array/object emits a whole-value `replace`, never granular add/remove), so an `onPatch`→`applyPatch` undo/redo round-trip is closed; a hand-authored standard JSON-Patch with add/remove is not. See also: onPatch, model.',
    mistakes: `- Passing an \`add\` / \`remove\` / \`move\` patch (e.g. imported from a standard JSON-Patch diff) — \`applyPatch\` throws \`unsupported op "<op>"\`; it accepts ONLY \`replace\`. Feed it the \`replace\` ops \`onPatch\` emits, or convert your diff to whole-value replaces.
- Expecting a granular array patch (\`/todos/0\`, add-at-index) — Pyreon emits a whole-value \`replace\` of the field (\`/todos\`); apply the whole array value, not an element op.`,
  },

  'state-tree/addMiddleware': {
    signature: '(instance: ModelInstance, middleware: MiddlewareFn) => () => void',
    example: `addMiddleware(counter, (call, next) => {
  console.log(\`\${call.name}(\${call.args.join(', ')})\`)
  return next(call)
})`,
    notes: 'Add an action interception middleware to a model instance. The middleware receives the action call context and a `next` function — call `next(call)` to proceed or return early to block the action. Returns an unsubscribe function. See also: model.',
  },

  'state-tree/destroy': {
    signature: '(instance: ModelInstance) => void',
    example: `const clock = Clock.create()  // .lifecycle(() => ({ afterCreate: start, beforeDestroy: stop }))
destroy(clock)   // runs stop(), tears down subscriptions, marks dead
isAlive(clock)   // false`,
    notes: 'Tear down a model instance: run its `beforeDestroy` handlers (from `.lifecycle()`), recursively destroy field-nested child models, drop all subscriptions (patch listeners + middleware), and mark it dead (`isAlive` → false). Idempotent. NOTE: this tears down SUBSCRIPTIONS + runs cleanup — it does NOT free memory. Pyreon signals have no per-signal dispose; the instance is reclaimed by GC once you drop your references. After `destroy`, actions + schema mutation helpers dev-warn and no-op; direct signal writes (`self.field.set`) stay unguarded. See also: isAlive, model, clone.',
    mistakes: `- Expecting \`destroy\` to free memory immediately — it clears subscriptions + runs \`beforeDestroy\`; GC reclaims the signals once you drop your references
- Writing state via \`self.field.set(v)\` after destroy — direct signal writes are NOT guarded (only actions + schema helpers warn). Stop mutating a destroyed instance
- Calling actions on a destroyed instance — they no-op + dev-warn; this usually means a stale event handler outlived the instance`,
  },

  'state-tree/isAlive': {
    signature: '(instance: ModelInstance) => boolean',
    example: `const counter = model({ state: { count: 0 } })
  .actions((self) => ({ inc: () => self.count.update((n) => n + 1) }))
  .create()

// Guard deferred work (a queued callback, a fetch resolution) that
// might land after the instance was torn down:
if (isAlive(counter)) counter.inc()`,
    notes: 'Returns `true` while the instance is live, `false` after `destroy(instance)` (and `false` for a non-model-instance). Use to guard deferred work (a queued callback, a fetch resolution) that might land after the instance was torn down. See also: destroy, model.',
  },

  'state-tree/clone': {
    signature: '<T>(instance: T) => T',
    example: `const draft = clone(original)   // independent copy of original's current state
draft.title.set('edited')        // does not touch original`,
    notes: 'Structurally clone a model instance: snapshot its current state, then create a fresh, fully-independent instance from the SAME definition. The clone has its own signals, listeners, middleware, and lifecycle — mutating one never affects the other. In schema mode the snapshot is re-validated by `.create()`. Throws if the instance carries no definition back-reference (i.e. was not produced by `ModelDefinition.create()`). See also: getType, getSnapshot, model.',
    mistakes: `- Expecting \`clone\` to be a shallow reference copy — it is a deep structural copy via \`getSnapshot\` + \`.create()\`; nested field-models are re-created
- Cloning an instance built without \`ModelDefinition.create()\` — \`clone\` needs the definition back-reference and throws otherwise`,
  },

  'state-tree/getType': {
    signature: '(instance: object) => unknown',
    example: `import type { ModelDefinition } from '@pyreon/state-tree'

// getType is typed \`unknown\` — cast to the definition type to instantiate siblings:
const Def = getType(instance) as ModelDefinition<{ count: number }> | undefined
const sibling = Def?.create()`,
    notes: `Returns the \`ModelDefinition\` that produced \`instance\` (the back-reference stored at \`.create()\` time), or \`undefined\` for an instance created without one. Pairs with \`clone\`; lets you create siblings from an instance you were handed. The static return type is \`unknown\` (the definition\\'s generics are not recoverable at runtime) — cast it to a \`ModelDefinition<TState>\` to call \`.create()\`. See also: clone, model.`,
  },

  'state-tree/volatile': {
    signature: '.volatile(self => ({ ...initialValues })) → ModelDefinition (chainable)',
    example: `model({ state: { items: [] as string[] } })
  .volatile(() => ({ loading: false, lastError: null as Error | null }))
  .actions((self) => ({
    async load() {
      self.loading.set(true)               // reactive, not persisted
      try { self.items.set(await fetchItems()) }
      finally { self.loading.set(false) }
    },
  }))`,
    notes: 'Add VOLATILE state — signal-backed transient fields that are reactive (read `self.x()`, write `self.x.set(v)`) but EXCLUDED from snapshots, patches, and `onSnapshot`. For state that should not be persisted or replayed: in-flight flags, drag/hover UI state, live object references (websockets, timers, promises). The factory returns initial VALUES; each becomes a `Signal<T>` on `self` + the instance, strictly typed. Volatile keys cannot collide with state / schema-helper / view / action / other-volatile names (throws at `.create()`). A volatile-only change never fires `onSnapshot` (it produces the same snapshot). See also: model, onSnapshot, getSnapshot.',
    mistakes: `- Putting persistent state in \`.volatile()\` — it is dropped from snapshots, so it will not survive serialize/restore or replay. Use \`state\` / \`schema\` for durable data
- Expecting a volatile change to fire \`onSnapshot\` / emit a patch — volatile is excluded from both by design`,
  },

  'state-tree/onSnapshot': {
    signature: '(instance: ModelInstance, listener: (snapshot) => void) => () => void',
    example: `const dispose = onSnapshot(store, (snap) => {
  localStorage.setItem('store', JSON.stringify(snap))
})`,
    notes: 'Subscribe to snapshot changes. The listener fires MICROTASK-COALESCED with the new snapshot after any STATE change — all writes in one synchronous burst (a multi-field `set`/`patch`, several signal writes in one action) collapse into a SINGLE emit on the next microtask (MST-like async semantics). Does NOT fire on subscribe. Volatile-field changes do not fire it. Returns an unsubscribe function; `destroy(instance)` also clears all snapshot listeners. (Implemented via the patch-write hook, NOT an `effect()` — so it never fires on creation and never depends on the untracked `.peek()` reads `getSnapshot` performs.) See also: getSnapshot, onPatch, model.',
    mistakes: `- Expecting a synchronous / per-write callback — \`onSnapshot\` is coalesced onto a microtask; read the snapshot you are handed, not a value you \`getSnapshot\` synchronously after a write
- Expecting it to fire immediately on subscribe — it does not (unlike a reactive \`effect\`); take an initial \`getSnapshot(instance)\` yourself if you need the starting value`,
  },

  'state-tree/onAction': {
    signature: '(instance: ModelInstance, listener: (call: ActionCall) => void) => () => void',
    example: 'const unsub = onAction(store, (call) => analytics.track(call.name, call.args))',
    notes: 'Observe every action call on an instance (logging, analytics, devtools). The listener receives the `ActionCall` descriptor (`name`, `args`, `path`) BEFORE the action runs; it is read-only — it cannot block or alter the call (use `addMiddleware` for interception). Sugar over `addMiddleware` (a middleware that observes then unconditionally proceeds). Returns an unsubscribe function. See also: addMiddleware, model.',
    mistakes: '- Trying to block / mutate a call from `onAction` — it is observe-only; use `addMiddleware` to intercept',
  },

  'state-tree/getParent': {
    signature: '<T>(node) => T | undefined; also getRoot / getPath / isRoot / hasParent',
    example: `const list = TodoList.create({ todos: [] })
list.add('write tests')               // pushes a Todo into the array
const todo = list.todos()[0]
getParent(todo)   // → list   (array children get a parent, not just field-nested)
getRoot(todo)     // → list
getPath(todo)     // "/todos"
isRoot(list)      // true`,
    notes: `Tree-traversal helpers. A model instance gets a tree PARENT when it is written into another model's state — as a field value, an ARRAY element, or a plain-object value (parent tracking runs on the initial value AND every subsequent write, so array-held children — the headline \`todos: Todo[]\` shape — are tracked, not just field-nested ones). \`getParent(node)\` → the instance \`node\` is attached under (or \`undefined\` for a root); \`getRoot(node)\` → walks to the top; \`getPath(node)\` → JSON-pointer path from the root built from each ancestor's parent-key (e.g. \`"/todos"\`, \`""\` for a root); \`isRoot(node)\` / \`hasParent(node)\` → booleans. All throw on a non-model-instance. See also: model, getSnapshot.`,
    mistakes: `- Expecting a parent for a child removed from an array — parent tracking sets the parent on write; a detached node keeps its last parent until GC (v1). getParent reflects the last attachment, not live membership
- Expecting array INDICES in \`getPath\` — v1 paths carry the field key (\`/todos\`), not the element index (\`/todos/0\`)
- Auto-attachment is one container level deep — a model nested inside an array inside an array is not auto-parented; use field or single-array nesting`,
  },

  'state-tree/identifier': {
    signature: 'identifier<T extends string | number>(default?: T) => T',
    example: `const User = model({ state: { id: identifier(), name: '' } })
// schema mode:
const User2 = model({ schema: s.object({ id: s.string(), name: s.string() }), identifier: 'id' })`,
    notes: `Declare a state field as a model's IDENTIFIER — the field a \`reference()\` resolves against. Plain mode: use as a field value, \`model({ state: { id: identifier(), name: '' } })\` — it is a normal signal at runtime (initialized to the default, or \`''\`); the marker just records WHICH field is the id on the definition. Schema mode names it via config instead: \`model({ schema, identifier: 'id' })\`. A model needs an identifier only to be the TARGET of a reference. See also: reference, resolveIdentifier, model.`,
  },

  'state-tree/reference': {
    signature: 'reference(TargetModel) => ReferenceField<TargetInstance>',
    example: `const Post = model({ state: { id: identifier(), title: '', author: reference(User) } })
// inside a store holding both users and posts:
post.author()      // → the live User node (resolves via getRoot(post))
post.author.set(user)  // stores user's id
post.author.id()   // 'u-42'`,
    notes: `Declare a state field as a normalized REFERENCE to another model by its identifier. The field STORES the target's id (so it serializes + round-trips cleanly) but RESOLVES to the live node on read. \`post.author()\` → the target node (or \`undefined\` if unresolved); \`post.author.set(node | id)\` stores the id; \`post.author.id()\` reads the raw id; \`getSnapshot\`/\`applySnapshot\` serialize/restore the id. Resolution walks the tree from \`getRoot(node)\` for a node of the target type whose identifier equals the stored id (O(n) per read in v1 — a root id-index is a future optimization). The target type must declare an \`identifier()\`. See also: identifier, resolveIdentifier, getRoot, model.`,
    mistakes: `- Reading \`reference\` resolution OUTSIDE the tree — the field resolves via \`getRoot(node)\`, so the referencing node and the target must share a root; an unrooted node resolves to \`undefined\`
- Expecting a \`reference\` field to deep-serialize its target — a reference serializes as the target's ID (so it round-trips), NOT as the node; the target serializes under its OWN owner in the tree. (Array-held OWNED instances — the \`todos: Todo[]\` shape — DO deep-serialize in \`getSnapshot\`; a reference is an id by design.)
- Referencing a model with no \`identifier()\` — \`reference()\`/\`resolveIdentifier\` throw without a declared identifier on the target type`,
  },

  'state-tree/resolveIdentifier': {
    signature: '<T>(root, Type, id) => T | undefined',
    example: `const user = resolveIdentifier(store, User, 'u-42')`,
    notes: `Find the model instance of \`Type\` whose identifier equals \`id\`, searching \`root\`'s subtree (depth-first, cycle-safe; reads each node's owned state — fields, array elements, plain-object values — but does not follow references). Returns \`undefined\` if no match. Throws if \`Type\` has no \`identifier()\` declared. The resolver \`reference()\` fields use under the hood; also useful directly for ad-hoc lookups. See also: reference, identifier, getRoot.`,
  },

  'state-tree/resetHook': {
    signature: 'resetHook(id: string) => void; resetAllHooks() => void',
    example: `const useTodos = TodoList.asHook('todos')
// tests:
afterEach(() => resetAllHooks())   // else a mutation in one test leaks to the next`,
    notes: 'Destroy `.asHook(id)` singletons. `.asHook(id)` stores ONE instance per id in a MODULE-LEVEL registry (created lazily on first call, shared for the process), so every consumer of `useX = Model.asHook("x")` gets the SAME instance — great for app-global state, a hazard for tests. `resetHook(id)` deletes that one singleton so the next `asHook(id)` call re-creates a fresh instance; `resetAllHooks()` clears the whole registry. Both are for TEST isolation (and hot-reload). See also: model, destroy.',
    mistakes: `- Not resetting between tests — the \`asHook\` singleton lives in a module-level Map for the whole process, NOT per-test. State mutated in one test persists into the next; call \`resetAllHooks()\` (or \`resetHook(id)\`) in \`afterEach\`.
- Expecting \`resetHook\` to \`destroy()\` the old instance's subscriptions — it only DROPS the registry entry so the next \`asHook\` re-creates. If code still holds the old reference, call \`destroy()\` on it yourself.`,
  },
  // <gen-docs:api-reference:end @pyreon/state-tree>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/form

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/validate
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/validate>

  'validate/withField': {
    signature: '<S extends StandardSchemaV1>(schema: S, meta: FieldMeta) => S',
    example: `const emailSchema = withField(z.string().email(), {
  label: 'Email address',
  placeholder: 'you@example.com',
  i18nLabel: 'auth.email.label',
  autoComplete: 'email',
})`,
    notes: `Attach Pyreon field metadata (label, hint, placeholder, i18n keys, autoFocus, autoComplete, defaultValue) to any Standard Schema. The returned schema is the SAME REFERENCE as the input — Pyreon mutates a Symbol-keyed non-enumerable slot in place, which is invisible to JSON serialization, for…in, Object.keys, and library-internal comparators. Mutation (instead of cloning) is required because ArkType's \`Type\` instances are callable functions whose \`~standard.validate\` does \`this(input)\` — a shallow clone would not be callable and would break that contract. Re-wrapping merges new metadata onto existing (later keys win). See also: getMeta, resolveMetaField, StandardSchemaV1.`,
    mistakes: `- Expecting withField to return a NEW reference — it doesn't. The metadata mutation is in place. If you need an isolated copy, construct two separate schemas instead.
- Adding \`i18nLabel\` without a corresponding \`label\` — without a translation provider (or when t echoes the key), there's no fallback. Always set both.
- Storing schemas with metadata in JSON.stringify-d state and round-tripping — the metadata is Symbol-keyed and won't survive serialization. Re-attach on load.`,
  },

  'validate/getMeta': {
    signature: '<S extends StandardSchemaV1>(schema: S) => FieldMeta | undefined',
    example: `const meta = getMeta(emailSchema)
const label = meta?.label ?? humanize(fieldName)`,
    notes: `Read the Pyreon field metadata attached via withField(). Returns undefined for schemas that haven't been wrapped — consumers should be defensive (\`getMeta(schema)?.label ?? fallback\`). Accepts both objects AND functions (ArkType's \`Type\` instances are callable). See also: withField, resolveMetaField.`,
    mistakes: `- Metadata is a Symbol slot on ONE schema object; modifiers create NEW instances that don't copy it — \`withField(s.string(), {...}).optional()\` returns an OptionalSchema without the slot, so \`getMeta\` yields \`undefined\`. Attach metadata to the OUTERMOST schema (after \`.optional()\`/\`.transform()\`)
- \`getMeta\` returns \`undefined\` for any un-\`withField\`ed schema — always be defensive: \`getMeta(x)?.label ?? fallback\`
- \`resolveMetaField\` only handles \`label\` / \`hint\` / \`placeholder\` — other i18n keys aren't resolvable through it
- i18n resolution needs a \`t\` that does NOT echo the key — without \`t\` (or when \`t\` returns the key unchanged) it falls back to the literal metadata value`,
  },

  'validate/resolveMetaField': {
    signature: `<S extends StandardSchemaV1>(
  schema: S,
  field: 'label' | 'hint' | 'placeholder',
  t?: TFn,
) => string | undefined`,
    example: `const label = resolveMetaField(emailSchema, 'label', t)
// → t('auth.email.label') if set + resolved, else meta.label, else undefined`,
    notes: 'Read a metadata field through optional i18n. If the metadata has an `i18n<Field>` key AND a `t` function is provided AND `t` resolves it (returns a non-key string), the resolved string wins. Otherwise falls back to the literal. Recommended over `getMeta(schema)?.label` directly when you have a `t` from `useI18n()`. See also: getMeta, formatErrors.',
  },

  'validate/parseReactive': {
    signature: `<S extends StandardSchemaV1>(
  schema: S,
  source: Signal<unknown> | (() => unknown),
) => Computed<ParseResult>`,
    example: `const $email = signal('')
const $result = parseReactive(emailSchema, $email)

effect(() => {
  const r = $result()
  if (r.issues) showError(r.issues)
  else commitValue(r.value)
})

$email.set('foo@bar.com')  // $result re-derives`,
    notes: 'Reactively parse `source` through `schema`. Returns a `Computed<ParseResult>` that re-validates on every source change. Synchronous only — for schemas with async refinements (Zod `.refine(async)`, Valibot async pipe), use parseReactiveAsync (this sync variant surfaces an actionable issue if the schema returns a Promise). See also: parseReactiveAsync, watchValid, formatErrors.',
    mistakes: `- Using parseReactive on an async schema — it surfaces a clear "use parseReactiveAsync" issue rather than silently producing a Promise as the validation result.
- Calling parseReactive on every render of a component — it allocates a Computed; cache it at component setup time (call once per signal-source pair).`,
  },

  'validate/parseReactiveAsync': {
    signature: `<S extends StandardSchemaV1>(
  schema: S,
  source: Signal<unknown> | (() => unknown),
) => Computed<Promise<ParseResult>>`,
    example: `const schema = z.string().refine(async (s) => await checkUnique(s))
const $result = parseReactiveAsync(schema, $username)

watch($result, async (current) => {
  const r = await current
  showFeedback(r)
})`,
    notes: `Async variant of parseReactive. The outer Computed re-evaluates synchronously on source change; the inner Promise resolves once the validator finishes. Stale results are superseded automatically — each re-run bumps an internal version, and a validation that finishes after a newer one started resolves to the NEWEST run's result, so an awaited stale frame can never deliver a stale verdict. See also: parseReactive.`,
    mistakes: `- Adding your own debounce/version counter to guard against stale results — unnecessary: each re-run bumps an internal version and a stale frame's promise FORWARDS to the newest run's result, so an awaited stale frame resolves to the LATEST run's verdict. What it does NOT do is abort the in-flight validator (no AbortSignal — a slow async refine still runs to completion; only its result is superseded)
- Read \`source\` synchronously at the top of your accessors — the async computed tracks only the \`source\` read that runs before the first \`await\`; a signal read placed after an await won't re-trigger
- Don't call it per render — it allocates a \`Computed\`; create it once per (schema, source) pair at setup
- The \`~standard\` path it uses drops the Pyreon \`pending\` server-check info — call \`schema.parseAsync()\` directly if you need to surface deferred server checks`,
  },

  'validate/watchValid': {
    signature: `<S extends StandardSchemaV1>(
  schema: S,
  source: Signal<unknown> | (() => unknown),
  callback: (valid: boolean) => void,
) => () => void`,
    example: `const stop = watchValid(emailSchema, $email, (valid) => {
  submitButton.disabled = !valid
})

onUnmount(stop)`,
    notes: 'Subscribe to validity transitions. The callback fires only when validity flips (true→false or false→true), NOT on every error-message change — ideal for form-state hooks that care about "is this OK?" without re-rendering on every typo. Returns an unsubscribe function. Internally a `watch()` over `parseReactive`. See also: parseReactive.',
  },

  'validate/formatError': {
    signature: '(issue: StandardSchemaIssue | PyreonIssue, t?: TFn) => string',
    example: `const message = formatError(issue, t)
// → t('validate.string.too-short', { min: 2 }) when key + t resolve
// → issue.fallback ('Must be at least 2 characters') when t echoes the key
// → issue.message (raw lib message) when no key at all`,
    notes: 'Resolve a single issue to a human-readable string. Resolution order: (1) `issue.key` + `t` provided AND `t` returns a non-key string → resolved string; (2) `issue.fallback` if set; (3) `issue.message` (always present per StdSchema spec). Native StdSchema issues without `key`/`fallback` fall through to `message` immediately — no overhead. See also: formatErrors, formatErrorsByPath.',
  },

  'validate/formatErrors': {
    signature: '(issues: ReadonlyArray<StandardSchemaIssue | PyreonIssue>, t?: TFn) => string[]',
    example: `const { t } = useI18n()
const messages = formatErrors(result.issues ?? [], t)`,
    notes: 'Resolve an array of issues to strings via the same per-issue logic as formatError. Returns strings in the original order so paths line up with the input array. See also: formatError, formatErrorsByPath.',
    mistakes: `- Resolution order is strict — \`issue.key\` + a \`t\` that returns a NON-key string resolves; else \`issue.fallback\`; else \`issue.message\`. WITHOUT a \`t\` argument i18n keys never resolve and it drops straight to fallback/message
- A missing translation is SILENT: if \`t(key)\` echoes the key back (no entry) it falls through to \`fallback\`/\`message\` rather than showing the raw key — always set a \`fallback\` alongside a \`key\`
- Native Zod/Valibot/ArkType issues carry no \`key\`/\`params\`/\`fallback\`, so it returns their raw \`.message\` regardless of \`t\` — only Pyreon-issue shapes route through i18n
- \`params\` are the SECOND arg of \`t(issue.key, issue.params)\` — your i18n interpolation must read them from there
- \`formatErrorsByPath\` keeps only the FIRST issue per path unless you pass \`joinWith\`, and path-less/form-level issues land under the \`''\` key`,
  },

  'validate/formatErrorsByPath': {
    signature: '(issues: ReadonlyArray<StandardSchemaIssue | PyreonIssue>, t?: TFn, options?: { joinWith?: string }) => Record<string, string>',
    example: `const errorMap = formatErrorsByPath(result.issues ?? [], t)
// → { email: 'Invalid email', password: 'Too short', ... }`,
    notes: `Build a per-field error map keyed by the issue's path joined with \`.\`. Compatible with \`@pyreon/form\`'s \`Errors\` shape (\`Partial<Record<fieldName, string>>\`). Path-less issues land under the empty-string key. First issue wins on collision unless \`joinWith\` is set (then messages concatenate). See also: formatErrors.`,
  },

  'validate/toJsonSchema': {
    signature: `(schema: Schema<unknown>, options?: { unrepresentable?: 'throw' | 'any' }) => JsonSchema`,
    example: `import { toJsonSchema } from '@pyreon/validate/json-schema'

toJsonSchema(s.object({ name: s.string().min(2), age: s.number().int().optional() }))
// → { $schema: 'https://json-schema.org/draft/2020-12/schema',
//     type: 'object',
//     properties: { name: { type: 'string', minLength: 2 }, age: { type: 'integer' } },
//     required: ['name'] }`,
    notes: `Emit a JSON Schema (draft 2020-12) document from an \`s\` schema — for OpenAPI specs, AI structured-output constraints, editor autocomplete, cross-language contracts. Ships on the \`@pyreon/validate/json-schema\` SUBPATH so the main entry stays lean. The document describes the INPUT shape: \`.transform()\` emits its inner schema, \`.pipe()\` its source, \`s.preprocess()\` its target; \`.refine()\`/\`.superRefine()\`/\`.serverCheck()\` are runtime-only predicates and are structurally omitted. Formats map to standard \`format\` keywords (email/uri/uuid/date/date-time/time/duration); \`regex\`/\`startsWith\`/\`endsWith\`/\`includes\` map to \`pattern\`; \`.int()\` upgrades to \`type: 'integer'\`; \`.strict()\` → \`additionalProperties: false\`, \`.catchall(s)\` → \`additionalProperties: <schema>\`; \`.optional()\`/\`.nullish()\`/\`.default()\` fields are omitted from \`required\`. See also: object, union.`,
    mistakes: `- Expecting Date/BigInt/Map/Symbol/undefined kinds to emit — JSON Schema cannot express them; the emitter THROWS a [Pyreon]-prefixed error naming the kind. Pass { unrepresentable: 'any' } to emit {} (accept-anything) in their place instead.
- Expecting the post-transform OUTPUT shape — the document describes the INPUT the schema accepts (a \`.transform()\` result type is a runtime concern JSON Schema can't express).
- Feeding a cyclic s.lazy() schema — recursive $ref/$defs graph emission is not supported in v1; the emitter throws with guidance. Flatten the recursion or write the recursive document by hand.
- Importing from the main entry — \`toJsonSchema\` is deliberately on the \`@pyreon/validate/json-schema\` subpath so validators-only bundles never carry the emitter.`,
  },

  'validate/serverCheck': {
    signature: '(key: string, opts?: { message?: string; code?: string; key?: string; params?: Record<string, unknown>; fallback?: string }) => this',
    example: `// shared schema (client + server)
const signup = s.object({
  email: s.string().email().serverCheck('email-unique', { message: 'Email already taken' }),
})

// CLIENT: cheap checks run; serverCheck is deferred
const r = signup.parse(formData)
if (r.ok && r.pending?.length) showChecking()   // 'email-unique' pending

// SERVER (registerServerCheck installed elsewhere):
const verdict = await signup.parseAsync(formData, { context: { db } })`,
    notes: `Declare a server-only validation step on a shared schema — the async/privileged tier of the client/server split (unique-email, breach-check, DNS-MX, cross-field DB lookups). On the CLIENT (no validator installed) it's a no-op: the value passes and the deferred check is recorded on \`Result.pending\` (so the UX can show a "checking…" affordance). On the SERVER, the validator registered via \`registerServerCheck(key, fn)\` runs — sync or async. Async checks promote the parse to \`parseAsync\`, which threads an opaque \`context\` (DB handle, request) to the validator. Issue \`path\` is snapshotted at the check site, so a field/array-element check reports the correct path even though it resolves after the path unwinds. See also: registerServerCheck, parseAsync.`,
    mistakes: `- A client \`r.ok === true\` is NOT verification — with no validator installed \`serverCheck\` is a NO-OP that passes the value and only records a \`pending\` entry; the SERVER \`parseAsync\` is the authoritative re-validation
- Forgetting to \`registerServerCheck(key, fn)\` on the server (e.g. not importing the server-only module) silently PASSES — an unregistered key defers to \`pending\`, it never fails
- A registered ASYNC check promotes the parse to async, so plain \`.parse()\` bails with a \`[Pyreon] schema is async — use parseAsync\` issue — call \`schema.parseAsync(input, { context })\`
- The DB handle / request only reaches your validator via \`parseAsync(input, { context })\` — plain \`.parse()\` leaves \`ctx.context\` undefined
- Import \`registerServerCheck\` only from \`@pyreon/validate/server\` (a side-effecting server-only entry) — importing it into client code drags the heavy validators into the client bundle
- Any schema with a \`serverCheck\` anywhere in its tree skips the JIT (it can't await) and silently runs the slower interpreter path`,
  },

  'validate/registerServerCheck': {
    signature: '(key: string, fn: (value: unknown, context?: unknown) => boolean | Promise<boolean>) => void',
    example: `// server-only module
import { registerServerCheck } from '@pyreon/validate/server'

registerServerCheck('email-unique', async (value, ctx) => {
  const db = (ctx as { db: Db }).db
  return !(await db.user.existsByEmail(value as string))
})`,
    notes: `Register the heavy/privileged half of a \`.serverCheck(key)\` — the implementation that must NEVER reach the client bundle (DB lookups, breach-checks, MX, cross-field). Imported from \`@pyreon/validate/server\` and called from a server-only module; the matching \`s.…serverCheck(key)\` in the shared schema then validates here. Returning \`false\` fails the check with the schema's \`message\`. The second arg is the \`context\` passed to \`parseAsync(input, { context })\`. See also: serverCheck.`,
  },

  'validate/catch': {
    signature: '(value: T | ((input: unknown) => T)) => this',
    example: `s.number().catch(0).parse('nope')          // → { ok: true, value: 0 }
s.string().min(3).catch('x').parse('ab')   // → { ok: true, value: 'x' }
s.string().catch((input) => String(input)) // fallback derived from the raw input`,
    notes: `On parse FAILURE, discard the issues this schema produced and return a fallback instead of erroring — resilient parsing (Zod's \`.catch\`). The fallback is a static value or a function of the raw input. Terminal regardless of chain position: \`s.string().min(3).catch('x')\` and \`s.string().catch('x').min(3)\` behave identically. Works on both \`parse\` and \`parseAsync\` (an async transform/refine failure is caught after the Promise settles). Scoped per-schema: a caught FIELD failure is substituted while sibling failures still fail the object. See also: readonly, default.`,
    mistakes: `- \`.catch()\` swallows EVERY issue this schema produced (type failures AND check/refine/transform failures alike) — a genuinely broken input is masked as \`ok: true\`; scope it narrowly, not around a whole object
- A FUNCTION passed to \`.catch()\` is ALWAYS an input→fallback mapper (called with the raw original input), never a literal fallback — you cannot use \`.catch()\` to return a function value
- The fallback is returned verbatim and is NOT re-validated — a fallback that doesn't satisfy the schema's type still passes through as \`ok: true\`
- \`.catch()\` is terminal + position-independent with LAST-wins semantics — \`s.string().catch('a').catch('b')\` always yields \`'b'\`
- The catch fn receives the RAW original input (captured before the \`default\`/modifier prelude), not the typed or defaulted value`,
  },

  'validate/readonly': {
    signature: '() => Schema<ShallowReadonly<T>>',
    example: `const cfg = s.object({ port: s.number() }).readonly()
const r = cfg.parse({ port: 80 })
// r.value is Readonly<{ port: number }> and Object.isFrozen(r.value) === true`,
    notes: `Freeze the parsed output and mark it \`Readonly<T>\` at the type level (Zod's \`.readonly\`). Objects/arrays are \`Object.freeze\`d (shallow) so accidental downstream mutation throws in strict mode; primitives pass through. Apply last in a chain. Uses a primitive-safe \`ShallowReadonly<T>\` (not the built-in \`Readonly<T>\`, whose \`Readonly<unknown>\` resolves to \`{}\` and breaks \`Schema<T>\` → \`Schema<unknown>\` assignability). See also: catch.`,
  },

  'validate/array': {
    signature: '() => ArraySchema<T>',
    example: `s.string().array().parse(['a', 'b']) // → { ok: true, value: ['a', 'b'] }`,
    notes: `Wrap this schema in an array — \`s.string().array()\` ≡ \`s.array(s.string())\` (Zod's \`.array\`). Chains and nests (\`s.number().array().array()\`). Late-bound via a tree-shake-safe factory registry so the base class never imports the composition modules (no load-order cycle). See also: or, and.`,
  },

  'validate/or': {
    signature: '<U>(other: Schema<U>) => UnionSchema<readonly [Schema<T>, Schema<U>]>',
    example: 's.string().or(s.number()) // Schema<string | number>',
    notes: `Union this schema with another — \`a.or(b)\` ≡ \`s.union(a, b)\` (Zod's \`.or\`). Output type is \`T | U\`. See also: and, array.`,
    mistakes: `- \`.or()\` / \`s.union(...)\` members MUST be schemas — a non-schema member (or fewer than two) throws a clear \`[Pyreon]\` error ONLY when \`NODE_ENV !== "production"\`; a production build strips the guard and a bad member crashes cryptically at parse time (\`member._runInto is not a function\` / reading \`_runInto\` of undefined)
- A union surfaces NO per-member issues — a total miss yields one opaque \`invalid_union\` "Did not match any allowed type", so you can't tell which member was closest; members are tried in order, first-match wins
- \`.or()\`/\`.and()\`/\`.array()\` throw \`COMPOSITION_UNREGISTERED\` if the composition factory was never registered — a bare \`import { string }\` that never references \`s\`/\`union\`/\`intersection\` skips registration
- An async member inside a SYNC union parse pushes an \`async member … use parseAsync\` issue rather than awaiting`,
  },

  'validate/and': {
    signature: '<U>(other: Schema<U>) => IntersectionSchema<T, U>',
    example: 's.object({ a: s.string() }).and(s.object({ b: s.number() })) // { a } & { b }',
    notes: `Intersect this schema with another — \`a.and(b)\` ≡ \`s.intersection(a, b)\` (Zod's \`.and\`). Output type is \`T & U\`. See also: or, array.`,
  },

  'validate/pipe': {
    signature: '<U>(target: Schema<U>) => Schema<U>',
    example: 's.string().transform(Number).pipe(s.number().positive())',
    notes: `Validate with this schema, then feed the (validated, transformed) output into \`target\` (Zod's \`.pipe\`). Ideal for coerce→validate chains. Short-circuits if this schema fails; async-aware. Output type is \`target\`'s. See also: preprocess, transform.`,
  },

  'validate/superRefine': {
    signature: '(fn: (value: T, ctx: SuperRefineCtx) => void) => Schema<T>',
    example: `s.object({ pw: s.string(), confirm: s.string() }).superRefine((v, ctx) => {
  if (v.pw !== v.confirm) ctx.addIssue({ message: 'Mismatch', path: ['confirm'] })
})`,
    notes: `Like \`.refine\`, but the callback may add ANY number of issues (or none) via \`ctx.addIssue({ message, path? })\` — for cross-field validation that reports multiple problems at once. \`path\` is appended to the field's current path. Runs only if this schema passed. See also: refine, pipe.`,
    mistakes: `- Report problems ONLY via \`ctx.addIssue(...)\` — the callback returns void, so \`return false\` or returning a message does nothing
- It runs ONLY if the base schema produced zero issues — if the underlying type/checks already failed, your cross-field refinement never executes
- \`addIssue({ path })\` APPENDS to the field's current path — pass a RELATIVE \`path: ["confirm"]\`, not an absolute path, or the issue lands at the wrong nested location
- Do NOT make the callback async — the signature is sync \`=> void\` and issues are collected right after it returns, so anything pushed after an \`await\` is lost
- \`superRefine\` returns a NEW wrapper schema, not \`this\` — capture the return value`,
  },

  'validate/preprocess': {
    signature: '<TOut>(fn: (input: unknown) => unknown, schema: Schema<TOut>) => Schema<TOut>',
    example: 's.preprocess((v) => String(v).trim(), s.string().min(1))',
    notes: `Transform the raw input BEFORE \`schema\` validates it (Zod's \`z.preprocess\`) — for trim/coerce/normalize that must happen before the type-check. A standalone function (also on the \`s\` namespace), not a method. See also: pipe, transform.`,
    mistakes: `- Argument order is \`(fn, target)\` — \`fn\` maps the RAW input first, then \`target\` validates the mapped value; the output type is \`target\`'s
- No type flows from \`fn\` into \`target\` — \`fn\` is typed \`(unknown) => unknown\`, so nothing enforces that its return matches what \`target\` expects; that alignment is on you
- Keep \`fn\` TOTAL (never throw) — \`.parse()\` does NOT try/catch a sync throw from \`fn\` (only \`parseAsync\` does), so a throwing preprocess propagates out of \`.parse()\``,
  },

  'validate/nonoptional': {
    signature: '(message?: string) => Schema<Exclude<T, undefined>>',
    example: 's.string().optional().nonoptional() // rejects undefined again',
    notes: `Reject \`undefined\` (Zod 4's \`.nonoptional\`) — re-requires a present value, e.g. after an \`.optional()\` in a reused base schema. See also: optional.`,
    mistakes: `- It rejects \`undefined\` at RUNTIME (pushes a "Required" issue) — it is not merely a type cast; the runtime guard is what enforces presence
- It rejects ONLY \`undefined\`, NOT \`null\` — \`s.string().nullish().nonoptional()\` still accepts \`null\`
- The default message is \`"Required"\``,
  },

  'validate/stringbool': {
    signature: '(opts?: { truthy?: string[]; falsy?: string[]; message?: string }) => StringBoolSchema',
    example: `s.stringbool().parse('yes') // → { ok: true, value: true }
s.stringbool({ truthy: ['si'], falsy: ['no'] })`,
    notes: `Coerce a boolean-ish STRING to a real boolean (Zod 4's \`z.stringbool\`). Type-checks a string, then maps configured truthy/falsy tokens (case-insensitive, trimmed; defaults \`true\`/\`1\`/\`yes\`/\`on\`/\`y\`/\`enabled\` ↔ \`false\`/\`0\`/\`no\`/\`off\`/\`n\`/\`disabled\`) to \`true\`/\`false\`; anything else errors. Stricter than \`s.coerce.boolean()\` (which uses JS truthiness on any input). See also: coerce.`,
    mistakes: `- The default truthy set is exactly \`true\`/\`1\`/\`yes\`/\`on\`/\`y\`/\`enabled\` and falsy \`false\`/\`0\`/\`no\`/\`off\`/\`n\`/\`disabled\` — anything else (\`'2'\`, \`'maybe'\`, and crucially the EMPTY string) is a validation ERROR, not \`false\`
- An unset env var read as \`''\` FAILS \`stringbool\` (empty string is in neither set) — add \`.default(false)\` / \`.optional()\` when a missing var should mean false
- It accepts ONLY strings — a real boolean or number emits a type issue; use \`s.coerce.boolean()\` (JS truthiness on any input) if you need that, they are NOT interchangeable
- Passing \`truthy\`/\`falsy\` REPLACES the defaults, it does not extend them — \`stringbool({ truthy: ['yes'] })\` makes \`'1'\`/\`'true'\`/\`'on'\` invalid
- Matching is case-insensitive + trimmed, truthy checked before falsy — \`' TRUE '\` works, and a token in BOTH sets resolves to \`true\``,
  },

  'validate/never': {
    signature: '() => Schema<never>',
    example: `s.never().parse(1) // → { ok: false }
s.object({ a: s.string() }).extend({ legacy: s.never().optional() })`,
    notes: `Accepts NO value (Zod's \`z.never\`) — every input is a validation error, including \`undefined\`. Used for exhaustiveness and to forbid a key (\`s.object(...).extend({ legacy: s.never().optional() })\` rejects the key only when present; a bare \`s.never()\` field is required-and-unsatisfiable). See also: unknown, custom.`,
  },

  'validate/custom': {
    signature: '<T = unknown>(check?: (value: unknown) => boolean, message?: string) => Schema<T>',
    example: `s.custom<\`\${number}px\`>((v) => typeof v === 'string' && v.endsWith('px'))
s.custom<MyType>() // accept anything as MyType`,
    notes: `Escape-hatch validated by a user predicate (Zod's \`z.custom<T>\`). With NO predicate it accepts everything as \`T\` (a pure type assertion); with one it emits a \`custom\`-coded issue when the predicate returns false. The output type is the caller-supplied \`T\` — never narrowed, since the predicate is opaque. See also: instanceof, refine.`,
  },

  'validate/instanceof': {
    signature: '<T>(ctor: new (...args: any[]) => T, message?: string) => Schema<T>',
    example: `s.instanceof(File) // validate an uploaded File
s.instanceof(Date, 'need a Date')`,
    notes: `Asserts \`input instanceof Ctor\` (Zod's \`z.instanceof\`). The canonical way to validate runtime class instances — \`s.instanceof(File)\`, \`s.instanceof(Date)\`, \`s.instanceof(URL)\`, user classes. The default message names the class; pass a second arg to override. See also: custom.`,
    mistakes: `- It uses native \`input instanceof ctor\`, so CROSS-REALM instances FAIL — a \`Date\`/\`File\`/\`URL\` from an iframe, worker, or vm has a different constructor identity and won't validate
- It cannot survive an SSR→client (or any JSON) boundary — a hydrated plain object / date string is not an instance, so \`instanceof(Date)\` rejects deserialized data; validate the serialized shape (an ISO string) and reconstruct instead
- The output is the input unchanged — \`instanceof\` ASSERTS, it does not construct or coerce an instance`,
  },

  'validate/nativeEnum': {
    signature: '<E extends Record<string, string | number>>(enumObject: E) => Schema<E[keyof E]>',
    example: `enum Role { Admin = 'admin', User = 'user' }
s.nativeEnum(Role).parse('admin') // → { ok: true, value: 'admin' }`,
    notes: `Validate a VALUE of a TS native \`enum\` (or a \`const\` value-object) — Zod's \`z.nativeEnum\`. Output type is the enum's value union (\`E[keyof E]\`). Correctly filters out the numeric reverse-mappings TS auto-generates (a numeric \`enum { A }\` compiles to \`{ A: 0, 0: 'A' }\`, so \`'A'\` is NOT accepted as input — only \`0\` is). Use \`s.enum([...])\` instead for a plain literal array. See also: enum, literal.`,
  },
  // <gen-docs:api-reference:end @pyreon/validate>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/validation
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/validation>

  'validation/zodSchema': {
    signature: '<TValues>(schema: ZodSchema<TValues>) => TypedSchemaAdapter<TValues>',
    example: `const schema = z.object({ email: z.string().email(), age: z.number().min(18) })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: zodSchema(schema),
  onSubmit: (values) => save(values),
})`,
    notes: 'Create a typed whole-form schema adapter from a Zod schema. Duck-typed against `.safeParse()` / `.safeParseAsync()` so it works with Zod v3 and v4 without version checks. Returns a `TypedSchemaAdapter` (`{ _infer, validator, parse }`) that `useForm({ schema })`, schema-driven `defineStore`, and `model` accept — `_infer` carries the inferred field types for compile-time field-name checking; `parse` gives store / state-tree the coerced value. Since Zod ≥3.24 is Standard-Schema-compliant you may also skip this wrapper and pass the raw `z.object(...)` directly. See also: zodField, standardSchemaToValidator, TypedSchemaAdapter.',
    mistakes: `- Passing both zodSchema AND a per-field validator for the same field — both run; a schema error can override the field error on that key
- Using zodSchema with a non-object schema (z.string()) — form/store schemas must validate an object shape matching initialValues
- Assuming the return is a plain function — it is a TypedSchemaAdapter object ({ _infer, validator, parse }); the form reads \`.validator\` for you`,
  },

  'validation/zodField': {
    signature: '<T>(schema: ZodSchema<T>) => ValidateFn<T>',
    example: `const form = useForm({
  initialValues: { username: '' },
  validators: { username: zodField(z.string().min(3).max(20)) },
  onSubmit: (values) => save(values),
})`,
    notes: `Create a per-field validator from a Zod schema. Returns a \`ValidateFn\` compatible with \`useForm({ validators: { fieldName: zodField(z.string().email()) } })\`. Uses \`safeParseAsync\` so sync AND async refinements work; returns the first issue message on failure, \`undefined\` on success. Use when individual fields have independent rules that don't need cross-field context. See also: zodSchema, valibotField, ValidateFn.`,
  },

  'validation/valibotSchema': {
    signature: '<TValues>(schema: unknown, safeParse: Function) => TypedSchemaAdapter<TValues>',
    example: `import * as v from 'valibot'
const schema = v.object({ email: v.pipe(v.string(), v.email()) })
const form = useForm({
  initialValues: { email: '' },
  schema: valibotSchema(schema, v.safeParse),
  onSubmit: (values) => save(values),
})`,
    notes: `Create a typed whole-form schema adapter from a Valibot schema. Requires passing the \`safeParse\` (or \`safeParseAsync\`) function explicitly — Valibot uses standalone functions, not methods, so this keeps the adapter independent of Valibot's internal module structure across versions. Returns a \`TypedSchemaAdapter\` ({ _infer, validator, parse }); the sync \`parse\` path needs the SYNC \`v.safeParse\`. Valibot ≥1 is also Standard-Schema-compliant, so a raw \`v.object(...)\` can be passed directly instead. See also: valibotField, zodSchema, standardSchemaToValidator.`,
    mistakes: `- Forgetting to pass v.safeParse as the second argument — the adapter cannot call safeParse without it (Valibot uses standalone functions)
- Passing v.safeParseAsync when using the sync \`parse\` path (schema-driven store) — the parser then returns a Promise and store rejects it at defineStore-time`,
  },

  'validation/valibotField': {
    signature: '<T>(schema: unknown, safeParse: Function) => ValidateFn<T>',
    example: 'validators: { email: valibotField(v.pipe(v.string(), v.email()), v.safeParseAsync) }',
    notes: 'Create a per-field validator from a Valibot schema. Same standalone-function style as valibotSchema — pass `v.safeParse` (or `v.safeParseAsync`) explicitly. Returns the first issue message on failure, `undefined` on success. See also: valibotSchema, zodField.',
  },

  'validation/arktypeSchema': {
    signature: '<TValues>(schema: (data: unknown) => unknown) => TypedSchemaAdapter<TValues>',
    example: `import { type } from 'arktype'
const schema = type({ email: 'string.email', age: 'number > 18' })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: arktypeSchema(schema),
  onSubmit: (values) => save(values),
})`,
    notes: 'Create a typed whole-form schema adapter from an ArkType type. Accepts any callable — ArkType schemas are invoked directly, no ArkType import required. Synchronous only (ArkType has no async surface); the non-error result IS the coerced value, so the `parse` path is native. Returns a `TypedSchemaAdapter` ({ _infer, validator, parse }); errors are read from the returned `ArkErrors` array. ArkType ≥2 is Standard-Schema-compliant, so a raw `type(...)` can be passed directly instead. See also: arktypeField, zodSchema, standardSchemaToValidator.',
    mistakes: '- Expecting async validation — the ArkType adapter is synchronous; wrap async logic in a per-field validator function instead',
  },

  'validation/arktypeField': {
    signature: '<T>(schema: (data: unknown) => unknown) => ValidateFn<T>',
    example: `validators: { age: arktypeField(type('number > 18')) }`,
    notes: 'Create a per-field validator from an ArkType type. Synchronous, like arktypeSchema. Returns the first ArkType error message on failure, `undefined` on success. See also: arktypeSchema, zodField.',
  },

  'validation/standardSchemaToValidator': {
    signature: '<TValues>(schema: StandardSchemaLike) => SchemaValidateFn<TValues>',
    example: `import { z } from 'zod'
import { standardSchemaToValidator } from '@pyreon/validation'

const schema = z.object({ email: z.string().email(), age: z.number().min(18) })
const validate = standardSchemaToValidator(schema)
const errors = await validate({ email: 'x', age: 5 })
// => { email: 'Invalid email', age: 'Too small: ...' }`,
    notes: 'Convert a RAW Standard Schema (any library exposing `~standard` — Zod 3.24+, Valibot 1+, ArkType 2+, Effect Schema, `@pyreon/validate` `s`) into a whole-object `SchemaValidateFn` — `(values) => per-key error record`. This is the bridge that lets a consumer accept a raw schema with no `zodSchema()` wrapper and no cast: `useForm({ schema: z.object(...) })`. Issue paths flatten to dot-strings (`address.city`); first message per path wins; async schemas resolve naturally (the returned validator is always async — await it). See also: isStandardSchema, zodSchema, InferSchema.',
    mistakes: `- Passing a Pyreon adapter (the result of zodSchema()) instead of the RAW schema — the adapter is already a validator; pass z.object(...) directly, or use adapter.validator
- Expecting a synchronous return — the produced validator is always async (returns a Promise); always await it
- Assuming a non-object schema works — the output is a per-key record keyed on the top-level fields, so the schema must describe an object shape`,
  },

  'validation/isStandardSchema': {
    signature: '(value: unknown) => value is StandardSchemaLike<unknown>',
    example: `import { isStandardSchema, standardSchemaToValidator } from '@pyreon/validation'

if (isStandardSchema(schema)) {
  const validate = standardSchemaToValidator(schema)
}`,
    notes: 'Runtime type guard — detect a Standard Schema-compliant schema by its `~standard` property (an object carrying a `validate` function). Accepts a value whose `typeof` is `object` OR `function` — ArkType schemas are CALLABLE (`type("string")(input)` validates) yet still carry `~standard`, so a callable is a valid Standard Schema; a plain function WITHOUT `~standard` is still rejected. Used by the universal gate to decide whether a `schema` option is a raw Standard Schema (→ standardSchemaToValidator) vs a Pyreon TypedSchemaAdapter (→ isPyreonAdapter) vs a plain validator function. Zero library imports — pure duck-typing, so it never breaks on a validator-library major bump. See also: isPyreonAdapter, standardSchemaToValidator.',
    mistakes: `- Using it to detect a Pyreon adapter — those brand with \`_infer\`, not \`~standard\`; use isPyreonAdapter for that tier
- Assuming it only matches objects — ArkType schemas are functions; the guard accepts a callable carrying \`~standard\` (a bare object-only guard silently rejected raw ArkType everywhere)`,
  },

  'validation/isPyreonAdapter': {
    signature: '(value: unknown) => value is PyreonAdapterShape<Record<string, unknown>>',
    example: `import { isPyreonAdapter } from '@pyreon/validation'

if (isPyreonAdapter(schema)) {
  const result = schema.parse!(value) // sync coerced parse
}`,
    notes: 'Runtime type guard — detect a Pyreon TypedSchemaAdapter (Tier A.1) by its `_infer` brand plus a callable `parse`. The counterpart to isStandardSchema in the two-tier detection that schema-driven consumers (`@pyreon/store`, `@pyreon/state-tree`) use to accept EITHER a `zodSchema()`-style adapter OR a raw Standard Schema (Tier A.2). See also: isStandardSchema, extractParseFn.',
    mistakes: '- Assuming any adapter passes — all three built-in adapters ship `parse` so they do, but a validator-only shape ({ _infer, validator } with no parse) does NOT',
  },

  'validation/wrapStandardSchema': {
    signature: '<T>(schema: StandardSchemaShape<unknown>) => (value: unknown) => SchemaParseResult<T>',
    example: `import { wrapStandardSchema } from '@pyreon/validation'

const parse = wrapStandardSchema(schema)
const r = parse(input)
if (r instanceof Promise) throw new Error('async schema unsupported')
if (r.ok) use(r.value)`,
    notes: 'Convert a Standard Schema into a synchronous parser returning `SchemaParseResult<T>` (`{ ok: true, value } | { ok: false, issues }`). Unlike standardSchemaToValidator (which returns per-key ERRORS for forms), this returns the coerced VALUE on success — what `@pyreon/store` / `@pyreon/state-tree` need. Surfaces async validation as a `Promise` return so callers can detect and reject async-only schemas. @internal — most consumers go through extractParseFn. See also: extractParseFn, standardSchemaToValidator.',
    mistakes: `- Treating it like standardSchemaToValidator — this returns a coerced-value ParseResult, not a form error record
- Not probing for a Promise return — an async Standard Schema returns a Promise, which is not a valid sync ParseResult`,
  },

  'validation/extractParseFn': {
    signature: '<T>(schema: unknown) => (value: unknown) => SchemaParseResult<T>',
    example: `import { extractParseFn, formatIssues } from '@pyreon/validation'

const parse = extractParseFn(userSchema)
const r = parse(initial)
if (r instanceof Promise) throw new Error('[Pyreon] async schemas unsupported')
if (!r.ok) throw new Error(formatIssues(r.issues, 'init'))
const value = r.value // parsed + coerced`,
    notes: 'The primary schema-driven entry point for `@pyreon/store` + `@pyreon/state-tree`: accept EITHER a Pyreon TypedSchemaAdapter (uses its sync `parse`) OR a raw Standard Schema (wraps via wrapStandardSchema) and return one uniform sync parser. Throws a `[Pyreon]`-prefixed error at construction if the value is neither shape, or if a Tier-A.1 adapter is missing its `parse`. Callers should probe the first call for a `Promise` (async-only schema) and reject it. See also: wrapStandardSchema, isPyreonAdapter, formatIssues.',
    mistakes: `- Passing an async-only schema (objectAsync / safeParseAsync-only) — extractParseFn constructs fine but the returned parser resolves a Promise; detect and reject it
- Passing a @pyreon/form-only validator ({ _infer, validator } with no parse) — throws at construction; schema-driven state needs the coerced value, not just errors`,
  },

  'validation/formatIssues': {
    signature: '(issues: SchemaIssue[], op: string) => string',
    example: `import { formatIssues } from '@pyreon/validation'

throw new Error(formatIssues([{ path: 'email', message: 'Invalid' }], 'set'))
// [Pyreon] Schema validation failed (set):
//   - email: Invalid`,
    notes: 'Format normalized schema issues into a readable multi-line `[Pyreon] Schema validation failed (<op>): ...` message. Truncates after 5 issues with an "and N more" suffix. `op` is a free-form label for the failing operation (`init`, `set`, `patch`, `create`, `$set`, ...). Used by schema-driven store / state-tree to throw clear errors on an invalid write. See also: extractParseFn, issuesToRecord.',
  },

  'validation/issuesToRecord': {
    signature: '<TValues>(issues: ValidationIssue[]) => Partial<Record<keyof TValues, ValidationError>>',
    example: `import { issuesToRecord } from '@pyreon/validation'

issuesToRecord([
  { path: 'email', message: 'Required' },
  { path: 'email', message: 'Invalid' }, // dropped — first wins
])
// => { email: 'Required' }`,
    notes: 'Collapse an array of normalized `ValidationIssue` (`{ path, message }`) into a flat field→error record — the shape `@pyreon/form` consumes. First message per path wins; nested dot-paths (`address.city`) become the record key verbatim (the adapter is responsible for producing the dot-string). The building block every custom adapter ends with. See also: formatIssues, zodSchema.',
    mistakes: `- Expecting the LAST message to win for a repeated path — the FIRST wins; order your issues most-important-first
- Feeding native library paths (arrays / objects) directly — normalize to a dot-string path in the ValidationIssue first`,
  },

  'validation/TypedSchemaAdapter': {
    signature: 'interface TypedSchemaAdapter<TValues> { readonly _infer: TValues; readonly validator: SchemaValidateFn<TValues>; readonly parse?: (value: unknown) => ParseResult<TValues> }',
    example: `import { zodSchema } from '@pyreon/validation'
const adapter = zodSchema(z.object({ id: z.string() }))
adapter.validator({ id: 5 })   // => { id: 'Expected string' }
adapter.parse!({ id: 'x' })    // => { ok: true, value: { id: 'x' } }`,
    notes: 'The object every `zodSchema()` / `valibotSchema()` / `arktypeSchema()` returns. `_infer` is a compile-time-only brand carrying the inferred field types (never read at runtime — it is `undefined as any`); `validator` is the whole-form error function `@pyreon/form` runs; `parse` is the optional sync coerced-value parser `@pyreon/store` / `@pyreon/state-tree` need (all three built-in adapters ship it). See also: zodSchema, SchemaValidateFn, InferSchema.',
    mistakes: `- Calling the adapter like a function — it is an object; the form reads \`.validator\` for you, store reads \`.parse\`
- Relying on \`_infer\` at runtime — it is \`undefined as any\`, a type brand only`,
  },

  'validation/InferSchema': {
    signature: 'type InferSchema<S> = S["_infer"] /* Tier A.1 */ | S["~standard"]["types"]["output"] /* Tier A.2 */ | Record<string, unknown>',
    example: `import type { InferSchema } from '@pyreon/validation'
import { z } from 'zod'

const schema = z.object({ id: z.string(), n: z.number() })
type Values = InferSchema<typeof schema> // { id: string; n: number }`,
    notes: 'Extract the inferred output type from EITHER a Pyreon TypedSchemaAdapter (reads `_infer`, Tier A.1) OR a raw Standard Schema (reads `~standard.types.output`, Tier A.2). Falls back to `Record<string, unknown>` for unknown shapes (never collapses to `never`). Powers the strict typing in `@pyreon/store` + `@pyreon/state-tree` so a raw `z.object(...)` passed directly infers its exact field types. See also: TypedSchemaAdapter, StandardSchemaLike.',
    mistakes: '- Expecting inference when a raw schema omits its `~standard.types` phantom — the spec makes `types?` optional; real libraries emit it, but a hand-rolled ~standard without it falls back to Record<string, unknown>',
  },

  'validation/SchemaValidateFn': {
    signature: 'type SchemaValidateFn<TValues> = (values: TValues) => Partial<Record<keyof TValues, ValidationError>> | Promise<Partial<Record<keyof TValues, ValidationError>>>',
    example: `import type { SchemaValidateFn } from '@pyreon/validation'

const validate: SchemaValidateFn<{ email: string }> = (values) =>
  values.email.includes('@') ? {} : { email: 'Invalid email' }`,
    notes: 'The whole-object validator contract — maps a values object to a per-key error record (sync or async). What every schema adapter (zod / valibot / arktype / Standard Schema) produces and what `@pyreon/form` + `@pyreon/store` consume. OWNED by `@pyreon/validation` (the library-agnostic gate); `@pyreon/form` re-exports it for back-compat. See also: ValidateFn, standardSchemaToValidator.',
    mistakes: '- Returning a full record with every key present — return ONLY errored keys; an empty object {} means "valid"',
  },

  'validation/ValidateFn': {
    signature: 'type ValidateFn<T, TValues = Record<string, unknown>> = (value: T, allValues: TValues, signal?: AbortSignal) => ValidationError | Promise<ValidationError>',
    example: `import type { ValidateFn } from '@pyreon/validation'

const confirm: ValidateFn<string, { password: string }> = (value, all) =>
  value === all.password ? undefined : 'Passwords must match'`,
    notes: 'The single-field validator contract — receives the field value, all current values (for cross-field checks), and an optional `AbortSignal` (cancellation, e.g. when a form unmounts). Returns an error string or `undefined` (sync or async). OWNED by `@pyreon/validation`; `@pyreon/form` re-exports it. See also: SchemaValidateFn, ValidationError.',
    mistakes: '- Returning a falsy non-undefined value ("" / false / 0) to mean "valid" — return `undefined`; an empty string is technically an error message',
  },

  'validation/ValidationError': {
    signature: 'type ValidationError = string | undefined',
    example: `import type { ValidationError } from '@pyreon/validation'

const err: ValidationError = isValid ? undefined : 'Required'`,
    notes: `A single field's error value — the message string, or \`undefined\` for "no error". The atomic unit of every error record and validator return in the stack. OWNED by \`@pyreon/validation\`; re-exported by \`@pyreon/form\` so \`import { ValidationError } from '@pyreon/form'\` still works. See also: ValidateFn, SchemaValidateFn.`,
  },

  'validation/StandardSchemaLike': {
    signature: 'interface StandardSchemaLike<Output = unknown> { readonly "~standard": { readonly types?: { readonly output: Output }; readonly validate: (value: unknown) => StandardSchemaResult | Promise<StandardSchemaResult> } }',
    example: `import type { StandardSchemaLike } from '@pyreon/validation'
import { standardSchemaToValidator } from '@pyreon/validation'

function adapt<T extends Record<string, unknown>>(s: StandardSchemaLike) {
  return standardSchemaToValidator<T>(s)
}`,
    notes: 'The Standard Schema (https://standardschema.dev) shape `@pyreon/validation` owns so any consumer can accept a raw schema with no adapter and no cast — the `~standard` property Zod ≥3.24 / Valibot ≥1 / ArkType ≥2 / Effect Schema / `@pyreon/validate` `s` all expose. `standardSchemaToValidator` takes this type; `useForm({ schema })` accepts it directly. See also: standardSchemaToValidator, isStandardSchema.',
    mistakes: '- Confusing it with StandardSchemaShape — near-identical duck-types; standardSchemaToValidator takes StandardSchemaLike, wrapStandardSchema / isStandardSchema use StandardSchemaShape',
  },

  'validation/ValidationIssue': {
    signature: 'interface ValidationIssue { path: string; message: string }',
    example: `import type { ValidationIssue } from '@pyreon/validation'

const issues: ValidationIssue[] = [{ path: 'address.city', message: 'Required' }]`,
    notes: `The normalized issue shape every adapter produces before calling \`issuesToRecord\` — a dot-separated field \`path\` (\`address.city\`) plus a human-readable \`message\`. The common denominator that lets any library's errors flow into \`@pyreon/form\`'s flat record. Aliased as \`SchemaIssue\` for the store / state-tree surface. See also: issuesToRecord, formatIssues.`,
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
    notes: `Create a signal-based form. \`initialValues\` drives field keys and types end-to-end — TValues is inferred from it, so all downstream typings (\`useField\` field name, \`useWatch\` keys, validator signatures) are fully typed without annotation. Returns \`FormState<TValues>\` with per-field signals, form-level signals (\`isSubmitting\`, \`isValidating\`, \`isValid\`, \`isDirty\`, \`submitCount\`, \`isSubmitted\`, \`isSubmitSuccessful\`, \`submitError\`), and handlers (\`handleSubmit\`, \`reset\`, \`validate\`, \`trigger\`, \`focusFirstError\`, \`registerField\`, \`unregisterField\`). react-hook-form-parity accessors: \`trigger(name?)\` validates a field/subset/whole-form on demand; \`getValues(name?)\` reads one value or all; \`dirtyFields()\` / \`touchedFields()\` return the changed/visited fields as records; \`getFieldState(name)\` returns a field's live signals (\`undefined\` for a name matching no field — an existence probe for dynamic fields); \`isSubmitted\` / \`isSubmitSuccessful\` track submit lifecycle. \`validateOn\` defaults to \`"blur"\` (not \`"change"\`) so users aren't scolded mid-keystroke. \`schema\` accepts a RAW Standard Schema (zod / valibot / arktype / \`@pyreon/validate\`'s \`s\`) directly — no adapter, no \`as never\` cast — as well as a plain \`SchemaValidateFn\` or a \`@pyreon/validation\` typed adapter (\`zodSchema\` / \`valibotSchema\` / \`arktypeSchema\`); it runs after per-field validators, field-level errors win on the same field, and a key matching no field invalidates the form (never silently dropped). A field key with a dot (\`"address.city"\`) declares a FIRST-CLASS leaf field: per-field validators route to the exact leaf, and a DECLARATIVE schema (raw Standard Schema or typed adapter — never a plain function) over a dot-path-leaf form is fed the NESTED value shape (rebuilt from the flat model) so a real nested \`z.object({ address: z.object({ city }) })\` validates correctly and its \`address.city\` error auto-splits to the leaf field; a nested error with no leaf field routes to the nearest ancestor object field. The value model is FLAT (\`values()\` / \`onSubmit\` keep the dot-path keys — honest field-name types); \`nestValues\` / \`flattenValues\` convert to/from a nested API payload. an UNRECOGNIZED \`schema\` object (e.g. a zod<3.24 schema with no \`~standard\` support, or a mistyped object) THROWS at creation instead of silently disabling validation. \`register(field, { type })\` binds an input per type — \`"checkbox"\` → \`checked\`, \`"number"\` → \`valueAsNumber\`, \`"file"\` → a value-less bag whose \`onInput\` writes the \`FileList\`. \`registerField(name, initial?, validator?)\` / \`unregisterField(name)\` add or remove first-class fields at runtime for data-driven forms (idempotent; no silent auto-registration; dynamic fields are runtime-typed). On a failed submit, focus moves to the first errored + \`register()\`-bound field unless \`focusOnError: false\` (also exposed as \`focusFirstError()\`). \`reset(values?, { keepErrors?, keepTouched?, keepDirty?, keepSubmitCount? })\` resets to a new baseline — DURABLY: named fields become the new baseline for the dirty compare, \`resetField\`, and any later plain \`reset()\` (react-hook-form defaultValues-replacement parity); unnamed fields revert to their current baseline. \`resetField(field, { keepError?, keepTouched? })\` resets one field. An explicit \`null\`/\`undefined\` field value is first-class — \`values()\` and the submit payload never fall back to the initial for it (a cleared \`FileList | null\` file field submits \`null\`). See also: useField, FormProvider, useFormState.`,
    mistakes: `- Mutating \`initialValues\` after creation — it is read once at setup; use \`setFieldValue\` for programmatic updates
- Reading \`form.fields[name].value\` as a plain value — it is \`Signal<T>\`, call it: \`form.fields.email.value()\`
- Passing \`validateOn: "change"\` without \`debounceMs\` on async validators — fires a network request on every keystroke
- Calling \`form.handleSubmit()\` without attaching it as a form \`onSubmit\` handler — it calls \`preventDefault()\` so it must receive the form event, or be called with no argument for programmatic submit
- Assuming \`schema\` errors override field validators — it is the reverse: \`schema\` runs AFTER per-field \`validators\` but a field that already has a field-level error KEEPS it; the schema only fills fields with no field-level error. Also: a raw Standard Schema needs NO \`zodSchema()\` wrapper or \`as never\` cast — pass zod/valibot/arktype directly
- Passing a pre-Standard-Schema library object as \`schema\` (zod<3.24, or a mistyped object) — useForm THROWS at creation with \`[Pyreon]\` guidance; it never silently skips validation. Upgrade the library or pass a \`@pyreon/validation\` adapter
- Expecting \`values()\` / \`onSubmit\` to be NESTED for dot-path fields — the value model is FLAT: a \`"address.city"\` field surfaces as \`values()["address.city"]\`, NOT \`values().address.city\`. Convert at the backend boundary with \`nestValues(form.values())\`. (A NESTED declarative schema like \`z.object({ address: z.object({…}) })\` DOES work — its \`address.city\` error auto-splits to the leaf field — but until typed deep-path inference lands it needs an \`as never\` cast, since \`schema\` is typed against the flat keys)`,
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

  'form/FormValues': {
    signature: 'type FormValues<F> // FormState<V> | UseFormOptions<V> → V',
    example: `const form = useForm({ initialValues: { email: '', age: 0 }, onSubmit: () => {} })
type Values = FormValues<typeof form> // { email: string; age: number }`,
    notes: 'Derive the `TValues` shape from a form — accepts BOTH the `useForm` RETURN (`FormState<V>`) and the `useForm` OPTIONS (`UseFormOptions<V>`), so a generic wrapper can derive the value shape from whichever it holds instead of threading a second type parameter. Type-only, zero runtime bytes. See also: FieldNames, FieldValue, useForm.',
    mistakes: `- Passing a plain object type — \`FormValues<{ email: string }>\` is \`never\`; the input is the FORM (or its options), not the values themselves
- Fields added at runtime via \`registerField()\` are not in the static shape — read those via \`getValues()[name]\``,
  },

  'form/FieldNames': {
    signature: 'type FieldNames<F> = keyof FormValues<F> & string',
    example: `type Names = FieldNames<typeof form> // 'email' | 'age'
function focusField(name: FieldNames<typeof form>) { /* … */ }`,
    notes: `The field-name union of a form. Dot-path leaf fields keep their FLAT keys ('address.city' stays ONE field name — the form's value model is flat by design). Type-only, zero runtime bytes. See also: FormValues, FieldValue.`,
    mistakes: `- Expecting 'address.city' to split into nested names — dot-path leaves are first-class FLAT field names in @pyreon/form`,
  },

  'form/FieldValue': {
    signature: 'type FieldValue<F, K extends FieldNames<F>>',
    example: `type Age = FieldValue<typeof form, 'age'> // number`,
    notes: 'The value type of ONE field of a form, by field name — `FieldValue<typeof form, "age">` is `number`. The key is constrained to the real field names, so a typo is a compile error. Type-only, zero runtime bytes. See also: FormValues, FieldNames.',
    mistakes: '- A mistyped field name fails typecheck by design — that is the feature, not a bug to cast around',
  },

  'form/NestValues': {
    signature: 'type NestValues<T extends Record<string, unknown>> // flat dot-path shape → nested payload shape',
    example: `const form2 = useForm({
  initialValues: { name: '', 'address.city': '', 'address.zip': '' },
  onSubmit: (values) => {
    const payload = nestValues(values) as NestValues<typeof values>
    // payload: { name: string; address: { city: string; zip: string } }
  },
})`,
    notes: `Type-level companion of the runtime \`nestValues()\`: convert a FLAT dot-path value shape (\`{ 'address.city': string }\`) to its NESTED payload shape (\`{ address: { city: string } }\`). STANDALONE and opt-in by design — \`useForm\`/\`values()\`/\`onSubmit\` deliberately keep the FLAT keys (threading a nested shape through the form signature breaks generic wrappers like \`@pyreon/feature\`); use this to type YOUR OWN API boundary. Recursion follows the dot count (realistic keys ≤ 6 segments are fine). Type-only, zero runtime bytes. See also: FormValues, useForm.`,
    mistakes: `- Expecting \`useForm\` itself to expose nested values — the value model is FLAT end-to-end; \`NestValues\` types the \`nestValues()\` boundary you own
- Numeric segments (\`"tags.0"\`) type as an indexed OBJECT while the runtime builds a real ARRAY — cast at the boundary if you rely on array methods
- Declaring both an object field (\`address\`) AND a leaf (\`"address.city"\`) — the type unions at the \`address\` key and the form dev-warns; pick one shape
- Applying it to already-nested values — it is flat-in/nested-out; a keyless-dot shape passes through unchanged`,
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
    signature: '(props: QueryErrorResetBoundaryProps) => VNode',
    example: `<QueryErrorResetBoundary>
  <ErrorBoundary
    fallback={(err, retry) => {
      const { reset } = useQueryErrorResetBoundary()
      return <button onClick={() => { reset(); retry() }}>Retry</button>
    }}
  >
    <QuerySuspense query={q}>{() => <Data />}</QuerySuspense>
  </ErrorBoundary>
</QueryErrorResetBoundary>`,
    notes: 'Resets errored queries inside its subtree when a sibling `ErrorBoundary` recovers. Wrap around a `QuerySuspense` + `ErrorBoundary` pair to get clean retry semantics — without this, a recovered `ErrorBoundary` re-renders children but the queries still hold their error state, so the boundary immediately catches the same error again (infinite error loop). Takes a normal child subtree (its `children` is `VNodeChild`, NOT a render prop); reach for the reset action via `useQueryErrorResetBoundary()` inside the `ErrorBoundary` fallback. See also: QuerySuspense.',
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

  'query/QueryData': {
    signature: 'type QueryData<R> // UseQueryResult<D> → D; infinite results → InfiniteData<D>',
    example: `const posts = useQuery(() => ({ queryKey: ['posts'], queryFn: fetchPosts }))
type Posts = QueryData<typeof posts> // Post[]
function render(rows: QueryData<typeof posts>) { /* … */ }`,
    notes: `The RESOLVED data type of a query result — \`QueryData<typeof posts>\` is \`Post[]\` for a \`useQuery\` result, \`InfiniteData<Page>\` for infinite results. Never includes \`undefined\` (that's the loading-state artifact on the \`data\` SIGNAL, not part of the resolved shape). Unwraps the Pyreon ADAPTER's fine-grained result bags (UseQueryResult / UseSuspenseQueryResult / UseInfiniteQueryResult / UseSuspenseInfiniteQueryResult) — for tagged query-KEY inference TanStack's own \`InferDataFromTag\` covers the upstream story and is deliberately not duplicated. Type-only, zero runtime bytes. See also: QueryError, useQuery, useInfiniteQuery.`,
    mistakes: `- \`SignalValue<typeof posts.data>\` gives \`Post[] | undefined\` — QueryData strips the loading-state \`undefined\` because you want the RESOLVED shape
- Passing options instead of the result — QueryData unwraps the RESULT object \`useQuery\` returns, not the options function
- Expecting page-array access on infinite data — the derived type is \`InfiniteData<Page>\` (\`{ pages, pageParams }\`), matching TanStack semantics`,
  },

  'query/QueryError': {
    signature: 'type QueryError<R> // UseQueryResult<D, E> → E',
    example: 'type PostsError = QueryError<typeof posts> // Error',
    notes: `The ERROR type of a query result (the \`TError\` generic — TanStack's \`DefaultError\`, i.e. \`Error\`, unless narrowed at the hook). Type-only, zero runtime bytes. See also: QueryData, useQuery.`,
    mistakes: '- The error SIGNAL reads `E | null` — QueryError is the error type itself; handle the null at the read site',
  },
  // <gen-docs:api-reference:end @pyreon/query>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/hooks
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/hooks>

  'hooks/useControllableState': {
    signature: '<T>(opts: { value: () => T | undefined; defaultValue: T; onChange?: (v: T) => void }) => [() => T, (next: T | ((prev: T) => T)) => void]',
    example: `function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,           // controlled — function so the signal read tracks
    defaultValue: props.defaultChecked ?? false,  // uncontrolled initial — plain value
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{checked() ? 'on' : 'off'}</button>
}`,
    notes: 'Canonical controlled/uncontrolled state pattern. Returns a `[getValue, setValue]` tuple where the getter reads the controlled `value()` when defined, else an internal signal, and the setter mutates the internal signal when uncontrolled and always fires `onChange`. Used by every primitive in `@pyreon/ui-primitives`. Never reimplement the `isControlled + signal + getter` shape by hand. `value` MUST be a FUNCTION so the controlled prop is read reactively; `defaultValue` is a PLAIN value (captured once as the uncontrolled initial). Controlled-vs-uncontrolled is detected once at setup from whether `value()` is defined. See also: useToggle, useCounter, usePrevious.',
    mistakes: `- Passing \`value: props.checked\` (not a function) — loses reactivity on prop changes; pass \`value: () => props.checked\`
- Passing \`defaultValue\` as a getter (\`() => false\`) — it is a plain value stored once into the internal signal; a function would be stored as the value itself
- Mutating the returned signal directly with \`.set()\` instead of using the returned setter — bypasses the controlled-mode / onChange handling`,
  },

  'hooks/useEventListener': {
    signature: '<K extends keyof WindowEventMap>(event: K, handler: (e: WindowEventMap[K]) => void, options?: boolean | AddEventListenerOptions, target?: () => EventTarget | null) => void',
    example: `useEventListener('resize', () => layoutSig.set(measure()))
useEventListener('keydown', (e) => {
  if (e.key === 'Escape') setOpen(false)
})
// A specific element via the 4th (target) argument, resolved once at setup:
useEventListener('click', onDocClick, {}, () => document)`,
    notes: `Register a DOM event listener with automatic cleanup on unmount. Signature is \`(event, handler, options?, target?)\` — event FIRST, and \`target\` is the optional last argument, a getter resolved ONCE at setup (defaults to \`window\`). Use this instead of raw \`addEventListener\` in primitives — never \`addEventListener\` / \`removeEventListener\` directly in component code (the cleanup is the hook's whole job). SSR-safe: no-ops on the server. See also: useClickOutside, useKeyboard.`,
    mistakes: `- Using raw \`addEventListener\` instead of \`useEventListener\` — you lose automatic \`onUnmount\` cleanup
- Passing the target FIRST (\`useEventListener(window, "resize", fn)\`) — the signature is event-first; the target is the optional 4th argument
- Expecting the \`target\` getter to re-bind reactively — it is resolved ONCE at setup, so a ref that is still null then falls back to \`window\`; attach to a stable target or read a ref that is populated by setup time`,
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
    notes: 'Reactive element size via `ResizeObserver`. Returns `Signal<{ width, height }>` that updates whenever the observed element resizes. SSR-safe (returns `{ width: 0, height: 0 }` until mount). See also: useWindowResize.',
  },

  'hooks/useFocusTrap': {
    signature: '(getEl: () => HTMLElement | null, options?: { active?: boolean | (() => boolean); initialFocus?: boolean | string | HTMLElement | (() => HTMLElement | null) } | boolean | (() => boolean)) => void',
    example: `// Reactive arming + move focus to the first field on open.
const modalRef = signal<HTMLElement | null>(null)
useFocusTrap(() => modalRef(), { active: () => isOpen(), initialFocus: true })
useFocusReturn(() => isOpen())   // returns focus to the opener on close

// Or the single-arg form: inert while getEl() is null, no focus move.
useFocusTrap(() => modalRef())`,
    notes: 'Trap Tab/Shift+Tab focus inside the element returned by `getEl()`. Required for modals / drawers / fullscreen overlays to be keyboard-accessible. The getter is read live on every Tab, so the trap is INERT while `getEl()` returns null — render the trapped element conditionally and it turns on/off with it. The optional 2nd argument arms the trap reactively WITHOUT unmounting (`active: () => isOpen()`, or the positional shorthand `useFocusTrap(getEl, () => isOpen())` — while inactive the keydown listener is removed) and moves focus INTO the container on activation (`initialFocus: true` for the first tabbable, or a selector / element / getter; default is no focus move, backward-compatible). The focusable query is spec-grade — it includes `contenteditable`, `audio`/`video[controls]`, and `details > summary`; filters `display:none` / `visibility:hidden` / `[hidden]` / `inert` / disabled / zero-size nodes (via `checkVisibility` in real browsers); and orders positive-`tabindex` first. The trap only acts while focus is actually inside its container, so nested traps do not fight. Restoring focus to the trigger on close is a SEPARATE concern — use `useFocusReturn`. See also: useFocusReturn, useScrollLock, useDialog, useClickOutside.',
    mistakes: `- Keeping the element permanently mounted (e.g. \`display: none\`) and expecting the trap to disable when hidden — either unmount it (so \`getEl()\` returns null) or pass \`active: () => isOpen()\` to disarm the listener without unmounting; visibility alone does not gate it
- Expecting the trap to MOVE focus into the container on open — by default it only cycles Tab at the edges. Pass \`initialFocus: true\` (or a selector / element / getter) to place focus on activation, and pair with \`useFocusReturn\` to restore it on close
- Expecting it to also RETURN focus to the trigger on close — that is useFocusReturn; useFocusTrap only cycles Tab within the container`,
  },

  'hooks/useFocusReturn': {
    signature: '(isOpen: () => boolean, options?: { returnTo?: () => HTMLElement | null }) => void',
    example: `const open = signal(false)
useFocusReturn(() => open())               // focus returns to the opener on close
useFocusTrap(() => dialogRef())            // focus is trapped while the dialog is present`,
    notes: 'The companion to useFocusTrap: captures the focused element (the trigger) when `isOpen()` flips true and restores focus to it when `isOpen()` flips false — so keyboard / screen-reader users return to where they were when an overlay closes, instead of the top of the page. Pass `returnTo` when the trigger may have unmounted by close time. SSR-safe (no-op on the server), self-cleaning (the watcher is removed on unmount). See also: useFocusTrap, useScrollLock, useDialog.',
    mistakes: `- Passing the open state as a plain boolean instead of a getter — \`useFocusReturn(open())\` reads it once and never tracks the transition; pass \`() => open()\`.
- Expecting it to move focus INTO the overlay on open — that is useFocusTrap / autofocus. useFocusReturn only handles the RETURN on close.`,
  },

  'hooks/useBreakpoint': {
    signature: '(breakpoints?: Record<string, number>) => () => string',
    example: `const bp = useBreakpoint()
{() => bp() === 'lg' || bp() === 'xl' ? <DesktopNav /> : <MobileNav />}`,
    notes: 'Returns a reactive accessor for the currently active breakpoint NAME (`() => string` — e.g. `"xs"` / `"sm"` / `"md"` / `"lg"` / `"xl"`), driven by the **theme** breakpoints, not raw media queries — reads `theme.breakpoints` so swapping themes (or unit systems) Just Works. Compare the read against a name; use `useMediaQuery` for one-off arbitrary queries. See also: useMediaQuery.',
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
    signature: '(options?: { timeout?: number }) => { copy: (text: string) => Promise<boolean>; copied: () => boolean; text: () => string }',
    example: `const { copy, copied } = useClipboard()
<button onClick={() => copy(token)}>{copied() ? 'Copied!' : 'Copy'}</button>`,
    notes: '`navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `options.timeout` ms (default 2000). `copy` resolves `true` on success / `false` on failure (never throws). `text()` is the last successfully-copied string. Use the `copied` signal to flash a "Copied!" UI cue without manual timer management. See also: useDialog, useOnline.',
    mistakes: '- Passing a bare number (`useClipboard(3000)`) — the argument is an options object: `useClipboard({ timeout: 3000 })`',
  },

  'hooks/useDialog': {
    signature: '(options?: { onClose?: () => void }) => { open: () => boolean; show: () => void; showModal: () => void; close: () => void; toggle: () => void; ref: (el: HTMLDialogElement | null) => void }',
    example: `const dialog = useDialog()
<button onClick={dialog.showModal}>Open</button>
<dialog ref={dialog.ref}><button onClick={dialog.close}>Close</button></dialog>`,
    notes: 'Native `<dialog>` element wrapper. `open` is the reactive OPEN-STATE signal (call it to read: `dialog.open()`); `show()` opens non-modal, `showModal()` opens with backdrop + focus, `close()` closes, `toggle()` flips. Wires the native `close` event so `open` stays in sync (and fires `options.onClose`) when the user presses Escape. See also: useFocusTrap, useScrollLock.',
    mistakes: `- Using \`dialog.open\` as an OPENER — it is the open-STATE signal, not a method; open with \`dialog.show()\` / \`dialog.showModal()\`
- Rendering the \`<dialog>\` behind a conditional \`<Show>\` — it must be in the initial render so the ref callback binds before you call \`showModal()\``,
  },

  'hooks/useTimeAgo': {
    signature: '(date: Date | (() => Date), opts?: UseTimeAgoOptions) => Signal<string>',
    example: `const sent = useTimeAgo(message.sentAt)
<span>{sent}</span>`,
    notes: 'Reactive "5 minutes ago" / "in 2 hours" relative-time string. Auto-updates on a sensible interval (every minute under an hour, every hour under a day, etc.) so the UI stays accurate without manual scheduling. Cleans up the interval on unmount. See also: useInterval, useDebouncedValue.',
  },

  'hooks/useInfiniteScroll': {
    signature: '(onLoadMore: () => void | Promise<void>, opts?: { threshold?: number; loading?: () => boolean; hasMore?: () => boolean; direction?: "up" | "down" }) => { ref: (el: HTMLElement | null) => void; triggered: () => boolean }',
    example: `const { ref, triggered } = useInfiniteScroll(loadNextPage, { threshold: 200, loading: () => loading(), hasMore: () => hasMore() })
<div ref={ref} style={{ overflowY: 'auto', height: '400px' }}>
  <For each={items()} by={(i) => i.id}>{(item) => <Row data={item} />}</For>
</div>`,
    notes: '`IntersectionObserver`-based infinite loading. Attach the returned `ref` to the SCROLL CONTAINER — the hook injects an invisible sentinel at the boundary; when it scrolls into view, `onLoadMore` fires. `triggered()` reflects whether the sentinel is currently visible. `loading` (skip while a load is in flight) and `hasMore` (stop once the last page is reached) are accessor guards; `threshold` is the px distance from the edge (default 100), `direction` picks the top/bottom boundary (default `down`). See also: useIntersection, useWindowScroll.',
    mistakes: `- Attaching \`ref\` to the sentinel instead of the scroll CONTAINER — the hook creates its own sentinel; \`ref\` goes on the scrollable element
- A container with \`overflow: hidden\` and no scroll — the injected sentinel is always clipped, so IntersectionObserver never fires
- Forgetting \`hasMore: () => hasMore()\` — the hook keeps calling \`onLoadMore\` even after the last page`,
  },

  'hooks/useMergedRef': {
    signature: '<T>(...refs: (Ref<T> | RefCallback<T> | null | undefined)[]) => RefCallback<T>',
    example: `const localRef = ref<HTMLDivElement>()
const merged = useMergedRef(localRef, props.ref)
<div ref={merged}>...</div>`,
    notes: 'Combine multiple refs into a single callback ref — used when forwarding `props.ref` while also keeping a local ref to the same element. Each provided ref (callback or object) receives the element on mount and `null` on unmount. See also: useEventListener.',
  },

  'hooks/useUpdateEffect': {
    signature: '<T>(source: () => T, callback: (newVal: T, oldVal: T | undefined) => void | (() => void)) => void',
    example: `useUpdateEffect(() => value(), (val) => api.save(val))
// Doesn't fire on initial mount — only on subsequent value changes`,
    notes: `Watch-style effect that skips the initial run — tracks \`source\` and fires \`callback(newVal, oldVal)\` only when \`source\`'s value changes *after* mount (\`oldVal\` is \`undefined\` on the first change). Use for "save on change but not on first render" patterns where the initial value is already persisted. Note the argument order is \`(source, callback)\` — NOT React's \`(effect, deps)\`. See also: useIsomorphicLayoutEffect.`,
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

  'hooks/useCounter': {
    signature: '(initial?: number, opts?: { min?: number; max?: number }) => { count: Signal<number>; inc: (d?: number) => void; dec: (d?: number) => void; set: (v: number) => void; reset: () => void }',
    example: `const { count, inc, dec, reset } = useCounter(0, { min: 0, max: 10 })
<button onClick={() => dec()}>-</button><span>{count}</span><button onClick={() => inc()}>+</button>`,
    notes: 'Reactive numeric counter — the numeric companion to useToggle. `inc` / `dec` step by `d` (default 1), `set` assigns absolutely, `reset` returns to the initial value; every write is clamped into `[min, max]` when bounds are given (the initial value is clamped too). `count` is the reactive value signal. See also: useToggle, useControllableState.',
    mistakes: `- Calling the exposed \`count\` signal's \`.set()\` directly to bypass clamping — use \`set()\` / \`inc()\` / \`dec()\` so \`min\`/\`max\` are enforced`,
  },

  'hooks/useWindowScroll': {
    signature: '() => { position: () => { x: number; y: number }; scrollTo: (o: { x?: number; y?: number; behavior?: ScrollBehavior }) => void }',
    example: `const { position, scrollTo } = useWindowScroll()
<Show when={() => position().y > 400}>
  <button onClick={() => scrollTo({ y: 0, behavior: 'smooth' })}>Top</button>
</Show>`,
    notes: 'Track the window scroll offset reactively via a passive `scroll` listener (auto-removed on unmount), plus an SSR-safe imperative `scrollTo` (omitted axes keep their current value). Use for scroll-to-top buttons, scroll-progress bars, sticky-header reveal, parallax. SSR-safe: `position()` is `{ x: 0, y: 0 }` on the server. See also: useElementSize, useInfiniteScroll, useIntersection.',
  },

  'hooks/useDocumentVisibility': {
    signature: '() => () => "visible" | "hidden"',
    example: `const visibility = useDocumentVisibility()
effect(() => { visibility() === 'hidden' ? pausePolling() : resumePolling() })`,
    notes: `Track the Page Visibility state (\`document.visibilityState\`) reactively — \`"hidden"\` when the tab is backgrounded/minimized, \`"visible"\` otherwise. Use it to pause work the user can't see (polling, video, animations, expensive timers) and resume on return. SSR-safe (returns \`"visible"\` on the server); the \`visibilitychange\` listener is removed on unmount. See also: useOnline, useIdle.`,
  },

  'hooks/useIdle': {
    signature: '(timeoutMs?: number, opts?: { events?: readonly string[]; initialState?: boolean }) => () => boolean',
    example: `const idle = useIdle(30_000)
effect(() => { if (idle()) showAwayBanner() })`,
    notes: 'Reactive user-idle detection — `true` once no activity event (pointer / key / scroll / wheel by default) has fired for `timeoutMs` (default 60000), back to `false` on the next interaction. Every listener and the timer are removed on unmount. Use for auto-logout, "are you still there?" prompts, presence away-status, pausing background work. SSR-safe (listeners register in `onMount`). See also: useDocumentVisibility, useInterval, useOnline.',
    mistakes: '- Expecting it to fire once — `idle` is a live boolean signal that flips false again on the next activity event; read it reactively',
  },

  'hooks/useToggle': {
    signature: 'useToggle(initial?: boolean) => { value: () => boolean; toggle: () => void; setTrue: () => void; setFalse: () => void }',
    example: `const menu = useToggle()
<button onClick={menu.toggle}>Menu</button>
<Show when={() => menu.value()}>…</Show>`,
    notes: 'Boolean signal with named controls. Returns an OBJECT (not a tuple): `value` is a signal accessor, plus `toggle` / `setTrue` / `setFalse` mutators. For a numeric counter use `useCounter`. See also: useCounter, useDialog.',
    mistakes: `- Destructuring it as a tuple (\`const [open, toggle] = useToggle()\`) — it returns an OBJECT \`{ value, toggle, setTrue, setFalse }\`; destructure by name.
- Reading \`value\` without calling it — \`value\` is a signal accessor; read \`value()\` inside a reactive scope.`,
  },

  'hooks/useHover': {
    signature: 'useHover() => { hovered: () => boolean; props: { onMouseEnter: () => void; onMouseLeave: () => void } }',
    example: `const h = useHover()
<div {...h.props}>{() => h.hovered() ? 'Hovering' : 'Idle'}</div>`,
    notes: 'Track hover state. Returns a `hovered` signal accessor plus `props` you SPREAD onto the target element — the hook does not auto-attach any listener. See also: useFocus, useEventListener.',
    mistakes: `- Forgetting to spread \`props\` onto the element — nothing updates without it (the hook attaches no listeners itself).
- Expecting it to fire on touch — it uses \`onMouseEnter\`/\`onMouseLeave\` only, so it does not react on touch devices.`,
  },

  'hooks/useFocus': {
    signature: 'useFocus() => { focused: () => boolean; props: { onFocus: () => void; onBlur: () => void } }',
    example: `const f = useFocus()
<input {...f.props} />`,
    notes: 'Track focus state. Returns a `focused` signal accessor plus `props` (onFocus/onBlur) to SPREAD onto the element — no auto-attach. See also: useHover, useFocusTrap.',
    mistakes: '- Forgetting to spread `props` — the hook registers no listeners itself; without the spread `focused` never changes.',
  },

  'hooks/useMediaQuery': {
    signature: 'useMediaQuery(query: string) => () => boolean',
    example: `const isWide = useMediaQuery('(min-width: 768px)')
<Show when={() => isWide()}><Sidebar /></Show>`,
    notes: 'Reactive `matchMedia`. Returns a `matches` signal accessor; subscribes to the media query on mount and updates on change (listener auto-removed on unmount). See also: useColorScheme, useReducedMotion, useBreakpoint.',
    mistakes: `- Expecting a correct value on the FIRST render / during SSR — the signal is seeded \`false\` and only corrected in \`onMount\`, so the first render always reads \`false\` even if the query would match. Gate visual differences to avoid a flash.
- Reading it without calling the accessor — \`useMediaQuery(q)\` returns \`() => boolean\`; call it in a reactive scope.`,
  },

  'hooks/useColorScheme': {
    signature: `useColorScheme() => () => 'light' | 'dark'`,
    example: `const scheme = useColorScheme()
<body data-theme={() => scheme()} />`,
    notes: `Reactive OS color-scheme accessor — \`computed\` over \`(prefers-color-scheme: dark)\` (wraps \`useMediaQuery\`). Returns \`'dark'\` / \`'light'\`. See also: useMediaQuery, useReducedMotion.`,
    mistakes: `- Reads \`'light'\` on the first render / SSR regardless of OS preference — it inherits \`useMediaQuery\`'s seed-then-correct-on-mount behavior. Use a pre-paint script for a flash-free initial theme.
- Returns an accessor — call \`scheme()\` to read.`,
  },

  'hooks/useSizeClass': {
    signature: `useSizeClass() => () => 'compact' | 'regular'`,
    example: `const size = useSizeClass()
<Show when={() => size() === 'regular'}><TwoColumn /></Show>`,
    notes: `Reactive size-class accessor — \`computed\` over \`(min-width: 600px)\` (wraps \`useMediaQuery\`), mapping wide → \`'regular'\`, narrow → \`'compact'\` (the SwiftUI/Android size-class analog for shared multi-platform code). See also: useMediaQuery, useBreakpoint.`,
    mistakes: `- First render / SSR is always \`'compact'\` (inherits \`useMediaQuery\`'s pre-mount \`false\`).
- Returns an accessor — call \`size()\`.`,
  },

  'hooks/useReducedMotion': {
    signature: 'useReducedMotion() => () => boolean',
    example: `const reduced = useReducedMotion()
<Transition enter={() => reduced() ? '' : 'fade-in'}>…</Transition>`,
    notes: 'Reactive accessor for `(prefers-reduced-motion: reduce)` (a thin `useMediaQuery` wrapper). Gate animations on it for accessibility. See also: useMediaQuery, useColorScheme.',
    mistakes: `- First render / SSR reports \`false\` ("motion allowed") until \`onMount\` — inherits \`useMediaQuery\` seeding.
- Returns an accessor — call it.`,
  },

  'hooks/useOnline': {
    signature: 'useOnline() => () => boolean',
    example: `const online = useOnline()
<Show when={() => !online()}><OfflineBanner /></Show>`,
    notes: 'Reactive network status accessor — seeded from `navigator.onLine` (or `true` on the server), updated by `online`/`offline` window events. SSR-safe (guards on `isClient`); listeners auto-removed via `onCleanup`. See also: useDocumentVisibility, useIdle.',
    mistakes: `- Treating it as reliable connectivity — \`navigator.onLine\` only reflects the OS network interface, not real reachability; a captive portal or dead server still reads \`true\`.
- Returns an accessor — call \`online()\`.`,
  },

  'hooks/useIntersection': {
    signature: 'useIntersection(getEl: () => HTMLElement | null, options?: IntersectionObserverInit) => () => IntersectionObserverEntry | null',
    example: `let el!: HTMLElement
const entry = useIntersection(() => el)
<div ref={(e) => (el = e)}>{() => entry()?.isIntersecting ? 'visible' : 'hidden'}</div>`,
    notes: 'IntersectionObserver as a signal. On mount reads `getEl()` once and (if non-null) observes it, writing the latest entry into a signal it returns. Auto-disconnects on unmount. Returns `null` until the observer first fires. See also: useElementSize, useInfiniteScroll.',
    mistakes: `- \`getEl()\` is read ONCE in \`onMount\` — the element is not tracked reactively, so an element that mounts LATER or changes identity will not be observed. Ensure the ref is set before mount.
- Reading the accessor before the first observation — it is \`null\` until the observer fires; guard with \`entry()?.\`.`,
  },

  'hooks/usePrevious': {
    signature: 'usePrevious<T>(getter: () => T) => () => T | undefined',
    example: `const count = signal(0)
const prev = usePrevious(() => count())
// after count.set(5): prev() === 0`,
    notes: 'Track the previous value of a reactive read. Runs an `effect` over `getter()`; returns an accessor for the value from BEFORE the last change (`undefined` until the getter changes once). See also: useLatest, useUpdateEffect.',
    mistakes: `- Passing a plain value instead of a getter — \`usePrevious(count())\` snapshots once; pass \`() => count()\` so the effect tracks the signal.
- Reading \`prev()\` on first render — it is \`undefined\` until the tracked value changes at least once.`,
  },

  'hooks/useWindowResize': {
    signature: 'useWindowResize(debounceMs?: number) => () => { width: number; height: number }',
    example: `const size = useWindowResize()
<div>{() => size().width + '×' + size().height}</div>`,
    notes: 'Reactive window size accessor (default debounce 200ms). Seeded from `window.innerWidth/Height` (or `{0,0}` on the server); a debounced `resize` listener updates it (listener + pending timer cleaned up on unmount). See also: useElementSize, useWindowScroll, useBreakpoint.',
    mistakes: `- Expecting real dimensions on the first render / SSR — it seeds \`{ width: 0, height: 0 }\` on the server and until mount.
- Returns an accessor — call \`size()\`.`,
  },

  'hooks/useInterval': {
    signature: 'useInterval(callback: () => void, delay: number | null | (() => number | null)) => void',
    example: `const paused = signal(false)
useInterval(() => tick(), () => paused() ? null : 1000)`,
    notes: 'Declarative `setInterval`. A number sets a fixed interval, `null` PAUSES, and a getter `() => number | null` makes the delay REACTIVE (an effect restarts/pauses the timer when the returned value changes). Auto-cleared on unmount. Returns nothing. See also: useTimeout, useIdle.',
    mistakes: `- Passing \`delay: 0\` expecting a pause — use \`null\` to pause; \`0\` runs as fast as the event loop allows.
- Expecting a NUMBER delay to react to a signal — only the getter form (\`() => number | null\`) is reactive; a plain number is read once at setup.
- Relying on a fresh \`callback\` per render — the callback is captured once (Pyreon bodies run once); read reactive values INSIDE the callback.`,
  },

  'hooks/useTimeout': {
    signature: 'useTimeout(callback: () => void, delay: number | null) => { reset: () => void; clear: () => void }',
    example: `const t = useTimeout(() => hideToast(), 3000)
<div onMouseEnter={t.clear} onMouseLeave={t.reset}>…</div>`,
    notes: 'Declarative `setTimeout` that STARTS immediately at setup (fires once after `delay`ms unless `delay` is `null`). Returns `reset` (restart with the original delay) / `clear` (stop). Auto-cleared on unmount. See also: useInterval, useDebouncedValue.',
    mistakes: `- Expecting it to be lazy — it fires ON MOUNT automatically; pass \`delay: null\` to disable, or call \`clear()\`.
- \`callback\` and \`delay\` are captured once at setup — \`reset()\` reuses the original delay; there is no way to change the delay after creation.`,
  },

  'hooks/useDebouncedCallback': {
    signature: 'useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, delay: number) => T & { cancel: () => void; flush: () => void }',
    example: `const onSearch = useDebouncedCallback((q: string) => fetchResults(q), 300)
<input onInput={(e) => onSearch(e.target.value)} />`,
    notes: 'Returns a debounced wrapper that resets a timer on each call and invokes `callback` after `delay`ms of quiet, plus `.cancel()` (drop the pending call) and `.flush()` (invoke now with the last args). Pending timer auto-cancelled on unmount. See also: useThrottledCallback, useDebouncedValue.',
    mistakes: `- Relying on the "always latest callback" behavior the JSDoc claims — the callback is captured ONCE at setup (Pyreon component bodies run once), so read reactive values INSIDE the callback rather than expecting a new callback identity to take effect.
- Re-creating it per render in a loop — define it once at component setup; a fresh debouncer per call resets the timer every time.`,
  },

  'hooks/useThrottledCallback': {
    signature: 'useThrottledCallback<T extends (...args: any[]) => any>(callback: T, delay: number) => T & { cancel: () => void }',
    example: 'const onScroll = useThrottledCallback(() => updateParallax(), 16)',
    notes: 'Returns a throttled wrapper (rate-limited to once per `delay`ms; leading + trailing edge, latest-args) with a `.cancel()` method. Auto-cancelled on unmount. Use over debounce when you want steady updates during a continuous stream (scroll, drag). See also: useDebouncedCallback.',
    mistakes: `- Same "latest callback" caveat as \`useDebouncedCallback\` — the callback is captured once; read reactive values inside it.
- Reaching for throttle when you want the value to settle AFTER the burst — that is debounce (\`useDebouncedCallback\`); throttle fires DURING the burst at a fixed rate.`,
  },

  'hooks/useLatest': {
    signature: 'useLatest<T>(value: T) => { readonly current: T }',
    example: `const latest = useLatest(props.onSave)
// later, in a stale-closure-prone callback: latest.current?.()`,
    notes: 'Wraps `value` in a mutable `{ current }` ref object. Does NOT auto-update — it captures once (Pyreon bodies run once); the caller must update `.current` manually or pass a reactive getter as the value. See also: usePrevious.',
    mistakes: '- Expecting `.current` to auto-track a signal — it is set once from the argument. To keep it fresh, assign `latest.current = …` in an effect, or store a getter and call `latest.current()`.',
  },

  'hooks/useKeyboard': {
    signature: `useKeyboard(key: string, handler: (event: KeyboardEvent) => void, options?: { event?: 'keydown' | 'keyup'; target?: EventTarget }) => void`,
    example: `useKeyboard('Escape', () => closeModal())`,
    notes: 'Registers a `keydown` (or `keyup`) listener on `options.target` (default `document`) that fires `handler` only when `event.key === key`. Auto-removed on unmount. For app-wide shortcuts with modifiers, prefer `@pyreon/hotkeys`. See also: useEventListener, useClickOutside.',
    mistakes: `- Expecting modifier handling — it matches \`event.key\` EXACTLY (no Cmd/Ctrl/Shift logic); use \`@pyreon/hotkeys\` for chords.
- \`options\` (event / target) is read once at setup — a later change to the target is not re-bound.`,
  },

  'hooks/useScrollLock': {
    signature: 'useScrollLock() => { lock: () => void; unlock: () => void }',
    example: `const { lock, unlock } = useScrollLock()
onMount(() => { lock(); return unlock })`,
    notes: 'Lock/unlock body scroll (sets `document.body.style.overflow = "hidden"`). Uses a MODULE-LEVEL reference count so concurrent locks (nested modals) compose — the saved overflow restores only when the last lock releases. SSR-safe (both no-op on the server); an unmount while still locked auto-unlocks. See also: useDialog, useClickOutside.',
    mistakes: `- Expecting one instance to NEST — a per-instance \`isLocked\` guard makes repeat \`lock()\`/\`unlock()\` calls no-ops, so one instance holds at most ONE refcount unit (an extra \`unlock()\` can never release another component's lock); use a separate \`useScrollLock()\` per independently-lifecycled lock.
- Setting \`body { overflow }\` yourself while a lock is active — the hook restores the value captured at the 0→1 transition, clobbering your change on release.`,
  },

  'hooks/useHaptics': {
    signature: `useHaptics() => { impact: (style?: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => void; notification: (type: 'success' | 'warning' | 'error') => void; selection: () => void }`,
    example: `const haptics = useHaptics()
<button onClick={() => { haptics.impact('light'); submit() }}>Pay</button>`,
    notes: 'Imperative haptic feedback. Fire-and-forget methods that call `navigator.vibrate` on web (mapped patterns) and lower to native `PyreonHaptics` under PMTC. `impact` defaults to `medium`. See also: useShare, useNotifications.',
    mistakes: '- Expecting feedback on desktop / unsupported browsers — it silently no-ops when `navigator.vibrate` is absent (iOS Safari has no web vibrate); the real device feedback comes from the native PMTC target.',
  },

  'hooks/useShare': {
    signature: 'useShare() => { text: (text: string) => void; url: (url: string) => void; textUrl: (text: string, url: string) => void; canShare: () => boolean }',
    example: `const share = useShare()
<Show when={() => share.canShare()}>
  <button onClick={() => share.url(location.href)}>Share</button>
</Show>`,
    notes: 'Imperative Web Share API wrapper (lowers to native `PyreonShare` under PMTC). `canShare()` feature-detects `navigator.share`; the share methods no-op where it is unavailable. See also: useHaptics, useLinking.',
    mistakes: '- Expecting to detect a user CANCEL — the rejection from `navigator.share` is swallowed (no promise is returned), so a cancelled share surfaces nothing. Gate the button on `canShare()` and treat the call as fire-and-forget.',
  },

  'hooks/useLinking': {
    signature: 'useLinking() => { openUrl: (url: string) => void }',
    example: `const { openUrl } = useLinking()
<button onClick={() => openUrl('https://pyreon.dev')}>Docs</button>`,
    notes: 'Imperative external-link opener. `openUrl` calls `window.open(url, "_blank", "noopener,noreferrer")` on web and lowers to native `PyreonLinking` under PMTC. SSR-safe. See also: useShare.',
    mistakes: '- Expecting configurable target/features — it always opens a new tab with `noopener,noreferrer` hard-coded. For in-app navigation use `@pyreon/router`, not this.',
  },

  'hooks/useNotifications': {
    signature: 'useNotifications() => { requestPermission: () => void; notify: (title: string, body: string) => void }',
    example: `const notifications = useNotifications()
onMount(() => notifications.requestPermission())
notifications.notify('Done', 'Your export is ready')`,
    notes: 'Imperative LOCAL notifications (Web Notifications API; lowers to native `PyreonNotifications` under PMTC). `notify` auto-requests permission on first use; `requestPermission` prompts ahead of time. See also: useHaptics.',
    mistakes: `- Expecting \`notify\` to appear synchronously on first call — when permission is undecided it requests first and posts only AFTER the async grant (or never, if denied). Call \`requestPermission()\` ahead of time for immediate notifications.
- These are LOCAL notifications only — not push; there is no server/remote delivery.`,
  },

  'hooks/useFilePicker': {
    signature: 'useFilePicker() => { pick: () => Promise<string | null>; isAvailable: () => boolean }',
    example: `const files = useFilePicker()
const status = signal<'idle' | 'picked' | 'cancelled'>('idle')

<button onClick={async () => {
  const uri = await files.pick()
  status.set(uri === null ? 'cancelled' : 'picked')
}}>Pick a file</button>`,
    notes: 'Pick a document/file from the device — UIDocumentPickerViewController (iOS), the Storage Access Framework `OpenDocument` (Android), a hidden file input (web). The document sibling of `useImagePicker` (any file — a PDF, a `.csv`, a `.zip` — not just photos), and the THIRD async-result hook: `pick()` returns a `Promise<string | null>` you `await`, resolving a URI string or `null` when the user cancels; it never rejects. Under PMTC the async-await lowering wraps the awaiting handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`. Requires NO storage permission on either native platform — both system pickers run out of process and hand back only the chosen document, so there is no iOS entitlement and no Android runtime permission. Saving/exporting a file is a separate native flow and is intentionally out of scope (tracked follow-up). See also: useImagePicker, useShare.',
    mistakes: `- Testing the result for TRUTHINESS (\`uri ? … : …\`) instead of comparing to null (\`uri === null\`). JS truthiness is not a native Bool — the explicit null comparison is what PMTC lowers to \`uri == nil\` (Swift) / \`uri == null\` (Kotlin), and it is also correct on the web.
- Calling \`files.pick()\` WITHOUT \`await\` inside a plain (non-async) handler — it returns a \`Promise<string | null>\`, not a URI. Mark the handler \`async\` and \`await\` it (PMTC wraps that async handler in a native \`Task\`/coroutine scope; a sync action slot cannot await).
- Reaching for \`useFilePicker\` when you specifically want a PHOTO. Use \`useImagePicker\` — it opens the photo picker (\`PHPickerViewController\` / \`PickVisualMedia\`), which is a better UX for images than the general document browser.
- Treating the returned URI as a stable, persistable path. It is an opaque, platform-shaped, EPHEMERAL handle — a \`file://\` temp copy on iOS, a \`content://\` URI on Android, a \`blob:\` object URL on the web. Read it or upload it promptly; do not store it and expect it to resolve later.
- Requesting a storage permission before calling \`pick()\`. Neither platform needs one — asking is a policy liability (App Store / Play review scrutiny) for zero benefit, and is exactly what the out-of-process pickers exist to avoid.
- Expecting \`pick()\` to also SAVE/write a file. It only opens (reads) a document; writing/exporting is a separate native flow (iOS export picker, Android \`CreateDocument\` + a write step) and a tracked follow-up.`,
  },

  'hooks/useImagePicker': {
    signature: 'useImagePicker() => { pick: () => Promise<string | null>; isAvailable: () => boolean }',
    example: `const picker = useImagePicker()
const status = signal<'idle' | 'picked' | 'cancelled'>('idle')

<button onClick={async () => {
  const uri = await picker.pick()
  status.set(uri === null ? 'cancelled' : 'picked')
}}>Pick a photo</button>`,
    notes: `Pick an image from the device's photo library — PHPickerViewController (iOS), the Android Photo Picker (\`PickVisualMedia\`), a hidden file input (web). The SECOND async-result hook (after \`useBiometrics\`): \`pick()\` returns a \`Promise<string | null>\` you \`await\`, resolving a URI string or \`null\` when the user cancels; it never rejects. Under PMTC the async-await lowering wraps the awaiting handler in a Swift \`Task { … }\` / Kotlin \`pyreonAsyncScope.launch { … }\`. Requires NO photo-library permission on either native platform — both system pickers run out of process and hand back only the chosen asset, so there is no Info.plist usage description and no Android runtime permission to request. See also: useBiometrics, useShare.`,
    mistakes: `- Testing the result for TRUTHINESS (\`uri ? … : …\`) instead of comparing to null (\`uri === null\`). JS truthiness is not a native Bool — the explicit null comparison is what PMTC lowers to \`uri == nil\` (Swift) / \`uri == null\` (Kotlin), and it is also correct on the web (an empty-string URI is not a cancellation).
- Calling \`picker.pick()\` WITHOUT \`await\` inside a plain (non-async) handler — it returns a \`Promise<string | null>\`, not a URI. Mark the handler \`async\` and \`await\` it (PMTC wraps that async handler in a native \`Task\`/coroutine scope; a sync action slot cannot await).
- Treating the returned URI as a stable, persistable path. It is an opaque, platform-shaped, EPHEMERAL handle — a \`file://\` temp copy on iOS, a \`content://\` URI on Android, a \`blob:\` object URL on the web. Hand it to an image view or an upload; do not store it and expect it to resolve later.
- Requesting a photo-library permission before calling \`pick()\`. Neither platform needs one — asking for it is a policy liability (App Store / Play review scrutiny) for zero benefit, and is exactly what the out-of-process pickers exist to avoid.
- Expecting a cancellation to reject. It resolves \`null\`, so a \`try/catch\` around \`pick()\` will never see the cancel path — branch on the result instead.
- Forgetting to revoke the web object URL when picking repeatedly in a long-lived view. The web fallback returns \`URL.createObjectURL(file)\`; call \`URL.revokeObjectURL(uri)\` once the image is no longer displayed if you pick many times, or the blobs accumulate for the page lifetime.`,
  },

  'hooks/useBiometrics': {
    signature: 'useBiometrics() => { authenticate: (reason: string) => Promise<boolean>; isAvailable: () => boolean }',
    example: `const bio = useBiometrics()
const status = signal<'idle' | 'unlocked' | 'denied'>('idle')

<button onClick={async () => {
  const ok = await bio.authenticate('Unlock your vault')
  status.set(ok ? 'unlocked' : 'denied')
}}>Unlock</button>`,
    notes: 'A biometric authentication gate — Face ID / Touch ID (iOS `LAContext`), BiometricPrompt (Android), feature-detected on the web. The FIRST @pyreon/hooks service with an ASYNC RESULT: `authenticate(reason)` returns a `Promise<boolean>` you `await`. Under PMTC this lowers to the native biometric APIs, and the async-await lowering wraps the awaiting handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`. WEB v1: a real assertion is a WebAuthn ceremony (needs a server-issued challenge + a registered credential), so the web `authenticate` resolves `false` and `isAvailable` feature-detects `window.PublicKeyCredential` — native is the primary target. See also: useNotifications, useShare.',
    mistakes: `- Calling \`bio.authenticate(...)\` WITHOUT \`await\` inside a plain (non-async) handler — it returns a \`Promise<boolean>\`, not a boolean, so the gate never applies. Mark the handler \`async\` and \`await\` the result (PMTC wraps that async handler in a native \`Task\`/coroutine scope).
- Expecting the WEB \`authenticate\` to actually authenticate — v1 resolves \`false\` (a real WebAuthn assertion needs a server challenge + a registered credential, out of scope for a client-only hook). For web biometric auth drive the WebAuthn API with your backend; the native paths (Face ID / Touch ID / BiometricPrompt) are the real gate.
- Treating a \`false\` result as an error — \`authenticate\` never rejects; failure, cancellation, and an unavailable / unenrolled device all resolve \`false\`. Branch on the boolean, do not wrap it in \`try/catch\`.`,
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
    signature: 'can.assert(key: string, context?: unknown, message?: string) => void',
    example: `// in a route loader / server action:
can.assert('posts.delete', post) // throws "[Pyreon] permission denied: 'posts.delete'"
can.assert('billing.export', undefined, 'Upgrade your plan to export') // custom message
await deletePost(post)`,
    notes: `Throw if a permission is NOT granted — the imperative companion to the reactive \`can()\` check, for route loaders, navigation guards, and server actions where a denial must halt execution. Throws a \`[Pyreon]\`-prefixed error — a custom \`message\`, or \`permission denied: '<key>'\` by default; returns void when granted. Evaluates predicates + wildcards exactly like \`can()\`. See also: createPermissions.`,
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
    notes: 'Create a reactive state machine. The returned machine reads like a signal (`machine()` returns the current state string) and transitions via `machine.send(event, payload?)`. States and events are type-safe — TypeScript infers the union from the config object. Guards enable conditional transitions with typed payloads. Beyond named events, states support eventless `always` transitions (transient/condition states that resolve synchronously), `final: true` terminal states (`isFinal()` + `onDone()`), and full lifecycle listeners (`onEnter` / `onExit` / `onTransition` / `onDone`). `send(event, payload?)` returns the settled state (after any `always` cascade), and `can(event, payload?)` predicts `send` exactly — both evaluate guards throw-safely (a guard that throws denies the transition rather than crashing). No built-in context or effects — use Pyreon signals and `effect()` alongside the machine for data and side effects. See also: Machine, MachineConfig.',
    mistakes: `- Treating \`machine.can(event)\` (no payload) as "is this event declared?" — it now PREDICTS \`send\` exactly by evaluating the guard (throw-safe → denied), so a guarded event with no/invalid payload reports \`false\`
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

  'machine/Machine.matches / nextEvents / reset / dispose': {
    signature: 'matches(...states: S[]) => boolean — nextEvents() => E[] — reset() => void — dispose() => void',
    example: `m.matches('loading', 'error')  // in loading OR error (reactive)
m.nextEvents()                 // ['FETCH', 'CANCEL'] — declared events from here
m.reset()                      // back to initial (+ its always cascade)
m.dispose()                    // drop all listeners`,
    notes: `The instance query + control surface (all reactive where noted). \`matches(...states)\` — reactive; true when the current state is ANY of the given (a variadic OR: \`matches("loading", "error")\`). \`nextEvents()\` — reactive; the current state's DECLARED \`on\` event keys (does NOT evaluate guards and does NOT include eventless \`always\`). \`reset()\` — set the state back to \`initial\` and re-run the initial \`always\` cascade. \`dispose()\` — remove ALL lifecycle listeners (\`onEnter\`/\`onExit\`/\`onTransition\`/\`onDone\`) and clean up. See also: createMachine.`,
    mistakes: `- \`matches("a", "b")\` is an OR, not an AND — it is true when the current state is \`a\` OR \`b\`. A machine is in exactly one state, so an AND across two states is never true.
- Reading \`nextEvents()\` as "events that would currently SUCCEED" — it returns the current state's DECLARED \`on\` keys WITHOUT evaluating guards, and excludes eventless \`always\`. Use \`can(event, payload?)\` to test whether a specific event would actually transition.
- Expecting \`reset()\` to land on the LITERAL \`initial\` when that state has an \`always\` — reset re-runs the initial cascade, so a transient initial resolves to its cascade target (never the transient state itself).
- Expecting \`dispose()\` to stop or freeze the machine — it only removes listeners; \`send()\` still transitions the state afterward (now silently). Drop your references to let it GC.`,
  },

  'machine/StateOf': {
    signature: 'type StateOf<M> // Machine<S, E> → S; raw config → InferStates',
    example: `const light = createMachine({
  initial: 'green',
  states: { green: { on: { NEXT: 'yellow' } }, yellow: { on: { NEXT: 'red' } }, red: {} },
})
type LightState = StateOf<typeof light> // 'green' | 'yellow' | 'red'`,
    notes: 'The STATE union of a machine — accepts BOTH the machine INSTANCE (`createMachine(...)` return) and a raw config object (delegates to `InferStates` for configs), so you derive from whichever you hold. Type-only, zero runtime bytes. See also: EventOf, InferStates, createMachine.',
    mistakes: `- Passing a config NOT declared \`as const\` (or through \`createMachine\`, which uses a const generic) — state names widen to \`string\` and the union is lost
- \`StateOf<ReturnType<typeof createMachine>>\` gymnastics on a concrete machine — \`typeof light\` is enough`,
  },

  'machine/EventOf': {
    signature: 'type EventOf<M> // Machine<S, E> → E; raw config → InferEvents',
    example: `type LightEvent = EventOf<typeof light> // 'NEXT'
function dispatch(e: EventOf<typeof light>) { light.send(e) }`,
    notes: `The EVENT union of a machine — instance or raw config (delegates to \`InferEvents\`, which unions every state's \`on\` keys; states without \`on\` contribute nothing). Useful for typing event-dispatching wrappers: \`send(e: EventOf<typeof m>)\`. Type-only, zero runtime bytes. See also: StateOf, InferEvents, createMachine.`,
    mistakes: `- Expecting per-STATE narrowing — the union covers ALL states' events; \`machine.can(event)\` is the runtime per-state check`,
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
    notes: 'Create a reactive signal backed by localStorage. Reads the stored value on creation (falling back to `defaultValue` if absent or on SSR), writes on every `.set()`, and syncs across browser tabs via `storage` events. Returns `StorageSignal<T>` which extends `Signal<T>` with `.remove()` to delete the key and reset to default. Serialization defaults to JSON; provide custom `serializer`/`deserializer` in options for non-JSON types. See also: useSessionStorage, useCookie, useIndexedDB, createStorage.',
    mistakes: `- Expecting cross-tab sync with \`useSessionStorage\` — only \`useStorage\` (localStorage) fires storage events across tabs
- Storing non-serializable values (functions, class instances) without custom \`serializer\`/\`deserializer\` — JSON.stringify drops them silently
- Reading \`.remove()\` return value — it returns void, not the removed value
- Evolving the stored shape without \`version\` + \`migrate\` — a user with the OLD shape on disk loads it as-is (or \`onError\`/default if it no longer parses). Bump \`version\` and provide \`migrate\` to transform the old shape; a pre-versioning value is migrated as version \`0\`.
- Assuming a \`.set()\` that exceeds quota throws — the in-memory signal always updates; the \`setItem\` failure is routed to \`onError\` (a notification) instead of throwing. Provide \`onError\` to surface quota problems to the user.`,
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
    notes: `Tell \`useCookie\` how to read cookies during SSR. Pass the raw cookie header string, an accessor \`() => string\` returning it, or \`null\` to clear. The source is a single module-level slot: a bare STRING is shared across concurrent requests (safe only when rendering is serialized per process), so on a server handling concurrent requests pass an ACCESSOR bound to your per-request context (e.g. reading the current request's \`Cookie\` header out of \`runWithRequestContext\`'s AsyncLocalStorage) — the accessor is evaluated LAZILY at each cookie read, so each request resolves its own cookies without this module holding per-request state. See also: useCookie.`,
    mistakes: `- Forgetting to call setCookieSource on SSR — \`useCookie\` falls back to \`defaultValue\` on every request, ignoring the user's real cookie state. The page hydrates correctly on the client but flashes the default first.
- Passing a bare STRING source on a CONCURRENTLY-rendering server — the source is one module-level slot, so request A's string can leak into request B's render. Pass an accessor \`() => currentRequest().cookieHeader\` bound to your per-request context (it's evaluated lazily at read time) so each request resolves its own cookies.
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
  get: (key) => decrypt(localStorage.getItem(key)),
  set: (key, value) => localStorage.setItem(key, encrypt(value)),
  remove: (key) => localStorage.removeItem(key),
})
const secret = useEncrypted('api-key', '')`,
    notes: 'Factory for custom storage backends. Pass an object with `get`, `set`, `remove` methods (sync or async) and receive a hook function with the same signature as `useStorage`. Use for encrypted storage, remote backends, or any custom persistence layer. See also: useStorage.',
    mistakes: `- Returning \`undefined\` from the backend \`get\` when the key is absent — return \`null\` (matches the localStorage / sessionStorage contract). \`undefined\` may be JSON-serialized as the literal string \`"undefined"\` by some serialize-deserialize pipelines.
- Throwing synchronously from setItem — backend errors should be either logged + swallowed (graceful degradation, the signal still updates) OR propagated via a rejected Promise for async backends. A thrown error breaks the calling \`.set()\` and leaves the in-memory signal in a state inconsistent with the backend.
- Forgetting that the backend must implement ALL three (\`get\`, \`set\`, \`remove\`) — \`.remove()\` calls the backend \`remove\`, and omitting it makes the hook crash on cleanup paths.`,
  },

  'storage/removeStorage': {
    signature: `removeStorage(key: string, options?: { type?: 'local' | 'session' | 'cookie' | 'indexeddb' }) => void`,
    example: `import { removeStorage } from '@pyreon/storage'

removeStorage('theme')                       // localStorage
removeStorage('step', { type: 'session' })   // sessionStorage
removeStorage('locale', { type: 'cookie' })  // deletes the cookie`,
    notes: 'Imperatively remove a single key from storage and RESET its signal to the default value. Default backend is `local`; pass `{ type: "session" | "cookie" | "indexeddb" }` for the others. Works whether or not a `useStorage`-family signal is currently registered for the key: a registered key routes through `signal.remove()` (reactive reset + storage delete), an unregistered key clears the raw storage directly (`removeItem` / cookie `max-age=0`). See also: clearStorage, useStorage.',
    mistakes: `- Expecting the signal to read \`undefined\` afterward — \`removeStorage(key)\` RESETS the signal to its \`useStorage\` DEFAULT (a \`useStorage("theme", "light")\` reads \`"light"\` again, not \`undefined\`).
- Omitting \`{ type }\` for a non-local backend — it defaults to \`local\`; use \`removeStorage("locale", { type: "cookie" })\` for a cookie, etc.
- Mixing up the arg shape with \`clearStorage\` — \`removeStorage\` takes the backend in an OPTIONS object (\`{ type }\`), while \`clearStorage\` takes it POSITIONALLY (\`clearStorage("session")\`). The two are asymmetric.`,
  },

  'storage/clearStorage': {
    signature: `clearStorage(type?: 'local' | 'session' | 'cookie' | 'indexeddb' | 'all') => void`,
    example: `import { clearStorage } from '@pyreon/storage'

clearStorage()          // all MANAGED localStorage entries
clearStorage('session') // all managed sessionStorage entries
clearStorage('all')     // every backend`,
    notes: `Imperatively clear all storage entries MANAGED by @pyreon/storage for one backend (default \`local\`) or \`all\` backends. Each managed entry's signal is RESET to its default value (reactive — components reading it re-render to the default). It only touches keys @pyreon/storage tracks (created via \`useStorage\` / \`useSessionStorage\` / \`useCookie\` / \`useIndexedDB\`); unmanaged keys in the same backend are LEFT ALONE — it is NOT \`localStorage.clear()\`. See also: removeStorage, useStorage.`,
    mistakes: `- Expecting \`clearStorage()\` to wipe the whole backend like \`localStorage.clear()\` — it only clears keys MANAGED by @pyreon/storage (registered via the hooks); unmanaged keys are untouched. Call the native \`localStorage.clear()\` for a full wipe.
- Assuming it clears every backend — it defaults to \`local\` only; pass \`"all"\` for everything, or the specific backend name (\`"session"\`/\`"cookie"\`/\`"indexeddb"\`).
- Expecting cleared signals to read \`undefined\` — each entry RESETS to its \`useStorage\` DEFAULT value (reactive), not \`undefined\`.`,
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
    notes: 'Create a reactive i18n instance. Returns `{ t, n, d, rt, locale, addMessages, loadNamespace, ... }`. The `t(key, values?)` function resolves translations reactively — changing `locale` via `.set()` re-evaluates all `t()`/`n()`/`d()`/`rt()` reads in reactive scopes. Supports `{{name}}` interpolation, inline format specifiers (`{{amount, currency}}`), `_one`/`_other`/`_zero` plural suffixes, `context` (gender/variant), `defaultValue`, `$t(key)` nesting, namespace lazy loading with deduplication, fallback locale, and custom plural rules. Configure named Intl formats via `numberFormats` / `dateFormats` / `relativeTimeFormats` and custom inline formatters via `formats`. Available from both `@pyreon/i18n` and `@pyreon/i18n/core`. See also: I18nProvider, useI18n, Trans, interpolate, n, d, rt, resolvePluralCategory.',
    mistakes: `- Reading \`t(key)\` outside a reactive scope and expecting updates on locale change — \`t()\` is a reactive signal read, wrap in JSX thunk or \`effect()\`
- Using \`@pyreon/i18n\` on the backend — use \`@pyreon/i18n/core\` instead, it has zero JSX/core dependencies
- Forgetting \`fallbackLocale\` — missing keys in the current locale return the key string instead of falling back to another language
- Calling the plural suffix directly — \`t("items_one")\` bypasses selection. Call the BASE key with a \`count\`: \`t("items", { count: 3 })\`; the \`_one\`/\`_other\`/… suffix is chosen by the CLDR plural CATEGORY of \`count\` for the current locale.
- Defining only \`_one\`/\`_other\` for every language — the plural category is locale-specific (\`Intl.PluralRules\`), not \`count === 1\`. Slavic locales need \`_few\`/\`_many\`, Arabic needs \`_zero\`/\`_two\`; a locale missing its required category falls through to \`_other\`. Provide the per-locale keys (or a custom \`pluralRules\`).
- \`count\` is the RESERVED key that drives pluralization — passing the number under any other name (\`n\`, \`num\`, \`value\`) interpolates it but does NOT pluralize. Use \`{ count }\`.`,
  },

  'i18n/n': {
    signature: '(value: number | bigint, options?: Intl.NumberFormatOptions | string) => string',
    example: `i18n.n(1234.5)                                   // "1,234.5"
i18n.n(9.99, { style: 'currency', currency: 'USD' }) // "$9.99"
i18n.n(0.42, { style: 'percent' })               // "42%"
// named format from createI18n({ numberFormats: { en: { price: {...} } } })
i18n.n(9.99, 'price')`,
    notes: 'Format a number for the current locale via `Intl.NumberFormat`. Reactive — re-runs on locale change. `options` is an `Intl.NumberFormatOptions` object OR the name of a configured `numberFormats` entry. The underlying formatter is memoized per (locale, options), so repeated calls in a list reuse one `Intl.NumberFormat`. See also: createI18n, d, rt.',
    mistakes: `- Calling \`n()\` outside a reactive scope and expecting it to re-format on locale change — like \`t()\`, it reads the locale signal, so read it inside JSX / effect / computed
- Re-creating an options object every render thinking it allocates a formatter each time — formatters are memoized by a stringified options key, so inline option objects are fine`,
  },

  'i18n/d': {
    signature: '(value: Date | number | string, options?: Intl.DateTimeFormatOptions | string) => string',
    example: `i18n.d(Date.now(), { dateStyle: 'medium' })  // "Jan 15, 2024"
i18n.d(post.publishedAt, 'short')            // named dateFormats entry
i18n.d('2024-01-15T12:00:00Z', { timeZone: 'UTC', dateStyle: 'long' })`,
    notes: 'Format a date for the current locale via `Intl.DateTimeFormat`. Accepts a `Date`, epoch-ms number, or parseable string. Reactive + memoized. `options` is an `Intl.DateTimeFormatOptions` object or a configured `dateFormats` name. The bare inline specs `date` / `time` / `datetime` map to sensible default styles. See also: createI18n, n, rt.',
    mistakes: `- Passing a value that \`new Date()\` cannot parse — guard upstream; an invalid date formats as "Invalid Date"
- Expecting a fixed timezone — without \`timeZone\` in options, formatting uses the runtime timezone (pass \`timeZone: "UTC"\` for deterministic SSR/test output)`,
  },

  'i18n/rt': {
    signature: '(value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions | string) => string',
    example: `i18n.rt(-3, 'day')                     // "3 days ago"
i18n.rt(2, 'hour')                     // "in 2 hours"
i18n.rt(-1, 'day', { numeric: 'auto' })// "yesterday"`,
    notes: 'Format a relative time for the current locale via `Intl.RelativeTimeFormat`. Reactive + memoized. Negative values are past, positive are future. Pass `{ numeric: "auto" }` for "yesterday"/"tomorrow" phrasing. See also: createI18n, n, d.',
    mistakes: `- Forgetting the unit argument — \`rt\` needs an explicit \`Intl.RelativeTimeFormatUnit\` (e.g. "day", "hour")
- Computing the delta in the wrong sign — negative is past ("ago"), positive is future ("in …")`,
  },

  'i18n/I18nProvider': {
    signature: '(props: I18nProviderProps) => VNodeChild',
    example: `<I18nProvider value={i18n}>
  <App />
</I18nProvider>`,
    notes: 'Context provider that makes an i18n instance available to descendant components via `useI18n()`. Only available from the full `@pyreon/i18n` entry, not from `/core`. See also: useI18n, createI18n.',
    mistakes: `- The prop is \`value\` — \`<I18nProvider value={i18n}>\`, NOT \`i18n={…}\` / \`instance={…}\`. A wrong prop name leaves the context null and every \`useI18n()\` below throws.
- Importing it from \`@pyreon/i18n/core\` — the provider (and \`useI18n\` / \`Trans\`) is JSX and lives ONLY in the full \`@pyreon/i18n\` entry; \`/core\` is framework-agnostic.`,
  },

  'i18n/useI18n': {
    signature: '() => I18nInstance',
    example: `const { t, locale } = useI18n()
return <div>{t('greeting', { name: 'User' })}</div>`,
    notes: 'Consume the nearest `I18nProvider` value. Returns the same `I18nInstance` with `t`, `locale`, `addMessages`, etc. Only available from the full `@pyreon/i18n` entry. See also: I18nProvider, createI18n.',
    mistakes: `- Calling it with no \`<I18nProvider>\` ancestor — it THROWS (\`useI18n() must be used within an <I18nProvider>\`); the context default is null. Wrap the tree in a provider.
- Destructuring \`{ locale }\` and reading it as a value — \`locale\` is a SIGNAL; call \`locale()\` to read (and track) the current locale, and \`locale.set("fr")\` to change it. Destructuring the instance itself is fine — \`t\`/\`n\`/\`d\`/\`rt\` are stable bound functions (this is NOT the reactive-props destructure trap).`,
  },

  'i18n/Trans': {
    signature: '(props: TransProps) => VNodeChild',
    example: `// Message "action": "Please <link>click here</link> to continue"
// t is read from <I18nProvider> automatically:
<Trans i18nKey="action" components={{ link: (c) => <a href="/next">{c}</a> }} />`,
    notes: 'Rich text interpolation component. Translates `i18nKey` (with `values`) then maps `<tag>…</tag>` segments in the result to the `components` map, whose values are `(children) => VNode` functions. `t` is optional — when omitted, `<Trans>` reads the instance from the nearest `<I18nProvider>` via `useI18n()`. Use for translations that contain markup (bold, links, etc.) that cannot be expressed as plain string interpolation. See also: createI18n, useI18n.',
    mistakes: `- Using \`key\` instead of \`i18nKey\` — \`key\` is reserved by JSX for reconciliation and will not reach Trans
- Passing a VNode as a components value (\`{ link: <a/> }\`) — values must be functions \`(children) => VNode\`
- Rendering \`<Trans>\` outside an \`<I18nProvider>\` without a \`t\` prop — it throws; either wrap in a provider or pass \`t\``,
  },

  'i18n/interpolate': {
    signature: '(template: string, values?: InterpolationValues, options?: { format?: (value: unknown, spec: string) => string }) => string',
    example: `interpolate('Hello, {{name}}!', { name: 'World' })  // 'Hello, World!'`,
    notes: 'Pure string interpolation — replaces `{{name}}` placeholders with values from the map (ReDoS-safe single-pass regex). Available from both entries. Use directly when you need interpolation without the full i18n instance (e.g. server-side email templates). The optional `options.format` resolver handles inline `{{val, spec}}` specs — the i18n instance supplies one bound to its locale + formatters; a bare call has none. See also: createI18n, resolvePluralCategory, parseRichText.',
    mistakes: `- Expecting a missing value to blank the placeholder — an \`undefined\`/absent value leaves the LITERAL \`{{key}}\` in the output (not an empty string). Make the \`values\` keys match the placeholders.
- Expecting bare \`interpolate()\` to FORMAT inline specs — without \`options.format\`, \`interpolate("{{amount, currency}}", { amount: 9.99 })\` returns \`"9.99"\` (unformatted); the spec is ignored. Use \`i18n.t()\` (which binds the locale-aware formatter) for \`{{amount, currency}}\`-style output.
- Expecting arbitrary placeholder text — only a single \`{{word}}\` token (\`\\w+\`) is a placeholder; \`{{not a key}}\` (spaces/punctuation) is left literal by design. Object values are \`JSON.stringify\`d; a non-serializable value renders the raw placeholder + a dev warning.`,
  },

  'i18n/resolvePluralCategory': {
    signature: '(locale: string, count: number, customRules?: PluralRules) => string',
    example: `resolvePluralCategory('en', 1)   // "one"
resolvePluralCategory('en', 5)   // "other"
resolvePluralCategory('ru', 2)   // "few"  (Russian)
resolvePluralCategory('ar', 0)   // "zero" (Arabic)`,
    notes: 'Resolve the CLDR plural category for a `count` in a `locale` — returns one of `"zero"` / `"one"` / `"two"` / `"few"` / `"many"` / `"other"`. Uses `customRules[locale](count)` if provided, else a per-locale-memoized `Intl.PluralRules` (construction is the dominant cost; `.select()` is cheap), falling back to `count === 1 ? "one" : "other"` only when `Intl.PluralRules` is unavailable. Exported from both `@pyreon/i18n` and `@pyreon/i18n/core`; it is the primitive `t()` uses internally to pick a `_one`/`_other`/… suffix. See also: createI18n.',
    mistakes: `- Treating the return as a count-based boolean — it is a locale-specific CLDR CATEGORY, not \`count === 1\`. English collapses to one/other, but Russian/Arabic/Polish return few/many/two/zero; branch on the returned string, do not re-derive from \`count\`.
- Assuming the same categories across locales — \`resolvePluralCategory("en", 0)\` is \`"other"\` while \`resolvePluralCategory("ar", 0)\` is \`"zero"\`. Design your message keys around the categories the TARGET locale actually produces.`,
  },

  'i18n/parseRichText': {
    signature: '(text: string) => (string | { tag: string; children: string })[]',
    example: `parseRichText("Hello <bold>world</bold>, <link>here</link>")
// ["Hello ", { tag: "bold", children: "world" }, ", ", { tag: "link", children: "here" }]`,
    notes: `The low-level parser behind \`<Trans>\` — splits a translated string into an array of plain-text segments and \`{ tag, children }\` rich parts, matching flat \`<tag>content</tag>\` runs (regex \`/<(\\w+)>([^<]*)<\\/\\1>/g\`). Exported for advanced callers that map rich segments to something other than JSX (e.g. terminal ANSI, a native renderer). Most apps should use \`<Trans>\` instead. See also: Trans, interpolate.`,
    mistakes: `- Expecting NESTED tags to parse — the children class is \`[^<]*\`, so \`<b><i>x</i></b>\` does NOT match as a nested structure; keep rich tags flat and non-overlapping.
- Using hyphenated tags or attributes — tag names are \`\\w+\` only; \`<my-tag>\` / \`<a href="…">\` won't match. Use plain single-word tags (\`<link>\`, \`<bold>\`) and map them in \`<Trans components>\`.
- Reaching for it when \`<Trans>\` suffices — \`parseRichText\` returns data, not VNodes; \`<Trans>\` does the parse AND the component mapping. Use this only for non-JSX render targets.`,
  },

  'i18n/MessageKeys': {
    signature: 'type MessageKeys<M> // dot-path key union of a messages object, plural suffixes collapsed',
    example: `const en = {
  greeting: 'Hello {{name}}',
  nav: { home: 'Home', about: 'About' },
  items_one: '{{count}} item',
  items_other: '{{count}} items',
} as const
type Keys = MessageKeys<typeof en> // 'greeting' | 'nav.home' | 'nav.about' | 'items'`,
    notes: `The dot-path key union of a messages object — every translatable key, nested keys joined with '.', plural suffixes (_one/_other/_zero/_two/_few/_many) COLLAPSED to their base key (you call \`t('items', { count })\`, not \`t('items_one')\`). Recursion is depth-capped at 6 nesting levels; over an index-signature \`TranslationDictionary\` it degrades gracefully to \`string\`. Foundation of the opt-in typed instance: \`createI18n<typeof en>(...)\`. Type-only, zero runtime bytes. See also: TranslationParams, TypedTranslationKey, createI18n.`,
    mistakes: `- MessageKeys over a messages object TYPED as \`TranslationDictionary\` (or any index signature) gives \`string\` — the literal keys are erased; pass \`typeof en\` of a literal object (values may widen, keys survive without \`as const\`; params extraction needs \`as const\`)
- Raw plural-suffixed keys ('items_one') are deliberately NOT in the union — call the BASE key with \`{ count }\` and the runtime picks the form
- Namespaced keys ("auth:errors.invalid") are not derivable — namespaces load at runtime; the typed instance accepts any \`ns:key\` string unchecked
- A legit key that merely ENDS in a plural suffix (\`phase_one\`) collapses too — rename it if that is unwanted
- Trees deeper than 6 levels contribute no keys past the cap (documented recursion guard) — flatten pathological nesting`,
  },

  'i18n/TranslationParams': {
    signature: 'type TranslationParams<M, K extends string> // {{param}} names of the message at key K',
    example: `const en2 = { greeting: 'Hi {{name}}', items_other: '{{count}} items' } as const
type P1 = TranslationParams<typeof en2, 'greeting'> // { name: InterpolationValue }
type P2 = TranslationParams<typeof en2, 'items'>    // { count: number }`,
    notes: 'Derive the interpolation params of ONE message: the `{{param}}` names in the message literal (inline format specs like `{{amount, currency}}` contribute the name before the comma), plus `count: number` when the key resolves through plural suffixes. Requires LITERAL message values (`as const`) — over widened `string` values it degrades to the loose `InterpolationValues` record. Type-only, zero runtime bytes. See also: MessageKeys, createI18n.',
    mistakes: `- Without \`as const\` the message VALUES widen to \`string\` and params degrade to \`InterpolationValues\` — the literal is what carries the \`{{param}}\` names
- It derives from ONE locale's messages — a param present only in another locale's translation is invisible; keep placeholder parity across locales
- Unknown keys degrade to \`InterpolationValues\` rather than erroring — pair with \`MessageKeys\` for key checking`,
  },

  'i18n/TypedTranslationKey': {
    signature: 'type TypedTranslationKey<M> // MessageKeys<M> | `${string}:${string}`, degrading to string',
    example: `const en3 = { nav: { home: 'Home' } } as const
const i18n = createI18n<typeof en3>({ locale: 'en', messages: { en: en3 } })
i18n.t('nav.home')          // ✓ autocompleted + checked
i18n.t('auth:errors.bad')   // ✓ namespaced — unchecked by design`,
    notes: 'The key type a TYPED i18n instance accepts: the derived `MessageKeys` union PLUS any `namespace:key` string (namespaced lookups stay unchecked — namespaces load at runtime). This is what `createI18n<typeof en>()` plugs into `I18nInstance<TKey>`; when the messages type carries no literal keys it degrades to plain `string`, so untyped usage is byte-identical. Type-only, zero runtime bytes. See also: MessageKeys, createI18n, useI18n.',
    mistakes: `- Expecting namespaced keys to be typo-checked — any \`ns:key\` string is accepted (runtime-loaded namespaces cannot be enumerated at compile time)
- Reading a typed instance back through \`useI18n()\` — context erases the key type (returns \`I18nInstance<string>\`); keep a module-level typed instance for typed \`t\``,
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
    notes: 'Render a document node tree to any supported format. Returns a string (HTML, Markdown, text, CSV, email, JSON, JSONL, Slack, Teams, etc.) or Uint8Array (PDF, DOCX, XLSX, PPTX) depending on the format. Heavy format renderers are lazy-loaded on first use. Supports 20 built-in formats plus custom renderers registered via `registerRenderer()`. The `json` format serializes the full DocNode tree (round-trippable — JSON.parse it back and render again); `jsonl` emits one content block per line for ingestion / chunking pipelines. See also: createDocument, Document, download, registerRenderer.',
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
    signature: '(node: DocNode, filename: string, options?: RenderOptions) => Promise<void>',
    example: `await download(doc, 'report.pdf')   // renders 'pdf', downloads
await download(doc, 'report.docx')  // renders 'docx', downloads
await download(doc, 'tree.json')    // renders 'json', downloads`,
    notes: 'Browser helper that renders a document node tree and triggers a file download in one call. The FILE EXTENSION on `filename` selects the format (`.pdf` → pdf, `.md` → markdown, `.json` → json, `.jsonl`/`.ndjson` → jsonl, etc.) — it renders internally, so you pass the DocNode, NOT already-rendered bytes. Creates a temporary Blob URL and clicks a hidden anchor. Browser-only — throws on the server. See also: render.',
    mistakes: `- Passing already-rendered bytes as the first arg — download() takes the DocNode and renders internally; the extension picks the format
- Forgetting the file extension — download(doc, "report") throws; the extension is how the format is chosen
- Calling it on the server — download() is browser-only and throws in Node`,
  },

  'document/Heading': {
    signature: `(props: { level?: 1 | 2 | 3 | 4 | 5 | 6; color?: string; align?: 'left' | 'center' | 'right'; children?: DocChild }) => DocNode`,
    example: '<Heading level={2} color="#666">Section title</Heading>',
    notes: `A heading block. \`level\` DEFAULTS TO 1 (h1) when omitted — pass 2–6 for h2–h6 (a caller-supplied \`level\` overrides the default). Children are the heading text (a raw string, or inline primitives). Produces { type: 'heading', props: { level, color?, align? }, children }. See also: Text, Page.`,
    mistakes: `- Assuming \`level\` auto-derives from nesting depth — it is always 1 unless you pass one; there is no document-wide heading counter.
- Passing a plain OBJECT as a child — normalizeChildren THROWS '[@pyreon/document] Invalid child: plain objects are not valid document children'. Children must be strings, numbers, or document nodes.`,
  },

  'document/Text': {
    signature: `(props: { size?: number; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; align?: 'left' | 'center' | 'right' | 'justify'; lineHeight?: number; children?: DocChild }) => DocNode`,
    example: '<Text bold align="center">Q4 2026 performance summary.</Text>',
    notes: `A paragraph / run of text with inline styling props (bold, italic, underline, strikethrough, size, color, align, lineHeight). A raw string child is kept as a bare string in \`children\` — Text does NOT wrap it in a nested node. Produces { type: 'text', props, children }. See also: Heading, Quote.`,
  },

  'document/Table': {
    signature: '(props: { columns: (string | TableColumn)[]; rows: (string | number)[][]; headerStyle?: { background?: string; color?: string; bold?: boolean }; striped?: boolean; bordered?: boolean; caption?: string; keepTogether?: boolean }) => DocNode',
    example: `<Table
  columns={['Region', 'Revenue', 'Growth']}
  rows={[['US', '$1.2M', '+15%'], ['EU', '$800K', '+8%']]}
  striped
/>`,
    notes: `A data table. \`columns\` (headers, each a string or { header, width?, align? }) and \`rows\` (a 2D array) are REQUIRED and live entirely in PROPS — Table has NO children. Every cell is a scalar \`string | number\`. Produces { type: 'table', props, children: [] }. See also: render.`,
    mistakes: `- Putting rich content in a cell — cells are scalar \`string | number\` only; you cannot nest a Text/Link/Image DocNode inside a cell.
- Passing rows as children — Table ignores children entirely (forced to []); all data goes in the \`columns\` + \`rows\` props.
- \`headerStyle\` is its own 3-field shape ({ background?, color?, bold? }) — not the full Text style object; per-column align lives on the \`TableColumn\` entries in \`columns\`.`,
  },

  'document/List / ListItem': {
    signature: '(List: { ordered?: boolean; children?: DocChild }) => DocNode · (ListItem: { children?: DocChild }) => DocNode',
    example: `<List ordered>
  <ListItem>First</ListItem>
  <ListItem>Second</ListItem>
</List>`,
    notes: `A bulleted (default) or numbered list. \`List\` takes \`ordered\` (unordered when omitted — there is no applied default, undefined is falsy) and \`ListItem\` children. NOTE: the JSX \`<List items={[…]} />\` shorthand in the builder/examples is convenience sugar; the primitive itself nests \`ListItem\` children. \`ListItem\` DISCARDS every prop except \`children\` — it always renders { type: 'list-item', props: {}, children }. See also: Text.`,
    mistakes: `- Setting any prop other than \`children\` on \`ListItem\` (an id, a style) — it is silently dropped; the primitive hard-codes empty props.
- Expecting \`ordered\` to have a truthy default — omitting it yields an UNORDERED list (undefined → falsy).`,
  },

  'document/Code': {
    signature: '(props: { language?: string; children?: DocChild }) => DocNode',
    example: '<Code language="sql">SELECT region, SUM(revenue) FROM sales GROUP BY region</Code>',
    notes: `A code block. \`language\` is a hint for syntax highlighting in formats that support it (has NO default — undefined when omitted). Children are the raw code string. Produces { type: 'code', props, children }. See also: Text.`,
  },

  'document/Link': {
    signature: '(props: { href: string; color?: string; children?: DocChild }) => DocNode',
    example: '<Link href="https://example.com">Read the report</Link>',
    notes: `An inline hyperlink. \`href\` is REQUIRED; children are the visible link text. Produces { type: 'link', props, children }. See also: Button, Text.`,
  },

  'document/Image': {
    signature: `(props: { src: string; width?: number; height?: number; alt?: string; align?: 'left' | 'center' | 'right'; caption?: string }) => DocNode`,
    example: '<Image src="/charts/q4.png" width={480} alt="Q4 revenue" caption="Fig 1" />',
    notes: `An image. \`src\` is REQUIRED; \`width\`/\`height\` are NUMBERS (pixels), not CSS strings. Image has NO children (forced to []). With \`render(doc, fmt, { baseUrl })\` a relative \`src\` is rewritten absolute before rendering. Produces { type: 'image', props, children: [] }. See also: render.`,
    mistakes: `- Passing a CSS string for \`width\`/\`height\` (e.g. "50%") — they are typed \`number\` (pixels); use \`render\` options or a Section for relative sizing.
- Relying on a relative \`src\` without \`baseUrl\` — chat/email targets need absolute URLs; pass \`render(doc, fmt, { baseUrl })\` so relative srcs are rewritten. (Telegram/WhatsApp drop inline images entirely.)`,
  },

  'document/Button': {
    signature: `(props: { href: string; background?: string; color?: string; borderRadius?: number; padding?: number | [number, number]; align?: 'left' | 'center' | 'right'; children?: DocChild }) => DocNode`,
    example: '<Button href="https://app.example.com/invoice/42" background="#4f46e5" color="#fff">View invoice</Button>',
    notes: `A call-to-action button — a LINK styled as a button (renders as an Outlook-safe 'bulletproof button' in email, a styled link in PDF/DOCX). \`href\` is REQUIRED; children are the label. Produces { type: 'button', props, children }. See also: Link.`,
    mistakes: '- Expecting an `onClick` handler or a `variant` prop — Button has NEITHER; it is purely a styled link and REQUIRES `href` (documents have no runtime event loop).',
  },

  'document/Page / Section / Row / Column / Divider / Spacer / Quote / PageBreak': {
    signature: `Page({ size?: PageSize; orientation?: 'portrait' | 'landscape'; margin?: number | number[]; header?: DocNode; footer?: DocNode; children? }) · Section({ direction?: 'column' | 'row'; gap?; padding?; background?; borderRadius?; border?; children? }) · Row({ gap?: number; align?; children? }) · Column({ width?: number | string; align?; children? }) · Divider({ color?; thickness? }) · Spacer({ height: number }) · Quote({ borderColor?; children? }) · PageBreak()`,
    example: `<Page size="A4" orientation="portrait">
  <Section gap={16}>
    <Heading>Title</Heading>
    <Spacer height={12} />
    <Quote>An important note.</Quote>
    <Divider />
  </Section>
  <PageBreak />
</Page>`,
    notes: `The structural / layout primitives. \`Page\` is a page boundary (\`size\` 'A4'|'A3'|'A5'|'letter'|'legal'|'tabloid', orientation, margins, optional \`header\`/\`footer\` DocNodes). \`Section\`/\`Row\`/\`Column\` are layout boxes (gap, align, padding, background). \`Divider\` is a horizontal rule (no children, all props optional — \`Divider()\` works bare). \`Spacer\` adds vertical space (\`height: number\` is REQUIRED). \`Quote\` is a blockquote (children). \`PageBreak()\` takes NO arguments — a hard break in PDF/DOCX, a visual rule in md/text/html, a no-op in per-slide PPTX. See also: Document, render.`,
    mistakes: `- \`Spacer\` without \`height\` — it is the only required field on these primitives; omitting it is a type error.
- Calling \`PageBreak({ ... })\` with props — it takes NO arguments and always emits empty props/children.
- Expecting \`Column\` to enforce a parent \`Row\` (or \`Row\` to require \`Column\` children) — neither is enforced at runtime; children are typed \`unknown\` and just normalized.`,
  },

  'document/registerRenderer / unregisterRenderer / isDocNode': {
    signature: 'registerRenderer(format: string, renderer: DocumentRenderer | (() => Promise<DocumentRenderer>)) => void · unregisterRenderer(format: string) => void · isDocNode(value: unknown) => value is DocNode',
    example: `import { registerRenderer, render } from '@pyreon/document'

registerRenderer('rtf', { render: async (node) => toRtf(node) })
const rtf = await render(doc, 'rtf')`,
    notes: `The extension + guard API. \`registerRenderer\` adds (or REPLACES) a format's renderer — pass a \`DocumentRenderer\` object ({ render(node, options?) }) or a lazy \`() => Promise<DocumentRenderer>\` loader (every built-in format is a lazy loader; the resolved renderer is cached back into the registry on first use). \`unregisterRenderer\` deletes a format (no-op if absent). \`isDocNode\` is a structural type guard. See also: render, createDocument.`,
    mistakes: `- registerRenderer SILENTLY OVERWRITES an existing format (it is a bare Map.set, no guard) — re-registering \`html\` replaces the built-in renderer with no warning.
- Trusting isDocNode to validate the tree — it only checks \`value\` is an object carrying \`type\`, \`props\`, and \`children\` keys; it does NOT verify \`type\` is a real node type or that the shapes are valid (a hand-rolled { type: 'x', props: 0, children: 0 } passes).
- Rendering to an unregistered format — render() rejects with [@pyreon/document] No renderer registered for format 'X'. Available: … (the message enumerates the currently-registered keys). The markdown key is 'md', not 'markdown'.`,
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
- Leaving object-snapping on for very large graphs — \`snapToObjects\` (default \`true\`) runs an O(N) align-to-other-nodes scan on EVERY drag frame; on big graphs it dominates per-frame cost. Set \`snapToObjects: false\` to skip it (≈3-4× faster drags) when you don't need helper-line alignment
- Setting explicit \`width\`/\`height\` on every node "so layout works" — unnecessary: the renderer MEASURES each node's real box (and \`<Handle>\` dot centers) and feeds the effective size (explicit → measured → 150×40 default) to edges, \`layout()\`, \`fitView\`, snap lines, and the minimap. Explicit sizes are only needed for pre-render/headless layout (SSR, standalone \`computeLayout\`) — and they OVERRIDE the measurement, so a stale hardcoded size beats the real one
- Putting \`pathOptions\` fields on the wrong edge type — \`curvature\` applies to \`bezier\` only, \`borderRadius\`+\`offset\` to \`smoothstep\`, \`offset\` to \`step\`; \`straight\` and waypoint routes ignore all of them. Flow-wide defaults go in \`config.defaultEdgeOptions\` (per-edge values, including an explicit \`markerEnd: null\`, always win)`,
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
    example: `<Flow instance={flow} ariaLabel="Pipeline editor" nodeTypes={{ custom: MyNode }} edgeTypes={{ arrow: ArrowEdge }}>
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
    notes: 'Main flow container. Accepts a `FlowInstance` via the `instance` prop plus optional `nodeTypes` / `edgeTypes` maps for custom renderers, `style` / `class`, and `ariaLabel` (the accessible name for the focusable canvas — defaults to `"Flow diagram"`; the container is `role="group"` + `tabindex=0`, so set a specific name like `"Pipeline editor"`). Internally uses `<For>` keyed by `node.id` plus per-node reactive accessors that read live state from `instance.nodes()` — each node mounts EXACTLY ONCE across the lifetime of the graph regardless of drags, selection clicks, or `updateNode` mutations. A 60fps drag in a 1000-node graph stays O(1) per frame. JSX components are NOT generic at the call site (`<Flow<MyData> />` is invalid JSX); `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers can pass `FlowInstance<MyData>` without casting. See also: createFlow, Background, Controls, MiniMap, Handle.',
    mistakes: `- \`<Flow<MyData> />\` is invalid JSX — the component is not generic at the call site; pass a typed \`FlowInstance<MyData>\` via \`instance\` prop
- Missing \`nodeTypes\` entry for a \`node.type\` string — falls through to the default renderer
- Mutating \`instance.nodes()\` return value directly — use \`instance.addNode\` / \`updateNode\` / \`removeNode\` so the internal signals fire`,
  },

  'flow/Background': {
    signature: '(props?: { variant?: "dots" | "lines" | "cross"; gap?: number; size?: number; color?: string }) => VNodeChild',
    example: `<Flow instance={flow}>
  <Background variant="dots" gap={24} size={1} color="#e5e7eb" />
</Flow>`,
    notes: 'Grid background inside a `<Flow>`. Place as a direct child. `variant` is `"dots"` (default), `"lines"`, or `"cross"`; `gap` is the pattern spacing (default `20`); `size` is the dot radius / line thickness (default `1`); `color` sets the pattern color (default `"#ddd"`). Renders as an SVG `<pattern>` at the back of the z-order. See also: Flow, Controls, MiniMap.',
  },

  'flow/Controls': {
    signature: '(props?: { showZoomIn?: boolean; showZoomOut?: boolean; showFitView?: boolean; showLock?: boolean; position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) => VNodeChild',
    example: `<Flow instance={flow}>
  <Controls position="bottom-right" showLock />
</Flow>`,
    notes: 'Zoom / fit-view button cluster plus a live zoom-level readout. Renders absolutely inside the flow viewport at the configured corner (default `"bottom-left"`). `showZoomIn` / `showZoomOut` / `showFitView` default to `true` and dispatch to `instance.zoomIn()` / `zoomOut()` / `fitView()`; `showLock` (default `false`) adds a lock/unlock toggle. Each button is `title`-labelled for accessibility. See also: Flow, Background, MiniMap.',
  },

  'flow/MiniMap': {
    signature: '(props?: { nodeColor?: string | ((node: FlowNode) => string); maskColor?: string; width?: number; height?: number; style?: string; class?: string }) => VNodeChild',
    example: `<Flow instance={flow}>
  <MiniMap nodeColor={(node) => node.data.highlighted ? '#f59e0b' : '#6366f1'} />
</Flow>`,
    notes: 'Overview minimap of the full graph. `nodeColor` is a flat color string OR a per-node color function (default a `--pyreon-flow-minimap-node` CSS var); `maskColor` fills the area outside the current viewport (default a `--pyreon-flow-minimap-mask` var). `width` / `height` size the minimap box (default `200` × `150`). Clicks on the minimap recenter the main viewport. See also: Flow, Background, Controls.',
  },

  'flow/Handle': {
    signature: '(props: { type: "source" | "target"; position: Position; id?: string; offset?: number; style?: string; class?: string }) => VNodeChild',
    example: `function CustomNode(props: NodeComponentProps<MyData>) {
  return (
    <div>
      <Handle type="target" position={Position.Left} />
      {props.data().label}
      {/* Same side, distinct offsets (percent along the side) so the dots don't stack */}
      <Handle type="source" position={Position.Right} id="out-primary" offset={30} />
      <Handle type="source" position={Position.Right} id="out-fallback" offset={70} />
    </div>
  )
}

// Edge referencing a specific source handle by id — anchors at that dot's
// MEASURED rendered center, so the offset moves the attachment point too
flow.addEdge({ source: '1', sourceHandle: 'out-primary', target: '2' })`,
    notes: `Connection handle on a custom node — exposes a connectable point that edges attach to. \`type\` picks direction (\`"source"\` emits edges, \`"target"\` receives), \`position\` is a \`Position\` enum (\`Top\` / \`Right\` / \`Bottom\` / \`Left\`). Provide a distinct \`id\` when a node has multiple source or target handles so edges can reference the specific one via \`edge.sourceHandle\` / \`edge.targetHandle\` — the edge then anchors at the dot's MEASURED rendered center (the NodeLayer records every dot via its per-node ResizeObserver), so restyling/repositioning a dot via \`style\` / \`class\` moves the edge attachment with it. An edge with no handle id uses the node's first handle of the right type; an unknown id anchors at the first handle and dev-warns once naming the known ids. See also: Flow, Position.`,
    mistakes: `- Multiple \`source\` / \`target\` handles on one node without distinct \`id\` values — edges cannot disambiguate which handle they connect to
- Two handles on the SAME side without distinct \`offset\` values — both render at that side's center and visually stack; give same-side siblings distinct offsets (percent along the side, default 50) and the measured-dot anchoring moves each edge attachment with its dot
- Nesting a \`<Handle>\` inside a non-node component (a \`<Background>\` child, a \`<Panel>\`, etc.) — the connection machinery expects handles to live inside a node renderer`,
  },

  'flow/Panel': {
    signature: '(props: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right"; style?: string; class?: string; children?: VNodeChild }) => VNodeChild',
    example: `<Flow instance={flow}>
  <Panel position="top-right">
    <button onClick={() => flow.fitView()}>Fit</button>
    <button onClick={() => flow.toJSON()}>Export</button>
  </Panel>
</Flow>`,
    notes: 'Overlay panel positioned absolutely relative to the flow viewport. Use for toolbars, legend badges, or contextual action buttons. Pass any JSX as children — the panel is a plain positioned container, not a predefined chrome component. `style` / `class` customise the container. See also: Flow, Controls.',
  },

  'flow/NodeResizer': {
    signature: 'NodeResizer(props: { nodeId: string; instance: FlowInstance; minWidth?: number; minHeight?: number; handleSize?: number; showEdgeHandles?: boolean }) => VNodeChild',
    example: `import { NodeResizer } from '@pyreon/flow'

const ResizableNode = (props) => (
  <div style={{ position: 'relative' }}>          {/* required — see mistakes */}
    <NodeResizer nodeId={props.id} instance={flow} minWidth={80} />
    {props.data.label}
  </div>
)`,
    notes: 'Render drag handles inside a custom node to resize it. Draws absolutely-positioned corner handles (`nw`/`ne`/`sw`/`se`) — plus edge handles when `showEdgeHandles` — that drag via pointer-capture (no document listeners), convert the client delta by the current `viewport.zoom`, and call `instance.updateNode(nodeId, { width, height, position })`. `w`/`n`-side drags also shift `position` so the opposite edge stays fixed. Defaults: `minWidth` 50, `minHeight` 30, `handleSize` 8px. See also: NodeToolbar, Handle, useFlow.',
    mistakes: `- Expecting it to read the flow from context like React Flow — it does NOT; you MUST pass \`instance={flow}\` (your \`createFlow()\` handle) AND \`nodeId\` explicitly.
- Mounting it in a node whose host element is not \`position: relative\` — the handles are \`position: absolute\` and will anchor to the wrong ancestor. Wrap the node content in a \`position: relative\` element.`,
  },

  'flow/NodeToolbar': {
    signature: `NodeToolbar(props: { position?: 'top' | 'bottom' | 'left' | 'right'; offset?: number; showOnSelect?: boolean; selected?: boolean | (() => boolean); style?: string; class?: string; children?: VNodeChild }) => VNodeChild`,
    example: `import { NodeToolbar } from '@pyreon/flow'

const NodeWithToolbar = (props) => (
  <div style={{ position: 'relative' }}>
    <NodeToolbar selected={props.selected}>       {/* pass the accessor */}
      <button onClick={() => flow.removeNode(props.id)}>Delete</button>
    </NodeToolbar>
    {props.data.label}
  </div>
)`,
    notes: 'A floating toolbar placed beside its host node (default `position: "top"`, `offset` 8px). Returns a REACTIVE thunk that reads `selected` and renders `null` when `showOnSelect` (default true) and the node is not selected — so it shows/hides with live selection. Put action buttons for a node (delete, duplicate, edit) here. See also: NodeResizer, Handle.',
    mistakes: `- Expecting it to escape node clipping like React Flow — it is NOT a portal; it renders inline as an absolutely-positioned div, so an ancestor \`overflow: hidden\` CLIPS it. The host node must be \`position: relative\`.
- Passing a bare boolean \`selected={someValue}\` — that snapshots selection and never updates. Pass the reactive accessor (the custom node's \`props.selected\`, which is \`() => boolean\`) so show/hide tracks live selection.`,
  },

  'flow/MarkerType / Position': {
    signature: `enum MarkerType { Arrow = 'arrow', ArrowClosed = 'arrowclosed' } · enum Position { Top = 'top', Right = 'right', Bottom = 'bottom', Left = 'left' }`,
    example: `import { MarkerType, Position } from '@pyreon/flow'

const edges = [{ id: 'e1', source: 'a', target: 'b',
  markerEnd: { type: MarkerType.ArrowClosed } }]`,
    notes: `The two flow enums. \`MarkerType\` is the edge-arrowhead shape — \`Arrow\` (open stroked chevron) or \`ArrowClosed\` (filled triangle, the default edge-end marker). \`Position\` is a node's handle/edge attachment side — \`Top\`/\`Right\`/\`Bottom\`/\`Left\` — consumed by the edge-path helpers and \`getHandlePosition\`. Both match React Flow's enums exactly. See also: edge-path-helpers, Handle.`,
  },

  'flow/edge-path-helpers': {
    signature: 'getBezierPath / getSmoothStepPath / getStraightPath / getStepPath / getWaypointPath / getEdgePath => { path: string; labelX: number; labelY: number } · getHandlePosition / getSmartHandlePositions',
    example: `import { getBezierPath } from '@pyreon/flow'

const MyEdge = (props) => {
  const { path, labelX, labelY } = getBezierPath({
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
  })
  return <path d={path} />
}`,
    notes: 'SVG-path builders for CUSTOM edge components. `getBezierPath`, `getSmoothStepPath`, `getStraightPath`, `getStepPath`, `getWaypointPath` take a single OPTIONS object (`{ sourceX, sourceY, sourcePosition?, targetX, targetY, targetPosition?, … }`) and return an `EdgePathResult` object `{ path, labelX, labelY }`. `getEdgePath(type, sourceX, sourceY, sourcePos, targetX, targetY, targetPos)` is the POSITIONAL-arg dispatcher (unknown type → bezier). `getHandlePosition(position, nodeX, nodeY, nodeW, nodeH)` returns the `{ x, y }` anchor on a node edge; `getSmartHandlePositions(sourceNode, targetNode)` auto-picks the closest facing sides. See also: MarkerType / Position, Handle.',
    mistakes: `- Destructuring the return as a TUPLE (\`const [path, labelX, labelY] = getBezierPath(...)\`) — React Flow returns an array, but @pyreon/flow returns an OBJECT \`{ path, labelX, labelY }\`. Destructure by NAME.
- Calling \`getEdgePath\` / \`getHandlePosition\` with an options object — those two take POSITIONAL args (unlike the five object-param helpers). \`getStraightPath\` also takes no \`*Position\` params.`,
  },

  'flow/computeLayout': {
    signature: `computeLayout<TData>(nodes: FlowNode<TData>[], edges: FlowEdge[], algorithm?: 'layered' | 'force' | 'stress' | 'tree' | 'radial' | 'box' | 'rectpacking', options?: { direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; nodeSpacing?: number; layerSpacing?: number; edgeRouting?: 'orthogonal' | 'splines' | 'polyline' }) => Promise<Array<{ id: string; position: { x: number; y: number } }>>`,
    example: `import { computeLayout } from '@pyreon/flow'

const positioned = await computeLayout(flow.nodes(), flow.edges(), 'layered', { direction: 'DOWN' })
for (const { id, position } of positioned) flow.updateNode(id, { position })`,
    notes: 'Auto-layout via a lazy-loaded `elkjs` (cached singleton — zero bundle cost until first call). Runs the ELK `algorithm` (default `layered`) over the graph and returns a NEW array of `{ id, position }` pairs (positions only). Async. See also: createFlow, useFlow.',
    mistakes: `- Forgetting to \`await\` it — \`computeLayout\` is ASYNC (it lazy-loads elkjs).
- Expecting it to move your nodes — it does NOT mutate \`nodes\`; it returns only \`{ id, position }\` pairs (no width/height/data). Map the positions back onto your node objects (e.g. via \`updateNode\`).
- Passing \`direction\` / \`layerSpacing\` / \`edgeRouting\` to a non-\`layered\` algorithm — those apply only to \`layered\` (and \`direction\` to \`tree\`); ELK silently ignores them (a dev-mode warning fires).`,
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
    legend: {},
    series: [{ type: 'pie', data: [{ value: 60, name: 'A' }, { value: 40, name: 'B' }] }],
  })}
  style="height: 300px"
  showLoading={isFetching()}
  onEvents={{
    legendselectchanged: (p) => console.log('toggled', p.name),
    datazoom: (_p, instance) => syncOtherChart(instance.getOption()),
  }}
/>`,
    notes: 'Declarative chart component that wraps `useChart` internally. Accepts `options` (reactive function), `style`/`class` for the container, and event handlers. `onEvents` binds ANY ECharts event by name (`legendselectchanged`, `datazoom`, `finished`, …), with `onClick`/`onMouseover`/`onMouseout` as shorthands — binding is leak-safe (handler changes swap listeners, all removed on unmount). `showLoading` reactively toggles the ECharts loading overlay. Renders a div with the chart — auto-resizes and cleans up on unmount. Simpler than useChart for most use cases. See also: useChart.',
    mistakes: `- Missing style height on the Chart component — same as useChart, ECharts requires explicit container dimensions
- Passing a static options object — wrap in \`() => ({...})\` so signal reads inside are tracked reactively
- Using onClick/onMouseover/onMouseout for a non-mouse event — those are only shorthands; reach for the general \`onEvents\` map (e.g. \`onEvents={{ legendselectchanged: fn }}\`) for any other ECharts event
- Expecting \`theme\` to swap at runtime — it is applied once at init (ECharts cannot hot-swap a theme); remount the chart (key it on the theme signal) to change themes
- Relying on the default merge when data shrinks — a signal change that removes a series/point leaves the old one; pass \`notMerge\` or \`replaceMerge="series"\``,
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
    notes: 'Create a reactive editor instance. `editor.value` is a writable Signal<string> — `editor.value()` reads reactively, `editor.value.set(next)` writes back into CodeMirror. `editor.cursor` and `editor.lineCount` are computed signals. Config accepts value, language, theme, minimap, lineNumbers, foldGutter, onChange, onError (mount failures route here instead of an unhandled rejection), and more. The instance is framework-independent — mount it via `<CodeEditor instance={editor} />`. See also: CodeEditor, bindEditorToSignal, loadLanguage.',
    mistakes: `- Forgetting to declare @pyreon/runtime-dom in consumer app deps — <CodeEditor> JSX emits _tpl() which needs runtime-dom
- Hand-rolling the applyingFromExternal/applyingFromEditor flag pattern — use bindEditorToSignal instead
- Calling cursor-relative methods (insert / replaceSelection) before mount — the view is created by mount() after an async grammar load, so a pre-mount call has no cursor and is dropped (with a dev warning). Use editor.value.set(...) to set content independently of the view (it seeds the doc whenever the view is created)
- Setting both vim: true and emacs: true — emacs wins
- Relying on a thrown error to debug a broken setup (a throwing extension / failed grammar import) — mount failures no longer surface as an unhandled rejection; pass onError to observe them, otherwise they log a [Pyreon] message in dev. Disposing the editor while it is still mounting (a fast navigate-away during the async grammar load) is also leak-safe`,
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

  'code/createTabbedEditor': {
    signature: '(config?: TabbedEditorConfig) => TabbedEditorInstance',
    example: `const tabbed = createTabbedEditor({
  tabs: [
    { id: 'main', name: 'main.ts', language: 'typescript', value: 'export {}' },
    { id: 'styles', name: 'styles.css', language: 'css', value: 'body {}' },
  ],
})
tabbed.openTab({ name: 'README.md', language: 'markdown', value: '# Hi' })
tabbed.switchTab('styles')
tabbed.activeTab()   // Computed<Tab | null>

<TabbedEditor instance={tabbed} style="height: 500px" />`,
    notes: 'Create a reactive multi-file (tabbed) editor instance. `config` is `{ tabs?, theme?, editorConfig? }` — `tabs` is an array of `Tab` (`{ name, value, id?, language?, modified?, closable? }`), `editorConfig` applies to every tab. The instance wraps a single underlying `editor` and exposes reactive `tabs` (Signal<Tab[]>), `activeTab` (Computed<Tab | null>), and `activeTabId` (Signal<string>), plus imperative `openTab` / `closeTab` / `switchTab` / `renameTab` / `setModified` / `moveTab` / `getTab` / `closeAll` / `closeOthers` / `dispose`. Mount it via `<TabbedEditor instance={…} />`. See also: TabbedEditor, createEditor.',
    mistakes: `- Passing \`tabs\` directly to <TabbedEditor> — the component takes an \`instance\` prop, not \`tabs\`. Build the instance with createTabbedEditor, then pass \`instance={tabbed}\`.
- Using \`label\` for the tab title — a Tab uses \`name\` (the displayed file name); \`id\` is the optional unique key (defaults to \`name\`).
- Forgetting to call instance.dispose() on unmount — it owns an underlying editor instance.`,
  },

  'code/TabbedEditor': {
    signature: '(props: TabbedEditorProps) => VNodeChild',
    example: `const tabbed = createTabbedEditor({ tabs: [{ name: 'a.ts', value: 'export {}' }] })
<TabbedEditor instance={tabbed} style="height: 500px" />`,
    notes: 'Mount component for a `createTabbedEditor` instance. Props are `instance` (REQUIRED — a TabbedEditorInstance), plus optional `style` and `class`. Renders a headless tab bar (plain div + button tabs) above the editor; switching tabs swaps the underlying document reactively. See also: createTabbedEditor, CodeEditor, DiffEditor.',
    mistakes: '- Passing `tabs={[…]}` — there is no `tabs` prop; pass a `createTabbedEditor` instance via `instance`.',
  },

  'code/loadLanguage': {
    signature: '(language: EditorLanguage) => Promise<Extension>',
    example: `const ext = await loadLanguage('python') // the CodeMirror Extension
// createEditor({ language: 'python' }) now resolves instantly (cache warm)`,
    notes: 'Lazy-load a language grammar and return its CodeMirror `Extension`. All 19 non-plain identifiers ship a real grammar: json, typescript, javascript, jsx, tsx, python, css, html, markdown, rust, go, java, cpp, sql, xml, yaml, php from the modern `@codemirror/lang-*` packages, plus ruby and shell from `@codemirror/legacy-modes` (StreamLanguage). `plain` is intentionally empty. The result is cached per language; an uninstalled optional grammar package (or an unknown identifier) resolves to an empty `[]` extension (never throws). `createEditor` loads the grammar for its `language` on mount, so calling `loadLanguage` ahead of time just warms the cache. See also: createEditor, getAvailableLanguages.',
  },

  'code/minimapExtension': {
    signature: '() => Extension',
    example: `const editor = createEditor({ value: longCode, minimap: true })
// or: import { minimapExtension } from '@pyreon/code'`,
    notes: 'CodeMirror extension that renders a canvas-based code overview minimap. Enable via `createEditor({ minimap: true })` or add the extension manually to a CodeMirror state. See also: createEditor.',
  },

  'code/useEditorSignal': {
    signature: 'useEditorSignal<T>(options: BindEditorToSignalOptions<T>) => void',
    example: `function MyEditor() {
  const code = signal('console.log(1)')
  const editor = createEditor({ value: code(), language: 'javascript' })
  useEditorSignal({ editor, signal: code, serialize: (v) => v, parse: (t) => t })
  return <CodeEditor instance={editor} />
}`,
    notes: 'Component hook that two-way-binds an editor to a signal WITH automatic cleanup. It wraps `bindEditorToSignal` and registers `onUnmount(() => binding.dispose())`, so you do not manage the binding lifecycle yourself — unlike `bindEditorToSignal`, which returns a `{ dispose }` handle for user-owned lifecycles. Options: `{ editor, signal, serialize, parse, onParseError? }` — `signal` is any `SignalLike<T>`, `serialize` projects the value into editor text, `parse` reads it back. See also: bindEditorToSignal, createEditor.',
    mistakes: `- Calling it outside a component — it relies on \`onUnmount\` for cleanup, so it only works during component setup. For a manually-managed lifecycle use \`bindEditorToSignal\` (which returns a \`{ dispose }\` handle) and call \`dispose()\` yourself.
- Expecting a return value — it returns \`void\` (no binding handle); disposal is automatic. If you need to tear the binding down early, use \`bindEditorToSignal\` instead.
- A non-deterministic \`serialize\`/\`parse\` pair — the binding round-trips through both, so \`serialize(parse(serialize(x)))\` must equal \`serialize(x)\` or the editor and the signal fight each other.`,
  },

  'code/getAvailableLanguages': {
    signature: 'getAvailableLanguages() => EditorLanguage[]',
    example: `const languages = getAvailableLanguages()
// → ['javascript', 'typescript', 'python', 'plain', …]`,
    notes: `Return every supported language identifier (the keys of the internal grammar-loader registry) — for building a language picker. Pairs with \`loadLanguage(id)\`, which lazy-loads a grammar on demand. The set covers the bundled CodeMirror grammars plus \`'plain'\` (no highlighting). See also: loadLanguage, createEditor.`,
    mistakes: '- Assuming a returned id is already loaded — `getAvailableLanguages()` lists what CAN be loaded; the grammar itself is lazy. Pass the id to `createEditor({ language })` (or `loadLanguage(id)`) to actually load it.',
  },

  'code/darkTheme / lightTheme / resolveTheme': {
    signature: 'darkTheme: Extension · lightTheme: Extension · resolveTheme(theme: EditorTheme) => Extension',
    example: `const editor = createEditor({ value: code, theme: 'dark' })   // resolved internally
// or compose the raw extension yourself:
const extensions = [darkTheme /* , ...other CM extensions */]`,
    notes: `The built-in editor themes. \`lightTheme\` and \`darkTheme\` are CodeMirror \`Extension\`s (a clean light palette and a VS-Code-inspired dark one). \`darkTheme\` carries the \`{ dark: true }\` facet — the flag CodeMirror's dark-aware features AND this package's minimap key on (NOT a CSS class). \`resolveTheme(theme)\` maps \`'light'\`/\`'dark'\` to those extensions and passes a custom \`Extension\` through unchanged (\`EditorTheme = 'light' | 'dark' | Extension\`). You normally set \`createEditor({ theme })\` and let it resolve — reach for the raw extensions only when composing your own CodeMirror state. See also: createEditor, minimapExtension.`,
    mistakes: `- Toggling dark mode by swapping a CSS class — CodeMirror keys its dark-aware behavior (and this package's minimap) on the \`EditorView.darkTheme\` FACET carried by \`darkTheme\`, not a class. Provide \`darkTheme\` (or \`theme: 'dark'\`) so the facet is set.
- Passing a theme NAME other than 'light'/'dark' to \`resolveTheme\` — only those two strings map to a preset; any other value must be a real CodeMirror \`Extension\` (it is returned as-is).`,
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
useHotkey('escape', () => close(), { enableOnInputs: true })`,
    notes: `Register a keyboard shortcut that auto-unregisters when the component unmounts. Shortcut format: \`mod+s\`, \`ctrl+shift+p\`, \`escape\`, etc. \`mod\` is Command on Mac, Ctrl elsewhere. By default, shortcuts don't fire when focused on form elements (input, textarea, select) — override with \`enableOnInputs: true\`. Supports \`scope\` option for context-aware activation and \`description\` for introspection. See also: useHotkeyScope, registerHotkey, getHotkeyConflicts.`,
    mistakes: `- Forgetting e.preventDefault() for browser-reserved shortcuts (mod+s, mod+p) — the browser dialog fires alongside your handler. preventDefault is ON by default, but a stray { preventDefault: false } re-opens the browser dialog
- Registering the same shortcut twice in the same scope — both handlers fire on every press. Audit with getHotkeyConflicts() (it also catches aliased duplicates like ctrl+s vs control+s)
- Writing shift+? for a help shortcut — bind ? directly instead. A single-symbol key already implies shift, so ? fires on the real Shift+/ keystroke and shift+? never matches
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
    notes: 'Activate a hotkey scope for the lifetime of the current component. When the component mounts, the scope is enabled; when it unmounts, the scope is disabled. Shortcuts registered with a matching `scope` option only fire when the scope is active. Scope activation is REFERENCE-COUNTED — two components that both activate `editor` keep it active until BOTH unmount, so stacked panels / nested modals stay correct. Multiple scopes can be active concurrently; a hotkey fires when ITS scope is active. See also: useHotkey, enableScope, disableScope.',
    mistakes: `- Using useHotkeyScope outside a component body — the lifecycle hooks require an active setup context
- Expecting scopes to be hierarchical — activating \`editor\` does not implicitly activate \`editor/code\`; a hotkey fires only when its EXACT scope string is active
- Pairing imperative enableScope/disableScope unevenly — they are acquire/release, so an unmatched enableScope leaves the scope active until a matching disableScope releases it`,
  },

  'hotkeys/registerHotkey': {
    signature: '(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => () => void',
    example: `const unregister = registerHotkey('ctrl+q', () => quit(), { scope: 'global' })
// Later:
unregister()`,
    notes: 'Imperative hotkey registration for non-component contexts (stores, global setup). Returns an unregister function. Unlike useHotkey, this does NOT auto-cleanup on unmount — caller is responsible for calling the returned unregister function. See also: useHotkey.',
  },

  'hotkeys/getHotkeyConflicts': {
    signature: '() => ReadonlyArray<{ scope: string; shortcuts: string[]; descriptions: Array<string | undefined> }>',
    example: `registerHotkey('ctrl+s', saveA)
registerHotkey('control+s', saveB) // same combo, same (global) scope

getHotkeyConflicts()
// → [{ scope: 'global', shortcuts: ['ctrl+s', 'control+s'], descriptions: [undefined, undefined] }]`,
    notes: 'Detect registered shortcuts that would fire on the SAME keystroke within the SAME scope. Matching is on the PARSED combo, not the source string, so aliased duplicates (`ctrl+s` vs `control+s`, or `mod+s` vs `ctrl+s` off Mac) are caught. Cross-scope overlaps are intentional scope LAYERING and are NOT reported. Use it for a "keyboard shortcut audit" panel, a settings UI that warns on duplicate bindings, or a dev-time assertion in tests. See also: getRegisteredHotkeys, registerHotkey.',
  },

  'hotkeys/enableScope / disableScope / getActiveScopes': {
    signature: 'enableScope(scope: string) => void · disableScope(scope: string) => void · getActiveScopes() => Signal<Set<string>>',
    example: `// acquire a scope while a modal is open, release on close:
enableScope('modal')
// ...later, when the modal closes:
disableScope('modal')

// read active scopes reactively:
const active = getActiveScopes()
const isModalActive = () => active().has('modal')`,
    notes: `The reference-counted scope-activation API. \`enableScope\` ACQUIRES a scope (a modal, a panel) — it activates on the FIRST acquire and each further \`enableScope\` just bumps the refcount; \`disableScope\` RELEASES it, and the scope only deactivates once every acquire has been released. \`'global'\` is always active and cannot be enabled or disabled. \`getActiveScopes()\` returns the LIVE reactive \`Signal<Set<string>>\` of currently-active scope names. All three are no-ops on the server (scope state is client-runtime and must not bleed across requests). See also: useHotkeyScope, getRegisteredHotkeys.`,
    mistakes: `- Unbalanced acquire/release — every \`enableScope(s)\` MUST be matched by exactly one \`disableScope(s)\`. A missing release leaks the refcount and the scope stays active forever; an extra release is a harmless no-op (the count clamps at zero).
- Trying to toggle \`'global'\` — \`enableScope('global')\` / \`disableScope('global')\` are no-ops; the global scope is always active.
- Mutating the Set from \`getActiveScopes()\` — it returns the LIVE internal signal; call it to READ (\`getActiveScopes()().has(s)\`) and let \`enableScope\`/\`disableScope\` own the writes. Read it inside a reactive scope so it updates.`,
  },

  'hotkeys/getRegisteredHotkeys': {
    signature: 'getRegisteredHotkeys() => ReadonlyArray<{ shortcut: string; scope: string; description?: string }>',
    example: `registerHotkey('mod+k', openPalette, { description: 'Command palette' })
getRegisteredHotkeys()
// → [{ shortcut: 'mod+k', scope: 'global', description: 'Command palette' }]`,
    notes: 'Return a SNAPSHOT array of every registered hotkey — `{ shortcut, scope, description? }` per entry (`description` omitted when the registration set none). Built for a help dialog / keyboard-shortcut cheat-sheet. Pairs with `getHotkeyConflicts` for a settings-panel audit. See also: getHotkeyConflicts, registerHotkey.',
    mistakes: '- Expecting it to be reactive — it is a SNAPSHOT mapped at call time. Call it again after registrations change (or inside a reactive scope that re-reads it) to reflect new hotkeys.',
  },

  'hotkeys/parseShortcut / matchesCombo / formatCombo': {
    signature: 'parseShortcut(shortcut: string) => KeyCombo · matchesCombo(event: KeyboardEvent, combo: KeyCombo) => boolean · formatCombo(combo: KeyCombo) => string',
    example: `const combo = parseShortcut('mod+k')
document.addEventListener('keydown', (e) => {
  if (matchesCombo(e, combo)) openPalette()
})
formatCombo(combo) // → 'Ctrl+K' (or '⌘+K' on Mac)`,
    notes: `The combo utilities. \`parseShortcut\` turns a string (\`'mod+shift+k'\`) into a \`KeyCombo\` — lower-cased, \`+\`-split, with aliases (\`esc\`->\`escape\`, \`del\`->\`delete\`, \`space\`->space, \`up\`->\`arrowup\`, …) and \`mod\` resolving to META on Mac / CTRL elsewhere. \`matchesCombo\` tests a \`KeyboardEvent\` against a parsed combo. \`formatCombo\` renders a combo back to a display string (\`Ctrl+Shift+K\`; META shows as the \`⌘\` glyph on Mac). See also: useHotkey, registerHotkey.`,
    mistakes: `- Enforcing Shift for a SYMBOL key — \`matchesCombo\` deliberately does NOT require the Shift modifier for a single-character symbol key (\`?\`, \`!\`, \`+\`, \`/\`), so \`parseShortcut('?')\` matches the real \`Shift+/\` keystroke (the canonical 'show help' binding). Letters and named keys (\`a\`, \`arrowup\`) keep exact Shift-matching.
- \`mod\` is platform-dependent — \`parseShortcut('mod+s')\` yields META on Mac and CTRL elsewhere; do not hard-code \`ctrl\`/\`meta\` if you want cross-platform behavior.
- Round-tripping \`formatCombo\` back through \`parseShortcut\` — \`formatCombo\` is for DISPLAY (it emits the \`⌘\` glyph on Mac and capitalizes keys); it is not guaranteed to re-parse. Keep the original shortcut string if you need to re-parse it.`,
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
    notes: 'Create a reactive TanStack Table instance. Options are passed as a function so reactive signals (data, columns, sorting state) can be read inside and the table updates automatically when they change. Returns a Computed<Table<T>> — read it inside JSX expression thunks or effects to track state changes. Internal state management uses a version counter to force re-notification even when the table reference is the same object. See also: flexRender, flexRenderCell.',
    mistakes: `- Passing options as a plain object instead of a function — signal reads are not tracked and the table never updates when data changes
- Reading \`table\` without calling it — \`table\` is a Computed, you must call \`table()\` to get the Table instance
- Forgetting getCoreRowModel() — TanStack Table requires at least getCoreRowModel in options or it throws
- Using \`.map()\` on rows instead of \`<For>\` — loses Pyreon's keyed reconciliation, rebuilds the whole tbody on every change (worst-case DOM churn)
- Binding a value that CHANGES (a cell value, column width from \`getSize()\`, a sort indicator) as a STATIC prop/attr/child through a keyed \`<For>\` — the keyed cell is reused on a state change and its body never re-runs, so the value freezes. Read it inside a reactive closure at the point of use: cell content via \`<td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>\`, an attribute via \`style={() => ({ width: table().getColumn(id).getSize() + "px" })}\``,
  },

  'table/flexRender': {
    signature: '<TData extends RowData, TValue>(component: Renderable<TValue>, props: TValue) => unknown',
    example: `// Header:
flexRender(header.column.columnDef.header, header.getContext())
// Cell:
flexRender(cell.column.columnDef.cell, cell.getContext())`,
    notes: 'Render a TanStack Table column definition template (header, cell, or footer). Handles strings, numbers, functions (component functions or render functions), and VNodes. Returns the rendered output or null for undefined/null inputs. Use in JSX to render column definitions provided by TanStack Table. See also: useTable, flexRenderCell.',
    mistakes: `- Wrapping flexRender output in an extra function accessor — the result is already renderable JSX content
- Passing the column def directly instead of calling getContext() — TanStack Table requires the context object
- Using plain \`flexRender(cell…, cell.getContext())\` for a cell inside a keyed \`<For>\` when the cell VALUE can change in place — the captured \`cell\` is stale and the reused row never re-runs it, so it freezes. Use \`flexRenderCell(table, row.id, cell.column.id)\` for live cells.`,
  },

  'table/flexRenderCell': {
    signature: '<TData extends RowData>(table: Table<TData> | Computed<Table<TData>>, rowId: string, columnId: string) => unknown',
    example: `// Place inside an accessor child, passing the \`table\` ACCESSOR (not \`table()\`):
//   <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>
// so a single-cell edit patches ONLY that cell.
flexRenderCell(table, row.id, columnId)`,
    notes: `Fine-grained per-cell renderer for live cell values. Inside a keyed \`<For>\`, the \`row\`/\`cell\` objects are captured ONCE (the reconciler reuses the DOM node and never re-runs its body), so plain \`flexRender(cell…, cell.getContext())\` FREEZES when a value changes in place. \`flexRenderCell\` re-navigates to the live cell from the current row model each read — place it in an explicit accessor \`<td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>\`. Pass the Computed<Table> ACCESSOR (\`table\`, not \`table()\`) for fine-grained updates: the cell then subscribes to only its own row's signal, so an in-place data edit patches ONLY the changed rows' cells — matching a hand-memoized react-table row without any React.memo boilerplate. Returns null when the row is not in the current (filtered/paginated) row model. See also: useTable, flexRender.`,
    mistakes: `- Passing the resolved instance \`table()\` instead of the accessor \`table\` — still correct, but subscribes coarsely (every cell re-runs on any change) instead of fine-grained per-row
- Forgetting the explicit accessor wrapper \`{() => …}\` — without it the cell is captured once and freezes on the next change`,
  },
  // <gen-docs:api-reference:end @pyreon/table>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/virtual
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/virtual>

  'virtual/useVirtualizer': {
    signature: '(options: UseVirtualizerOptions) => UseVirtualizerResult',
    example: `const virtualizer = useVirtualizer(() => ({
  count: items().length,          // signal read inside the thunk → reactive
  getScrollElement: () => scrollRef,
  estimateSize: () => 35,
  overscan: 5,
}))

// Fixed-size list: read the captured item directly (start is invariant per index).
<For each={() => virtualizer.virtualItems()} by={(row) => row.index}>
  {(row) => <div style={() => \`transform: translateY(\${row.start}px)\`}>{row.index}</div>}
</For>`,
    notes: 'Create an element-scoped virtualizer. Attach to a scrollable container via `getScrollElement`. Returns reactive `virtualItems()`, `totalSize()`, and `isScrolling()` signals; a fine-grained per-index `item(index)` accessor (`start`/`size`/`lane`); plus `instance.scrollToIndex()` / `scrollToOffset()`. Options that accept functions (`count`, `estimateSize`) track signal reads reactively. Render rows with a keyed `<For by={row => row.index}>` so a scroll patches only the entering/leaving rows — staying rows do zero work. See also: useWindowVirtualizer.',
    mistakes: `- Forgetting to set a fixed height on the scroll container — without overflow:auto + a height, the virtualizer has no viewport to measure
- Passing options as a plain object instead of a function — useVirtualizer takes a thunk \`() => ({ ... })\`, so signal reads inside it (e.g. \`count: items().length\`) are tracked and the virtualizer updates when the list changes
- Reading virtualItems() outside a reactive scope — captures the initial window only, never updates on scroll
- Using .map() instead of <For> on virtualItems — .map() re-mounts EVERY visible row on every scroll (no keyed reconciliation); a keyed <For by={row => row.index}> reuses staying rows so only entering/leaving rows touch the DOM
- Reading a captured \`<For>\` item.start for DYNAMICALLY-measured lists (measureElement) — a staying row is NOT re-rendered when a remeasure above it shifts its position, so it goes stale. Use item(row.index).start() (a per-index signal) instead — required for dynamic sizing, still fine-grained
- Passing a \`styled()\` scroll container \`innerRef\` instead of \`ref\` — a styled component forwards plain \`ref\` to its DOM node; innerRef is a silent no-op there, so getScrollElement returns null and the list renders ZERO rows`,
  },

  'virtual/useWindowVirtualizer': {
    signature: '(options: UseWindowVirtualizerOptions) => UseWindowVirtualizerResult',
    example: `const virtualizer = useWindowVirtualizer(() => ({
  count: items().length,
  estimateSize: () => 50,
}))

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
  schema: z.object({
    title: z.string().min(1),
    body: z.string(),
  }),
  api: '/api/posts',
})

Posts.useList({ page: 1, pageSize: 20 }) // data() is Post[]
Posts.useById('123')
Posts.useCreate().mutate({ title: 'Hi', body: '…' })
Posts.useForm({ mode: 'edit', id: '123' })   // returns a FormState
Posts.useTable(() => items() ?? [], { columns: ['title'] })`,
    notes: 'Define a schema-driven CRUD feature. `config` is `{ name, schema, api, validate?, initialValues?, fetcher? }`. `schema` does TWO independent jobs: VALIDATION works for Zod OR any Standard Schema (Valibot / ArkType — its callable schema included — / modern Zod / @pyreon/validate’s `s`), routed through @pyreon/validation so errors surface on the right field; FIELD INTROSPECTION (auto form fields, table columns, create-form defaults via `fields`) is Zod-ONLY, so a Valibot/ArkType feature must pass `initialValues` explicitly (a one-time dev warning flags it). `api` is the string base path (e.g. `/api/posts`); Zod carries `_output` so TValues is inferred. Returns a Feature object with auto-generated reactive members: `useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`, `useForm`, `useTable`, `useStore`, `queryKey`, plus `name` / `api` / `schema` / `fields`. The query hooks + `useStore` are schema-agnostic (they only touch `api`). Composes @pyreon/query (data fetching), @pyreon/form (FormState), @pyreon/validation (schema validation), @pyreon/store (global state), and @pyreon/table (table configuration). REST endpoints are derived from `api`: `GET /` (list), `GET /:id` (item), `POST /` (create), `PUT /:id` (update), `DELETE /:id` (delete); each mutation invalidates the list query on success. See also: reference, extractFields, defaultInitialValues.',
    mistakes: `- Forgetting to install peer dependencies — defineFeature composes @pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table internally
- Using defineFeature without a QueryClient provider — useList/useById/useSearch/useCreate/useUpdate/useDelete all depend on @pyreon/query which requires a QueryClient in context
- Passing a plain string-map (\`{ title: "string" }\`) as the schema — \`schema\` must be a real validator (a Zod object such as \`z.object({ title: z.string() })\`, or any Standard Schema); a non-validator yields no fields and no validation
- Expecting auto form fields / table columns from a Valibot or ArkType schema — field INTROSPECTION is Zod-only (validation works for all of them). With a non-Zod schema, \`useForm()\` has no fields (setFieldValue throws) and \`useTable()\` has no columns until you supply \`initialValues\` + build the table via @pyreon/table directly. defineFeature dev-warns when this happens.
- Passing \`api\` as an object (\`{ baseUrl: "…" }\`) — \`api\` is a plain string base path; there are no per-endpoint override fields (the REST routes are derived from it)
- Passing a bare id to useForm — useForm takes an OPTIONS object: \`useForm({ mode: "edit", id })\` for edit, \`useForm()\` (or \`useForm({ initialValues })\`) for create
- Passing options as useTable’s first argument — useTable takes the DATA first (\`useTable(data, { columns })\`), not \`useTable({ columns })\``,
  },

  'feature/reference': {
    signature: 'reference(target: { name: string }) => ReferenceSchema',
    example: `const Users = defineFeature({
  name: 'users',
  schema: z.object({ name: z.string() }),
  api: '/api/users',
})

const authorRef = reference(Users)            // FK to the users feature
authorRef.safeParse('user-42').success         // true (string id)
reference({ name: 'categories' })             // or pass a plain { name }`,
    notes: 'Mark a schema field as a foreign-key reference to another feature. Pass a Feature object (it has a `name`) or a plain `{ name: "…" }` — NOT a string. Returns a `ReferenceSchema`: a Zod-string-compatible marker (`safeParse` / `safeParseAsync` accept string or number ids, reject everything else) carrying a `Symbol.for(...)` tag invisible to `JSON.stringify` but detected by `isReference()` and `extractFields()`. Use it for the id-bearing field of a relationship; the generated form / table hooks can then render reference-aware UI. See also: defineFeature, isReference.',
    mistakes: `- Passing a plain string instead of a Feature ref — \`reference("users")\` will not typecheck; pass the Feature object or \`{ name: "users" }\`.
- Forgetting that the referenced Feature must ALSO be defined via defineFeature — the FK only works end-to-end when both sides are real Features sharing the same QueryClient.
- Expecting reference() to enforce schema validation at the foreign side — it only marks the field. Cascade behaviour (deleting a user → orphaning posts) is the consumer's concern.`,
  },

  'feature/isReference': {
    signature: 'isReference(value: unknown) => value is ReferenceSchema',
    example: `import { isReference, reference } from '@pyreon/feature'

isReference(reference({ name: 'users' })) // true
isReference(z.string())                    // false — a plain Zod schema
isReference('users')                       // false — a bare string is not a reference`,
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
    mistakes: `- Calling extractFields on a value that is not a real validator (e.g. a plain \`{ title: "string" }\` map) — it expects a Zod / Valibot / ArkType shape; a non-validator yields an empty field list.
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
    notes: 'Generate sensible default initial values from extracted field info. Returns `{ stringField: "", numberField: 0, booleanField: false, enumField: <first enumValue>, dateField: "", arrayField: [], objectField: {}, referenceField: null }`. Used by `Posts.useForm()` to seed an empty form in create mode (no `id`). Exposed for consumers building their own form initial-value seeding logic. See also: extractFields, defineFeature.',
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
    notes: '94 rules across 18 categories. Auto-loads `.pyreonlintrc.json`. Presets: `recommended`, `strict`, `app`, `lib`. Per-rule options via tuple form in config (`["error", { exemptPaths: [...] }]`) or `ruleOptionsOverrides`. Wrong-typed options surface on `result.configDiagnostics`. Uses `oxc-parser` with AST caching. See also: lintFile, getPreset, AstCache.',
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
pyreon-lint --list                      # list all 94 rules
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

  'mcp/explain_reactivity': {
    signature: 'tool: explain_reactivity({ code: string; filename?: string }) → ReactivityMap',
    example: `explain_reactivity({ code: \`
function Cart(props) {
  const { qty } = props            // → footgun: props-destructured-body
  const price = signal(9.99)
  return <div>{qty} × {price()}</div>  // {qty} → baked once (dead), {price()} → live
}
\` })`,
    notes: `The compiler's per-expression reactivity VERDICT for a snippet. The Pyreon compiler already decides, while emitting codegen, whether each JSX expression is reactive or baked static — \`explain_reactivity\` surfaces that ground truth via \`analyzeReactivity\`: every expression classified \`live\` / \`live prop\` / \`live attr\` / \`baked once\` / \`hoisted static\`, merged with the \`detectPyreonPatterns\` footguns, over an annotated source view. Where \`validate\` reports BUGS, this reports the whole MAP: an agent sees that \`<div>{qty}</div>\` compiled to \`baked once\` (dead) BEFORE it ships the stale-closure / destructured-props / static-when-meant-reactive bug. The reactivity 'type-check' surface for AI agents. See also: validate, get_anti_patterns.`,
    mistakes: `- Confusing it with \`validate\` — \`validate\` lists anti-patterns; \`explain_reactivity\` classifies EVERY expression live/static so you can spot a binding that silently won't update even when no footgun fires.
- Passing a partial expression instead of a full component — the compiler needs complete JSX to classify bindings; a fragment yields "No reactive expressions detected".
- Reading a \`baked once\` verdict as an error — static is often correct (literal text, one-time content). It is only a bug when that expression was MEANT to update; the tool flags the shape, you decide intent.`,
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

  'mcp/migrate_pyreon': {
    signature: 'tool: migrate_pyreon({ code: string; filename?: string }) → PyreonMigrationResult',
    example: `migrate_pyreon({ code: \`
const count = signal(0)
count(1)                                       // → count.set(1)
const list = <For each={a} key={k}>{…}</For>   // → <For each={a} by={k}>
const node = (x as unknown as VNodeChild)      // → x
\` })`,
    notes: 'The Pyreon → correct-Pyreon codemod (parallel to `migrate_react`). Auto-fixes ONLY the mechanically-safe footguns `validate` / `explain_reactivity` flag — `sig(v)` → `sig.set(v)`, `<For key={k}>` → `<For by={k}>`, and dropping `x as unknown as VNodeChild` — and returns every OTHER detected footgun (props-destructured, on-click-undefined, raw-add-event-listener, …) as a manual-fix list. This is what makes those three `detectPyreonPatterns` codes report `fixable: true`; a conservative codemod (span-based, idempotent, non-overlapping) that never mangles code, so an agent can apply the result verbatim. See also: validate, explain_reactivity, migrate_react.',
    mistakes: `- Expecting it to fix everything \`validate\` flags — only the three mechanically-safe codes are auto-fixed; the rest (props-destructured, on-click-undefined, raw-add-event-listener, date-math-random-id) need human judgement and come back in \`remaining\`.
- Running it as a formatter — it only rewrites the flagged footgun spans; whitespace / style elsewhere is untouched (pair with your formatter).
- Skipping \`validate\` afterwards — \`migrate_pyreon\` clears the mechanical footguns, but re-run \`validate\` to confirm the \`remaining\` (human) issues are addressed.`,
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

  'ui-core/useThemeValue': {
    signature: 'useThemeValue<T = unknown>(path: string) => T | undefined',
    example: `const primary = useThemeValue<string>('colors.primary')`,
    notes: 'Deep-reads a dot-path from the styler theme (e.g. `"colors.primary"`), returning the value or `undefined`. A convenience over `useTheme()` + manual traversal. Lives in `@pyreon/ui-core` so the ui-system owns its theme-reader hooks without depending on the `@pyreon/hooks` fundamentals package. See also: useRootSize, useSpacing.',
    mistakes: '- Returns a PLAIN value captured once — NOT an accessor and NOT reactive; it will not update on a theme swap. For a value that tracks the theme, read `useThemeAccessor()` from `@pyreon/styler` inside a reactive scope.',
  },

  'ui-core/useRootSize': {
    signature: 'useRootSize() => { rootSize: number; pxToRem: (px: number) => string; remToPx: (rem: number) => number }',
    example: `const { pxToRem } = useRootSize()
<div style={{ padding: pxToRem(24) }}>…</div>`,
    notes: 'Reads the styler theme root font size (default `16`) and returns it plus `pxToRem` / `remToPx` converters. Requires a theme context (falls back to 16 otherwise). Lives in `@pyreon/ui-core` — a ui-system theme-reader hook. See also: useSpacing, useThemeValue.',
    mistakes: '- `rootSize` is a plain number captured ONCE at call time — NOT reactive. The converters close over that snapshot, so a later whole-theme swap will not update an already-returned result (re-mount the consumer to pick up a new root size).',
  },

  'ui-core/useSpacing': {
    signature: 'useSpacing(base?: number) => (multiplier: number) => string',
    example: `const spacing = useSpacing()
<div style={{ gap: spacing(2) }}>…</div>  // "16px"`,
    notes: 'Returns a `spacing(multiplier)` function producing a px string. The unit is `base ?? rootSize/2` (default 8px), read from the theme via `useRootSize`. Lives in `@pyreon/ui-core` — a ui-system theme-reader hook. See also: useRootSize, useThemeValue.',
    mistakes: '- The unit is computed once from a non-reactive `rootSize` snapshot — the returned `spacing` function is static; a theme change will not affect an already-obtained function.',
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
    signature: 'const breakpoints: { rootSize: number; breakpoints: Record<string, number> }',
    example: `import { breakpoints } from '@pyreon/unistyle'

breakpoints.breakpoints // { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1440 }
breakpoints.rootSize    // 16`,
    notes: 'The default breakpoint configuration — a constant `{ rootSize, breakpoints }` object, NOT a function. `breakpoints.breakpoints` is the min-width map keyed by name (`xs` 0, `sm` 576, `md` 768, `lg` 992, `xl` 1200, `xxl` 1440) and `breakpoints.rootSize` is 16. The same values are folded into `enrichTheme()` output, so most consumers read the enriched theme rather than this constant. Use it when you need the defaults outside a theme context (e.g. building a custom theme or seeding `createMediaQueries`). See also: enrichTheme, createMediaQueries.',
  },

  'unistyle/createMediaQueries': {
    signature: 'createMediaQueries(options: { breakpoints: Record<string, number>; rootSize: number; css: CssFn }): Record<string, (strings: TemplateStringsArray, ...values: unknown[]) => string>',
    example: `import { createMediaQueries, breakpoints } from '@pyreon/unistyle'
import { config } from '@pyreon/ui-core'

const queries = createMediaQueries({
  breakpoints: breakpoints.breakpoints,
  rootSize: breakpoints.rootSize,
  css: config.css,
})
// each value is a tagged-template that wraps CSS in that breakpoint @media block:
// queries.sm\`color: red\` → '@media only screen and (min-width: 36em) { color: red }'`,
    notes: 'Build a record of media-query tagged-templates keyed by breakpoint name from a `{ breakpoints, rootSize, css }` options bag (NOT a bare breakpoints argument). Each value is a FUNCTION — a `css` tagged-template that wraps the interpolated CSS in that breakpoint `@media (min-width)` block (the `0` breakpoint passes through unwrapped). Widths convert to `em` via `rootSize`. Used internally by `enrichTheme()` (stored on `theme.__PYREON__.media`); call directly when composing custom CSS-in-JS rules outside the responsive-prop pipeline. See also: breakpoints, makeItResponsive.',
  },

  'unistyle/makeItResponsive': {
    signature: 'makeItResponsive(options: { css: CssFn; styles: MakeItResponsiveStyles; theme?: object; key?: string; normalize?: boolean }): (props) => CSSResult | string',
    example: `import { makeItResponsive } from '@pyreon/unistyle'
import type { MakeItResponsiveStyles } from '@pyreon/unistyle'
import { config } from '@pyreon/ui-core'

const { css } = config

// The \`styles\` callback receives the resolved per-breakpoint theme (typed via
// the generic). makeItResponsive returns a styled-component interpolation.
const styles: MakeItResponsiveStyles<{ padding?: string }> = ({ theme: t, css: cssFn }) =>
  cssFn\`padding: \${t.padding};\`

const responsive = makeItResponsive({ key: '$box', css, styles, normalize: true })
// styled('div')\`\${responsive}\` — reads the component theme prop, emits @media queries`,
    notes: 'Build a styled-component interpolation from a `styles` callback. This is NOT a value resolver — it returns a FUNCTION that, given component props, reads the theme (via `key` or `props.theme`) and emits the mobile-first `@media` cascade. The `styles` callback (a `MakeItResponsiveStyles`) receives the resolved per-breakpoint `{ theme, css, rootSize }` and returns the CSS for that breakpoint; when the theme carries responsive per-breakpoint values, makeItResponsive normalizes then transforms then optimizes them into `@media (min-width)` blocks (mobile-first, only deltas emitted). `key` scopes which prop bag holds the theme; `normalize` toggles the breakpoint normalization; pass the `css` tag from `@pyreon/ui-core` `config`. Drop the returned interpolation into a styled template literal. See also: createMediaQueries, styles.',
    mistakes: `- Passing \`{ value, property }\` — makeItResponsive is a styled-component interpolation factory, not a value resolver; provide a \`styles\` callback plus the \`css\` tag from \`@pyreon/ui-core\` config
- Passing CSS-spec property names (\`borderTopWidth\`) inside the styles callback — unistyle uses property-first naming (\`borderWidthTop\`); the responsive transformer expects the unistyle convention
- Forgetting to pass an enriched theme — without \`theme.__PYREON__\` (populated by \`enrichTheme\`), per-breakpoint values fall back to the base value at every breakpoint
- Expecting a \`null\` slot in a mobile-first array to fill from the LAST element — a \`null\`/\`undefined\` slot is a SKIP that inherits the PREVIOUS breakpoint (\`["red", null, "blue"]\` = xs red, sm inherits red, md blue), identical to a breakpoint object with a missing key`,
  },

  'unistyle/styles': {
    signature: 'styles(options: { theme: InnerTheme; css: CssFn; rootSize?: number; globalTheme?: object }): CSSResult',
    example: `import { styles } from '@pyreon/unistyle'
import { config } from '@pyreon/ui-core'

const { css } = config
const rules = styles({ theme: { padding: '8px', color: '#222' }, css })
// → the resolved CSS declarations for the given theme`,
    notes: 'Generate the CSS for a flat theme object — box-model, typography, spacing, border, and layout declarations resolved from a `{ theme, css }` options bag (NOT a bare theme argument). Returns the `css`-tagged result. Used to produce the declarations that back every styled component. Most consumers do not call this directly; the `PyreonUI` provider invokes it internally on theme mount. See also: enrichTheme, extendCss.',
  },

  'unistyle/alignContent': {
    signature: 'alignContent(options: { alignX?: AlignContentAlignXKeys; alignY?: AlignContentAlignYKeys; direction?: AlignContentDirectionKeys }): string | null',
    example: `import { alignContent } from '@pyreon/unistyle'

alignContent({ direction: 'rows', alignX: 'center', alignY: 'top' })
// → 'flex-direction: column; align-items: center; justify-content: flex-start;'

alignContent({ direction: 'inline', alignX: 'spaceBetween', alignY: 'center' })
// → 'flex-direction: row; align-items: center; justify-content: space-between;'`,
    notes: 'Resolve `direction` / `alignX` / `alignY` shorthand to the matching flex CSS (`flex-direction`, `align-items`, `justify-content`). The Element / Row / Column primitives use this internally — it is exposed for custom layout components that want the same alignment semantics. `direction` is one of `inline` / `reverseInline` / `rows` / `reverseRows` (`inline` maps to `row`, `rows` to `column`; the `inline` variants swap which axis alignX / alignY drive). Returns `null` when any of the three inputs is missing. See also: makeItResponsive.',
  },

  'unistyle/extendCss': {
    signature: 'extendCss(styles: ((css: CssFn) => string) | string | null | undefined): string',
    example: `import { extendCss } from '@pyreon/unistyle'

extendCss('color: red;')                    // → 'color: red;'  (string returned as-is)
extendCss((css) => css\`color: \${'red'};\`)   // → 'color: red;'  (callback invoked)
extendCss(undefined)                         // → ''             (nullish → empty string)`,
    notes: 'Flatten a CSS definition to a string. Takes a SINGLE argument that is either a css-callback (invoked with a simple `css` tag, its result returned), a raw CSS string (returned as-is), or `null` / `undefined` (returns an empty string). Used by rocketstyle dimension chains + the elements / coolgrid styled helpers to inline a component `extraStyles` / `extendCss` prop. NOT an object deep-merge — it takes ONE argument and never layers a base with an override. See also: styles.',
  },

  'unistyle/stripUnit': {
    signature: 'stripUnit(value: string | number, unitReturn?: boolean): number | string | [number | string, string | undefined]',
    example: `import { stripUnit } from '@pyreon/unistyle'

stripUnit('16px')       // → 16
stripUnit('1.5rem')     // → 1.5
stripUnit(16)           // → 16
stripUnit('24px', true) // → [24, 'px']
stripUnit('auto', true) // → ['auto', undefined]`,
    notes: 'Strip the unit suffix from a CSS value and return the numeric part (`"16px"` → `16`, `"1.5rem"` → `1.5`). A number passes through unchanged, and a string that is NOT a `<number><unit>` shape (e.g. `"calc(…)"`, `"auto"`) is returned verbatim. Pass `unitReturn: true` to get the `[value, unit]` tuple instead (`"24px"` → `[24, "px"]`; an unmatched string → `[value, undefined]`). Useful for arithmetic on theme values declared as strings without hand-parsing. See also: value, values.',
  },

  'unistyle/value': {
    signature: `value(input: string | number | null | undefined, rootSize?: number, outputUnit?: 'rem' | 'px' | '%' | 'em' | 'vh' | 'vw' | string): string | number | null`,
    example: `import { value } from '@pyreon/unistyle'

value(16)            // → '1rem'   (16 / rootSize 16)
value(24)            // → '1.5rem'
value(0)             // → 0        (always unitless)
value('16px')        // → '1rem'   (px → rem)
value('2em')         // → '2em'    (other units pass through)
value('calc(100% - 8px)') // → 'calc(100% - 8px)'  (verbatim passthrough)
value(16, 16, 'px')  // → '16px'   (outputUnit override)`,
    notes: 'Convert ONE numeric/string CSS value to its final unit string. A unitless number is divided by `rootSize` (default 16) and emitted in `outputUnit` (default `rem`): `value(16)` → `"1rem"`, `value(24)` → `"1.5rem"`, `value(8)` → `"0.5rem"`. `0` always stays unitless (`0`). A `px` string is converted to rem (`value("16px")` → `"1rem"`); any other-unit string (`"2em"`, `"50%"`) and any non-numeric string (`"calc(100% - 8px)"`, `"var(--x)"`, `"auto"`) pass through verbatim — this passthrough is what lets `themeToCssVars` var leaves flow untouched. `null`/`undefined`/`""` return `null`. Pass `outputUnit: "px"` to keep a unitless number in pixels (`value(16, 16, "px")` → `"16px"`). The companion `values()` picks the first non-nullish item then applies the same conversion. NOTE: the second parameter is `rootSize` (the px→rem divisor), NOT a fallback. See also: stripUnit, values.',
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
    notes: `Returns a \`ComponentFn\` that injects GLOBAL CSS (resets, \`:root\` tokens, body styles) when MOUNTED — it is not a side-effecting call. Render the returned component once near the app root. The injected rule PERSISTS for the document's lifetime, deduped by content hash — like emotion's \`injectGlobal\`, and UNLIKE styled-components' \`createGlobalStyle\`, it is NOT removed on unmount (a global reset shouldn't vanish when the mounting component re-renders away). Function interpolations make the global block dynamic (re-resolves on prop/theme change). See also: styled, css.`,
    mistakes: `- Calling \`createGlobalStyle\` (the tagged template) and expecting the CSS to inject — nothing happens until the returned component is RENDERED. Mount \`<GlobalReset />\` once near the root
- Expecting the global CSS to be removed when the component unmounts — it persists (deduped by hash), matching emotion \`injectGlobal\` not styled-components. Toggle globals with a class/attribute on \`:root\`, not by mounting/unmounting the component`,
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
    notes: `Creates an ISOLATED \`StyleSheet\` instance (its own FNV-1a dedup cache + rule registry) instead of the shared singleton \`sheet\`. Use for shadow-DOM roots, multi-window/iframe rendering, per-request SSR isolation, or test isolation where one request/realm must not share the global dedup cache. Options: \`maxCacheSize\`, \`layer\` (wrap scoped rules in an \`@layer\`), and \`nonce\` (CSP — stamps the SSR \`<style>\` from \`getStyleTag()\` and the client \`<style>\` element with a \`nonce\` so a strict \`style-src 'nonce-…'\` policy admits the critical CSS). Most apps never need this — the singleton is correct for a single document. See also: StyleSheet, sheet.`,
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

  'styler/hash / hashUpdate / hashFinalize / HASH_INIT': {
    signature: 'hash(str: string) => string — hashUpdate(state: number, str: string) => number — hashFinalize(state: number) => string — HASH_INIT: number',
    example: `import { hash, hashUpdate, hashFinalize, HASH_INIT } from "@pyreon/styler"
hash("color:red")  // e.g. "1a2b3c"
hashFinalize(hashUpdate(hashUpdate(HASH_INIT, "a"), "b")) === hash("ab")`,
    notes: 'The FNV-1a non-cryptographic hash styler uses for compact, deduped class names + rule keys. `hash(str)` is the one-shot form → a base-36 string. The streaming trio composes it: `hashUpdate(HASH_INIT, "ab")` folds bytes into a running 32-bit numeric state, `hashFinalize(state)` renders `(state >>> 0).toString(36)`, and `hashUpdate(hashUpdate(HASH_INIT, "ab"), "cd") === hash("abcd")`. Exported for tooling/consumers that need the SAME class-name hash styler emits (e.g. precomputing a class name before injection). Low-level — most apps never call it. See also: createSheet, styled.',
    mistakes: `- Using it for anything security-sensitive — FNV-1a is NON-cryptographic (fast, collision-cheap for CSS keys, NOT collision-resistant against adversarial input).
- Feeding the base-36 STRING from \`hashFinalize\` back into \`hashUpdate\` — the streaming state is the 32-bit NUMBER; keep folding numbers with \`hashUpdate\` and call \`hashFinalize\` ONCE at the end.`,
  },

  'styler/setStyleExtraction': {
    signature: 'setStyleExtraction(enabled: boolean, rewrite?: (cssText: string, varsOut: Record<string, string>) => string) => void',
    example: `// Apps enable CPSE through ui-core, not this call:
import { init } from "@pyreon/ui-core"
init({ styleExtraction: true }) // ui-core calls setStyleExtraction under the hood`,
    notes: `Internal dependency-injection seam for Custom-Property Style Extraction (CPSE). \`@pyreon/ui-core\`'s \`init({ styleExtraction: true })\` calls this to enable CPSE and inject the \`cpseRewrite\` function — which lives in \`@pyreon/unistyle\` (styler cannot import unistyle: dep direction), so it is threaded in at init time. When on, the static + SSR resolve path rewrites resolved CSS to hoist per-instance values into custom properties. Apps do NOT call this directly — enable CPSE via the \`@pyreon/ui-core\` init flag; it is exported only so ui-core can wire it. See also: styled, createSheet.`,
    mistakes: '- Calling `setStyleExtraction(true)` directly to turn on CPSE — without the `rewrite` from `@pyreon/unistyle` (which `@pyreon/ui-core` supplies) it enables the branch with no rewriter. Use `init({ styleExtraction: true })` from `@pyreon/ui-core`.',
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
    mistakes: `- Expecting a signal-driven \`tag={sig()}\` / \`paragraph={sig()}\` to swap the rendered element — \`tag\` and \`paragraph\` are STATIC (mount-time) by design; the styled layer applies \`as\` once per mount and a reactive tag swap is architecturally unsupported. To change the tag, REMOUNT (e.g. wrap in \`<Show>\`).
- Passing BOTH \`children\` and \`label\` expecting them to concatenate — Text resolves \`children ?? label\`, so \`children\` WINS and \`label\` is ignored. \`label\` is the inline-syntax alternative to \`children\`, not an extra slot.
- Driving structure through a signal but styling through a static value — it is the inverse: \`css\` IS reactive (a signal-driven \`css\` re-resolves with a class swap, no remount), while \`tag\` is NOT. Put dynamic STYLING in \`css\`; put dynamic STRUCTURE behind a remount.`,
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

<Overlay
  type="dropdown"
  openOn="click"
  trigger={(t) => <button ref={t.ref}>Open menu</button>}
>
  {(c) => (
    <ul ref={c.ref}>
      <li>Profile</li>
      <li>Sign out</li>
    </ul>
  )}
</Overlay>`,
    notes: 'A positioned layer (dropdown / modal / tooltip / popover) with an optional backdrop, driven internally by `useOverlay`. It handles viewport flipping, ESC-to-close, click-outside, scroll tracking, and hover delay — do NOT reimplement any of that in a primitive; compose `Overlay` (or `useOverlay`) instead. Takes a `trigger` render prop (receives `{ ref, active, showContent, hideContent }` — attach `ref` to the anchor) and a content render prop as `children` (receives `{ ref, active, align, alignX, alignY, … }` — attach `ref` to the floating node); the content renders through `Portal` so the layer escapes overflow/stacking contexts. `align`/`alignX`/`alignY` reach the content as LIVE reactive props, so a viewport-edge flip re-styles the content in place without remounting it. See also: useOverlay, OverlayProvider, Portal.',
    mistakes: `- Hand-rolling positioning / flip / click-outside / ESC logic in a tooltip or dropdown primitive — \`useOverlay\` already owns all of it; reimplementing drifts from the shared behavior
- Forgetting to attach the \`ref\` the trigger / content render props receive — without it the hook cannot measure, position, wire click-outside, or restore focus (the layer renders at the document origin)
- Reading the rendered overlay as \`document.body.firstChild\` — it renders through \`Portal\` into a per-instance wrapper; traverse the wrapper, not body’s direct child`,
  },

  'elements/useOverlay': {
    signature: 'useOverlay(props?: Partial<UseOverlayProps>): { triggerRef, contentRef, active, align, alignX, alignY, showContent, hideContent, blocked, setBlocked, setUnblocked, setContentPosition, setupListeners, Provider }',
    example: `import { useOverlay } from "@pyreon/elements"

const o = useOverlay({ openOn: "hover", type: "tooltip", hoverDelay: 150 })
// attach o.triggerRef to the anchor and o.contentRef to the floating layer;
// read o.active() for open state; call o.showContent() / o.hideContent()`,
    notes: 'The positioning + interaction engine `Overlay` is built on, exposed for headless consumers. Returns `triggerRef` / `contentRef` (attach to the anchor + floating node), the `active` open-state signal, the resolved `align` accessor + `alignX` / `alignY` signals, `showContent` / `hideContent` (programmatic control), and `setContentPosition` (reposition when the content SIZE changes while open — async option lists). Options: `openOn` / `closeOn` (`click` | `hover` | …), `type` (`dropdown` | `modal` | …), `position` (`fixed` | …), `align` + `alignX` / `alignY` + `offsetX` / `offsetY`, `closeOnEsc`, `hoverDelay`, `throttleDelay`, `parentContainer`, `disabled`, `onOpen` / `onClose`. Focus management is built in: focus returns to the opener on close (all types), and `type: "modal"` additionally moves focus into the content on open and traps Tab / Shift+Tab within it (the WAI-ARIA dialog pattern — no extra wiring). Listeners auto-attach on mount (idempotent) — a hover overlay keeps open while the pointer is over its content (the content listeners re-bind as it mounts). SSR-safe: the internal positioning + focus helpers early-return under no-`window`. See also: Overlay, OverlayProvider.',
    mistakes: `- Reading \`o.isOpen\` / spreading \`o.triggerProps\` / \`o.overlayProps\` — those do not exist; the hook returns \`active\` (a signal), \`triggerRef\` / \`contentRef\` (ref callbacks), and \`showContent\` / \`hideContent\`
- Passing \`align\` as a function accessor — it is a value option, not a signal accessor; let the compiler wrap reactive values
- Expecting positioning to run during SSR — the helpers are guarded and no-op without \`window\`; positioning happens post-mount on the client
- Reaching for \`addEventListener\` for outside-click / scroll instead of letting \`useOverlay\` own the listener lifecycle — it self-cleans on unmount`,
  },

  'elements/OverlayProvider': {
    signature: 'OverlayProvider(props?: Partial<OverlayContext> & { children?: VNodeChild }): VNodeChild',
    example: `import { OverlayProvider } from "@pyreon/elements"

<OverlayProvider>
  <App />
</OverlayProvider>`,
    notes: 'Context provider that lets nested overlays coordinate (a child overlay blocks its parent from closing while it is open). The coordination props (`blocked` / `setBlocked` / `setUnblocked`) are OPTIONAL — a root `<OverlayProvider>` establishes the context with no-op defaults, while `Overlay` supplies real ones internally via `useOverlay`. `useOverlay` reads it through `useOverlayContext`. Marked `nativeCompat` so it works correctly inside `@pyreon/{react,preact,vue,solid}-compat` apps (its `provide()` runs in Pyreon’s setup frame, not the compat wrapper accessor). See also: useOverlay, Overlay.',
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
    signature: 'Util(props: { children: VNodeChild; className?: string | string[]; style?: object }): VNodeChild',
    example: `import { Util } from "@pyreon/elements"

// No wrapper div — the child gets the class/style merged in:
<Util className="highlight" style={{ opacity: 0.5 }}>
  <SomeChild />
</Util>`,
    notes: 'Injects a `className` and/or inline `style` into its CHILD, adding NO DOM node of its own — it CLONES the child (via core `render`) with the merged props. Use it to stamp a class or inline style onto a child you do not otherwise control (a component that forwards to a single DOM node) without introducing an extra wrapper element. Reactive: a getter-shaped `className={cls()}` re-reads per change. It is NOT an Element-family layout node — it has no `tag` / `direction` / `alignX` / `alignY` / `gap`. See also: Element.',
    mistakes: `- Expecting Util to render its own wrapper element (a \`<div>\`) — it adds NO DOM node; it CLONES its child and merges \`className\`/\`style\` onto it. There is no \`tag\`.
- Passing layout props (\`direction\` / \`alignX\` / \`gap\`) — Util only accepts \`children\` / \`className\` / \`style\`; layout props are ignored. Use \`Element\` for layout.`,
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
    signature: 'Readonly<{ filter, map, flatMap, sortBy, groupBy, countBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample, count, sum, min, max, average, reduce, every, some, distinct, scan, combine, zip, merge, debounce, throttle, search, pipe }>',
    example: `const users = signal<{ name: string; age: number; department: string; active: boolean }[]>([])
const active = rx.filter(users, u => u.active)       // Computed<User[]>
const sorted = rx.sortBy(active, 'name')             // Computed<User[]>
const total = rx.sum(users, u => u.age)              // Computed<number>
const grouped = rx.groupBy(users, u => u.department) // Computed<Record<string, User[]>>`,
    notes: 'Namespaced object exposing all 39 reactive transform functions plus `pipe`. Use `rx.filter(...)` for dot-notation style, or destructure individual functions for tree-shaking. Every function is overloaded: `Signal<T[]>` input produces `Computed<T[]>` that auto-tracks, plain `T[]` input produces a static result. See also: pipe, filter, sortBy, groupBy.',
    mistakes: `- Expecting \`rx.filter(signal, pred)\` to return a plain array — signal inputs always produce \`Computed\` outputs. Call the result to read: \`active()\`
- Passing a RESOLVED value where a signal was meant — \`rx.filter(items(), pred)\` (note the \`()\`) takes the static path and never updates when \`items\` changes. Pass \`items\` (the signal), not \`items()\`. A spike in the \`rx.transform.raw\` perf counter is exactly this mistake
- Assuming signal detection inspects the value — it is purely \`typeof source === "function"\`. Any function (an accessor wrapper \`() => items()\`, a bound method, a getter) is treated as a reactive source and invoked inside a computed; only non-function inputs (arrays) take the static path
- Reading a \`Computed\` output once and caching the array — it is reactive; re-read it (or read inside an \`effect\`/JSX) so you see updates`,
  },

  'rx/pipe': {
    signature: '<A, B>(source: ReadableSignal<A> | A, ...fns: Array<(value: any) => any>) => Computed<B> | B',
    example: `const users = signal<{ name: string; active: boolean }[]>([])
const result = pipe(
  users,
  us => filter(us, u => u.active),
  us => sortBy(us, 'name'),
  us => map(us, u => u.name),
  us => take(us, 10),
)  // Computed<string[]> — ONE computed, one recompute per change`,
    notes: 'Thread a value through plain transform functions left-to-right, collapsing the whole chain into ONE computed. Each function receives the resolved output of the previous step. A signal source produces a reactive `Computed` that re-derives on source change — ONE recompute regardless of chain depth, versus N recomputes / N nodes for N separate `filter()`→`sortBy()`→… calls. Typed for up to 7 transforms (an 8th+ falls back to `any`). The rx helpers are 2-arg `(source, …)`, so wrap them inside each transform — `v => filter(v, pred)`. There is NO curried 1-arg form (`filter(pred)` is not valid). See also: rx, filter, map, sortBy.',
    mistakes: `- Expecting a curried operator form — there is NO 1-arg \`filter(pred)\` / \`sortBy(key)\` / \`map(fn)\`; every helper is 2-arg \`(source, …)\`. Wrap it in a transform: \`pipe(users, us => filter(us, pred))\`
- Expecting \`pipe(arr, ...)\` (plain array source) to be reactive — only a signal source produces a \`Computed\`; a plain array gives a one-shot plain result
- Reading the pipe result as an array when the source is a signal — it is a \`Computed\`; call it: \`result()\`
- Putting a timing operator (\`debounce\`/\`throttle\`) in a \`pipe\` chain — those take a single \`Signal<T>\` and return a signal, they are not curried collection operators and do not compose in \`pipe\`
- Chaining separate rx calls (\`const a = filter(src,…); const b = sortBy(a,…)\`) for a long pipeline — that builds N computed nodes with N recomputes per source change; \`pipe\` builds ONE. Prefer \`pipe\` for chains`,
  },

  'rx/filter': {
    signature: '<T>(source: Signal<T[]> | T[], predicate: (item: T, index: number) => boolean) => Computed<T[]> | T[]',
    example: `const items = signal<number[]>([1, 2, 3, 4, 5])
const evens = filter(items, n => n % 2 === 0)  // Computed<number[]> (items is a signal)
const result = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5] (plain)
pipe(items, ns => filter(ns, n => n > 3))            // wrap the 2-arg call in a pipe transform`,
    notes: 'Filter items by predicate. Signal input produces a reactive `Computed<T[]>` that re-evaluates when the source signal changes; plain array input returns a plain array. ALWAYS 2-arg `(source, predicate)` — there is no curried 1-arg form; inside `pipe()` wrap it as `arr => filter(arr, pred)`. See also: rx, pipe, map.',
    mistakes: `- Calling \`filter(pred)\` with a single function arg — \`filter\` is 2-arg \`(source, predicate)\`; a lone function is treated as a reactive SOURCE (typeof === "function") and the missing predicate yields garbage. Always pass the source first
- Passing \`items()\` instead of \`items\` — the resolved array takes the static path; the result never updates`,
  },

  'rx/map': {
    signature: '<T, U>(source: Signal<T[]> | T[], fn: (item: T, index: number) => U) => Computed<U[]> | U[]',
    example: `const users = signal<{ name: string; active: boolean }[]>([])
const names = map(users, u => u.name)            // Computed<string[]>
pipe(users, us => filter(us, u => u.active), us => map(us, u => u.name)) // wrap each in a pipe transform`,
    notes: 'Transform each item. Signal input → reactive `Computed<U[]>`; plain array → plain array. The mapper receives `(item, index)`. ALWAYS 2-arg `(source, fn)` — no curried form; inside `pipe()` wrap it as `arr => map(arr, fn)`. See also: rx, filter, flatMap.',
    mistakes: `- Expecting this to be the JSX list renderer — \`rx.map\` derives a reactive array; to render a keyed list use \`<For each={…} by={…}>\`, not \`rx.map\` output spread into JSX
- Relying on referential stability of mapped objects — every re-derive produces fresh objects; key lists by a stable id, not object identity`,
  },

  'rx/flatMap': {
    signature: '<T, U>(source: Signal<T[]> | T[], fn: (item: T, index: number) => U[]) => Computed<U[]> | U[]',
    example: `const posts = signal<{ tags: string[] }[]>([])
const allTags = flatMap(posts, p => p.tags)         // Computed<string[]>
flatMap([1, 2, 3], n => [n, n * 10])                // [1, 10, 2, 20, 3, 30] (plain)
flatMap([1, 2, 3], n => n % 2 === 0 ? [n] : [])     // [2] — empty arrays drop out`,
    notes: 'Map each item to an ARRAY and flatten ONE level (exactly `Array.prototype.flatMap`). The mapper returns an array per item; results are concatenated. Signal input → reactive `Computed<U[]>`; plain array → plain array. Empty inner arrays drop out (a filter-and-map in one pass). Flattens exactly one level — nested arrays beyond that stay nested (use `flatten` again). See also: map, flatten, rx.',
    mistakes: `- Returning a scalar instead of an array from the mapper — \`flatMap(xs, n => n * 2)\` is wrong; the mapper must return an ARRAY (\`n => [n * 2]\`). A scalar breaks the flatten
- Expecting deep flattening — it flattens exactly ONE level, like \`Array.prototype.flatMap\`. Nested arrays beyond one level remain nested
- Reaching for \`map(...)\` then \`flatten(...)\` as two rx calls — that is two computed nodes; \`flatMap\` is one node doing both`,
  },

  'rx/sortBy': {
    signature: '<T>(source: Signal<T[]> | T[], key: keyof T | ((item: T) => unknown)) => Computed<T[]> | T[]',
    example: `const users = signal<{ name: string; age: number }[]>([])
const byName = sortBy(users, 'name')          // Computed<User[]>, ascending
const byAge = sortBy(users, u => u.age)        // key-selector form
const desc = pipe(users, us => sortBy(us, 'age'), us => us.slice().reverse()) // reverse for descending`,
    notes: 'Sort by a key or key-selector. **Non-mutating** — copies via `[...arr]` before sorting, so the source array/signal is never mutated (unlike native `Array.prototype.sort`). Signal input → reactive `Computed<T[]>`. Comparison is a plain `a < b ? -1 : a > b ? 1 : 0` — ascending only, no direction option, no locale/`Intl` collation. See also: rx, pipe, groupBy.',
    mistakes: `- Expecting it to mutate / sort in place like \`Array.sort\` — it returns a NEW sorted array; the source is untouched
- Expecting a direction option — there is none. Always ascending; compose \`reverse()\` for descending
- Sorting numeric STRINGS expecting numeric order — comparison is \`<\`/\`>\`, so \`"10" < "2"\` lexically. Use a numeric key-selector (\`u => Number(u.id)\`) when the field is a numeric string
- Expecting locale-aware ordering — no \`Intl.Collator\`; accented / non-ASCII ordering is codepoint order, not locale order`,
  },

  'rx/groupBy': {
    signature: '<T>(source: Signal<T[]> | T[], key: keyof T | ((item: T) => unknown)) => Computed<Record<string, T[]>> | Record<string, T[]>',
    example: `const users = signal<{ department: string }[]>([])
const byDept = groupBy(users, u => u.department) // Computed<Record<string, User[]>>
for (const [dept, members] of Object.entries(byDept())) { void dept; void members }`,
    notes: 'Group items into buckets by key. **Returns a plain `Record<string, T[]>`, NOT a `Map`.** Keys are coerced with `String(...)`, so numeric / boolean group keys become strings (`1` → `"1"`, `true` → `"true"`). Signal input → reactive `Computed<Record<string, T[]>>`. Insertion order within each bucket is preserved. For per-bucket COUNTS (not the members), use `countBy`. See also: rx, countBy, keyBy.',
    mistakes: `- Treating the result as a \`Map\` — it is a plain object. Use \`Object.entries()\` / \`result[key]\`, not \`.get()\` / \`.has()\` / \`.size\`
- Expecting original key types — every key is \`String()\`-coerced; group under \`"1"\`, not \`1\`, and \`"true"\`, not \`true\`
- Iterating with \`for...in\` and not guarding inherited keys — prefer \`Object.entries()\` / \`Object.keys()\`
- Assuming a missing group is \`[]\` — \`result[unknownKey]\` is \`undefined\`, not an empty array; default it explicitly`,
  },

  'rx/countBy': {
    signature: '<T>(source: Signal<T[]> | T[], key: keyof T | ((item: T) => unknown)) => Computed<Record<string, number>> | Record<string, number>',
    example: `const users = signal<{ role: string }[]>([])
const perRole = countBy(users, 'role')                       // Computed<Record<string, number>>
countBy([1, 2, 2, 3], n => n % 2 === 0 ? 'even' : 'odd')     // { odd: 2, even: 2 } (plain)`,
    notes: 'Count items per key bucket. Returns `Record<string, number>` (keys are `String()`-coerced, like `groupBy`). The counting companion to `groupBy` — equivalent to `mapValues(groupBy(src, key), g => g.length)` but single-pass. Signal input → reactive `Computed<Record<string, number>>`. See also: groupBy, keyBy, rx.',
    mistakes: `- Expecting the bucket VALUES (the grouped items) — \`countBy\` returns COUNTS (numbers); use \`groupBy\` for the members
- Expecting original key types — like \`groupBy\`, every key is \`String()\`-coerced (\`1\` → \`"1"\`)
- Reaching for \`groupBy\` then \`mapValues(g => g.length)\` as two rx calls — \`countBy\` does it in one single-pass node`,
  },

  'rx/search': {
    signature: '<T>(source: Signal<T[]> | T[], query: Signal<string> | string, keys: (keyof T)[]) => Computed<T[]> | T[]',
    example: `const users = signal<{ name: string; email: string }[]>([])
const q = signal('')
const results = search(users, q, ['name', 'email'])  // Computed<User[]>
// substring, case-insensitive: q="ali" matches "Alice"`,
    notes: 'Case-insensitive **substring** filter across the named fields. The third argument is a POSITIONAL `keys` array — `search(users, q, ["name", "email"])` — NOT a `{ keys }` options object, and it is REQUIRED. Only `string`-typed fields match (non-string values are skipped). Reactive when EITHER `source` OR `query` is a signal. Empty/whitespace query returns the full list. See also: rx, filter.',
    mistakes: `- Passing \`{ keys: [...] }\` — the signature is positional: \`search(source, query, ["name","email"])\`. An options object is treated as the keys array and matches nothing
- Omitting the keys array — it is a required positional arg; there is no "search all fields" default. List the string fields to match
- Expecting fuzzy / typo-tolerant matching — it is plain \`String.includes\` after \`toLowerCase().trim()\`, not fuzzy. "alce" will NOT match "Alice"
- Searching a non-string field (number/date) — only \`typeof val === "string"\` fields are tested; numeric columns never match. Pre-stringify if you need them searchable`,
  },

  'rx/debounce': {
    signature: '<T>(source: Signal<T>, ms: number) => ReadableSignal<T> & { dispose: () => void }',
    example: `const raw = signal('')
const debounced = debounce(raw, 300)   // ReadableSignal<string> & { dispose }
effect(() => { void debounced() })     // fires 300ms after typing stops
// Inside a component this is auto-cleaned on unmount; standalone:
// onCleanup(() => debounced.dispose())`,
    notes: 'Debounce a SIGNAL value (the whole emitted value, not array items — it is not a collection transform and does not curry into `pipe`). Returns a new readable signal that settles `ms` after the source stops changing, plus an idempotent `dispose()`. **Lifecycle**: created inside a component / `effectScope`, the internal effect AND its pending timer are torn down automatically on unmount; created standalone (module scope, a `defineStore` setup), call `dispose()` yourself. Seeds synchronously with the current `source()` value. See also: throttle, rx.',
    mistakes: `- Assuming it leaks in a component — the internal effect + pending timer are torn down on unmount (it registers with the active scope). Only STANDALONE usage (module scope, store setup outside any scope) needs an explicit \`dispose()\`
- Putting it in a \`pipe()\` chain — \`debounce\` takes a single \`Signal<T>\` and returns a signal; it is not a curried collection operator
- Expecting array-item debounce — \`debounce(usersSignal, 300)\` debounces the whole array emission, not individual rows
- Reading it before the first settle and expecting the latest value — it seeds with the initial \`source()\` and only updates after the quiet window`,
  },

  'rx/throttle': {
    signature: '<T>(source: Signal<T>, ms: number) => ReadableSignal<T> & { dispose: () => void }',
    example: `const scrollY = signal(0)
const throttled = throttle(scrollY, 100)
effect(() => { void throttled() })
// Auto-cleaned in a component; standalone: onCleanup(() => throttled.dispose())`,
    notes: 'Throttle a SIGNAL value to at most one emission per `ms`. Returns a new readable signal + idempotent `dispose()`. Same lifecycle as `debounce` — auto-torn-down (effect + pending trailing timer) inside a component / `effectScope`, `dispose()` for standalone. Value-level not item-level, does not compose in `pipe`, and seeds synchronously with the current `source()`. See also: debounce, rx.',
    mistakes: `- Assuming it leaks in a component — like \`debounce\`, the effect + trailing timer auto-tear-down on unmount; only standalone usage needs \`dispose()\`
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

// With a description + custom icon:
toast.success('Uploaded', { description: '3 files · 1.2 MB', icon: <CheckIcon /> })

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
    notes: 'Create a toast notification imperatively. Returns the toast ID for later `update()` or `dismiss()`. Works from anywhere in the app — no context or provider needed. Options include `type`, `duration` (0 = persistent), `description` (a secondary line), `icon` (any VNode), `action` (a button), `dismissible`, and `onDismiss`. The function also exposes `.success()`, `.error()`, `.warning()`, `.info()`, `.loading()` preset methods, `.update(id, options)` for modifying an existing toast (message/type/duration/description), `.dismiss(id?)` for SOFT removal (plays the CSS leave animation, then removes), `.remove(id?)` for HARD instant removal (no animation), and `.promise(promise, messages)` for async operation tracking. See also: Toaster.',
    mistakes: `- Forgetting to render \`<Toaster />\` — toasts are created but have no visual container to render into
- Calling \`toast.update()\` after the toast has been auto-dismissed — the ID is no longer valid, the update is silently ignored
- Using \`toast.promise()\` with a function instead of a promise — pass the promise directly, not \`() => fetch(...)\`
- Expecting \`toast.dismiss(id)\` to remove the toast synchronously — it is SOFT (plays the ~200ms leave animation first); reach for \`toast.remove(id)\` when you need it gone instantly
- \`toast.loading()\` never auto-dismisses — it is created with \`duration: 0\` (persistent). You MUST resolve it yourself via \`toast.update(id, …)\` / \`toast.dismiss(id)\` / \`toast.remove(id)\`, or use \`toast.promise()\` which settles it for you. A forgotten loading toast stays on screen forever.
- Reading \`duration: 0\` as "dismiss immediately" — \`duration <= 0\` skips the auto-dismiss timer entirely, so the toast is PERSISTENT. To remove one now, call \`toast.remove(id)\`; \`0\` means "stay until dismissed".
- \`toast.update(id, …)\` only changes \`message\` / \`type\` / \`duration\` / \`description\` — NOT \`icon\` or \`action\`. To swap the icon or action button, dismiss and re-create the toast.
- \`toast.promise(p, …)\` still REJECTS — it returns the ORIGINAL promise, so a rejection propagates past the error toast; add your own \`.catch()\` if you need to handle it. \`success\` / \`error\` may also be FUNCTIONS receiving the resolved value / error (e.g. \`success: (data) => "Saved " + data.id\`).`,
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
    notes: 'Create a reactive signal synced to a URL search parameter. Type is inferred from the default value — numbers, booleans, strings, and arrays are auto-coerced. Uses `replaceState` by default (no history entries). Returns a `UrlStateSignal<T>` with `.set()`, `.reset()`, and `.remove()`. Schema mode overload: `useUrlState({ page: 1, sort: "name" })` creates multiple synced signals from a single call. SSR-safe — initializes to the default value on the server (does NOT read the request URL). See also: setUrlRouter.',
    mistakes: `- Using pushState behavior (adds history entries per keystroke) — useUrlState defaults to replaceState; if you pass \`{ replace: false }\` on a high-frequency input, the browser back button breaks
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

  'url-state/batchUrlUpdates': {
    signature: '<T>(fn: () => T) => T',
    example: `import { useUrlState, batchUrlUpdates } from '@pyreon/url-state'

const { page, q, sort } = useUrlState({ page: 1, q: '', sort: 'name' })

// One history entry for the whole "apply filters" action:
batchUrlUpdates(() => {
  page.set(1)
  q.set('hello')
  sort.set('date')
}) // → ?q=hello&sort=date (one replaceState)`,
    notes: 'Collapse several `useUrlState` writes into ONE history entry. Every `.set()` / `.reset()` / `.remove()` invoked inside `fn` is coalesced into a single `history.replaceState` / `pushState` (or one `router.replace`). Signal values still update synchronously — only the URL write is deferred to the end of the batch. Signal notifications are also batched, so subscribers reading several params re-run once, and debounce is bypassed. Critical with `replace: false`: without batching, an N-param update pushes N history entries, so the back button steps through each intermediate state. If any write requested `replace: false`, the single batched write uses `pushState`; otherwise `replaceState`. See also: useUrlState.',
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
    mistakes: `- Passing a CALLED accessor — \`title={getTitle()}\` — captures the value ONCE (the rocketstyle \`.attrs()\` callback runs a single time at mount). Pass the accessor ITSELF — \`title={getTitle}\` or \`title={() => userName()}\` — so \`extractDocumentTree\` resolves the LIVE value on every export.
- Expecting a plain string \`title="Q4"\` to update when a signal changes — a string is STATIC (captured verbatim into \`_documentProps\`); only a \`() => string\` accessor is re-resolved at extraction time. Use an accessor when the value comes from a signal.
- Passing \`title={maybeUndefined}\` and expecting an empty-string title — a \`null\`/\`undefined\` value is OMITTED from the export metadata (the field is simply absent), never stored as \`title: undefined\`.`,
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
    mistakes: `- Keying \`rows\` by position or label — each row object is keyed by \`column.key\`, NOT by order. A \`columns\` entry whose \`key\` matches no field in a row renders an EMPTY cell, and a row field with no matching column \`key\` is dropped. Keep \`columns[].key\` and the \`rows[]\` object keys in sync.
- Expecting \`columns\` / \`rows\` (and \`headerStyle\` / \`striped\` / \`bordered\` / \`caption\`) to reach the DOM as attributes — they are \`_documentProps\`-only, stripped by DocTable's \`.attrs(…, { filter })\` before render because \`HTMLTableElement.rows\` is a read-only property (assigning it throws \`Cannot set property rows\`). Only relevant if you author your OWN table primitive on a \`<table>\` base — apply the same filter.`,
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
    mistakes: `- Setting \`ordered\` on \`DocListItem\` — it does nothing. The marker (bullet vs number) is decided by the PARENT \`DocList\`'s \`ordered\` prop, which sets the list \`tag\` (\`ul\`/\`ol\`); \`DocListItem\` carries no marker info (\`_documentProps: {}\`).
- Putting raw text or a bare \`DocText\` directly under \`DocList\` instead of wrapping each entry in \`DocListItem\` — list entries come from \`DocListItem\` (\`_documentType: "list-item"\`); a non-item child is not a list row. Nest a \`DocList\` INSIDE a \`DocListItem\` for sublists.`,
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

  'document-primitives/DocumentPreview': {
    signature: `DocumentPreview(props: { size?: 'A4' | 'A3' | 'A5' | 'letter' | 'legal'; showPageBreaks?: boolean; children }) => VNode`,
    example: `<DocumentPreview size="A4">
  <DocPage>
    <DocHeading level="h1">Report</DocHeading>
    <DocText>Preview me at real A4 dimensions.</DocText>
  </DocPage>
</DocumentPreview>`,
    notes: `A paper-sized PREVIEW wrapper for a document-primitive tree — it renders the Doc* subtree as centered white pages (gray backdrop + drop-shadow) at real paper dimensions so you can preview a document in the browser before exporting. \`size\` picks the page format (\`'A4'\` default, plus A3/A5/letter/legal); \`showPageBreaks\` toggles page-break visualization. It carries the \`_documentType: 'document'\` static, so it ALSO serves as the extraction root — \`extractDocumentTree\` treats it like a \`DocDocument\`, so you typically do not nest a separate \`<DocDocument>\` inside it. See also: DocDocument, createDocumentExport.`,
    mistakes: `- Treating it as export-only chrome — it is a BROWSER preview wrapper (paper backdrop + page sizing); the actual export runs through \`createDocumentExport\` / \`extractDocumentTree\`.
- Nesting a \`<DocDocument>\` inside it — \`DocumentPreview\` already carries \`_documentType: 'document'\` and is the extraction root, so wrapping it in another document root double-nests the document node.
- Passing a size it does not define — only 'A4' / 'A3' / 'A5' / 'letter' / 'legal' map to paper dimensions; an unknown size falls back to the base with no page sizing.`,
  },

  'document-primitives/documentTheme': {
    signature: 'documentTheme: { colors; fonts; sizes; spacing }  // type DocumentTheme = typeof documentTheme',
    example: `import { documentTheme } from '@pyreon/document-primitives'

const brandTheme = {
  ...documentTheme,
  colors: { ...documentTheme.colors, primary: '#0ea5e9' },
}`,
    notes: 'The default theme object for document styling/export — a plain nested config of `colors` (primary / text / background / border / header / striped-row), `fonts` (heading / body / mono font stacks), `sizes` (h1–h6 + body / caption / label point sizes), and `spacing` (xs–xl). Reference it or spread-override it when customizing how a document renders and exports. Exported alongside the `DocumentTheme` type (`typeof documentTheme`). See also: DocDocument.',
    mistakes: '- Mutating `documentTheme` in place — it is a shared module-level object; spread-clone it (`{ ...documentTheme, ... }`) to override, or you change it for every consumer.',
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
    example: `import { expandRoutesForLocales } from '@pyreon/zero/i18n-routing'
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
    origin: 'https://example.com',
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
    example: `import { validateEnv, publicEnv, schema } from '@pyreon/zero/env'

const env = validateEnv({
  PORT: 3000,
  DEBUG: false,
  API_KEY: String,        // required string
  API_URL: schema((v) => new URL(v)),
})
// env.PORT → number; env.API_KEY → string; env.API_URL → URL

const pub = publicEnv()  // client-safe ZERO_PUBLIC_* subset (secrets excluded by prefix)`,
    notes: 'Env-variable validation with type coercion. Schema accepts primitives (`String`, `Number`, `Boolean`) for default coercion + `schema()` for custom parsers. `publicEnv()` returns a client-safe subset (no secrets). Catches missing-required-env errors at startup instead of mid-request runtime crashes. See also: zero.',
  },

  'zero/cspMiddleware': {
    signature: 'function cspMiddleware(config: { directives: CspDirectives }): Middleware // server-only',
    example: `import { cspMiddleware } from '@pyreon/zero/csp'

plugins: [pyreon(), zero({
  middleware: [cspMiddleware({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'nonce-{{nonce}}'"],
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
<Link href="https://example.com">External</Link>  // auto target="_blank" rel="noopener noreferrer"
<Link href="/report.pdf" external>PDF</Link>       // force external for a same-origin asset`,
    notes: 'Default navigation link built on an `<a>` tag. Only INTERNAL navigations are intercepted (`router.push()` + prefetch + `activeClass`); external URLs, `mailto:`/`tel:`, and `#hash` are detected from `href` at runtime and left to the browser — external links auto-get `target="_blank" rel="noopener noreferrer"`. `href` is generic (`CheckHref<T, RoutePath>`): once typed-routes codegen has run, a mistyped internal path is a compile error while dynamic strings + external URLs are always accepted. Built on `createLink` so consumers can swap the rendered element via `createLink(MyCustomLink)` without losing any of this. See also: useLink, createLink, prefetchRoute.',
    mistakes: `- Wrapping an external URL in a plain \`<a>\` to avoid \`router.push\` — unnecessary: \`<Link href="https://x.com">\` auto-detects it as external, renders \`target="_blank" rel="noopener noreferrer"\`, and does NOT client-navigate. Override with \`external\` / \`target\` / \`rel\` or \`createApp({ links })\`
- Using \`<a href={path} onClick={() => router.push(path)}>\` instead of \`<Link>\` — manual approach skips prefetch, active-state class merging, and the keyboard-modifier guard (Cmd+click should open new tab, not navigate in-place)
- Setting \`prefetch="hover"\` (default) and expecting prefetch on mobile — mobile devices don't fire mouseenter; use \`prefetch="viewport"\` for IntersectionObserver-based prefetch (or accept that touchstart triggers prefetch too)
- Passing \`class\` AND \`activeClass\` — both are MERGED via \`cx\` (not overridden); the user-provided \`class\` always applies, \`activeClass\` is appended when \`isActive()\` is true
- \`<Link to={...}>\` — Link uses \`href\`, NOT \`to\` (RouterLink from \`@pyreon/router\` uses \`to\`; Link from \`@pyreon/zero/link\` uses \`href\` to match HTML anchor convention)
- Building a custom anchor wrapper from scratch instead of using \`createLink\` or \`useLink\` — the prefetch cache, keyboard-modifier guard, external-link classification, active-state class composition, and SSR-safe document.head injection are non-trivial`,
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
- Creating the synced signal BEFORE attaching the transport — the create-if-missing seed defers until first sync ONLY when a transport is already registered on the doc; created first, it seeds immediately (as if alone) and a fresh default can clobber a peer value on a clientId tie-break (#2380). Attach the transport (+ persistence) first
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
    signature: 'class FakeCrdtAdapter implements CrdtAdapter { createDoc(): CrdtDoc }',
    example: `// FakeCrdtAdapter.createDoc() returns a CrdtDoc; construct FakeCrdtDoc
// directly to get the concrete type connectFakeDocs requires.
const a = new FakeCrdtDoc()
const b = new FakeCrdtDoc()
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
const t = connectViaWebSocket(doc, "wss://sync.example.com/my-room?token=abc")
// t.synced() // reactive: false until the first sync round-trip completes
await t.whenSynced()      // gate your OWN default writes on this
t.disconnect()            // close + stop reconnecting`,
    notes: `Sync a YjsCrdtDoc to a relay over WebSocket — the CROSS-DEVICE transport. Sends our state vector on open (relay replies with the diff), then live updates; a REMOTE-origin update is never re-sent (no loop). Reconnects with exponential backoff by default. Uses the global WebSocket (browsers / Node 22+ / Bun / Deno); pass \`WebSocketImpl\` on older Node. Auth: put a token in the \`url\` query string — browser WebSockets can't set headers — which the relay's \`authorize\` hook reads. Exposes a REACTIVE \`synced\` signal + \`whenSynced()\` promise (the y-websocket convention) — \`synced\` becomes true once the initial sync round-trip completes; \`syncedSignal\` defers its create-if-missing seed on this internally so a fresh peer's default can't clobber a peer's real value (issue #2380). Attach the transport BEFORE creating synced signals. See also: createSyncServer, connectViaBroadcastChannel, syncedSignal.`,
    mistakes: `- Trying to set an Authorization header — browser WebSockets can't; pass the token in the URL query string and read it in the relay's \`authorize\`
- Using it on old Node without a global WebSocket and not passing \`WebSocketImpl\` — it throws; pass the \`ws\` package's WebSocket
- Treating a 4401 close as retryable — that is the relay's authz rejection and is terminal; reconnect won't help
- Writing an app-level DEFAULT for a key before \`synced\` — it can race a peer's real value on a random-clientId tie-break and clobber it. Gate default writes on \`await transport.whenSynced()\` / \`transport.synced()\`. (\`syncedSignal\`'s OWN seed already defers internally; this is for your explicit writes.)
- Creating synced signals BEFORE attaching the transport — the seed-deferral guarantee needs the transport registered on the doc first, else the seed fires immediately (as if alone)`,
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

  // <gen-docs:api-reference:start @pyreon/sized-map>

  'sized-map/SizedMap': {
    signature: 'new SizedMap<K, V>(opts: SizedMapOptions)',
    example: `import { SizedMap } from '@pyreon/sized-map'

// FIFO (default) — hot path: get() never touches ordering
const tplCache = new SizedMap<string, HTMLTemplateElement>({ maxEntries: 1024 })
tplCache.set('key', tpl)
tplCache.get('key')      // pure read — no recency bump

// LRU-on-read — frequently-read entries survive small caps
const memo = new SizedMap<string, Entry>({ maxEntries: 128, lru: true })
memo.get('hot')          // re-inserted at the tail — evicted last

// Map-shaped surface
memo.has('hot')          // true
memo.size                // number (getter, not a method)
for (const [k, v] of memo) { /* insertion/recency order */ }`,
    notes: 'Bounded `Map<K, V>` that evicts the oldest entry when `maxEntries` is exceeded, relying on the native Map insertion-order guarantee (the first key is always the oldest). Default mode is FIFO: `.get()` is a pure read. Pass `lru: true` for LRU-on-read: `.get()` re-inserts the touched entry at the tail (a delete + set pair) so eviction drops the least-recently-USED entry. `.set()` on an existing key removes the old entry and appends the new one at the tail in BOTH modes — a just-written entry is never the next eviction victim. The constructor floors `maxEntries` at 1. See also: SizedMapOptions.',
    mistakes: `- Expecting \`.get()\` to bump recency by default — the default mode is FIFO (a pure read); pass \`lru: true\` at construction for LRU-on-read semantics
- Passing \`maxEntries: 0\` to disable storage — the constructor floors the cap at 1 (\`Math.max(1, maxEntries)\`); there is no "always evict" configuration
- Storing \`undefined\` as a value — \`.get()\` treats a stored \`undefined\` as a miss (early return before the LRU touch), so \`has(key)\` can be \`true\` while \`get(key)\` never bumps recency; store a sentinel instead
- Expecting eviction when \`.set()\` hits an EXISTING key at cap — a key collision refreshes the entry in place (delete + re-append) without evicting anything; only a NEW key at cap evicts the oldest
- Treating it as a \`Map\` subclass — it wraps a private Map, so it is not \`instanceof Map\` and has no \`forEach\`; iterate via \`entries()\` / \`[Symbol.iterator]\``,
  },

  'sized-map/SizedMapOptions': {
    signature: 'interface SizedMapOptions { maxEntries: number; lru?: boolean }',
    example: `const opts: SizedMapOptions = { maxEntries: 256, lru: true }
const cache = new SizedMap<string, string>(opts)`,
    notes: 'Constructor options. `maxEntries` is the size cap before the oldest entry is evicted (floored at 1). `lru` (default `false`) selects LRU-on-read mode — `.get()` moves the entry to the tail; when `false` the map is pure FIFO and `.get()` does not touch ordering. See also: SizedMap.',
  },
  // <gen-docs:api-reference:end @pyreon/sized-map>

  // <gen-docs:api-reference:start @pyreon/dnd>

  'dnd/useDraggable': {
    signature: '<T extends DragData = DragData>(options: UseDraggableOptions<T>) => UseDraggableResult',
    example: `let el: HTMLElement | null = null
const { isDragging } = useDraggable({
  element: () => el,
  data: () => ({ id: card.id, position: position() }), // getter → resolved per drag start
  handle: () => handleEl,        // only this sub-element starts a drag
  disabled: () => isSaving(),    // reactive — checked on every drag attempt
  onDragEnd: () => console.log('released (drop OR cancel)'),
})

;<div ref={(node) => (el = node)} class={() => (isDragging() ? 'opacity-50' : '')}>
  {card.title}
</div>`,
    notes: `Make an element draggable with signal-driven state. \`element\` is a GETTER (\`() => el\`) captured on the next microtask, so the element only has to exist by mount time — not at hook-call time. \`data\` is the transferred payload: pass a plain object for static payloads or a function for dynamic ones (resolved fresh at each drag start via pdnd's \`getInitialData\`). \`handle\` scopes drag initiation to a sub-element; \`disabled\` accepts a reactive \`() => boolean\` re-evaluated on every drag attempt via \`canDrag\`. Returns \`{ isDragging }\` — a signal accessor that is \`true\` while THIS element is dragged. \`onDragEnd\` fires on both drop and cancel. See also: useDroppable, useSortable, useDragMonitor.`,
    mistakes: `- Passing the element itself instead of a getter — \`element: el\` captures \`null\` (refs are not populated at hook-call time); pass \`element: () => el\` so the deferred microtask setup reads the mounted node
- Passing an object \`data\` and expecting it to track current state — the object form is captured once at hook-call time; use the function form \`data: () => ({ id: item.id(), position: position() })\` for dynamic payloads (resolved fresh at each drag start)
- Passing a captured boolean for \`disabled\` when you want live toggling — \`disabled: isSaving()\` snapshots once; \`disabled: () => isSaving()\` is re-evaluated on every drag attempt
- Swapping the ref to a NEW DOM node after mount — registration happens exactly once on the next microtask; a later element change is not re-registered (unmount/remount the component instead)
- Treating \`onDragEnd\` as drop-only — it fires on BOTH a successful drop and a cancelled drag`,
  },

  'dnd/useDroppable': {
    signature: '<T extends DragData = DragData>(options: UseDroppableOptions<T>) => UseDroppableResult',
    example: `let el: HTMLElement | null = null
const { isOver } = useDroppable({
  element: () => el,
  data: { columnId: props.id },                 // readable by useDragMonitor's onDrop target arg
  canDrop: (source) => source.type === 'card',  // reject anything that isn't a card
  onDrop: (source) => props.onAdd(source.id as string),
})

;<div ref={(node) => (el = node)} class={() => (isOver() ? 'bg-blue-50' : '')}>
  Drop a card here
</div>`,
    notes: `Make an element a drop target with signal-driven hover state. \`canDrop(sourceData)\` filters incoming drags — when it returns \`false\` the target won't highlight, \`onDragEnter\` won't fire, and a drop won't land. \`data\` (value or getter) is attached to the target so a \`useDragMonitor\`'s \`onDrop\` can read target metadata. Returns \`{ isOver }\` — \`true\` only while an ACCEPTED draggable hovers this target. All callbacks receive the source's \`data\` as the wide \`DragData\` (\`Record<string, unknown>\`) — pdnd erases the source's generic across the drag boundary. See also: useDraggable, useDragMonitor.`,
    mistakes: `- Trusting \`sourceData\` as your draggable's typed \`T\` — it arrives as \`DragData\` (\`Record<string, unknown>\`); narrow with a discriminant (\`source.type === 'card'\`, \`typeof source.id === 'string'\`) before reading fields
- Expensive \`canDrop\` predicates — it runs on every drag event; derive a cheap flag in an upstream \`computed\` for costly checks
- Expecting \`isOver\` to flip for rejected drags — it only tracks ACCEPTED draggables; when \`canDrop\` returns \`false\`, \`onDragEnter\` never fires and there's no highlight`,
  },

  'dnd/useSortable': {
    signature: '<T>(options: UseSortableOptions<T>) => UseSortableResult',
    example: `const items = signal([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])

const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
  items,                              // reactive getter — signals are callable
  by: (item) => item.id,              // MUST match the <For by> key
  onReorder: (next) => items.set(next), // hook hands you a NEW array; you commit
  axis: 'vertical',                   // 'horizontal' flips edges + arrow keys
})

;<ul ref={containerRef}>
  <For each={items()} by={(item) => item.id}>
    {(item) => (
      <li
        ref={itemRef(item.id)}
        class={activeId() === item.id ? 'dragging' : ''}
        style={() => (overId() === item.id ? \`border-\${overEdge()}: 2px solid blue\` : '')}
      >
        {item.name}
      </li>
    )}
  </For>
</ul>`,
    notes: `Full reorderable list — pointer dragging, auto-scroll near container edges, closest-edge detection, Alt+Arrow keyboard reordering, and ARIA wiring (\`role="listitem"\`, \`aria-roledescription\`, \`tabindex\`) — driven from a reactive \`items()\` getter. \`by\` extracts the stable key and MUST match your \`<For by>\` key. On drop the hook computes the reordered array and calls \`onReorder(next)\` — it never mutates your list; you commit it. \`groupId\` opts two sortables into one cross-list drop universe (Trello-style boards): the destination's \`onCrossListReceive(item, index)\` inserts, the source's \`onCrossListDrop(item)\` removes. Returns \`containerRef\` (scroll container), \`itemRef(key)\` (per-row ref factory), and the \`activeId\` / \`overId\` / \`overEdge\` signal accessors. See also: useDraggable, useDragMonitor.`,
    mistakes: `- Passing a captured array snapshot as \`items\` — the hook re-derives on every drop / keypress, so \`items\` must be a reactive getter (\`items: () => cols()\` or the signal itself); a snapshot breaks reordering
- Mismatched keys — \`by\` must return the same stable key your \`<For by>\` uses, or the list tears on reorder
- Expecting the hook to mutate your list — \`onReorder(next)\` hands you a NEW array; commit it yourself (\`items.set(next)\`) or nothing visibly reorders
- Expecting cross-list drops without \`groupId\` — \`onCrossListDrop\` / \`onCrossListReceive\` only fire when \`groupId\` is set; without it each sortable is a private universe that rejects drags from other sortables
- Forgetting \`containerRef\` on the scroll container — auto-scroll, the reorder-finalizing drop target, and the Alt+Arrow keyboard handler all register there
- Calling \`itemRef\` with a different key than \`by\` returns — the drop-time reorder lookup finds items by that key (\`findIndex\` against \`by(item)\`), so a mismatch makes reorders silently no-op and mistracks per-key disposal`,
  },

  'dnd/useFileDrop': {
    signature: '(options: UseFileDropOptions) => UseFileDropResult',
    example: `let zone: HTMLElement | null = null
const { isOver, isDraggingFiles } = useFileDrop({
  element: () => zone,
  accept: ['image/*', '.pdf'],   // MIME glob OR extension
  maxFiles: 5,                   // silently truncates to the first 5
  onDrop: (files) => upload(files),
})

;<div
  ref={(node) => (zone = node)}
  class={() => (isOver() ? 'drop-active' : isDraggingFiles() ? 'drop-ready' : '')}
>
  Drop files here
</div>`,
    notes: `Native-file drop zone over pdnd's external/file adapter — accepts files dragged in from the OS, not in-page draggables. \`accept\` filters like \`<input accept>\`: leading \`.\` matches the extension (case-insensitive), trailing \`/*\` is a MIME glob, anything else is an exact MIME type. \`maxFiles\` truncates to the first N. Returns TWO signal accessors: \`isOver\` (files hovering THIS zone) and \`isDraggingFiles\` (files dragged anywhere on the page — for a page-wide 'drop ready' affordance). \`onDrop\` receives the filtered, truncated files and only fires when at least one file survives. See also: useDroppable, useDragMonitor.`,
    mistakes: `- Expecting it to catch in-page draggables — \`useFileDrop\` uses pdnd's external/file adapter and only fires for REAL file drags from the OS; \`useDraggable\` items go through the isolated element adapter
- Relying on \`onDrop\` for rejection feedback — files rejected by \`accept\` / \`maxFiles\` are silently filtered, and \`onDrop\` does not fire at all when zero files survive; check counts inside \`onDrop\` (or pair with \`isOver\`) to surface errors
- Writing \`accept: ['pdf']\` — extensions need the leading dot (\`'.pdf'\`); a bare string is treated as an exact MIME type and matches nothing
- Expecting \`maxFiles\` to reject an over-count drop — it TRUNCATES to the first N and discards the rest; enforce hard limits inside \`onDrop\` yourself`,
  },

  'dnd/useDragMonitor': {
    signature: '(options?: UseDragMonitorOptions) => UseDragMonitorResult',
    example: `const { isDragging, dragData } = useDragMonitor({
  canMonitor: (data) => data.type === 'card',
  onDrop: (source, target) => track('reorder', { from: source.id, to: target.columnId }),
})

;<Show when={isDragging()}>
  <div class="global-drag-overlay">Dragging: {() => String(dragData()?.id ?? '')}</div>
</Show>`,
    notes: `Observe every element drag on the page without owning a draggable or drop target — for global overlays, analytics, or coordinating multiple drag areas. \`canMonitor(data)\` filters which drags this monitor reacts to (a \`false\` return means \`isDragging\` / \`dragData\` don't flip and no callback fires). \`onDrop(sourceData, targetData)\` receives the dragged source's data plus the drop target's \`data\` — \`targetData\` is an empty object \`{}\` (not \`undefined\`) when the drag ends with no drop target. Unlike the element-bound hooks, the monitor registers immediately (no microtask defer). See also: useDraggable, useDroppable, useSortable.`,
    mistakes: `- Expecting \`targetData\` to be \`undefined\` on a cancelled drag — it is an empty object \`{}\` when there was no drop target, so destructuring is always safe but truthiness checks are not
- Expensive \`canMonitor\` predicates — they run on every drag event; keep them cheap or derive a flag upstream
- Expecting \`dragData()\` to survive after the drop — it resets to \`null\` the moment the drag ends; capture what you need inside \`onDrop\``,
  },
  // <gen-docs:api-reference:end @pyreon/dnd>

  // <gen-docs:api-reference:start @pyreon/attrs>

  'attrs/attrs': {
    signature: '<C extends ElementType>({ name, component }: { name: string; component: C }) => AttrsComponent',
    example: `import attrs from '@pyreon/attrs'
import { Element } from '@pyreon/elements'

const Button = attrs({ name: 'Button', component: Element })
  .attrs({ tag: 'button', alignX: 'center' })
  .attrs<{ primary?: boolean }>(({ primary }) => ({
    backgroundColor: primary ? 'blue' : 'gray',
  }))

<Button label="Click me" />
<Button tag="a" href="/x" />   // explicit props override the defaults`,
    notes: 'Factory entry (default + named export). Wraps `component` in a Pyreon `ComponentFn` enhanced with the chain methods (`.attrs()` / `.config()` / `.compose()` / `.statics()` / `.getDefaultAttrs()`). `name` becomes the `displayName` and, in dev builds, a `data-attrs` attribute on the rendered output for debugging. Both fields are required — dev mode throws a descriptive error on a missing one. Non-React statics from the base are hoisted onto the wrapper so `Base.someStatic` survives the chain; the component carries the `IS_ATTRS: true` marker. See also: isAttrsComponent, @pyreon/rocketstyle, @pyreon/core.',
    mistakes: `- Calling the factory with a bare component — \`attrs(Element)\` is wrong; the argument is the object \`{ name, component }\` and both keys are required (dev mode throws)
- Expecting chain calls to mutate — every method returns a NEW component; \`Button.attrs({...})\` without assigning the return value changes nothing
- Expecting deep merges — defaults are shallow-merged; an object-valued prop (\`style={{ color: "red" }}\`) from the call site REPLACES the default object, it does not combine with it
- Stacking very deep \`.attrs<P>()\` generic chains — TypeScript's recursive conditional-type inference caps at roughly 24-50 levels depending on the host; past that, narrow the generics or split the component
- Forwarding props onward with a plain spread inside a composed HOC — \`{ ...props }\` fires reactive getter props once and collapses them to static values; pass by reference or merge with \`mergeProps\` from \`@pyreon/core\`
- Relying on the \`data-attrs\` debug attribute in production — it is dev-only (\`process.env.NODE_ENV !== "production"\`) and tree-shaken from production builds`,
  },

  'attrs/.attrs()': {
    signature: '<P>(attrs: object | ((props) => object), opts?: { priority?: boolean; filter?: string[] }) => AttrsComponent',
    example: `const Input = attrs({ name: 'Input', component: Element })
  // Callback form — reads the resolved props
  .attrs<{ error?: boolean }>((props) => ({
    'aria-invalid': props.error ? 'true' : undefined,
  }))
  // Keep the control prop off the DOM
  .attrs({}, { filter: ['error'] })

// Later calls override earlier ones
const Base = attrs({ name: 'Base', component: Element }).attrs({ size: 'md' })
const Small = Base.attrs({ size: 'sm' })     // → size: 'sm'`,
    notes: `Add default props. Object form for static defaults; callback form receives the CURRENT resolved props (priority attrs + explicit props) and returns a partial. Calls stack — later \`.attrs()\` calls override earlier ones for the same key. Render-time merge precedence is \`priorityAttrs < attrs < explicit call-site props\` (last wins); explicit \`undefined\` values are stripped first so they never shadow a default. \`{ priority: true }\` routes the entry to the priority chain — resolved FIRST and visible as input to later \`.attrs()\` callbacks, but LOWEST precedence in the final merge. \`{ filter: [...] }\` strips those prop names before they reach the base component; filter lists accumulate across the chain. The \`<P>\` generic widens the component's prop type. See also: .config(), .getDefaultAttrs().`,
    mistakes: `- Assuming \`{ priority: true }\` means highest precedence — despite the name, priority attrs are resolved EARLY (so normal \`.attrs()\` callbacks can read them as input) but sit at the LOWEST precedence in the final merge: \`priorityAttrs < attrs < explicit props\`
- Expecting an explicit \`undefined\` at the call site to defeat a default — \`undefined\`-valued props are stripped before merging, so the \`.attrs()\` default still applies
- Expecting the callback to re-run reactively — \`.attrs()\` callbacks run once per mount during the HOC's prop resolution; reactive getter props flowing THROUGH the merge stay live for downstream JSX, but a value the callback READS is a one-shot snapshot
- Forgetting \`filter\` accumulates — every name listed in any \`.attrs(..., { filter })\` call along the chain is stripped; a later call cannot un-filter an earlier name
- Confusing this chain method with rocketstyle's \`.attrs()\` — the rocketstyle variant passes extra callback arguments \`(props, theme, helpers)\`; the plain attrs callback receives only the resolved props`,
  },

  'attrs/.config()': {
    signature: '(opts: { name?: string; component?: ElementType; DEBUG?: boolean }) => AttrsComponent',
    example: `const Button = attrs({ name: 'Button', component: Element }).attrs({ tag: 'button' })

const Renamed = Button.config({ name: 'PrimaryButton' })
Renamed.displayName   // 'PrimaryButton'
Button.displayName    // 'Button' — original untouched

// Base swap — the .attrs() chain still applies to the new base
const Anchor = Button.config({ component: 'a', name: 'Anchor' })`,
    notes: `Reconfigure the builder: rename (\`name\` → new \`displayName\`), swap the underlying base component (\`component\`), or toggle dev debugging (\`DEBUG\`). Returns a new component; the original keeps its own name/base. Unlike \`@pyreon/rocketstyle\`, swapping \`component\` at this layer PRESERVES the accumulated \`.attrs()\` / \`priorityAttrs\` / \`filter\` / \`.compose()\` / \`.statics()\` chains and re-applies them to the new base — reconciling the new base's prop shape is the caller's responsibility. See also: attrs, .attrs(), @pyreon/rocketstyle.`,
    mistakes: `- Expecting the rocketstyle chain-reset behavior — \`@pyreon/attrs\`' \`.config({ component })\` KEEPS the accumulated chains across a base swap (test-locked); only \`@pyreon/rocketstyle\`'s \`.config()\` resets prop-shape-coupled chains. If the new base has a different prop shape, stale defaults can leak invalid props — audit them yourself
- Passing dimension or theme options — this \`.config()\` accepts only \`name\` / \`component\` / \`DEBUG\`; dimensions/provider/consumer/inversed are \`@pyreon/rocketstyle\` \`.config()\` surface
- Reading \`displayName\` off the original after renaming — \`.config()\` is immutable; the rename lands on the RETURNED component`,
  },

  'attrs/.compose()': {
    signature: '(hocs: Record<string, ((c: ComponentFn) => ComponentFn) | null | false>) => AttrsComponent',
    example: `const withTheme = (Component) => (props) => Component(props)
const withTracking = (Component) => (props) => Component(props)

const Enhanced = attrs({ name: 'Button', component: Element })
  .compose({ withTheme, withTracking })

// Remove one by its name
const NoTracking = Enhanced.compose({ withTracking: null })`,
    notes: `Attach named higher-order components. The argument is a RECORD of \`{ name: hoc }\` — the name is the removal handle: a later \`.compose({ name: null })\` (or \`undefined\` / \`false\`) removes that HOC from the chain; only function values are kept. Application order: the record's values are reversed so the LAST-defined HOC wraps innermost, and the built-in attrs HOC (which resolves the \`.attrs()\` chain) is always the outermost wrapper — default props are computed before any user HOC runs. See also: attrs, .config().`,
    mistakes: `- Passing an array of HOCs — \`.compose()\` takes a named record; the names are what make falsy-removal possible
- A composed HOC that value-copies props (\`const next = { ...props }\`) — fires reactive getter props at setup and collapses them to static values; copy descriptors (\`mergeProps\` / \`splitProps\` from \`@pyreon/core\`) or pass by reference
- Assuming record order equals wrap order outside-in — values are REVERSED before composition, so the last-defined HOC runs closest to the component; the attrs HOC always stays outermost regardless`,
  },

  'attrs/.statics()': {
    signature: '(meta: Record<string, unknown>) => AttrsComponent',
    example: `const Btn = attrs({ name: 'Btn', component: Element }).statics({
  category: 'action',
  sizes: ['sm', 'md', 'lg'],
})

Btn.meta.category   // 'action'
Btn.meta.sizes      // ['sm', 'md', 'lg']`,
    notes: `Attach arbitrary metadata, readable on the component's \`.meta\` object. Successive \`.statics()\` calls merge (later keys win). Used by systems that need post-construction component introspection — e.g. \`@pyreon/document-primitives\` reads \`_documentType\` this way. See also: .compose(), isAttrsComponent.`,
    mistakes: `- Reading statics directly off the component — in \`@pyreon/attrs\` they land on \`Component.meta\`, NOT on the component object itself (rocketstyle's \`.statics()\` additionally assigns onto the component; this layer does not)
- Using \`.statics()\` for per-instance data — statics are definition-level metadata shared by every instance`,
  },

  'attrs/.getDefaultAttrs()': {
    signature: '(props: TObj) => TObj',
    example: `const Button = attrs({ name: 'Button', component: Element })
  .attrs({ tag: 'button', alignX: 'center' })
  .attrs<{ primary?: boolean }>(({ primary }) => ({ kind: primary ? 'primary' : 'plain' }))

Button.getDefaultAttrs({})                  // { tag: 'button', alignX: 'center', kind: 'plain' }
Button.getDefaultAttrs({ primary: true })   // { ..., kind: 'primary' }`,
    notes: 'Resolve the accumulated `.attrs()` chain for a given props bag — every callback in the chain runs against `props` and the results merge left-to-right (later calls win). Useful for introspection and testing the resolved defaults without mounting. See also: .attrs().',
    mistakes: `- Expecting priority attrs in the result — \`getDefaultAttrs\` resolves only the normal \`.attrs()\` chain, not \`priorityAttrs\`
- Calling with no argument when callbacks destructure props — pass at least \`{}\` so \`({ primary }) => ...\` callbacks don't destructure \`undefined\``,
  },

  'attrs/isAttrsComponent': {
    signature: '<T>(component: T) => boolean',
    example: `import { isAttrsComponent } from '@pyreon/attrs'

isAttrsComponent(Button)      // true
isAttrsComponent('div')       // false
isAttrsComponent(() => null)  // false — plain functions lack the marker`,
    notes: 'Runtime type guard — `true` when a value was created by `attrs()` (checks the own `IS_ATTRS` marker). Use it to discriminate attrs-wrapped components from plain functions; `typeof value === "function"` cannot tell them apart because an attrs component IS callable. See also: attrs, @pyreon/rocketstyle.',
    mistakes: `- Discriminating with \`typeof value === "function"\` — attrs components are callable, so use the marker guard instead
- Testing a rocketstyle component — rocketstyle components carry \`IS_ROCKETSTYLE\`, not \`IS_ATTRS\`; use \`isRocketComponent\` from \`@pyreon/rocketstyle\` for those`,
  },
  // <gen-docs:api-reference:end @pyreon/attrs>

  // <gen-docs:api-reference:start @pyreon/rocketstyle>

  'rocketstyle/rocketstyle': {
    signature: '(config?: { dimensions?: Dimensions; useBooleans?: boolean }) => <C>({ name, component }: { name: string; component: C }) => RocketStyleComponent',
    example: `import rocketstyle from '@pyreon/rocketstyle'

const rs = rocketstyle()                       // useBooleans: false (default)
const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ borderRadius: 4, cursor: 'pointer' }))
  .states({ primary: { backgroundColor: '#0d6efd', color: '#fff' } })

<Button state="primary">Save</Button>          // string dimension props

// Custom dimensions — keys become chain methods, propNames become props
const rsCustom = rocketstyle({
  dimensions: { tones: 'tone', decorations: { propName: 'decoration', multi: true } },
})`,
    notes: 'Factory initializer (default + named export). `rocketstyle(config?)` returns a component factory; call THAT with `{ name, component }` to get the chainable builder. `config.dimensions` overrides the dimension map (default: `states: "state"`, `sizes: "size"`, `variants: "variant"`, `multiple: { propName: "multiple", multi: true }`, `modifiers: { propName: "modifier", multi: true, transform: true }`) — each key becomes a chain method, each propName a consumer prop. `config.useBooleans` (default `false`) switches dimension props from strings (`state="primary"`) to boolean shorthands (`<Button primary />`). Dev mode throws on missing `name`/`component`/`dimensions` and on dimension names colliding with reserved keys. See also: Provider, isRocketComponent, @pyreon/attrs, @pyreon/styler.',
    mistakes: `- Calling the factory with a tag string — \`rs('button')\` is not a valid form. The factory takes \`{ name, component }\` and BOTH are required (dev mode throws on a missing one)
- Passing boolean shorthand props under the default \`useBooleans: false\` — \`<Button primary />\` is an UNKNOWN prop that silently does nothing; write \`<Button state="primary" />\` or opt into \`rocketstyle({ useBooleans: true })\`
- Passing a function accessor to a dimension prop — \`state={() => expr}\` is the wrong shape; dimension props take plain string values (\`state={expr}\`) and the compiler handles reactivity via \`_rp()\` wrapping
- Using a reserved key as a custom dimension name — \`light\`, \`dark\`, \`provider\`, \`consumer\`, \`DEBUG\`, \`name\`, \`component\`, \`inversed\`, \`passProps\`, \`styled\`, \`theme\`, \`styles\`, \`compose\`, \`attrs\` all throw at factory init in dev mode
- Calling a dimension method with the singular prop name — \`.state({...})\` is not a method; DEFINITION methods are plural (\`.states()\`), the consumer PROP is singular (\`state="primary"\`)
- Mounting each rocketstyle-heavy view under its own theme provider — the \`_rsMemo\` dimension-prop memo is keyed by theme identity, so real apps need ONE shared \`<PyreonUI>\` provider for the memo to span component instances
- Expecting the chain to mutate — every chain method returns a NEW component; \`Button.states({...})\` without assigning the return value does nothing to \`Button\``,
  },

  'rocketstyle/.config()': {
    signature: '(opts: { name?; component?; provider?: boolean; consumer?: ConsumerCb; inversed?: boolean; passProps?: string[]; DEBUG?: boolean; styled?: boolean }) => RocketStyleComponent',
    example: `// Parent provides its pseudo-state; child derives its own state from it
const ButtonGroup = Button.config({ provider: true })
const ButtonIcon = rs({ name: 'ButtonIcon', component: Element })
  .config({
    consumer: (ctx) => ctx(({ pseudo }) => ({ state: pseudo.hover ? 'active' : 'default' })),
  })
  .states({ default: { color: '#666' }, active: { color: '#fff' } })

<ButtonGroup state="primary"><ButtonIcon />Label</ButtonGroup>

// Swap the base — resets attrs/compose chains (see mistakes)
const Anchor = Button.config({ component: 'a', name: 'Anchor' }).attrs({ href: '#' })`,
    notes: `Reconfigure the builder: rename (\`name\` → \`displayName\`), swap the base (\`component\`), wire parent-child pseudo-state context (\`provider: true\` exposes this component's hover/focus/pressed state to descendants; \`consumer\` reads a parent provider's state into this component's props), flip dark/light for the subtree (\`inversed: true\`), re-forward normally-consumed props to the base (\`passProps\`), and toggle dev-only debug logging (\`DEBUG\`). Accepted keys are exactly the CONFIG_KEYS set — anything else is ignored. See also: rocketstyle, Provider.`,
    mistakes: `- \`.config({ component: NewBase })\` with a DIFFERENT component RESETS the accumulated \`attrs\` / \`priorityAttrs\` / \`filterAttrs\` / \`compose\` chains — they were tailored to the previous component's prop shape and would leak invalid props to the DOM (e.g. \`disabled\` on an \`<a>\`). \`theme\` / \`styles\` / dimension chains ARE preserved. Re-chain shared attrs explicitly after the swap
- Expecting \`.config({ inversed: true })\` to set a mode — it INVERTS whatever mode the surrounding provider resolves (light↔dark) for this subtree; it does not force dark
- \`DEBUG: true\` logging is dev-only (\`process.env.NODE_ENV !== "production"\`) — it is tree-shaken from production builds, so don't rely on it for runtime diagnostics
- Using \`provider\`/\`consumer\` for theme data — they propagate live PSEUDO-STATE (hover/focus/pressed) between parent and child rocketstyle components; theme/mode flow through the theme provider (\`PyreonUI\` or rocketstyle \`Provider\`), not this channel`,
  },

  'rocketstyle/.attrs()': {
    signature: '(attrs: object | ((props, theme, helpers) => object), opts?: { priority?: boolean; filter?: string[] }) => RocketStyleComponent',
    example: `const SubmitButton = rs({ name: 'SubmitButton', component: Element })
  // Layout / structural props belong here (tag, direction, alignX, gap...)
  .attrs({ tag: 'button', type: 'submit' })
  // Callback form — helpers carries the resolved mode
  .attrs((props, theme, { mode, isDark }) => ({
    'data-mode': mode,                        // 'light' | 'dark'
    title: props.disabled ? 'Disabled' : 'Submit',
  }))
  // Strip an internal control prop before it reaches the DOM
  .attrs({}, { filter: ['internalFlag'] })

<SubmitButton />                 // type="submit" applies
<SubmitButton type="button" />   // explicit prop wins over the default`,
    notes: 'Inject default props into the wrapped component. Object form for static defaults; callback form receives `(props, theme, helpers)` where `helpers = { render, mode, isDark, isLight }` (`mode` is the resolved `"light" | "dark"` string here, unlike `.theme()` where it is a helper function). Merge precedence at render time is `priorityAttrs < attrs < explicit call-site props` — explicit props always win; `undefined` explicit values are stripped so they never shadow defaults. `{ priority: true }` puts the entry on the priority chain (resolved FIRST, visible as input to later `.attrs()` callbacks, LOWEST final precedence); `{ filter: [...] }` strips prop names before they reach the base (accumulates across the chain). See also: .theme(), .config(), @pyreon/attrs.',
    mistakes: `- Putting CSS in \`.attrs()\` — the convention with Element-based bases is LAYOUT props in \`.attrs()\` (\`tag\`, \`direction\`, \`alignX\`, \`alignY\`, \`gap\`, \`block\`) and visual CSS in \`.theme()\` (colors, spacing, borders, shadows)
- Assuming \`{ priority: true }\` means "wins over explicit props" — priority attrs are resolved FIRST and feed later \`.attrs()\` callbacks as input, but they sit at the LOWEST precedence in the final merge (\`priorityAttrs < attrs < explicit props\`)
- Expecting \`.attrs()\` callback prop reads to be reactive — callbacks legitimately read prop VALUES one-shot at mount time by design (\`({ href }) => ({ tag: href ? "a" : "button" })\`); reactive getter props survive the merge for downstream JSX, but the callback body itself is not a tracked scope
- Passing \`undefined\` explicitly to defeat a default — \`<Button type={undefined} />\` does NOT shadow the \`.attrs()\` default; undefined values are stripped before merging
- Confusing \`.attrs()\` (per-component default props) with the \`@pyreon/attrs\` package factory — rocketstyle builds on the same chaining engine but adds theme/dimension resolution on top`,
  },

  'rocketstyle/.theme()': {
    signature: '(theme: object | ((theme, mode, css) => object)) => RocketStyleComponent',
    example: `const Card = rs({ name: 'Card', component: 'div' })
  .theme((t, mode, css) => ({
    borderRadius: 8,
    // mode(light, dark) picks per active mode — one definition, both modes
    backgroundColor: mode('#ffffff', '#1a1a1a'),
    color: mode('#1a1a1a', '#e0e0e0'),
    borderWidthTop: 1,                        // unistyle naming, NOT borderTopWidth
    hover: { boxShadow: mode('0 2px 8px rgba(0,0,0,0.1)', '0 2px 8px rgba(0,0,0,0.6)') },
    disabled: { opacity: 0.5 },
  }))`,
    notes: 'Always-applied base styles, merged under every dimension slice. The callback receives `(theme, mode, css)`: `theme` is the app theme from context, `mode` is the `mode(light, dark)` HELPER function (returns the value matching the active mode — NOT a string), `css` is the styler helper. Chaining `.theme()` multiple times is additive (results deep-merge in chain order). Pseudo-state styles nest as objects (`hover` / `focus` / `active` / `pressed` / `disabled` / `readOnly`) and compile to CSS pseudo-selectors. Property names follow the unistyle convention. See also: .states() / .sizes() / .variants(), .styles(), resolveModeVar.',
    mistakes: `- Chaining an empty \`.theme({})\` — a no-op that merges nothing; skip \`.theme()\` entirely when a component has no base styles
- Treating the second callback argument as a string — in \`.theme()\` and dimension callbacks \`mode\` is the \`mode(light, dark)\` HELPER function (\`backgroundColor: mode("#fff", "#333")\`), not \`"light" | "dark"\`; the resolved string form lives on \`.attrs()\` callbacks' \`helpers.mode\`
- Using CSS-spec property order — rocketstyle themes use the unistyle convention (\`borderWidthTop\`, \`borderColorLeft\`), NOT \`borderTopWidth\` / \`borderLeftColor\`
- Expecting \`:hover\` styles to apply only to interactive components — \`hover\` theme compiles to an UNCONDITIONAL \`:hover\` rule on every component that defines it; only \`cursor: pointer\` is gated on \`onClick\` / \`href\`
- Passing unitless numbers to \`mode()\` under \`init({ cssVariables: true })\` — \`mode(8, 12)\` is emitted verbatim into the CSS var with no unit applied (dev warns); pass unit-complete values (\`mode("8px", "12px")\`)`,
  },

  'rocketstyle/.states() / .sizes() / .variants()': {
    signature: '(values: Record<string, object> | ((theme, mode, css) => Record<string, object>)) => RocketStyleComponent',
    example: `const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ borderRadius: 4, cursor: 'pointer' }))
  .states((t, mode) => ({
    primary: { backgroundColor: '#0d6efd', color: '#fff', hover: { backgroundColor: '#0b5ed7' } },
    danger: { backgroundColor: '#dc3545', color: '#fff' },
  }))
  .sizes({
    sm: { fontSize: 14, paddingX: 12, paddingY: 6 },
    lg: { fontSize: 18, paddingX: 20, paddingY: 10 },
  })

<Button state="primary" size="lg">Save</Button>
<Button>plain — dimensions are optional</Button>`,
    notes: `Single-value dimension definition methods (from the default dimension map). Each declares every valid value for its consumer prop — \`.states({...})\` drives \`state="..."\`, \`.sizes({...})\` drives \`size="..."\`, \`.variants({...})\` drives \`variant="..."\`. The active value's style slice merges over the \`.theme()\` base; a dimension prop with no matching value contributes nothing (every dimension is optional at the call site). The callback form receives \`(theme, mode, css)\` for theme-token-driven values. Custom dimensions declared at factory init get an identically-shaped method named after each dimension key. See also: .multiple() / .modifiers(), .theme(), rocketstyle.`,
    mistakes: `- Method/prop name confusion — DEFINITION methods are plural (\`.states()\`, \`.sizes()\`, \`.variants()\`), consumer PROPS are singular (\`state\`, \`size\`, \`variant\`)
- Using a dimension prop the component never defined — e.g. \`variant="outlined"\` on a component with no \`.variants()\` chain is invalid and surfaces as a type error (\`never[]\`); check the component definition first
- Nesting pseudo-state at the wrong level — \`hover\` nests INSIDE a value slice (\`primary: { hover: {...} }\`), where it overrides the \`.theme()\`-level \`hover\` for that state
- Expecting per-instance style overrides through dimension props — dimension values are a closed set declared at definition time; arbitrary one-off styles go through the base component's style props or a new dimension value`,
  },

  'rocketstyle/.multiple() / .modifiers()': {
    signature: '(values: Record<string, object | ((theme) => object)> | ((theme, mode, css) => Record<string, object>)) => RocketStyleComponent',
    example: `const Box = rs({ name: 'Box', component: Element })
  .multiple({
    rounded: { borderRadius: 999 },
    shadow: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
  })
<Box multiple={['rounded', 'shadow']} />       // both slices compose

// Transform dimension — value fn receives the ACCUMULATED theme
const Button2 = rs({ name: 'Button2', component: Element })
  .theme({ backgroundColor: '#0d6efd', color: '#fff' })
  .states({ danger: { backgroundColor: '#dc3545' } })
  .modifiers({
    outlined: (t) => ({ color: t.backgroundColor, backgroundColor: 'transparent' }),
  })
<Button2 state="danger" modifier="outlined" />  // outlined sees danger's red`,
    notes: `Multi-value dimension definition methods (from the default dimension map). \`.multiple({...})\` drives the \`multiple\` prop, \`.modifiers({...})\` drives \`modifier\` — both accept an ARRAY of active values at the call site (\`multiple={["rounded", "shadow"]}\`), all of which compose onto the theme. \`modifiers\` is additionally a TRANSFORM dimension: its value functions receive the theme ACCUMULATED from all prior dimensions, so a modifier can derive from the active state (e.g. \`outlined\` reading the current state's \`backgroundColor\`). Custom dimensions opt into the same behaviors via \`{ multi: true }\` / \`{ transform: true }\`. See also: .states() / .sizes() / .variants(), rocketstyle.`,
    mistakes: `- Passing a single string to a multi dimension and expecting array semantics — \`multiple="rounded"\` and \`multiple={["rounded"]}\` both work, but composing several values requires the array form
- Expecting a transform value fn to see the raw app theme — transform-dimension value functions receive the theme accumulated from PRIOR dimensions (base + active state/size/variant), which is the whole point; read app-theme tokens in a dimension-level callback instead
- Declaring a custom multi dimension as a bare string — \`{ decorations: "decoration" }\` is single-value; multi needs the object form \`{ propName: "decoration", multi: true }\``,
  },

  'rocketstyle/.styles()': {
    signature: '(cb: (css) => CSSResult) => RocketStyleComponent',
    example: `const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ background: '#eee', hover: { background: '#ddd' } }))
  .styles(
    (css) => css\`
      transition: background 0.15s ease;
      border: none;
      \${({ $rocketstyle }) => css\`
        background: \${resolveTheme($rocketstyle).background};
      \`}
    \`,
  )`,
    notes: `Raw-CSS escape hatch for what the dimension model can't express. The callback receives the styler's tagged-template \`css\` helper; interpolation functions inside the template receive the component's styled-props, notably \`$rocketstyle\` (the fully resolved theme — base + active dimension slices merged, identity-cached per dimension-prop combo) and \`$rocketstate\` (active dimension values + \`pseudo: { hover, focus, pressed, active, disabled, readOnly }\` flags). See also: resolveTheme, .theme(), @pyreon/styler.`,
    mistakes: `- Reading \`$rocketstyle\` as a plain object in interpolations — it may be a function ACCESSOR (reactive) or a plain object depending on the render path; resolve it with \`resolveTheme($rocketstyle)\` from \`@pyreon/rocketstyle\`
- Reaching for \`.styles()\` for things the dimension model expresses — colors/spacing per state belong in \`.states()\` / \`.theme()\` where they get the mode helper, caching, and CSS-variables support; \`.styles()\` is for selectors and interpolation the object model can't say
- Driving pseudo-state visuals from \`$rocketstate.pseudo\` when a CSS pseudo-selector would do — the nested \`hover: {...}\` theme object already compiles to \`:hover\`; the JS flags are for components that track interaction state in JavaScript (via \`.config({ provider: true })\` wiring)`,
  },

  'rocketstyle/.compose()': {
    signature: '(hocs: Record<string, ((c: ComponentFn) => ComponentFn) | null | false>) => RocketStyleComponent',
    example: `const withTooltip = (Component) => (props) => Component(props)

const Button = rs({ name: 'Button', component: 'button' })
  .states({ primary: { background: 'royalblue' } })
  .compose({ withTooltip })

// Remove a previously composed HOC by name
const Plain = Button.compose({ withTooltip: null })`,
    notes: 'Wrap the component in named higher-order components. The argument is a RECORD of `{ name: hoc }` (not an array) so later chain calls can remove a previously composed HOC by setting its name to a falsy value. The built-in rocketstyle attrs HOC is always the outermost wrapper, so default props are resolved before any user HOC runs. See also: .config(), @pyreon/attrs.',
    mistakes: `- Passing an array of HOCs — \`.compose()\` takes a named record (\`{ withTooltip }\`), which is what makes falsy-removal (\`{ withTooltip: null }\`) possible
- Composing a HOC that value-copies props (\`{ ...props }\` into a new object at setup) — that fires reactive getter props once and collapses them to static values; forward props by reference or merge with \`mergeProps\` from \`@pyreon/core\`
- Forgetting that \`.config({ component: NewBase })\` RESETS the compose chain along with the attrs chains — re-chain HOCs after a base swap`,
  },

  'rocketstyle/.statics()': {
    signature: '(meta: Record<string, unknown>) => RocketStyleComponent',
    example: `const Button = rs({ name: 'Button', component: 'button' })
  .statics({ category: 'action', version: '1.0' })

Button.meta.category   // 'action'
'category' in Button   // true — also assigned onto the component`,
    notes: `Attach arbitrary static metadata. Values land on the component's \`.meta\` object AND directly on the component itself (so \`"key" in Component\` checks work — \`@pyreon/document-primitives\` uses this for \`_documentType\`). Successive \`.statics()\` calls merge. See also: .compose(), isRocketComponent.`,
    mistakes: `- Using \`.statics()\` for per-instance data — statics are definition-level metadata shared by every instance; per-instance values are props
- Colliding with the builder surface — static keys land on the component object, so names like \`attrs\` / \`config\` / \`theme\` would shadow the chain methods; pick namespaced keys`,
  },

  'rocketstyle/Provider': {
    signature: '(props: TProvider) => VNodeChild',
    example: `import { Provider } from '@pyreon/rocketstyle'

<Provider theme={myTheme} mode="dark">
  <Button state="primary">Dark mode button</Button>
</Provider>

// Invert a subtree (dark island in a light page)
<Provider inversed>
  <Card>Resolves mode() as the opposite mode</Card>
</Provider>`,
    notes: `Tree-level theme + mode provider. Props are \`{ children, theme?, mode?, inversed?, provider? }\` — \`mode\` is \`"light" | "dark"\`, \`inversed: true\` flips the resolved mode for the subtree, and values merge over any parent rocketstyle context. Most apps use the higher-level \`<PyreonUI>\` from \`@pyreon/ui-core\` (theme + mode + config in one) and reach for rocketstyle's \`Provider\` only for fine-grained subtree overrides. The raw context object backing it is exported as \`context\`. See also: rocketstyle, .config(), @pyreon/ui-core.`,
    mistakes: `- Passing a \`value\` prop (React-context muscle memory) — there is no \`value\`; \`Provider\` takes \`theme\` / \`mode\` / \`inversed\` directly
- Mounting a fresh \`Provider\`/\`PyreonUI\` per view — the \`_rsMemo\` cache keys on theme identity, so per-view providers defeat cross-instance memoization; share ONE app-level provider
- Confusing this theme/mode provider with \`.config({ provider: true })\` — the latter is the component-to-component PSEUDO-STATE channel, unrelated to theming`,
  },

  'rocketstyle/context': {
    signature: 'context: ReactiveContext<{ theme; mode; isDark; isLight; … }>',
    example: `import { context } from '@pyreon/rocketstyle'
import { useContext } from '@pyreon/core'

const getCtx = useContext(context)   // () => { theme, mode, isDark, isLight }
const { mode, isDark } = getCtx()    // call the accessor to read`,
    notes: `The raw reactive context object backing \`Provider\` — RE-EXPORTED from \`@pyreon/ui-core\`, so it is the SAME context \`<PyreonUI>\` and rocketstyle \`Provider\` write, not a rocketstyle-specific one. \`useContext(context)\` returns a \`() => { theme, mode, isDark, isLight, … }\` ACCESSOR (reactive); rocketstyle's \`Provider\` and its per-component dimension resolution read the active theme + mode through it. Exposed for advanced consumers building their OWN theme/mode-aware primitives; app code uses \`Provider\` / \`<PyreonUI>\` + the built-in dimension resolution instead. See also: Provider, rocketstyle, @pyreon/ui-core.`,
    mistakes: `- Treating \`useContext(context)\` as the config object — it is the ACCESSOR \`() => ctx\` (a reactive context); CALL it to read: \`const ctx = useContext(context)()\`.
- Creating a fresh context expecting rocketstyle to read it — \`context\` is re-exported from \`@pyreon/ui-core\`; \`<PyreonUI>\` and rocketstyle \`Provider\` all write THIS same object. Provide through them, not a new context.`,
  },

  'rocketstyle/isRocketComponent': {
    signature: '<T>(component: T) => boolean',
    example: `import { isRocketComponent } from '@pyreon/rocketstyle'

isRocketComponent(Button)   // true
isRocketComponent('div')    // false
isRocketComponent(() => null) // false — plain functions lack the marker`,
    notes: 'Runtime type guard — `true` when a value was created by `rocketstyle()` (checks the own `IS_ROCKETSTYLE` marker). Use it wherever code must discriminate rocketstyle components from plain functions/components — a `typeof value === "function"` check cannot tell them apart because a rocketstyle component IS a callable function. See also: rocketstyle, @pyreon/attrs.',
    mistakes: '- Discriminating with `typeof value === "function"` — rocketstyle components are callable, so the typeof check matches both; use the marker guard',
  },

  'rocketstyle/resolveTheme': {
    signature: '<T = Record<string, unknown>>(value: (() => T) | T) => T',
    example: `import { resolveTheme } from '@pyreon/rocketstyle'

styled(Component)\`
  color: \${(props) => resolveTheme(props.$rocketstyle).color};
\``,
    notes: 'Resolve a `$rocketstyle` value inside `styled()` / `.styles()` interpolation functions — handles both the function-accessor (reactive) shape and the plain-object shape, returning the resolved theme object either way. See also: .styles(), @pyreon/styler.',
    mistakes: '- Calling `props.$rocketstyle()` unconditionally — it is only sometimes a function; `resolveTheme` normalizes both shapes',
  },

  'rocketstyle/resolveModeVar': {
    signature: `(value: unknown, mode?: 'light' | 'dark') => unknown`,
    example: `import { resolveModeVar } from '@pyreon/rocketstyle'

// after <X color={mode('#000', '#fff')} /> under cssVariables:
resolveModeVar('var(--px-m-abc123)', 'dark')   // '#fff'
resolveModeVar('#ff0000', 'dark')              // '#ff0000' — passthrough`,
    notes: 'Under `init({ cssVariables: true })`, `mode(light, dark)` pairs are emitted as hashed CSS custom properties (`var(--px-m-<hash>)`). `resolveModeVar(value, mode)` resolves such a mode-pair reference back to its raw light/dark value — needed by non-CSS render targets (PDF / DOCX / email document export). Defaults to `mode: "light"`; non-strings and strings without a `var(` reference pass through unchanged. See also: .theme(), @pyreon/unistyle.',
    mistakes: `- Expecting it to resolve theme-leaf variables — it only resolves \`--px-m-*\` MODE-PAIR vars allocated by the mode factory; theme-token vars (\`--px-spacing-small\`) live in \`themeToCssVars\`'s registry and need \`resolveCssVarReferences\` from \`@pyreon/unistyle\``,
  },
  // <gen-docs:api-reference:end @pyreon/rocketstyle>

  // <gen-docs:api-reference:start @pyreon/coolgrid>

  'coolgrid/Container': {
    signature: '(props: { columns?: ValueType; gap?: ValueType; gutter?: ValueType; padding?: ValueType; contentAlignX?: ContentAlignX; width?: ContainerWidth; component?: ComponentFn; css?: ExtraStyles }) => VNodeChild',
    example: `import { Container, Row, Col } from '@pyreon/coolgrid'

<Container columns={12} gap={16} gutter={24} padding={16} width={{ xs: '100%', lg: 1140 }}>
  <Row>
    <Col size={{ xs: 12, md: 8 }}>Main</Col>
    <Col size={{ xs: 12, md: 4 }}>Sidebar</Col>
  </Row>
</Container>

// width as a function of the theme's resolved container widths:
<Container width={(widths) => ({ ...widths, xl: 1320 })}>…</Container>

// Swap the underlying element:
<Container component="main">…</Container>`,
    notes: 'Outermost grid boundary. Renders a centered flex column (`width: 100%`, auto horizontal margins) with a responsive `max-width` resolved from the `width` prop → `theme.grid.container` → `theme.coolgrid.container`, and provides the grid config (`columns`, `size`, `gap`, `padding`, `gutter`, `colCss`/`colComponent`, `rowCss`/`rowComponent`, `contentAlignX`) to descendant Row / Col via context. `ValueType` = `number | number[] | { [breakpoint]: number }` (responsive); `width` also accepts a function that receives the theme-resolved container-width record and returns the final `ContainerWidth`. `columns` defaults to the theme value (12 in the default theme). See also: Row, Col, Provider, theme.',
    mistakes: `- Setting a non-default \`columns\` on a Row instead of the Container — it works for that Row only, but the visual cascade gets hard to reason about; keep \`columns\` at Container level
- Expecting \`gutter\` to be horizontal container padding — \`gutter\` feeds the Row's VERTICAL margins (\`spacingY = gutter − gap/2\`); the Container itself only sets a responsive max-width + auto horizontal centering
- Rendering without a theme context — grid defaults (\`columns\`, container widths) resolve from \`theme.grid.*\` / \`theme.coolgrid.*\`, so mount \`<PyreonUI>\` (or coolgrid \`Provider\`) above the Container
- Using CSS keyword values for \`contentAlignX\` ('space-between') — the accepted keys are camelCase: 'spaceAround' / 'spaceBetween' / 'spaceEvenly' (plus 'center' / 'left' / 'right')`,
  },

  'coolgrid/Row': {
    signature: '(props: { size?: ValueType; columns?: ValueType; gap?: ValueType; gutter?: ValueType; padding?: ValueType; contentAlignX?: ContentAlignX; component?: ComponentFn; css?: ExtraStyles }) => VNodeChild',
    example: `<Row contentAlignX="center" gap={[8, 16, 24]}>
  <Col size={4}>One</Col>
  <Col size={4}>Two</Col>
</Row>

// size on Row = default span for every Col inside:
<Row size={6}>
  <Col>Half</Col>
  <Col>Half</Col>
</Row>

// Swap the rendered element:
<Row component="section">…</Row>`,
    notes: 'Flex-wrap row. Reads the Container config from context, merges its own props over it, and re-provides the result (`columns`, `gap`, `gutter`, `size`, `padding`, `colCss`, `colComponent`) for Col children. Applies the classic negative-margin gutter technique: horizontal margin `-gap/2` on each side cancels the per-Col gap margins at the row edges; vertical margin is `gutter − gap/2` when `gutter` is set, else `gap/2`. `size` on a Row becomes the DEFAULT span for every Col inside. `contentAlignX` maps to `justify-content`. See also: Container, Col.',
    mistakes: `- Expecting \`size\` on a Row to size the Row itself — it is the default \`size\` for every Col child (each Col can still override with its own \`size\`)
- Setting \`gutter\` without \`gap\` — in classic (non-cssVariables) mode the Row spacing block early-returns unless \`gap\` is a number, so the gutter silently does nothing; set \`gap\` too (\`gap={0}\` works)
- Passing CSS keyword values to \`contentAlignX\` ('space-between') — keys are camelCase ('spaceBetween'); the map resolves them to the real justify-content values
- Trying to set \`gap\` / \`columns\` / \`gutter\` on an individual Col — Col's typed props deliberately omit them; the values resolve at Row/Container level so the Row's negative margins and the Col's width math agree`,
  },

  'coolgrid/Col': {
    signature: '(props: { size?: ValueType; padding?: ValueType; component?: ComponentFn; css?: ExtraStyles }) => VNodeChild',
    example: `<Col size={4}>1/3 width on every breakpoint</Col>
<Col size={{ xs: 12, sm: 6, lg: 4 }}>Responsive</Col>
<Col size={[12, 6, 4]}>Mobile-first array</Col>
<Col size={{ xs: 0, md: 6 }}>Hidden on xs</Col>
<Col>Auto column — shares leftover space</Col>
<Col component="article" css="text-align: center;">Custom element + extra CSS</Col>`,
    notes: `Individual column. Reads \`columns\` / \`gap\` / default \`size\` / \`padding\` from the Row context and computes its width as \`calc(size / columns · 100% − gap)\` (plain percentage when no gap). Without a \`size\` it is an auto column (\`flex-grow: 1; flex-basis: 0\`) sharing the leftover space. \`gap\` and \`padding\` are HALVED and applied as per-side margin / padding (the Row's negative margin cancels the outer halves). \`size: 0\` hides the column at that breakpoint. See also: Row, Container.`,
    mistakes: `- \`size: 0\` hides the column by moving it off-screen (\`position: fixed; left: -9999px\`), NOT \`display: none\` — the element stays mounted and its children stay alive
- A mobile-first array is positional \`[xs, sm, md, lg, xl]\` and values CASCADE upward — \`size={[12, 6, 4]}\` leaves lg/xl at the md value (4), it does not reset them
- Expecting \`padding={16}\` to render 16px of padding — grid padding (like gap) is halved per side, so it renders \`padding: 8px\`
- Setting \`size\` greater than the resolved \`columns\` — the width math produces >100% and the column overflows its row`,
  },

  'coolgrid/Provider': {
    signature: '(props: { theme: PyreonTheme; children?: VNode | null }) => VNode | null',
    example: `import { Provider, Container, Row, Col, theme } from '@pyreon/coolgrid'

// Standalone (no PyreonUI at the root):
<Provider theme={theme}>
  <Container>…</Container>
</Provider>

// Preferred in real apps — PyreonUI provides the same context:
import { PyreonUI } from '@pyreon/ui-core'
<PyreonUI theme={appTheme} mode="light">
  <Container>…</Container>
</PyreonUI>`,
    notes: `Re-export of \`@pyreon/unistyle\`'s low-level theme provider — enriches the theme (pre-computed sorted breakpoints + media-query helpers) and provides it to BOTH the ui-core context and the styler \`ThemeContext\`. Marked \`@deprecated\` in source: prefer \`<PyreonUI theme={theme} mode="light">\` from \`@pyreon/ui-core\`, which handles all three context layers (styler, core, mode) in one component. The remaining legitimate use is scoping DIFFERENT breakpoints / grid defaults to a subtree. See also: theme, @pyreon/ui-core.`,
    mistakes: `- Wrapping a fresh \`<Provider>\` inside an app that already renders \`<PyreonUI>\` at the root — PyreonUI sets up the unistyle context already; only add a nested Provider to scope DIFFERENT breakpoints to a subtree
- Expecting a nested \`<Provider>\` to inherit the outer Provider's overrides — context is per-Provider; the inner one starts fresh from its own \`theme\`
- Reaching for \`Provider\` in new code — it is deprecated in favor of \`PyreonUI\` from \`@pyreon/ui-core\``,
  },

  'coolgrid/theme': {
    signature: `{ rootSize: 16; breakpoints: { xs: 0; sm: 576; md: 768; lg: 992; xl: 1200 }; grid: { columns: 12; container: { xs: '100%'; sm: 540; md: 720; lg: 960; xl: 1140 } } }`,
    example: `import { Provider, theme } from '@pyreon/coolgrid'

<Provider theme={theme}>…</Provider>

// Custom theme — same shape, your own breakpoint names:
<Provider
  theme={{
    rootSize: 16,
    breakpoints: { phone: 0, tablet: 600, desktop: 1024 },
    grid: { columns: 24, container: { phone: '100%', tablet: 540, desktop: 960 } },
  }}
>…</Provider>`,
    notes: 'Default Bootstrap-4-style grid theme: 5 breakpoints (xs–xl), a 12-column grid, and responsive container max-widths. Pass it to `Provider` / `PyreonUI`, or ship your own theme with the same shape (`rootSize`, `breakpoints`, `grid.columns`, `grid.container`) for custom breakpoint names and column counts. See also: Provider, Container.',
    mistakes: `- Custom themes missing \`grid.container\` — the Container has no max-width source and renders full-width at every breakpoint
- Keying \`grid.container\` by breakpoint names that don't match \`breakpoints\` — the responsive engine resolves widths per breakpoint name, so the keys must agree`,
  },
  // <gen-docs:api-reference:end @pyreon/coolgrid>

  // <gen-docs:api-reference:start @pyreon/kinetic>

  'kinetic/kinetic': {
    signature: `<Tag extends string>(tag: Tag) => KineticComponent<Tag, 'transition'>`,
    example: `const FadeBox = kinetic('div').preset(fade)                     // transition
const Accordion = kinetic('div').collapse({ transition: 'height 400ms ease-in-out' })
const StaggerList = kinetic('ul').preset(slideUp).stagger({ interval: 80, reverseLeave: true })
const AnimatedList = kinetic('ul').preset(fade).group()          // keyed list

<FadeBox show={() => visible()} onAfterLeave={() => console.warn('gone')}>
  <p>Content</p>
</FadeBox>

// Group mode — keyed children via accessor, no show prop:
<AnimatedList>{() => todos().map((t) => <li key={t.id}>{t.text}</li>)}</AnimatedList>`,
    notes: `Create a renderable, chainable animated component in transition mode. Every chain method returns a NEW component (immutable) — define once at module scope and reuse. Style methods (\`.enter\`/\`.enterTo\`/\`.enterTransition\` + \`leave\` siblings) set inline-style phases; \`.enterClass\`/\`.leaveClass({ active, from, to })\` set class phases (Tailwind-friendly); \`.preset(p)\` spreads a \`Preset\`'s fields; \`.on(callbacks)\` attaches lifecycle callbacks; \`.config(opts)\` sets mode-scoped options. Mode switches: \`.collapse(opts?)\` (height 0 ↔ auto, measures \`scrollHeight\`), \`.stagger({ interval?, reverseLeave? })\` (sequenced children), \`.group()\` (keyed-list enter/exit, no \`show\` prop). Rendered props: \`show: () => boolean\` (reactive accessor; not in group mode), \`appear\` (default false), \`timeout\` (default 5000ms), mode extras (\`unmount\` transition-only default true, \`transition\` collapse-only default "height 300ms ease", \`interval\` stagger-only default 50, \`reverseLeave\` stagger-only), the four callbacks, plus any HTML attr — forwarded to the rendered tag with reactivity preserved. See also: KineticComponent, presets, useTransitionState, @pyreon/kinetic-presets.`,
    mistakes: `- Passing \`show={visible()}\` (a static boolean) — \`show\` is a reactive accessor \`() => boolean\`; kinetic subscribes to it and runs enter/leave on flips. Write \`show={() => visible()}\`
- Building \`kinetic('div').preset(...)\` inside a render body — chaining is immutable and re-creates the component on every call; define animated components once at module scope
- Passing a \`show\` prop in group mode — group has NO \`show\`; visibility is driven by which keys are present in the children
- Group-mode children without a unique \`key\` — the enter/exit diff is keyed; children without a key are skipped (no animation)
- Passing a plain snapshot \`{todos().map(...)}\` to a group and expecting later additions to animate — pass a reactive accessor \`{() => todos().map(...)}\` so the group re-evaluates and diffs keys on data change
- Using stagger mode for a list whose entries are added/removed at runtime — stagger snapshots its children once at render; use group mode for runtime add/remove
- Setting \`unmount\` outside transition mode — it is a transition-mode option only; collapse keeps content in the DOM and animates height, stagger/group manage per-child lifecycle
- Expecting \`.config()\` to accept every option in every mode — it takes only the current mode's set: \`{ appear, unmount, timeout }\` (transition), \`{ appear, timeout, transition }\` (collapse), \`{ appear, timeout, interval, reverseLeave }\` (stagger), \`{ appear, timeout }\` (group)
- Treating stagger \`interval\` as a total duration — it is the per-CHILD delay: five children at 75ms = 375ms stagger window
- Animating \`width\` / \`height\` / \`top\` / \`left\` in a preset — those run on the main thread and can jank; animate \`transform\` / \`opacity\` / \`filter\` for compositor-thread work, and use collapse mode for height
- Expecting an INITIALLY-HIDDEN transition with \`unmount: true\` to be removed from the DOM after a later leave — the SSR-structural contract keeps it in the DOM with the leave-to class applied; initially-visible transitions keep the true-unmount semantic (drive mount/unmount yourself if you need removal)
- Relying on the animation completing under \`prefers-reduced-motion: reduce\` — visuals are skipped instantly but callbacks (\`onEnter\` → \`onAfterEnter\`, \`onLeave\` → \`onAfterLeave\`) still fire; drive dependent logic from callbacks, not timing`,
  },

  'kinetic/presets': {
    signature: `Record<'fade' | 'scaleIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight', Preset>`,
    example: `import { kinetic, fade, presets } from '@pyreon/kinetic'

const FadeBox = kinetic('div').preset(fade)
const SlideBox = kinetic('div').preset(presets.slideUp)   // map access for dynamic selection`,
    notes: 'The six built-in presets as one map — `fade`, `scaleIn`, `slideUp`, `slideDown`, `slideLeft`, `slideRight` — each also available as a named export. All are style-form presets (opacity/transform with 300ms ease-out enter, 200ms ease-in leave). Pass one to `.preset(...)`. For the full 122-preset catalog plus factories and composition utilities, use `@pyreon/kinetic-presets`. See also: kinetic, Preset, @pyreon/kinetic-presets.',
    mistakes: '- Looking for `fadeUp` / `bounceIn` / `zoomIn` etc. here — the core package ships only 6 presets; the 122-preset catalog is `@pyreon/kinetic-presets`',
  },

  'kinetic/useTransitionState': {
    signature: '(options: { show: () => boolean; appear?: boolean }) => TransitionStateResult',
    example: `const { stage, ref, shouldMount, complete } = useTransitionState({
  show: () => visible(),
  appear: true,
})
// stage()       -> 'hidden' | 'entering' | 'entered' | 'leaving'
// shouldMount() -> false only while 'hidden'
useAnimationEnd({ ref: elementRef, active: () => stage() === 'entering' || stage() === 'leaving', onEnd: complete })`,
    notes: 'Low-level enter/leave state machine that powers the transition renderer — exported for building custom animated primitives. Returns `stage` (a `Signal<TransitionStage>`: `hidden | entering | entered | leaving`), a `ref` callback to attach to the transitioning element (it triggers the `appear` animation once wired), a reactive `shouldMount()` accessor (false only while `hidden`), and `complete()` which advances `entering → entered` / `leaving → hidden`. Its signature type is exported as `UseTransitionState`. See also: useAnimationEnd, TransitionStage, TransitionStateResult.',
    mistakes: `- Never calling \`complete()\` — the stage stays \`entering\`/\`leaving\` forever; wire \`useAnimationEnd\`'s \`onEnd\` (or your own end detection) to \`complete\`
- Not attaching the returned \`ref\` to the element — \`appear\` is triggered by the ref callback once the node is wired; without it the appear animation never fires
- Reading \`shouldMount()\` outside a reactive scope — it is an accessor; read it inside JSX expression thunks / effects to track stage changes`,
  },

  'kinetic/useAnimationEnd': {
    signature: '(options: { ref: Ref<HTMLElement>; onEnd: () => void; active: () => boolean; timeout?: number }) => void',
    example: `useAnimationEnd({
  ref: elementRef,                     // Ref<HTMLElement> object, read via .current
  active: () => stage() === 'entering' || stage() === 'leaving',
  timeout: 5000,
  onEnd: () => complete(),
})`,
    notes: 'Listens for `transitionend` / `animationend` on `ref.current` while `active()` is true and calls `onEnd` exactly once when the animation finishes — or after `timeout` ms (default 5000) as a safety fallback if the event never fires. Events bubbling from child elements are ignored (`e.target` must be the element itself). Listeners attach when `active` flips true and are cleaned up when it flips false. Its signature type is exported as `UseAnimationEnd`. See also: useTransitionState.',
    mistakes: `- Passing a callback ref — the option is a \`Ref<HTMLElement>\` OBJECT; the hook reads \`ref.current\` when \`active\` flips true
- Setting \`timeout\` shorter than the actual transition duration — the fallback timer calls \`onEnd\` early, before the animation finishes
- Expecting \`onEnd\` for a child element's transition — bubbled events where \`e.target !== el\` are deliberately ignored
- Passing a static boolean for \`active\` — it is a reactive accessor; the listeners attach/detach as it flips`,
  },

  'kinetic/KineticComponent': {
    signature: `type KineticComponent<Tag extends string, Mode extends KineticMode = 'transition'> = ComponentFn<KineticComponentProps<Tag, Mode>> & KineticChain<Tag, Mode>`,
    example: `import type { KineticComponent } from '@pyreon/kinetic'

const FadeBox: KineticComponent<'div', 'transition'> = kinetic('div').preset(fade)
const List: KineticComponent<'ul', 'group'> = kinetic('ul').preset(fade).group()`,
    notes: 'The value `kinetic(tag)` returns — a renderable component intersected with the chain methods. The `Mode` parameter switches the accepted prop set (`show`/`unmount` in transition, `transition` in collapse, `interval`/`reverseLeave` in stagger, no `show` in group) and narrows what `.config(opts)` accepts. See also: kinetic.',
    mistakes: `- Annotating a \`.collapse()\` / \`.stagger()\` / \`.group()\` result with the default \`'transition'\` mode parameter — mode switches change the type: \`kinetic('ul').group()\` is \`KineticComponent<'ul', 'group'>\``,
  },

  'kinetic/Preset': {
    signature: 'type Preset = StyleTransitionProps & ClassTransitionProps',
    example: `import type { Preset } from '@pyreon/kinetic'

const myPreset: Preset = {
  enterStyle: { opacity: 0, transform: 'translateY(20px)' },
  enterToStyle: { opacity: 1, transform: 'translateY(0)' },
  enterTransition: 'all 400ms ease-out',
  leaveStyle: { opacity: 1, transform: 'translateY(0)' },
  leaveToStyle: { opacity: 0, transform: 'translateY(20px)' },
  leaveTransition: 'all 250ms ease-in',
}
const Box = kinetic('div').preset(myPreset)`,
    notes: 'A plain object holding the style-form fields (`enterStyle`/`enterToStyle`/`enterTransition` + leave siblings) and/or the class-form fields (`enter`/`enterFrom`/`enterTo` + leave siblings) that `.preset(...)` spreads into the chain config. Structurally identical to the `Preset` type in `@pyreon/kinetic-presets`, so factory results from that package pass straight to `.preset(...)`. See also: StyleTransitionProps, ClassTransitionProps, @pyreon/kinetic-presets.',
  },

  'kinetic/StyleTransitionProps': {
    signature: 'type StyleTransitionProps = { enterStyle?: CSSProperties; enterToStyle?: CSSProperties; enterTransition?: string; leaveStyle?: CSSProperties; leaveToStyle?: CSSProperties; leaveTransition?: string }',
    example: `const SlidePanel = kinetic('aside')
  .enter({ opacity: 0, transform: 'translateX(-100%)' })   // enterStyle
  .enterTo({ opacity: 1, transform: 'translateX(0)' })     // enterToStyle
  .enterTransition('all 300ms ease-out')`,
    notes: 'Style-form transition definition (the zero-CSS path). `enterStyle` applies on the first frame of enter, `enterToStyle` on the second frame (kept until complete), `enterTransition` is the CSS transition shorthand active during enter; the `leave*` trio mirrors it. Set via `.enter()` / `.enterTo()` / `.enterTransition()` and the leave siblings. See also: ClassTransitionProps, Preset.',
  },

  'kinetic/ClassTransitionProps': {
    signature: 'type ClassTransitionProps = { enter?: string; enterFrom?: string; enterTo?: string; leave?: string; leaveFrom?: string; leaveTo?: string }',
    example: `const TailwindFade = kinetic('div')
  .enterClass({ active: 'transition-opacity duration-300', from: 'opacity-0', to: 'opacity-100' })
  .leaveClass({ active: 'transition-opacity duration-200', from: 'opacity-100', to: 'opacity-0' })`,
    notes: 'Class-form transition definition for utility-class CSS (Tailwind, CSS modules). `enter` stays on the element for the whole enter phase, `enterFrom` applies on the first frame and is removed on the next, `enterTo` applies on the second frame and is kept until complete; the `leave*` trio mirrors it. Set via `.enterClass({ active, from, to })` / `.leaveClass(...)` — `active` maps to `enter`/`leave`, `from` to `enterFrom`/`leaveFrom`, `to` to `enterTo`/`leaveTo`. The SSR hidden-state class is `leaveTo` when defined, else `enterFrom`. See also: StyleTransitionProps, Preset.',
  },

  'kinetic/TransitionCallbacks': {
    signature: 'type TransitionCallbacks = { onEnter?: () => void; onAfterEnter?: () => void; onLeave?: () => void; onAfterLeave?: () => void }',
    example: `const Notice = kinetic('div').preset(fade).on({
  onEnter: () => console.warn('entering'),
  onAfterLeave: () => console.warn('left'),
})`,
    notes: `Lifecycle callbacks — attach via \`.on(callbacks)\` on the chain or pass as props on the rendered component (props override the chain's). \`onEnter\` fires when the enter phase begins, \`onAfterEnter\` when the enter animation completes, \`onLeave\` / \`onAfterLeave\` mirror for leave. Under reduced motion the pairs fire back-to-back with no visual animation. See also: kinetic.`,
  },
  // <gen-docs:api-reference:end @pyreon/kinetic>

  // <gen-docs:api-reference:start @pyreon/kinetic-presets>

  'kinetic-presets/presets': {
    signature: 'Record<string, Preset>',
    example: `import { fadeUp, bounceIn } from '@pyreon/kinetic-presets'   // tree-shakeable
import { presets } from '@pyreon/kinetic-presets'             // dynamic access

const Hero = kinetic('div').preset(fadeUp)
const Dynamic = kinetic('div').preset(presets[userChoice])    // 'fadeUp' | 'scaleIn' | ...`,
    notes: 'The full catalog as one `as const` map — 122 entries, every one also available as a named export (`fadeUp`, `bounceIn`, `zoomInLeft`, ...). Use the map for dynamic selection (`presets[name]`); use named imports for tree-shaking (a single named preset ships ~300 bytes thanks to per-call pure annotations). Categories: fades (14), slides (8), scales (8), zooms (10), flips (6), rotations (8), bounce/spring/pop (10), blur (6), puff (2), clip-path (8), perspective (4), tilt (4), swing (4), slit (2), swirl (2), back (4), light-speed (2), roll (2), fly (4), float (4), push (2), expand (2), skew (4), drop/rise (2). All are style-form presets built on `all <duration> <easing>` transitions (default enter 300ms ease-out / leave 200ms ease-in; spring/bounce presets override the easing with cubic-bezier curves). See also: Preset, compose, @pyreon/kinetic.',
    mistakes: `- Indexing \`presets[name]\` with a misspelled name — it returns \`undefined\`, and \`kinetic(...).preset(undefined)\` silently applies nothing (spreading undefined is a no-op); there's no runtime error, the element just doesn't animate
- Importing the whole \`presets\` map when you use one or two presets — the map pins all 122 entries; named imports tree-shake to just what you use`,
  },

  'kinetic-presets/createFade': {
    signature: '(options?: FadeOptions) => Preset',
    example: `createFade()                                    // pure opacity fade
createFade({ direction: 'up', distance: 24 })   // fade with movement
createFade({ duration: 500, easing: 'ease-in-out' })`,
    notes: `Factory for fade presets. With no \`direction\` it is a pure opacity fade (0 → 1); with a \`direction\` it adds movement — the element enters traveling in that direction (\`'up'\` starts \`translateY(distance)\` below and moves to 0). Options: \`direction?: 'up' | 'down' | 'left' | 'right'\`, \`distance?: number\` (px, default 16), plus the timing options every factory shares: \`duration?: number\` (ms, default 300), \`leaveDuration?: number\` (default 200), \`easing?: string\` (default 'ease-out'), \`leaveEasing?: string\` (default 'ease-in'). See also: createSlide, createScale, createRotate, createBlur.`,
  },

  'kinetic-presets/createSlide': {
    signature: '(options?: SlideOptions) => Preset',
    example: `createSlide({ direction: 'left', distance: 32 })
createSlide({ duration: 400, leaveDuration: 250 })`,
    notes: `Factory for slide presets — same shape as \`createFade\` but \`direction\` defaults to \`'up'\` (always includes movement). The generated preset fades opacity alongside the translate. Options: \`direction?\` (default 'up'), \`distance?\` (px, default 16), plus the shared \`duration\` / \`leaveDuration\` / \`easing\` / \`leaveEasing\`. See also: createFade.`,
  },

  'kinetic-presets/createScale': {
    signature: '(options?: ScaleOptions) => Preset',
    example: `createScale({ from: 0.5, duration: 400 })
createScale({ from: 0.8, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' })  // spring bounce`,
    notes: 'Factory for scale presets — enters from `scale(from)` + opacity 0 to `scale(1)` + opacity 1; leave reverses. `from` defaults to 0.9. Pair with a spring cubic-bezier easing for bouncy pop-ins. Shares the `duration` / `leaveDuration` / `easing` / `leaveEasing` timing options. See also: createFade, createBlur.',
  },

  'kinetic-presets/createRotate': {
    signature: '(options?: RotateOptions) => Preset',
    example: `createRotate({ degrees: 30, duration: 400 })
createRotate({ degrees: -90 })  // counter-clockwise enter`,
    notes: 'Factory for rotation presets — enters from `rotate(-degrees)` + opacity 0 to `rotate(0)`; the leave ends at `rotate(+degrees)` (opposite spin on the way out). `degrees` defaults to 15; pass a negative value for counter-clockwise enter. Shares the timing options. See also: createFade.',
  },

  'kinetic-presets/createBlur': {
    signature: '(options?: BlurOptions) => Preset',
    example: `createBlur({ amount: 12, duration: 400 })
createBlur({ amount: 8, scale: 0.95 })  // blur + scale`,
    notes: 'Factory for blur presets — enters from `blur(amount)` + opacity 0 to `blur(0px)` + opacity 1. `amount` defaults to 8 (px). Optional `scale` adds a `transform: scale(scale)` to the hidden state for a combined blur-and-scale reveal. Shares the timing options. Note `filter` animates on the compositor thread, so blur presets stay smooth. See also: createScale.',
  },

  'kinetic-presets/compose': {
    signature: '(...items: Preset[]) => Preset',
    example: `const fancy = compose(fade, scaleIn, blurIn)
// enterStyle:      { opacity: 0, transform: 'scale(0.9)', filter: 'blur(8px)' }
// enterTransition: 'all 300ms ease-out'  (from blurIn — the LAST preset wins)`,
    notes: 'Merge multiple presets into one. Style objects (`enterStyle` / `enterToStyle` / `leaveStyle` / `leaveToStyle`) are shallow-merged — a later preset wins per CSS property. Transition strings (`enterTransition` / `leaveTransition`) are LAST-preset-wins (replaced, not comma-joined). Class fields (`enter` / `enterFrom` / ... ) are concatenated with a space. Style-form and class-form fields merge independently, so composing an inline preset with a class preset yields both surfaces. See also: withDuration, withEasing, withDelay, reverse.',
    mistakes: `- Expecting transition strings to be comma-joined — \`enterTransition\` / \`leaveTransition\` are taken from the LAST preset that defines them; the built-in presets all use \`all ...\` transitions so the last one still animates every merged property
- Expecting property-level deep merge — style merge is shallow: if two presets both set \`transform\` in \`enterToStyle\`, the later one replaces it entirely`,
  },

  'kinetic-presets/withDuration': {
    signature: '(preset: Preset, enterMs: number, leaveMs?: number) => Preset',
    example: `const slow = withDuration(fadeUp, 600, 400)
// enterTransition: 'all 600ms ease-out'
// leaveTransition: 'all 400ms ease-in'`,
    notes: 'Return a copy of the preset with new durations — replaces the FIRST duration token (e.g. `300ms`) in `enterTransition` and `leaveTransition` via regex. `leaveMs` defaults to `enterMs`. Only affects the style-form transition STRINGS: a class-form preset (Tailwind `duration-300` classes) is untouched — change the classes instead. See also: withEasing, withDelay, compose.',
    mistakes: `- Applying it to a class-form preset — there is no transition string to rewrite, so the Tailwind \`duration-*\` classes keep their own timing
- Expecting every duration in a multi-property transition string to change — only the FIRST duration token is replaced (the built-in presets use single \`all <duration> <easing>\` shorthands, where this is exact)`,
  },

  'kinetic-presets/withEasing': {
    signature: '(preset: Preset, enterEasing: string, leaveEasing?: string) => Preset',
    example: `const springy = withEasing(scaleIn, 'cubic-bezier(0.34, 1.56, 0.64, 1)')
// enterTransition: 'all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)'`,
    notes: 'Return a copy of the preset with new easing — replaces the TRAILING easing token (`ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`, or `cubic-bezier(...)`) at the end of `enterTransition` / `leaveTransition`. `leaveEasing` defaults to `enterEasing`. Style-form transition strings only, same caveat as `withDuration`. See also: withDuration, withDelay.',
    mistakes: '- Using it on a transition string whose easing is not one of the recognized trailing patterns (`ease*` / `linear` / `cubic-bezier(...)`) — the regex will not match and the string is returned unchanged',
  },

  'kinetic-presets/withDelay': {
    signature: '(preset: Preset, enterDelayMs: number, leaveDelayMs?: number) => Preset',
    example: `const delayed = withDelay(fadeUp, 150, 0)
// enterTransition: 'all 300ms 150ms ease-out'
// leaveTransition: 'all 200ms 0ms ease-in'`,
    notes: `Return a copy of the preset with a transition delay — inserts the delay after the first duration in the transition string, following the CSS shorthand order \`property duration delay easing\` (\`all 300ms ease-out\` → \`all 300ms 150ms ease-out\`). \`leaveDelayMs\` defaults to \`enterDelayMs\`; pass \`0\` for no leave delay. Useful for hand-rolled staggering when you are not using kinetic's stagger mode. See also: withDuration, compose.`,
  },

  'kinetic-presets/reverse': {
    signature: '(preset: Preset) => Preset',
    example: `const flipped = reverse(fadeUp)
// enterStyle:   { opacity: 1, transform: 'translateY(0)' }     (was leaveStyle)
// enterToStyle: { opacity: 0, transform: 'translateY(16px)' }  (was leaveToStyle)`,
    notes: 'Swap the enter and leave phases of a preset — ALL fields are swapped, style-form (`enterStyle` ↔ `leaveStyle`, `enterToStyle` ↔ `leaveToStyle`, `enterTransition` ↔ `leaveTransition`) and class-form (`enter` ↔ `leave`, `enterFrom` ↔ `leaveFrom`, `enterTo` ↔ `leaveTo`) alike. A preset that entered from below now enters from where it used to leave to. See also: compose.',
    mistakes: '- Expecting the reversed enter to look like "the same animation backwards" — `reverse` swaps the phase FIELDS wholesale, so timing asymmetry swaps too (the 200ms leave transition becomes the enter transition)',
  },

  'kinetic-presets/Preset': {
    signature: 'type Preset = { enterStyle?: CSSProperties; enterToStyle?: CSSProperties; enterTransition?: string; leaveStyle?: CSSProperties; leaveToStyle?: CSSProperties; leaveTransition?: string; enter?: string; enterFrom?: string; enterTo?: string; leave?: string; leaveFrom?: string; leaveTo?: string }',
    example: `import type { Preset } from '@pyreon/kinetic-presets'

const twPreset: Preset = {
  enter: 'transition-all duration-300 ease-out',
  enterFrom: 'opacity-0 translate-y-4',
  enterTo: 'opacity-100 translate-y-0',
  leave: 'transition-all duration-200 ease-in',
  leaveFrom: 'opacity-100 translate-y-0',
  leaveTo: 'opacity-0 -translate-y-2',
}`,
    notes: `A preset is a plain object with up to 12 optional fields: six style-form (\`enterStyle\` / \`enterToStyle\` : \`CSSProperties\`, \`enterTransition\` : \`string\`, + leave siblings) and six class-form strings (\`enter\` / \`enterFrom\` / \`enterTo\` + leave siblings, Tailwind-friendly). Structurally identical to \`@pyreon/kinetic\`'s own \`Preset\` type, so hand-written objects and factory results interoperate. Supporting option types are also exported: \`Direction\`, \`FadeOptions\`, \`SlideOptions\`, \`ScaleOptions\`, \`RotateOptions\`, \`BlurOptions\`, \`CSSProperties\`. See also: presets, @pyreon/kinetic.`,
  },
  // <gen-docs:api-reference:end @pyreon/kinetic-presets>

  // <gen-docs:api-reference:start @pyreon/connector-document>

  'connector-document/extractDocumentTree': {
    signature: '(vnode: unknown, options?: ExtractOptions) => DocNode',
    example: `import { extractDocumentTree } from '@pyreon/connector-document'
import { render } from '@pyreon/document'
import { DocDocument, DocHeading, DocText } from '@pyreon/document-primitives'

const vnode = (
  <DocDocument title={() => reportTitle()} author="Acme Inc.">
    <DocHeading level="h1">Summary</DocHeading>
    <DocText>{() => summaryText()}</DocText>
  </DocDocument>
)

// Snapshot extraction — accessors read LIVE values at this moment
const tree = extractDocumentTree(vnode, { rootSize: 16, includeStyles: true })
const pdf = await render(tree, 'pdf')

// After a signal change, extract again for a fresh tree:
reportTitle.set('Q4 Report (final)')
const freshTree = extractDocumentTree(vnode)`,
    notes: 'Walk a Pyreon VNode tree and extract a `DocNode` tree for `@pyreon/document`. For each vnode whose component carries a `_documentType` marker it reads the marker → `DocNode.type`, resolves `_documentProps` → `DocNode.props` (pre-resolved vnode props → rocketstyle `__rs_attrs` fast path → full component invocation as legacy fallback), resolves `$rocketstyle` via `resolveStyles` → `DocNode.styles`, and recurses into children. Transparent (children flatten into the parent, no node produced): unmarked components (invoked), DOM elements (`div`, `span`), `<>…</>` **Fragments**, and a component that returns a bare `VNodeChild[]` array. Function values in `_documentProps` and reactive accessor children are resolved (called) at extraction time. ALWAYS returns a `DocNode` — loose children are wrapped in `{ type: "document" }`. See also: resolveStyles, ExtractOptions, DocumentMarker, @pyreon/document, @pyreon/document-primitives.',
    mistakes: `- Testing the extraction pipeline ONLY with hand-constructed mock vnodes that pre-attach \`_documentProps\` (the pre-resolved path) — the real rocketstyle path (\`__rs_attrs\` hoisted-attrs chain) is bypassed entirely. PR #197's silent metadata drop hid for the package's whole lifetime because no test ran a real \`h()\` primitive through extraction; always pair a mock-vnode test with a real-\`h()\` test
- Expecting extraction to SUBSCRIBE to signals — reactive accessor children and function-valued \`_documentProps\` are resolved ONCE per call; call \`extractDocumentTree\` again after a signal change to get a fresh tree
- Under \`init({ cssVariables: true })\`, forgetting \`resolveVar\` — \`$rocketstyle\` values are \`var(--…)\` reference strings PDF/DOCX/email cannot evaluate; compose \`resolveModeVar\` (\`@pyreon/rocketstyle\`) with \`resolveCssVarReferences\` (\`@pyreon/unistyle\`)
- Expecting a \`DocNode | DocChild[] | null\` return — the internal walker produces that union, but the public function ALWAYS returns a \`DocNode\`, wrapping loose children in \`{ type: "document", props: {}, children }\`
- Marking a non-rocketstyle component with \`_documentType\` and relying on side effects in its body — the legacy fallback path INVOKES the component to find \`_documentProps\`; keep marked components pure
- Expecting browser-only CSS (\`transition\`, \`cursor\`, \`display\`, animations) to reach the document — \`resolveStyles\` extracts only the properties \`ResolvedStyles\` supports and silently drops the rest
- Assuming \`<>…</>\` grouping or a component returning multiple siblings via a Fragment (or a bare array) is a no-op — it is transparent (children flatten into the parent). This was a silent DROP before the 0.45.x fix: a fragment vnode matched no branch and its whole subtree vanished from the export with no error`,
  },

  'connector-document/resolveStyles': {
    signature: '(source: Record<string, unknown>, rootSize?: number, resolveVar?: VarResolver) => ResolvedStyles',
    example: `import { resolveStyles } from '@pyreon/connector-document'

const styles = resolveStyles(
  {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#222',
    padding: '12px 16px',
    transition: 'all 0.2s', // silently dropped — not a document property
  },
  16,
)
// → { fontSize: 24, fontWeight: 'bold', color: '#222', padding: [12, 16] }`,
    notes: 'Convert a rocketstyle `$rocketstyle` theme object into a `ResolvedStyles` object compatible with `@pyreon/document`. Extracts typography (fontSize/fontFamily/fontWeight/fontStyle/textDecoration/color/backgroundColor/textAlign/lineHeight/letterSpacing), box model (padding/margin as tuples), border (radius/width/color/style), sizing (width/height/maxWidth — numeric when parseable, raw string like `"100%"` otherwise), and opacity. Everything else (transitions, cursor, display) is silently dropped. Dimensions parse via `parseCssDimension` (rem/em × rootSize, pt × 4/3). `resolveVar` inlines `var(--…)` string values up front for cssVariables-mode apps. See also: extractDocumentTree, VarResolver, parseCssDimension, parseBoxModel.',
    mistakes: `- Expecting \`fontWeight: 'bold'\` to resolve to \`700\` — \`parseFontWeight\` passes \`'normal'\` / \`'bold'\` through as string literals (both valid \`ResolvedStyles\` values); only numeric strings become numbers
- Expecting \`em\` to track the element's own font size — at extraction time there is no cascade, so \`em\` is treated like \`rem\` (multiplied by \`rootSize\`)
- Passing enum values outside the supported sets — \`textAlign\` accepts only left/center/right/justify, \`borderStyle\` only solid/dashed/dotted, \`fontStyle\` only normal/italic, \`textDecoration\` only none/underline/line-through; anything else is dropped
- Assuming percentage sizing parses to a number — \`width: "100%"\` is kept as the raw string (only px/rem/em/pt/unitless parse to numbers)`,
  },

  'connector-document/parseCssDimension': {
    signature: '(value: string | number | null | undefined, rootSize?: number) => number | undefined',
    example: `parseCssDimension(14)          // 14
parseCssDimension('14px')      // 14
parseCssDimension('1.5rem', 16) // 24
parseCssDimension('12pt')      // 16
parseCssDimension('auto')      // undefined
parseCssDimension('50%')       // undefined`,
    notes: 'Parse a CSS dimension to a number: numbers pass through, `"14px"` → 14, `"1.5rem"` / `"1.5em"` → 1.5 × rootSize, `"12pt"` → 16 (pt × 4/3), unitless numeric strings parse. Anything else (`"auto"`, percentages, calc/var expressions) returns `undefined`. See also: parseBoxModel, resolveStyles.',
    mistakes: '- Feeding a `var(--…)` / `calc(…)` string — returns `undefined`; inline it first via a `VarResolver`',
  },

  'connector-document/parseBoxModel': {
    signature: '(value: string | number | undefined, rootSize?: number) => number | [number, number] | [number, number, number, number] | undefined',
    example: `parseBoxModel(8)                  // 8
parseBoxModel('8px 16px')          // [8, 16]
parseBoxModel('8px 16px 12px')     // [8, 16, 12, 16]
parseBoxModel('0.5rem 1rem', 16)   // [8, 16]`,
    notes: 'Parse a CSS padding/margin shorthand to the document tuple format: `8` → `8`, `"8px 16px"` → `[8, 16]`, the 3-value shorthand `"8px 16px 12px"` expands to the CSS-equivalent 4-tuple `[8, 16, 12, 16]`, and 4 values map 1:1. Each segment parses via `parseCssDimension`. See also: parseCssDimension, resolveStyles.',
    mistakes: '- One unparseable segment (`"8px auto"`) invalidates the WHOLE shorthand — the function returns `undefined`, not a partial tuple',
  },

  'connector-document/parseFontWeight': {
    signature: `(value: string | number | undefined) => 'normal' | 'bold' | number | undefined`,
    example: `parseFontWeight(600)      // 600
parseFontWeight('600')    // 600
parseFontWeight('bold')   // 'bold' (string, NOT 700)
parseFontWeight('bolder') // undefined`,
    notes: 'Parse a CSS font-weight: numbers pass through, the keywords `"normal"` / `"bold"` pass through AS STRINGS, numeric strings (`"600"`) parse to numbers. Other keywords (`"lighter"`, `"bolder"`) return `undefined`. See also: resolveStyles.',
    mistakes: `- Expecting \`'bold'\` → \`700\` / \`'normal'\` → \`400\` — the keywords pass through unchanged as \`ResolvedStyles\`-valid string literals`,
  },

  'connector-document/parseLineHeight': {
    signature: '(value: string | number | undefined, rootSize?: number) => number | undefined',
    example: `parseLineHeight(1.5)          // 1.5 (ratio, passes through)
parseLineHeight('1.5')        // 1.5
parseLineHeight('24px')       // 24
parseLineHeight('1.5rem', 16) // 24
parseLineHeight('normal')     // undefined`,
    notes: 'Parse a CSS line-height to a plain number: numbers pass through (a unitless ratio like `1.5` stays `1.5`), dimension strings parse via `parseCssDimension` (`"24px"` → 24, `"1.5rem"` → 24 with rootSize 16), and `"normal"` returns `undefined`. Note the return is a bare number — a unitless ratio and a px value are not distinguished in the type. See also: parseCssDimension, resolveStyles.',
    mistakes: '- Expecting a discriminated `{ ratio }` / `{ px }` result — the return is a plain `number | undefined`; callers must know which semantic they fed in',
  },

  'connector-document/ExtractOptions': {
    signature: 'interface ExtractOptions { rootSize?: number; includeStyles?: boolean; resolveVar?: VarResolver }',
    example: `import { resolveModeVar } from '@pyreon/rocketstyle'
import { resolveCssVarReferences, themeToCssVars } from '@pyreon/unistyle'

const { registry } = themeToCssVars(theme)
const tree = extractDocumentTree(vnode, {
  rootSize: 16,
  includeStyles: true,
  resolveVar: (v) => resolveCssVarReferences(resolveModeVar(v, mode), registry),
})`,
    notes: 'Options for `extractDocumentTree`. `rootSize` (default 16) is the rem→px base for style resolution; `includeStyles` (default true) toggles resolving `$rocketstyle` into `DocNode.styles`; `resolveVar` inlines `var(--…)` style values to raw values during extraction — required when the app runs under `init({ cssVariables: true })`, since PDF/DOCX/email targets cannot evaluate CSS custom properties. See also: extractDocumentTree, VarResolver.',
  },

  'connector-document/VarResolver': {
    signature: 'type VarResolver = (value: unknown) => unknown',
    example: `const resolveVar: VarResolver = (v) =>
  resolveCssVarReferences(resolveModeVar(v, 'light'), registry)

const styles = resolveStyles(rocketstyleTheme, 16, resolveVar)`,
    notes: 'Maps a style value to a render-target-evaluable one. Under cssVariables theming, `$rocketstyle` values can be `var(--…)` reference strings; a resolver (compose `resolveModeVar` from `@pyreon/rocketstyle` with `resolveCssVarReferences` from `@pyreon/unistyle`) inlines them to raw values at extraction time. Only own STRING values are remapped; non-strings pass through unchanged. See also: ExtractOptions, resolveStyles.',
  },

  'connector-document/DocumentMarker': {
    signature: 'interface DocumentMarker { _documentType: NodeType }',
    example: `import type { VNodeChild } from '@pyreon/core'

// Plain-function marked component (non-rocketstyle):
function Callout(props: { children?: VNodeChild }) {
  return <div _documentProps={{}}>{props.children}</div>
}
Callout._documentType = 'section'`,
    notes: `Marker interface: components carrying \`_documentType\` are extractable. Rocketstyle primitives set it via \`.statics({ _documentType: "heading" })\` (the extractor reads it from the component's \`.meta\`); plain function components set it as a direct static property. \`@pyreon/document-primitives\` ships 18 pre-marked primitives; follow the same convention for custom ones. See also: extractDocumentTree, @pyreon/document-primitives.`,
    mistakes: '- Forgetting the marker — an unmarked component is TRANSPARENT: the extractor invokes it and flattens its children into the parent instead of producing a node',
  },

  'connector-document/DocNode': {
    signature: 'interface DocNode { type: NodeType; props: Record<string, unknown>; children: DocChild[]; styles?: ResolvedStyles }',
    example: `import type { DocChild, DocNode, NodeType, ResolvedStyles } from '@pyreon/connector-document'

const node: DocNode = {
  type: 'heading',
  props: { level: 1 },
  children: ['Summary'],
}`,
    notes: 'The format-agnostic document node — re-exported from `@pyreon/document` (along with `DocChild = DocNode | string`, the `NodeType` union of 18 node kinds, and `ResolvedStyles`) so extracted trees stay assignment-compatible across the package boundary without a duplicate type identity. See also: extractDocumentTree, @pyreon/document.',
  },
  // <gen-docs:api-reference:end @pyreon/connector-document>

  // <gen-docs:api-reference:start @pyreon/testing>

  'testing/render': {
    signature: 'render(ui: VNodeChild, options?: { container?: HTMLElement; baseElement?: HTMLElement }) => RenderResult',
    example: `const { getByText, unmount, container } = render(<Greeting name="Ada" />)
expect(getByText('Hello, Ada')).toBeInTheDocument()
unmount()`,
    notes: 'Mount a Pyreon VNode into an isolated container (a fresh `<div>` appended to `baseElement`, default `document.body`) via `mount()` from `@pyreon/runtime-dom`, and return a Testing-Library-bound result: the full query set spread in, plus `container`, `baseElement`, `unmount()`, and `debug()` (returns `container.innerHTML`). Synchronous. Registers the result so `cleanup()` can tear it down. See also: cleanup, renderHook.',
    mistakes: `- Forgetting to unmount — \`render\` does NOT self-clean; call \`cleanup()\` (or add \`@pyreon/testing/vitest\` to setupFiles for auto \`afterEach(cleanup)\`), or you leak DOM + reactive subscriptions across tests.
- Expecting queries to be scoped to the container — the bound queries resolve from \`baseElement\` (\`document.body\`), NOT \`container\`. This is intentional (matches @testing-library/react) so Portal / Overlay / Modal content rendered OUTSIDE the container is still findable; for container-only assertions use \`within(result.container)\`.
- Awaiting it — \`render\` is synchronous; there is no promise to await (use \`waitFor\` for async DOM updates).`,
  },

  'testing/cleanup': {
    signature: 'cleanup() => void',
    example: `import { cleanup } from '@pyreon/testing'
afterEach(cleanup)`,
    notes: 'Unmount every live `render()` result (each `unmount()` disposes the tree + removes its container). Snapshots the set first so it is order-independent and idempotent. Synchronous. See also: render.',
    mistakes: `- Assuming it runs automatically — it is NOT auto-registered by the main entry. Auto \`afterEach(cleanup)\` fires ONLY when you add \`@pyreon/testing/vitest\` to your vitest \`setupFiles\` (that entry also extends \`expect\` with jest-dom matchers); otherwise call \`cleanup()\` yourself.
- Awaiting it — \`cleanup\` is synchronous.`,
  },

  'testing/renderHook': {
    signature: 'renderHook<Result, Props = undefined>(hook: (props: () => Props) => Result, options?: { initialProps?: Props }) => { result: { readonly current: Result }; rerender: (props: Props) => void; unmount: () => void }',
    example: `const { result, rerender } = renderHook((props) => useDouble(props), { initialProps: 2 })
expect(result.current()).toBe(4)
rerender(3) // updates the props signal; the hook re-reads it only if it reads props() reactively`,
    notes: 'Test a hook in isolation. Mounts a probe component that invokes `hook(() => props())` ONCE, capturing the return into `result.current` (a live getter). `rerender(next)` updates the backing props signal; `unmount()` tears down. Synchronous. See also: render.',
    mistakes: `- Expecting \`rerender(next)\` to RE-INVOKE the hook — the hook runs ONCE (Pyreon components/hooks run once, unlike @testing-library/react). \`rerender\` only sets the props signal, so a hook sees new props ONLY if it reads \`props()\` inside a \`computed\` / \`effect\`.
- Reading \`result.current\` as a plain value — it is a live getter; a hook that returns a signal/accessor updates through it, but a hook that returns a captured-once value will not.`,
  },

  'testing/expectSignal': {
    signature: 'expectSignal(target: unknown) => { toHaveChangedTimes(n: number): void; toHaveRecomputedTimes(n: number): void }',
    example: `const total = computed(() => qty() * price())
total()          // materialize
qty.set(2)
expectSignal(total).toHaveRecomputedTimes(1)`,
    notes: `Assert how many times a signal/computed fired, by reading its node's \`fires\` count from Pyreon's reactive graph (\`getReactiveGraph()\`). Catches over-computation / thrash a DOM assertion cannot see. Synchronous; dev/test build only. See also: expectEffect, expectNoReactiveLeak.`,
    mistakes: `- \`toHaveChangedTimes\` and \`toHaveRecomputedTimes\` are the SAME check (both assert \`fires === n\`) — they differ only in the error wording. There is no semantic distinction at runtime; pick whichever reads clearer.
- Passing a non-reactive value — the target must be a signal/computed (a reactive-graph node); anything else throws \`[Pyreon] expectSignal: target is not a reactive node\`.
- Running against a production build — the reactive graph is tree-shaken out in production (\`NODE_ENV === "production"\`), so these matchers only work in dev/test.
- Counting a computed that was never READ — a lazy computed has zero fires until something materializes it; call \`total()\` (or mount a reader) before asserting.`,
  },

  'testing/expectEffect': {
    signature: 'expectEffect(handle: unknown) => { toReRunWhen(action: () => void): void; notToReRunWhen(action: () => void): void }',
    example: `const e = effect(() => { theme() })
expectEffect(e).toReRunWhen(() => theme.set('dark'))
expectEffect(e).notToReRunWhen(() => unrelated.set(1))`,
    notes: `Assert whether an effect re-runs in response to an action. Samples the effect node's \`fires\` before and after invoking \`action()\`: \`toReRunWhen\` requires it grew (ran at least once), \`notToReRunWhen\` requires it stayed equal. \`handle\` is the \`Effect\` object returned by \`effect(...)\`. Synchronous; dev/test build only. See also: expectSignal, expectNoReactiveLeak.`,
    mistakes: `- Passing something other than the \`effect(...)\` return value — \`handle\` must be the \`Effect\` node; a non-node throws.
- Using an ASYNC \`action\` — it must be synchronous (\`() => void\`); fires triggered after the synchronous \`action()\` returns are not captured.
- Reading \`toReRunWhen\` as "exactly once" — it asserts "at least once" (\`after > before\`); use \`expectSignal(...).toHaveChangedTimes\` for an exact count.`,
  },

  'testing/expectGarbageCollected': {
    signature: 'expectGarbageCollected(factory: () => object) => Promise<void>',
    example: `await expectGarbageCollected(() => {
  const view = mountSomething()
  view.unmount()
  return view
})`,
    notes: 'ASYNC. Assert an object is reclaimable: `factory()` builds it, the strong ref is dropped, a two-pass GC runs (with a macrotask between passes to finalize DOM-shaped graphs), and it throws if a `WeakRef` to it still resolves (retained = leak). Requires `--expose-gc`. See also: expectNoReactiveLeak.',
    mistakes: `- Not running under \`--expose-gc\` — without \`globalThis.gc\` it THROWS an actionable error naming \`execArgv: ["--expose-gc"]\` (it never silently passes). Configure your vitest pool \`execArgv\`.
- Forgetting to \`await\` it — it is async; an un-awaited call passes vacuously.
- Leaking the object into an outer scope in the \`factory\` — if a closure/variable outside the factory still references it, the assertion (correctly) fails.`,
  },

  'testing/expectNoReactiveLeak': {
    signature: 'expectNoReactiveLeak(action: () => void | Promise<void>) => Promise<void>',
    example: `await expectNoReactiveLeak(async () => {
  const { unmount } = render(<Widget />)
  unmount()
})`,
    notes: 'ASYNC. Assert an action (typically a mount + unmount) leaves no retained reactive-graph nodes: GCs to a baseline `getReactiveGraph().nodes.length`, `await`s `action()`, GCs again, and throws if the node count grew and stayed grown. Catches subscription / effect-scope retention leaks. Requires `--expose-gc`. See also: expectGarbageCollected, expectEffect.',
    mistakes: `- Not running under \`--expose-gc\` — throws the same actionable error as \`expectGarbageCollected\` (never silently passes).
- Forgetting to \`await\` it — it is async.
- Expecting it to pinpoint the leak — it only reports that net node growth occurred; use heap-snapshot tooling to attribute it.`,
  },

  'testing/Testing Library re-exports': {
    signature: 'screen, fireEvent, waitFor, waitForElementToBeRemoved, within, getByRole, getByText, getByTestId, getBy*/queryBy*/findBy*, prettyDOM, configure, getConfig, getRoles, logRoles, isInaccessible, createEvent, … (verbatim from @testing-library/dom)',
    example: `import { screen, fireEvent, waitFor } from '@pyreon/testing'

fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Saved'))`,
    notes: 'The full `@testing-library/dom` surface is re-exported VERBATIM — same functions, same signatures, same ARIA + accessible-name edge-case handling as React/Vue/Solid Testing Library. Import `screen`, `fireEvent`, `waitFor`, `within`, and the `getBy*`/`queryBy*`/`findBy*` query families straight from `@pyreon/testing`. Their behavior is documented upstream at testing-library.com. See also: render, cleanup.',
    mistakes: `- Expecting \`findBy*\` / \`waitFor\` to be synchronous — the async query + wait helpers return Promises and must be \`await\`ed (this is upstream Testing-Library behavior, not Pyreon-specific).
- Reaching for \`screen\` without a prior \`render\` — \`screen\` queries \`document.body\`; nothing is there until a \`render()\` mounts into it.`,
  },

  'testing/renderForm': {
    signature: `renderForm<TValues>(setup: () => FormState<TValues>) => { form: FormState<TValues>; fill: (values: Partial<TValues>) => void; submit: () => Promise<void>; unmount: () => void } (from '@pyreon/testing/form')`,
    example: `import { renderForm, expectForm } from '@pyreon/testing/form'

const { form, fill, submit } = renderForm(() =>
  useForm({ initialValues: { email: '' }, validators: { email: required }, onSubmit }),
)
fill({ email: 'ada@lovelace.dev' })
await submit()
expectForm(form).toBeValid()`,
    notes: 'renderHook-style harness for `useForm` — runs your setup inside a probe component (no hand-written form component) and returns the `form` plus two drivers. `fill(values)` drives the form MODEL: per entry it runs `setFieldValue` + `setTouched` (mimicking type-then-blur) — no DOM events. `submit()` awaits the FULL `handleSubmit` pipeline (validators, focus-first-error, `onSubmit`). Synchronous setup; `submit` is async. Import from the `@pyreon/testing/form` subpath (optional peer `@pyreon/form`). See also: expectForm, fillForm, renderHook.',
    mistakes: `- \`fill()\` on an unregistered field — throws an actionable error naming the known fields. Declare the field in \`useForm({ initialValues })\` or register it via \`form.registerField()\` first.
- Expecting \`fill()\` to fire DOM events — it drives the MODEL (\`setFieldValue\` + \`setTouched\`). For a RENDERED form (register()-bound inputs) use \`fillForm(container, values)\` instead.
- Not awaiting \`submit()\` — the submit pipeline (async validators + \`onSubmit\`) settles asynchronously; assertions before the await race it.
- Asserting field errors before any validator ran — \`validateOn\` defaults to 'blur'; a freshly-created form has no errors yet. \`fill()\` marks fields touched but blur-validation is driven by events — \`await submit()\` (or \`await form.validate()\`) to force full validation.
- Reading \`form\` after \`unmount()\` — the probe is disposed; signals still read but the form no longer participates in a component tree.`,
  },

  'testing/fillForm': {
    signature: `fillForm(scope: HTMLElement, values: Record<string, string | number | boolean | File | File[]>) => void (from '@pyreon/testing/form')`,
    example: `render(<SignupForm />)
fillForm(document.body, { Email: 'ada@lovelace.dev', 'Accept terms': true })
await submitForm(document.body)`,
    notes: `Fill a REAL rendered form by ACCESSIBLE LABEL: keys are \`getByLabelText\` matchers (register()'s \`labelProps()\` wires the label↔input association; plain \`<label for>\` works too). Fires real \`input\` + \`blur\` events so \`register()\`'s handlers run — validation (default \`validateOn: 'blur'\`), dirty + touched tracking. Checkboxes/radios take a boolean (clicked only on state mismatch); file inputs take \`File | File[]\`; numbers are stringified. Synchronous. See also: submitForm, renderForm.`,
    mistakes: `- Keying by FIELD NAME instead of LABEL TEXT — keys resolve via \`getByLabelText\`, not \`register()\` field keys (register ids are opaque \`createUniqueId()\`s). An unlabelled input is unreachable — add a \`<label {...form.labelProps(field)}>\` (which is the a11y-correct markup anyway).
- Passing a string to a checkbox (throws — pass a boolean) or a non-File to a file input (throws — pass File | File[]).
- Asserting async-validator errors immediately — \`fillForm\` is synchronous; blur-triggered ASYNC validators settle later (\`await waitFor(...)\` / \`expect.poll\`).
- Using it for an unrendered form — that is \`renderForm().fill()\` territory; \`fillForm\` needs real inputs in the DOM.`,
  },

  'testing/submitForm': {
    signature: `submitForm(scope: HTMLElement) => Promise<void> (from '@pyreon/testing/form')`,
    example: `fillForm(container, { Email: 'ada@lovelace.dev' })
await submitForm(container)`,
    notes: 'Submit a REAL rendered form: locates the `<form>` element (scope itself, a descendant, or an ancestor via `closest`) and fires a real `submit` event — exactly what `<Form of={form}>` wires to `handleSubmit`. Resolves after one macrotask so sync validators + a sync `onSubmit` settle; throws an actionable error when no `<form>` exists in scope. See also: fillForm, renderForm.',
    mistakes: `- No \`<form>\` element — fields rendered without \`<Form of={form}>\` (or a plain \`<form>\`) throw; the submit event needs a form to dispatch on.
- Asserting an ASYNC \`onSubmit\`/validator result right after the await — only one macrotask is flushed; wrap the assertion in \`waitFor(...)\`.
- Calling \`form.handleSubmit()\` directly when you meant to test the DOM wiring — \`submitForm\` proves the event→handler path a direct call skips.`,
  },

  'testing/expectForm': {
    signature: `expectForm(form: FormState) => { toBeValid(); toBeInvalid(); toHaveFieldError(field, match?); toHaveNoFieldError(field); toBeDirty(); toBePristine(); toHaveValues(partial) } (from '@pyreon/testing/form')`,
    example: `await submit()
expectForm(form).toHaveFieldError('email', /invalid/)
expectForm(form).toBeDirty()
expectForm(form).toHaveValues({ email: 'ada@lovelace.dev' })`,
    notes: `Fluent assertions over a \`FormState\` (the package's \`expectSignal\` convention — no \`expect.extend\`). \`toBeValid\`/\`toBeInvalid\` read \`form.isValid()\` (reflects validators that have RUN); \`toHaveFieldError(field, match?)\` asserts a current error, optionally matching a string (exact) or RegExp; \`toBeDirty\`/\`toBePristine\` read \`isDirty()\`; \`toHaveValues(partial)\` subset-compares current values (===, JSON deep-equal for objects). All throw \`[Pyreon]\`-prefixed errors naming the actual state. See also: renderForm, fillForm.`,
    mistakes: `- \`toBeValid()\` on a form whose validators never ran — a fresh form has no errors so it IS "valid"; force validation first (\`await form.validate()\` or a submit) when you mean "the data passes the validators".
- String \`match\` is an EXACT comparison, not substring — use a RegExp (\`/invalid/\`) for partial matching.
- \`toHaveValues\` is a SUBSET compare — extra fields never fail it; assert the full object via \`expect(form.values()).toEqual(...)\` when you need exhaustiveness.`,
  },

  'testing/renderWithTheme': {
    signature: `renderWithTheme(ui: VNodeChild, options?: { theme?; mode?: 'light' | 'dark' | 'system'; wrapper?; container?; baseElement? }) => RenderResult & { setMode(mode): void; mode(): ThemeModeInput } (from '@pyreon/testing/ui')`,
    example: `const { getByRole, setMode } = renderWithTheme(<Button state="primary">Go</Button>, { theme })
setMode('dark') // reactive re-style — same element, new classes`,
    notes: `Render \`ui\` wrapped in \`<PyreonUI theme mode>\` so rocketstyle / styler / ui-components resolve a real theme. \`mode\` is backed by an internal signal passed as a getter — \`setMode('dark')\` flips REACTIVELY (components re-style in place, no remount). \`wrapper\` composes an OUTER provider (router, query) around the tree. Import from \`@pyreon/testing/ui\` (optional peer \`@pyreon/ui-core\`). See also: expectComputedStyle, render.`,
    mistakes: `- Omitting \`theme\` at the root — PyreonUI falls back to \`{}\`, so styled components see theme fields as \`undefined\` (no crash, wrong styles). Pass a real theme for style assertions.
- Expecting \`setMode\` to remount — it flips a signal; element identity is preserved (assert on the SAME node).
- Nesting a second PyreonUI in \`ui\` with its own mode — the inner provider wins for its subtree; \`setMode\` only drives the harness-level provider.`,
  },

  'testing/expectComputedStyle': {
    signature: `expectComputedStyle(element: Element, expected: Record<string, string | number>) => void — plus normalizeCssValue(property, value) (from '@pyreon/testing/ui')`,
    example: `expectComputedStyle(button, { color: 'red', fontWeight: 700 })`,
    notes: `Computed-style assertion with VALUE NORMALIZATION on both sides: each value round-trips through \`getComputedStyle\` on a body-attached probe, so in a real browser \`'red'\`, \`'#ff0000'\` and \`'rgb(255, 0, 0)'\` compare equal regardless of how the engine serializes. Accepts camelCase or kebab-case property names. Values the engine REJECTS fall back to trimmed-lowercase raw comparison (graceful degradation under happy-dom's partial parser). Throws a \`[Pyreon]\`-prefixed diff (raw + normalized, both sides). See also: renderWithTheme.`,
    mistakes: `- Relying on it in happy-dom for CLASS-based styles — happy-dom's \`getComputedStyle\` is partial (cascade/inheritance/media queries incomplete), so class-rule assertions can false-negative there. Computed-style assertions belong in \`*.browser.test.tsx\` (real Chromium); in happy-dom assert structure (class presence) instead.
- Expecting RELATIVE units to match — computed serialization resolves \`em\`/\`rem\` against the PROBE's body-level context, not your element's. Use absolute expectations (\`px\`, numeric weights, color functions).
- jest-dom overlap: \`toHaveStyle\` exists for inline-style-ish checks; this helper is specifically for COMPUTED values with cross-format color normalization.`,
  },

  'testing/renderWithRouter': {
    signature: `renderWithRouter(ui: VNodeChild | null, options: { routes?: RouteRecord[]; route?: string; mode?: 'hash' | 'history'; router?: Router; wrapper?; container?; baseElement? }) => Promise<RenderResult & { router: Router; navigate(path): Promise<NavigationResult> }> (from '@pyreon/testing/router')`,
    example: `const { router, navigate, getByText } = await renderWithRouter(null, {
  routes: [{ path: '/posts/:id', component: Post, loader: fetchPost }],
  route: '/posts/1',
})
expectRouter(router).toBeAt('/posts/:id')
await navigate('/posts/2')`,
    notes: `ASYNC render harness for \`@pyreon/router\`. Creates a router pinned to \`route\` (default \`'/'\`), then \`await router.preload(route)\` — the SSR-handler contract: lazy route components resolved into the cache AND the matched chain's loaders run — so the FIRST render shows final content (\`useLoaderData()\` populated, no loading fallbacks). Mounts \`ui\` inside \`<RouterProvider>\` (pass \`null\` for a bare \`<RouterView/>\`); \`unmount()\` destroys the router. \`navigate(path)\` = \`router.push\` — resolves with \`NavigationResult\` AFTER guards + loaders + DOM commit. See also: expectRouter, render.`,
    mistakes: `- Not awaiting \`renderWithRouter\` itself — it is ASYNC (initial lazy components + loaders resolve before mount); an un-awaited call hands you a Promise, not a render result.
- Not awaiting \`navigate()\` — assertions race the guards/loaders pipeline; the promise resolves only after the DOM committed.
- Ignoring the \`NavigationResult\` — \`'cancelled'\` (guard/blocker refused) and \`'superseded'\` (a newer navigation won) resolve WITHOUT an error; assert the result when the test depends on the navigation landing.
- Passing both \`routes\` and \`router\` — \`router\` wins and \`routes\` is ignored; a pre-built router must already carry its route table.
- Reusing one router across tests — RouterProvider \`destroy()\`s it on unmount; create per test (the default path does).`,
  },

  'testing/expectRouter': {
    signature: `expectRouter(router: Router) => { toBeAt(expected: string): void; notToBeAt(expected: string): void } (from '@pyreon/testing/router')`,
    example: `expectRouter(router).toBeAt('/posts/:id')
expectRouter(router).notToBeAt('/login')`,
    notes: `Fluent current-route assertion. \`expected\` matches either the CONCRETE path (\`'/posts/1'\`) or any matched record's PATTERN (\`'/posts/:id'\`) — so tests can assert the route SHAPE without hardcoding params. Failure messages name the current path + the matched pattern chain. See also: renderWithRouter.`,
    mistakes: `- Asserting mid-navigation — \`currentRoute\` only flips after the navigation COMMITS; \`await navigate(...)\` first.
- Query strings — \`toBeAt\` compares the resolved \`path\` (no search params); assert query state via \`router.currentRoute().query\`.`,
  },

  'testing/installStoreReset': {
    signature: `installStoreReset() => void (from '@pyreon/testing/store')`,
    example: `import { installStoreReset } from '@pyreon/testing/store'
installStoreReset() // top of the test file
test('a', () => { useCart().store.add(item) })
test('b', () => { /* fresh cart here */ })`,
    notes: `Registers \`afterEach(resetAllStores)\` for the current test file (or suite-wide from a vitest \`setupFiles\` module): every \`defineStore\` singleton is DISPOSED (effectScope stopped, plugin cleanups run) + dropped between tests, so neither state NOR setup-scope effects leak across tests. Composes \`@pyreon/store\`'s own \`resetAllStores\` (which disposes since the same PR that shipped this helper). Import from \`@pyreon/testing/store\` (optional peers \`@pyreon/store\` + \`vitest\`). See also: withFreshStore.`,
    mistakes: `- Calling it INSIDE a \`test()\` — \`afterEach\` must be registered at file/describe scope (vitest collection phase), not during a test run.
- Expecting references captured in test A to work in test B — the reset DISPOSES the old instance; re-call \`useStore()\` per test (it rebuilds from setup).
- Using it for per-component state — \`defineStore\` is app-global by design; per-tree state should be \`signal()\` + context, which needs no reset.`,
  },

  'testing/withFreshStore': {
    signature: `withFreshStore<TStore extends { id: string }, TReturn>(useStore: () => TStore, fn: (store: TStore) => TReturn) => TReturn (from '@pyreon/testing/store')`,
    example: `await withFreshStore(useCart, async (cart) => {
  cart.store.items.set([item])
  expect(cart.state.items).toHaveLength(1)
}) // cart disposed — next useCart() rebuilds`,
    notes: `Scoped isolation for ONE store: disposes any pre-existing instance with the same id, hands \`fn\` a GUARANTEED-FRESH instance, and disposes it afterwards — even when \`fn\` throws, and (async-aware) after a returned promise settles. Other stores are untouched (unlike \`resetAllStores\`). Returns \`fn\`'s result. See also: installStoreReset.`,
    mistakes: `- Holding the \`store\` reference after the callback — it is DISPOSED on exit; a later \`useStore()\` returns a NEW instance.
- Forgetting to await the async form — disposal is chained onto the promise; an un-awaited call can leak the fresh instance into the next assertion.
- Assuming other stores are reset too — only the one id is touched; use \`installStoreReset()\` / \`resetAllStores()\` for registry-wide isolation.`,
  },

  'testing/renderWithI18n': {
    signature: `renderWithI18n(ui: VNodeChild, options: { locale?; messages?; fallbackLocale?; i18n?: I18nInstance; wrapper?; container?; baseElement? }) => RenderResult & { i18n: I18nInstance; t: I18nInstance['t']; setLocale(locale): void } (from '@pyreon/testing/i18n')`,
    example: `const { getByText, setLocale, t } = renderWithI18n(<Nav />, {
  locale: 'en',
  messages: { en: { home: 'Home' }, cs: { home: 'Domů' } },
})
setLocale('cs')
getByText(t('home')) // 'Domů'`,
    notes: 'Render `ui` under `<I18nProvider>` — pass `locale` + `messages` (any `createI18n` option flows through) or a pre-built `i18n` instance. Returns the instance, a bound `t()` for assertions, and `setLocale()` — locale flips are reactive (translated text patches in place, no remount). Import from `@pyreon/testing/i18n` (optional peer `@pyreon/i18n`). See also: render.',
    mistakes: `- Passing neither \`locale\` nor \`i18n\` — throws an actionable error; the provider needs an instance.
- Async \`loader\`-based namespaces — \`renderWithI18n\` does not await \`loadNamespace\`; \`await i18n.loadNamespace(...)\` yourself (or use static \`messages\`, the test-friendly path).
- Asserting via a stale string after \`setLocale\` — assert through the bound \`t()\` (it reads the CURRENT locale) or re-query the DOM.`,
  },

  'testing/expectToast': {
    signature: `expectToast(match?: string | RegExp, options?: { type?: ToastType; includeExiting?: boolean }) => Toast — plus findToast(match?, options?) => Promise<Toast>, getToasts(options?) => Toast[], clearToasts() => void (from '@pyreon/testing/toast')`,
    example: `saveProfile() // raises toast.success('Profile saved')
expectToast(/saved/i, { type: 'success' })
await findToast(/synced/)   // async producer
afterEach(clearToasts)`,
    notes: 'Toast assertions against the STORE (`toast()` works headless, so these work with OR without a mounted `<Toaster>` — no portal traversal). `expectToast` asserts a matching toast exists NOW (substring or RegExp against string `message`/`description`, optional `type` filter; soft-dismissed `exiting` toasts excluded unless `includeExiting`) and returns it; failure lists the current toasts. `findToast` is the `waitFor`-wrapped async form for toasts raised by async flows. `clearToasts()` hard-resets the store incl. auto-dismiss timers — call it in `afterEach`. See also: render.',
    mistakes: `- Forgetting \`clearToasts()\` between tests — the store is module-level; leftover toasts + auto-dismiss timers bleed across tests.
- String/RegExp matching a VNODE message — only STRING \`message\`/\`description\` are matched (VNodes are labelled \`<VNode message>\` in the failure listing); assert VNode toasts via DOM queries (\`screen.getByText\` — the Toaster host is in \`document.body\`, which \`render()\`-bound queries cover).
- Using \`expectToast\` for a toast raised asynchronously — it asserts NOW; use \`await findToast(...)\`.
- A soft-dismissed toast 'still existing' — \`toast.dismiss()\` flips it to \`exiting\` (still in the store for the leave animation); matchers exclude it by default, \`{ includeExiting: true }\` opts in.`,
  },

  'testing/renderWithQueryClient': {
    signature: `renderWithQueryClient(ui: VNodeChild, options?: { client?: QueryClient; wrapper?; container?; baseElement? }) => RenderResult & { client: QueryClient; setQueryData: QueryClient['setQueryData'] } — plus createTestQueryClient(config?) => QueryClient (from '@pyreon/testing/query')`,
    example: `const { setQueryData, findByText } = renderWithQueryClient(<Todos />)
setQueryData(['todos'], [{ id: 1, title: 'write tests' }])
await findByText('write tests')`,
    notes: 'Render `ui` under `<QueryClientProvider>` with a FRESH ISOLATED test client per call (the TanStack testing convention): `retry: false` for queries AND mutations (failures fail NOW instead of retry-looping past the test timeout) + `gcTime: Infinity` (no GC timers keeping the process alive). `setQueryData` is a bound passthrough for seeding/patching cache state. `createTestQueryClient(config)` builds the same client standalone — your `defaultOptions` merge OVER the test defaults. Import from `@pyreon/testing/query` (optional peer `@pyreon/query`). See also: render.',
    mistakes: `- Sharing one client across tests — cache state (and error state) bleeds; take the default fresh-client path, or create per test.
- Expecting retries — the test client sets \`retry: false\`; a test that EXERCISES retry behavior must override \`defaultOptions.queries.retry\` explicitly.
- Seeding AFTER the component mounted with \`staleTime: 0\` and asserting no refetch — \`setQueryData\` marks data fresh at write time, but an already-mounted observer may have a fetch in flight; seed BEFORE render (create the client via \`createTestQueryClient\`, seed, pass as \`client\`) for deterministic first paint.`,
  },
  // <gen-docs:api-reference:end @pyreon/testing>
}

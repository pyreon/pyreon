import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/rx',
  title: 'Reactive Transforms',
  tagline:
    'Signal-aware reactive transforms — filter, map, flatMap, sortBy, groupBy, countBy, pipe, debounce, throttle, 42 functions',
  description:
    'Signal-aware reactive data transforms for Pyreon. Every collection/aggregation function is overloaded: pass a `Signal<T[]>` and get a `Computed<T[]>` that auto-tracks and re-derives when the source changes; pass a plain `T[]` and get a static result. Signal detection is purely `typeof source === "function"` — any function is treated as a reactive source and called inside a computed; a resolved value (already-called signal) takes the static path and never updates. 42 functions across collections (filter, map, flatMap, sortBy — with an asc/desc direction param —, groupBy, countBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample, intersection, difference, union — the set ops are signal-aware on BOTH inputs), aggregation (count, sum, min, max, average, reduce, every, some), operators (distinct, scan, combine, zip, merge), timing (debounce, throttle), and search. `pipe(source, ...ops)` collapses a chain into ONE computed (vs N computeds for N separate calls). Also exported as a namespaced `rx` object for dot-notation usage.',
  category: 'universal',
  longExample: `import { signal, effect } from '@pyreon/reactivity'
import { rx, pipe, filter, sortBy, map, flatMap, groupBy, countBy, take, sum, debounce, search } from '@pyreon/rx'

interface User {
  name: string
  age: number
  department: string
  tags: string[]
  active: boolean
}

const users = signal<User[]>([
  { name: 'Alice', age: 30, department: 'eng', tags: ['ts', 'rust'], active: true },
  { name: 'Bob', age: 25, department: 'eng', tags: ['go'], active: false },
  { name: 'Charlie', age: 35, department: 'design', tags: ['css'], active: true },
])

// Signal input → Computed output (auto-tracks):
const activeUsers = rx.filter(users, u => u.active)     // Computed<User[]>
const sorted = rx.sortBy(activeUsers, 'name')            // Computed<User[]>
const top5 = rx.take(sorted, 5)                          // Computed<User[]>

// Aggregation:
const totalAge = rx.sum(users, u => u.age)               // Computed<number>
const headcount = rx.count(activeUsers)                  // Computed<number>

// Grouping and counting:
const byDept = rx.groupBy(users, u => u.department)      // Computed<Record<string, User[]>>
const perDept = rx.countBy(users, u => u.department)     // Computed<Record<string, number>>
const allTags = rx.flatMap(users, u => u.tags)           // Computed<string[]> (map + flatten)

// Pipe — thread the value through plain transform functions, left-to-right.
// Each fn receives the resolved value; the rx helpers are 2-arg (source, ...),
// so wrap them: us => filter(us, pred). There is NO curried filter(pred) form.
// The whole chain is ONE computed — one recompute per source change, not N.
const result = pipe(
  users,
  us => filter(us, u => u.active),
  us => sortBy(us, 'name'),
  us => map(us, u => u.name),
)  // Computed<string[]> → ["Alice", "Charlie"]

// Search — case-insensitive substring match across STRING fields.
// 3rd arg is a positional keys array, NOT a { keys } options object.
const query = signal('')
const matches = search(users, query, ['name', 'department'])

// Timing — debounce/throttle a SIGNAL value (returns ReadableSignal + dispose;
// value-level, not collection operators). Auto-torn-down inside a component /
// effectScope; call dispose() for standalone usage:
const debounced = debounce(query, 300)     // ReadableSignal<string> & { dispose }
const throttled = rx.throttle(query, 100)  // ReadableSignal<string> & { dispose }
effect(() => matches())

// Plain input → plain output (no signals):
const staticResult = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5]`,
  features: [
    'Every function overloaded: Signal<T[]> → Computed, T[] → plain',
    '42 functions across 6 categories: collections (26 — incl. intersection/difference/union set ops, signal-aware on both inputs), aggregation (8), operators (5), timing (2), search (1), pipe (1)',
    'pipe(source, ...fns) collapses a chain into ONE computed — one recompute per source change vs N for N separate calls',
    'Namespaced rx object for dot-notation usage (rx.filter, rx.map, etc.)',
    'Individual named exports for tree-shaking',
    'Timing operators debounce/throttle: auto-torn-down inside a component scope, .dispose() for standalone',
    'search() — case-insensitive substring match across named string fields (positional keys arg)',
  ],
  api: [
    {
      name: 'rx',
      kind: 'constant',
      signature: 'Readonly<{ filter, map, flatMap, sortBy, groupBy, countBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample, count, sum, min, max, average, reduce, every, some, distinct, scan, combine, zip, merge, debounce, throttle, search, pipe }>',
      summary:
        'Namespaced object exposing all 42 reactive transform functions plus `pipe`. Use `rx.filter(...)` for dot-notation style, or destructure individual functions for tree-shaking. Every function is overloaded: `Signal<T[]>` input produces `Computed<T[]>` that auto-tracks, plain `T[]` input produces a static result.',
      example: `const users = signal<{ name: string; age: number; department: string; active: boolean }[]>([])
const active = rx.filter(users, u => u.active)       // Computed<User[]>
const sorted = rx.sortBy(active, 'name')             // Computed<User[]>
const total = rx.sum(users, u => u.age)              // Computed<number>
const grouped = rx.groupBy(users, u => u.department) // Computed<Record<string, User[]>>`,
      mistakes: [
        'Expecting `rx.filter(signal, pred)` to return a plain array — signal inputs always produce `Computed` outputs. Call the result to read: `active()`',
        'Passing a RESOLVED value where a signal was meant — `rx.filter(items(), pred)` (note the `()`) takes the static path and never updates when `items` changes. Pass `items` (the signal), not `items()`. A spike in the `rx.transform.raw` perf counter is exactly this mistake',
        'Assuming signal detection inspects the value — it is purely `typeof source === "function"`. Any function (an accessor wrapper `() => items()`, a bound method, a getter) is treated as a reactive source and invoked inside a computed; only non-function inputs (arrays) take the static path',
        'Reading a `Computed` output once and caching the array — it is reactive; re-read it (or read inside an `effect`/JSX) so you see updates',
      ],
      seeAlso: ['pipe', 'filter', 'sortBy', 'groupBy'],
    },
    {
      name: 'pipe',
      kind: 'function',
      signature: '<A, B>(source: ReadableSignal<A> | A, ...fns: Array<(value: any) => any>) => Computed<B> | B',
      summary:
        'Thread a value through plain transform functions left-to-right, collapsing the whole chain into ONE computed. Each function receives the resolved output of the previous step. A signal source produces a reactive `Computed` that re-derives on source change — ONE recompute regardless of chain depth, versus N recomputes / N nodes for N separate `filter()`→`sortBy()`→… calls. Typed for up to 7 transforms (an 8th+ falls back to `any`). The rx helpers are 2-arg `(source, …)`, so wrap them inside each transform — `v => filter(v, pred)`. There is NO curried 1-arg form (`filter(pred)` is not valid).',
      example: `const users = signal<{ name: string; active: boolean }[]>([])
const result = pipe(
  users,
  us => filter(us, u => u.active),
  us => sortBy(us, 'name'),
  us => map(us, u => u.name),
  us => take(us, 10),
)  // Computed<string[]> — ONE computed, one recompute per change`,
      mistakes: [
        'Expecting a curried operator form — there is NO 1-arg `filter(pred)` / `sortBy(key)` / `map(fn)`; every helper is 2-arg `(source, …)`. Wrap it in a transform: `pipe(users, us => filter(us, pred))`',
        'Expecting `pipe(arr, ...)` (plain array source) to be reactive — only a signal source produces a `Computed`; a plain array gives a one-shot plain result',
        'Reading the pipe result as an array when the source is a signal — it is a `Computed`; call it: `result()`',
        'Putting a timing operator (`debounce`/`throttle`) in a `pipe` chain — those take a single `Signal<T>` and return a signal, they are not curried collection operators and do not compose in `pipe`',
        'Chaining separate rx calls (`const a = filter(src,…); const b = sortBy(a,…)`) for a long pipeline — that builds N computed nodes with N recomputes per source change; `pipe` builds ONE. Prefer `pipe` for chains',
      ],
      seeAlso: ['rx', 'filter', 'map', 'sortBy'],
    },
    {
      name: 'filter',
      kind: 'function',
      signature:
        '<T>(source: Signal<T[]> | T[], predicate: (item: T, index: number) => boolean) => Computed<T[]> | T[]',
      summary:
        'Filter items by predicate. Signal input produces a reactive `Computed<T[]>` that re-evaluates when the source signal changes; plain array input returns a plain array. ALWAYS 2-arg `(source, predicate)` — there is no curried 1-arg form; inside `pipe()` wrap it as `arr => filter(arr, pred)`.',
      example: `const items = signal<number[]>([1, 2, 3, 4, 5])
const evens = filter(items, n => n % 2 === 0)  // Computed<number[]> (items is a signal)
const result = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5] (plain)
pipe(items, ns => filter(ns, n => n > 3))            // wrap the 2-arg call in a pipe transform`,
      mistakes: [
        'Calling `filter(pred)` with a single function arg — `filter` is 2-arg `(source, predicate)`; a lone function is treated as a reactive SOURCE (typeof === "function") and the missing predicate yields garbage. Always pass the source first',
        'Passing `items()` instead of `items` — the resolved array takes the static path; the result never updates',
      ],
      seeAlso: ['rx', 'pipe', 'map'],
    },
    {
      name: 'map',
      kind: 'function',
      signature:
        '<T, U>(source: Signal<T[]> | T[], fn: (item: T, index: number) => U) => Computed<U[]> | U[]',
      summary:
        'Transform each item. Signal input → reactive `Computed<U[]>`; plain array → plain array. The mapper receives `(item, index)`. ALWAYS 2-arg `(source, fn)` — no curried form; inside `pipe()` wrap it as `arr => map(arr, fn)`.',
      example: `const users = signal<{ name: string; active: boolean }[]>([])
const names = map(users, u => u.name)            // Computed<string[]>
pipe(users, us => filter(us, u => u.active), us => map(us, u => u.name)) // wrap each in a pipe transform`,
      mistakes: [
        'Expecting this to be the JSX list renderer — `rx.map` derives a reactive array; to render a keyed list use `<For each={…} by={…}>`, not `rx.map` output spread into JSX',
        'Relying on referential stability of mapped objects — every re-derive produces fresh objects; key lists by a stable id, not object identity',
      ],
      seeAlso: ['rx', 'filter', 'flatMap'],
    },
    {
      name: 'flatMap',
      kind: 'function',
      signature:
        '<T, U>(source: Signal<T[]> | T[], fn: (item: T, index: number) => U[]) => Computed<U[]> | U[]',
      summary:
        'Map each item to an ARRAY and flatten ONE level (exactly `Array.prototype.flatMap`). The mapper returns an array per item; results are concatenated. Signal input → reactive `Computed<U[]>`; plain array → plain array. Empty inner arrays drop out (a filter-and-map in one pass). Flattens exactly one level — nested arrays beyond that stay nested (use `flatten` again).',
      example: `const posts = signal<{ tags: string[] }[]>([])
const allTags = flatMap(posts, p => p.tags)         // Computed<string[]>
flatMap([1, 2, 3], n => [n, n * 10])                // [1, 10, 2, 20, 3, 30] (plain)
flatMap([1, 2, 3], n => n % 2 === 0 ? [n] : [])     // [2] — empty arrays drop out`,
      mistakes: [
        'Returning a scalar instead of an array from the mapper — `flatMap(xs, n => n * 2)` is wrong; the mapper must return an ARRAY (`n => [n * 2]`). A scalar breaks the flatten',
        'Expecting deep flattening — it flattens exactly ONE level, like `Array.prototype.flatMap`. Nested arrays beyond one level remain nested',
        'Reaching for `map(...)` then `flatten(...)` as two rx calls — that is two computed nodes; `flatMap` is one node doing both',
      ],
      seeAlso: ['map', 'flatten', 'rx'],
    },
    {
      name: 'sortBy',
      kind: 'function',
      signature:
        '<T>(source: Signal<T[]> | T[], key: keyof T | ((item: T) => unknown)) => Computed<T[]> | T[]',
      summary:
        'Sort by a key or key-selector. **Non-mutating** — copies via `[...arr]` before sorting, so the source array/signal is never mutated (unlike native `Array.prototype.sort`). Signal input → reactive `Computed<T[]>`. Comparison is a plain `a < b ? -1 : a > b ? 1 : 0` — ascending only, no direction option, no locale/`Intl` collation.',
      example: `const users = signal<{ name: string; age: number }[]>([])
const byName = sortBy(users, 'name')          // Computed<User[]>, ascending
const byAge = sortBy(users, u => u.age)        // key-selector form
const desc = pipe(users, us => sortBy(us, 'age'), us => us.slice().reverse()) // reverse for descending`,
      mistakes: [
        'Expecting it to mutate / sort in place like `Array.sort` — it returns a NEW sorted array; the source is untouched',
        'Expecting a direction option — there is none. Always ascending; compose `reverse()` for descending',
        'Sorting numeric STRINGS expecting numeric order — comparison is `<`/`>`, so `"10" < "2"` lexically. Use a numeric key-selector (`u => Number(u.id)`) when the field is a numeric string',
        'Expecting locale-aware ordering — no `Intl.Collator`; accented / non-ASCII ordering is codepoint order, not locale order',
      ],
      seeAlso: ['rx', 'pipe', 'groupBy'],
    },
    {
      name: 'groupBy',
      kind: 'function',
      signature:
        '<T>(source: Signal<T[]> | T[], key: keyof T | ((item: T) => unknown)) => Computed<Record<string, T[]>> | Record<string, T[]>',
      summary:
        'Group items into buckets by key. **Returns a plain `Record<string, T[]>`, NOT a `Map`.** Keys are coerced with `String(...)`, so numeric / boolean group keys become strings (`1` → `"1"`, `true` → `"true"`). Signal input → reactive `Computed<Record<string, T[]>>`. Insertion order within each bucket is preserved. For per-bucket COUNTS (not the members), use `countBy`.',
      example: `const users = signal<{ department: string }[]>([])
const byDept = groupBy(users, u => u.department) // Computed<Record<string, User[]>>
for (const [dept, members] of Object.entries(byDept())) { void dept; void members }`,
      mistakes: [
        'Treating the result as a `Map` — it is a plain object. Use `Object.entries()` / `result[key]`, not `.get()` / `.has()` / `.size`',
        'Expecting original key types — every key is `String()`-coerced; group under `"1"`, not `1`, and `"true"`, not `true`',
        'Iterating with `for...in` and not guarding inherited keys — prefer `Object.entries()` / `Object.keys()`',
        'Assuming a missing group is `[]` — `result[unknownKey]` is `undefined`, not an empty array; default it explicitly',
      ],
      seeAlso: ['rx', 'countBy', 'keyBy'],
    },
    {
      name: 'countBy',
      kind: 'function',
      signature:
        '<T>(source: Signal<T[]> | T[], key: keyof T | ((item: T) => unknown)) => Computed<Record<string, number>> | Record<string, number>',
      summary:
        'Count items per key bucket. Returns `Record<string, number>` (keys are `String()`-coerced, like `groupBy`). The counting companion to `groupBy` — equivalent to `mapValues(groupBy(src, key), g => g.length)` but single-pass. Signal input → reactive `Computed<Record<string, number>>`.',
      example: `const users = signal<{ role: string }[]>([])
const perRole = countBy(users, 'role')                       // Computed<Record<string, number>>
countBy([1, 2, 2, 3], n => n % 2 === 0 ? 'even' : 'odd')     // { odd: 2, even: 2 } (plain)`,
      mistakes: [
        'Expecting the bucket VALUES (the grouped items) — `countBy` returns COUNTS (numbers); use `groupBy` for the members',
        'Expecting original key types — like `groupBy`, every key is `String()`-coerced (`1` → `"1"`)',
        'Reaching for `groupBy` then `mapValues(g => g.length)` as two rx calls — `countBy` does it in one single-pass node',
      ],
      seeAlso: ['groupBy', 'keyBy', 'rx'],
    },
    {
      name: 'search',
      kind: 'function',
      signature:
        '<T>(source: Signal<T[]> | T[], query: Signal<string> | string, keys: (keyof T)[]) => Computed<T[]> | T[]',
      summary:
        'Case-insensitive **substring** filter across the named fields. The third argument is a POSITIONAL `keys` array — `search(users, q, ["name", "email"])` — NOT a `{ keys }` options object, and it is REQUIRED. Only `string`-typed fields match (non-string values are skipped). Reactive when EITHER `source` OR `query` is a signal. Empty/whitespace query returns the full list.',
      example: `const users = signal<{ name: string; email: string }[]>([])
const q = signal('')
const results = search(users, q, ['name', 'email'])  // Computed<User[]>
// substring, case-insensitive: q="ali" matches "Alice"`,
      mistakes: [
        'Passing `{ keys: [...] }` — the signature is positional: `search(source, query, ["name","email"])`. An options object is treated as the keys array and matches nothing',
        'Omitting the keys array — it is a required positional arg; there is no "search all fields" default. List the string fields to match',
        'Expecting fuzzy / typo-tolerant matching — it is plain `String.includes` after `toLowerCase().trim()`, not fuzzy. "alce" will NOT match "Alice"',
        'Searching a non-string field (number/date) — only `typeof val === "string"` fields are tested; numeric columns never match. Pre-stringify if you need them searchable',
      ],
      seeAlso: ['rx', 'filter'],
    },
    {
      name: 'debounce',
      kind: 'function',
      signature:
        '<T>(source: Signal<T>, ms: number) => ReadableSignal<T> & { dispose: () => void }',
      summary:
        'Debounce a SIGNAL value (the whole emitted value, not array items — it is not a collection transform and does not curry into `pipe`). Returns a new readable signal that settles `ms` after the source stops changing, plus an idempotent `dispose()`. **Lifecycle**: created inside a component / `effectScope`, the internal effect AND its pending timer are torn down automatically on unmount; created standalone (module scope, a `defineStore` setup), call `dispose()` yourself. Seeds synchronously with the current `source()` value.',
      example: `const raw = signal('')
const debounced = debounce(raw, 300)   // ReadableSignal<string> & { dispose }
effect(() => { void debounced() })     // fires 300ms after typing stops
// Inside a component this is auto-cleaned on unmount; standalone:
// onCleanup(() => debounced.dispose())`,
      mistakes: [
        'Assuming it leaks in a component — the internal effect + pending timer are torn down on unmount (it registers with the active scope). Only STANDALONE usage (module scope, store setup outside any scope) needs an explicit `dispose()`',
        'Putting it in a `pipe()` chain — `debounce` takes a single `Signal<T>` and returns a signal; it is not a curried collection operator',
        'Expecting array-item debounce — `debounce(usersSignal, 300)` debounces the whole array emission, not individual rows',
        'Reading it before the first settle and expecting the latest value — it seeds with the initial `source()` and only updates after the quiet window',
      ],
      seeAlso: ['throttle', 'rx'],
    },
    {
      name: 'throttle',
      kind: 'function',
      signature:
        '<T>(source: Signal<T>, ms: number) => ReadableSignal<T> & { dispose: () => void }',
      summary:
        'Throttle a SIGNAL value to at most one emission per `ms`. Returns a new readable signal + idempotent `dispose()`. Same lifecycle as `debounce` — auto-torn-down (effect + pending trailing timer) inside a component / `effectScope`, `dispose()` for standalone. Value-level not item-level, does not compose in `pipe`, and seeds synchronously with the current `source()`.',
      example: `const scrollY = signal(0)
const throttled = throttle(scrollY, 100)
effect(() => { void throttled() })
// Auto-cleaned in a component; standalone: onCleanup(() => throttled.dispose())`,
      mistakes: [
        'Assuming it leaks in a component — like `debounce`, the effect + trailing timer auto-tear-down on unmount; only standalone usage needs `dispose()`',
        'Confusing it with `debounce` — throttle emits at a steady max rate during continuous change; debounce emits once after change STOPS',
        'Using it as a `pipe` operator — it is not curried and takes a single signal',
      ],
      seeAlso: ['debounce', 'rx'],
    },
  ],
  gotchas: [
    {
      label: 'Signal detection',
      note: 'Detection is purely `typeof source === "function"` (see `isSignal` in `rx/src/types.ts`) — there is NO `.subscribe` / value inspection. Any function (the signal, an accessor wrapper `() => items()`, a bound method) is treated as reactive and called inside a computed. The actual mistake is the opposite of what you might expect: passing a RESOLVED value (`items()`, an already-read array) takes the static path and never updates. Pass the signal, not its resolved value.',
    },
    {
      label: 'pipe collapses N computeds into ONE',
      note: '`pipe(source, ...fns)` builds a SINGLE computed that runs the whole chain — one recompute per source change, ~1 computed node retained (~913 B). Chaining N separate rx calls (`const a = filter(src,…); const b = sortBy(a,…); …`) builds N computed nodes: N intermediate subscriptions, N dirty-propagation hops per change, ~N×913 B. For any chain longer than 2 steps, prefer `pipe`. (Reproduce the exact node/recompute counts with `bun run --filter=@pyreon/rx bench`.)',
    },
    {
      label: 'Timing operators are scope-aware',
      note: '`debounce`/`throttle`/`distinct`/`scan` create an eager `effect()`. Created inside a component or `effectScope`, that effect (and any pending timer for debounce/throttle) is torn down automatically on unmount. Created STANDALONE (module scope, a `defineStore` setup that outlives every scope), nothing owns it — call the returned `.dispose()`. All four expose an idempotent `.dispose()`. A growing `rx.debounce.create` / `rx.throttle.create` perf counter in dev flags standalone instances created without a matching dispose.',
    },
    {
      label: 'Computed lifecycle',
      note: 'Computed outputs from signal inputs auto-dispose when they have no subscribers. In component bodies, the reactive scope from JSX keeps them alive; in standalone code, subscribe or read within an `effect()` to keep them active.',
    },
    {
      label: 'No curried operators — pipe takes plain transforms',
      note: 'rx functions are NOT curried — every collection/aggregation helper is `(source, …args)` only. `pipe(source, ...fns)` threads the value through plain `(value) => value` functions, so to use a helper inside a pipe you wrap it: `pipe(users, us => filter(us, pred), us => map(us, fn))`. A lone `filter(pred)` is not a valid call.',
    },
    {
      label: 'Tree-shaking',
      note: 'The `rx` namespace object is a `const` — bundlers can tree-shake unused properties. For maximum control, import individual functions: `import { filter, map } from "@pyreon/rx"`.',
    },
  ],
})

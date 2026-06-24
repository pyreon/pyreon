import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/rx',
  title: 'Reactive Transforms',
  tagline:
    'Signal-aware reactive transforms — filter, map, sortBy, groupBy, pipe, debounce, throttle, 37 functions',
  description:
    'Signal-aware reactive data transforms for Pyreon. Every collection/aggregation function is overloaded: pass a `Signal<T[]>` and get a `Computed<T[]>` that auto-tracks and re-derives when the source changes; pass a plain `T[]` and get a static result. Signal detection is purely `typeof source === "function"` — any function is treated as a reactive source and called inside a computed; a resolved value (already-called signal) takes the static path and never updates. 37 functions across collections (filter, map, sortBy, groupBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample), aggregation (count, sum, min, max, average, reduce, every, some), operators (distinct, scan, combine, zip, merge), timing (debounce, throttle), and search. `pipe(source, ...ops)` composes transforms left-to-right. Also exported as a namespaced `rx` object for dot-notation usage.',
  category: 'universal',
  longExample: `import { signal } from '@pyreon/reactivity'
import { rx, pipe, filter, sortBy, map, groupBy, take, sum, debounce, search } from '@pyreon/rx'

interface User {
  name: string
  age: number
  department: string
  active: boolean
}

const users = signal<User[]>([
  { name: 'Alice', age: 30, department: 'eng', active: true },
  { name: 'Bob', age: 25, department: 'eng', active: false },
  { name: 'Charlie', age: 35, department: 'design', active: true },
])

// Signal input → Computed output (auto-tracks):
const activeUsers = rx.filter(users, u => u.active)     // Computed<User[]>
const sorted = rx.sortBy(activeUsers, 'name')            // Computed<User[]>
const top5 = rx.take(sorted, 5)                          // Computed<User[]>

// Aggregation:
const totalAge = rx.sum(users, u => u.age)               // Computed<number>
const count = rx.count(activeUsers)                       // Computed<number>

// Grouping:
const byDept = rx.groupBy(users, u => u.department)      // Computed<Record<string, User[]>>

// Pipe — thread the value through plain transform functions, left-to-right.
// Each fn receives the resolved value; the rx helpers are 2-arg (source, ...),
// so wrap them: us => filter(us, pred). There is NO curried filter(pred) form.
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

// Timing — debounce/throttle a SIGNAL value (returns ReadableSignal +
// dispose; value-level, not collection operators; NOT auto-cleaned):
const debounced = debounce(users, 300)    // ReadableSignal<User[]> & { dispose }
const throttled = rx.throttle(users, 100) // ReadableSignal<User[]> & { dispose }

// Plain input → plain output (no signals):
const staticResult = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5]`,
  features: [
    'Every function overloaded: Signal<T[]> → Computed, T[] → plain',
    '37 functions across 6 categories: collections (21), aggregation (8), operators (5), timing (2), search (1), pipe (1)',
    'pipe(source, ...fns) threads the value through plain (value)=>value transforms left-to-right (NOT curried operators)',
    'Namespaced rx object for dot-notation usage (rx.filter, rx.map, etc.)',
    'Individual named exports for tree-shaking',
    'Timing operators: debounce and throttle for signal emissions',
    'search() — case-insensitive substring match across named string fields (positional keys arg)',
  ],
  api: [
    {
      name: 'rx',
      kind: 'constant',
      signature: 'Readonly<{ filter, map, sortBy, groupBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample, count, sum, min, max, average, reduce, every, some, distinct, scan, combine, zip, merge, debounce, throttle, search, pipe }>',
      summary:
        'Namespaced object exposing all 37 reactive transform functions plus `pipe`. Use `rx.filter(...)` for dot-notation style, or destructure individual functions for tree-shaking. Every function is overloaded: `Signal<T[]>` input produces `Computed<T[]>` that auto-tracks, plain `T[]` input produces a static result.',
      example: `const active = rx.filter(users, u => u.active)      // Computed<User[]>
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
        'Thread a value through plain transform functions left-to-right. Each function receives the resolved output of the previous step and returns the next value. A signal source produces a reactive `Computed` that re-derives when the source changes; a plain value gives a one-shot result. The rx helpers are 2-arg `(source, …)`, so wrap them inside each transform — `v => filter(v, pred)`. There is NO curried 1-arg form (`filter(pred)` is not valid).',
      example: `const result = pipe(
  users,
  us => filter(us, u => u.active),
  us => sortBy(us, 'name'),
  us => map(us, u => u.name),
  us => take(us, 10),
)
// Computed<string[]> when users is a signal`,
      mistakes: [
        'Expecting a curried operator form — there is NO 1-arg `filter(pred)` / `sortBy(key)` / `map(fn)`; every helper is 2-arg `(source, …)`. Wrap it in a transform: `pipe(users, us => filter(us, pred))`',
        'Expecting `pipe(arr, ...)` (plain array source) to be reactive — only a signal source produces a `Computed`; a plain array gives a one-shot plain result',
        'Reading the pipe result as an array when the source is a signal — it is a `Computed`; call it: `result()`',
        'Putting a timing operator (`debounce`/`throttle`) in a `pipe` chain — those take a single `Signal<T>` and return a signal, they are not curried collection operators and do not compose in `pipe`',
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
      example: `const evens = filter(items, n => n % 2 === 0)  // Computed<number[]> (items is a signal)
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
      example: `const names = map(users, u => u.name)            // Computed<string[]>
pipe(users, us => filter(us, u => u.active), us => map(us, u => u.name)) // wrap each in a pipe transform`,
      mistakes: [
        'Expecting this to be the JSX list renderer — `rx.map` derives a reactive array; to render a keyed list use `<For each={…} by={…}>`, not `rx.map` output spread into JSX',
        'Relying on referential stability of mapped objects — every re-derive produces fresh objects; key lists by a stable id, not object identity',
      ],
      seeAlso: ['rx', 'filter', 'pipe'],
    },
    {
      name: 'sortBy',
      kind: 'function',
      signature:
        '<T>(source: Signal<T[]> | T[], key: keyof T | ((item: T) => unknown)) => Computed<T[]> | T[]',
      summary:
        'Sort by a key or key-selector. **Non-mutating** — copies via `[...arr]` before sorting, so the source array/signal is never mutated (unlike native `Array.prototype.sort`). Signal input → reactive `Computed<T[]>`. Comparison is a plain `a < b ? -1 : a > b ? 1 : 0` — ascending only, no direction option, no locale/`Intl` collation.',
      example: `const byName = sortBy(users, 'name')          // Computed<User[]>, ascending
const byAge = sortBy(users, u => u.age)        // key-selector form
const desc = sortBy(users, 'age')              // then reverse() for descending`,
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
        'Group items into buckets by key. **Returns a plain `Record<string, T[]>`, NOT a `Map`.** Keys are coerced with `String(...)`, so numeric / boolean group keys become strings (`1` → `"1"`, `true` → `"true"`). Signal input → reactive `Computed<Record<string, T[]>>`. Insertion order within each bucket is preserved.',
      example: `const byDept = groupBy(users, u => u.department) // Computed<Record<string, User[]>>
for (const [dept, members] of Object.entries(byDept())) { … }`,
      mistakes: [
        'Treating the result as a `Map` — it is a plain object. Use `Object.entries()` / `result[key]`, not `.get()` / `.has()` / `.size`',
        'Expecting original key types — every key is `String()`-coerced; group under `"1"`, not `1`, and `"true"`, not `true`',
        'Iterating with `for...in` and not guarding inherited keys — prefer `Object.entries()` / `Object.keys()`',
        'Assuming a missing group is `[]` — `result[unknownKey]` is `undefined`, not an empty array; default it explicitly',
      ],
      seeAlso: ['rx', 'sortBy', 'keyBy'],
    },
    {
      name: 'search',
      kind: 'function',
      signature:
        '<T>(source: Signal<T[]> | T[], query: Signal<string> | string, keys: (keyof T)[]) => Computed<T[]> | T[]',
      summary:
        'Case-insensitive **substring** filter across the named fields. The third argument is a POSITIONAL `keys` array — `search(users, q, ["name", "email"])` — NOT a `{ keys }` options object. Only `string`-typed fields match (non-string values are skipped). Reactive when EITHER `source` OR `query` is a signal. Empty/whitespace query returns the full list.',
      example: `const q = signal('')
const results = search(users, q, ['name', 'email'])  // Computed<User[]>
// substring, case-insensitive: q="ali" matches "Alice"`,
      mistakes: [
        'Passing `{ keys: [...] }` — the signature is positional: `search(source, query, ["name","email"])`. An options object is treated as the keys array and matches nothing',
        'Expecting fuzzy / typo-tolerant matching — it is plain `String.includes` after `toLowerCase().trim()`, not fuzzy. "alce" will NOT match "Alice"',
        'Searching a non-string field (number/date) — only `typeof val === "string"` fields are tested; numeric columns never match. Pre-stringify if you need them searchable',
        'Passing `query` as a resolved string when you want reactivity — pass the `Signal<string>` so the result re-derives as the user types; a plain string is matched once',
      ],
      seeAlso: ['rx', 'filter'],
    },
    {
      name: 'debounce',
      kind: 'function',
      signature:
        '<T>(source: Signal<T>, ms: number) => ReadableSignal<T> & { dispose: () => void }',
      summary:
        'Debounce a SIGNAL value (the whole emitted value, not array items — it is not a collection transform and does not curry into `pipe`). Returns a new readable signal that settles `ms` after the source stops changing, plus a `dispose()` that tears down its internal effect + timer. Seeds synchronously with the current `source()` value.',
      example: `const raw = signal('')
const debounced = debounce(raw, 300)   // ReadableSignal<string> & { dispose }
effect(() => fetchResults(debounced())) // fires 300ms after typing stops
onCleanup(() => debounced.dispose())    // REQUIRED — not auto-cleaned`,
      mistakes: [
        'Not calling `dispose()` — each `debounce`/`throttle` owns a live effect + timer that are NOT auto-cleaned. Leaks across navigations; a growing `rx.debounce.create` perf counter is exactly this',
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
        'Throttle a SIGNAL value to at most one emission per `ms`. Returns a new readable signal + `dispose()` (internal effect + timer). Like `debounce`, value-level not item-level, does not compose in `pipe`, and seeds synchronously with the current `source()`.',
      example: `const throttled = throttle(scrollY, 100)
effect(() => updateHeader(throttled()))
onCleanup(() => throttled.dispose())   // REQUIRED — not auto-cleaned`,
      mistakes: [
        'Not calling `dispose()` — same leak as `debounce`; tracked by the `rx.throttle.create` perf counter',
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

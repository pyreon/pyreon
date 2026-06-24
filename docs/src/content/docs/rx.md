---
title: Rx
description: Signal-aware reactive transforms for Pyreon — filter, map, sortBy, groupBy, pipe, debounce, throttle
---

`@pyreon/rx` is a library of **signal-aware reactive data transforms**. Every collection and aggregation function is overloaded: pass a `Signal<T[]>` and you get back a `Computed` that auto-tracks and re-derives whenever the source changes; pass a plain `T[]` and you get a one-shot static result. The same `filter` / `map` / `sortBy` / `groupBy` you reach for on arrays, but they participate in Pyreon's reactivity graph for free.

<PackageBadge name="@pyreon/rx" href="/docs/rx" />

It is **not** a lodash / `es-toolkit` replacement. It is a *reactive operator* library — its value is that a derived view stays in sync with its source signal with zero plumbing. For pure, one-off array utilities on plain data, keep using `es-toolkit`.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/rx
```

```bash [bun]
bun add @pyreon/rx
```

```bash [pnpm]
pnpm add @pyreon/rx
```

```bash [yarn]
yarn add @pyreon/rx
```

:::

Peer dependency: `@pyreon/reactivity`.

## Quick Start

```tsx
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

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

// Signal in → Computed out (auto-reactive)
const active = rx.filter(users, (u) => u.active) // Computed<User[]>
const sorted = rx.sortBy(active, 'name') // Computed<User[]>
const top10 = rx.take(sorted, 10) // Computed<User[]>

// top10() re-derives automatically whenever `users` changes
top10() // [{ name: 'Alice', ... }, { name: 'Charlie', ... }]
```

<Example file="./examples/rx/rx-composable-reactive-pipeline" title="rx — composable reactive pipeline" />

## Why Rx?

Without `@pyreon/rx`, deriving a filtered-and-sorted view of a signal means hand-writing a `computed` and remembering to call the source inside it:

```tsx
// Manual — you write the computed, you call the source, you chain by hand
const view = computed(() => {
  const arr = users()
  return arr
    .filter((u) => u.active)
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .slice(0, 10)
})
```

With `@pyreon/rx` the wiring is the function. Each transform detects the signal, allocates the tracked `computed`, and reads the source for you:

```tsx
// Reactive — the function IS the wiring
const view = rx.take(rx.sortBy(rx.filter(users, (u) => u.active), 'name'), 10)
```

Or, flattened with `pipe` into **one** computed (not three — see [`pipe`](#pipe)):

```tsx
const view = pipe(
  users,
  (u) => u.filter((x) => x.active),
  (u) => [...u].sort((a, b) => (a.name < b.name ? -1 : 1)),
  (u) => u.slice(0, 10),
)
```

## Signal Overloading

Every collection/aggregation function inspects its `source` argument and branches:

- **`source` is callable** (a signal, computed, or any function) → it allocates a `computed`, calls the source *inside* it, and returns the `Computed`. The result auto-tracks and re-derives on every source change.
- **`source` is a value** (a plain array) → it runs once and returns the plain result. No signals involved.

```tsx
// Reactive — returns Computed<User[]>
const a = rx.filter(usersSignal, (u) => u.active)
a() // auto-tracks; re-derives when usersSignal changes

// Static — returns User[]
const b = rx.filter([{ active: true }], (u) => u.active)
// just a plain filtered array, nothing reactive
```

:::warning Signal detection is `typeof source === "function"` — pass the signal, not its value
Detection is purely `typeof source === "function"` — there is no `.subscribe` check or value inspection. The common mistake is the **opposite** of what you'd expect: passing a **resolved value** silently takes the static path and the result never updates.

```tsx
const view = rx.filter(users(), (u) => u.active) // ⚠️ users() — STATIC, never re-derives
const view = rx.filter(users, (u) => u.active) //   users   — reactive Computed ✅
```

In dev mode a spike in the `rx.transform.raw` perf counter is exactly this mistake (the signal path increments `rx.transform.signal` instead).
:::

:::tip Computed lifecycle
A `Computed` output auto-disposes when it has no subscribers. Inside a component body the JSX reactive scope keeps it alive; in standalone code, read it inside an `effect()` (or subscribe) so it stays active and re-derives.
:::

## Two import styles

`@pyreon/rx` ships both a namespaced `rx` object (dot-notation) and individual named exports (tree-shakeable). They are identical functions.

```tsx
import { rx } from '@pyreon/rx'
const a = rx.filter(users, (u) => u.active)
```

```tsx
import { filter, sortBy, take } from '@pyreon/rx'
const a = filter(users, (u) => u.active)
```

:::tip Tree-shaking
The `rx` namespace is a `const` object — modern bundlers tree-shake unused properties from it. For maximum control (and to make the dependency surface explicit), import the individual functions you use.
:::

## Collections

The 21 collection transforms. Each is overloaded `Signal<T[]> → Computed` / `T[] → plain`. The reactive return type is noted per function.

### `filter`

Keep items matching a predicate. The predicate receives `(item, index)`.

```tsx
const active = rx.filter(users, (u) => u.active) // Computed<User[]>
const big = rx.filter([1, 2, 3, 4, 5], (n) => n > 3) // [4, 5] (plain)
```

### `map`

Transform each item to a new value. The mapper receives `(item, index)`.

```tsx
const names = rx.map(users, (u) => u.name) // Computed<string[]>
```

:::warning `rx.map` is a data transform, not a JSX list renderer
`rx.map` derives a reactive array — it is not the keyed-list primitive. To render a list, feed its output to `<For each={...} by={...}>`; spreading a freshly-mapped array straight into JSX loses keying and referential stability (every re-derive yields fresh objects).
:::

### `sortBy`

Sort by a key name **or a key-selector function** — `KeyOf<T> = keyof T | ((item: T) => string | number)`. It is **non-mutating** (copies via `[...arr]`), **ascending only**, and uses a plain `a < b ? -1 : a > b ? 1 : 0` comparison.

```tsx
const byName = rx.sortBy(users, 'name') // by key name
const byAge = rx.sortBy(users, (u) => u.age) // by key-selector
```

:::warning `sortBy` takes a key / key-selector — NOT a comparator
The argument is a key name or a `(item) => value` selector, **not** an `(a, b) => number` comparator like `Array.sort`. There is no direction option (always ascending — compose [`reverse`](#reverse) for descending), no `Intl` collation (codepoint order for non-ASCII), and numeric *strings* sort lexically (`"10" < "2"`) — use a numeric selector (`(u) => Number(u.id)`) for those. Unlike native `Array.sort`, it never mutates the source.
:::

### `groupBy`

Group items into buckets by a key / key-selector. **Returns a plain `Record<string, T[]>`, not a `Map`.** Keys are `String(...)`-coerced; insertion order within each bucket is preserved.

```tsx
const byDept = rx.groupBy(users, (u) => u.department) // Computed<Record<string, User[]>>
for (const [dept, members] of Object.entries(byDept())) {
  /* ... */
}
```

:::warning `groupBy` returns a `Record`, not a `Map` — and keys are stringified
Use `Object.entries()` / `result[key]`, never `.get()` / `.has()` / `.size`. Every key is `String()`-coerced, so a numeric group key `1` becomes `"1"` and `true` becomes `"true"`. A missing bucket is `undefined`, not `[]` — default it explicitly.
:::

### `keyBy`

Index items into a `Record<string, T>` by a key / key-selector. **Last write wins** on a key collision.

```tsx
const byId = rx.keyBy(users, 'id') // Computed<Record<string, User>>
byId()['42'] // the user with id 42
```

### `uniqBy`

Deduplicate by a key / key-selector — keeps the first occurrence of each key. For primitive values without a key, use [`unique`](#unique).

```tsx
const oneEach = rx.uniqBy(users, 'email') // Computed<User[]>
```

### `unique`

Deduplicate primitive values via a `Set` (keeps first occurrence). For objects, use [`uniqBy`](#uniqby) with a key.

```tsx
rx.unique([1, 2, 2, 3, 1]) // [1, 2, 3]
const distinctIds = rx.unique(idsSignal) // Computed<number[]>
```

### `take` / `skip` / `last`

Slice from the front, drop from the front, or take from the end.

```tsx
const first5 = rx.take(users, 5) // Computed<User[]> — items 0..4
const rest = rx.skip(users, 5) // Computed<User[]> — items 5..end
const last3 = rx.last(users, 3) // Computed<User[]> — last 3 items
```

### `first`

The first element (or `undefined` if empty).

```tsx
const head = rx.first(items) // Computed<T | undefined>
```

### `chunk`

Split into fixed-size chunks. The final chunk holds the remainder.

```tsx
const pages = rx.chunk(users, 10) // Computed<User[][]>
// [[...10], [...10], [...rest]]
```

### `flatten`

Flatten **one** level of nesting (`Array.prototype.flat()`).

```tsx
const flat = rx.flatten(nestedSignal) // Signal<T[][]> → Computed<T[]>
```

### `find`

The first item matching a predicate (or `undefined`).

```tsx
const admin = rx.find(users, (u) => u.role === 'admin') // Computed<User | undefined>
```

### `compact`

Drop all falsy values (`null`, `undefined`, `false`, `0`, `''`, `NaN`).

```tsx
rx.compact([0, 1, null, 2, '', 3, false]) // [1, 2, 3]
```

### `reverse`

Reverse the order — **non-mutating** (returns a new copy, unlike `Array.prototype.reverse`).

```tsx
rx.reverse([1, 2, 3]) // [3, 2, 1]
const descByAge = rx.reverse(rx.sortBy(users, (u) => u.age)) // sortBy is ascending; reverse → descending
```

### `partition`

Split into a `[pass, fail]` tuple by a predicate. The predicate receives `(item, index)`.

```tsx
const [even, odd] = rx.partition([1, 2, 3, 4], (n) => n % 2 === 0)
// even: [2, 4], odd: [1, 3]
// Signal input → Computed<[T[], T[]]>
```

### `takeWhile` / `dropWhile`

Take from the start **while** the predicate holds (stops at the first failing item); or drop the leading run that matches and return the rest. Predicate receives `(item, index)`.

```tsx
rx.takeWhile([1, 2, 3, 1, 2], (n) => n < 3) // [1, 2]  — stops at the first 3
rx.dropWhile([1, 2, 3, 1, 2], (n) => n < 3) // [3, 1, 2] — drops leading 1,2
```

### `sample`

Pick `n` random items via a Fisher-Yates partial shuffle. Returns all items if `n >= length`.

```tsx
rx.sample([1, 2, 3, 4, 5], 2) // e.g. [3, 1]
```

:::note `sample` is non-deterministic
It uses `Math.random()`, so a reactive `sample` re-derives to a *new* random pick on every source change. For a stable random subset, sample a plain array once.
:::

### `mapValues`

Map over the **values of a `Record`** — the natural follow-up to [`groupBy`](#groupby). The mapper receives `(value, key)`.

```tsx
const byDept = rx.groupBy(users, (u) => u.department)
const counts = rx.mapValues(byDept, (members) => members.length)
// Computed<Record<string, number>> → { eng: 2, design: 1 }
```

## Aggregation

Eight functions that collapse a collection to a single value. Signal input → `Computed<scalar>`; plain input → the scalar.

<Example file="./examples/rx/rx-aggregation-sum-avg-max" title="rx — aggregation (sum / avg / max)" />

### `count`

The item count.

```tsx
const total = rx.count(users) // Computed<number>
```

### `sum`

Sum numeric values. With no key it sums the items themselves; with a key / key-selector it sums that field. Values are coerced via `Number(...)`.

```tsx
rx.sum([1, 2, 3]) // 6
const totalAge = rx.sum(users, (u) => u.age) // Computed<number>
const totalAge2 = rx.sum(users, 'age') // by key name
```

### `average`

Mean of numeric values (optional key / key-selector). **Returns `0` for an empty collection**, not `NaN`.

```tsx
const avgAge = rx.average(users, 'age') // Computed<number>
```

### `min` / `max`

Find the **item** with the smallest / largest numeric value (optional key / key-selector). Returns the *item*, not the value — and `undefined` for an empty collection.

```tsx
const youngest = rx.min(users, (u) => u.age) // Computed<User | undefined> — the User, not the age
const oldest = rx.max(users, 'age') // Computed<User | undefined>
const oldestAge = rx.max(users, 'age')()?.age // read the value off the returned item
```

:::warning `min` / `max` return the ITEM, not the value
`rx.max(users, 'age')` resolves to the *oldest user object*, not the maximum age. Read the field off the returned item. Comparison is numeric (`Number(...)`).
:::

### `reduce`

Fold to a single value with an explicit initial accumulator. The reducer receives `(acc, item, index)`.

```tsx
const total = rx.reduce(items, (acc, item) => acc + item.price, 0) // Computed<number>
```

### `every` / `some`

Whether **all** / **any** items match a predicate. Predicate receives `(item, index)`.

```tsx
const allActive = rx.every(users, (u) => u.active) // Computed<boolean>
const hasAdmin = rx.some(users, (u) => u.role === 'admin') // Computed<boolean>
```

## Operators

Five signal-to-signal operators. Unlike the collection transforms, several of these operate on **values over time** rather than array contents.

### `distinct`

Skip **consecutive** duplicate emissions from a signal. Uses `Object.is` by default, or a custom `equals`. Returns a `ReadableSignal<T>`.

```tsx
const status = signal('idle')
const changes = rx.distinct(status) // only emits when the value actually changes
const byId = rx.distinct(item, (a, b) => a.id === b.id) // custom equality
```

### `scan`

A running accumulator over a signal's changes — like `reduce`, but it **emits the accumulated value on every source change**. Returns a `ReadableSignal<U>`.

```tsx
const clicks = signal(0)
const total = rx.scan(clicks, (acc, val) => acc + val, 0)
// clicks → 1 ⇒ total 1 ; clicks → 3 ⇒ total 4 ; clicks → 2 ⇒ total 6
```

### `combine`

Combine the values of **2 or 3 signals** into one `Computed`. The signals are passed as separate arguments, with the combiner function **last** (typed for 2 or 3 sources).

```tsx
const first = signal('Ada')
const last = signal('Lovelace')
const fullName = rx.combine(first, last, (f, l) => `${f} ${l}`) // Computed<string>
const label = rx.combine(name, age, dept, (n, a, d) => `${n} (${a}, ${d})`) // 3 sources
```

:::warning `combine` takes signals as separate args, not an array
The signature is variadic: `combine(a, b, fn)` / `combine(a, b, c, fn)` — pass each signal positionally with the combiner last. It does **not** accept an array of signals.
:::

### `zip`

Pair up multiple arrays element-by-element into tuples, **truncating to the shortest**. Reactive if **any** input is a signal (typed for 2 or 3 sources).

```tsx
const names = signal(['Alice', 'Bob'])
const ages = signal([30, 25])
const pairs = rx.zip(names, ages) // Computed<[string, number][]> → [['Alice', 30], ['Bob', 25]]
```

### `merge`

Concatenate multiple arrays into one (flattens one level). Reactive if **any** input is a signal.

```tsx
const a = signal([1, 2])
const b = signal([3, 4])
const all = rx.merge(a, b) // Computed<number[]> → [1, 2, 3, 4]
```

## Timing

Two operators that delay or rate-limit a signal's **value** (the whole emitted value, not individual array items). Both return a `ReadableSignal<T>` with an extra `.dispose()` method, and both **seed synchronously** with the current `source()`.

### `debounce`

Emit the latest value only after the source has been quiet for `ms` milliseconds. Ideal for search-as-you-type.

```tsx
const raw = signal('')
const debounced = rx.debounce(raw, 300) // ReadableSignal<string> & { dispose }

effect(() => {
  fetchResults(debounced()) // fires 300ms after the user stops typing
})

onCleanup(() => debounced.dispose()) // REQUIRED — see warning below
```

### `throttle`

Emit at most once per `ms` — a steady max rate during continuous change (emits immediately on first change, then waits the interval). Ideal for scroll / resize / pointermove.

```tsx
const throttled = rx.throttle(scrollY, 100)
effect(() => updateHeader(throttled()))
onCleanup(() => throttled.dispose())
```

:::danger `debounce` / `throttle` are NOT auto-cleaned — always `dispose()`
Each `debounce`/`throttle` owns a live `effect` + a `setTimeout`. They are **not** tied to component lifecycle, so they leak across navigations unless you call `.dispose()` (register it with `onCleanup`). A growing `rx.debounce.create` / `rx.throttle.create` perf counter in dev is exactly this leak.
:::

:::warning Timing operators are value-level and do NOT compose in `pipe`
`debounce(usersSignal, 300)` debounces the whole array emission, not individual rows. They take a single `Signal<T>` and return a signal — they are not curried collection operators and cannot be placed inside a [`pipe`](#pipe) chain. `debounce` emits **once after change stops**; `throttle` emits **at a steady rate during continuous change** — pick by which behavior you want.
:::

## Search

`search(source, query, keys)` is a **case-insensitive substring** filter across the named **string** fields. It is reactive when *either* `source` or `query` is a signal — making search-as-you-type a one-liner. An empty / whitespace query returns the full list.

```tsx
const query = signal('')
const results = rx.search(users, query, ['name', 'email']) // Computed<User[]>
// query = "ali" → matches "Alice" (substring, case-insensitive)
```

:::warning `search` takes a POSITIONAL `keys` array, not a `{ keys }` object
The third argument is the keys array itself — `search(users, query, ['name', 'email'])` — **not** an options object `{ keys: [...] }` (an object matches nothing). Only `string`-typed fields are tested; numeric/date columns never match (pre-stringify them if needed). Matching is plain `String.includes` after `.toLowerCase().trim()` — it is **not** fuzzy / typo-tolerant (`"alce"` won't match `"Alice"`). Pass `query` as a `Signal<string>` for live results; a plain string is matched once.
:::

## Pipe

`pipe(source, ...transforms)` composes transforms **left-to-right** and collapses the entire chain into **one** `computed` (not one per step). Each transform is a **plain function** that receives the resolved value from the previous step and returns the next — `(value) => newValue`. A signal source yields a `Computed`; a plain-array source yields a one-shot plain result. Typed for up to **5** transforms, with full type narrowing across steps.

```tsx
const topRisks = pipe(
  findings,
  (items) => items.filter((f) => f.severity === 'critical'),
  (items) => [...items].sort((a, b) => b.score - a.score),
  (items) => items.slice(0, 10),
)
// topRisks() — reactive Computed, re-derives when `findings` changes
```

Transforms can change the type at each step — the final type flows through:

```tsx
const summary = pipe(
  numbers, // Signal<number[]>
  (arr) => arr.filter((n) => n % 2 === 0), // number[]
  (arr) => arr.reduce((sum, n) => sum + n, 0), // number
  (total) => `Total: ${total}`, // string
)
summary() // "Total: 180"
```

:::tip One computed, not N
Composing transforms by nesting `rx` calls — `rx.take(rx.sortBy(rx.filter(src, p), k), n)` — allocates one tracked `computed` **per call**. `pipe` runs the whole chain inside a **single** `computed`, so it is the leaner shape for a multi-step derivation. (In dev, the `rx.pipe` counter increments once per `pipe` call regardless of chain depth.)
:::

:::warning `pipe` transforms are plain functions — `rx` functions are NOT curried operators
Each step is a plain `(value) => newValue` function — write the array operation inline (`(items) => items.filter(...)`). The `@pyreon/rx` collection functions are **not** curried single-argument operators, so `pipe(users, filter((u) => u.active))` does **not** work — call them in their direct `(source, predicate)` form outside `pipe`, or write the transform inline. Only a **signal** source makes `pipe` reactive; a plain-array source gives a one-shot plain result that you read directly (not as a `Computed`).
:::

## TypeScript

The package exports its two supporting types:

```ts
import type { KeyOf, ReadableSignal } from '@pyreon/rx'

// KeyOf<T> = keyof T | ((item: T) => string | number)
//   — the key/key-selector accepted by sortBy, groupBy, keyBy, uniqBy, sum, min, max, average
// ReadableSignal<T> = (() => T) & { peek?: () => T }
//   — any callable that returns a value (a signal, computed, or accessor)
```

Reactive returns are typed as the `Computed` produced by `@pyreon/reactivity`'s `computed`; static (plain-array) returns are typed as the bare result. The overloads resolve the right return type from your `source` argument.

## API Reference

### `rx` namespace

`rx` is a `Readonly` object exposing all 37 functions plus `pipe` for dot-notation use (`rx.filter(...)`). Every member is also a tree-shakeable named export.

### Collections (21)

| Function                       | Signature (signal-input form)                                                                | Returns (signal in)              |
| ------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------- |
| `filter(source, predicate)`    | `(Signal<T[]>, (item: T, i: number) => boolean)`                                             | `Computed<T[]>`                  |
| `map(source, fn)`              | `(Signal<T[]>, (item: T, i: number) => U)`                                                   | `Computed<U[]>`                  |
| `sortBy(source, key)`          | `(Signal<T[]>, KeyOf<T>)` — key name or selector, ascending, non-mutating                    | `Computed<T[]>`                  |
| `groupBy(source, key)`         | `(Signal<T[]>, KeyOf<T>)` — keys `String()`-coerced                                          | `Computed<Record<string, T[]>>`  |
| `keyBy(source, key)`           | `(Signal<T[]>, KeyOf<T>)` — last wins on collision                                           | `Computed<Record<string, T>>`    |
| `uniqBy(source, key)`          | `(Signal<T[]>, KeyOf<T>)` — first occurrence kept                                            | `Computed<T[]>`                  |
| `unique(source)`               | `(Signal<T[]>)` — primitive dedupe via `Set`                                                 | `Computed<T[]>`                  |
| `take(source, n)`              | `(Signal<T[]>, number)` — first `n`                                                          | `Computed<T[]>`                  |
| `skip(source, n)`              | `(Signal<T[]>, number)` — drop first `n`                                                     | `Computed<T[]>`                  |
| `last(source, n)`              | `(Signal<T[]>, number)` — last `n`                                                           | `Computed<T[]>`                  |
| `first(source)`                | `(Signal<T[]>)`                                                                              | `Computed<T \| undefined>`       |
| `chunk(source, size)`          | `(Signal<T[]>, number)`                                                                      | `Computed<T[][]>`                |
| `flatten(source)`              | `(Signal<T[][]>)` — one level                                                                | `Computed<T[]>`                  |
| `find(source, predicate)`      | `(Signal<T[]>, (item: T) => boolean)`                                                        | `Computed<T \| undefined>`       |
| `compact(source)`              | `(Signal<(T \| falsy)[]>)` — drops falsy values                                              | `Computed<T[]>`                  |
| `reverse(source)`              | `(Signal<T[]>)` — non-mutating copy                                                          | `Computed<T[]>`                  |
| `partition(source, predicate)` | `(Signal<T[]>, (item: T, i: number) => boolean)`                                             | `Computed<[T[], T[]]>`           |
| `takeWhile(source, predicate)` | `(Signal<T[]>, (item: T, i: number) => boolean)` — stops at first miss                       | `Computed<T[]>`                  |
| `dropWhile(source, predicate)` | `(Signal<T[]>, (item: T, i: number) => boolean)` — drops leading run                         | `Computed<T[]>`                  |
| `sample(source, n)`            | `(Signal<T[]>, number)` — random `n` (Fisher-Yates)                                          | `Computed<T[]>`                  |
| `mapValues(source, fn)`        | `(Signal<Record<string, T>>, (value: T, key: string) => U)`                                  | `Computed<Record<string, U>>`    |

### Aggregation (8)

| Function                      | Signature (signal-input form)                                          | Returns (signal in)        |
| ----------------------------- | ---------------------------------------------------------------------- | -------------------------- |
| `count(source)`               | `(Signal<T[]>)`                                                        | `Computed<number>`         |
| `sum(source, key?)`           | `(Signal<T[]>, KeyOf<T>?)` — `Number()`-coerced                        | `Computed<number>`         |
| `average(source, key?)`       | `(Signal<T[]>, KeyOf<T>?)` — `0` when empty                            | `Computed<number>`         |
| `min(source, key?)`           | `(Signal<T[]>, KeyOf<T>?)` — returns the **item**                      | `Computed<T \| undefined>` |
| `max(source, key?)`           | `(Signal<T[]>, KeyOf<T>?)` — returns the **item**                      | `Computed<T \| undefined>` |
| `reduce(source, reducer, init)` | `(Signal<T[]>, (acc: U, item: T, i: number) => U, U)`                | `Computed<U>`              |
| `every(source, predicate)`    | `(Signal<T[]>, (item: T, i: number) => boolean)`                       | `Computed<boolean>`        |
| `some(source, predicate)`     | `(Signal<T[]>, (item: T, i: number) => boolean)`                       | `Computed<boolean>`        |

### Operators (5)

| Function                       | Signature                                                                                  | Returns                          |
| ------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------- |
| `distinct(source, equals?)`    | `(Signal<T>, (a: T, b: T) => boolean = Object.is)` — skips consecutive dupes               | `ReadableSignal<T>`              |
| `scan(source, reducer, init)`  | `(Signal<T>, (acc: U, value: T) => U, U)` — running accumulator                            | `ReadableSignal<U>`              |
| `combine(a, b[, c], fn)`       | `(Signal<A>, Signal<B>[, Signal<C>], (a, b[, c]) => R)` — 2 or 3 signals, combiner last    | `Computed<R>`                    |
| `zip(a, b[, c])`               | `(Signal<A[]> \| A[], …)` — tuples, truncated to shortest; reactive if any input is signal | `Computed<[A, B(, C)][]>` / `[…]` |
| `merge(a, …rest)`              | `(Signal<T[]> \| T[], …)` — concatenate; reactive if any input is signal                   | `Computed<T[]>` / `T[]`          |

### Timing (2)

| Function                | Signature                  | Returns                                            |
| ----------------------- | -------------------------- | -------------------------------------------------- |
| `debounce(source, ms)`  | `(Signal<T>, number)`      | `ReadableSignal<T> & { dispose: () => void }`      |
| `throttle(source, ms)`  | `(Signal<T>, number)`      | `ReadableSignal<T> & { dispose: () => void }`      |

Both seed synchronously with `source()`; both **must** be `.dispose()`-d to release their internal effect + timer.

### Search (1)

| Function                       | Signature                                                                       | Returns                       |
| ------------------------------ | ------------------------------------------------------------------------------- | ----------------------------- |
| `search(source, query, keys)`  | `(Signal<T[]> \| T[], Signal<string> \| string, (keyof T)[])` — positional keys | `Computed<T[]>` / `T[]`       |

Case-insensitive substring match across the named **string** fields; reactive if `source` or `query` is a signal; empty query returns the full list.

### Pipe (1)

| Function                      | Signature                                                                            | Returns                |
| ----------------------------- | ------------------------------------------------------------------------------------ | ---------------------- |
| `pipe(source, ...transforms)` | `(Signal<A> \| A, (a: A) => B, (b: B) => C, …)` — plain transforms, up to 5, typed   | `Computed<…>` / plain  |

Composes left-to-right into **one** computed; signal source → `Computed`, plain source → one-shot value. Transforms are plain `(value) => newValue` functions (not curried `rx` operators).

### Types

| Type                | Definition                                                          |
| ------------------- | ------------------------------------------------------------------- |
| `KeyOf<T>`          | `keyof T \| ((item: T) => string \| number)`                        |
| `ReadableSignal<T>` | `(() => T) & { peek?: () => T }`                                    |

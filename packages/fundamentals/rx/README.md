# @pyreon/rx

39 signal-aware reactive transforms — filter, map, flatMap, sortBy, groupBy, countBy, pipe, debounce.

A small lodash-shaped library where every function is overloaded twice: pass a `Signal<T[]>` (or other `ReadableSignal<T[]>`) and get a `Computed<R>` back that auto-tracks; pass a plain `T[]` and get `R` synchronously. Use it for list pipelines (filter → sort → paginate), aggregations (sum / average / count over a reactive collection), grouped views (groupBy returning `Record<K, T[]>`), reactive search, and signal-rate limiting (debounce / throttle). Composes with `pipe(source, op1, op2, ...)` into a single computed.

## Install

```bash
bun add @pyreon/rx @pyreon/reactivity
```

## Quick start

```ts
import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'

type User = { id: string; name: string; active: boolean }
const users = signal<User[]>([])

// Each step is a Computed<User[]> — auto-tracks
const active = rx.filter(users, (u) => u.active)
const sorted = rx.sortBy(active, 'name')
const top10 = rx.take(sorted, 10)

// Or via pipe — collapses the chain into ONE computed
const top10b = rx.pipe(
  users,
  (items) => items.filter((u) => u.active),
  (items) => items.sort((a, b) => a.name.localeCompare(b.name)),
  (items) => items.slice(0, 10),
)
```

## The full surface

Two import shapes — `import { rx } from '@pyreon/rx'` for the namespaced object, or named imports for tree-shaking:

```ts
import { rx } from '@pyreon/rx' // rx.filter, rx.sortBy, …
import { filter, sortBy } from '@pyreon/rx' // tree-shake-friendly
```

### Collections (23)

`filter` · `map` · `flatMap` · `sortBy` · `groupBy` · `countBy` · `keyBy` · `uniqBy` · `take` · `skip` · `last` · `chunk` · `flatten` · `find` · `mapValues` · `first` · `compact` · `reverse` · `partition` · `takeWhile` · `dropWhile` · `unique` · `sample`

### Aggregation (8)

`count` · `sum` · `min` · `max` · `average` · `reduce` · `every` · `some`

### Operators (5)

`distinct` · `scan` · `combine` · `zip` · `merge`

### Timing (2)

`debounce` · `throttle`

### Search (1)

`search`

### Composition

`pipe(source, ...ops)`

## Reactive vs. static — every function has both overloads

```ts
// Reactive — input is a Signal, output is a Computed
const filtered = rx.filter(usersSignal, (u) => u.active) // Computed<User[]>

// Static — input is a plain array, output is plain
const filteredArr = rx.filter([{ active: true }], (u) => u.active) // User[]
```

The overload is picked from the input type at the call site — no separate functions to remember.

## `pipe` — composing transforms

`pipe(source, ...ops)` collapses N transforms into ONE computed. For a reactive source, the entire chain re-runs only when the source changes (not once per transform).

```ts
const result = rx.pipe(
  users,
  (items) => items.filter((u) => u.active),
  (items) => items.sort((a, b) => a.createdAt - b.createdAt),
  (items) => items.slice(0, 20),
)
// result: Computed<User[]>

// One computed, one subscription — vs three separate chained calls
// which would create three computeds and three subscriber links.
```

## Grouped, keyed and counted views

```ts
const byDept = rx.groupBy(users, (u) => u.department) // Computed<Record<string, User[]>>
const byId = rx.keyBy(users, 'id') // Computed<Record<string, User>>
const perDept = rx.countBy(users, (u) => u.department) // Computed<Record<string, number>>
const allTags = rx.flatMap(users, (u) => u.tags) // Computed<string[]> — map + flatten one level
```

`groupBy` returns a `Record<K, T[]>`, NOT a `Map<K, T[]>` — easier JSX iteration via `Object.entries`. `countBy` is the counting companion (per-bucket counts, not members); `flatMap` maps each item to an array and flattens one level (like `Array.prototype.flatMap`).

## Aggregations

```ts
const total = rx.sum(items, (i) => i.price) // Computed<number>
const oldest = rx.max(users, (u) => u.age) // Computed<User | undefined>
const allActive = rx.every(users, (u) => u.active) // Computed<boolean>
const totals = rx.reduce(items, (acc, i) => acc + i.qty, 0) // Computed<number>
```

## Operators

| Function | Notes |
|---|---|
| `distinct(source)` | Deduplicates by Object.is |
| `scan(source, reducer, seed)` | Running fold — emits accumulator on every source change |
| `combine(...sources)` | Tuple of latest values from each source |
| `zip(...sources)` | Element-wise pairing, truncates to shortest |
| `merge(...sources)` | Concatenate arrays |

## Timing — `debounce` / `throttle` create signal transforms

```ts
const search = signal('')
const debounced = rx.debounce(search, 300) // ReadableSignal<string> & { dispose }
const throttled = rx.throttle(scrollY, 16) // ReadableSignal<number> & { dispose }

effect(() => fetchResults(debounced()))
```

These differ from `useDebouncedCallback` (`@pyreon/hooks`): rx versions debounce / throttle a SIGNAL, hooks versions debounce / throttle a FUNCTION CALL.

**Lifecycle**: `debounce`/`throttle` (and `distinct`/`scan`) own an eager `effect()`. Created inside a component or `effectScope`, the effect **and its pending timer** are torn down automatically on unmount. Created **standalone** (module scope, a `defineStore` setup that outlives every scope), nothing owns it — call the returned idempotent `.dispose()`.

## Search

```ts
const query = signal('')
const results = rx.search(users, query, ['name', 'email'])
// Computed<User[]> — case-insensitive substring across the listed keys.
// The keys array is a REQUIRED positional argument, NOT a { keys } options object.
```

## Types

```ts
import type { ReadableSignal, KeyOf } from '@pyreon/rx'

// ReadableSignal<T> = a callable returning T. Pyreon Signal / Computed match.
// KeyOf<T> = keys of T whose values are sortable / hashable.
```

Every reactive overload accepts any `ReadableSignal<T[]>` — not just Pyreon `Signal` / `Computed`. Custom signal-shaped wrappers work too.

## Gotchas

- **`pipe(source, ...ops)` produces ONE computed** vs N chained calls producing N computeds. For a 3-step chain that's 1 node / 1 recompute-per-change vs 3 nodes / 3 recomputes. Use `pipe` for any chain longer than 2 steps. (Reproduce the exact counts with `bun run --filter=@pyreon/rx bench`.)
- **`groupBy` / `countBy` return `Record`, not `Map`** — JSX iteration via `Object.entries(groups())` instead of `[...groups()]`. `countBy` gives per-bucket counts; `groupBy` gives the members.
- **`flatMap` flattens ONE level** — the mapper must return an ARRAY per item (`n => [n * 2]`, not `n => n * 2`); nested arrays beyond one level stay nested.
- **`debounce` / `throttle` here transform signals**, NOT functions. For debounced callbacks, use `useDebouncedCallback` / `useThrottledCallback` from `@pyreon/hooks`. They're scope-aware — auto-cleaned inside a component, `.dispose()` for standalone.
- **`reverse` / `sortBy` return new arrays** — no in-place mutation, safe to use with Pyreon's identity-comparison effect tracking.
- **Reading a static `T[]` overload** returns a plain value — pass a `Signal<T[]>` for the reactive path. The TS error if you mix them is clear.
- **`sample(source, n)` uses Fisher-Yates** — for cryptographic randomness, sample upstream and pass static results.
- **`search`'s keys array is a REQUIRED positional argument** — `search(users, q, ['name', 'email'])`, NOT `{ keys: [...] }`. There is no "search all fields" default; only the listed string fields are matched.
- **Pure transforms only** — no side effects, no mutations. The `reduce` / `scan` callbacks must return the new accumulator; mutating the seed silently breaks the reactive chain.

## Documentation

Full docs: [pyreon.dev/docs/rx](https://pyreon.dev/docs/rx) (or `docs/src/content/docs/rx.md` in this repo).

## License

MIT

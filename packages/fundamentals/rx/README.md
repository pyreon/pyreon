# @pyreon/rx

Signal-aware reactive transforms for the Pyreon framework.

Every function is overloaded: pass a `Signal<T[]>` and get a `Computed<R>` back (reactive), or pass a plain `T[]` and get `R` (static).

## Install

```bash
bun add @pyreon/rx
```

## Usage

```ts
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

const users = signal<User[]>([])

const active = rx.filter(users, (u) => u.active) // Computed<User[]>
const sorted = rx.sortBy(active, 'name') // Computed<User[]>
const top10 = rx.take(sorted, 10) // Computed<User[]>

// Pipe chains
const result = rx.pipe(
  users,
  (items) => items.filter((u) => u.active),
  (items) => items.sort((a, b) => a.name.localeCompare(b.name)),
  (items) => items.slice(0, 10),
)
```

## API (37 functions)

**Collections (21):** `filter`, `map`, `sortBy`, `groupBy`, `keyBy`, `uniqBy`, `take`, `skip`, `last`, `chunk`, `flatten`, `find`, `mapValues`, `first`, `compact`, `reverse`, `partition`, `takeWhile`, `dropWhile`, `unique`, `sample`

**Aggregation (8):** `count`, `sum`, `min`, `max`, `average`, `reduce`, `every`, `some`

**Operators (5):** `distinct`, `scan`, `combine`, `zip`, `merge`

**Timing (2):** `debounce`, `throttle`

**Search:** `search` | **Pipe:** `pipe`

### New in v0.14

| Function | Description |
| --- | --- |
| `reduce(source, reducer, initial)` | Fold array to single value |
| `every(source, predicate)` | All items match? → `boolean` |
| `some(source, predicate)` | Any item matches? → `boolean` |
| `first(source)` | First element (reactive head) |
| `compact(source)` | Remove null/undefined/false/0/'' |
| `reverse(source)` | Reversed copy (no mutation) |
| `partition(source, predicate)` | Split into `[matches, rest]` |
| `takeWhile(source, predicate)` | Take while predicate true |
| `dropWhile(source, predicate)` | Skip while predicate true |
| `unique(source)` | Primitive dedup via Set |
| `sample(source, n)` | Random n items (Fisher-Yates) |
| `zip(...sources)` | Element-by-element pairing |
| `merge(...sources)` | Concatenate arrays |

## License

MIT

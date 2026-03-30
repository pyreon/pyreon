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

## API

**Collections:** `filter`, `map`, `sortBy`, `groupBy`, `keyBy`, `uniqBy`, `take`, `skip`, `last`, `chunk`, `flatten`, `find`, `mapValues`

**Aggregation:** `count`, `sum`, `min`, `max`, `average`

**Operators:** `distinct`, `scan`, `combine`

**Timing:** `debounce`, `throttle`

**Search:** `search`

**Pipe:** `pipe`

## License

MIT

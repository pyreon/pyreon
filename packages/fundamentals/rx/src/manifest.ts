import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/rx',
  title: 'Reactive Transforms',
  tagline:
    'Signal-aware reactive transforms — filter, map, sortBy, groupBy, pipe, debounce, throttle, 37 functions',
  description:
    'Signal-aware reactive data transforms for Pyreon. Every function is overloaded: pass a `Signal<T[]>` and get a `Computed<T[]>` that auto-tracks and re-derives when the source changes; pass a plain `T[]` and get a static result. 37 functions across collections (filter, map, sortBy, groupBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample), aggregation (count, sum, min, max, average, reduce, every, some), operators (distinct, scan, combine, zip, merge), timing (debounce, throttle), and search. `pipe(source, ...ops)` composes transforms left-to-right. Also exported as a namespaced `rx` object for dot-notation usage.',
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
const byDept = rx.groupBy(users, u => u.department)      // Computed<Map<string, User[]>>

// Pipe — compose left-to-right:
const result = pipe(
  users,
  filter(u => u.active),
  sortBy('name'),
  map(u => u.name),
)  // Computed<string[]> → ["Alice", "Charlie"]

// Search — fuzzy text matching across fields:
const query = signal('')
const matches = search(users, query, { keys: ['name', 'department'] })

// Timing — debounce/throttle signal emissions:
const debounced = debounce(users, 300)    // Computed that settles after 300ms
const throttled = rx.throttle(users, 100) // Computed that emits at most every 100ms

// Plain input → plain output (no signals):
const staticResult = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5]`,
  features: [
    'Every function overloaded: Signal<T[]> → Computed, T[] → plain',
    '37 functions across 6 categories: collections (21), aggregation (8), operators (5), timing (2), search (1), pipe (1)',
    'pipe(source, ...ops) composes transforms left-to-right',
    'Namespaced rx object for dot-notation usage (rx.filter, rx.map, etc.)',
    'Individual named exports for tree-shaking',
    'Timing operators: debounce and throttle for signal emissions',
    'search() for fuzzy text matching across object fields',
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
const grouped = rx.groupBy(users, u => u.department) // Computed<Map<string, User[]>>`,
      mistakes: [
        'Expecting `rx.filter(signal, pred)` to return a plain array — signal inputs always produce `Computed` outputs. Call the result to read: `active()`',
        'Passing a signal accessor (`() => items()`) instead of the signal itself — pass `items` not `() => items()`; the function checks for `.subscribe` to detect signals',
      ],
      seeAlso: ['pipe', 'filter'],
    },
    {
      name: 'pipe',
      kind: 'function',
      signature: '<T>(source: Signal<T[]> | T[], ...operators: Operator[]) => Computed<T[]> | T[]',
      summary:
        'Compose transforms left-to-right. Each operator receives the output of the previous one. Signal source produces a reactive `Computed` that re-derives when the source changes. Use curried forms of individual functions as operators: `filter(pred)`, `sortBy(key)`, `map(fn)`, etc.',
      example: `const result = pipe(
  users,
  filter(u => u.active),
  sortBy('name'),
  map(u => u.name),
  take(10),
)
// Computed<string[]> when users is a signal`,
      mistakes: [
        'Calling the non-curried form inside pipe — `pipe(users, filter(users, pred))` is wrong; use the curried form: `pipe(users, filter(pred))`',
      ],
      seeAlso: ['rx'],
    },
    {
      name: 'filter',
      kind: 'function',
      signature: '<T>(source: Signal<T[]> | T[], predicate: (item: T) => boolean) => Computed<T[]> | T[]',
      summary:
        'Filter items by predicate. Signal input produces a reactive `Computed<T[]>` that re-evaluates when the source signal changes. Also available in curried form `filter(pred)` for use with `pipe()`.',
      example: `const evens = filter(items, n => n % 2 === 0)  // Computed<number[]>
const result = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5]`,
      seeAlso: ['rx', 'pipe'],
    },
  ],
  gotchas: [
    {
      label: 'Signal detection',
      note: 'Functions detect signals by checking for a `.subscribe` method. Pass the signal itself (`items`), not an accessor wrapper (`() => items()`). Accessor wrappers produce a static result.',
    },
    {
      label: 'Computed lifecycle',
      note: 'Computed outputs from signal inputs auto-dispose when they have no subscribers. In component bodies, the reactive scope from JSX keeps them alive; in standalone code, subscribe or read within an `effect()` to keep them active.',
    },
    {
      label: 'Curried vs uncurried',
      note: 'Every function has both a direct form `filter(source, pred)` and a curried form `filter(pred)` for use with `pipe()`. The curried form is detected by argument count.',
    },
    {
      label: 'Tree-shaking',
      note: 'The `rx` namespace object is a `const` — bundlers can tree-shake unused properties. For maximum control, import individual functions: `import { filter, map } from "@pyreon/rx"`.',
    },
  ],
})

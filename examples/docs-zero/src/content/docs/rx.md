---
title: Rx
description: Signal-aware reactive transforms for Pyreon — filter, map, sortBy, groupBy, pipe, debounce, throttle
---

# @pyreon/rx

Signal-aware reactive transforms. Every function is overloaded — pass a `Signal<T[]>` and get a `Computed<R>` back (reactive), or pass a plain `T[]` and get `R` (static).

Not a lodash replacement — a signal operator library. Use `es-toolkit` for plain utility functions.

## Installation

::: code-group

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

Peer dependencies: `@pyreon/reactivity`

## Quick Start

```tsx
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

const users = signal<User[]>([])

// Signal in → Computed out (auto-reactive)
const active = rx.filter(users, u => u.active)
const sorted = rx.sortBy(active, 'name')
const top10 = rx.take(sorted, 10)

// top10() re-derives automatically when users changes
```

<Playground title="rx — composable reactive pipeline" height={260} code={`// Each step (filter, sortBy) is wrapped in computed() so the chain
// re-derives ONLY when its input signal changes. The real @pyreon/rx
// supplies these as one-liners via filter() / sortBy() / pipe().
const items = signal([
  { name: 'Banana', price: 2 },
  { name: 'Apple', price: 1 },
  { name: 'Cherry', price: 3 },
  { name: 'Date', price: 1 },
])
const maxPrice = signal(2)

const cheap = computed(() => items().filter(i => maxPrice() >= i.price))
const sorted = computed(() => [...cheap()].sort((a, b) => a.name.localeCompare(b.name)))

const app = document.getElementById('app')
const ui = h('div', { class: 'col' },
  h('div', { class: 'row' },
    h('span', { class: 'muted' }, 'max price:'),
    h('input', {
      type: 'range', min: '1', max: '3', step: '1', value: () => maxPrice(),
      onInput: (e) => maxPrice.set(Number(e.target.value)),
    }),
    h('span', { class: 'badge' }, () => '$' + maxPrice()),
  ),
  h('div', { class: 'card' },
    h('div', { class: 'muted', style: { marginBottom: '6px' } }, 'sorted result'),
    h('div', null, () =>
      sorted().length === 0
        ? '∅ no matches'
        : sorted().map(i => i.name + ' ($' + i.price + ')').join(' · '),
    ),
  ),
  h('div', { class: 'row' },
    h('button', { onClick: () => items.update(p => [...p, { name: 'Elderberry', price: 1 }]) }, '＋ Elderberry'),
    h('button', { onClick: () => items.update(p => p.slice(0, -1)) }, 'Remove last'),
  ),
)
mount(ui, app)`} />

## Signal Overloading

Every function detects whether the input is callable (a signal/computed) or a plain value:

```tsx
// Reactive — returns Computed<User[]>
const active = rx.filter(usersSignal, u => u.active)
active() // auto-tracks, re-derives on change

// Static — returns User[]
const active = rx.filter(usersArray, u => u.active)
// Just a plain filtered array, no signals involved
```

## Collections

### filter

```tsx
const active = rx.filter(users, u => u.active)
```

### map

```tsx
const names = rx.map(users, u => u.name)
```

### sortBy

Sort by a key string or comparator function:

```tsx
const sorted = rx.sortBy(users, 'name')
const sorted = rx.sortBy(users, (a, b) => a.age - b.age)
```

### groupBy

```tsx
const byRole = rx.groupBy(users, 'role')
// { admin: [...], user: [...] }
```

### keyBy

```tsx
const byId = rx.keyBy(users, 'id')
// { "1": user1, "2": user2 }
```

### uniqBy

```tsx
const unique = rx.uniqBy(users, 'email')
```

### take / skip / last

```tsx
const first5 = rx.take(users, 5)
const rest = rx.skip(users, 5)
const last3 = rx.last(users, 3)
```

### chunk

```tsx
const pages = rx.chunk(users, 10)
// [[...10], [...10], [...rest]]
```

### flatten

```tsx
const flat = rx.flatten(nestedArrays)
```

### find

```tsx
const admin = rx.find(users, u => u.role === 'admin')
```

### mapValues

Transform values of an object/record:

```tsx
const counts = rx.mapValues(grouped, arr => arr.length)
```

<Playground title="rx — aggregation (sum / avg / max)" height={240} code={`// rx.sum() / rx.average() / rx.max() are shipped as one-liners
// over a signal of an array. The implementation underneath is
// essentially what's spelled out here.
const scores = signal([85, 92, 78, 95, 88, 72, 90])

const total = computed(() => scores().reduce((a, b) => a + b, 0))
const avg = computed(() => total() / Math.max(1, scores().length))
const best = computed(() => Math.max(...scores(), 0))
const worst = computed(() => Math.min(...scores(), 100))

const stat = (label, value) =>
  h('div', { class: 'card', style: { textAlign: 'center', minWidth: '80px' } },
    h('div', { class: 'muted', style: { fontSize: '11px' } }, label),
    h('div', { style: { fontSize: '20px', fontWeight: '700' } }, value),
  )

const app = document.getElementById('app')
const ui = h('div', { class: 'col' },
  h('div', { class: 'row' },
    stat('total', () => total()),
    stat('avg',   () => avg().toFixed(1)),
    stat('best',  () => best()),
    stat('worst', () => worst()),
  ),
  h('div', { class: 'muted' }, () =>
    scores().length + ' score(s): ' + scores().join(' · '),
  ),
  h('div', { class: 'row' },
    h('button', {
      onClick: () => scores.update(s => [...s, Math.floor(Math.random() * 30) + 70]),
    }, '＋ random score'),
    h('button', { onClick: () => scores.set([]) }, 'clear'),
  ),
)
mount(ui, app)`} />

## Aggregation

### count

```tsx
const total = rx.count(users) // number
```

### sum

```tsx
const totalAge = rx.sum(users, 'age')
const totalAge = rx.sum(users, u => u.age)
```

### min / max

```tsx
const youngest = rx.min(users, 'age')
const oldest = rx.max(users, 'age')
```

### average

```tsx
const avgAge = rx.average(users, 'age')
```

## Operators

### distinct

Deduplicate a signal's emissions by value:

```tsx
const unique = rx.distinct(statusSignal)
```

### scan

Accumulate values over time:

```tsx
const total = rx.scan(priceSignal, (acc, price) => acc + price, 0)
```

### combine

Merge multiple signals into one:

```tsx
const combined = rx.combine([nameSignal, ageSignal], ([name, age]) => `${name} (${age})`)
```

## Timing

### debounce

Debounce a signal — the output updates only after the source stops changing for `ms` milliseconds:

```tsx
const debouncedSearch = rx.debounce(searchQuery, 300)

// Use in JSX — only triggers API call after 300ms of quiet
effect(() => {
  fetchResults(debouncedSearch())
})
```

Returns a signal with a `.dispose()` method for manual cleanup.

### throttle

Throttle a signal — the output updates at most once per `ms` milliseconds:

```tsx
const throttledScroll = rx.throttle(scrollPosition, 100)
```

Returns a signal with a `.dispose()` method for manual cleanup.

## Search

Substring search across multiple keys:

```tsx
const results = rx.search(users, searchQuery, ['name', 'email'])
// Filters users whose name or email contains the search string
```

Case-insensitive substring matching. No external dependencies.

## Pipe

Chain transforms left-to-right. Returns a `Computed` when the source is a signal:

```tsx
const topRisks = rx.pipe(
  findings,
  items => items.filter(f => f.severity === 'critical'),
  items => items.sort((a, b) => b.score - a.score),
  items => items.slice(0, 10),
)

// topRisks() — reactive, re-derives when findings changes
```

Type-safe up to 5 transforms in the chain.

## Tree Shaking

All functions are also exported as named exports for tree-shaking:

```tsx
import { filter, sortBy, take } from '@pyreon/rx'

// Same as rx.filter, rx.sortBy, rx.take
const result = take(sortBy(filter(users, u => u.active), 'name'), 10)
```

## TypeScript

```ts
import type { KeyOf, ReadableSignal } from '@pyreon/rx'
```

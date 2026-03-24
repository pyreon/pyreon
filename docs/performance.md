# Performance

Pyreon is designed from the ground up for minimal DOM work. This page explains the architectural reasons for its performance characteristics and how to use the available primitives to get the most out of your application.

## Benchmark Results

The following numbers are from the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) (Chrome, MacBook Pro M2, 2024). Lower is better for duration; lower is better for memory.

| Benchmark | React 18 | Vue 3 | SolidJS | Pyreon |
|---|---|---|---|---|
| Create 1,000 rows | 42 ms | 28 ms | 18 ms | 16 ms |
| Replace 1,000 rows | 56 ms | 38 ms | 20 ms | 18 ms |
| Partial update (every 10th) | 12 ms | 9 ms | 3 ms | 2 ms |
| Select row | 8 ms | 5 ms | 0.8 ms | 0.7 ms |
| Swap rows | 14 ms | 9 ms | 4 ms | 3 ms |
| Remove row | 12 ms | 8 ms | 4 ms | 3 ms |
| Create 10,000 rows | 420 ms | 290 ms | 175 ms | 160 ms |
| Startup time | 38 ms | 32 ms | 12 ms | 10 ms |
| Memory (1,000 rows) | 9.2 MB | 7.8 MB | 5.1 MB | 4.8 MB |

These numbers are approximate and depend on the specific benchmark implementation. Pyreon and SolidJS have similar performance profiles because they share the same fine-grained reactivity model.

## Why Pyreon Is Fast

### 1. Components Run Once

In React, every state change triggers a re-render of the component function and its subtree. In Pyreon, the component function runs exactly once. Subsequent updates are handled by granular effects that patch individual DOM nodes.

```tsx
// React — this function runs on every count change
function Counter() {
  const [count, setCount] = useState(0)
  console.log("render")  // fires on every click
  return <span>{count}</span>
}

// Pyreon — this function runs ONCE
function Counter() {
  const count = signal(0)
  console.log("setup")  // fires once at mount
  // Only the text node for count() updates on click
  return <span>{count()}</span>
}
```

### 2. No Virtual DOM

React and Vue build a virtual DOM tree and diff it on every render. Pyreon's JSX transform compiles to direct DOM operations. When a signal changes, only the exact DOM node that reads that signal is updated.

### 3. Targeted DOM Updates

```tsx
function Profile({ user }: { user: Signal<User> }) {
  return (
    <div>
      <h1>{() => user().name}</h1>      {/* effect 1 */}
      <p>{() => user().bio}</p>         {/* effect 2 */}
      <img src={() => user().avatar} /> {/* effect 3 */}
    </div>
  )
}
```

If only `user().name` changes, only `<h1>`'s text node is updated. The `<p>` and `<img>` are not touched.

## For vs array.map

For reactive lists with frequent mutations, `For` is significantly faster than `array.map`:

| Operation | array.map | For |
|---|---|---|
| Item appended | Recreates all DOM nodes | Creates 1 DOM node |
| Item removed | Recreates all DOM nodes | Removes 1 DOM node |
| Items reordered | Recreates all DOM nodes | Moves existing DOM nodes |
| Item property updated | Recreates all DOM nodes (with signal: fine-grained) | Fine-grained per item |

```tsx
// Slow for large reactive lists
{() => items().map(item => <Row key={item.id} item={item} />)}

// Fast — only changed items update
<For each={items} by={i => i.id} children={i => <Row item={i} />} />
```

## createSelector — O(1) Active Item

The classic "selected item" pattern in React re-runs every item's render when the selection changes. With `createSelector`, only the previously selected and newly selected items update.

```tsx
import { signal, createSelector } from "@pyreon/reactivity"

const selectedId = signal<number | null>(null)
const isSelected = createSelector(selectedId)

// Each row's effect only fires when THIS row's selection status changes
<For
  each={rows}
  by={r => r.id}
  children={row => (
    <li class={() => isSelected(row.id) ? "selected" : ""}>
      {row.name}
    </li>
  )}
/>
```

Without `createSelector`, clicking an item would re-run N effects (one per row). With `createSelector`, exactly 2 effects run: the deselected row and the selected row.

## createTemplate — Fast DOM Cloning

For tables and grids with identical row structures, `createTemplate` pre-builds a DOM node and clones it for each row using `Node.cloneNode(true)`, which is faster than constructing nodes from JavaScript.

```ts
import { createTemplate } from "@pyreon/runtime-dom"
import { effect } from "@pyreon/reactivity"

const TableRow = createTemplate<{ name: string; value: number }>(props => {
  const tr = document.createElement("tr")
  const nameTd = document.createElement("td")
  const valueTd = document.createElement("td")

  effect(() => { nameTd.textContent = props.name() })
  effect(() => { valueTd.textContent = props.value().toFixed(2) })

  tr.append(nameTd, valueTd)
  return tr
})
```

Benchmark results for a 1,000-row table:

| Approach | Initial render | Row update |
|---|---|---|
| JSX row component | 45 ms | 0.3 ms |
| createTemplate row | 18 ms | 0.3 ms |

Initial render is faster; per-row update time is the same (both use fine-grained effects).

## Signal Granularity Tips

### Use many small signals, not one large object

```ts
// Slow — any property change notifies all subscribers
const state = signal({ name: "Alice", age: 30, score: 100 })

// Fast — each subscriber only re-runs for the signal it reads
const name = signal("Alice")
const age = signal(30)
const score = signal(100)
```

### Keep computed values focused

```ts
// Wide computed — re-runs whenever any user field changes
const userSummary = computed(() => ({
  displayName: `${user().firstName} ${user().lastName}`,
  initials: `${user().firstName[0]}${user().lastName[0]}`,
  isAdmin: user().role === "admin",
}))

// Narrow computeds — each re-runs only when its dependency changes
const displayName = computed(() => `${firstName()} ${lastName()}`)
const initials = computed(() => `${firstName()[0]}${lastName()[0]}`)
const isAdmin = computed(() => role() === "admin")
```

### Avoid reading signals in hot loops

```ts
// Bad — reads signal N times per tick
effect(() => {
  for (const item of largeList) {
    process(item, config())  // config() called N times
  }
})

// Good — read once, use the value
effect(() => {
  const cfg = config()  // read once
  for (const item of largeList) {
    process(item, cfg)
  }
})
```

## Batching Updates

When multiple signals change together, wrap them in `batch` to fire effects only once:

```ts
// Without batch — 3 effect runs
x.set(1)
y.set(2)
z.set(3)

// With batch — 1 effect run
batch(() => {
  x.set(1)
  y.set(2)
  z.set(3)
})
```

In event handlers, Pyreon automatically batches updates triggered synchronously in the same handler. Manual `batch` is needed for async handlers or when calling multiple store actions.

## Memory

- Each signal holds a `Set` of subscriber functions. Signals with no subscribers hold no memory beyond the value itself.
- Effects are disposed automatically when their owner component unmounts.
- Computed values cache their last result and release it when they have no subscribers.

Avoid creating signals or effects inside loops or frequently-called functions. The creation cost is small but accumulates.

```ts
// Bad — creates a new signal on every click
button.addEventListener("click", () => {
  const temp = signal(0)  // leaked — no owner to dispose it
})

// Good — create once during setup
function Component() {
  const count = signal(0)
  return <button onClick={() => count.update(n => n + 1)}>{count()}</button>
}
```

## Lazy Initialization

Use `computed` for expensive values that may not be needed:

```ts
// Computed is lazy — this only runs if someone reads expensiveResult()
const expensiveResult = computed(() => runExpensiveAlgorithm(input()))
```

Load heavy components with `lazy()` to split them into separate chunks that only download when first needed. See [suspense.md](./suspense.md).

## Profiling

Use the browser's Performance tab to record a trace. Pyreon's effects appear as short tasks named after the signal that triggered them. Look for:

- **Long effect runs**: the effect function does too much work. Break it into smaller effects.
- **Many effect runs**: a high-frequency signal (e.g., `mousemove`) drives too many dependencies. Debounce or throttle the signal update.
- **Repeated DOM queries**: cache `getBoundingClientRect()` results in signals updated in `onUpdate`.

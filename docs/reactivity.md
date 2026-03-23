# Reactivity

Pyreon's reactivity system is the foundation of the framework. It provides fine-grained primitives that track dependencies automatically — no dependency arrays, no manual subscriptions.

## How Tracking Works

When you read a signal inside an `effect` or `computed`, Pyreon records that dependency. When the signal changes, only the effects that read it are re-run. This happens at the individual signal level, not at the component level, which is why components never re-run.

```ts
import { signal, computed, effect } from "@pyreon/reactivity"

const a = signal(1)
const b = signal(2)
const sum = computed(() => a() + b())

effect(() => console.log("sum =", sum()))  // logs "sum = 3"

a.set(10)  // logs "sum = 12"
b.set(20)  // logs "sum = 32"
```

## API Reference

| Function | Signature | Description |
|---|---|---|
| `signal` | `signal<T>(initial: T): Signal<T>` | Creates a reactive value |
| `computed` | `computed<T>(fn: () => T): ReadonlySignal<T>` | Derived value, lazy and memoized |
| `effect` | `effect(fn: () => void \| Cleanup): EffectHandle` | Runs `fn` immediately and on dependency changes |
| `onCleanup` | `onCleanup(fn: () => void): void` | Registers cleanup inside an effect (runs before re-run and on dispose) |
| `batch` | `batch(fn: () => void): void` | Defers all signal notifications until `fn` returns |
| `createSelector` | `createSelector<T>(source: () => T): (v: T) => boolean` | O(1) active-item selection |
| `runUntracked` | `runUntracked<T>(fn: () => T): T` | Reads signals without tracking them |

## signal

```ts
const count = signal(0)

count()           // read — returns current value
count.set(5)      // write — sets to exact value
count.update(n => n + 1)  // update — transforms current value
```

`Signal<T>` is a callable function. Calling it returns the current value and registers a dependency if called inside a tracking context (effect or computed).

```ts
import { signal } from "@pyreon/reactivity"

// Primitive values
const name = signal("Alice")
const active = signal(false)
const score = signal<number>(0)

// Objects — replace the entire object to trigger updates
const user = signal({ id: 1, name: "Alice" })
user.set({ ...user(), name: "Bob" })

// Arrays — same pattern
const items = signal<string[]>([])
items.update(list => [...list, "new item"])
```

### Signal type

```ts
interface Signal<T> {
  (): T                           // read
  set(value: T): void             // write
  update(fn: (prev: T) => T): void  // transform
}
```

## computed

```ts
const doubled = computed(() => count() * 2)
doubled()  // read — same API as signal, but read-only
```

- Lazy: the function is not called until the value is first read.
- Memoized: if none of its dependencies changed since the last read, the cached value is returned.
- Composable: computed values can depend on other computed values.

```ts
const firstName = signal("Alice")
const lastName = signal("Smith")
const fullName = computed(() => `${firstName()} ${lastName()}`)
const greeting = computed(() => `Hello, ${fullName()}!`)

effect(() => console.log(greeting()))
// "Hello, Alice Smith!"

lastName.set("Jones")
// "Hello, Alice Jones!"
```

`computed` returns a `ReadonlySignal<T>` — it has no `.set()` or `.update()` methods.

## effect

```ts
const stop = effect(() => {
  console.log("count is", count())
})

// Later, stop tracking:
stop.dispose()
```

- `effect` runs the function immediately on creation.
- It re-runs whenever any signal read inside it changes.
- If the function returns a cleanup function, Pyreon calls it before the next run and when `dispose()` is called.
- You can also use `onCleanup()` inside the effect to register cleanup functions imperatively — useful for multiple cleanups or conditional cleanup.

```ts
import { effect, onCleanup } from "@pyreon/reactivity"

const url = signal("/api/users")

// Using onCleanup (recommended):
effect(() => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())

  fetch(url(), { signal: controller.signal })
    .then(r => r.json())
    .then(data => console.log(data))
})

// Using return cleanup (also works):
effect(() => {
  const controller = new AbortController()
  fetch(url(), { signal: controller.signal })
    .then(r => r.json())
    .then(data => console.log(data))

  return () => controller.abort()
})
```

Effects created inside a component are automatically disposed when the component is unmounted.

### Nested effects

Effects can be nested. The inner effect is disposed when the outer one re-runs.

```ts
effect(() => {
  if (isLoggedIn()) {
    effect(() => {
      // This only runs while isLoggedIn() is true.
      // Disposed automatically when outer re-runs.
      console.log("User:", currentUser())
    })
  }
})
```

## batch

Groups multiple signal writes into a single notification flush.

```ts
const x = signal(0)
const y = signal(0)
const sum = computed(() => x() + y())

effect(() => console.log(sum()))  // logs "0"

batch(() => {
  x.set(1)  // queued
  y.set(2)  // queued
})
// logs "3" — only one notification
```

Without `batch`, setting `x` would trigger the effect, then setting `y` would trigger it again. `batch` ensures computed values and effects only re-run once per batch.

## createSelector

`createSelector` is an optimization for the "active item" pattern. Instead of every item effect re-running when the selection changes, only the previously active and newly active items update — O(1) instead of O(n).

```ts
import { signal, createSelector } from "@pyreon/reactivity"

const selectedId = signal<number | null>(null)
const isSelected = createSelector(selectedId)

// In each list item (rendered once per item):
effect(() => {
  if (isSelected(item.id)) {
    element.classList.add("selected")
  } else {
    element.classList.remove("selected")
  }
})

// When selection changes, only 2 effects re-run (old + new)
selectedId.set(42)
```

## runUntracked

Reads a signal's value without registering a dependency. Useful when you need the current value for a computation but don't want the effect to re-run when that signal changes.

```ts
import { signal, effect, runUntracked } from "@pyreon/reactivity"

const count = signal(0)
const multiplier = signal(2)

effect(() => {
  // Re-runs when count changes, NOT when multiplier changes
  const m = runUntracked(() => multiplier())
  console.log(count() * m)
})
```

## Gotchas

**Reading outside a tracking context does not subscribe.**

```ts
// This does NOT react to changes
const value = count()
console.log(value)

// This DOES react
effect(() => console.log(count()))
```

**Destructuring breaks reactivity.**

```ts
// Wrong — reads once, not reactive
const { name } = user()

// Correct — read the signal each time
effect(() => console.log(user().name))
```

**Object mutations are not detected.** Signals use reference equality. Mutating an object in place will not trigger subscribers.

```ts
// Wrong
const arr = signal([1, 2, 3])
arr().push(4)  // no notification

// Correct
arr.update(list => [...list, 4])
```

**Async functions in effects.** Only the synchronous part of an async function is tracked. Reads after an `await` are not tracked.

```ts
effect(async () => {
  const id = userId()  // tracked
  await delay(100)
  const name = userName()  // NOT tracked — after await
})
```

Use `runUntracked` or split into separate effects when dealing with async code.

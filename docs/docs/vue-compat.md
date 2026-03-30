---
title: '@pyreon/vue-compat'
description: Vue 3 Composition API that runs on Pyreon's fine-grained reactive engine.
---

`@pyreon/vue-compat` provides a Vue 3 Composition API-compatible layer -- `ref`, `computed`, `reactive`, `watch`, lifecycle hooks, `defineComponent`, and more -- all running on Pyreon's signal-based reactive engine. If you know the Vue 3 Composition API, you can write Pyreon components with familiar patterns.

<PackageBadge name="@pyreon/vue-compat" href="/docs/vue-compat" status="stable" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/vue-compat
```

```bash [bun]
bun add @pyreon/vue-compat
```

```bash [pnpm]
pnpm add @pyreon/vue-compat
```

```bash [yarn]
yarn add @pyreon/vue-compat
```

:::

## Quick Start

Replace your Vue imports:

```tsx
// Before
import { ref, computed, watch, onMounted, defineComponent } from 'vue'

// After
import { ref, computed, watch, onMounted, defineComponent } from '@pyreon/vue-compat'
```

A complete counter component:

```tsx
import { ref, computed, watch, onMounted, defineComponent, h } from '@pyreon/vue-compat'
import { createApp } from '@pyreon/vue-compat'

const Counter = defineComponent({
  name: 'Counter',
  setup() {
    const count = ref(0)
    const doubled = computed(() => count.value * 2)

    watch(count, (newVal, oldVal) => {
      console.log(`count: ${oldVal} -> ${newVal}`)
    })

    onMounted(() => {
      console.log('Counter mounted')
    })

    return () => (
      <div>
        <p>Count: {count.value}</p>
        <p>Doubled: {doubled.value}</p>
        <button onClick={() => count.value++}>+1</button>
      </div>
    )
  },
})

createApp(Counter).mount('#app')
```

## Key Differences from Vue 3

| Behavior                   | Vue 3                                    | @pyreon/vue-compat                                            |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| Reactive engine            | Vue's Proxy-based reactivity             | Pyreon's signal-based reactivity                              |
| `deep` option in `watch()` | Controls deep observation                | **Ignored** -- Pyreon tracks dependencies automatically       |
| `computed` setter          | Supported via getter/setter object       | **Not supported** -- throws on write                          |
| `shallowRef`               | Separate shallow implementation          | Identical to `ref()` -- Pyreon signals are inherently shallow |
| `shallowReactive`          | Separate shallow implementation          | Same as `reactive()` in practice                              |
| `readonly`                 | Vue's full readonly reactive proxy       | Simple Proxy that throws on set/delete                        |
| `defineComponent`          | Supports Options API and Composition API | **Composition API only** (setup function)                     |
| Templates                  | `<template>` with compilation            | Not supported -- use JSX or `h()` render functions            |
| Components                 | Run setup once, re-render via template   | Run setup **once**, return a render function                  |
| Plugins / directives       | `app.use()`, `v-model`, `v-if`, etc.     | Not supported                                                 |
| Lifecycle timing           | `beforeMount` vs `mounted` distinction   | No distinction -- both map to `onMount`                       |

## API Reference

### Refs

#### `ref`

```ts
function ref<T>(value: T): Ref<T>

interface Ref<T> {
  value: T
}
```

Creates a reactive ref backed by a Pyreon signal. Access the value via `.value` -- reads are tracked, writes trigger updates.

```tsx
const count = ref(0)
count.value // read (tracked)
count.value = 5 // write (triggers updates)
count.value++ // also works
```

Refs can hold any type, including objects, arrays, and `null`:

```tsx
const user = ref<{ name: string; age: number } | null>(null)

// Update the entire object
user.value = { name: 'Alice', age: 30 }

// Replace it later
user.value = { name: 'Bob', age: 25 }

// Or null it out
user.value = null
```

Refs holding objects do **not** deeply track mutations on the inner object. If you mutate an inner property, the ref itself does not notify subscribers:

```tsx
const list = ref([1, 2, 3])

// This mutation is NOT detected:
list.value.push(4)

// You must replace the value to trigger subscribers:
list.value = [...list.value, 4]

// Or use triggerRef() to force a notification:
list.value.push(4)
triggerRef(list)
```

For deep reactivity, use `reactive()` instead of `ref()`.

#### `shallowRef`

```ts
function shallowRef<T>(value: T): Ref<T>
```

Identical to `ref()`. Pyreon signals are inherently shallow -- they do not perform deep conversion. This function exists for API compatibility with Vue 3.

```tsx
// These two are equivalent in Pyreon:
const a = ref({ count: 0 })
const b = shallowRef({ count: 0 })
```

In Vue 3, `shallowRef` skips deep conversion of the inner value, while `ref` deeply converts it. In Pyreon, neither performs deep conversion, so the distinction does not exist at runtime.

#### `ref` vs `shallowRef` -- When Does It Matter?

It does not matter in Pyreon. Use whichever name makes your intent clearer to other developers reading the code. If you are migrating from Vue 3, you can leave `shallowRef` calls as-is.

```tsx
// Vue 3: shallowRef is meaningful because ref() deeply converts
import { shallowRef } from 'vue'
const heavyData = shallowRef(someLargeObject) // avoids deep Proxy wrapping

// Pyreon: both behave the same -- signals are always shallow
import { shallowRef, ref } from '@pyreon/vue-compat'
const heavyData = shallowRef(someLargeObject) // same as ref(someLargeObject)
```

#### `triggerRef`

```ts
function triggerRef<T>(r: Ref<T>): void
```

Force-triggers a ref's subscribers even if the value has not changed. Useful after mutating an object held by a ref.

```tsx
const list = ref([1, 2, 3])
list.value.push(4) // mutation -- ref doesn't detect this
triggerRef(list) // manually trigger subscribers
```

Internally, `triggerRef` works by briefly setting the underlying signal to a different value and then restoring it, which forces all subscribers to re-evaluate.

```tsx
// Common pattern: mutable array with triggerRef
const items = ref<string[]>([])

function addItem(item: string) {
  items.value.push(item)
  triggerRef(items)
}

function removeItem(index: number) {
  items.value.splice(index, 1)
  triggerRef(items)
}
```

#### `isRef`

```ts
function isRef(val: unknown): val is Ref
```

Returns `true` if the value is a ref (created by `ref()` or `computed()`). Uses an internal symbol to detect refs, so plain objects with a `.value` property are not detected.

```tsx
import { ref, computed, isRef } from '@pyreon/vue-compat'

isRef(ref(0)) // true
isRef(computed(() => 42)) // true
isRef(0) // false
isRef({ value: 0 }) // false -- plain object, not a ref
isRef(null) // false
```

#### `unref`

```ts
function unref<T>(r: T | Ref<T>): T
```

Unwraps a ref: returns `.value` if it is a ref, otherwise returns the value as-is. Useful in utility functions that accept both refs and plain values.

```tsx
function formatName(name: string | Ref<string>) {
  return `Hello, ${unref(name)}!`
}

// Works with both:
formatName('Alice') // "Hello, Alice!"
formatName(ref('Bob')) // "Hello, Bob!"
```

A more complete example with generic utilities:

```tsx
// Generic utility that accepts both refs and plain values
function clampValue(value: number | Ref<number>, min: number, max: number): number {
  const raw = unref(value)
  return Math.max(min, Math.min(max, raw))
}

const count = ref(150)
clampValue(count, 0, 100) // 100
clampValue(42, 0, 100) // 42
```

### Computed

#### `computed`

```ts
function computed<T>(fn: () => T): ComputedRef<T>

interface ComputedRef<T> extends Ref<T> {
  readonly value: T
}
```

Creates a readonly computed ref backed by Pyreon's `computed()`. The `.value` property is tracked on read and throws on write.

```tsx
const count = ref(2)
const doubled = computed(() => count.value * 2)

doubled.value // 4
doubled.value = 10 // throws: "Cannot set value of a computed ref"
```

Computed values are lazy and cached -- the getter function only re-runs when a dependency changes:

```tsx
const firstName = ref('Alice')
const lastName = ref('Smith')

const fullName = computed(() => {
  console.log('computing fullName') // only logs when firstName or lastName changes
  return `${firstName.value} ${lastName.value}`
})

fullName.value // logs "computing fullName", returns "Alice Smith"
fullName.value // no log -- returns cached "Alice Smith"
firstName.value = 'Bob'
fullName.value // logs "computing fullName", returns "Bob Smith"
```

Computed refs can depend on other computed refs:

```tsx
const price = ref(100)
const quantity = ref(3)
const subtotal = computed(() => price.value * quantity.value)
const tax = computed(() => subtotal.value * 0.08)
const total = computed(() => subtotal.value + tax.value)

total.value // 324 (300 + 24)
```

**Difference from Vue:** Writable computed (getter/setter object form) is not supported. If you need a writable computed pattern, use a `ref` with a setter function:

```tsx
// Vue 3 writable computed -- NOT supported in Pyreon:
// const count = computed({ get: () => ..., set: (v) => ... })

// Pyreon alternative:
const _internal = ref(0)
const count = computed(() => _internal.value * 2)
function setCount(value: number) {
  _internal.value = value / 2
}
```

### Reactive Objects

#### `reactive`

```ts
function reactive<T extends object>(obj: T): T
```

Creates a deeply reactive proxy backed by Pyreon's `createStore()`. Each property is backed by its own signal, so mutations trigger only the affected subscribers.

```tsx
const state = reactive({ count: 0, user: { name: 'Alice' } })

state.count++ // triggers effects that read state.count
state.user.name = 'Bob' // triggers effects that read state.user.name
```

Deep tracking with nested objects:

```tsx
const store = reactive({
  todos: [
    { id: 1, text: 'Learn Pyreon', done: false },
    { id: 2, text: 'Build an app', done: false },
  ],
  filter: 'all' as 'all' | 'active' | 'done',
})

// Only effects reading store.filter re-run:
store.filter = 'active'

// Only effects reading the specific todo re-run:
store.todos[0].done = true
```

Using `reactive` with type annotations:

```tsx
interface AppState {
  user: { name: string; email: string } | null
  theme: 'light' | 'dark'
  notifications: Array<{ id: number; message: string }>
}

const state = reactive<AppState>({
  user: null,
  theme: 'light',
  notifications: [],
})

// Type-safe mutations
state.user = { name: 'Alice', email: 'alice@example.com' }
state.theme = 'dark'
state.notifications.push({ id: 1, message: 'Welcome!' })
```

#### `shallowReactive`

```ts
function shallowReactive<T extends object>(obj: T): T
```

Same as `reactive()` in practice. Pyreon's `createStore()` handles both cases. This function exists for API compatibility with Vue 3.

```tsx
// These two are equivalent in Pyreon:
const a = reactive({ count: 0, nested: { value: 1 } })
const b = shallowReactive({ count: 0, nested: { value: 1 } })
```

#### `reactive` vs `shallowReactive` in Pyreon

In Vue 3, `shallowReactive` only tracks root-level properties, while `reactive` recursively wraps nested objects. In Pyreon, `createStore()` uses per-property signals, so the distinction does not apply in the same way. Both are backed by `createStore()`.

#### `readonly`

```ts
function readonly<T extends object>(obj: T): Readonly<T>
```

Returns a proxy that throws on any mutation attempt (set or delete). Useful for exposing state that should not be mutated by consumers.

```tsx
const config = readonly({ apiUrl: '/api', debug: false })
config.apiUrl // '/api' -- reads work normally
config.apiUrl = '/v2' // throws: 'Cannot set property "apiUrl" on a readonly object'
```

Nested readonly objects:

```tsx
const settings = readonly({
  database: {
    host: 'localhost',
    port: 5432,
  },
  features: {
    darkMode: true,
    notifications: false,
  },
})

settings.database.host // 'localhost' -- nested reads work
settings.database = { host: 'remote', port: 5432 } // throws
```

Note that `readonly` only traps direct property writes on the proxy. Nested objects are **not** deeply wrapped in readonly proxies:

```tsx
const data = { inner: { count: 0 } }
const ro = readonly(data)

// This throws (setting a property on the readonly proxy):
ro.inner = { count: 1 } // Error!

// But this does NOT throw (mutating the nested object directly):
ro.inner.count = 1 // Works -- the inner object is not wrapped
```

If you need deep immutability, freeze the object with `Object.freeze()` or use `readonly(reactive(obj))` and avoid direct references to nested objects.

**Difference from Vue:** Uses a simple Proxy with a throwing set trap, rather than Vue's full readonly reactive system. Vue's `readonly()` deeply wraps nested objects; Pyreon's does not.

#### Combining `reactive` and `readonly`

A common pattern for shared state: expose a readonly view to consumers while keeping a mutable internal reference.

```tsx
// store.ts
const _state = reactive({
  count: 0,
  user: null as { name: string } | null,
})

// Public readonly view
export const state = readonly(_state)

// Public mutation functions
export function increment() {
  _state.count++
}

export function setUser(name: string) {
  _state.user = { name }
}
```

```tsx
// Consumer.tsx
import { state, increment } from './store'

function Counter() {
  return (
    <div>
      <p>Count: {state.count}</p>
      <button onClick={increment}>+1</button>
      {/* state.count = 99 would throw */}
    </div>
  )
}
```

#### `toRaw`

```ts
function toRaw<T extends object>(proxy: T): T
```

Returns the original plain object behind a `reactive()` or `readonly()` proxy. Useful when you need to pass the unwrapped object to an external library or for serialization.

```tsx
const raw = { count: 0 }
const state = reactive(raw)
toRaw(state) === raw // true

// Useful for serialization
const plain = toRaw(state)
JSON.stringify(plain) // safe -- no Proxy

// Works with readonly too
const config = readonly({ debug: false })
const rawConfig = toRaw(config) // { debug: false }
```

### Ref Conversion

#### `toRef`

```ts
function toRef<T extends object, K extends keyof T>(obj: T, key: K): Ref<T[K]>
```

Creates a ref linked to a property of a reactive object. Reading/writing the ref's `.value` reads/writes the original property. This is useful for passing individual reactive properties to composable functions that expect refs.

```tsx
const state = reactive({ name: 'Alice', age: 30 })
const nameRef = toRef(state, 'name')

nameRef.value // 'Alice'
nameRef.value = 'Bob' // state.name is now 'Bob'
state.name = 'Charlie'
nameRef.value // 'Charlie'
```

Passing reactive properties to composables:

```tsx
function useFormattedName(name: Ref<string>) {
  return computed(() => name.value.toUpperCase())
}

const state = reactive({ firstName: 'alice', lastName: 'smith' })
const formatted = useFormattedName(toRef(state, 'firstName'))
formatted.value // 'ALICE'
```

#### `toRefs`

```ts
function toRefs<T extends object>(obj: T): { [K in keyof T]: Ref<T[K]> }
```

Converts all properties of a reactive object into individual refs. Each ref is linked to the original property. Commonly used for destructuring reactive objects without losing reactivity.

```tsx
const state = reactive({ x: 1, y: 2 })
const { x, y } = toRefs(state)

x.value // 1
x.value = 10
state.x // 10
```

Destructuring a composable return value:

```tsx
function useMousePosition() {
  const state = reactive({ x: 0, y: 0 })

  const handler = (e: MouseEvent) => {
    state.x = e.clientX
    state.y = e.clientY
  }

  onMounted(() => window.addEventListener('mousemove', handler))
  onUnmounted(() => window.removeEventListener('mousemove', handler))

  // Return refs so consumers can destructure
  return toRefs(state)
}

// In a component:
const { x, y } = useMousePosition()
// x and y are Ref<number> -- reactivity preserved
```

Without `toRefs`, destructuring a reactive object produces plain (non-reactive) values:

```tsx
const state = reactive({ count: 0 })

// BAD: loses reactivity
const { count } = state
// `count` is just 0, not reactive

// GOOD: preserves reactivity
const { count } = toRefs(state)
// `count` is Ref<number>, tracks changes
```

### Watchers

#### `watch`

```ts
function watch<T>(
  source: Ref<T> | (() => T),
  cb: (newValue: T, oldValue: T | undefined) => void,
  options?: WatchOptions,
): () => void

interface WatchOptions {
  immediate?: boolean // Fire cb immediately with current value
  deep?: boolean // Ignored in Pyreon
}
```

Watches a reactive source and calls `cb` when it changes. Returns a stop function.

**Watching a ref:**

```tsx
const count = ref(0)

const stop = watch(count, (newVal, oldVal) => {
  console.log(`Changed from ${oldVal} to ${newVal}`)
})

count.value = 1 // logs: "Changed from 0 to 1"
count.value = 2 // logs: "Changed from 1 to 2"

stop() // no more callbacks
count.value = 3 // no log
```

**Watching a getter:**

```tsx
const state = reactive({ user: { name: 'Alice' } })

watch(
  () => state.user.name,
  (newName, oldName) => {
    console.log(`Name changed: ${oldName} -> ${newName}`)
  },
)

state.user.name = 'Bob' // logs: "Name changed: Alice -> Bob"
```

**Immediate mode:**

When `immediate: true`, the callback fires synchronously with the current value before any changes occur. The `oldValue` is `undefined` on the first call.

```tsx
const count = ref(5)

watch(
  count,
  (val, oldVal) => {
    console.log(`val=${val}, oldVal=${oldVal}`)
  },
  { immediate: true },
)
// Immediately logs: "val=5, oldVal=undefined"

count.value = 10
// Logs: "val=10, oldVal=5"
```

**Watching computed values:**

```tsx
const items = ref([1, 2, 3])
const total = computed(() => items.value.reduce((a, b) => a + b, 0))

watch(total, (newTotal) => {
  console.log(`Total is now: ${newTotal}`)
})

items.value = [1, 2, 3, 4] // logs: "Total is now: 10"
```

**The `deep` option:**

The `deep` option is accepted for API compatibility but **ignored** in Pyreon. Pyreon tracks the exact signals read inside the getter automatically. You do not need `deep: true` to watch nested properties -- just reference them in the getter:

```tsx
const state = reactive({ nested: { count: 0 } })

// Vue 3 needed deep: true for this. Pyreon does not.
watch(
  () => state.nested.count,
  (newVal) => console.log(newVal),
)

state.nested.count = 5 // callback fires automatically
```

**Stopping a watcher:**

```tsx
const count = ref(0)
const stop = watch(count, (val) => console.log(val))

count.value = 1 // logs 1
stop() // dispose the watcher
count.value = 2 // nothing -- watcher is disposed
```

#### `watchEffect`

```ts
function watchEffect(fn: () => void): () => void
```

Runs `fn` immediately and re-runs it whenever its tracked dependencies change. Returns a stop function. Unlike `watch`, it does not provide old/new values and does not require specifying the source explicitly.

```tsx
const count = ref(0)

const stop = watchEffect(() => {
  document.title = `Count: ${count.value}`
})
// Immediately sets document.title to "Count: 0"

count.value = 5
// document.title is now "Count: 5"

stop()
count.value = 10
// document.title stays "Count: 5" -- effect is stopped
```

**Multiple dependencies:**

`watchEffect` automatically tracks all reactive sources read during execution:

```tsx
const firstName = ref('Alice')
const lastName = ref('Smith')

watchEffect(() => {
  console.log(`Name: ${firstName.value} ${lastName.value}`)
})
// Logs: "Name: Alice Smith"

firstName.value = 'Bob'
// Logs: "Name: Bob Smith"

lastName.value = 'Jones'
// Logs: "Name: Bob Jones"
```

**Side effects with cleanup:**

```tsx
const searchQuery = ref('')

watchEffect(() => {
  const query = searchQuery.value
  if (!query) return

  const controller = new AbortController()
  fetch(`/api/search?q=${query}`, { signal: controller.signal })
    .then((r) => r.json())
    .then((data) => console.log(data))

  // Note: Pyreon does not have a cleanup callback like Vue 3's onCleanup.
  // If you need cancellation, use watch() and manage the AbortController manually.
})
```

**`watch` vs `watchEffect`:**

| Feature          | `watch`                                   | `watchEffect`                |
| ---------------- | ----------------------------------------- | ---------------------------- |
| Source           | Explicit ref or getter                    | Implicit -- tracks all reads |
| Runs immediately | Only with `&#123; immediate: true &#125;` | Always                       |
| Old/new values   | Yes                                       | No                           |
| Use case         | React to specific changes                 | Sync side effects with state |

### Lifecycle Hooks

All lifecycle hooks must be called during component setup (inside `defineComponent`'s `setup` function).

#### `onMounted`

```ts
function onMounted(fn: () => void): void
```

Runs `fn` after the component mounts. Maps to Pyreon's `onMount`.

```tsx
const Timer = defineComponent({
  setup() {
    const elapsed = ref(0)
    let interval: ReturnType<typeof setInterval>

    onMounted(() => {
      console.log('Timer mounted')
      interval = setInterval(() => elapsed.value++, 1000)
    })

    onUnmounted(() => {
      clearInterval(interval)
    })

    return () => <p>Elapsed: {elapsed.value}s</p>
  },
})
```

#### `onUnmounted`

```ts
function onUnmounted(fn: () => void): void
```

Runs `fn` when the component unmounts. Maps to Pyreon's `onUnmount`. Use it to clean up timers, event listeners, subscriptions, and other resources.

```tsx
const WindowSize = defineComponent({
  setup() {
    const width = ref(window.innerWidth)
    const height = ref(window.innerHeight)

    const handler = () => {
      width.value = window.innerWidth
      height.value = window.innerHeight
    }

    onMounted(() => window.addEventListener('resize', handler))
    onUnmounted(() => window.removeEventListener('resize', handler))

    return () => (
      <p>
        Window: {width.value} x {height.value}
      </p>
    )
  },
})
```

#### `onUpdated`

```ts
function onUpdated(fn: () => void): void
```

Runs `fn` after a reactive update. Maps to Pyreon's `onUpdate`.

```tsx
const AutoScroll = defineComponent({
  setup() {
    const messages = ref<string[]>([])

    onUpdated(() => {
      // Scroll to bottom after new messages render
      const container = document.getElementById('messages')
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })

    return () => (
      <div id="messages">
        {messages.value.map((msg) => (
          <p>{msg}</p>
        ))}
      </div>
    )
  },
})
```

#### `onBeforeMount`

```ts
function onBeforeMount(fn: () => void): void
```

Maps to `onMount`. Pyreon does not have a separate pre-mount phase, so `onBeforeMount` and `onMounted` behave identically.

#### `onBeforeUnmount`

```ts
function onBeforeUnmount(fn: () => void): void
```

Maps to `onUnmount`. Pyreon does not have a separate pre-unmount phase, so `onBeforeUnmount` and `onUnmounted` behave identically.

#### Lifecycle Hook Summary

| Vue 3 Hook        | Pyreon Mapping | Notes                                    |
| ----------------- | -------------- | ---------------------------------------- |
| `onBeforeMount`   | `onMount`      | No separate pre-mount phase              |
| `onMounted`       | `onMount`      | Identical to `onBeforeMount` in Pyreon   |
| `onBeforeUnmount` | `onUnmount`    | No separate pre-unmount phase            |
| `onUnmounted`     | `onUnmount`    | Identical to `onBeforeUnmount` in Pyreon |
| `onUpdated`       | `onUpdate`     | Fires after reactive updates             |
| `onBeforeUpdate`  | Not available  | Use `watch`/`watchEffect` instead        |
| `onErrorCaptured` | Not available  | Use try/catch in setup                   |
| `onActivated`     | Not available  | No `<KeepAlive>` equivalent              |
| `onDeactivated`   | Not available  | No `<KeepAlive>` equivalent              |

### Async

#### `nextTick`

```ts
function nextTick(): Promise<void>
```

Returns a Promise that resolves after all pending reactive updates have flushed. Useful when you need to read the DOM after a reactive state change.

```tsx
count.value = 42
await nextTick()
// DOM is updated, safe to measure
const height = document.getElementById('content')?.offsetHeight
```

A practical example:

```tsx
const AutoFocus = defineComponent({
  setup() {
    const showInput = ref(false)

    async function reveal() {
      showInput.value = true
      await nextTick()
      // The input is now in the DOM
      document.getElementById('my-input')?.focus()
    }

    return () => (
      <div>
        {showInput.value && <input id="my-input" />}
        <button onClick={reveal}>Show Input</button>
      </div>
    )
  },
})
```

### Dependency Injection

Pyreon's `provide`/`inject` system lets ancestor components share values with any descendant, avoiding prop drilling.

#### `provide`

```ts
function provide<T>(key: string | symbol, value: T): void
```

Provides a value to all descendant components. Call during component setup.

```tsx
const ThemeKey = Symbol('theme')

const App = defineComponent({
  setup() {
    provide(ThemeKey, { color: 'blue', fontSize: 14 })
    return () => <Child />
  },
})
```

#### `inject`

```ts
function inject<T>(key: string | symbol, defaultValue?: T): T | undefined
```

Injects a value provided by an ancestor component. Returns `defaultValue` if no provider is found.

```tsx
const Child = defineComponent({
  setup() {
    const theme = inject(ThemeKey, { color: 'gray', fontSize: 14 })
    return () => <div style={{ color: theme.color }}>Themed</div>
  },
})
```

#### Typed Injection Keys

Use `InjectionKey` patterns to get type safety:

```tsx
// keys.ts
export interface Theme {
  color: string
  fontSize: number
  fontFamily: string
}

export const ThemeKey: unique symbol = Symbol('theme')
export const LocaleKey: unique symbol = Symbol('locale')
```

```tsx
// Provider.tsx
import { ThemeKey, LocaleKey } from './keys'

const App = defineComponent({
  setup() {
    provide<Theme>(ThemeKey, {
      color: 'blue',
      fontSize: 14,
      fontFamily: 'sans-serif',
    })

    provide(LocaleKey, 'en-US')

    return () => <Layout />
  },
})
```

```tsx
// Consumer.tsx
import { ThemeKey, LocaleKey, type Theme } from './keys'

const ThemedButton = defineComponent({
  setup() {
    const theme = inject<Theme>(ThemeKey)
    const locale = inject<string>(LocaleKey, 'en-US')

    return () => (
      <button
        style={{
          color: theme?.color,
          fontSize: `${theme?.fontSize}px`,
          fontFamily: theme?.fontFamily,
        }}
      >
        {locale}
      </button>
    )
  },
})
```

#### Providing Reactive Values

You can provide refs or reactive objects so descendants receive live updates:

```tsx
const App = defineComponent({
  setup() {
    const count = ref(0)
    provide('counter', count) // provide the ref itself

    return () => (
      <div>
        <button onClick={() => count.value++}>+1</button>
        <Display />
      </div>
    )
  },
})

const Display = defineComponent({
  setup() {
    const count = inject<Ref<number>>('counter', ref(0))
    return () => <p>Count: {count.value}</p> // reactive!
  },
})
```

### Components

#### `defineComponent`

```ts
function defineComponent<P extends Props>(
  options: ComponentOptions<P> | ((props: P) => VNodeChild),
): ComponentFn<P>

interface ComponentOptions<P> {
  setup: (props: P) => (() => VNodeChild) | VNodeChild
  name?: string
}
```

Defines a component. Accepts either an options object with a `setup` function, or a plain function component.

**Options object with named component:**

```tsx
const MyComp = defineComponent({
  name: 'MyComp',
  setup(props) {
    const count = ref(0)
    return () => <div>{count.value}</div>
  },
})
```

**Function shorthand:**

```tsx
const MyComp = defineComponent((props) => {
  const count = ref(0)
  return <div>{count.value}</div>
})
```

**With typed props:**

```tsx
interface UserCardProps {
  name: string
  email: string
  avatar?: string
}

const UserCard = defineComponent<UserCardProps>({
  name: 'UserCard',
  setup(props) {
    const initials = computed(() =>
      props.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase(),
    )

    return () => (
      <div class="user-card">
        {props.avatar ? (
          <img src={props.avatar} alt={props.name} />
        ) : (
          <div class="avatar-placeholder">{initials.value}</div>
        )}
        <h3>{props.name}</h3>
        <p>{props.email}</p>
      </div>
    )
  },
})
```

**Setup returning a render function vs returning a VNode:**

The setup function can return either a render function (called on every re-render) or a VNode directly:

```tsx
// Returning a render function (recommended for reactive components)
const Dynamic = defineComponent({
  setup() {
    const count = ref(0)
    // This function is called on every render
    return () => <p>{count.value}</p>
  },
})

// Returning a VNode directly (for static content)
const Static = defineComponent({
  setup() {
    return <p>I never change</p>
  },
})
```

**Difference from Vue:** Only Composition API is supported. No Options API (`data`, `methods`, `computed` options). No `<template>` support -- the setup function must return a render function or VNode.

### Rendering

#### `h` / `Fragment`

```ts
function h(type: string | ComponentFn, props: Props | null, ...children: VNodeChild[]): VNode
```

Re-export of Pyreon's `h()` and `Fragment` for manual render function usage.

**HTML elements:**

```tsx
// <div class="card"><p>Hello</p></div>
<div class="card">
  <p>Hello</p>
</div>
```

**Components:**

```tsx
<UserCard name="Alice" email="alice@example.com" />
```

**Fragments (multiple root elements):**

```tsx
<>
  <p>First</p>
  <p>Second</p>
</>
```

**Dynamic children:**

```tsx
const items = ['Apple', 'Banana', 'Cherry']
<ul>{items.map(item => <li>{item}</li>)}</ul>
```

**Event handlers:**

```tsx
<button onClick={() => count.value++} onMouseEnter={() => console.log('hover')}>
  Click me
</button>
```

**Style and class:**

```tsx
<div class="container active" style={{ backgroundColor: 'blue', padding: '16px' }}>
  Content
</div>
```

In most cases, JSX is more ergonomic than `h()`. Use `h()` when you need programmatic VNode construction or when building utility libraries.

#### `createApp`

```ts
function createApp(component: ComponentFn, props?: Props): App

interface App {
  mount(el: string | Element): () => void
}
```

Creates an application instance. Call `.mount()` with a CSS selector or DOM element to render. Returns an unmount function.

```tsx
const app = createApp(App)
const unmount = app.mount('#app')

// Later -- tear down the app
unmount()
```

**With props:**

```tsx
const app = createApp(App, { initialCount: 10 })
app.mount('#app')
```

**With a DOM element:**

```tsx
const container = document.getElementById('app')!
const app = createApp(App)
app.mount(container)
```

**Error handling:**

```tsx
try {
  createApp(App).mount('#nonexistent')
} catch (e) {
  // "Cannot find mount target: #nonexistent"
}
```

**Difference from Vue:** Does not support `app.use()` (plugins), `app.directive()`, `app.component()`, or global config. Use direct imports instead of plugins.

### Batching

#### `batch`

```ts
function batch<T>(fn: () => T): T
```

Re-export from `@pyreon/reactivity`. Groups multiple reactive writes into a single flush, preventing intermediate re-renders.

```tsx
import { batch, ref, watchEffect } from '@pyreon/vue-compat'

const firstName = ref('Alice')
const lastName = ref('Smith')

watchEffect(() => {
  console.log(`${firstName.value} ${lastName.value}`)
})
// Logs: "Alice Smith"

// Without batch: would log twice (once per change)
// With batch: logs only once with the final state
batch(() => {
  firstName.value = 'Bob'
  lastName.value = 'Jones'
})
// Logs: "Bob Jones" (single flush)
```

`batch` is especially useful when updating multiple reactive sources that together represent a single logical state change:

```tsx
const state = reactive({ x: 0, y: 0 })

function moveTo(x: number, y: number) {
  batch(() => {
    state.x = x
    state.y = y
  })
}
```

## Composable Patterns

Composables are reusable functions that encapsulate reactive state and logic. They follow the same patterns as Vue 3 composables.

### useCounter

```tsx
import { ref, computed } from '@pyreon/vue-compat'

function useCounter(initial = 0) {
  const count = ref(initial)
  const doubled = computed(() => count.value * 2)

  function increment() {
    count.value++
  }
  function decrement() {
    count.value--
  }
  function reset() {
    count.value = initial
  }

  return { count, doubled, increment, decrement, reset }
}

// Usage:
const Counter = defineComponent({
  setup() {
    const { count, doubled, increment, decrement, reset } = useCounter(10)

    return () => (
      <div>
        <p>
          Count: {count.value} (doubled: {doubled.value})
        </p>
        <button onClick={decrement}>-</button>
        <button onClick={increment}>+</button>
        <button onClick={reset}>Reset</button>
      </div>
    )
  },
})
```

### useLocalStorage

```tsx
import { ref, watch } from '@pyreon/vue-compat'

function useLocalStorage<T>(key: string, defaultValue: T): Ref<T> {
  // Read initial value from localStorage
  const stored = localStorage.getItem(key)
  const data = ref<T>(stored ? JSON.parse(stored) : defaultValue)

  // Persist changes to localStorage
  watch(data, (newValue) => {
    localStorage.setItem(key, JSON.stringify(newValue))
  })

  return data as Ref<T>
}

// Usage:
const settings = useLocalStorage('app-settings', {
  theme: 'light',
  fontSize: 14,
})

settings.value = { theme: 'dark', fontSize: 16 }
// Automatically saved to localStorage
```

### useFetch

```tsx
import { ref, watch, onUnmounted } from '@pyreon/vue-compat'

interface UseFetchReturn<T> {
  data: Ref<T | null>
  error: Ref<Error | null>
  loading: Ref<boolean>
  refetch: () => void
}

function useFetch<T>(url: Ref<string> | string): UseFetchReturn<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<Error | null>(null)
  const loading = ref(false)
  let controller: AbortController | null = null

  async function doFetch() {
    controller?.abort()
    controller = new AbortController()

    loading.value = true
    error.value = null

    try {
      const response = await fetch(unref(url), { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      data.value = await response.json()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      loading.value = false
    }
  }

  // If url is a ref, re-fetch when it changes
  if (isRef(url)) {
    watch(url, () => doFetch(), { immediate: true })
  } else {
    doFetch()
  }

  onUnmounted(() => controller?.abort())

  return { data, error, loading, refetch: doFetch }
}

// Usage:
const UserList = defineComponent({
  setup() {
    const { data: users, loading, error, refetch } = useFetch<User[]>('/api/users')

    return () => (
      <div>
        {loading.value && <p>Loading...</p>}
        {error.value && <p>Error: {error.value.message}</p>}
        {users.value && (
          <ul>
            {users.value.map((u) => (
              <li>{u.name}</li>
            ))}
          </ul>
        )}
        <button onClick={refetch}>Refresh</button>
      </div>
    )
  },
})
```

### useToggle

```tsx
import { ref } from '@pyreon/vue-compat'

function useToggle(initial = false) {
  const value = ref(initial)
  function toggle() {
    value.value = !value.value
  }
  function setTrue() {
    value.value = true
  }
  function setFalse() {
    value.value = false
  }
  return { value, toggle, setTrue, setFalse }
}

// Usage:
const { value: isOpen, toggle: toggleMenu } = useToggle()
```

### useDebounce

```tsx
import { ref, watch, onUnmounted } from '@pyreon/vue-compat'

function useDebounce<T>(source: Ref<T>, delay: number): Ref<T> {
  const debounced = ref(source.value) as Ref<T>
  let timeout: ReturnType<typeof setTimeout>

  watch(source, (newVal) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      debounced.value = newVal
    }, delay)
  })

  onUnmounted(() => clearTimeout(timeout))

  return debounced
}

// Usage:
const SearchInput = defineComponent({
  setup() {
    const query = ref('')
    const debouncedQuery = useDebounce(query, 300)

    watch(debouncedQuery, (q) => {
      console.log('Searching for:', q)
    })

    return () => (
      <input
        value={query.value}
        onInput={(e: Event) => {
          query.value = (e.target as HTMLInputElement).value
        }}
      />
    )
  },
})
```

### useEventListener

```tsx
import { onMounted, onUnmounted } from '@pyreon/vue-compat'

function useEventListener<K extends keyof WindowEventMap>(
  target: EventTarget,
  event: K,
  handler: (e: WindowEventMap[K]) => void,
) {
  onMounted(() => target.addEventListener(event, handler as EventListener))
  onUnmounted(() => target.removeEventListener(event, handler as EventListener))
}

// Usage:
const KeyTracker = defineComponent({
  setup() {
    const lastKey = ref('')

    useEventListener(window, 'keydown', (e) => {
      lastKey.value = e.key
    })

    return () => <p>Last key: {lastKey.value}</p>
  },
})
```

## Migration from Vue 3 to Pyreon

### Step-by-Step Migration

**1. Replace imports:**

```tsx
// Before
import { ref, computed, watch, onMounted } from 'vue'

// After
import { ref, computed, watch, onMounted } from '@pyreon/vue-compat'
```

**2. Convert templates to render functions:**

```tsx
// Vue 3 with <template>
// <template>
//   <div v-if="show">
//     <p v-for="item in items">{{ item }}</p>
//   </div>
// </template>
// <script setup>
// const show = ref(true)
// const items = ref(['a', 'b', 'c'])
// </script>

// Pyreon equivalent
const MyComp = defineComponent({
  setup() {
    const show = ref(true)
    const items = ref(['a', 'b', 'c'])

    return () =>
      show.value && (
        <div>
          {items.value.map((item) => (
            <p>{item}</p>
          ))}
        </div>
      )
  },
})
```

**3. Replace Vue directives with JSX patterns:**

| Vue Directive           | JSX Equivalent                                                |
| ----------------------- | ------------------------------------------------------------- |
| `v-if="cond"`           | `&#123;cond && <Comp />&#125;`                                |
| `v-else`                | Ternary: `&#123;cond ? <A /> : <B />&#125;`                   |
| `v-show="cond"`         | `style=&#123;&#123; display: cond ? '' : 'none' &#125;&#125;` |
| `v-for="item in items"` | `&#123;items.map(item => <Comp />)&#125;`                     |
| `v-model="val"`         | `value=&#123;val.value&#125; :onInput='...'`                  |
| `v-on:click="fn"`       | `onClick=&#123;fn&#125;`                                      |
| `v-bind:class="cls"`    | `class=&#123;cls&#125;`                                       |

**4. Replace Options API with Composition API:**

```tsx
// Vue 3 Options API
// export default {
//   data() { return { count: 0 } },
//   computed: { doubled() { return this.count * 2 } },
//   methods: { increment() { this.count++ } },
// }

// Pyreon Composition API
const Counter = defineComponent({
  setup() {
    const count = ref(0)
    const doubled = computed(() => count.value * 2)
    function increment() {
      count.value++
    }

    return () => (
      <div>
        <p>
          {count.value} x 2 = {doubled.value}
        </p>
        <button onClick={increment}>+1</button>
      </div>
    )
  },
})
```

**5. Replace writable computed:**

```tsx
// Vue 3 writable computed
// const fullName = computed({
//   get: () => `${first.value} ${last.value}`,
//   set: (v) => { [first.value, last.value] = v.split(' ') }
// })

// Pyreon alternative
const first = ref('Alice')
const last = ref('Smith')
const fullName = computed(() => `${first.value} ${last.value}`)
function setFullName(v: string) {
  const [f, l] = v.split(' ')
  first.value = f
  last.value = l ?? ''
}
```

**6. Replace `app.use()` plugins with direct imports:**

```tsx
// Vue 3 with plugins
// const app = createApp(App)
// app.use(router)
// app.use(store)
// app.mount('#app')

// Pyreon with direct composition
import { createApp } from '@pyreon/vue-compat'
import { RouterProvider } from '@pyreon/router'

const App = defineComponent({
  setup() {
    return () => (
      <RouterProvider router={router}>
        <Layout />
      </RouterProvider>
    )
  },
})

createApp(App).mount('#app')
```

### Migration Checklist

1. Replace `vue` imports with `@pyreon/vue-compat`.
2. Replace `<template>` blocks with render functions returned from `setup()`.
3. Remove `deep: true` from `watch` options (it is ignored -- Pyreon auto-tracks).
4. Replace Options API components (`data`, `methods`, `computed`) with Composition API `setup()`.
5. Remove writable computed usage -- use a `ref` plus a setter function instead.
6. Replace `app.use()` plugin registrations with direct imports.
7. Replace Vue directives (`v-model`, `v-if`, `v-for`) with Pyreon control flow components (`Show`, `For`) or JSX expressions.
8. The `.value` access pattern for `ref` and `computed` works exactly the same -- no changes needed.

## Complete Exports

| Export            | Type     | Description                                          |
| ----------------- | -------- | ---------------------------------------------------- |
| `ref`             | Function | Create a reactive ref                                |
| `shallowRef`      | Function | Create a shallow ref (identical to `ref`)            |
| `triggerRef`      | Function | Force-trigger ref subscribers                        |
| `isRef`           | Function | Check if a value is a ref                            |
| `unref`           | Function | Unwrap a ref or return as-is                         |
| `computed`        | Function | Create a readonly computed ref                       |
| `reactive`        | Function | Create a deeply reactive proxy                       |
| `shallowReactive` | Function | Create a shallow reactive proxy (same as `reactive`) |
| `readonly`        | Function | Create a readonly proxy                              |
| `toRaw`           | Function | Get the raw object behind a proxy                    |
| `toRef`           | Function | Create a ref linked to a reactive property           |
| `toRefs`          | Function | Convert all properties to refs                       |
| `watch`           | Function | Watch a source and run a callback on change          |
| `watchEffect`     | Function | Run a function reactively                            |
| `onMounted`       | Function | Lifecycle: after mount                               |
| `onUnmounted`     | Function | Lifecycle: on unmount                                |
| `onUpdated`       | Function | Lifecycle: after update                              |
| `onBeforeMount`   | Function | Lifecycle: before mount (same as `onMounted`)        |
| `onBeforeUnmount` | Function | Lifecycle: before unmount (same as `onUnmounted`)    |
| `nextTick`        | Function | Wait for reactive flush                              |
| `provide`         | Function | Provide a value to descendants                       |
| `inject`          | Function | Inject a value from ancestors                        |
| `defineComponent` | Function | Define a component                                   |
| `h`               | Function | Create virtual DOM nodes                             |
| `Fragment`        | Symbol   | Fragment for multiple root elements                  |
| `createApp`       | Function | Create an application instance                       |
| `batch`           | Function | Batch multiple reactive writes                       |
| `Ref`             | Type     | Ref interface                                        |
| `ComputedRef`     | Type     | Computed ref interface                               |
| `WatchOptions`    | Type     | Watch options interface                              |

# Testing

Pyreon components and reactivity primitives can be tested with any JavaScript test runner. This guide covers patterns for Bun's built-in test runner, which the framework uses internally.

## Setup

### Install Dependencies

```bash
bun add --dev happy-dom @happy-dom/global-registrator
```

### Configure DOM Environment

Create a `bunfig.toml` in your project (or package) root:

```toml
[test]
preload = ["./happydom.ts"]
```

Create the preload file:

```ts
// happydom.ts
import { GlobalRegistrator } from "@happy-dom/global-registrator"
GlobalRegistrator.register()
```

This makes `document`, `window`, and other DOM APIs available in tests.

## Testing Reactivity

### Signals

```ts
import { test, expect } from "bun:test"
import { signal, computed, effect } from "@pyreon/reactivity"

test("signal read and write", () => {
  const count = signal(0)
  expect(count()).toBe(0)

  count.set(5)
  expect(count()).toBe(5)

  count.update(n => n + 1)
  expect(count()).toBe(6)
})

test("computed derives from signals", () => {
  const a = signal(2)
  const b = signal(3)
  const sum = computed(() => a() + b())

  expect(sum()).toBe(5)
  a.set(10)
  expect(sum()).toBe(13)
})
```

### Effects

```ts
import { signal, effect } from "@pyreon/reactivity"

test("effect runs on signal change", () => {
  const count = signal(0)
  const log: number[] = []

  const dispose = effect(() => {
    log.push(count())
  })

  expect(log).toEqual([0])  // runs immediately

  count.set(1)
  expect(log).toEqual([0, 1])

  count.set(2)
  expect(log).toEqual([0, 1, 2])

  dispose.dispose()
  count.set(3)
  expect(log).toEqual([0, 1, 2])  // no longer tracked
})
```

### Batch

```ts
import { signal, effect, batch } from "@pyreon/reactivity"

test("batch coalesces updates", () => {
  const x = signal(0)
  const y = signal(0)
  let runs = 0

  effect(() => {
    x()
    y()
    runs++
  })
  expect(runs).toBe(1)

  batch(() => {
    x.set(1)
    y.set(2)
  })
  expect(runs).toBe(2)  // only one additional run
})
```

## Testing Components

### Mount and Inspect

```tsx
import { test, expect } from "bun:test"
import { h } from "@pyreon/core"
import { mount } from "@pyreon/runtime-dom"
import { signal } from "@pyreon/reactivity"

function Counter() {
  const count = signal(0)
  return (
    <div>
      <span class="count">{count()}</span>
      <button onClick={() => count.update(n => n + 1)}>+</button>
    </div>
  )
}

test("Counter renders and updates", () => {
  const container = document.createElement("div")
  const unmount = mount(<Counter />, container)

  const span = container.querySelector(".count")!
  expect(span.textContent).toBe("0")

  const button = container.querySelector("button")!
  button.click()
  expect(span.textContent).toBe("1")

  unmount()
})
```

### Testing with Props

```tsx
function Greeting({ name }: { name: string }) {
  return <p>Hello, {name}!</p>
}

test("Greeting renders name", () => {
  const container = document.createElement("div")
  mount(<Greeting name="Alice" />, container)

  expect(container.textContent).toBe("Hello, Alice!")
})
```

### Testing Reactive Props

```tsx
function Display({ value }: { value: () => number }) {
  return <span>{value()}</span>
}

test("Display updates reactively", () => {
  const container = document.createElement("div")
  const count = signal(0)
  mount(<Display value={count} />, container)

  expect(container.querySelector("span")!.textContent).toBe("0")

  count.set(42)
  expect(container.querySelector("span")!.textContent).toBe("42")
})
```

## Testing Stores

```ts
import { test, expect, afterEach } from "bun:test"
import { defineStore, resetAllStores } from "@pyreon/store"
import { signal, computed } from "@pyreon/reactivity"

afterEach(() => {
  resetAllStores()  // clean slate between tests
})

const useCounter = defineStore("counter", () => {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  const increment = () => count.update(n => n + 1)
  return { count, doubled, increment }
})

test("store is a singleton", () => {
  const a = useCounter()
  const b = useCounter()
  expect(a).toBe(b)
})

test("store actions update state", () => {
  const store = useCounter()
  expect(store.count()).toBe(0)

  store.increment()
  expect(store.count()).toBe(1)
  expect(store.doubled()).toBe(2)
})
```

## Testing the Router

```tsx
import { test, expect } from "bun:test"
import { createRouter, RouterProvider, RouterView } from "@pyreon/router"
import { h } from "@pyreon/core"
import { mount } from "@pyreon/runtime-dom"

function Home() { return <p>Home</p> }
function About() { return <p>About</p> }

test("router renders matched route", async () => {
  const router = createRouter({
    mode: "hash",
    routes: [
      { path: "/", component: Home },
      { path: "/about", component: About },
    ],
  })

  const container = document.createElement("div")
  mount(
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>,
    container,
  )

  expect(container.textContent).toContain("Home")

  await router.push("/about")
  expect(container.textContent).toContain("About")

  router.destroy()
})
```

## Testing SSR

```ts
import { test, expect } from "bun:test"
import { renderToString } from "@pyreon/runtime-server"
import { h } from "@pyreon/core"

function Greeting({ name }: { name: string }) {
  return <p>Hello, {name}!</p>
}

test("SSR renders to string", async () => {
  const html = await renderToString(<Greeting name="World" />)
  expect(html).toContain("Hello, World!")
})
```

## Testing Models

```ts
import { test, expect } from "bun:test"
import { model, getSnapshot, applySnapshot, onPatch } from "@pyreon/model"
import { computed } from "@pyreon/reactivity"

const Counter = model({
  state: { count: 0 },
  views: (self) => ({
    doubled: computed(() => self.count() * 2),
  }),
  actions: (self) => ({
    inc: () => self.count.update(c => c + 1),
  }),
})

test("model state and actions", () => {
  const counter = Counter.create()
  expect(counter.count()).toBe(0)

  counter.inc()
  expect(counter.count()).toBe(1)
  expect(counter.doubled()).toBe(2)
})

test("snapshots", () => {
  const counter = Counter.create({ count: 10 })
  expect(getSnapshot(counter)).toEqual({ count: 10 })

  applySnapshot(counter, { count: 0 })
  expect(counter.count()).toBe(0)
})

test("patch tracking", () => {
  const counter = Counter.create()
  const patches: unknown[] = []

  const unsub = onPatch(counter, p => patches.push(p))
  counter.inc()

  expect(patches).toEqual([
    { op: "replace", path: "/count", value: 1 },
  ])

  unsub()
})
```

## Tips

- **Use `afterEach(() => resetAllStores())`** in store tests to prevent state leaking between tests.
- **Call `router.destroy()`** after router tests to clean up event listeners.
- **Call `unmount()`** after mounting components to clean up effects and prevent memory leaks.
- **Use `happy-dom`** for fast DOM tests. It's significantly faster than jsdom for Pyreon's test suite.
- **Test reactive behavior by writing to signals** and checking DOM content — this tests the full reactive pipeline from signal to DOM.

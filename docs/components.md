# Components & JSX

Nova components are plain functions that return a VNode. They run exactly once. All reactivity happens through signals and effects, not through re-renders.

## JSX Setup

Add `jsxImportSource` to your TypeScript config:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core"
  }
}
```

Nova then provides `jsx`, `jsxs`, and `Fragment` from `@pyreon/core/jsx-runtime` automatically. You do not need to import `h` in every file when using JSX.

If you use the Vite plugin, this is configured automatically. See [vite-plugin.md](./vite-plugin.md).

## Component Function

```tsx
import type { ComponentFn } from "@pyreon/core"

// Minimal component
function Hello() {
  return <p>Hello, world!</p>
}

// With typed props
interface GreetProps {
  name: string
  age?: number
}

const Greet: ComponentFn<GreetProps> = ({ name, age }) => {
  return (
    <div>
      <h1>Hello, {name}!</h1>
      {age !== undefined && <p>Age: {age}</p>}
    </div>
  )
}
```

**Key rules:**

1. A component function runs once per mount. There are no re-renders.
2. Return a `VNode`, `null`, or a reactive getter `() => VNode | null`.
3. Props are plain values (or signal getters) passed at call time. Nova does not proxy them.

## defineComponent

`defineComponent` is a thin identity wrapper that adds TypeScript inference. It is optional but useful for generic components.

```tsx
import { defineComponent } from "@pyreon/core"

const Card = defineComponent(<P extends { title: string }>(props: P) => (
  <div class="card">
    <h2>{props.title}</h2>
  </div>
))
```

## VNode Structure

```ts
interface VNode {
  type: string | ComponentFn | symbol   // "div", MyComp, Fragment
  props: Props                           // includes children
  children: VNodeChild[]
  key?: string | number
}

type VNodeChild =
  | string
  | number
  | boolean
  | null
  | undefined
  | VNode
  | VNodeChild[]
  | (() => VNodeChild)   // reactive getter
```

## h() — Hyperscript

JSX compiles to `h()` calls. You can also call `h()` directly without JSX.

```ts
import { h, Fragment } from "@pyreon/core"

// Element
h("div", { class: "box" }, "Hello")

// Component
h(Counter, { initial: 0 })

// Fragment
h(Fragment, null, h("li", null, "A"), h("li", null, "B"))

// With key
h("li", { key: item.id }, item.name)
```

### h() signature

```ts
function h<P extends Props>(
  type: string | ComponentFn<P> | symbol,
  props: P | null,
  ...children: VNodeChild[]
): VNode
```

## Children Patterns

### Static children

```tsx
function Layout({ children }: { children: VNodeChild }) {
  return <div class="layout">{children}</div>
}

// Usage
<Layout>
  <p>Content here</p>
</Layout>
```

### Reactive getter as child

Wrap a signal read in an arrow function to make it reactive. Nova wraps this in an effect automatically.

```tsx
function Counter() {
  const count = signal(0)
  return (
    <div>
      {/* Reactive — only the text node updates */}
      <span>{() => count()}</span>

      {/* Also reactive — JSX expressions are already wrapped */}
      <span>{count()}</span>
    </div>
  )
}
```

Both forms are equivalent in JSX. Nova's JSX transform detects signal reads and wraps them appropriately.

### Array children

```tsx
const items = ["Alpha", "Beta", "Gamma"]

function List() {
  return (
    <ul>
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
```

For reactive lists where items are added, removed, or reordered, use the `For` component instead of `array.map`. See [lists.md](./lists.md).

### Render prop / slot pattern

```tsx
interface PanelProps {
  header: () => VNode
  children: VNodeChild
}

function Panel({ header, children }: PanelProps) {
  return (
    <div class="panel">
      <div class="panel-header">{header()}</div>
      <div class="panel-body">{children}</div>
    </div>
  )
}

// Usage
<Panel header={() => <h2>Title</h2>}>
  <p>Body content</p>
</Panel>
```

## Fragment

`Fragment` lets you return multiple root elements without a wrapping DOM node.

```tsx
import { Fragment } from "@pyreon/core"

function Row() {
  return (
    <>
      <td>Cell 1</td>
      <td>Cell 2</td>
    </>
  )
}

// Equivalent with h():
h(Fragment, null, h("td", null, "Cell 1"), h("td", null, "Cell 2"))
```

## Reactive Props

Passing a signal getter as a prop creates a fine-grained binding — only the child DOM node that reads that getter is updated, not the child component function.

```tsx
function Display({ value }: { value: () => number }) {
  return <span>{value()}</span>
}

function App() {
  const count = signal(0)
  return (
    <div>
      {/* Pass getter, not value — enables fine-grained updates */}
      <Display value={count} />
      <button onClick={() => count.update(n => n + 1)}>+</button>
    </div>
  )
}
```

## Keys

Use `key` to give Nova a stable identity for list items when the list can change order.

```tsx
{items.map(item => (
  <Card key={item.id} title={item.title} />
))}
```

Keys must be unique among siblings. They are not passed to the component as a prop.

## Gotchas

**Components run once.** You cannot conditionally call hooks or change the structure of the returned VNode based on state. Use reactive expressions inside the JSX instead.

```tsx
// Wrong — condition evaluated once at mount
function Bad({ show }: { show: boolean }) {
  if (show) {
    return <p>Visible</p>
  }
  return null
}

// Correct — reactive conditional inside JSX
function Good({ show }: { show: () => boolean }) {
  return <div>{() => show() ? <p>Visible</p> : null}</div>
}
```

**Do not spread signals as props.** Spreading an object destructures the signal into a plain value read once.

```tsx
const user = signal({ name: "Alice", age: 30 })

// Wrong — reads user() once at mount, not reactive
<Profile {...user()} />

// Correct — pass the getter, read inside Profile
<Profile user={user} />
```

**`class` not `className`.** Nova uses the HTML attribute name directly.

```tsx
// Correct
<div class="container">

// Wrong (React convention, not Nova)
<div className="container">
```

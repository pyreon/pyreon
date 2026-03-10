# Lists

Pyreon provides the `For` component for efficient keyed list rendering. Unlike `array.map` inside JSX, `For` only creates and destroys DOM nodes for items that actually change — additions and removals are O(1) per item, and reordering moves existing DOM nodes without re-creating them.

## Why Not array.map?

```tsx
// Works but recreates all DOM nodes when the signal changes
const items = signal([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }])

function Bad() {
  return (
    <ul>
      {() => items().map(item => <li key={item.id}>{item.name}</li>)}
    </ul>
  )
}
```

Every time `items` changes, the entire `items().map(...)` expression re-runs and Pyreon has to diff the result. For small lists this is fine. For long lists with frequent mutations, use `For`.

## For Component

```tsx
import { For } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"

interface Row {
  id: number
  name: string
}

const rows = signal<Row[]>([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
])

function UserList() {
  return (
    <ul>
      <For
        each={rows}
        key={r => r.id}
        children={r => <li>{r.name}</li>}
      />
    </ul>
  )
}
```

### Props

| Prop | Type | Description |
|---|---|---|
| `each` | `Signal<T[]>` or `() => T[]` | The reactive array |
| `key` | `(item: T) => string \| number` | Returns a stable, unique key per item |
| `children` | `(item: T, index: () => number) => VNodeChild` | Renders one item. `index` is a reactive getter. |
| `fallback` | `VNodeChild` | Rendered when the list is empty |

### Functional form (without JSX)

```ts
import { For, h } from "@pyreon/core"

h(For, {
  each: rows,
  key: r => r.id,
  children: r => h("li", null, r.name),
})
```

## Reactive Items

If items in the array are themselves signals or contain signals, their changes are fine-grained:

```tsx
interface TodoItem {
  id: number
  text: Signal<string>
  done: Signal<boolean>
}

const todos = signal<TodoItem[]>([])

function TodoList() {
  return (
    <ul>
      <For
        each={todos}
        key={t => t.id}
        children={t => (
          <li>
            <input
              type="checkbox"
              checked={t.done()}
              onChange={() => t.done.update(v => !v)}
            />
            <span style={() => t.done() ? "text-decoration:line-through" : ""}>
              {t.text()}
            </span>
          </li>
        )}
      />
    </ul>
  )
}
```

When `t.done` changes, only the checkbox and span for that specific item update. No other rows are touched.

## Fallback for Empty Lists

```tsx
<For
  each={items}
  key={i => i.id}
  fallback={<p>No items yet.</p>}
  children={i => <Card item={i} />}
/>
```

The `fallback` is rendered when `each` resolves to an empty array. It is removed as soon as the first item appears.

## Index as Reactive Getter

The `index` argument to `children` is `() => number` — a reactive getter. Use it when you need to display the item's position and want that to update when items are reordered.

```tsx
<For
  each={items}
  key={i => i.id}
  children={(item, index) => (
    <li>
      {() => index() + 1}. {item.name}
    </li>
  )}
/>
```

## createTemplate — Ultra-Fast Rows

For high-performance tables or grids where every row has the same structure, `createTemplate` lets you clone a pre-built DOM template instead of creating nodes from scratch.

```ts
import { createTemplate } from "@pyreon/runtime-dom"

const RowTemplate = createTemplate<{ name: string; score: number }>(props => {
  const row = document.createElement("tr")
  const nameCell = document.createElement("td")
  const scoreCell = document.createElement("td")

  effect(() => { nameCell.textContent = props.name() })
  effect(() => { scoreCell.textContent = String(props.score()) })

  row.append(nameCell, scoreCell)
  return row
})
```

Then use `RowTemplate` as a component inside `For`:

```tsx
<For
  each={tableRows}
  key={r => r.id}
  children={r => <RowTemplate name={r.name} score={r.score} />}
/>
```

`createTemplate` clones the DOM node structure on each instantiation using `cloneNode(true)`, which is significantly faster than building nodes via `createElement` calls in JavaScript. It is most beneficial for tables with hundreds of rows.

## NativeItem

`NativeItem` is a low-level escape hatch that lets you insert a pre-built `Node` directly into the Pyreon-managed DOM without any wrapping:

```ts
import { NativeItem } from "@pyreon/core"

function RawChart({ canvas }: { canvas: HTMLCanvasElement }) {
  return <NativeItem node={canvas} />
}
```

## Comparison: For vs array.map

| Scenario | array.map | For |
|---|---|---|
| Static list (never changes) | Fine | Overkill |
| List with reactive item properties | Inefficient (all items re-render) | Fine-grained per-item updates |
| Item added/removed at end | All nodes replaced | Only new node created/destroyed |
| Items reordered | All nodes replaced | DOM nodes moved in place |
| Empty fallback | Manual conditional | Built-in `fallback` prop |
| Index display | Direct index | Reactive `() => number` getter |

## Gotchas

**The `key` function must return a unique, stable value per item.** If two items return the same key, behavior is undefined. If an item's key changes between renders, Pyreon treats it as a destroy + create.

**Do not mutate the array in place.** Signals use reference equality. Calling `push` on the underlying array will not trigger `For` to update.

```ts
// Wrong — no notification
items().push({ id: 3, name: "Carol" })

// Correct
items.update(list => [...list, { id: 3, name: "Carol" }])
```

**The `children` function runs once per item per mount.** It is not called again on update. Reactivity inside the render function must come from signals or reactive getters, not from re-running the children function.

# @pyreon/virtual

Pyreon adapter for TanStack Virtual — efficient rendering of very large lists.

`@pyreon/virtual` wraps `@tanstack/virtual-core` so a Pyreon app can render 10k+ items by only drawing the slice in the viewport. `useVirtualizer` is for element-scoped scrolling (an inner scroll container); `useWindowVirtualizer` is for window-scoped scrolling and is SSR-safe. Both take **options as a function** so reactive signals (count, estimateSize, scrollElement ref) trigger automatic recalculation. The exposed reactive surface — `virtualItems`, `totalSize`, `isScrolling` — is updated in a single `batch()` so consumers don't see torn state mid-scroll.

Because Pyreon renders without a virtual DOM, rendering rows with a keyed `<For by={row => row.index}>` means a scroll **patches only the entering and leaving rows** — the rows that stay in the window do zero work. A virtual-DOM adapter (e.g. `@tanstack/react-virtual`) instead re-renders its virtualizer component and reconciles the whole visible window on every scroll. Both wrap the identical `@tanstack/virtual-core` engine, so the difference is purely the adapter. See `bench/virtual-bench.ts` (`bun run bench:react-virtual`) for the head-to-head.

## Install

```bash
bun add @pyreon/virtual @pyreon/core @pyreon/reactivity
# @tanstack/virtual-core is a hard dependency, installed automatically
```

## Quick start (element-scoped)

```tsx
import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useVirtualizer } from '@pyreon/virtual'

function VirtualList() {
  const parentRef = signal<HTMLElement | null>(null)
  const items = Array.from({ length: 10000 }, (_, i) => `Item ${i + 1}`)

  const { virtualItems, totalSize } = useVirtualizer(() => ({
    count: items.length,
    getScrollElement: () => parentRef(),
    estimateSize: () => 40,
    overscan: 5,
  }))

  return () => (
    <div ref={(el) => parentRef.set(el)} style="height: 400px; overflow-y: auto;">
      <div style={`height: ${totalSize()}px; position: relative;`}>
        {/* Keyed <For> → staying rows are reused; only entering/leaving rows touch the DOM.
            Fixed-size list: read the captured row.start directly (it's invariant per index). */}
        <For each={() => virtualItems()} by={(row) => row.index}>
          {(row) => (
            <div
              style={() =>
                `position: absolute; top: 0; width: 100%; height: ${row.size}px; transform: translateY(${row.start}px);`
              }
            >
              {items[row.index]}
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
```

## `useVirtualizer(() => options)`

Element-scoped virtualizer. Pre-fills `observeElementRect`, `observeElementOffset`, and `scrollToFn` for DOM element scrolling — override if you need custom scroll handling.

Returns `UseVirtualizerResult`:

| Property       | Type                                    | Notes                                                  |
| -------------- | --------------------------------------- | ------------------------------------------------------ |
| `instance`     | `Virtualizer<TScrollElement, TItemElement>` | Raw TanStack instance — use for `scrollToIndex`, etc. |
| `virtualItems` | `Signal<VirtualItem[]>`                 | Visible items                                          |
| `totalSize`    | `Signal<number>`                        | Total scrollable size (px)                             |
| `isScrolling`  | `Signal<boolean>`                       | Active scroll                                          |
| `item`         | `(index) => { start(); size(); lane() }` | Fine-grained per-index measurement accessors (dynamic sizing; zero-cost until used) |

```ts
const parentRef = signal<HTMLDivElement | null>(null)
const count = signal(1000)

const { virtualItems, totalSize, isScrolling, instance } = useVirtualizer(() => ({
  count: count(),
  getScrollElement: () => parentRef(),
  estimateSize: () => 35,
  overscan: 5,
}))

// Imperative scroll:
instance.scrollToIndex(500)
instance.scrollToOffset(2000)
```

## `useWindowVirtualizer(() => options)`

Window-scoped virtualizer. Pre-fills `observeElementRect: observeWindowRect`, `observeElementOffset: observeWindowOffset`, and `scrollToFn: windowScroll`. SSR-safe — checks for `window` / `document` availability before mounting observers.

```tsx
function WindowList() {
  const items = Array.from({ length: 50000 }, (_, i) => `Row ${i}`)

  const { virtualItems, totalSize } = useWindowVirtualizer(() => ({
    count: items.length,
    estimateSize: () => 40,
  }))

  return () => (
    <div style={`height: ${totalSize()}px; position: relative;`}>
      <For each={() => virtualItems()} by={(row) => row.index}>
        {(row) => (
          <div
            style={() =>
              `position: absolute; top: 0; width: 100%; height: ${row.size}px; transform: translateY(${row.start}px);`
            }
          >
            {items[row.index]}
          </div>
        )}
      </For>
    </div>
  )
}
```

## Patterns

### Dynamic item sizes via `measureElement` (use `item()`)

For variable-height items measured after render, use the fine-grained per-index
`item(index)` accessor for positioning — **not** the captured `<For>` row.

Why: with a keyed `<For by={row => row.index}>`, a row that stays in the window is
**not re-rendered** when a remeasure above it shifts its position. The captured
`row.start` is therefore a stale snapshot for dynamic lists. `item(row.index).start()`
is a signal the adapter updates in place, so a staying row re-positions correctly —
and only the rows that actually moved patch the DOM (a virtual-DOM adapter re-renders
the whole visible window). `item()` costs nothing until the first call.

```tsx
import { For } from '@pyreon/core'
import { measureElement } from '@pyreon/virtual'

const v = useVirtualizer(() => ({
  count: items.length,
  getScrollElement: () => parentRef(),
  estimateSize: () => 50,
  measureElement,
}))

// Per row — position from item(), measure via the ref:
<For each={() => v.virtualItems()} by={(row) => row.index}>
  {(row) => {
    const m = v.item(row.index) // reactive per-index start/size/lane
    return (
      <div
        data-index={row.index}
        ref={(el) => el && v.instance.measureElement(el)}
        style={() => `position: absolute; top: 0; width: 100%; transform: translateY(${m.start()}px);`}
      >
        {items[row.index]}
      </div>
    )
  }}
</For>
```

> **Fixed-size lists don't need `item()`** — `row.start = index * size` is invariant, so
> reading the captured `row.start` is correct and marginally cheaper at mount.

### Horizontal lists

```ts
const { virtualItems, totalSize } = useVirtualizer(() => ({
  count: columns.length,
  getScrollElement: () => parentRef(),
  estimateSize: () => 120,
  horizontal: true,
}))
```

### Reactive count (filtered lists)

```ts
const filteredItems = signal(allItems)

const { virtualItems } = useVirtualizer(() => ({
  count: filteredItems().length,
  getScrollElement: () => parentRef(),
  estimateSize: () => 40,
}))

// filteredItems.set(allItems.filter(…)) → automatic recalculation
```

## Re-exports from `@tanstack/virtual-core`

**Runtime**: `defaultKeyExtractor`, `defaultRangeExtractor`, `observeElementOffset`, `observeElementRect`, `observeWindowOffset`, `observeWindowRect`, `elementScroll`, `windowScroll`, `measureElement`, `Virtualizer`.

**Types**: `VirtualizerOptions`, `VirtualItem`, `Range`, `Rect`, `ScrollToOptions`.

## Gotchas

- **Render rows with a keyed `<For by={row => row.index}>`, not `.map()`** — `.map()` in a reactive child re-mounts every visible row on each scroll; a keyed `<For>` reuses staying rows so only entering/leaving rows touch the DOM.
- **Dynamic (`measureElement`) lists: position from `item(row.index).start()`, not the captured `row.start`** — a staying row isn't re-rendered when a remeasure shifts it, so the captured value goes stale. Fixed-size lists can read `row.start` directly.
- **A `styled()` scroll container needs `ref`, not `innerRef`** — a `styled()` component forwards plain `ref` to its DOM node; `innerRef` is a silent no-op there, so `getScrollElement()` returns `null` and the list renders **zero** rows (`totalSize` still looks correct). `@pyreon/elements`' `Element` is the only component that treats `innerRef` as first-class.
- **Options must be a function** `() => opts` for reactive tracking. Reading signals inside is the mechanism for live recalculation.
- **`instance` is the raw TanStack Virtualizer** — use it for imperative methods (`scrollToIndex`, `scrollToOffset`, `getVirtualItemForOffset`). The signals are the reactive subset.
- **Signals update via `batch()`** — `virtualItems`, `totalSize`, and `isScrolling` flip together; consumers don't see torn state mid-scroll frame.
- **Observers mount via `onMount`, dispose via `onUnmount`** — the component must be mounted before scroll observation starts. SSR renders see an empty `virtualItems` array until hydration.
- **`useWindowVirtualizer` is SSR-safe** — checks for `window` and `document` before mounting; non-browser environments get the safe fallback shape.

## Documentation

Full docs: [pyreon.dev/docs/virtual](https://pyreon.dev/docs/virtual) (or `docs/src/content/docs/virtual.md` in this repo).

## License

MIT

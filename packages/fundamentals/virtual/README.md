# @pyreon/virtual

Pyreon adapter for TanStack Virtual — efficient rendering of very large lists.

`@pyreon/virtual` wraps `@tanstack/virtual-core` so a Pyreon app can render 10k+ items by only drawing the slice in the viewport. `useVirtualizer` is for element-scoped scrolling (an inner scroll container); `useWindowVirtualizer` is for window-scoped scrolling and is SSR-safe. Both take **options as a function** so reactive signals (count, estimateSize, scrollElement ref) trigger automatic recalculation. The exposed reactive surface — `virtualItems`, `totalSize`, `isScrolling` — is updated in a single `batch()` so consumers don't see torn state mid-scroll.

## Install

```bash
bun add @pyreon/virtual @pyreon/core @pyreon/reactivity
# @tanstack/virtual-core is a hard dependency, installed automatically
```

## Quick start (element-scoped)

```tsx
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
        {virtualItems().map((row) => (
          <div
            style={`position: absolute; top: 0; width: 100%; height: ${row.size}px; transform: translateY(${row.start}px);`}
          >
            {items[row.index]}
          </div>
        ))}
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
      {virtualItems().map((row) => (
        <div
          style={`position: absolute; top: 0; width: 100%; height: ${row.size}px; transform: translateY(${row.start}px);`}
        >
          {items[row.index]}
        </div>
      ))}
    </div>
  )
}
```

## Patterns

### Dynamic item sizes via `measureElement`

For variable-height items that need to be measured after render:

```tsx
import { measureElement } from '@pyreon/virtual'

const { virtualItems, totalSize, instance } = useVirtualizer(() => ({
  count: items.length,
  getScrollElement: () => parentRef(),
  estimateSize: () => 50,
  measureElement,
}))

// Per row:
virtualItems().map((row) => (
  <div ref={(el) => instance.measureElement(el)} data-index={row.index}>
    {items[row.index]}
  </div>
))
```

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

- **Options must be a function** `() => opts` for reactive tracking. Reading signals inside is the mechanism for live recalculation.
- **`instance` is the raw TanStack Virtualizer** — use it for imperative methods (`scrollToIndex`, `scrollToOffset`, `getVirtualItemForOffset`). The signals are the reactive subset.
- **Signals update via `batch()`** — `virtualItems`, `totalSize`, and `isScrolling` flip together; consumers don't see torn state mid-scroll frame.
- **Observers mount via `onMount`, dispose via `onUnmount`** — the component must be mounted before scroll observation starts. SSR renders see an empty `virtualItems` array until hydration.
- **`useWindowVirtualizer` is SSR-safe** — checks for `window` and `document` before mounting; non-browser environments get the safe fallback shape.

## Documentation

Full docs: [docs.pyreon.dev/docs/virtual](https://docs.pyreon.dev/docs/virtual) (or `docs/src/content/docs/virtual.md` in this repo).

## License

MIT

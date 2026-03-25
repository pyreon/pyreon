# @pyreon/virtual

Pyreon adapter for TanStack Virtual. Efficient rendering of large lists with reactive `virtualItems`, `totalSize`, and `isScrolling` signals.

## Install

```bash
bun add @pyreon/virtual @tanstack/virtual-core
```

## Quick Start

```tsx
import { signal } from "@pyreon/reactivity"
import { useVirtualizer } from "@pyreon/virtual"

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
            key={row.key}
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

## API

### `useVirtualizer(options)`

Create a reactive virtualizer for element-based scrolling. Options are passed as a function so reactive signals can be read inside, and the virtualizer updates automatically when they change.

| Parameter | Type | Description |
| --- | --- | --- |
| `options` | `() => UseVirtualizerOptions` | Function returning virtualizer config |

Options extend `VirtualizerOptions` from `@tanstack/virtual-core` with `observeElementRect`, `observeElementOffset`, and `scrollToFn` pre-filled (overridable).

**Returns:** `UseVirtualizerResult` with:

| Property | Type | Description |
| --- | --- | --- |
| `instance` | `Virtualizer` | The underlying TanStack Virtualizer instance |
| `virtualItems` | `Signal<VirtualItem[]>` | Currently visible virtual items |
| `totalSize` | `Signal<number>` | Total scrollable size in pixels |
| `isScrolling` | `Signal<boolean>` | Whether the user is currently scrolling |

```ts
const parentRef = signal<HTMLDivElement | null>(null)
const count = signal(1000)

const { virtualItems, totalSize, isScrolling, instance } = useVirtualizer(() => ({
  count: count(),
  getScrollElement: () => parentRef(),
  estimateSize: () => 35,
  overscan: 5,
}))

// Scroll programmatically:
instance.scrollToIndex(500)
```

### `useWindowVirtualizer(options)`

Create a reactive virtualizer for window-based scrolling. The scroll element is automatically set to `window`. SSR-safe — checks for `window` and `document` availability.

| Parameter | Type | Description |
| --- | --- | --- |
| `options` | `() => UseWindowVirtualizerOptions` | Function returning config (no `getScrollElement` needed) |

**Returns:** `UseWindowVirtualizerResult` — same shape as `UseVirtualizerResult` but typed with `Window` as the scroll element.

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
          key={row.key}
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

### Dynamic Item Sizes

Use `measureElement` for variable-height items that are measured after render.

```tsx
import { measureElement } from "@pyreon/virtual"

const { virtualItems, totalSize, instance } = useVirtualizer(() => ({
  count: items.length,
  getScrollElement: () => parentRef(),
  estimateSize: () => 50,
  measureElement,
}))

// In render, set the ref on each item:
virtualItems().map((row) => (
  <div
    key={row.key}
    ref={(el) => instance.measureElement(el)}
    data-index={row.index}
  >
    {items[row.index]}
  </div>
))
```

### Horizontal Lists

Set the `horizontal` option for horizontal virtualization.

```ts
const { virtualItems, totalSize } = useVirtualizer(() => ({
  count: columns.length,
  getScrollElement: () => parentRef(),
  estimateSize: () => 120,
  horizontal: true,
}))
```

### Reactive Count

Since options are a function, changing the count signal re-calculates virtual items automatically.

```ts
const filteredItems = signal(allItems)
const { virtualItems } = useVirtualizer(() => ({
  count: filteredItems().length,
  getScrollElement: () => parentRef(),
  estimateSize: () => 40,
}))

// Updating filteredItems triggers recalculation
filteredItems.set(allItems.filter(i => i.includes(search())))
```

## Re-exports from `@tanstack/virtual-core`

**Runtime:** `defaultKeyExtractor`, `defaultRangeExtractor`, `observeElementOffset`, `observeElementRect`, `observeWindowOffset`, `observeWindowRect`, `elementScroll`, `windowScroll`, `measureElement`, `Virtualizer`

**Types:** `VirtualizerOptions`, `VirtualItem`, `Range`, `Rect`, `ScrollToOptions`

## Gotchas

- Options must be a function `() => opts` for reactive tracking. The virtualizer re-calculates when signals read inside the function change.
- The `instance` is the raw TanStack Virtualizer — use it for imperative methods like `scrollToIndex()` and `scrollToOffset()`.
- `virtualItems`, `totalSize`, and `isScrolling` are Pyreon signals updated via `batch()` for efficient reactive notifications.
- The virtualizer's DOM observers are mounted via `onMount` and cleaned up via `onUnmount`. The component must be mounted for scroll observation to work.
- `useWindowVirtualizer` checks for `window` availability and provides a safe fallback for SSR.

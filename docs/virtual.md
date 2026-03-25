# @pyreon/virtual

Pyreon adapter for [TanStack Virtual](https://tanstack.com/virtual). Reactive virtualizers for efficiently rendering large lists and grids.

## Installation

```bash
bun add @pyreon/virtual @tanstack/virtual-core
```

## Quick Start

```tsx
import { signal } from "@pyreon/reactivity"
import { useVirtualizer } from "@pyreon/virtual"

function VirtualList() {
  const parentRef = signal<HTMLDivElement | null>(null)

  const virtual = useVirtualizer(() => ({
    count: 10000,
    getScrollElement: () => parentRef(),
    estimateSize: () => 35,
  }))

  return (
    <div ref={parentRef} style="height: 400px; overflow: auto">
      <div style={`height: ${virtual.totalSize()}px; position: relative`}>
        {virtual.virtualItems().map(item => (
          <div
            key={item.key}
            style={`position: absolute; top: ${item.start}px; height: ${item.size}px; width: 100%`}
          >
            Row {item.index}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## API

### `useVirtualizer(options)`

Create a reactive virtualizer for element-based scrolling.

**Options:** A function returning `VirtualizerOptions` (minus auto-configured fields):

| Option | Type | Description |
| --- | --- | --- |
| `count` | `number` | Total number of items |
| `getScrollElement` | `() => Element \| null` | Returns the scroll container |
| `estimateSize` | `(index: number) => number` | Estimated item size in pixels |
| `overscan` | `number` | Extra items to render outside viewport |
| `horizontal` | `boolean` | Horizontal scrolling mode |
| `onChange` | `(instance, sync) => void` | Optional callback on virtualizer changes |
| ... | | All other TanStack Virtual options |

Auto-configured (can be overridden):
- `observeElementRect` — element rect observer
- `observeElementOffset` — element scroll offset observer
- `scrollToFn` — element scroll function

**Returns:**

| Property | Type | Description |
| --- | --- | --- |
| `instance` | `Virtualizer` | Raw TanStack Virtual instance |
| `virtualItems` | `Signal<VirtualItem[]>` | Currently visible items |
| `totalSize` | `Signal<number>` | Total scrollable size in pixels |
| `isScrolling` | `Signal<boolean>` | Whether user is currently scrolling |

### `useWindowVirtualizer(options)`

Create a reactive virtualizer for window-based scrolling (no scroll container needed).

```ts
const virtual = useWindowVirtualizer(() => ({
  count: 10000,
  estimateSize: () => 35,
}))
```

**Options:** Same as `useVirtualizer` but without `getScrollElement` (auto-set to `window`).

Auto-configured:
- `getScrollElement` — returns `window`
- `observeElementRect` — window rect observer
- `observeElementOffset` — window scroll offset observer
- `scrollToFn` — window scroll function
- `initialOffset` — `window.scrollY` (SSR-safe)

**Returns:** Same shape as `useVirtualizer`.

### Reactive Options

Options are passed as a function so reactive signals can be read inside:

```ts
const count = signal(1000)
const itemSize = signal(35)

const virtual = useVirtualizer(() => ({
  count: count(),
  getScrollElement: () => parentRef(),
  estimateSize: () => itemSize(),
}))

// Later: updating count or itemSize reactively recalculates
count.set(5000)
```

### Scrolling

Use the `instance` to programmatically scroll:

```ts
virtual.instance.scrollToIndex(500)
virtual.instance.scrollToOffset(1000)
```

## Re-exports

All exports from `@tanstack/virtual-core` are re-exported:

```ts
import {
  Virtualizer,
  VirtualItem,
  // ... all TanStack Virtual Core exports
} from "@pyreon/virtual"
```

## Types

| Type | Description |
| --- | --- |
| `UseVirtualizerOptions<TScrollElement, TItemElement>` | Options for element virtualizer |
| `UseVirtualizerResult<TScrollElement, TItemElement>` | Return type of `useVirtualizer` |
| `UseWindowVirtualizerOptions<TItemElement>` | Options for window virtualizer |
| `UseWindowVirtualizerResult<TItemElement>` | Return type of `useWindowVirtualizer` |

## Lifecycle

- **Mount:** Observers start watching the scroll element
- **Unmount:** Observers and effects are cleaned up automatically
- **Options change:** Virtualizer recalculates and emits updated virtual items

## Gotchas

**`virtualItems` and `totalSize` are signals.** Read them with `()` — `virtual.virtualItems()`, `virtual.totalSize()`.

**The scroll element must exist.** If `getScrollElement` returns `null` (e.g. before mount), the virtualizer waits until it's available.

**`instance` is the raw TanStack Virtual instance.** Use it for imperative operations like `scrollToIndex`. It's not wrapped in a signal.

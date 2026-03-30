---
title: Virtual
description: Reactive TanStack Virtual adapter for efficient list and grid virtualization.
---

`@pyreon/virtual` is the Pyreon adapter for [TanStack Virtual](https://tanstack.com/virtual). It provides reactive virtualizer hooks that return fine-grained signals for virtual items, total size, and scrolling state. Efficiently render thousands of items by only mounting the visible ones plus a configurable overscan buffer.

The package provides two hooks:

- **`useVirtualizer`** -- for element-based scroll containers (e.g., a `div` with `overflow: auto`)
- **`useWindowVirtualizer`** -- for window-based scrolling (the browser viewport is the scroll container)

Both hooks return reactive signals that update automatically when the user scrolls, the item count changes, or item sizes are remeasured.

<PackageBadge name="@pyreon/virtual" href="/docs/virtual" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/virtual
```

```bash [bun]
bun add @pyreon/virtual
```

```bash [pnpm]
pnpm add @pyreon/virtual
```

```bash [yarn]
yarn add @pyreon/virtual
```

:::

TanStack Virtual core is included as a dependency -- core utilities and types are re-exported from `@pyreon/virtual` for convenience, so you do not need to install `@tanstack/virtual-core` separately.

---

## Element-Based Virtualization

### useVirtualizer

Create a virtualizer for an element-based scroll container. Options are passed as a function so reactive signals can be read inside -- the virtualizer updates automatically when those signals change.

```tsx
import { defineComponent } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useVirtualizer } from '@pyreon/virtual'

const VirtualList = defineComponent(() => {
  const parentRef = signal<HTMLDivElement | null>(null)

  const virtual = useVirtualizer(() => ({
    count: 10000,
    getScrollElement: () => parentRef(),
    estimateSize: () => 35,
  }))

  return () => (
    <div ref={(el) => parentRef.set(el)} style={{ height: '400px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtual.totalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtual.virtualItems().map((item) => (
          <div
            key={item.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${item.size}px`,
              transform: `translateY(${item.start}px)`,
            }}
          >
            Row {item.index}
          </div>
        ))}
      </div>
    </div>
  )
})
```

### How It Works

1. The virtualizer observes the scroll container's rect and scroll offset using `observeElementRect` and `observeElementOffset`
2. Based on the container size, estimated item sizes, and current scroll position, it calculates which items are visible
3. It returns only the visible items (plus overscan) as `VirtualItem` objects
4. When the user scrolls, the virtualizer recalculates and updates the reactive signals
5. An `effect` tracks the reactive options function, so changes to `count`, `estimateSize`, or other options trigger an automatic recalculation

### UseVirtualizerResult

The return value from `useVirtualizer` provides:

| Property       | Type                                        | Description                                                                 |
| -------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `instance`     | `Virtualizer<TScrollElement, TItemElement>` | The underlying TanStack Virtual instance with all methods                   |
| `virtualItems` | `Signal<VirtualItem[]>`                     | Reactive list of currently visible virtual items                            |
| `totalSize`    | `Signal<number>`                            | Total scrollable size in pixels (height for vertical, width for horizontal) |
| `isScrolling`  | `Signal<boolean>`                           | Whether the user is currently scrolling                                     |

### UseVirtualizerOptions

The options function should return a `VirtualizerOptions` object. The adapter automatically provides defaults for `observeElementRect`, `observeElementOffset`, and `scrollToFn` -- you can override them if needed.

| Option                 | Type                                  | Default                 | Description                                              |
| ---------------------- | ------------------------------------- | ----------------------- | -------------------------------------------------------- |
| `count`                | `number`                              | _required_              | Total number of items                                    |
| `getScrollElement`     | `() => Element \| null`               | _required_              | Returns the scroll container element                     |
| `estimateSize`         | `(index: number) => number`           | _required_              | Estimated size of each item in pixels                    |
| `overscan`             | `number`                              | `1`                     | Number of extra items to render outside the visible area |
| `horizontal`           | `boolean`                             | `false`                 | Enable horizontal virtualization                         |
| `gap`                  | `number`                              | `0`                     | Gap between items in pixels                              |
| `paddingStart`         | `number`                              | `0`                     | Padding before the first item in pixels                  |
| `paddingEnd`           | `number`                              | `0`                     | Padding after the last item in pixels                    |
| `enabled`              | `boolean`                             | `true`                  | Enable/disable the virtualizer                           |
| `onChange`             | `(instance, sync) => void`            | --                      | Callback on virtualizer state change                     |
| `rangeExtractor`       | `(range: Range) => number[]`          | `defaultRangeExtractor` | Custom function to extract which indices to render       |
| `keyExtractor`         | `(index: number) => Key`              | `defaultKeyExtractor`   | Custom function to extract a key for each item           |
| `measureElement`       | `(el: TItemElement) => number`        | --                      | Custom measurement function for dynamic sizing           |
| `scrollMargin`         | `number`                              | `0`                     | Offset to apply to scroll position calculations          |
| `observeElementRect`   | `(instance, cb) => () => void`        | `observeElementRect`    | Custom rect observer (auto-provided)                     |
| `observeElementOffset` | `(instance, cb) => () => void`        | `observeElementOffset`  | Custom offset observer (auto-provided)                   |
| `scrollToFn`           | `(offset, options, instance) => void` | `elementScroll`         | Custom scroll function (auto-provided)                   |

### Reactive Options

Because options are passed as a function, any signals read inside are tracked. When those signals change, the virtualizer automatically recalculates:

```tsx
const count = signal(100)
const itemSize = signal(50)

const virtual = useVirtualizer(() => ({
  count: count(), // tracked
  getScrollElement: () => parentRef(),
  estimateSize: () => itemSize(), // tracked
}))

// Later: updating count re-renders the virtualizer
count.set(200)
// => virtual.totalSize() is now 10000 (200 * 50)

// Updating item size requires measure() to invalidate the cache
itemSize.set(100)
virtual.instance.measure()
// => virtual.totalSize() is now 20000 (200 * 100)
```

### The onChange Callback

You can provide an `onChange` callback to react to virtualizer state changes. The adapter wraps this callback to update its reactive signals (virtualItems, totalSize, isScrolling) and then forwards the call to your handler:

```tsx
const virtual = useVirtualizer(() => ({
  count: 1000,
  getScrollElement: () => parentRef(),
  estimateSize: () => 35,
  onChange: (instance, isSync) => {
    console.log('Visible range:', instance.range)
    console.log('Is syncing:', isSync)
  },
}))
```

### Lifecycle

The virtualizer hooks into Pyreon's component lifecycle:

- **`onMount`** -- calls `instance._didMount()` to start observing the scroll container, then performs an initial calculation
- **`onUnmount`** -- disposes the reactive effect and cleans up the mount observers

This means the virtualizer only observes the scroll container while the component is mounted. Once unmounted, all observers and effects are cleaned up automatically.

### Enabled/Disabled State

Set `enabled: false` to disable the virtualizer. When disabled, `virtualItems()` returns an empty array and `totalSize()` returns `0`:

```tsx
const isActive = signal(true)

const virtual = useVirtualizer(() => ({
  count: 1000,
  getScrollElement: () => parentRef(),
  estimateSize: () => 35,
  enabled: isActive(),
}))

// Disable the virtualizer
isActive.set(false)
// virtual.virtualItems() => []
// virtual.totalSize() => 0
```

---

## Window-Based Virtualization

### useWindowVirtualizer

Create a virtualizer that uses the browser window as the scroll container. You do not need to provide a scroll element -- the adapter automatically handles `getScrollElement`, `observeElementRect`, `observeElementOffset`, `scrollToFn`, and `initialOffset`.

```tsx
import { defineComponent } from '@pyreon/core'
import { useWindowVirtualizer } from '@pyreon/virtual'

const WindowVirtualList = defineComponent(() => {
  const virtual = useWindowVirtualizer(() => ({
    count: 10000,
    estimateSize: () => 35,
  }))

  return () => (
    <div
      style={{
        height: `${virtual.totalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtual.virtualItems().map((item) => (
        <div
          key={item.index}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${item.size}px`,
            transform: `translateY(${item.start}px)`,
          }}
        >
          Row {item.index}
        </div>
      ))}
    </div>
  )
})
```

### UseWindowVirtualizerResult

| Property       | Type                                | Description                             |
| -------------- | ----------------------------------- | --------------------------------------- |
| `instance`     | `Virtualizer<Window, TItemElement>` | The underlying virtualizer instance     |
| `virtualItems` | `Signal<VirtualItem[]>`             | Reactive list of visible virtual items  |
| `totalSize`    | `Signal<number>`                    | Total scrollable size in pixels         |
| `isScrolling`  | `Signal<boolean>`                   | Whether the user is currently scrolling |

### Window Virtualizer Defaults

The window virtualizer automatically provides:

| Option                 | Default                                  |
| ---------------------- | ---------------------------------------- |
| `getScrollElement`     | `() => window` (with SSR safety check)   |
| `observeElementRect`   | `observeWindowRect`                      |
| `observeElementOffset` | `observeWindowOffset`                    |
| `scrollToFn`           | `windowScroll`                           |
| `initialOffset`        | `window.scrollY` (with SSR safety check) |

All of these can be overridden if needed:

```tsx
const virtual = useWindowVirtualizer(() => ({
  count: 1000,
  estimateSize: () => 50,
  // Custom scroll function for smooth scrolling
  scrollToFn: (offset, options, instance) => {
    window.scrollTo({ top: offset, behavior: 'smooth' })
  },
}))
```

### When to Use Window vs. Element Virtualization

Use **`useWindowVirtualizer`** when:

- The list is the main content of the page
- You want the browser scrollbar to control scrolling
- The list takes up the full viewport height

Use **`useVirtualizer`** when:

- The list is inside a fixed-height container
- You have multiple scrollable areas on the same page
- The list is inside a modal, sidebar, or panel

---

## Variable Size Items

For items with different heights (or widths in horizontal mode), you have two approaches: known sizes and dynamic measurement.

### Known Variable Sizes

If you know the size of each item upfront, return it from `estimateSize`:

```tsx
const itemSizes = [50, 80, 35, 120, 60, 45, 90, 70, 55, 100]

const virtual = useVirtualizer(() => ({
  count: itemSizes.length,
  getScrollElement: () => parentRef(),
  estimateSize: (index) => itemSizes[index],
}))
```

### Dynamic Measurement with measureElement

For items whose size is determined by their content (and cannot be known upfront), use dynamic measurement. The virtualizer measures each element after it is rendered:

```tsx
import { useVirtualizer, measureElement } from '@pyreon/virtual'

const VirtualList = defineComponent(() => {
  const parentRef = signal<HTMLDivElement | null>(null)
  const items = signal(generateVariableHeightItems(1000))

  const virtual = useVirtualizer(() => ({
    count: items().length,
    getScrollElement: () => parentRef(),
    estimateSize: () => 50, // rough estimate, will be corrected after measurement
    measureElement, // enable dynamic measurement
  }))

  return () => (
    <div ref={(el) => parentRef.set(el)} style={{ height: '400px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtual.totalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtual.virtualItems().map((item) => (
          <div
            key={item.index}
            data-index={item.index}
            ref={(el) => virtual.instance.measureElement(el)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          >
            <div style={{ padding: '10px' }}>{items()[item.index].content}</div>
          </div>
        ))}
      </div>
    </div>
  )
})
```

Key points for dynamic measurement:

1. Pass `measureElement` in the options to enable dynamic measurement
2. Set `data-index=&#123;item.index&#125;` on each item element so the virtualizer can identify it
3. Call `virtual.instance.measureElement(el)` via a `ref` callback on each item
4. Do **not** set a fixed `height` on items -- let them size naturally based on content
5. Provide a reasonable `estimateSize` as the initial guess -- the virtualizer uses this for items that have not been measured yet

### Estimate Size Matters

The `estimateSize` function provides the initial size guess for unmeasured items. A good estimate reduces layout shifts during scrolling:

```tsx
// Bad: estimate is 50px but most items are 200px -- causes jump on first scroll
estimateSize: () => 50

// Good: estimate matches the average item height
estimateSize: () => 180

// Best: different estimates per item type
estimateSize: (index) => {
  const item = items()[index]
  return item.type === 'header' ? 60 : item.type === 'image' ? 300 : 100
}
```

---

## Horizontal Virtualization

Set `horizontal: true` to virtualize horizontally. The `totalSize` signal represents the total width, and items are positioned using `translateX`:

```tsx
const HorizontalList = defineComponent(() => {
  const parentRef = signal<HTMLDivElement | null>(null)

  const virtual = useVirtualizer(() => ({
    count: 10000,
    getScrollElement: () => parentRef(),
    estimateSize: () => 150,
    horizontal: true,
  }))

  return () => (
    <div
      ref={(el) => parentRef.set(el)}
      style={{
        width: '600px',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: `${virtual.totalSize()}px`,
          height: '200px',
          position: 'relative',
        }}
      >
        {virtual.virtualItems().map((item) => (
          <div
            key={item.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${item.size}px`,
              transform: `translateX(${item.start}px)`,
            }}
          >
            Column {item.index}
          </div>
        ))}
      </div>
    </div>
  )
})
```

Horizontal virtualization also works with `useWindowVirtualizer`:

```tsx
const virtual = useWindowVirtualizer(() => ({
  count: 10000,
  estimateSize: () => 200,
  horizontal: true,
}))
```

---

## Grid Virtualization (Rows + Columns)

To virtualize a 2D grid, use two virtualizers -- one for rows and one for columns:

```tsx
const VirtualGrid = defineComponent(() => {
  const parentRef = signal<HTMLDivElement | null>(null)

  const rowCount = 10000
  const columnCount = 50
  const rowHeight = 40
  const columnWidth = 120

  const rowVirtualizer = useVirtualizer(() => ({
    count: rowCount,
    getScrollElement: () => parentRef(),
    estimateSize: () => rowHeight,
  }))

  const columnVirtualizer = useVirtualizer(() => ({
    count: columnCount,
    getScrollElement: () => parentRef(),
    estimateSize: () => columnWidth,
    horizontal: true,
  }))

  return () => (
    <div
      ref={(el) => parentRef.set(el)}
      style={{ height: '500px', width: '800px', overflow: 'auto' }}
    >
      <div
        style={{
          height: `${rowVirtualizer.totalSize()}px`,
          width: `${columnVirtualizer.totalSize()}px`,
          position: 'relative',
        }}
      >
        {rowVirtualizer.virtualItems().map((virtualRow) => (
          <>
            {columnVirtualizer.virtualItems().map((virtualColumn) => (
              <div
                key={`${virtualRow.index}-${virtualColumn.index}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${virtualColumn.size}px`,
                  height: `${virtualRow.size}px`,
                  transform: `translateX(${virtualColumn.start}px) translateY(${virtualRow.start}px)`,
                }}
              >
                Cell {virtualRow.index},{virtualColumn.index}
              </div>
            ))}
          </>
        ))}
      </div>
    </div>
  )
})
```

### Grid Performance Notes

- Each scroll event updates both virtualizers, causing visible cells to be recalculated
- The total number of rendered cells is `visibleRows * visibleColumns`, which remains small regardless of grid dimensions
- For very large grids (millions of cells), keep the cell rendering function lightweight

---

## Gaps and Padding

### Gap Between Items

Use the `gap` option to add spacing between items without changing item sizes:

```tsx
const virtual = useVirtualizer(() => ({
  count: 100,
  getScrollElement: () => parentRef(),
  estimateSize: () => 50,
  gap: 10, // 10px between each item
}))

// Total size: 100 * 50 + 99 * 10 = 5990px
```

### Padding

Add padding before the first item and after the last item:

```tsx
const virtual = useVirtualizer(() => ({
  count: 10,
  getScrollElement: () => parentRef(),
  estimateSize: () => 50,
  paddingStart: 20,
  paddingEnd: 30,
}))

// Total size: 10 * 50 + 20 + 30 = 550px
```

Padding shifts all item positions. The first item starts at `paddingStart` pixels from the top.

---

## Scroll To

Use the virtualizer instance methods to programmatically scroll to specific items or positions.

### Scroll to Index

```ts
// Scroll to item 500 (default alignment: "auto")
virtual.instance.scrollToIndex(500)

// Scroll with specific alignment
virtual.instance.scrollToIndex(500, { align: 'start' })
virtual.instance.scrollToIndex(500, { align: 'center' })
virtual.instance.scrollToIndex(500, { align: 'end' })
virtual.instance.scrollToIndex(500, { align: 'auto' })
```

Alignment options:

| Align      | Behavior                                                   |
| ---------- | ---------------------------------------------------------- |
| `"auto"`   | Scrolls the minimum amount to make the item visible        |
| `"start"`  | Aligns the item to the start (top/left) of the container   |
| `"center"` | Centers the item in the container                          |
| `"end"`    | Aligns the item to the end (bottom/right) of the container |

### Scroll to Offset

```ts
// Scroll to a specific pixel offset
virtual.instance.scrollToOffset(1000)

// With smooth scrolling behavior
virtual.instance.scrollToOffset(1000, { behavior: 'smooth' })
```

### Practical Scroll-To Examples

**Jump to top:**

```tsx
const scrollToTop = () => virtual.instance.scrollToOffset(0)
```

**Jump to bottom:**

```tsx
const scrollToBottom = () => virtual.instance.scrollToIndex(count - 1, { align: 'end' })
```

**Search and scroll to result:**

```tsx
const searchAndScroll = (query: string) => {
  const index = items().findIndex((item) => item.name.includes(query))
  if (index >= 0) {
    virtual.instance.scrollToIndex(index, { align: 'center' })
  }
}
```

**Keyboard navigation:**

```tsx
const selectedIndex = signal(0)

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    selectedIndex.set(Math.min(selectedIndex() + 1, count - 1))
    virtual.instance.scrollToIndex(selectedIndex(), { align: 'auto' })
  } else if (e.key === 'ArrowUp') {
    selectedIndex.set(Math.max(selectedIndex() - 1, 0))
    virtual.instance.scrollToIndex(selectedIndex(), { align: 'auto' })
  }
}
```

---

## Infinite Scrolling Pattern

Detect when the user scrolls near the bottom and load more data:

```tsx
import { defineComponent } from '@pyreon/core'
import { signal, computed } from '@pyreon/reactivity'
import { useVirtualizer } from '@pyreon/virtual'

const InfiniteList = defineComponent(() => {
  const parentRef = signal<HTMLDivElement | null>(null)
  const items = signal<string[]>([])
  const isLoading = signal(false)
  const hasMore = signal(true)

  const loadMore = async () => {
    if (isLoading() || !hasMore()) return
    isLoading.set(true)

    const newItems = await fetchItems(items().length, 50)

    if (newItems.length === 0) {
      hasMore.set(false)
    } else {
      items.set([...items(), ...newItems])
    }

    isLoading.set(false)
  }

  // Load initial data
  loadMore()

  const virtual = useVirtualizer(() => ({
    count: items().length,
    getScrollElement: () => parentRef(),
    estimateSize: () => 50,
    onChange: (instance) => {
      const lastItem = instance.getVirtualItems().at(-1)
      if (lastItem && lastItem.index >= items().length - 10) {
        loadMore()
      }
    },
  }))

  return () => (
    <div ref={(el) => parentRef.set(el)} style={{ height: '500px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtual.totalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtual.virtualItems().map((item) => (
          <div
            key={item.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${item.size}px`,
              transform: `translateY(${item.start}px)`,
            }}
          >
            {items()[item.index]}
          </div>
        ))}
      </div>
      {isLoading() && <div style={{ padding: '10px', textAlign: 'center' }}>Loading...</div>}
    </div>
  )
})
```

---

## Integration with @pyreon/query

Combine virtualization with `@pyreon/query` for server-fetched data.

### Basic Query + Virtualization

```tsx
import { useQuery } from '@pyreon/query'
import { useVirtualizer } from '@pyreon/virtual'

const DataList = defineComponent(() => {
  const parentRef = signal<HTMLDivElement | null>(null)

  const query = useQuery(() => ({
    queryKey: ['large-dataset'],
    queryFn: () => fetch('/api/items').then((r) => r.json()),
  }))

  const virtual = useVirtualizer(() => ({
    count: query.data()?.length ?? 0,
    getScrollElement: () => parentRef(),
    estimateSize: () => 50,
  }))

  return () => (
    <div>
      {query.isLoading() && <p>Loading...</p>}
      {query.isError() && <p>Error: {query.error()?.message}</p>}
      {query.isSuccess() && (
        <div ref={(el) => parentRef.set(el)} style={{ height: '500px', overflow: 'auto' }}>
          <div
            style={{
              height: `${virtual.totalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtual.virtualItems().map((item) => (
              <div
                key={item.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${item.size}px`,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {query.data()[item.index].name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
```

### Infinite Query + Virtualization

```tsx
import { useInfiniteQuery } from '@pyreon/query'
import { useVirtualizer } from '@pyreon/virtual'

const InfiniteQueryList = defineComponent(() => {
  const parentRef = signal<HTMLDivElement | null>(null)

  const query = useInfiniteQuery(() => ({
    queryKey: ['infinite-items'],
    queryFn: ({ pageParam = 0 }) =>
      fetch(`/api/items?offset=${pageParam}&limit=50`).then((r) => r.json()),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 50 ? allPages.length * 50 : undefined,
  }))

  const allItems = computed(() => query.data()?.pages.flatMap((page) => page) ?? [])

  const virtual = useVirtualizer(() => ({
    count: allItems().length,
    getScrollElement: () => parentRef(),
    estimateSize: () => 50,
    onChange: (instance) => {
      const lastItem = instance.getVirtualItems().at(-1)
      if (
        lastItem &&
        lastItem.index >= allItems().length - 10 &&
        query.hasNextPage() &&
        !query.isFetchingNextPage()
      ) {
        query.fetchNextPage()
      }
    },
  }))

  return () => (
    <div ref={(el) => parentRef.set(el)} style={{ height: '500px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtual.totalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtual.virtualItems().map((item) => (
          <div
            key={item.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${item.size}px`,
              transform: `translateY(${item.start}px)`,
            }}
          >
            {allItems()[item.index].name}
          </div>
        ))}
      </div>
      {query.isFetchingNextPage() && <p style={{ textAlign: 'center' }}>Loading more...</p>}
    </div>
  )
})
```

---

## Dynamic Item Rendering

### Rendering Different Item Types

```tsx
interface ListItem {
  type: 'header' | 'item' | 'separator'
  content: string
}

const MixedList = defineComponent(() => {
  const parentRef = signal<HTMLDivElement | null>(null)
  const items = signal<ListItem[]>(generateMixedItems())

  const virtual = useVirtualizer(() => ({
    count: items().length,
    getScrollElement: () => parentRef(),
    estimateSize: (index) => {
      const item = items()[index]
      switch (item.type) {
        case 'header':
          return 60
        case 'separator':
          return 20
        case 'item':
          return 45
      }
    },
  }))

  const renderItem = (item: ListItem, virtualItem: VirtualItem) => {
    switch (item.type) {
      case 'header':
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
              fontWeight: 'bold',
              fontSize: '18px',
              padding: '15px 10px',
              backgroundColor: '#f5f5f5',
            }}
          >
            {item.content}
          </div>
        )
      case 'separator':
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
              borderBottom: '1px solid #eee',
            }}
          />
        )
      case 'item':
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
              padding: '10px',
            }}
          >
            {item.content}
          </div>
        )
    }
  }

  return () => (
    <div ref={(el) => parentRef.set(el)} style={{ height: '500px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtual.totalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtual.virtualItems().map((virtualItem) => (
          <div key={virtualItem.index}>{renderItem(items()[virtualItem.index], virtualItem)}</div>
        ))}
      </div>
    </div>
  )
})
```

### Expandable Items with Remeasurement

When items can expand/collapse, use `measureElement` to remeasure after size changes:

```tsx
const ExpandableList = defineComponent(() => {
  const parentRef = signal<HTMLDivElement | null>(null)
  const expandedItems = signal(new Set<number>())

  const virtual = useVirtualizer(() => ({
    count: 1000,
    getScrollElement: () => parentRef(),
    estimateSize: () => 50,
    measureElement: (el) => el.getBoundingClientRect().height,
  }))

  const toggleItem = (index: number) => {
    const current = new Set(expandedItems())
    if (current.has(index)) {
      current.delete(index)
    } else {
      current.add(index)
    }
    expandedItems.set(current)
  }

  return () => (
    <div ref={(el) => parentRef.set(el)} style={{ height: '500px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtual.totalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtual.virtualItems().map((item) => (
          <div
            key={item.index}
            data-index={item.index}
            ref={(el) => virtual.instance.measureElement(el)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          >
            <div
              onClick={() => toggleItem(item.index)}
              style={{ cursor: 'pointer', padding: '10px' }}
            >
              Item {item.index}
              {expandedItems().has(item.index) && (
                <div style={{ padding: '10px', color: '#666' }}>
                  Expanded content for item {item.index}. This content has variable height and will
                  be measured dynamically.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
```

---

## Performance Tips

### 1. Set a Reasonable Overscan

The default overscan is `1`, meaning one extra item is rendered above and below the visible area. For smoother scrolling, increase it to `3`--`5`:

```tsx
const virtual = useVirtualizer(() => ({
  count: 10000,
  getScrollElement: () => parentRef(),
  estimateSize: () => 50,
  overscan: 5, // render 5 extra items in each direction
}))
```

Higher overscan values mean more DOM nodes but smoother scrolling with fewer blank flashes.

### 2. Keep Item Rendering Lightweight

The virtualizer may re-render visible items frequently during scrolling. Keep each item's render function cheap:

```tsx
// Avoid: expensive computation inside the render
{
  virtual.virtualItems().map((item) => (
    <div key={item.index}>
      {expensiveComputation(data[item.index])} {/* runs on every scroll */}
    </div>
  ))
}

// Better: pre-compute data outside the render loop
const processedData = computed(() => data().map(expensiveComputation))

{
  virtual.virtualItems().map((item) => <div key={item.index}>{processedData()[item.index]}</div>)
}
```

### 3. Use Absolute Positioning with transform

Always use `position: absolute` with `transform: translateY()` (or `translateX()` for horizontal) for positioning items. This leverages GPU-accelerated compositing and avoids triggering layout recalculations:

```tsx
// Correct: GPU-accelerated positioning
style={{
  position: "absolute",
  top: 0,
  left: 0,
  transform: `translateY(${item.start}px)`,
}}

// Avoid: triggers layout recalculation
style={{
  position: "absolute",
  top: `${item.start}px`,
}}
```

### 4. Provide Accurate Size Estimates

A good `estimateSize` reduces the amount of layout shifting during initial scroll. If items have known fixed sizes, use them directly instead of measuring:

```tsx
// Best: known fixed size, no measurement needed
estimateSize: () => 48

// Good: known variable sizes
estimateSize: (index) => itemHeights[index]

// Acceptable: rough estimate + dynamic measurement
estimateSize: () => 60,
measureElement: measureElement, // correct after render
```

### 5. Avoid Unnecessary Re-renders

The reactive options function is tracked by an `effect`. Avoid reading signals that change frequently if they are not relevant to the virtualizer configuration:

```tsx
// Avoid: reading a rapidly changing signal triggers constant recalculation
const virtual = useVirtualizer(() => ({
  count: items().length,
  getScrollElement: () => parentRef(),
  estimateSize: () => 50,
  // Don't do this -- scrollPosition changes on every scroll event
  // scrollMargin: scrollPosition(),
}))
```

---

## Accessibility Considerations

### ARIA Attributes

Add appropriate ARIA attributes to make virtualized lists accessible to screen readers:

```tsx
return () => (
  <div
    ref={(el) => parentRef.set(el)}
    role="list"
    aria-label="Items list"
    aria-rowcount={items().length}
    style={{ height: '500px', overflow: 'auto' }}
  >
    <div
      style={{
        height: `${virtual.totalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtual.virtualItems().map((item) => (
        <div
          key={item.index}
          role="listitem"
          aria-rowindex={item.index + 1}
          aria-setsize={items().length}
          aria-posinset={item.index + 1}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${item.size}px`,
            transform: `translateY(${item.start}px)`,
          }}
        >
          {items()[item.index].name}
        </div>
      ))}
    </div>
  </div>
)
```

### Keyboard Navigation

Ensure keyboard users can navigate the virtualized list. Use `scrollToIndex` to keep the focused item in view:

```tsx
const focusedIndex = signal(0)

const handleKeyDown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      focusedIndex.set(Math.min(focusedIndex() + 1, count - 1))
      virtual.instance.scrollToIndex(focusedIndex(), { align: 'auto' })
      break
    case 'ArrowUp':
      e.preventDefault()
      focusedIndex.set(Math.max(focusedIndex() - 1, 0))
      virtual.instance.scrollToIndex(focusedIndex(), { align: 'auto' })
      break
    case 'Home':
      e.preventDefault()
      focusedIndex.set(0)
      virtual.instance.scrollToIndex(0)
      break
    case 'End':
      e.preventDefault()
      focusedIndex.set(count - 1)
      virtual.instance.scrollToIndex(count - 1, { align: 'end' })
      break
  }
}
```

### Focus Management

When items are added or removed, ensure focus remains on a valid item. When the focused item scrolls out of view and is unmounted, the virtualizer does not automatically manage focus -- you need to restore focus when the item comes back into view.

---

## TanStack Virtual Core Re-exports

The following are re-exported from `@tanstack/virtual-core` for convenience:

### Functions

| Export                  | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `Virtualizer`           | The core virtualizer class                                        |
| `defaultKeyExtractor`   | Default key extractor: `(index) => index`                         |
| `defaultRangeExtractor` | Default range extractor for determining which indices to render   |
| `observeElementOffset`  | Observer for element scroll offset changes                        |
| `observeElementRect`    | Observer for element bounding rect changes                        |
| `observeWindowOffset`   | Observer for window scroll offset changes                         |
| `observeWindowRect`     | Observer for window bounding rect changes                         |
| `elementScroll`         | Default element scroll function                                   |
| `windowScroll`          | Default window scroll function                                    |
| `measureElement`        | Dynamic element measurement utility using `getBoundingClientRect` |

### Types

| Type                 | Description                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `VirtualizerOptions` | Full options object for the Virtualizer class                                            |
| `VirtualItem`        | Represents a single virtual item with `index`, `key`, `start`, `end`, `size`, and `lane` |
| `Range`              | Represents a visible range with `startIndex`, `endIndex`, `overscan`, and `count`        |
| `Rect`               | Represents a rectangle with `width` and `height`                                         |
| `ScrollToOptions`    | Options for scroll-to methods: `align` and `behavior`                                    |

---

## API Reference

### useVirtualizer(options)

Create a reactive virtualizer for element-based scrolling.

- **`options`** -- `() => VirtualizerOptions<TScrollElement, TItemElement>` (minus `observeElementRect`, `observeElementOffset`, `scrollToFn` which are defaulted; these can be overridden)
- **Returns** -- `UseVirtualizerResult<TScrollElement, TItemElement>` with `instance`, `virtualItems`, `totalSize`, and `isScrolling`

### useWindowVirtualizer(options)

Create a reactive virtualizer for window-based scrolling.

- **`options`** -- `() => VirtualizerOptions<Window, TItemElement>` (minus `getScrollElement`, `observeElementRect`, `observeElementOffset`, `scrollToFn` which are defaulted for window; these can be overridden)
- **Returns** -- `UseWindowVirtualizerResult<TItemElement>` with `instance`, `virtualItems`, `totalSize`, and `isScrolling`

### VirtualItem Properties

| Property | Type               | Description                                           |
| -------- | ------------------ | ----------------------------------------------------- |
| `index`  | `number`           | The index of this item in the original list           |
| `key`    | `string \| number` | Unique key for this item (from `keyExtractor`)        |
| `start`  | `number`           | Pixel offset from the start of the scrollable area    |
| `end`    | `number`           | Pixel offset of the end of this item (`start + size`) |
| `size`   | `number`           | Size of this item in pixels (estimated or measured)   |
| `lane`   | `number`           | Lane index for multi-lane layouts                     |

### Instance Methods

| Method                             | Description                                             |
| ---------------------------------- | ------------------------------------------------------- |
| `scrollToIndex(index, options?)`   | Scroll to a specific item index                         |
| `scrollToOffset(offset, options?)` | Scroll to a specific pixel offset                       |
| `measureElement(el)`               | Measure a DOM element and update the item's cached size |
| `measure()`                        | Invalidate all size measurements and recalculate        |
| `getVirtualItems()`                | Get the current list of virtual items (non-reactive)    |
| `getTotalSize()`                   | Get the current total size (non-reactive)               |

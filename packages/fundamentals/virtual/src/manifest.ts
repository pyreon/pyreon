import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/virtual',
  title: 'TanStack Virtual Adapter',
  tagline: 'Pyreon adapter for TanStack Virtual — element-scoped and window-scoped virtualization',
  description:
    'Reactive TanStack Virtual adapter for Pyreon. Signal-driven virtualizer that returns reactive `virtualItems`, `totalSize`, and `isScrolling` signals plus a fine-grained per-index `item(index)` accessor for dynamically-measured lists. Supports element-scoped (`useVirtualizer`) and window-scoped (`useWindowVirtualizer`) variants. Because Pyreon renders without a virtual DOM, a scroll patches only the entering/leaving rows (staying rows do zero work) — where a virtual-DOM adapter re-renders its virtualizer component and reconciles the whole visible window. SSR-safe — window virtualizer checks for browser environment before attaching scroll listeners.',
  category: 'universal',
  longExample: `import { useVirtualizer, useWindowVirtualizer } from '@pyreon/virtual'
import { signal } from '@pyreon/reactivity'

// Element-scoped virtualizer — attach to a scrollable container
const items = signal(Array.from({ length: 10000 }, (_, i) => ({ id: i, label: \`Item \${i}\` })))

const MyList = () => {
  let scrollRef!: HTMLElement

  const virtualizer = useVirtualizer(() => ({
    count: items().length,             // read a signal here → reactive
    getScrollElement: () => scrollRef,
    estimateSize: () => 35,            // px per row
    overscan: 5,                       // render 5 extra items above/below viewport
  }))

  return (
    <div ref={(el) => (scrollRef = el)} style="height: 400px; overflow: auto">
      <div style={() => \`height: \${virtualizer.totalSize()}px; position: relative\`}>
        <For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
          {(item) => (
            <div
              style={() => \`position: absolute; top: \${item.start}px; height: \${item.size}px; width: 100%\`}
            >
              {items()[item.index].label}
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

// Window-scoped virtualizer — scrolls with the page
const WindowList = () => {
  const virtualizer = useWindowVirtualizer(() => ({
    count: items().length,
    estimateSize: () => 50,
  }))

  return (
    <div style={() => \`height: \${virtualizer.totalSize()}px; position: relative\`}>
      <For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
        {(item) => (
          <div style={() => \`position: absolute; top: \${item.start}px; height: \${item.size}px\`}>
            {items()[item.index].label}
          </div>
        )}
      </For>
    </div>
  )
}`,
  features: [
    'useVirtualizer — element-scoped with reactive virtualItems, totalSize, isScrolling',
    'useWindowVirtualizer — window-scoped variant with SSR-safe browser checks',
    'item(index) — fine-grained per-index start/size/lane accessors (dynamic sizing, zero-cost until used)',
    'Signal-driven count and estimateSize for reactive list lengths',
    'Fixed-size, known-variable, and dynamic (measureElement) sizing; horizontal + masonry lanes',
    'scrollToIndex / scrollToOffset for programmatic scrolling',
    'TanStack Virtual core utilities re-exported for convenience',
  ],
  api: [
    {
      name: 'useVirtualizer',
      kind: 'hook',
      signature: '(options: UseVirtualizerOptions) => UseVirtualizerResult',
      summary:
        'Create an element-scoped virtualizer. Attach to a scrollable container via `getScrollElement`. Returns reactive `virtualItems()`, `totalSize()`, and `isScrolling()` signals; a fine-grained per-index `item(index)` accessor (`start`/`size`/`lane`); plus `instance.scrollToIndex()` / `scrollToOffset()`. Options that accept functions (`count`, `estimateSize`) track signal reads reactively. Render rows with a keyed `<For by={row => row.index}>` so a scroll patches only the entering/leaving rows — staying rows do zero work.',
      example: `const virtualizer = useVirtualizer(() => ({
  count: items().length,          // signal read inside the thunk → reactive
  getScrollElement: () => scrollRef,
  estimateSize: () => 35,
  overscan: 5,
}))

// Fixed-size list: read the captured item directly (start is invariant per index).
<For each={() => virtualizer.virtualItems()} by={(row) => row.index}>
  {(row) => <div style={() => \`transform: translateY(\${row.start}px)\`}>{row.index}</div>}
</For>`,
      mistakes: [
        'Forgetting to set a fixed height on the scroll container — without overflow:auto + a height, the virtualizer has no viewport to measure',
        'Passing options as a plain object instead of a function — useVirtualizer takes a thunk `() => ({ ... })`, so signal reads inside it (e.g. `count: items().length`) are tracked and the virtualizer updates when the list changes',
        'Reading virtualItems() outside a reactive scope — captures the initial window only, never updates on scroll',
        'Using .map() instead of <For> on virtualItems — .map() re-mounts EVERY visible row on every scroll (no keyed reconciliation); a keyed <For by={row => row.index}> reuses staying rows so only entering/leaving rows touch the DOM',
        'Reading a captured `<For>` item.start for DYNAMICALLY-measured lists (measureElement) — a staying row is NOT re-rendered when a remeasure above it shifts its position, so it goes stale. Use item(row.index).start() (a per-index signal) instead — required for dynamic sizing, still fine-grained',
        'Passing a `styled()` scroll container `innerRef` instead of `ref` — a styled component forwards plain `ref` to its DOM node; innerRef is a silent no-op there, so getScrollElement returns null and the list renders ZERO rows',
      ],
      seeAlso: ['useWindowVirtualizer'],
    },
    {
      name: 'useWindowVirtualizer',
      kind: 'hook',
      signature: '(options: UseWindowVirtualizerOptions) => UseWindowVirtualizerResult',
      summary:
        'Create a window-scoped virtualizer that uses the browser window as the scroll container. SSR-safe — checks for browser environment before attaching scroll listeners. Same return shape as `useVirtualizer` (virtualItems, totalSize, isScrolling, scrollToIndex). Use for long page-level lists where the entire page scrolls.',
      example: `const virtualizer = useWindowVirtualizer(() => ({
  count: items().length,
  estimateSize: () => 50,
}))

<div style={() => \`height: \${virtualizer.totalSize()}px; position: relative\`}>
  <For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
    {(item) => <div style={() => \`position: absolute; top: \${item.start}px\`}>Row {item.index}</div>}
  </For>
</div>`,
      mistakes: [
        'Using useWindowVirtualizer inside a scrollable container that is not the window — use useVirtualizer with getScrollElement instead',
        'Forgetting to position items absolutely inside a relative container with the total height — items overlap or collapse',
      ],
      seeAlso: ['useVirtualizer'],
    },
  ],
  gotchas: [
    'Both hooks return reactive signals (`virtualItems()`, `totalSize()`, `isScrolling()`). Always read them inside reactive scopes (JSX thunks, effect, computed) so they update on scroll.',
    {
      label: 'Fixed vs dynamic sizing',
      note: 'For FIXED-size lists, read the captured `<For>` item directly (`row.start`) — a row\'s `start = index * size` is invariant, so a keyed `<For by={row => row.index}>` reuses it with zero per-scroll work. For DYNAMICALLY-measured lists (`measureElement`), a remeasure above a row shifts its position but the row is NOT re-rendered (same key) — the captured `row.start` goes STALE. Read the reactive per-index `item(row.index).start()` / `.size()` instead: they are signals the adapter updates in place, so a staying row re-positions correctly and only the genuinely-shifted rows patch the DOM. `item()` is zero-cost until first used.',
    },
    {
      label: 'Absolute positioning',
      note: 'Virtual items must be positioned absolutely inside a container whose height equals `totalSize()`. Each item\'s `start` property gives its pixel offset from the top.',
    },
    {
      label: 'Re-exports',
      note: 'TanStack Virtual core types and utilities (VirtualItem, Virtualizer, measureElement, etc.) are re-exported from `@pyreon/virtual` for single-import convenience.',
    },
  ],
})

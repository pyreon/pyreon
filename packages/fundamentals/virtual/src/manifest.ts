import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/virtual',
  title: 'TanStack Virtual Adapter',
  tagline: 'Pyreon adapter for TanStack Virtual — element-scoped and window-scoped virtualization',
  description:
    'Reactive TanStack Virtual adapter for Pyreon. Signal-driven virtualizer that returns reactive `virtualItems`, `totalSize`, and `isScrolling` signals. Supports element-scoped (`useVirtualizer`) and window-scoped (`useWindowVirtualizer`) variants. SSR-safe — window virtualizer checks for browser environment before attaching scroll listeners.',
  category: 'universal',
  longExample: `import { useVirtualizer, useWindowVirtualizer } from '@pyreon/virtual'
import { signal } from '@pyreon/reactivity'

// Element-scoped virtualizer — attach to a scrollable container
const items = signal(Array.from({ length: 10000 }, (_, i) => ({ id: i, label: \`Item \${i}\` })))

const MyList = () => {
  let scrollRef!: HTMLDivElement

  const virtualizer = useVirtualizer({
    count: () => items().length,
    getScrollElement: () => scrollRef,
    estimateSize: () => 35,            // px per row
    overscan: 5,                       // render 5 extra items above/below viewport
  })

  return (
    <div ref={(el) => (scrollRef = el)} style="height: 400px; overflow: auto">
      <div style={() => \`height: \${virtualizer.totalSize()}px; position: relative\`}>
        <For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
          {(item) => (
            <div
              style={() => \`position: absolute; top: \${item.start}px; height: \${item.size}px; width: 100%\`}
            >
              {() => items()[item.index].label}
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

// Window-scoped virtualizer — scrolls with the page
const WindowList = () => {
  const virtualizer = useWindowVirtualizer({
    count: () => items().length,
    estimateSize: () => 50,
  })

  return (
    <div style={() => \`height: \${virtualizer.totalSize()}px; position: relative\`}>
      <For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
        {(item) => (
          <div style={() => \`position: absolute; top: \${item.start}px; height: \${item.size}px\`}>
            {() => items()[item.index].label}
          </div>
        )}
      </For>
    </div>
  )
}`,
  features: [
    'useVirtualizer — element-scoped with reactive virtualItems, totalSize, isScrolling',
    'useWindowVirtualizer — window-scoped variant with SSR-safe browser checks',
    'Signal-driven count and estimateSize for reactive list lengths',
    'scrollToIndex / scrollToOffset for programmatic scrolling',
    'TanStack Virtual core utilities re-exported for convenience',
  ],
  api: [
    {
      name: 'useVirtualizer',
      kind: 'hook',
      signature: '(options: UseVirtualizerOptions) => UseVirtualizerResult',
      summary:
        'Create an element-scoped virtualizer. Attach to a scrollable container via `getScrollElement`. Returns reactive `virtualItems()`, `totalSize()`, and `isScrolling()` signals plus `scrollToIndex()` and `scrollToOffset()` for programmatic control. Options that accept functions (`count`, `estimateSize`) track signal reads reactively.',
      example: `const virtualizer = useVirtualizer({
  count: () => items().length,
  getScrollElement: () => scrollRef,
  estimateSize: () => 35,
  overscan: 5,
})

// virtualItems() is reactive — re-evaluates as user scrolls
<For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
  {(item) => <div style={() => \`top: \${item.start}px\`}>{item.index}</div>}
</For>`,
      mistakes: [
        'Forgetting to set a fixed height on the scroll container — without overflow:auto + a height, the virtualizer has no viewport to measure',
        'Passing count as a plain number instead of a function when the list length is dynamic — the virtualizer won\'t update when items change',
        'Reading virtualItems() outside a reactive scope — captures the initial window only, never updates on scroll',
        'Using .map() instead of <For> on virtualItems — loses keyed reconciliation',
      ],
      seeAlso: ['useWindowVirtualizer'],
    },
    {
      name: 'useWindowVirtualizer',
      kind: 'hook',
      signature: '(options: UseWindowVirtualizerOptions) => UseWindowVirtualizerResult',
      summary:
        'Create a window-scoped virtualizer that uses the browser window as the scroll container. SSR-safe — checks for browser environment before attaching scroll listeners. Same return shape as `useVirtualizer` (virtualItems, totalSize, isScrolling, scrollToIndex). Use for long page-level lists where the entire page scrolls.',
      example: `const virtualizer = useWindowVirtualizer({
  count: () => items().length,
  estimateSize: () => 50,
})

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
      label: 'Absolute positioning',
      note: 'Virtual items must be positioned absolutely inside a container whose height equals `totalSize()`. Each item\'s `start` property gives its pixel offset from the top.',
    },
    {
      label: 'Re-exports',
      note: 'TanStack Virtual core types and utilities (VirtualItem, Virtualizer, measureElement, etc.) are re-exported from `@pyreon/virtual` for single-import convenience.',
    },
  ],
})

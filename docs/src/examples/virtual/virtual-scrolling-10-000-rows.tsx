import { signal, type Signal } from '@pyreon/reactivity'
import { useVirtualizer } from '@pyreon/virtual'

/**
 * The live counterpart to the "Element-Based Virtualization" snippet on
 * the Virtual docs page — a REAL `@pyreon/virtual` list, not a hand-rolled
 * scroll-offset calculation.
 *
 * Renders 10,000 rows but only mounts the visible window (+ overscan):
 * `virtualItems()` returns just the rows in view, `totalSize()` spans the
 * full 10,000-row height so the scrollbar is accurate. Scroll and watch
 * the rendered count stay tiny while the list scrolls smoothly.
 *
 * The `shared` prop is part of the `<Example>` contract; this example has
 * no cross-mount signal to bridge, so it's accepted and ignored.
 */
export default function VirtualScrolling10000Rows(_props: {
  shared?: Signal<unknown>
}) {
  const items = Array.from({ length: 10000 }, (_, i) => `Item ${i + 1}`)
  const parentRef = signal<HTMLElement | null>(null)

  const virtual = useVirtualizer<HTMLElement, HTMLElement>(() => ({
    count: items.length,
    getScrollElement: () => parentRef(),
    estimateSize: () => 32,
    overscan: 8,
  }))

  return (
    <div>
      <p style="font-size: 13px; color: var(--muted, #666); margin: 0 0 8px;">
        Rendered {() => virtual.virtualItems().length} of{' '}
        {items.length.toLocaleString()} rows — only the visible window is in
        the DOM.
      </p>
      <div
        ref={(el: HTMLElement | null) => parentRef.set(el)}
        style="height: 240px; overflow: auto; border: 1px solid var(--border, #ddd); border-radius: 8px;"
      >
        <div style={() => `height: ${virtual.totalSize()}px; width: 100%; position: relative;`}>
          {() =>
            virtual.virtualItems().map((row) => (
              <div
                key={String(row.key)}
                style={`position: absolute; top: 0; left: 0; width: 100%; height: ${row.size}px; transform: translateY(${row.start}px); display: flex; align-items: center; padding: 0 12px; border-bottom: 1px solid var(--border, #f0f0f0); font-size: 14px; box-sizing: border-box;`}
              >
                {items[row.index]}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

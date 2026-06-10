import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Virtual Scrolling (10,000 rows).
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function VirtualScrolling10000Rows() {
  const items = Array.from({ length: 10000 }, (_, i) => 'Item ' + (i + 1))
  const scrollTop = signal(0)
  const containerH = 200
  const rowH = 28

  const startIdx = computed(() => Math.floor(scrollTop() / rowH))
  const endIdx = computed(() => Math.min(startIdx() + Math.ceil(containerH / rowH) + 1, items.length))
  const offsetY = computed(() => startIdx() * rowH)

  return h('div', {
    style: { height: containerH + 'px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px' },
    onScroll: (e: any) => scrollTop.set(e.target.scrollTop),
  },
    h('div', { style: { height: (items.length * rowH) + 'px', position: 'relative' } },
      h('div', { style: () => ({ position: 'absolute', top: offsetY() + 'px', width: '100%' }) },
        () => items.slice(startIdx(), endIdx()).map((item, _i) =>
          h('div', { style: { height: rowH + 'px', padding: '4px 8px', borderBottom: '1px solid #f0f0f0' } }, item)
        )
      )
    )
  )
}

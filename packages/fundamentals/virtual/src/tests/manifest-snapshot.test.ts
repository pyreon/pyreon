import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — virtual snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/virtual — Pyreon adapter for TanStack Virtual — element-scoped and window-scoped virtualization. Both hooks return reactive signals (\`virtualItems()\`, \`totalSize()\`, \`isScrolling()\`). Always read them inside reactive scopes (JSX thunks, effect, computed) so they update on scroll."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/virtual — TanStack Virtual Adapter

      Reactive TanStack Virtual adapter for Pyreon. Signal-driven virtualizer that returns reactive \`virtualItems\`, \`totalSize\`, and \`isScrolling\` signals plus a fine-grained per-index \`item(index)\` accessor for dynamically-measured lists. Supports element-scoped (\`useVirtualizer\`) and window-scoped (\`useWindowVirtualizer\`) variants. Because Pyreon renders without a virtual DOM, a scroll patches only the entering/leaving rows (staying rows do zero work) — where a virtual-DOM adapter re-renders its virtualizer component and reconciles the whole visible window. SSR-safe — window virtualizer checks for browser environment before attaching scroll listeners.

      \`\`\`typescript
      import { useVirtualizer, useWindowVirtualizer } from '@pyreon/virtual'
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
      }
      \`\`\`

      > **Note**: Both hooks return reactive signals (\`virtualItems()\`, \`totalSize()\`, \`isScrolling()\`). Always read them inside reactive scopes (JSX thunks, effect, computed) so they update on scroll.
      >
      > **Fixed vs dynamic sizing**: For FIXED-size lists, read the captured \`<For>\` item directly (\`row.start\`) — a row's \`start = index * size\` is invariant, so a keyed \`<For by={row => row.index}>\` reuses it with zero per-scroll work. For DYNAMICALLY-measured lists (\`measureElement\`), a remeasure above a row shifts its position but the row is NOT re-rendered (same key) — the captured \`row.start\` goes STALE. Read the reactive per-index \`item(row.index).start()\` / \`.size()\` instead: they are signals the adapter updates in place, so a staying row re-positions correctly and only the genuinely-shifted rows patch the DOM. \`item()\` is zero-cost until first used.
      >
      > **Absolute positioning**: Virtual items must be positioned absolutely inside a container whose height equals \`totalSize()\`. Each item's \`start\` property gives its pixel offset from the top.
      >
      > **Re-exports**: TanStack Virtual core types and utilities (VirtualItem, Virtualizer, measureElement, etc.) are re-exported from \`@pyreon/virtual\` for single-import convenience.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(2)
  })
})
